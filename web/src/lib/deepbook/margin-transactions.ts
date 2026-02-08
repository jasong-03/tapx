// Margin transaction builders for DeepBook V3
// Operations are exported as curried (tx: Transaction) => void functions
// so they can be composed into a single transaction with Pyth price updates.

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { DeepBookClient } from '@mysten/deepbook-v3';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getPool } from './pools';
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from './config';

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
      payWithDeep: false,
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
