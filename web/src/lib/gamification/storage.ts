// Local storage utilities for gamification data persistence

import type { UserProgress, StreakData, UserStats } from './types';
import { calculateLevel, getRank, getStreakMultiplier } from './xp';

export const STORAGE_KEY = 'swipebook_gamification';

/**
 * Get storage key for a specific wallet address
 */
function getStorageKey(address: string): string {
  return `${STORAGE_KEY}_${address}`;
}

/**
 * Load user progress from localStorage
 */
export function loadProgress(address: string): UserProgress | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const key = getStorageKey(address);
    const stored = localStorage.getItem(key);

    if (!stored) {
      return null;
    }

    const data = JSON.parse(stored);

    // Validate required fields
    if (
      typeof data.totalXp !== 'number' ||
      !data.streak ||
      !Array.isArray(data.badges) ||
      !data.stats
    ) {
      return null;
    }

    // Recalculate derived fields to ensure consistency
    const levelInfo = calculateLevel(data.totalXp);
    const rank = getRank(levelInfo.level);

    return {
      ...data,
      level: levelInfo.level,
      xp: levelInfo.xp,
      xpToNextLevel: levelInfo.xpToNextLevel,
      rank,
      streak: {
        ...data.streak,
        multiplier: getStreakMultiplier(data.streak.current),
      },
    };
  } catch (error) {
    console.error('Error loading gamification progress:', error);
    return null;
  }
}

/**
 * Save user progress to localStorage
 */
export function saveProgress(address: string, progress: UserProgress): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = getStorageKey(address);

    // Store minimal data, derived fields are recalculated on load
    const dataToStore = {
      totalXp: progress.totalXp,
      streak: progress.streak,
      badges: progress.badges,
      stats: progress.stats,
      earnedAchievements: (progress as { earnedAchievements?: string[] }).earnedAchievements || [],
    };

    localStorage.setItem(key, JSON.stringify(dataToStore));
  } catch (error) {
    console.error('Error saving gamification progress:', error);
  }
}

/**
 * Create initial progress for a new user
 */
export function createInitialProgress(): UserProgress {
  const initialStreak: StreakData = {
    current: 0,
    longest: 0,
    multiplier: 1.0,
    lastActivity: '',
  };

  const initialStats: UserStats = {
    totalTrades: 0,
    profitableTrades: 0,
    totalVolume: 0,
    winRate: 0,
  };

  const levelInfo = calculateLevel(0);

  return {
    level: levelInfo.level,
    xp: levelInfo.xp,
    xpToNextLevel: levelInfo.xpToNextLevel,
    totalXp: 0,
    streak: initialStreak,
    badges: [],
    rank: 'Novice',
    stats: initialStats,
  };
}

/**
 * Check if today is a new day compared to last activity
 */
export function isNewDay(lastActivity: string): boolean {
  if (!lastActivity) return true;

  const lastDate = new Date(lastActivity);
  const today = new Date();

  // Compare dates (ignoring time)
  return (
    lastDate.getFullYear() !== today.getFullYear() ||
    lastDate.getMonth() !== today.getMonth() ||
    lastDate.getDate() !== today.getDate()
  );
}

/**
 * Check if streak should be maintained or reset
 * Returns true if streak is still valid (activity within 1 day)
 */
export function isStreakValid(lastActivity: string): boolean {
  if (!lastActivity) return false;

  const lastDate = new Date(lastActivity);
  const today = new Date();

  // Reset to start of day for accurate comparison
  lastDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - lastDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  // Streak is valid if last activity was yesterday or today
  return diffDays <= 1;
}

/**
 * Clear all gamification data for a user
 */
export function clearProgress(address: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = getStorageKey(address);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error clearing gamification progress:', error);
  }
}

/**
 * Get earned achievement IDs from stored progress
 */
export function getEarnedAchievementIds(address: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const key = getStorageKey(address);
    const stored = localStorage.getItem(key);

    if (!stored) {
      return [];
    }

    const data = JSON.parse(stored);
    return data.earnedAchievements || [];
  } catch (error) {
    console.error('Error loading earned achievements:', error);
    return [];
  }
}

/**
 * Add an earned achievement to storage
 */
export function saveEarnedAchievement(address: string, achievementId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = getStorageKey(address);
    const stored = localStorage.getItem(key);

    if (!stored) {
      return;
    }

    const data = JSON.parse(stored);
    const earnedAchievements = data.earnedAchievements || [];

    if (!earnedAchievements.includes(achievementId)) {
      earnedAchievements.push(achievementId);
      data.earnedAchievements = earnedAchievements;
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (error) {
    console.error('Error saving earned achievement:', error);
  }
}

// ---- Round history persistence for margin trades ----

const ROUND_HISTORY_KEY = 'tapx_margin_rounds';

export function loadRoundHistory(address: string): unknown[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = `${ROUND_HISTORY_KEY}_${address}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveRoundHistory(address: string, rounds: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${ROUND_HISTORY_KEY}_${address}`;
    localStorage.setItem(key, JSON.stringify(rounds.slice(0, 50)));
  } catch {
    console.error('Failed to save round history');
  }
}
