import { Transaction } from '@mysten/sui/transactions';
import type { DeepBookClient } from '@mysten/deepbook-v3';
import { OrderType, SelfMatchingOptions } from '@mysten/deepbook-v3';
import type { BundledOrderParams, LimitOrderParams } from './orderTypes';

/**
 * Build a limit order transaction using the SDK.
 * Requires a balance manager to be configured on the DeepBookClient.
 */
export function buildLimitOrderTransaction(
  dbClient: DeepBookClient,
  params: LimitOrderParams & { sender: string; balanceManagerKey: string },
): Transaction {
  const { pool, side, price, quantity, expiration, sender, balanceManagerKey } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  dbClient.deepBook.placeLimitOrder({
    poolKey: pool.poolKey,
    balanceManagerKey,
    clientOrderId: crypto.randomUUID(),
    price: Number(price),
    quantity: Number(quantity),
    isBid: side === 'buy',
    expiration: expiration ? BigInt(expiration) : undefined,
    orderType: OrderType.NO_RESTRICTION,
    selfMatchingOption: SelfMatchingOptions.CANCEL_TAKER,
    payWithDeep: true,
  })(tx);

  return tx;
}

/**
 * Build a bundled order transaction (entry + stop-loss + take-profit)
 * using the SDK's limit order placement.
 */
export function buildBundledOrderTransaction(
  dbClient: DeepBookClient,
  params: BundledOrderParams & { balanceManagerKey: string },
): Transaction {
  const { pool, side, entryPrice, quantity, stopLossPrice, takeProfitPrice, sender, balanceManagerKey } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  // Calculate expiration (7 days for bundled orders)
  const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400);

  // Place entry limit order
  dbClient.deepBook.placeLimitOrder({
    poolKey: pool.poolKey,
    balanceManagerKey,
    clientOrderId: crypto.randomUUID(),
    price: Number(entryPrice),
    quantity: Number(quantity),
    isBid: side === 'buy',
    expiration: expirationTimestamp,
    orderType: OrderType.NO_RESTRICTION,
    selfMatchingOption: SelfMatchingOptions.CANCEL_TAKER,
    payWithDeep: true,
  })(tx);

  // Place stop-loss order if provided (opposite side)
  if (stopLossPrice) {
    dbClient.deepBook.placeLimitOrder({
      poolKey: pool.poolKey,
      balanceManagerKey,
      clientOrderId: crypto.randomUUID(),
      price: Number(stopLossPrice),
      quantity: Number(quantity),
      isBid: side !== 'buy',
      expiration: expirationTimestamp,
      orderType: OrderType.NO_RESTRICTION,
      selfMatchingOption: SelfMatchingOptions.CANCEL_TAKER,
      payWithDeep: true,
    })(tx);
  }

  // Place take-profit order if provided (opposite side)
  if (takeProfitPrice) {
    dbClient.deepBook.placeLimitOrder({
      poolKey: pool.poolKey,
      balanceManagerKey,
      clientOrderId: crypto.randomUUID(),
      price: Number(takeProfitPrice),
      quantity: Number(quantity),
      isBid: side !== 'buy',
      expiration: expirationTimestamp,
      orderType: OrderType.NO_RESTRICTION,
      selfMatchingOption: SelfMatchingOptions.CANCEL_TAKER,
      payWithDeep: true,
    })(tx);
  }

  return tx;
}

/**
 * Build a cancel order transaction using the SDK.
 */
export function buildCancelOrderTransaction(
  dbClient: DeepBookClient,
  params: {
    poolKey: string;
    balanceManagerKey: string;
    orderId: string;
    sender: string;
  },
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(params.sender);

  dbClient.deepBook.cancelOrder(params.poolKey, params.balanceManagerKey, params.orderId)(tx);

  return tx;
}

/**
 * Build a cancel all orders transaction using the SDK.
 */
export function buildCancelAllOrdersTransaction(
  dbClient: DeepBookClient,
  params: {
    poolKey: string;
    balanceManagerKey: string;
    sender: string;
  },
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(params.sender);

  dbClient.deepBook.cancelAllOrders(params.poolKey, params.balanceManagerKey)(tx);

  return tx;
}
