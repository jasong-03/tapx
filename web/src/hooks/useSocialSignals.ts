import { useQuery } from '@tanstack/react-query';
import type { SocialSignals, SentimentData } from '@/lib/social/types';
import { getConsensus } from '@/lib/social/consensus';
import { getWhaleActivity } from '@/lib/social/whaleTracking';

/**
 * Generate mock sentiment data
 *
 * In production, this would integrate with external sentiment APIs
 * or on-chain social data.
 */
async function getMockSentiment(tokenSymbol: string): Promise<SentimentData> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

  // Use token symbol as seed for consistent mock data
  const seed = tokenSymbol.toUpperCase().split('').reduce(
    (acc, char) => acc + char.charCodeAt(0), 0
  );

  // Mock sentiment data
  const trending = seed % 3 === 0; // ~33% chance of trending
  const score = ((seed * 17) % 200) - 100; // -100 to 100
  const socialVolume = 1000 + (seed * 23 % 50000);

  return {
    score,
    trending,
    socialVolume,
    sources: ['Twitter', 'Discord', 'Telegram'],
  };
}

/**
 * Fetch all social signals for a pool
 */
async function fetchSocialSignals(
  poolAddress: string,
  tokenSymbol: string
): Promise<SocialSignals> {
  // Fetch all data in parallel
  const [whaleActivity, sentiment] = await Promise.all([
    getWhaleActivity(tokenSymbol),
    getMockSentiment(tokenSymbol),
  ]);

  // Get consensus (synchronous, from localStorage)
  const communitySwipes = getConsensus(poolAddress);

  return {
    whaleActivity,
    communitySwipes,
    sentiment,
  };
}

/**
 * React Query hook combining all social data for a pool
 *
 * Aggregates whale activity, community swipes, and sentiment data
 * into a single query result.
 *
 * @param poolAddress - The DeepBook pool address
 * @param tokenSymbol - The base token symbol (e.g., "SUI")
 * @returns Query result containing SocialSignals data
 *
 * @example
 * ```tsx
 * const { data: signals, isLoading } = useSocialSignals(
 *   pool.address,
 *   pool.baseCoin
 * );
 *
 * if (signals?.communitySwipes.bullish > 70) {
 *   // Show strong bullish indicator
 * }
 * ```
 */
export function useSocialSignals(
  poolAddress: string | null,
  tokenSymbol: string | null
) {
  return useQuery<SocialSignals | null, Error>({
    queryKey: ['social-signals', poolAddress, tokenSymbol],
    queryFn: async (): Promise<SocialSignals | null> => {
      if (!poolAddress || !tokenSymbol) {
        return null;
      }

      return fetchSocialSignals(poolAddress, tokenSymbol);
    },
    enabled: !!poolAddress && !!tokenSymbol,
    refetchInterval: 60000, // 1 minute
    staleTime: 30000, // Consider data stale after 30 seconds
    gcTime: 120000, // Keep in cache for 2 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}

/**
 * Hook to record a swipe and update consensus
 */
export function useRecordSwipe() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { recordSwipe } = require('@/lib/social/consensus');

  return {
    /**
     * Record a user's swipe direction for a pool
     * @param poolAddress - The pool address
     * @param direction - 'bullish' for right swipe, 'bearish' for left swipe
     */
    recordSwipe: (poolAddress: string, direction: 'bullish' | 'bearish') => {
      recordSwipe(poolAddress, direction);
    },
  };
}

/**
 * Get sentiment score label
 */
export function getSentimentLabel(score: number): string {
  if (score >= 50) return 'Very Bullish';
  if (score >= 20) return 'Bullish';
  if (score >= -20) return 'Neutral';
  if (score >= -50) return 'Bearish';
  return 'Very Bearish';
}

/**
 * Get sentiment color
 */
export function getSentimentColor(score: number): string {
  if (score >= 50) return 'text-green-400';
  if (score >= 20) return 'text-green-300';
  if (score >= -20) return 'text-slate-400';
  if (score >= -50) return 'text-red-300';
  return 'text-red-400';
}
