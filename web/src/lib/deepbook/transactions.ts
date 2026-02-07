import { Transaction } from '@mysten/sui/transactions';
import type { DeepBookClient } from '@mysten/deepbook-v3';

/**
 * Build a market buy transaction (swap quote for base)
 * User provides quote amount, receives base tokens.
 * The SDK handles DEEP fees, coin splitting, and correct function signatures.
 */
export function buildMarketBuyTransaction(
  dbClient: DeepBookClient,
  params: {
    poolKey: string;
    quoteAmount: number; // human-readable
    minBaseOut: number; // human-readable
    sender: string;
  },
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(params.sender);

  const [base, quote, deep] = dbClient.deepBook.swapExactQuoteForBase({
    poolKey: params.poolKey,
    amount: params.quoteAmount,
    deepAmount: 0, // No DEEP required — fees paid from input token
    minOut: params.minBaseOut,
  })(tx);

  tx.transferObjects([base, quote, deep], params.sender);
  return tx;
}

/**
 * Build a market sell transaction (swap base for quote)
 * User provides base amount, receives quote tokens.
 * The SDK handles DEEP fees, coin splitting, and correct function signatures.
 */
export function buildMarketSellTransaction(
  dbClient: DeepBookClient,
  params: {
    poolKey: string;
    baseAmount: number; // human-readable
    minQuoteOut: number; // human-readable
    sender: string;
  },
): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(params.sender);

  const [base, quote, deep] = dbClient.deepBook.swapExactBaseForQuote({
    poolKey: params.poolKey,
    amount: params.baseAmount,
    deepAmount: 0, // No DEEP required — fees paid from input token
    minOut: params.minQuoteOut,
  })(tx);

  tx.transferObjects([base, quote, deep], params.sender);
  return tx;
}

/**
 * Calculate minimum output with slippage tolerance (human-readable numbers)
 */
export function calculateMinOutput(
  estimatedOutput: number,
  slippagePercent: number,
): number {
  return estimatedOutput * (1 - slippagePercent / 100);
}

/**
 * Convert a human-readable amount to on-chain representation.
 * Used by devInspect queries that need raw u64 amounts.
 */
export function toOnChainAmount(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * Math.pow(10, decimals)));
}

/**
 * Convert an on-chain u64 amount to human-readable.
 * Used by devInspect queries that return raw u64 amounts.
 */
export function fromOnChainAmount(amount: bigint, decimals: number): number {
  return Number(amount) / Math.pow(10, decimals);
}
