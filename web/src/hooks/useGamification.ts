"use client"

import { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import type { UserProgress, Achievement, XPAwardResult, Badge } from '@/lib/gamification/types';
import { calculateLevel, getRank, getStreakMultiplier } from '@/lib/gamification/xp';
import { getUnlockedAchievements } from '@/lib/gamification/achievements';
import {
  loadProgress,
  saveProgress,
  createInitialProgress,
  isNewDay,
  isStreakValid,
  getEarnedAchievementIds,
  saveEarnedAchievement,
} from '@/lib/gamification/storage';

interface UseGamificationReturn {
  progress: UserProgress | null;
  isLoading: boolean;
  awardXP: (amount: number, reason?: string) => XPAwardResult;
  updateStreak: () => void;
  checkAchievements: (additionalContext?: { tradesInDay?: number; currentProfitStreak?: number }) => Achievement[];
  updateStats: (update: Partial<{
    totalTrades: number;
    profitableTrades: number;
    totalVolume: number;
  }>) => void;
  addBadge: (badge: Badge) => void;
  resetProgress: () => void;
}

export function useGamification(): UseGamificationReturn {
  const currentAccount = useCurrentAccount();
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [earnedAchievementIds, setEarnedAchievementIds] = useState<string[]>([]);

  const address = currentAccount?.address;

  // Load progress when address changes
  useEffect(() => {
    if (!address) {
      setProgress(null);
      setEarnedAchievementIds([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Load or create progress
    let loadedProgress = loadProgress(address);

    if (!loadedProgress) {
      loadedProgress = createInitialProgress();
      saveProgress(address, loadedProgress);
    }

    // Load earned achievements
    const earned = getEarnedAchievementIds(address);
    setEarnedAchievementIds(earned);

    // Check and update streak
    if (loadedProgress.streak.lastActivity) {
      if (!isStreakValid(loadedProgress.streak.lastActivity)) {
        // Reset streak if more than a day has passed
        loadedProgress = {
          ...loadedProgress,
          streak: {
            ...loadedProgress.streak,
            current: 0,
            multiplier: 1.0,
          },
        };
        saveProgress(address, loadedProgress);
      }
    }

    setProgress(loadedProgress);
    setIsLoading(false);
  }, [address]);

  // Award XP to the user
  const awardXP = useCallback((amount: number, reason?: string): XPAwardResult => {
    if (!progress || !address) {
      return { xpAwarded: 0, levelUp: false };
    }

    // Apply streak multiplier
    const multipliedAmount = Math.floor(amount * progress.streak.multiplier);

    const previousLevel = progress.level;
    const newTotalXp = progress.totalXp + multipliedAmount;
    const levelInfo = calculateLevel(newTotalXp);
    const newRank = getRank(levelInfo.level);

    const newProgress: UserProgress = {
      ...progress,
      level: levelInfo.level,
      xp: levelInfo.xp,
      xpToNextLevel: levelInfo.xpToNextLevel,
      totalXp: newTotalXp,
      rank: newRank,
    };

    setProgress(newProgress);
    saveProgress(address, newProgress);

    const levelUp = levelInfo.level > previousLevel;

    if (reason) {
      console.log(`[Gamification] Awarded ${multipliedAmount} XP for: ${reason}`);
    }

    return {
      xpAwarded: multipliedAmount,
      levelUp,
      newLevel: levelUp ? levelInfo.level : undefined,
      previousLevel: levelUp ? previousLevel : undefined,
    };
  }, [progress, address]);

  // Update streak (call when user performs an action)
  const updateStreak = useCallback(() => {
    if (!progress || !address) return;

    const now = new Date().toISOString();
    const lastActivity = progress.streak.lastActivity;

    // Only increment streak if it's a new day
    if (isNewDay(lastActivity)) {
      const isValid = isStreakValid(lastActivity);
      const newCurrent = isValid ? progress.streak.current + 1 : 1;
      const newLongest = Math.max(progress.streak.longest, newCurrent);
      const newMultiplier = getStreakMultiplier(newCurrent);

      const newProgress: UserProgress = {
        ...progress,
        streak: {
          current: newCurrent,
          longest: newLongest,
          multiplier: newMultiplier,
          lastActivity: now,
        },
      };

      setProgress(newProgress);
      saveProgress(address, newProgress);

      console.log(`[Gamification] Streak updated: ${newCurrent} days (${newMultiplier.toFixed(2)}x multiplier)`);
    } else {
      // Just update last activity time
      const newProgress: UserProgress = {
        ...progress,
        streak: {
          ...progress.streak,
          lastActivity: now,
        },
      };

      setProgress(newProgress);
      saveProgress(address, newProgress);
    }
  }, [progress, address]);

  // Check for newly unlocked achievements
  const checkAchievements = useCallback((
    additionalContext?: { tradesInDay?: number; currentProfitStreak?: number }
  ): Achievement[] => {
    if (!progress || !address) return [];

    const newlyUnlocked = getUnlockedAchievements(
      progress,
      earnedAchievementIds,
      additionalContext
    );

    if (newlyUnlocked.length > 0) {
      // Mark achievements as earned and award XP
      const updatedEarnedIds = [...earnedAchievementIds];
      let totalXpAwarded = 0;
      const newBadges: Badge[] = [];

      newlyUnlocked.forEach((achievement) => {
        updatedEarnedIds.push(achievement.id);
        saveEarnedAchievement(address, achievement.id);
        totalXpAwarded += achievement.reward.xp;

        if (achievement.reward.badge) {
          const badge: Badge = {
            ...achievement.reward.badge,
            earnedAt: new Date().toISOString(),
          };
          newBadges.push(badge);
        }

        console.log(`[Gamification] Achievement unlocked: ${achievement.name} (+${achievement.reward.xp} XP)`);
      });

      setEarnedAchievementIds(updatedEarnedIds);

      // Award XP for all achievements
      if (totalXpAwarded > 0) {
        // Calculate new progress with XP and badges
        const newTotalXp = progress.totalXp + totalXpAwarded;
        const levelInfo = calculateLevel(newTotalXp);
        const newRank = getRank(levelInfo.level);

        const newProgress: UserProgress = {
          ...progress,
          level: levelInfo.level,
          xp: levelInfo.xp,
          xpToNextLevel: levelInfo.xpToNextLevel,
          totalXp: newTotalXp,
          rank: newRank,
          badges: [...progress.badges, ...newBadges],
        };

        setProgress(newProgress);
        saveProgress(address, newProgress);
      }
    }

    return newlyUnlocked;
  }, [progress, address, earnedAchievementIds]);

  // Update user stats
  const updateStats = useCallback((update: Partial<{
    totalTrades: number;
    profitableTrades: number;
    totalVolume: number;
  }>) => {
    if (!progress || !address) return;

    const newStats = {
      ...progress.stats,
      ...update,
    };

    // Recalculate win rate
    if (newStats.totalTrades > 0) {
      newStats.winRate = newStats.profitableTrades / newStats.totalTrades;
    }

    const newProgress: UserProgress = {
      ...progress,
      stats: newStats,
    };

    setProgress(newProgress);
    saveProgress(address, newProgress);
  }, [progress, address]);

  // Add a badge manually
  const addBadge = useCallback((badge: Badge) => {
    if (!progress || !address) return;

    // Check if badge already exists
    if (progress.badges.some(b => b.id === badge.id)) return;

    const newProgress: UserProgress = {
      ...progress,
      badges: [...progress.badges, badge],
    };

    setProgress(newProgress);
    saveProgress(address, newProgress);
  }, [progress, address]);

  // Reset progress (for testing or user request)
  const resetProgress = useCallback(() => {
    if (!address) return;

    const initialProgress = createInitialProgress();
    setProgress(initialProgress);
    setEarnedAchievementIds([]);
    saveProgress(address, initialProgress);

    console.log('[Gamification] Progress reset');
  }, [address]);

  return {
    progress,
    isLoading,
    awardXP,
    updateStreak,
    checkAchievements,
    updateStats,
    addBadge,
    resetProgress,
  };
}
