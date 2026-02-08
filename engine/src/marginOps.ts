// Margin transaction builders for DeepBook V3 (engine version).
// Ported from web/src/lib/deepbook/margin-transactions.ts

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { DeepBookClient } from '@mysten/deepbook-v3';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getPool, getDeepBookPackageId, DUMMY_SENDER } from './pools.js';
import { prependPythPriceUpdate } from './pythRefresh.js';

let orderCounter = 0;
function nextClientOrderId(): string {
  return `${Date.now()}${++orderCounter}`;
}

const MIN_QUOTE_QUANTITY = 0.01;
const MIN_BASE_QUANTITY = 0.000001;

export function alignToLotSize(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return quantity;
  return Math.floor(quantity / lotSize) * lotSize;
}

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
    target: `${getDeepBookPackageId()}::pool::pool_book_params`,
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

  const params = {
    tickSize: (Number(tickSizeRaw) * baseScalar) / quoteScalar / 1e9,
    lotSize: Number(lotSizeRaw) / baseScalar,
    minSize: Number(minSizeRaw) / baseScalar,
  };

  lotSizeCache.set(poolKey, params);
  return params;
}

export function buildOpenWithTPSLOps(
  dbClient: DeepBookClient,
  params: {
    poolKey: string;
    managerKey: string;
    collateral: number;
    leverage: number;
    currentPrice: number;
    lotSize: number;
    direction: 'long' | 'short';
    tpPrice: number;
    slPrice: number;
  },
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
    const rawBaseQuantity = totalQuote / params.currentPrice;
    baseQuantity = alignToLotSize(rawBaseQuantity, params.lotSize);
  } else {
    const rawBorrowBase = borrowAmount / params.currentPrice;
    borrowBase = alignToLotSize(rawBorrowBase, params.lotSize);
    baseQuantity = borrowBase;
  }

  if (baseQuantity < MIN_BASE_QUANTITY) {
    throw new Error(`Order base quantity too small: ${baseQuantity}. Increase collateral or leverage.`);
  }

  const tpOrderId = nextClientOrderId();
  const slOrderId = nextClientOrderId();

  const ops = (tx: Transaction) => {
    dbClient.marginTPSL.cancelAllConditionalOrders(params.managerKey)(tx);

    dbClient.marginManager.depositQuote({
      managerKey: params.managerKey,
      amount: params.collateral,
    })(tx);

    if (isLong) {
      if (borrowAmount > 0) {
        dbClient.marginManager.borrowQuote(params.managerKey, borrowAmount)(tx);
      }
    } else {
      if (borrowBase && borrowBase > 0) {
        dbClient.marginManager.borrowBase(params.managerKey, borrowBase)(tx);
      }
    }

    dbClient.poolProxy.placeMarketOrder({
      poolKey: params.poolKey,
      marginManagerKey: params.managerKey,
      clientOrderId: nextClientOrderId(),
      isBid: isLong,
      quantity: baseQuantity,
      payWithDeep: true,
    })(tx);

    dbClient.marginTPSL.addConditionalOrder({
      marginManagerKey: params.managerKey,
      conditionalOrderId: tpOrderId,
      triggerBelowPrice: !isLong,
      triggerPrice: params.tpPrice,
      pendingOrder: {
        clientOrderId: nextClientOrderId(),
        quantity: baseQuantity,
        isBid: !isLong,
        payWithDeep: true,
      },
    })(tx);

    dbClient.marginTPSL.addConditionalOrder({
      marginManagerKey: params.managerKey,
      conditionalOrderId: slOrderId,
      triggerBelowPrice: isLong,
      triggerPrice: params.slPrice,
      pendingOrder: {
        clientOrderId: nextClientOrderId(),
        quantity: baseQuantity,
        isBid: !isLong,
        payWithDeep: true,
      },
    })(tx);
  };

  return { ops, baseQuantity, tpOrderId, slOrderId };
}

export function buildSettleTPSLOps(
  dbClient: DeepBookClient,
  params: { poolKey: string; managerKey: string; isLong: boolean },
): (tx: Transaction) => void {
  return (tx: Transaction) => {
    dbClient.marginTPSL.executeConditionalOrders(params.managerKey, 10)(tx);
    dbClient.marginTPSL.cancelAllConditionalOrders(params.managerKey)(tx);

    if (params.isLong) {
      dbClient.marginManager.repayQuote(params.managerKey)(tx);
    } else {
      dbClient.marginManager.repayBase(params.managerKey)(tx);
    }

    dbClient.poolProxy.withdrawSettledAmounts(params.managerKey)(tx);
  };
}

export function buildCloseEarlyOps(
  dbClient: DeepBookClient,
  params: { poolKey: string; managerKey: string; quantity: number; isLong: boolean; useReduceOnly?: boolean },
): (tx: Transaction) => void {
  const useReduceOnly = params.useReduceOnly ?? true;

  return (tx: Transaction) => {
    dbClient.marginTPSL.cancelAllConditionalOrders(params.managerKey)(tx);

    if (params.quantity > 0) {
      if (useReduceOnly) {
        dbClient.poolProxy.placeReduceOnlyMarketOrder({
          poolKey: params.poolKey,
          marginManagerKey: params.managerKey,
          clientOrderId: nextClientOrderId(),
          isBid: !params.isLong,
          quantity: params.quantity,
          payWithDeep: true,
        })(tx);
      } else {
        dbClient.poolProxy.placeMarketOrder({
          poolKey: params.poolKey,
          marginManagerKey: params.managerKey,
          clientOrderId: nextClientOrderId(),
          isBid: !params.isLong,
          quantity: params.quantity,
          payWithDeep: true,
        })(tx);
      }
    }

    if (params.isLong) {
      dbClient.marginManager.repayQuote(params.managerKey)(tx);
    } else {
      dbClient.marginManager.repayBase(params.managerKey)(tx);
    }

    dbClient.poolProxy.withdrawSettledAmounts(params.managerKey)(tx);
  };
}

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

  await prependPythPriceUpdate(tx, poolKey);

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
