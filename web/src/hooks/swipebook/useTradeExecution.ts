import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import type { Transaction } from '@mysten/sui/transactions';
import type { Pool, TradeSide, TradeResult } from '@/lib/swipebook/types';
import {
  buildMarketBuyTransaction,
  buildMarketSellTransaction,
  calculateMinOutput,
} from '@/lib/deepbook/transactions';
import { useDeepBookClient } from './useDeepBookClient';

interface ExecuteTradeParams {
  pool: Pool;
  side: TradeSide;
  amount: number;           // Human-readable amount
  estimatedOutput: number;  // Human-readable estimated output
  slippagePercent: number;  // e.g., 0.5 for 0.5%
}

/**
 * Extract digest and success status from dApp Kit signAndExecuteTransaction result.
 * The result is a discriminated union: { $kind: 'Transaction' | 'FailedTransaction' }
 */
function parseTransactionResult(result: unknown): { digest: string; success: boolean; error?: string } {
  const r = result as Record<string, unknown>;

  // dApp Kit v2: discriminated union with $kind
  if (r.$kind === 'Transaction' && r.Transaction) {
    const tx = r.Transaction as Record<string, unknown>;
    const status = tx.status as { success: boolean; error?: { message?: string } } | undefined;
    return {
      digest: (tx.digest as string) || 'unknown',
      success: status?.success !== false,
      error: status?.success === false ? (status.error?.message || 'Transaction failed on-chain') : undefined,
    };
  }

  if (r.$kind === 'FailedTransaction' && r.FailedTransaction) {
    const tx = r.FailedTransaction as Record<string, unknown>;
    const status = tx.status as { error?: { message?: string } } | undefined;
    return {
      digest: (tx.digest as string) || 'unknown',
      success: false,
      error: status?.error?.message || 'Transaction failed on-chain',
    };
  }

  // Fallback: try common property paths
  if (typeof r.digest === 'string') {
    return { digest: r.digest, success: true };
  }

  return { digest: 'unknown', success: false, error: 'Could not parse transaction result' };
}

/**
 * Hook for executing trades on DeepBook using the SDK client.
 */
export function useTradeExecution() {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();
  const dbClient = useDeepBookClient();

  const { mutate, mutateAsync, isPending, error, reset } = useMutation({
    mutationFn: async (params: ExecuteTradeParams): Promise<TradeResult> => {
      const { pool, side, amount, estimatedOutput, slippagePercent } = params;

      if (!currentAccount) {
        throw new Error('Wallet not connected');
      }
      if (!dbClient) {
        throw new Error('DeepBook client not initialized');
      }

      const minOut = calculateMinOutput(estimatedOutput, slippagePercent);
      let tx: Transaction;

      if (side === 'buy') {
        tx = buildMarketBuyTransaction(dbClient, {
          poolKey: pool.poolKey,
          quoteAmount: amount,
          minBaseOut: minOut,
          sender: currentAccount.address,
        });
      } else {
        tx = buildMarketSellTransaction(dbClient, {
          poolKey: pool.poolKey,
          baseAmount: amount,
          minQuoteOut: minOut,
          sender: currentAccount.address,
        });
      }

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const parsed = parseTransactionResult(result);

      if (!parsed.success) {
        throw new Error(parsed.error || `Transaction failed (${parsed.digest.slice(0, 10)}...)`);
      }

      return {
        success: true,
        digest: parsed.digest,
        timestamp: Date.now(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['pool-market-data'] });
    },
    onError: (error) => {
      console.error('Trade failed:', error);
    },
  });

  return {
    executeTrade: mutate,
    executeTradeAsync: mutateAsync,
    isPending,
    error,
    reset,
  };
}
