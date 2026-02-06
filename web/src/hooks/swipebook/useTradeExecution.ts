import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { toast } from 'sonner';
import type { Transaction } from '@mysten/sui/transactions';
import type { Pool, TradeSide, TradeResult } from '@/lib/swipebook/types';
import {
  buildMarketBuyTransaction,
  buildMarketSellTransaction,
  toOnChainAmount,
  calculateMinOutput,
} from '@/lib/deepbook/transactions';

interface ExecuteTradeParams {
  pool: Pool;
  side: TradeSide;
  amount: number;           // Human-readable amount
  estimatedOutput: number;  // Human-readable estimated output
  slippagePercent: number;  // e.g., 0.5 for 0.5%
}

/**
 * Hook for executing trades on DeepBook
 */
export function useTradeExecution() {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();

  const { mutate, mutateAsync, isPending, error, reset } = useMutation({
    mutationFn: async (params: ExecuteTradeParams): Promise<TradeResult> => {
      const { pool, side, amount, estimatedOutput, slippagePercent } = params;

      if (!currentAccount) {
        throw new Error('Wallet not connected');
      }

      let tx: Transaction;

      if (side === 'buy') {
        // Buying base with quote
        const quoteAmount = toOnChainAmount(amount, pool.quoteDecimals);
        const minBaseOut = calculateMinOutput(
          toOnChainAmount(estimatedOutput, pool.baseDecimals),
          slippagePercent
        );

        tx = buildMarketBuyTransaction({
          pool,
          quoteAmount,
          minBaseOut,
          sender: currentAccount.address,
        });
      } else {
        // Selling base for quote
        const baseAmount = toOnChainAmount(amount, pool.baseDecimals);
        const minQuoteOut = calculateMinOutput(
          toOnChainAmount(estimatedOutput, pool.quoteDecimals),
          slippagePercent
        );

        tx = buildMarketSellTransaction({
          pool,
          baseAmount,
          minQuoteOut,
          sender: currentAccount.address,
        });
      }

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      // The result type from dapp-kit-react v1 may vary
      // Extract digest from the result
      const digest = 'digest' in result ? (result as { digest: string }).digest :
                     'Transaction' in result ? 'pending' : 'unknown';

      return {
        success: true,
        digest,
        timestamp: Date.now(),
      };
    },
    onSuccess: (result) => {
      toast.success(`Trade successful! TX: ${result.digest?.slice(0, 8)}...`);

      // Invalidate balance queries to refresh user balances
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['pool-market-data'] });
    },
    onError: (error) => {
      console.error('Trade failed:', error);
      toast.error(`Trade failed: ${error.message}`);
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
