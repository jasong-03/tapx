"use client"

import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { useMarginManager } from './useMarginManager';
import { useMarginClient } from './useDeepBookClient';
import { queryMarginState } from '@/lib/deepbook/margin-transactions';
import {
  MARGIN_POOLS,
  MARGIN_POOL_KEYS,
} from '@/lib/deepbook/margin-config';

export interface MarginPositionSummary {
  poolKey: string;
  baseCoin: string;
  quoteCoin: string;
  baseAsset: number;
  quoteAsset: number;
  baseDebt: number;
  quoteDebt: number;
  direction: 'long' | 'short' | 'none';
  equity: number;
  leverage: number;
  currentPrice: number;
}

type MarginPoolConfig = { baseCoin: string; quoteCoin: string };

export function useAllMarginPositions(): {
  positions: MarginPositionSummary[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const currentAccount = useCurrentAccount();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;
  const { marginManagers, managerIds } = useMarginManager();
  const dbClient = useMarginClient(marginManagers);

  const hasManagers = Object.keys(managerIds).length > 0;
  const sortedManagerKeys = Object.keys(managerIds).sort();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['all-margin-positions', ...sortedManagerKeys],
    queryFn: async (): Promise<MarginPositionSummary[]> => {
      if (!suiClient || !dbClient) return [];

      const poolConfigs = MARGIN_POOLS as Record<string, MarginPoolConfig>;

      const results = await Promise.allSettled(
        MARGIN_POOL_KEYS.map(async (poolKey) => {
          const mgrKey = `${poolKey}_MGR`;
          const manager = marginManagers[mgrKey];
          if (!manager) return null;

          try {
            const state = await queryMarginState(
              suiClient,
              dbClient,
              manager.address,
              poolKey,
            );

            // Only include positions with active debt
            if (state.baseDebt <= 0 && state.quoteDebt <= 0) return null;

            // Determine direction based on which side has debt
            let direction: 'long' | 'short' | 'none' = 'none';
            if (state.quoteDebt > 0) {
              direction = 'long';
            } else if (state.baseDebt > 0) {
              direction = 'short';
            }

            // Estimate current price from position balances
            let currentPrice = 0;
            if (direction === 'long' && state.baseAsset > 0) {
              currentPrice = state.quoteDebt / state.baseAsset;
            } else if (direction === 'short' && state.baseDebt > 0) {
              currentPrice = state.quoteAsset / state.baseDebt;
            }

            // Calculate equity and leverage
            const totalValue =
              state.baseAsset * currentPrice + state.quoteAsset;
            const debtValue =
              state.baseDebt * currentPrice + state.quoteDebt;
            const equity = totalValue - debtValue;
            const leverage = equity > 0 ? totalValue / equity : 1;

            const poolConfig = poolConfigs[poolKey];

            return {
              poolKey,
              baseCoin: poolConfig?.baseCoin ?? poolKey.split('_')[0],
              quoteCoin: poolConfig?.quoteCoin ?? poolKey.split('_')[1],
              baseAsset: state.baseAsset,
              quoteAsset: state.quoteAsset,
              baseDebt: state.baseDebt,
              quoteDebt: state.quoteDebt,
              direction,
              equity,
              leverage: Math.round(leverage * 10) / 10,
              currentPrice,
            } satisfies MarginPositionSummary;
          } catch (err) {
            // Skip pools that fail (Pyth stale, network issues, etc.)
            console.warn(
              `[useAllMarginPositions] Failed to query pool ${poolKey}:`,
              err,
            );
            return null;
          }
        }),
      );

      // Collect fulfilled results, filter out nulls and rejections
      const positions: MarginPositionSummary[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value != null) {
          positions.push(result.value);
        }
      }

      return positions;
    },
    enabled: !!currentAccount && !!suiClient && !!dbClient && hasManagers,
    refetchInterval: 5000,
    staleTime: 3000,
  });

  return {
    positions: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
