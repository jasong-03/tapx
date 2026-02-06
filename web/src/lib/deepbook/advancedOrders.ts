import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { BundledOrderParams, LimitOrderParams } from './orderTypes';
import { validateBundledOrderPrices } from './orderTypes';
import {
  getOrCreateBalanceManager,
  createBalanceManagerTx,
} from './balanceManager';

const DEEPBOOK_PKG = '0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963c8e04b1a1af5f7cf3';

// Order flags for DeepBook
const ORDER_FLAGS = {
  NO_RESTRICTION: 0,
  IMMEDIATE_OR_CANCEL: 1,
  FILL_OR_KILL: 2,
  POST_ONLY: 3,
} as const;

// Self-matching prevention
const SELF_MATCHING_PREVENTION = {
  CANCEL_TAKER: 0,
  CANCEL_MAKER: 1,
  CANCEL_BOTH: 2,
} as const;

/**
 * Build a limit order transaction
 */
export function buildLimitOrderTransaction(params: LimitOrderParams & { sender: string }): Transaction {
  const { pool, side, price, quantity, expiration, sender } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  // Determine which coin to provide based on side
  const isBid = side === 'buy';
  const coinType = isBid ? pool.quoteType : pool.baseType;

  // Calculate required amount
  // For bids: need quote coins (price * quantity)
  // For asks: need base coins (quantity)
  const requiredAmount = isBid
    ? (price * quantity) / BigInt(10 ** 9) // Adjust for price decimals
    : quantity;

  // Create coin for the order
  const coin = coinWithBalance({
    type: coinType,
    balance: requiredAmount,
  });

  // Calculate expiration timestamp (default 24 hours)
  const expirationTimestamp = expiration || Math.floor(Date.now() / 1000) + 86400;

  // Place limit order
  tx.moveCall({
    target: `${DEEPBOOK_PKG}::clob::place_limit_order`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [
      tx.object(pool.address),              // Pool
      tx.pure.u64(price),                   // Price
      tx.pure.u64(quantity),                // Quantity
      tx.pure.bool(isBid),                  // Is bid
      tx.pure.u64(expirationTimestamp),     // Expiration
      tx.pure.u8(ORDER_FLAGS.NO_RESTRICTION), // Order type
      tx.object(coin),                      // Coin
      tx.object('0x6'),                     // Clock
    ],
  });

  return tx;
}

/**
 * Build a bundled order transaction (entry + stop-loss + take-profit)
 * This creates a single transaction that places multiple conditional orders
 */
export async function buildBundledOrderTransaction(
  client: SuiJsonRpcClient,
  params: BundledOrderParams
): Promise<Transaction> {
  const { pool, side, entryPrice, quantity, stopLossPrice, takeProfitPrice, sender } = params;

  // Validate prices
  const validation = validateBundledOrderPrices(params);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  // Check for existing balance manager
  const existingBalanceManager = await getOrCreateBalanceManager(client, sender);

  // Create or use existing balance manager - using generic type for transaction argument
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let balanceManagerRef: any;

  if (existingBalanceManager) {
    balanceManagerRef = tx.object(existingBalanceManager);
  } else {
    // Create new balance manager
    const newBalanceManager = createBalanceManagerTx(tx);
    balanceManagerRef = newBalanceManager;

    // Share the balance manager for persistence
    tx.moveCall({
      target: `${DEEPBOOK_PKG}::balance_manager::share`,
      arguments: [newBalanceManager],
    });
  }

  const isBid = side === 'buy';

  // Calculate total required funds
  // For a buy order bundle: need quote for entry + quote for potential SL/TP orders
  // For a sell order bundle: need base for entry + base for potential SL/TP orders
  const entryAmount = isBid
    ? (entryPrice * quantity) / BigInt(10 ** 9)
    : quantity;

  // Deposit funds for entry order - create coin and deposit
  const entryCoinType = isBid ? pool.quoteType : pool.baseType;
  const entryCoin = coinWithBalance({
    type: entryCoinType,
    balance: entryAmount,
  });

  tx.moveCall({
    target: `${DEEPBOOK_PKG}::balance_manager::deposit`,
    typeArguments: [entryCoinType],
    arguments: [balanceManagerRef, tx.object(entryCoin)],
  });

  // Calculate expiration (default 7 days for bundled orders)
  const expirationTimestamp = Math.floor(Date.now() / 1000) + 7 * 86400;

  // Place entry limit order
  tx.moveCall({
    target: `${DEEPBOOK_PKG}::clob::place_limit_order_with_balance_manager`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [
      tx.object(pool.address),
      balanceManagerRef,
      tx.pure.u64(entryPrice),
      tx.pure.u64(quantity),
      tx.pure.bool(isBid),
      tx.pure.u64(expirationTimestamp),
      tx.pure.u8(ORDER_FLAGS.NO_RESTRICTION),
      tx.pure.u8(SELF_MATCHING_PREVENTION.CANCEL_TAKER),
      tx.object('0x6'),
    ],
  });

  // Place stop-loss order if provided
  if (stopLossPrice) {
    // SL is opposite side: if entry is buy, SL is sell
    const slIsBid = !isBid;

    tx.moveCall({
      target: `${DEEPBOOK_PKG}::clob::place_limit_order_with_balance_manager`,
      typeArguments: [pool.baseType, pool.quoteType],
      arguments: [
        tx.object(pool.address),
        balanceManagerRef,
        tx.pure.u64(stopLossPrice),
        tx.pure.u64(quantity),
        tx.pure.bool(slIsBid),
        tx.pure.u64(expirationTimestamp),
        tx.pure.u8(ORDER_FLAGS.NO_RESTRICTION),
        tx.pure.u8(SELF_MATCHING_PREVENTION.CANCEL_TAKER),
        tx.object('0x6'),
      ],
    });
  }

  // Place take-profit order if provided
  if (takeProfitPrice) {
    // TP is opposite side: if entry is buy, TP is sell
    const tpIsBid = !isBid;

    tx.moveCall({
      target: `${DEEPBOOK_PKG}::clob::place_limit_order_with_balance_manager`,
      typeArguments: [pool.baseType, pool.quoteType],
      arguments: [
        tx.object(pool.address),
        balanceManagerRef,
        tx.pure.u64(takeProfitPrice),
        tx.pure.u64(quantity),
        tx.pure.bool(tpIsBid),
        tx.pure.u64(expirationTimestamp),
        tx.pure.u8(ORDER_FLAGS.NO_RESTRICTION),
        tx.pure.u8(SELF_MATCHING_PREVENTION.CANCEL_TAKER),
        tx.object('0x6'),
      ],
    });
  }

  return tx;
}

/**
 * Build a cancel order transaction
 */
export function buildCancelOrderTransaction(params: {
  poolAddress: string;
  baseType: string;
  quoteType: string;
  orderId: string;
  sender: string;
}): Transaction {
  const { poolAddress, baseType, quoteType, orderId, sender } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  tx.moveCall({
    target: `${DEEPBOOK_PKG}::clob::cancel_order`,
    typeArguments: [baseType, quoteType],
    arguments: [
      tx.object(poolAddress),
      tx.pure.u64(orderId),
      tx.object('0x6'),
    ],
  });

  return tx;
}

/**
 * Build a cancel all orders transaction for a specific pool
 */
export function buildCancelAllOrdersTransaction(params: {
  poolAddress: string;
  baseType: string;
  quoteType: string;
  sender: string;
}): Transaction {
  const { poolAddress, baseType, quoteType, sender } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  tx.moveCall({
    target: `${DEEPBOOK_PKG}::clob::cancel_all_orders`,
    typeArguments: [baseType, quoteType],
    arguments: [tx.object(poolAddress), tx.object('0x6')],
  });

  return tx;
}

/**
 * Build a modify order transaction (cancel and replace)
 */
export function buildModifyOrderTransaction(params: {
  poolAddress: string;
  baseType: string;
  quoteType: string;
  orderId: string;
  newPrice: bigint;
  newQuantity: bigint;
  isBid: boolean;
  sender: string;
}): Transaction {
  const { poolAddress, baseType, quoteType, orderId, newPrice, newQuantity, isBid, sender } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  // Cancel existing order
  tx.moveCall({
    target: `${DEEPBOOK_PKG}::clob::cancel_order`,
    typeArguments: [baseType, quoteType],
    arguments: [
      tx.object(poolAddress),
      tx.pure.u64(orderId),
      tx.object('0x6'),
    ],
  });

  // Calculate required amount for new order
  const coinType = isBid ? quoteType : baseType;
  const requiredAmount = isBid
    ? (newPrice * newQuantity) / BigInt(10 ** 9)
    : newQuantity;

  // Create coin for new order
  const coin = coinWithBalance({
    type: coinType,
    balance: requiredAmount,
  });

  // Place new order
  const expirationTimestamp = Math.floor(Date.now() / 1000) + 86400;

  tx.moveCall({
    target: `${DEEPBOOK_PKG}::clob::place_limit_order`,
    typeArguments: [baseType, quoteType],
    arguments: [
      tx.object(poolAddress),
      tx.pure.u64(newPrice),
      tx.pure.u64(newQuantity),
      tx.pure.bool(isBid),
      tx.pure.u64(expirationTimestamp),
      tx.pure.u8(ORDER_FLAGS.NO_RESTRICTION),
      tx.object(coin),
      tx.object('0x6'),
    ],
  });

  return tx;
}
