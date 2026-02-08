import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { DeepBookClient } from '@mysten/deepbook-v3';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Pool } from '@/lib/swipebook/types';
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from './config';

/**
 * Estimate swap output via devInspect before submitting a real transaction.
 * Returns the expected output in human-readable units, or 0 if no liquidity.
 * This prevents wallet popups for trades that will fail on-chain.
 */
export async function estimateSwapOutput(
  client: SuiJsonRpcClient,
  pool: Pool,
  side: 'buy' | 'sell',
  amount: number,
): Promise<{ output: number; deepRequired: number }> {
  const tx = new Transaction();

  if (side === 'buy') {
    // get_base_quantity_out: given quote input, how much base do we get?
    const quoteRaw = Math.round(amount * Math.pow(10, pool.quoteDecimals));
    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::get_base_quantity_out`,
      typeArguments: [pool.baseType, pool.quoteType],
      arguments: [
        tx.object(pool.address),
        tx.pure.u64(quoteRaw),
        tx.object.clock(),
      ],
    });
  } else {
    // get_quote_quantity_out: given base input, how much quote do we get?
    const baseRaw = Math.round(amount * Math.pow(10, pool.baseDecimals));
    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::get_quote_quantity_out`,
      typeArguments: [pool.baseType, pool.quoteType],
      arguments: [
        tx.object(pool.address),
        tx.pure.u64(baseRaw),
        tx.object.clock(),
      ],
    });
  }

  try {
    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: DUMMY_SENDER,
    });

    const rv = result.results?.[0]?.returnValues;
    if (!rv || rv.length < 3) return { output: 0, deepRequired: 0 };

    const parseU64 = (raw: [number[], string]): number => {
      if (!raw || raw[1] !== 'u64') return 0;
      const parsed = bcs.u64().parse(new Uint8Array(raw[0]));
      return Number(parsed);
    };

    const baseOut = parseU64(rv[0] as [number[], string]);
    const quoteOut = parseU64(rv[1] as [number[], string]);
    const deepReq = parseU64(rv[2] as [number[], string]);

    const outputDecimals = side === 'buy' ? pool.baseDecimals : pool.quoteDecimals;
    const outputRaw = side === 'buy' ? baseOut : quoteOut;

    return {
      output: outputRaw / Math.pow(10, outputDecimals),
      deepRequired: deepReq / 1e6, // DEEP has 6 decimals
    };
  } catch {
    return { output: 0, deepRequired: 0 };
  }
}

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
