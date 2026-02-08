// Margin transaction builders for DeepBook V3
// Operations are exported as curried (tx: Transaction) => void functions
// so they can be composed into a single transaction with Pyth price updates.

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { DeepBookClient } from '@mysten/deepbook-v3';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getPool } from './pools';
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from './config';
import { MARGIN_POOL_KEYS } from './margin-config';

export interface ManagerState {
  baseAsset: number;
  quoteAsset: number;
  baseDebt: number;
  quoteDebt: number;
}

/**
 * Query the margin manager's full state (assets + debts) via devInspectTransactionBlock.
 * Returns null if the query fails (manager not found, etc.).
 */
export async function queryManagerState(
  client: SuiJsonRpcClient,
  dbClient: DeepBookClient,
  managerId: string,
  poolKey: string,
): Promise<ManagerState | null> {
  const pool = getPool(poolKey);
  if (!pool) return null;

  try {
    const tx = new Transaction();
    tx.setSenderIfNotSet(DUMMY_SENDER);

    const { prependPythPriceUpdate } = await import('./pyth-refresh');
    await prependPythPriceUpdate(tx, poolKey);

    dbClient.marginManager.managerState(poolKey, managerId)(tx);

    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: DUMMY_SENDER,
    });

    if (!result.results || result.results.length === 0) return null;

    const returnValues = result.results[result.results.length - 1]?.returnValues;
    if (!returnValues || returnValues.length < 7) return null;

    // [0] manager_id, [1] pool_id, [2] risk_ratio,
    // [3] base_asset, [4] quote_asset, [5] base_debt, [6] quote_debt
    const parseU64 = (rv: [number[], string]): number => {
      if (!rv || rv[1] !== 'u64') return 0;
      return Number(bcs.u64().parse(new Uint8Array(rv[0])));
    };

    const baseScalar = Math.pow(10, pool.baseDecimals);
    const quoteScalar = Math.pow(10, pool.quoteDecimals);

    return {
      baseAsset: parseU64(returnValues[3] as [number[], string]) / baseScalar,
      quoteAsset: parseU64(returnValues[4] as [number[], string]) / quoteScalar,
      baseDebt: parseU64(returnValues[5] as [number[], string]) / baseScalar,
      quoteDebt: parseU64(returnValues[6] as [number[], string]) / quoteScalar,
    };
  } catch (err) {
    console.warn('Failed to query manager state:', err);
    return null;
  }
}

/**
 * Scan ALL margin pools to find which pool (if any) has outstanding debt
 * for the given manager. This is needed because error 4 (ECannotHaveLoanInMoreThanOneMarginPool)
 * fires when a manager tries to borrow from a different pool than the one holding its debt.
 *
 * Returns the pool key and state of the pool with debt, or null if no debt found.
 * Skips `excludePoolKey` if its state is already known by the caller.
 */
export async function findStaleDebtPool(
  client: SuiJsonRpcClient,
  dbClient: DeepBookClient,
  managerId: string,
  excludePoolKey?: string,
): Promise<{ poolKey: string; state: ManagerState; lotSize: number } | null> {
  for (const poolKey of MARGIN_POOL_KEYS) {
    if (poolKey === excludePoolKey) continue;
    const state = await queryManagerState(client, dbClient, managerId, poolKey);
    if (state && (state.baseDebt > 0 || state.quoteDebt > 0)) {
      const bookParams = await queryPoolBookParams(client, poolKey);
      return { poolKey, state, lotSize: bookParams.lotSize };
    }
  }
  return null;
}

/**
 * Query the user's wallet balance for a specific coin type.
 * Returns the balance in human-readable units.
 */
export async function queryTokenBalance(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
  decimals: number,
): Promise<number> {
  try {
    const balance = await client.getBalance({ owner, coinType });
    return Number(balance.totalBalance) / Math.pow(10, decimals);
  } catch {
    return 0;
  }
}

/**
 * Build operations to fully unwind a stale position and clear all debt.
 *
 * Logic:
 * - quoteDebt > 0 && baseAsset > 0 → was a long: sell all base, then repayQuote
 * - baseDebt > 0 → was a short: hybrid approach —
 *     1. Deposit base from wallet (capped to what user has, leave 5% for gas)
 *     2. Market buy to sweep remaining order book liquidity
 *     3. RepayBase with combined funds
 * - Always withdraw settled amounts at the end
 *
 * The hybrid approach handles thin-liquidity pools (common on testnet) by
 * combining wallet deposit + order book sweep for maximum coverage.
 */
export function buildUnwindStalePositionOps(
  dbClient: DeepBookClient,
  poolKey: string,
  managerKey: string,
  posState: ManagerState,
  lotSize: number,
  walletBaseBalance = 0,
): (tx: Transaction) => void {
  return (tx: Transaction) => {
    // Determine position direction from debt
    const isLong = posState.quoteDebt > 0;

    if (isLong && posState.baseAsset > 0) {
      // Long position: sell all base to convert back to quote for repayment.
      const sellQty = alignToLotSize(posState.baseAsset, lotSize);
      if (sellQty > 0) {
        dbClient.poolProxy.placeMarketOrder({
          poolKey,
          marginManagerKey: managerKey,
          clientOrderId: nextClientOrderId(),
          isBid: false, // sell base
          quantity: sellQty,
          payWithDeep: true,
        })(tx);
      }
    } else if (!isLong && posState.baseDebt > 0) {
      // Short position: need to return borrowed base.
      // Hybrid strategy: deposit from wallet + market buy from order book.
      const debtWithBuffer = posState.baseDebt * 1.02;

      // Step 1: Deposit available base from wallet (leave 5% for gas on SUI-type coins)
      const safeWalletBalance = walletBaseBalance * 0.95;
      const depositAmount = Math.min(safeWalletBalance, debtWithBuffer);
      if (depositAmount > 0) {
        dbClient.marginManager.depositBase({
          managerKey,
          amount: depositAmount,
        })(tx);
      }

      // Step 2: If wallet deposit doesn't cover full debt, also market buy
      // to sweep whatever order book liquidity exists
      const remainingDebt = debtWithBuffer - depositAmount;
      if (remainingDebt > 0 && posState.quoteAsset > 0) {
        const buyQty = lotSize > 0
          ? Math.ceil(remainingDebt / lotSize) * lotSize
          : remainingDebt;
        if (buyQty > 0) {
          dbClient.poolProxy.placeMarketOrder({
            poolKey,
            marginManagerKey: managerKey,
            clientOrderId: nextClientOrderId(),
            isBid: true, // buy base
            quantity: buyQty,
            payWithDeep: true,
          })(tx);
        }
      }
    }

    // Repay all outstanding debt
    if (posState.quoteDebt > 0) {
      dbClient.marginManager.repayQuote(managerKey)(tx);
    }
    if (posState.baseDebt > 0) {
      dbClient.marginManager.repayBase(managerKey)(tx);
    }

    // Withdraw everything back to wallet
    dbClient.poolProxy.withdrawSettledAmounts(managerKey)(tx);
  };
}

// Whitelisted pools (0 taker/maker fees) — no DEEP token needed for fees
// All other pools charge fees; with payWithDeep:true they require DEEP
// in the balance manager, which users typically don't have.
const ZERO_FEE_POOLS = new Set(['DEEP_SUI', 'DEEP_DBUSDC']);

interface OpenPositionOpsParams {
  poolKey: string;
  managerKey: string;
  collateral: number; // human-readable quote amount
  leverage: number;
  currentPrice: number; // current base/quote price for quantity conversion
  lotSize: number; // human-readable lot size for the pool's base coin
}

interface ClosePositionOpsParams {
  poolKey: string;
  managerKey: string;
  quantity: number; // base quantity to close (already lot-aligned from open)
  isLong: boolean;
}

interface LimitOrderOpsParams {
  poolKey: string;
  managerKey: string;
  targetPrice: number;
  direction: 'long' | 'short';
  collateral: number;
  leverage: number;
  lotSize: number;
}

interface CancelOrderOpsParams {
  poolKey: string;
  managerKey: string;
  orderId: string;
}

/**
 * Query the actual mid-price from the pool's L2 orderbook via devInspect.
 * Used to get the real trading price (critical on testnet where prices
 * differ from mainnet display prices).
 */
const midPriceCache = new Map<string, { price: number; ts: number }>();

export async function queryPoolMidPrice(
  client: SuiJsonRpcClient,
  poolKey: string,
): Promise<number> {
  // Cache for 5 seconds to avoid spamming RPC
  const cached = midPriceCache.get(poolKey);
  if (cached && Date.now() - cached.ts < 5000) return cached.price;

  const pool = getPool(poolKey);
  if (!pool) throw new Error(`Unknown pool: ${poolKey}`);

  const { Transaction: TxClass } = await import('@mysten/sui/transactions');
  const tx = new TxClass();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::mid_price`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [
      tx.object(pool.address),
      tx.object('0x6'),
    ],
  });

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DUMMY_SENDER,
  });

  const rv = result.results?.[0]?.returnValues;
  if (!rv || rv.length < 1) throw new Error(`Failed to query mid price for ${poolKey}`);

  const priceRaw = Number(bcs.u64().parse(new Uint8Array(rv[0][0])));
  const priceScale = Math.pow(10, pool.baseDecimals - pool.quoteDecimals);
  const price = (priceRaw / 1e9) * priceScale;

  if (price > 0) {
    midPriceCache.set(poolKey, { price, ts: Date.now() });
  }

  return price;
}

let orderCounter = 0;
function nextClientOrderId(): string {
  // Must be a numeric string — SDK serializes as u64 BigInt
  return `${Date.now()}${++orderCounter}`;
}

// Minimum quantity thresholds to avoid MoveAbort in validate_inputs
const MIN_QUOTE_QUANTITY = 0.01; // minimum quote amount for market orders
const MIN_BASE_QUANTITY = 0.000001; // minimum base amount for market orders

// Safety factor for market orders to account for taker fees + slippage.
// On-chain placeMarketOrder calls withdraw_with_proof which aborts with
// EBalanceManagerBalanceTooLow (code 3) if the order cost exceeds deposited
// + borrowed quote. A 3% buffer prevents this for non-whitelisted pools.
const MARKET_ORDER_SAFETY_FACTOR = 0.97;

/**
 * Align a base quantity to the pool's lot_size.
 * The on-chain contract requires: (quantity_raw % lot_size_raw) == 0.
 * Since the SDK does `Math.round(quantity * baseCoin.scalar)`, we need to
 * ensure the human-readable quantity is a clean multiple of lotSize.
 */
function alignToLotSize(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return quantity;
  return Math.floor(quantity / lotSize) * lotSize;
}

/**
 * Query the on-chain pool book params (tick_size, lot_size, min_size)
 * using devInspectTransactionBlock. Returns values in human-readable units.
 */
const lotSizeCache = new Map<string, { lotSize: number; minSize: number; tickSize: number }>();

export async function queryPoolBookParams(
  client: SuiJsonRpcClient,
  poolKey: string,
): Promise<{ lotSize: number; minSize: number; tickSize: number }> {
  const cached = lotSizeCache.get(poolKey);
  if (cached) return cached;

  const pool = getPool(poolKey);
  if (!pool) throw new Error(`Unknown pool: ${poolKey}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::pool_book_params`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [tx.object(pool.address)],
  });

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DUMMY_SENDER,
  });

  if (!result.results || result.results.length < 1 || !result.results[0]?.returnValues) {
    throw new Error(`Failed to query pool book params for ${poolKey}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseU64 = (raw: any): number => {
    if (!raw) return 0;
    const bytes = new Uint8Array(raw[0]);
    const value = bcs.u64().parse(bytes);
    return Number(value);
  };

  const tickSizeRaw = parseU64(result.results[0].returnValues[0]);
  const lotSizeRaw = parseU64(result.results[0].returnValues[1]);
  const minSizeRaw = parseU64(result.results[0].returnValues[2]);

  const baseScalar = Math.pow(10, pool.baseDecimals);
  const quoteScalar = Math.pow(10, pool.quoteDecimals);

  // tick_size is in quote/base price units with FLOAT_SCALAR (1e9)
  // lot_size and min_size are in base raw units
  const params = {
    tickSize: (Number(tickSizeRaw) * baseScalar) / quoteScalar / 1e9,
    lotSize: Number(lotSizeRaw) / baseScalar,
    minSize: Number(minSizeRaw) / baseScalar,
  };

  lotSizeCache.set(poolKey, params);
  return params;
}

/**
 * Build leveraged long position operations (curried).
 * Flow: deposit quote collateral → borrow additional quote → market buy base
 *
 * IMPORTANT: placeMarketOrder `quantity` is always in BASE units (the SDK
 * multiplies by baseCoin.scalar). We must convert our quote buying-power
 * into an equivalent base quantity using the current price, then align
 * to the pool's lot_size so the on-chain validate_inputs doesn't abort.
 */
export function buildOpenLongOps(
  dbClient: DeepBookClient,
  params: OpenPositionOpsParams,
): { ops: (tx: Transaction) => void; baseQuantity: number } {
  if (!params.currentPrice || params.currentPrice <= 0) {
    throw new Error('Cannot open long position: invalid current price');
  }

  const totalQuote = params.collateral * params.leverage;
  const borrowAmount = params.collateral * (params.leverage - 1);

  if (totalQuote < MIN_QUOTE_QUANTITY) {
    throw new Error(`Order quantity too small: ${totalQuote}. Minimum is ${MIN_QUOTE_QUANTITY}.`);
  }

  // Convert quote buying-power to base quantity, then align to lot_size.
  // Apply safety factor to leave headroom for taker fees + slippage —
  // without this, withdraw_with_proof aborts with EBalanceManagerBalanceTooLow.
  const rawBaseQuantity = (totalQuote / params.currentPrice) * MARKET_ORDER_SAFETY_FACTOR;
  const baseQuantity = alignToLotSize(rawBaseQuantity, params.lotSize);

  if (baseQuantity < MIN_BASE_QUANTITY) {
    throw new Error(`Order base quantity too small: ${baseQuantity}. Increase collateral or leverage.`);
  }

  const ops = (tx: Transaction) => {
    // 1. Deposit collateral (quote)
    dbClient.marginManager.depositQuote({
      managerKey: params.managerKey,
      amount: params.collateral,
    })(tx);

    // 2. Borrow additional quote
    if (borrowAmount > 0) {
      dbClient.marginManager.borrowQuote(params.managerKey, borrowAmount)(tx);
    }

    // 3. Market buy (bid) — quantity in BASE units, lot_size-aligned
    dbClient.poolProxy.placeMarketOrder({
      poolKey: params.poolKey,
      marginManagerKey: params.managerKey,
      clientOrderId: nextClientOrderId(),
      isBid: true,
      quantity: baseQuantity,
      payWithDeep: ZERO_FEE_POOLS.has(params.poolKey),
    })(tx);
  };

  return { ops, baseQuantity };
}

/**
 * Build leveraged short position operations (curried).
 * Flow: deposit quote collateral → borrow base → market sell base
 */
export function buildOpenShortOps(
  dbClient: DeepBookClient,
  params: OpenPositionOpsParams,
): { ops: (tx: Transaction) => void; baseQuantity: number } {
  if (!params.currentPrice || params.currentPrice <= 0) {
    throw new Error('Cannot open short position: invalid current price');
  }

  const borrowValue = params.collateral * (params.leverage - 1);
  // Convert quote to base, then align to lot_size.
  // Apply safety factor for fees + slippage (same as long).
  const rawBorrowBase = (borrowValue / params.currentPrice) * MARKET_ORDER_SAFETY_FACTOR;
  const borrowBase = alignToLotSize(rawBorrowBase, params.lotSize);

  if (borrowBase < MIN_BASE_QUANTITY) {
    throw new Error(`Order quantity too small: ${borrowBase} base. Increase collateral or leverage.`);
  }

  const ops = (tx: Transaction) => {
    // 1. Deposit collateral (quote)
    dbClient.marginManager.depositQuote({
      managerKey: params.managerKey,
      amount: params.collateral,
    })(tx);

    // 2. Borrow base
    if (borrowBase > 0) {
      dbClient.marginManager.borrowBase(params.managerKey, borrowBase)(tx);
    }

    // 3. Market sell (ask) — quantity in BASE units, lot_size-aligned
    dbClient.poolProxy.placeMarketOrder({
      poolKey: params.poolKey,
      marginManagerKey: params.managerKey,
      clientOrderId: nextClientOrderId(),
      isBid: false,
      quantity: borrowBase,
      payWithDeep: ZERO_FEE_POOLS.has(params.poolKey),
    })(tx);
  };

  return { ops, baseQuantity: borrowBase };
}

/**
 * Build close position operations (curried).
 * Flow: market order (reverse direction) → repay debt → withdraw settled amounts
 *
 * Uses a regular placeMarketOrder instead of placeReduceOnlyMarketOrder.
 * The reduce-only variant aborts with ENotReduceOnlyOrder (code 3) when the
 * quote output from selling all base exceeds the net quote debt — which is
 * always the case for profitable longs (and even at breakeven, because
 * collateral was converted to base). A regular market sell + explicit repay
 * achieves the same result without the over-strict constraint.
 */
export function buildClosePositionOps(
  dbClient: DeepBookClient,
  params: ClosePositionOpsParams,
): (tx: Transaction) => void {
  return (tx: Transaction) => {
    // 1. Market order in reverse direction to unwind position
    dbClient.poolProxy.placeMarketOrder({
      poolKey: params.poolKey,
      marginManagerKey: params.managerKey,
      clientOrderId: nextClientOrderId(),
      isBid: !params.isLong, // reverse to close
      quantity: params.quantity,
      payWithDeep: ZERO_FEE_POOLS.has(params.poolKey),
    })(tx);

    // 2. Repay borrowed amounts (omit amount to repay all)
    if (params.isLong) {
      dbClient.marginManager.repayQuote(params.managerKey)(tx);
    } else {
      dbClient.marginManager.repayBase(params.managerKey)(tx);
    }

    // 3. Withdraw settled amounts back to wallet
    dbClient.poolProxy.withdrawSettledAmounts(params.managerKey)(tx);
  };
}

/**
 * Build margin limit order operations (curried).
 * Places a limit order at a specific target price.
 */
export function buildMarginLimitOrderOps(
  dbClient: DeepBookClient,
  params: LimitOrderOpsParams,
): (tx: Transaction) => void {
  if (!params.targetPrice || params.targetPrice <= 0) {
    throw new Error('Cannot place limit order: invalid target price');
  }

  const borrowAmount = params.collateral * (params.leverage - 1);
  const totalQuote = params.collateral * params.leverage;

  if (totalQuote < MIN_QUOTE_QUANTITY) {
    throw new Error(`Order quantity too small: ${totalQuote}. Minimum is ${MIN_QUOTE_QUANTITY}.`);
  }

  // Convert quote to base using the target limit price, then align to lot_size.
  // Apply safety factor for fees.
  const rawBaseQuantity = (totalQuote / params.targetPrice) * MARKET_ORDER_SAFETY_FACTOR;
  const baseQuantity = alignToLotSize(rawBaseQuantity, params.lotSize);

  if (baseQuantity < MIN_BASE_QUANTITY) {
    throw new Error(`Order base quantity too small: ${baseQuantity}. Increase collateral or leverage.`);
  }

  return (tx: Transaction) => {
    // 1. Deposit collateral
    dbClient.marginManager.depositQuote({
      managerKey: params.managerKey,
      amount: params.collateral,
    })(tx);

    // 2. Borrow
    if (borrowAmount > 0) {
      dbClient.marginManager.borrowQuote(params.managerKey, borrowAmount)(tx);
    }

    // 3. Place limit order at target price — quantity in BASE units, lot_size-aligned
    dbClient.poolProxy.placeLimitOrder({
      poolKey: params.poolKey,
      marginManagerKey: params.managerKey,
      clientOrderId: nextClientOrderId(),
      isBid: params.direction === 'long',
      price: params.targetPrice,
      quantity: baseQuantity,
      payWithDeep: ZERO_FEE_POOLS.has(params.poolKey),
    })(tx);
  };
}

/**
 * Build cancel order operations (curried).
 */
export function buildCancelOrderOps(
  dbClient: DeepBookClient,
  params: CancelOrderOpsParams,
): (tx: Transaction) => void {
  return (tx: Transaction) => {
    dbClient.poolProxy.cancelOrder(params.managerKey, params.orderId)(tx);

    // Repay any borrowed funds
    dbClient.marginManager.repayQuote(params.managerKey)(tx);

    // Withdraw collateral back
    dbClient.poolProxy.withdrawSettledAmounts(params.managerKey)(tx);
  };
}
