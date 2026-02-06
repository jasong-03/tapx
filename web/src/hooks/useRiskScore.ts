import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PoolWithMarketData } from '@/lib/swipebook/types';
import type { RiskScore } from '@/lib/signals/types';
import { calculateRiskScore, getRiskSummary } from '@/lib/signals/riskScoring';

/**
 * React Query hook for calculating risk score for a given pool
 *
 * This hook analyzes multiple risk factors including volatility, liquidity,
 * spread, volume, and correlation to provide a comprehensive risk assessment.
 *
 * @param pool - Pool with market data to analyze
 * @returns Query result containing RiskScore data
 *
 * @example
 * ```tsx
 * const { data: riskScore, isLoading } = useRiskScore(poolWithMarketData);
 *
 * if (riskScore?.level === 'high') {
 *   // Show warning to user
 * }
 * ```
 */
export function useRiskScore(pool: PoolWithMarketData | null | undefined) {
  return useQuery<RiskScore, Error>({
    queryKey: [
      'risk-score',
      pool?.address,
      pool?.spreadPercent,
      pool?.volume24h,
      pool?.priceChangePercent24h,
    ],
    queryFn: async () => {
      if (!pool) {
        throw new Error('Pool data is required');
      }

      return calculateRiskScore(pool);
    },
    enabled: !!pool,
    staleTime: 30000, // Consider stale after 30 seconds
    gcTime: 120000, // Keep in cache for 2 minutes
  });
}

/**
 * Synchronous hook for immediate risk score calculation
 * Use this when you need the risk score immediately without query caching
 *
 * @param pool - Pool with market data to analyze
 * @returns RiskScore or null if pool is not provided
 */
export function useRiskScoreSync(
  pool: PoolWithMarketData | null | undefined
): RiskScore | null {
  return useMemo(() => {
    if (!pool) {
      return null;
    }
    return calculateRiskScore(pool);
  }, [pool]);
}

/**
 * Hook to calculate risk scores for multiple pools
 *
 * @param pools - Array of pools with market data
 * @returns Map of pool addresses to risk scores
 */
export function useMultipleRiskScores(
  pools: PoolWithMarketData[] | undefined
): Map<string, RiskScore> {
  return useMemo(() => {
    const scoresMap = new Map<string, RiskScore>();

    if (!pools || pools.length === 0) {
      return scoresMap;
    }

    for (const pool of pools) {
      const score = calculateRiskScore(pool);
      scoresMap.set(pool.address, score);
    }

    return scoresMap;
  }, [pools]);
}

/**
 * Get human-readable risk summary
 *
 * @param riskScore - Calculated risk score
 * @returns Summary string
 */
export function useRiskSummary(riskScore: RiskScore | null | undefined): string {
  return useMemo(() => {
    if (!riskScore) {
      return 'Risk assessment unavailable';
    }
    return getRiskSummary(riskScore);
  }, [riskScore]);
}

/**
 * Get CSS class for risk level styling
 *
 * @param level - Risk level
 * @returns Tailwind CSS class for text color
 */
export function getRiskLevelClass(level: RiskScore['level']): string {
  switch (level) {
    case 'low':
      return 'text-green-500';
    case 'medium':
      return 'text-yellow-500';
    case 'high':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

/**
 * Get CSS class for risk level background styling
 *
 * @param level - Risk level
 * @returns Tailwind CSS class for background color
 */
export function getRiskLevelBgClass(level: RiskScore['level']): string {
  switch (level) {
    case 'low':
      return 'bg-green-500/10';
    case 'medium':
      return 'bg-yellow-500/10';
    case 'high':
      return 'bg-red-500/10';
    default:
      return 'bg-gray-500/10';
  }
}

/**
 * Get icon representation for risk level
 *
 * @param level - Risk level
 * @returns Unicode shield or warning icon
 */
export function getRiskLevelIcon(level: RiskScore['level']): string {
  switch (level) {
    case 'low':
      return '\u2713'; // Checkmark
    case 'medium':
      return '\u26A0'; // Warning
    case 'high':
      return '\u2716'; // X mark
    default:
      return '\u2014'; // Em dash
  }
}

/**
 * Format risk score for display
 *
 * @param score - Numeric risk score (1-10)
 * @returns Formatted string with one decimal place
 */
export function formatRiskScore(score: number): string {
  return score.toFixed(1);
}

/**
 * Get progress bar width percentage for risk score visualization
 *
 * @param score - Risk score (1-10)
 * @returns Percentage string for width
 */
export function getRiskScoreWidth(score: number): string {
  return `${Math.min(100, Math.max(0, score * 10))}%`;
}
