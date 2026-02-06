/**
 * LocalStorage-based swipe consensus tracking for MVP
 *
 * In production, this would be replaced with a backend service
 * that aggregates swipes from all users.
 */

import type { SwipeConsensus, StoredSwipe, ConsensusStorage } from './types';

export const CONSENSUS_KEY = 'swipebook_consensus';

/**
 * Maximum age of a swipe to be included in consensus (24 hours)
 */
const SWIPE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Get user ID for tracking (uses a simple fingerprint)
 */
function getUserId(): string {
  if (typeof window === 'undefined') return 'server';

  let userId = localStorage.getItem('swipebook_user_id');
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('swipebook_user_id', userId);
  }
  return userId;
}

/**
 * Load consensus data from localStorage
 */
function loadConsensusData(): ConsensusStorage {
  if (typeof window === 'undefined') {
    return { swipes: [], lastUpdated: 0 };
  }

  try {
    const stored = localStorage.getItem(CONSENSUS_KEY);
    if (!stored) {
      return { swipes: [], lastUpdated: 0 };
    }

    const data = JSON.parse(stored) as ConsensusStorage;

    // Filter out old swipes
    const now = Date.now();
    data.swipes = data.swipes.filter(
      (swipe) => now - swipe.timestamp < SWIPE_MAX_AGE_MS
    );

    return data;
  } catch (error) {
    console.error('Error loading consensus data:', error);
    return { swipes: [], lastUpdated: 0 };
  }
}

/**
 * Save consensus data to localStorage
 */
function saveConsensusData(data: ConsensusStorage): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(CONSENSUS_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving consensus data:', error);
  }
}

/**
 * Generate mock community swipes for a pool
 * This simulates what other users might have swiped
 */
function generateMockSwipes(poolAddress: string): StoredSwipe[] {
  // Use pool address as seed for consistent mock data
  const seed = poolAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const mockCount = 10 + (seed % 40); // 10-50 mock swipes

  const now = Date.now();
  const swipes: StoredSwipe[] = [];

  // Bias based on seed (some pools more bullish, some bearish)
  const bullishBias = 0.3 + ((seed % 40) / 100); // 0.3-0.7 bullish probability

  for (let i = 0; i < mockCount; i++) {
    const isBullish = Math.random() < bullishBias;
    swipes.push({
      poolAddress,
      direction: isBullish ? 'bullish' : 'bearish',
      timestamp: now - Math.random() * SWIPE_MAX_AGE_MS,
    });
  }

  return swipes;
}

/**
 * Record a user's swipe for a pool
 */
export function recordSwipe(
  poolAddress: string,
  direction: 'bullish' | 'bearish'
): void {
  if (typeof window === 'undefined') return;

  const data = loadConsensusData();
  const userId = getUserId();

  // Create a unique key for this user's swipe on this pool
  const userSwipeKey = `${CONSENSUS_KEY}_user_${userId}_${poolAddress}`;

  // Check if user already swiped on this pool
  const existingSwipeStr = localStorage.getItem(userSwipeKey);

  if (existingSwipeStr) {
    // Update existing swipe
    const existingSwipe = JSON.parse(existingSwipeStr);
    const swipeIndex = data.swipes.findIndex(
      (s) => s.poolAddress === poolAddress && s.timestamp === existingSwipe.timestamp
    );

    if (swipeIndex !== -1) {
      data.swipes[swipeIndex].direction = direction;
      data.swipes[swipeIndex].timestamp = Date.now();
    }
  } else {
    // Add new swipe
    const newSwipe: StoredSwipe = {
      poolAddress,
      direction,
      timestamp: Date.now(),
    };

    data.swipes.push(newSwipe);
    localStorage.setItem(userSwipeKey, JSON.stringify(newSwipe));
  }

  data.lastUpdated = Date.now();
  saveConsensusData(data);
}

/**
 * Get the consensus for a specific pool
 */
export function getConsensus(poolAddress: string): SwipeConsensus {
  if (typeof window === 'undefined') {
    return { bullish: 50, bearish: 50, total: 0 };
  }

  const data = loadConsensusData();
  const userId = getUserId();

  // Get user's swipe for this pool
  const userSwipeKey = `${CONSENSUS_KEY}_user_${userId}_${poolAddress}`;
  const userSwipeStr = localStorage.getItem(userSwipeKey);
  let userSwipe: 'bullish' | 'bearish' | undefined;

  if (userSwipeStr) {
    try {
      const parsed = JSON.parse(userSwipeStr);
      userSwipe = parsed.direction;
    } catch {
      // Ignore parse errors
    }
  }

  // Filter swipes for this pool
  let poolSwipes = data.swipes.filter((s) => s.poolAddress === poolAddress);

  // If no swipes, generate mock data for demonstration
  if (poolSwipes.length === 0) {
    poolSwipes = generateMockSwipes(poolAddress);
    // Don't save mock swipes, just use them for display
  }

  const total = poolSwipes.length;
  if (total === 0) {
    return { bullish: 50, bearish: 50, total: 0, userSwipe };
  }

  const bullishCount = poolSwipes.filter((s) => s.direction === 'bullish').length;

  const bullish = Math.round((bullishCount / total) * 100);
  const bearish = 100 - bullish;

  return {
    bullish,
    bearish,
    total,
    userSwipe,
  };
}

/**
 * Get consensus strength classification
 */
export function getConsensusStrength(consensus: SwipeConsensus): 'strong' | 'moderate' | 'neutral' {
  const dominant = Math.max(consensus.bullish, consensus.bearish);

  if (dominant >= 70) return 'strong';
  if (dominant >= 55) return 'moderate';
  return 'neutral';
}

/**
 * Get dominant direction from consensus
 */
export function getDominantDirection(consensus: SwipeConsensus): 'bullish' | 'bearish' | 'neutral' {
  if (consensus.bullish > 55) return 'bullish';
  if (consensus.bearish > 55) return 'bearish';
  return 'neutral';
}

/**
 * Clear all consensus data (for testing)
 */
export function clearConsensusData(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(CONSENSUS_KEY);

    // Clear all user swipe keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${CONSENSUS_KEY}_user_`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Error clearing consensus data:', error);
  }
}
