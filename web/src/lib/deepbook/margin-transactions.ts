// Margin transaction builders for DeepBook V3
// Operations are exported as curried (tx: Transaction) => void functions
// so they can be composed into a single transaction with Pyth price updates.

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { DeepBookClient } from '@mysten/deepbook-v3';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getPool } from './pools';
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from './config';
import { prependPythPriceUpdate } from './pyth-refresh';

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

let orderCounter = 0;
function nextClientOrderId(): string {
  // Must be a numeric string — SDK serializes as u64 BigInt
  return `${Date.now()}${++orderCounter}`;
}

// Minimum quantity thresholds to avoid MoveAbort in validate_inputs
const MIN_QUOTE_QUANTITY = 0.01; // minimum quote amount for market orders
const MIN_BASE_QUANTITY = 0.000001; // minimum base amount for market orders

// Safety factor for market order base quantity to account for order book spread.
// The base quantity is computed from the mid/mark price, but actual fills use the
// order book ask/bid price. This buffer prevents the quote cost from exceeding
// the available balance in the BalanceManager.
const MARKET_ORDER_SPREAD_FACTOR = 0.98;

// Safety factor for conditional order quantities to account for market order slippage.
// Market orders may fill slightly less than requested; conditional orders (TP/SL)
// must reference a smaller quantity to avoid balance_manager::withdraw_with_proof abort 3.
const CONDITIONAL_ORDER_SAFETY_FACTOR = 0.97;

/**
 * Align a base quantity to the pool's lot_size.
 * The on-chain contract requires: (quantity_raw % lot_size_raw) == 0.
 * Since the SDK does `Math.round(quantity * baseCoin.scalar)`, we need to
 * ensure the human-readable quantity is a clean multiple of lotSize.
 */
export function alignToLotSize(quantity: number, lotSize: number): number {
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

  // Convert quote buying-power to base quantity, then align to lot_size
  const rawBaseQuantity = totalQuote / params.currentPrice;
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
      payWithDeep: false,
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
  // Convert quote to base, then align to lot_size
  const rawBorrowBase = borrowValue / params.currentPrice;
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
      payWithDeep: false,
    })(tx);
  };

  return { ops, baseQuantity: borrowBase };
}

/**
 * Build close position operations (curried).
 * Flow: market order → repay debt → withdraw settled amounts
 *
 * When asset >= debt on the closing side, reduce-only orders fail (error 3).
 * Pass `useReduceOnly: false` to use a regular market order instead.
 *
 * IMPORTANT: Only repay the side that was actually borrowed. Calling repay_base
 * on a long (which only borrows quote) triggers EIncorrectMarginPool (error 10).
 */
export function buildClosePositionOps(
  dbClient: DeepBookClient,
  params: ClosePositionOpsParams & { useReduceOnly?: boolean },
): (tx: Transaction) => void {
  const useReduceOnly = params.useReduceOnly ?? true;

  return (tx: Transaction) => {
    // 1. Market order to close (reverse direction)
    // Skip if quantity is 0 (baseAsset < lotSize) — just repay + withdraw
    if (params.quantity > 0) {
      if (useReduceOnly) {
        dbClient.poolProxy.placeReduceOnlyMarketOrder({
          poolKey: params.poolKey,
          marginManagerKey: params.managerKey,
          clientOrderId: nextClientOrderId(),
          isBid: !params.isLong,
          quantity: params.quantity,
          payWithDeep: false,
        })(tx);
      } else {
        dbClient.poolProxy.placeMarketOrder({
          poolKey: params.poolKey,
          marginManagerKey: params.managerKey,
          clientOrderId: nextClientOrderId(),
          isBid: !params.isLong,
          quantity: params.quantity,
          payWithDeep: false,
        })(tx);
      }
    }

    // 2. Repay only the borrowed side (long borrows quote, short borrows base)
    // Calling repay on the wrong side causes EIncorrectMarginPool (error 10)
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

  // Convert quote to base using the target limit price, then align to lot_size
  const rawBaseQuantity = totalQuote / params.targetPrice;
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
      payWithDeep: false,
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

/**
 * Build force-repay operations to clear all outstanding debt on a pool.
 * Flow: deposit enough to cover debt → repay → withdraw all settled amounts.
 * Use this to clear a stuck margin_pool_id (error 4: ECannotHaveLoanInMoreThanOneMarginPool).
 *
 * IMPORTANT: The manager may have 0 assets after a failed/partial close. We must
 * deposit enough to cover the debt BEFORE calling repay — otherwise repay is a
 * no-op and margin_pool_id stays dirty.
 *
 * Only repay the side that has debt to avoid EIncorrectMarginPool (error 10).
 */
export function buildForceRepayOps(
  dbClient: DeepBookClient,
  params: { poolKey: string; managerKey: string; baseDebt?: number; quoteDebt?: number },
): (tx: Transaction) => void {
  return (tx: Transaction) => {
    if (params.quoteDebt && params.quoteDebt > 0) {
      // Deposit quote to cover debt + 2% buffer for accrued interest
      dbClient.marginManager.depositQuote({
        managerKey: params.managerKey,
        amount: params.quoteDebt * 1.02,
      })(tx);
      dbClient.marginManager.repayQuote(params.managerKey)(tx);
    }
    if (params.baseDebt && params.baseDebt > 0) {
      // Deposit base to cover debt + 2% buffer for accrued interest
      dbClient.marginManager.depositBase({
        managerKey: params.managerKey,
        amount: params.baseDebt * 1.02,
      })(tx);
      dbClient.marginManager.repayBase(params.managerKey)(tx);
    }
    // Withdraw any settled/remaining amounts (returns deposit surplus + cleared collateral)
    dbClient.poolProxy.withdrawSettledAmounts(params.managerKey)(tx);
  };
}

// ────────────────────────────────────────────────────────────────────────────
// TPSL (Take Profit / Stop Loss) transaction builders
// ────────────────────────────────────────────────────────────────────────────

interface OpenWithTPSLOpsParams {
  poolKey: string;
  managerKey: string;
  collateral: number;
  leverage: number;
  currentPrice: number;
  lotSize: number;
  direction: 'long' | 'short';
  tpPrice: number; // take-profit trigger price
  slPrice: number; // stop-loss trigger price
}

/**
 * Build open position + TP/SL conditional orders in a single PTB.
 *
 * Flow:
 * 1. deposit_quote (collateral)
 * 2. borrow_quote or borrow_base (leverage)
 * 3. place_market_order (enter position)
 * 4. add_conditional_order (TP)
 * 5. add_conditional_order (SL)
 *
 * Returns the baseQuantity and the two conditional order IDs.
 */
export function buildOpenWithTPSLOps(
  dbClient: DeepBookClient,
  params: OpenWithTPSLOpsParams,
): { ops: (tx: Transaction) => void; baseQuantity: number; tpOrderId: string; slOrderId: string } {
  if (!params.currentPrice || params.currentPrice <= 0) {
    throw new Error('Cannot open position: invalid current price');
  }

  const isLong = params.direction === 'long';
  const totalQuote = params.collateral * params.leverage;
  const borrowAmount = params.collateral * (params.leverage - 1);

  if (totalQuote < MIN_QUOTE_QUANTITY) {
    throw new Error(`Order quantity too small: ${totalQuote}. Minimum is ${MIN_QUOTE_QUANTITY}.`);
  }

  let baseQuantity: number;
  let borrowBase: number | undefined;

  if (isLong) {
    // Long: borrow quote, buy base.
    // Apply spread factor so the quote cost stays within the BalanceManager balance
    // even when the order book ask price exceeds the mid/mark price.
    const rawBaseQuantity = (totalQuote / params.currentPrice) * MARKET_ORDER_SPREAD_FACTOR;
    baseQuantity = alignToLotSize(rawBaseQuantity, params.lotSize);
  } else {
    // Short: borrow base, sell base
    const rawBorrowBase = borrowAmount / params.currentPrice;
    borrowBase = alignToLotSize(rawBorrowBase, params.lotSize);
    baseQuantity = borrowBase;
  }

  if (baseQuantity < MIN_BASE_QUANTITY) {
    throw new Error(`Order base quantity too small: ${baseQuantity}. Increase collateral or leverage.`);
  }

  // Conditional orders use a reduced quantity to account for:
  // 1. Market order slippage (partial fills)
  // 2. Fees deducted from output when payWithDeep=false
  // Without this, balance_manager::withdraw_with_proof aborts (error 3).
  // If the reduced quantity rounds to 0 after lot-size alignment (small positions),
  // fall back to baseQuantity to avoid validate_inputs abort 1 (quantity > 0).
  const alignedConditional = alignToLotSize(
    baseQuantity * CONDITIONAL_ORDER_SAFETY_FACTOR,
    params.lotSize,
  );
  const conditionalBaseQuantity = alignedConditional > 0 ? alignedConditional : baseQuantity;

  console.log('[buildOpenWithTPSL] lotSize:', params.lotSize, 'baseQty:', baseQuantity, 'conditionalQty:', conditionalBaseQuantity);

  // Generate unique conditional order IDs
  const tpOrderId = nextClientOrderId();
  const slOrderId = nextClientOrderId();

  const ops = (tx: Transaction) => {
    // 0. Cancel any orphaned conditional orders from previous failed trades.
    // Safe to call with 0 existing orders (no-op). Prevents EMaxConditionalOrdersReached (error 3).
    dbClient.marginTPSL.cancelAllConditionalOrders(params.managerKey)(tx);

    // 1. Deposit collateral (quote)
    dbClient.marginManager.depositQuote({
      managerKey: params.managerKey,
      amount: params.collateral,
    })(tx);

    // 2. Borrow
    if (isLong) {
      if (borrowAmount > 0) {
        dbClient.marginManager.borrowQuote(params.managerKey, borrowAmount)(tx);
      }
    } else {
      if (borrowBase && borrowBase > 0) {
        dbClient.marginManager.borrowBase(params.managerKey, borrowBase)(tx);
      }
    }

    // 3. Market order (enter position)
    // payWithDeep=false: fees are deducted from traded tokens instead of DEEP.
    // This avoids abort 3 on non-whitelisted pools (SUI/DBUSDC) where the
    // BalanceManager has no DEEP deposited. Whitelisted pools (0 fees) are unaffected.
    dbClient.poolProxy.placeMarketOrder({
      poolKey: params.poolKey,
      marginManagerKey: params.managerKey,
      clientOrderId: nextClientOrderId(),
      isBid: isLong,
      quantity: baseQuantity,
      payWithDeep: false,
    })(tx);

    // 4. Add TP conditional order (uses reduced quantity to account for slippage + fees)
    // Long TP: trigger when price goes ABOVE tpPrice (triggerBelowPrice=false)
    // Short TP: trigger when price goes BELOW tpPrice (triggerBelowPrice=true)
    // NOTE: Conditional orders MUST use payWithDeep=true — the TPSL module rejects
    // payWithDeep=false with EInvalidOrderParams (abort 6). For whitelisted pools
    // (0 fees) this is free. For non-whitelisted pools, DEEP balance is needed at
    // execution time — handled during settlement.
    dbClient.marginTPSL.addConditionalOrder({
      marginManagerKey: params.managerKey,
      conditionalOrderId: tpOrderId,
      triggerBelowPrice: !isLong, // Long: false (above), Short: true (below)
      triggerPrice: params.tpPrice,
      pendingOrder: {
        clientOrderId: nextClientOrderId(),
        quantity: conditionalBaseQuantity,
        isBid: !isLong, // Reverse to close: Long close = sell (false), Short close = buy (true)
        payWithDeep: true,
      },
    })(tx);

    // 5. Add SL conditional order (uses reduced quantity to account for slippage + fees)
    // Long SL: trigger when price goes BELOW slPrice (triggerBelowPrice=true)
    // Short SL: trigger when price goes ABOVE slPrice (triggerBelowPrice=false)
    dbClient.marginTPSL.addConditionalOrder({
      marginManagerKey: params.managerKey,
      conditionalOrderId: slOrderId,
      triggerBelowPrice: isLong, // Long: true (below), Short: false (above)
      triggerPrice: params.slPrice,
      pendingOrder: {
        clientOrderId: nextClientOrderId(),
        quantity: conditionalBaseQuantity,
        isBid: !isLong, // Same direction as TP (closing)
        payWithDeep: true,
      },
    })(tx);
  };

  return { ops, baseQuantity, tpOrderId, slOrderId };
}

/**
 * Build settle ops after TPSL has been triggered.
 * Flow: execute conditional orders + cancel remaining + repay + withdraw
 *
 * This is called AFTER a TP/SL trigger is detected. The executeConditionalOrders
 * call is permissionless but we still need the user to sign for repay+withdraw.
 */
export function buildSettleTPSLOps(
  dbClient: DeepBookClient,
  params: { poolKey: string; managerKey: string; isLong: boolean },
): (tx: Transaction) => void {
  return (tx: Transaction) => {
    // 1. Execute any triggered conditional orders (permissionless, max 10)
    dbClient.marginTPSL.executeConditionalOrders(params.managerKey, 10)(tx);

    // 2. Cancel any remaining conditional orders (the other side of TP/SL)
    dbClient.marginTPSL.cancelAllConditionalOrders(params.managerKey)(tx);

    // 3. Repay only the borrowed side (long borrows quote, short borrows base)
    // Calling repay on the wrong side causes EIncorrectMarginPool (error 10)
    if (params.isLong) {
      dbClient.marginManager.repayQuote(params.managerKey)(tx);
    } else {
      dbClient.marginManager.repayBase(params.managerKey)(tx);
    }

    // 4. Withdraw settled amounts back to wallet
    dbClient.poolProxy.withdrawSettledAmounts(params.managerKey)(tx);
  };
}

/**
 * Build close-early ops: user wants to exit before TP/SL triggers.
 * Flow: cancel all conditionals + market order + repay + withdraw
 *
 * When the margin account's asset exceeds its debt on the closing side
 * (e.g. quoteAsset > quoteDebt for a long), the reduce-only assertion
 * (ENotReduceOnlyOrder / error 3) will fail on-chain. In that case,
 * pass `useReduceOnly: false` to place a regular market order instead.
 */
export function buildCloseEarlyOps(
  dbClient: DeepBookClient,
  params: { poolKey: string; managerKey: string; quantity: number; isLong: boolean; useReduceOnly?: boolean },
): (tx: Transaction) => void {
  const useReduceOnly = params.useReduceOnly ?? true;

  return (tx: Transaction) => {
    // 1. Cancel all conditional orders first
    dbClient.marginTPSL.cancelAllConditionalOrders(params.managerKey)(tx);

    // 2. Market order to close position (reverse direction)
    // Skip if quantity is 0 (baseAsset < lotSize after alignment) — just repay + withdraw
    if (params.quantity > 0) {
      if (useReduceOnly) {
        dbClient.poolProxy.placeReduceOnlyMarketOrder({
          poolKey: params.poolKey,
          marginManagerKey: params.managerKey,
          clientOrderId: nextClientOrderId(),
          isBid: !params.isLong,
          quantity: params.quantity,
          payWithDeep: false,
        })(tx);
      } else {
        dbClient.poolProxy.placeMarketOrder({
          poolKey: params.poolKey,
          marginManagerKey: params.managerKey,
          clientOrderId: nextClientOrderId(),
          isBid: !params.isLong,
          quantity: params.quantity,
          payWithDeep: false,
        })(tx);
      }
    }

    // 3. Repay only the borrowed side (long borrows quote, short borrows base)
    // Calling repay on the wrong side causes EIncorrectMarginPool (error 10)
    if (params.isLong) {
      dbClient.marginManager.repayQuote(params.managerKey)(tx);
    } else {
      dbClient.marginManager.repayBase(params.managerKey)(tx);
    }

    // 4. Withdraw settled amounts
    dbClient.poolProxy.withdrawSettledAmounts(params.managerKey)(tx);
  };
}

/**
 * Query the on-chain margin manager state (debts & assets) via devInspect.
 * Used to calculate the correct reduce-only quantity before closing.
 */
export async function queryMarginState(
  client: SuiJsonRpcClient,
  dbClient: DeepBookClient,
  managerId: string,
  poolKey: string,
): Promise<{ baseAsset: number; quoteAsset: number; baseDebt: number; quoteDebt: number }> {
  const pool = getPool(poolKey);
  if (!pool) throw new Error(`Unknown pool: ${poolKey}`);

  const tx = new Transaction();
  tx.setSenderIfNotSet(DUMMY_SENDER);

  // Pyth price refresh needed for managerState (check_price_is_fresh)
  await prependPythPriceUpdate(tx, poolKey);

  // SDK query: returns [manager_id, pool_id, risk_ratio, base_asset, quote_asset, base_debt, quote_debt, ...]
  dbClient.marginManager.managerState(poolKey, managerId)(tx);

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DUMMY_SENDER,
  });

  if (!result.results?.length) throw new Error('Failed to query margin state');

  const rv = result.results[result.results.length - 1]?.returnValues;
  if (!rv || rv.length < 7) throw new Error('Unexpected margin state response');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseU64 = (v: any): number => {
    if (!v || v[1] !== 'u64') return 0;
    return Number(bcs.u64().parse(new Uint8Array(v[0])));
  };

  const baseScalar = Math.pow(10, pool.baseDecimals);
  const quoteScalar = Math.pow(10, pool.quoteDecimals);

  return {
    baseAsset: parseU64(rv[3]) / baseScalar,
    quoteAsset: parseU64(rv[4]) / quoteScalar,
    baseDebt: parseU64(rv[5]) / baseScalar,
    quoteDebt: parseU64(rv[6]) / quoteScalar,
  };
}
