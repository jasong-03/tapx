import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import type { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Pool, TradeSide, TradeResult } from '@/lib/swipebook/types';
import {
  buildMarketBuyTransaction,
  buildMarketSellTransaction,
  calculateMinOutput,
} from '@/lib/deepbook/transactions';
import { getUserFriendlyError } from '@/lib/deepbook/tx-utils';
import { useDeepBookClient } from './useDeepBookClient';

interface ExecuteTradeParams {
  pool: Pool;
  side: TradeSide;
  amount: number;           // Human-readable amount
  estimatedOutput: number;  // Human-readable estimated output
  slippagePercent: number;  // e.g., 0.5 for 0.5%
}

/**
 * Hook for executing trades on DeepBook using the SDK client.
 *
 * Uses sign-only via wallet + direct RPC execution to bypass
 * the wallet's backend proxy which can return 502 on testnet.
 */
export function useTradeExecution() {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;
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

      // Sign via wallet (1 prompt), then execute directly via Sui RPC.
      // This bypasses the wallet's backend proxy which can return 502.
      const signed = await dAppKit.signTransaction({ transaction: tx });
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: signed.bytes,
        signature: signed.signature,
        options: { showEffects: true },
      });

      if (!result.digest) {
        throw new Error('Transaction submitted but no digest returned');
      }

      const effects = result.effects;
      if (effects?.status?.status === 'failure') {
        throw new Error(effects.status.error || 'Transaction failed on-chain');
      }

      return {
        success: true,
        digest: result.digest,
        timestamp: Date.now(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['pool-market-data'] });
    },
    onError: (err) => {
      console.error('Trade failed:', getUserFriendlyError(err));
    },
  });

  return {
    executeTrade: mutate,
    executeTradeAsync: mutateAsync,
    isPending,
    error: error ? new Error(getUserFriendlyError(error)) : null,
    reset,
  };
}
