import { useQuery } from '@tanstack/react-query';
import type { TradingSignal } from '@/lib/signals/types';
import { generateSignal, generateMockPriceData } from '@/lib/signals/signalGenerator';

/**
 * Options for the useSignals hook
 */
interface UseSignalsOptions {
  /** Current price of the pool (used for mock data generation) */
  currentPrice?: number;
  /** Whether to enable the query */
  enabled?: boolean;
}

/**
 * React Query hook for fetching trading signals for a given pool
 *
 * This hook generates AI-powered trading signals by analyzing technical indicators
 * including RSI, MACD, MA crossovers, and volume anomalies.
 *
 * @param poolAddress - The address of the DeepBook pool
 * @param options - Configuration options
 * @returns Query result containing TradingSignal data
 *
 * @example
 * ```tsx
 * const { data: signal, isLoading } = useSignals(pool.address, {
 *   currentPrice: pool.midPrice,
 *   enabled: !!pool,
 * });
 *
 * if (signal?.direction === 'bullish') {
 *   // Show bullish indicator
 * }
 * ```
 */
export function useSignals(
  poolAddress: string | null | undefined,
  options: UseSignalsOptions = {}
) {
  const { currentPrice = 0, enabled = true } = options;

  return useQuery<TradingSignal, Error>({
    queryKey: ['trading-signal', poolAddress, currentPrice],
    queryFn: async () => {
      if (!poolAddress) {
        throw new Error('Pool address is required');
      }

      // In the future, this would fetch real historical price data from an indexer
      // For now, we generate mock data based on the current price
      const mockPriceData = generateMockPriceData(currentPrice);
      const signal = generateSignal(mockPriceData, currentPrice);

      return signal;
    },
    enabled: enabled && !!poolAddress && currentPrice > 0,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
    gcTime: 60000, // Keep in cache for 1 minute
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

/**
 * Hook to fetch signals for multiple pools simultaneously
 *
 * @param pools - Array of pool addresses with their current prices
 * @returns Object containing signals map and loading state
 */
export function useMultipleSignals(
  pools: Array<{ address: string; currentPrice: number }> | undefined
) {
  const enabled = !!pools && pools.length > 0;

  return useQuery<Map<string, TradingSignal>, Error>({
    queryKey: ['trading-signals-batch', pools?.map((p) => p.address).join(',')],
    queryFn: async () => {
      if (!pools || pools.length === 0) {
        return new Map();
      }

      const signalsMap = new Map<string, TradingSignal>();

      for (const pool of pools) {
        const mockPriceData = generateMockPriceData(pool.currentPrice);
        const signal = generateSignal(mockPriceData, pool.currentPrice);
        signalsMap.set(pool.address, signal);
      }

      return signalsMap;
    },
    enabled,
    refetchInterval: 30000,
    staleTime: 15000,
    gcTime: 60000,
  });
}

/**
 * Get a color for the signal direction
 *
 * @param direction - Signal direction
 * @returns Tailwind color class
 */
export function getSignalColor(direction: TradingSignal['direction']): string {
  switch (direction) {
    case 'bullish':
      return 'text-green-500';
    case 'bearish':
      return 'text-red-500';
    case 'neutral':
    default:
      return 'text-yellow-500';
  }
}

/**
 * Get a background color for the signal direction
 *
 * @param direction - Signal direction
 * @returns Tailwind background color class
 */
export function getSignalBgColor(direction: TradingSignal['direction']): string {
  switch (direction) {
    case 'bullish':
      return 'bg-green-500/10';
    case 'bearish':
      return 'bg-red-500/10';
    case 'neutral':
    default:
      return 'bg-yellow-500/10';
  }
}

/**
 * Get an icon representation for the signal
 *
 * @param direction - Signal direction
 * @returns Unicode arrow or dash
 */
export function getSignalIcon(direction: TradingSignal['direction']): string {
  switch (direction) {
    case 'bullish':
      return '\u2191'; // Up arrow
    case 'bearish':
      return '\u2193'; // Down arrow
    case 'neutral':
    default:
      return '\u2194'; // Left-right arrow
  }
}
