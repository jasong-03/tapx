// XP calculation and leveling system for SwipeBook

import type { UserRank } from './types';

/**
 * XP table for levels 1-100 using an exponential curve
 * Formula: XP needed = base * (level ^ exponent)
 * This creates a progressively harder leveling experience
 */
const BASE_XP = 100;
const EXPONENT = 1.5;

// Pre-calculate XP thresholds for each level (1-100)
export const XP_TABLE: number[] = Array.from({ length: 101 }, (_, level) => {
  if (level === 0) return 0;
  return Math.floor(BASE_XP * Math.pow(level, EXPONENT));
});

// Calculate cumulative XP needed to reach each level
export const CUMULATIVE_XP_TABLE: number[] = XP_TABLE.reduce((acc, xp, index) => {
  if (index === 0) {
    acc.push(0);
  } else {
    acc.push(acc[index - 1] + xp);
  }
  return acc;
}, [] as number[]);

/**
 * Calculate level information from total XP
 */
export function calculateLevel(totalXp: number): {
  level: number;
  xp: number;
  xpToNextLevel: number
} {
  // Find the highest level the user has reached
  let level = 1;
  for (let i = 1; i <= 100; i++) {
    if (totalXp >= CUMULATIVE_XP_TABLE[i]) {
      level = i;
    } else {
      break;
    }
  }

  // Cap at level 100
  if (level >= 100) {
    return {
      level: 100,
      xp: totalXp - CUMULATIVE_XP_TABLE[100],
      xpToNextLevel: 0, // Max level reached
    };
  }

  // Calculate current XP within the level and XP needed for next level
  const xpAtCurrentLevel = totalXp - CUMULATIVE_XP_TABLE[level];
  const xpForNextLevel = XP_TABLE[level + 1];

  return {
    level,
    xp: xpAtCurrentLevel,
    xpToNextLevel: xpForNextLevel - xpAtCurrentLevel,
  };
}

/**
 * Get streak multiplier based on consecutive days
 * Multiplier ranges from 1.0 (no streak) to 2.0 (30+ day streak)
 */
export function getStreakMultiplier(days: number): number {
  if (days <= 0) return 1.0;
  if (days >= 30) return 2.0;

  // Linear interpolation from 1.0 to 2.0 over 30 days
  // Day 1 = 1.0, Day 30 = 2.0
  return 1.0 + (days / 30);
}

/**
 * Get user rank based on level
 */
export function getRank(level: number): UserRank {
  if (level < 10) return 'Novice';
  if (level < 25) return 'Trader';
  if (level < 50) return 'Expert';
  if (level < 75) return 'Master';
  return 'Legend';
}

/**
 * Get XP required to reach a specific level from 0
 */
export function getXpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level > 100) return CUMULATIVE_XP_TABLE[100];
  return CUMULATIVE_XP_TABLE[level];
}

/**
 * Calculate progress percentage within current level
 */
export function getLevelProgress(totalXp: number): number {
  const { level, xp } = calculateLevel(totalXp);

  if (level >= 100) return 100;

  const xpForCurrentLevel = XP_TABLE[level + 1];
  return Math.min(100, (xp / xpForCurrentLevel) * 100);
}
