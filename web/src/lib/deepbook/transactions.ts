import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import type { Pool } from '@/lib/swipebook/types';
import { DEEPBOOK_PACKAGE_ID } from '@/lib/deepbook/config';

/**
 * Build a market buy transaction (swap quote for base)
 * User provides quote amount, receives base tokens
 */
export function buildMarketBuyTransaction(params: {
  pool: Pool;
  quoteAmount: bigint;      // Amount of quote to spend
  minBaseOut: bigint;       // Minimum base to receive (slippage protection)
  sender: string;
}): Transaction {
  const { pool, quoteAmount, minBaseOut, sender } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  // Create quote coin to spend
  const quoteCoin = coinWithBalance({
    type: pool.quoteType,
    balance: quoteAmount,
  });

  // Call DeepBook swap function - swap quote for base
  const [baseCoinOut, quoteCoinRemainder] = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::swap_exact_quote_for_base`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [
      tx.object(pool.address),        // Pool
      tx.object(quoteCoin),           // Quote coin input
      tx.pure.u64(minBaseOut),        // Min base out
      tx.object('0x6'),               // Clock
    ],
  });

  // Transfer outputs to sender
  tx.transferObjects([baseCoinOut, quoteCoinRemainder], sender);

  return tx;
}

/**
 * Build a market sell transaction (swap base for quote)
 * User provides base amount, receives quote tokens
 */
export function buildMarketSellTransaction(params: {
  pool: Pool;
  baseAmount: bigint;       // Amount of base to sell
  minQuoteOut: bigint;      // Minimum quote to receive (slippage protection)
  sender: string;
}): Transaction {
  const { pool, baseAmount, minQuoteOut, sender } = params;

  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  // Create base coin to sell
  const baseCoin = coinWithBalance({
    type: pool.baseType,
    balance: baseAmount,
  });

  // Call DeepBook swap function - swap base for quote
  const [baseCoinRemainder, quoteCoinOut] = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::swap_exact_base_for_quote`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [
      tx.object(pool.address),        // Pool
      tx.object(baseCoin),            // Base coin input
      tx.pure.u64(minQuoteOut),       // Min quote out
      tx.object('0x6'),               // Clock
    ],
  });

  // Transfer outputs to sender
  tx.transferObjects([baseCoinRemainder, quoteCoinOut], sender);

  return tx;
}

/**
 * Calculate minimum output with slippage tolerance
 */
export function calculateMinOutput(
  estimatedOutput: bigint,
  slippagePercent: number
): bigint {
  const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100));
  return (estimatedOutput * slippageFactor) / BigInt(10000);
}

/**
 * Convert human-readable amount to on-chain amount
 */
export function toOnChainAmount(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert on-chain amount to human-readable amount
 */
export function fromOnChainAmount(amount: bigint, decimals: number): number {
  return Number(amount) / Math.pow(10, decimals);
}
