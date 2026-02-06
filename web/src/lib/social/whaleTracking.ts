/**
 * Mock whale activity tracking
 *
 * In production, this would integrate with on-chain analytics
 * to track large holder behavior.
 */

import type { WhaleActivity } from './types';

/**
 * Whale activity thresholds
 */
const WHALE_THRESHOLDS = {
  /** Minimum volume to consider activity significant */
  MIN_VOLUME: 10000,
  /** Net flow threshold for accumulation/distribution classification */
  NET_FLOW_THRESHOLD: 0.1, // 10% of volume
};

/**
 * Mock whale data for common tokens
 */
const MOCK_WHALE_DATA: Record<string, Omit<WhaleActivity, 'lastUpdate'>> = {
  SUI: {
    type: 'accumulating',
    volume24h: 2500000,
    netFlow: 450000,
  },
  DEEP: {
    type: 'distributing',
    volume24h: 850000,
    netFlow: -120000,
  },
  WAL: {
    type: 'none',
    volume24h: 125000,
    netFlow: 5000,
  },
  USDC: {
    type: 'none',
    volume24h: 5000000,
    netFlow: 50000,
  },
  USDT: {
    type: 'none',
    volume24h: 3500000,
    netFlow: -25000,
  },
  WETH: {
    type: 'accumulating',
    volume24h: 1200000,
    netFlow: 180000,
  },
  WBTC: {
    type: 'accumulating',
    volume24h: 3800000,
    netFlow: 520000,
  },
};

/**
 * Classify whale activity based on net flow and volume
 */
export function classifyWhaleActivity(
  netFlow: number,
  volume: number
): 'accumulating' | 'distributing' | 'none' {
  // Volume must be significant
  if (volume < WHALE_THRESHOLDS.MIN_VOLUME) {
    return 'none';
  }

  // Calculate net flow as percentage of volume
  const netFlowPercent = Math.abs(netFlow) / volume;

  if (netFlowPercent < WHALE_THRESHOLDS.NET_FLOW_THRESHOLD) {
    return 'none';
  }

  return netFlow > 0 ? 'accumulating' : 'distributing';
}

/**
 * Generate mock whale activity for unknown tokens
 */
function generateMockWhaleActivity(tokenSymbol: string): Omit<WhaleActivity, 'lastUpdate'> {
  // Use token symbol as seed for consistent mock data
  const seed = tokenSymbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Random volume between 50k and 2M
  const volume24h = 50000 + (seed * 17 % 1950000);

  // Random net flow between -30% and +30% of volume
  const netFlowPercent = ((seed * 31 % 60) - 30) / 100;
  const netFlow = Math.round(volume24h * netFlowPercent);

  return {
    type: classifyWhaleActivity(netFlow, volume24h),
    volume24h,
    netFlow,
  };
}

/**
 * Get whale activity for a token
 *
 * @param tokenSymbol - The token symbol (e.g., "SUI", "DEEP")
 * @returns Promise resolving to whale activity data
 */
export async function getWhaleActivity(tokenSymbol: string): Promise<WhaleActivity> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  const upperSymbol = tokenSymbol.toUpperCase();
  const mockData = MOCK_WHALE_DATA[upperSymbol] || generateMockWhaleActivity(upperSymbol);

  return {
    ...mockData,
    lastUpdate: Date.now(),
  };
}

/**
 * Format whale volume for display
 */
export function formatWhaleVolume(volume: number): string {
  if (volume >= 1000000) {
    return `$${(volume / 1000000).toFixed(2)}M`;
  }
  if (volume >= 1000) {
    return `$${(volume / 1000).toFixed(1)}K`;
  }
  return `$${volume.toFixed(0)}`;
}

/**
 * Get whale activity label for display
 */
export function getWhaleActivityLabel(type: WhaleActivity['type']): string {
  switch (type) {
    case 'accumulating':
      return 'Whales Accumulating';
    case 'distributing':
      return 'Whales Distributing';
    case 'none':
      return 'No Whale Activity';
  }
}

/**
 * Get whale activity color for styling
 */
export function getWhaleActivityColor(type: WhaleActivity['type']): {
  text: string;
  bg: string;
  border: string;
} {
  switch (type) {
    case 'accumulating':
      return {
        text: 'text-blue-400',
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/30',
      };
    case 'distributing':
      return {
        text: 'text-orange-400',
        bg: 'bg-orange-500/20',
        border: 'border-orange-500/30',
      };
    case 'none':
      return {
        text: 'text-slate-400',
        bg: 'bg-slate-500/20',
        border: 'border-slate-500/30',
      };
  }
}
