// Achievement definitions for SwipeBook

import type { Achievement, Badge, UserProgress } from './types';

/**
 * Create a badge with current timestamp
 */
export function createBadge(id: string, name: string, icon: string): Badge {
  return {
    id,
    name,
    icon,
    earnedAt: new Date().toISOString(),
  };
}

/**
 * All available achievements in SwipeBook
 */
export const ACHIEVEMENTS: Achievement[] = [
  // Trading milestones
  {
    id: 'first_trade',
    name: 'First Steps',
    description: 'Complete your first trade',
    icon: '1',
    trigger: { type: 'trade_count', count: 1 },
    reward: { xp: 50 },
  },
  {
    id: 'day_trader',
    name: 'Day Trader',
    description: 'Complete 10 trades in a single day',
    icon: '10',
    trigger: { type: 'trade_count', count: 10 },
    reward: { xp: 100 },
  },
  {
    id: 'power_trader',
    name: 'Power Trader',
    description: 'Complete 100 trades',
    icon: '100',
    trigger: { type: 'trade_count', count: 100 },
    reward: {
      xp: 500,
      badge: {
        id: 'power_trader_badge',
        name: 'Power Trader',
        icon: 'bolt',
        earnedAt: '',
      },
    },
  },

  // Streak achievements
  {
    id: 'streak_week',
    name: 'Consistent Trader',
    description: 'Maintain a 7-day trading streak',
    icon: '7d',
    trigger: { type: 'streak_days', days: 7 },
    reward: {
      xp: 200,
      badge: {
        id: 'streak_week_badge',
        name: 'Week Warrior',
        icon: 'fire',
        earnedAt: '',
      },
    },
  },
  {
    id: 'streak_month',
    name: 'Monthly Master',
    description: 'Maintain a 30-day trading streak',
    icon: '30d',
    trigger: { type: 'streak_days', days: 30 },
    reward: {
      xp: 500,
      badge: {
        id: 'streak_month_badge',
        name: 'Monthly Master',
        icon: 'crown',
        earnedAt: '',
      },
    },
  },

  // Volume achievements
  {
    id: 'whale',
    name: 'Whale',
    description: 'Reach $10,000 total trading volume',
    icon: 'whale',
    trigger: { type: 'volume_total', amount: 10000 },
    reward: {
      xp: 500,
      badge: {
        id: 'whale_badge',
        name: 'Whale',
        icon: 'whale',
        earnedAt: '',
      },
    },
  },
  {
    id: 'mega_whale',
    name: 'Mega Whale',
    description: 'Reach $100,000 total trading volume',
    icon: 'mega-whale',
    trigger: { type: 'volume_total', amount: 100000 },
    reward: {
      xp: 2000,
      badge: {
        id: 'mega_whale_badge',
        name: 'Mega Whale',
        icon: 'diamond',
        earnedAt: '',
      },
    },
    hidden: true,
  },

  // Profit achievements
  {
    id: 'profit_streak_3',
    name: 'Hot Streak',
    description: 'Win 3 consecutive profitable trades',
    icon: 'streak',
    trigger: { type: 'profit_streak', count: 3 },
    reward: { xp: 100 },
  },
  {
    id: 'profit_streak_5',
    name: 'On Fire',
    description: 'Win 5 consecutive profitable trades',
    icon: 'fire',
    trigger: { type: 'profit_streak', count: 5 },
    reward: { xp: 250 },
  },
  {
    id: 'profit_streak_10',
    name: 'Unstoppable',
    description: 'Win 10 consecutive profitable trades',
    icon: 'rocket',
    trigger: { type: 'profit_streak', count: 10 },
    reward: {
      xp: 1000,
      badge: {
        id: 'unstoppable_badge',
        name: 'Unstoppable',
        icon: 'rocket',
        earnedAt: '',
      },
    },
    hidden: true,
  },

  // Win rate achievements
  {
    id: 'sharp_trader',
    name: 'Sharp Trader',
    description: 'Maintain 60% win rate over 20+ trades',
    icon: 'target',
    trigger: { type: 'win_rate', rate: 0.6, minTrades: 20 },
    reward: { xp: 300 },
  },
  {
    id: 'expert_trader',
    name: 'Expert Trader',
    description: 'Maintain 70% win rate over 50+ trades',
    icon: 'star',
    trigger: { type: 'win_rate', rate: 0.7, minTrades: 50 },
    reward: {
      xp: 750,
      badge: {
        id: 'expert_badge',
        name: 'Expert Trader',
        icon: 'star',
        earnedAt: '',
      },
    },
  },

  // Diamond hands (holding achievement - placeholder for future implementation)
  {
    id: 'diamond_hands',
    name: 'Diamond Hands',
    description: 'Hold a position for 30 days',
    icon: 'diamond',
    trigger: { type: 'streak_days', days: 30 }, // Using streak_days as placeholder
    reward: {
      xp: 300,
      badge: {
        id: 'diamond_hands_badge',
        name: 'Diamond Hands',
        icon: 'gem',
        earnedAt: '',
      },
    },
  },
];

/**
 * Check if an achievement trigger is met based on user progress
 */
export function checkAchievementTrigger(
  achievement: Achievement,
  progress: UserProgress,
  additionalContext?: {
    tradesInDay?: number;
    currentProfitStreak?: number;
  }
): boolean {
  const { trigger } = achievement;
  const { stats, streak } = progress;

  switch (trigger.type) {
    case 'trade_count':
      return stats.totalTrades >= trigger.count;

    case 'streak_days':
      return streak.current >= trigger.days || streak.longest >= trigger.days;

    case 'profit_streak':
      const profitStreak = additionalContext?.currentProfitStreak ?? 0;
      return profitStreak >= trigger.count;

    case 'volume_total':
      return stats.totalVolume >= trigger.amount;

    case 'win_rate':
      return (
        stats.totalTrades >= trigger.minTrades &&
        stats.winRate >= trigger.rate
      );

    default:
      return false;
  }
}

/**
 * Get all unlocked achievements for a user
 */
export function getUnlockedAchievements(
  progress: UserProgress,
  earnedAchievementIds: string[],
  additionalContext?: {
    tradesInDay?: number;
    currentProfitStreak?: number;
  }
): Achievement[] {
  return ACHIEVEMENTS.filter((achievement) => {
    // Skip already earned achievements
    if (earnedAchievementIds.includes(achievement.id)) {
      return false;
    }

    return checkAchievementTrigger(achievement, progress, additionalContext);
  });
}

/**
 * Get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/**
 * Get all visible (non-hidden) achievements
 */
export function getVisibleAchievements(): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !a.hidden);
}
