"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import type { Pool, TradeSide, TradeResult } from '@/lib/swipebook/types';
import { simulateTrade } from '@/lib/simulation/engine';
import { loadOrCreatePortfolio, savePortfolio } from '@/lib/simulation/storage';
import type { SimulatedPortfolio } from '@/lib/simulation/types';

interface ExecuteTradeParams {
  pool: Pool;
  side: TradeSide;
  amount: number;
  estimatedOutput: number;
  slippagePercent: number;
}

/**
 * Simulated trade execution hook — mirrors useTradeExecution API surface.
 * Uses devInspect-derived price estimates + localStorage balances.
 * No wallet signing, no on-chain execution.
 */
export function useSimulatedTradeExecution() {
  const currentAccount = useCurrentAccount();
  const queryClient = useQueryClient();

  const { mutate, mutateAsync, isPending, error, reset } = useMutation({
    mutationFn: async (params: ExecuteTradeParams): Promise<TradeResult> => {
      const { pool, side, amount, estimatedOutput, slippagePercent } = params;

      const address = currentAccount?.address || 'demo';
      const portfolio: SimulatedPortfolio = loadOrCreatePortfolio(address);

      // Apply random slippage within tolerance for realism
      const slippageFactor = 1 - (Math.random() * slippagePercent) / 200;
      const adjustedOutput = estimatedOutput * slippageFactor;

      const result = simulateTrade(
        portfolio,
        pool,
        side,
        amount,
        adjustedOutput,
        estimatedOutput > 0 ? amount / estimatedOutput : 0,
      );

      if ('error' in result) {
        throw new Error(result.error);
      }

      // Persist updated portfolio
      savePortfolio(address, result.updatedPortfolio);

      // Small delay to feel realistic
      await new Promise((resolve) => setTimeout(resolve, 150));

      return {
        success: true,
        digest: result.trade.id, // 'sim_...' prefix
        timestamp: Date.now(),
        isSimulated: true,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sim-portfolio'] });
    },
  });

  return {
    executeTrade: mutate,
    executeTradeAsync: mutateAsync,
    isPending,
    error: error ? new Error(error.message) : null,
    reset,
  };
}
