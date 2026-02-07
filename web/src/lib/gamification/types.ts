// Gamification types for SwipeBook

export interface UserProgress {
  level: number;          // 1-100
  xp: number;
  xpToNextLevel: number;
  totalXp: number;
  streak: StreakData;
  badges: Badge[];
  rank: UserRank;
  stats: UserStats;
}

export interface StreakData {
  current: number;
  longest: number;
  multiplier: number;    // 1.0 - 2.0
  lastActivity: string;  // ISO date
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  earnedAt: string;
}

export type UserRank = 'Novice' | 'Trader' | 'Expert' | 'Master' | 'Legend';

export interface UserStats {
  totalTrades: number;
  profitableTrades: number;
  totalVolume: number;
  winRate: number;
}

export interface MarginStats {
  marginTrades: number;
  profitableMarginTrades: number;
  marginWinStreak: number;
  bestMarginWinStreak: number;
  profitable5xTrades: number;
  profitable15sTrades: number;
  bestTradePnL: number;
  totalMarginVolume: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  trigger: AchievementTrigger;
  reward: { xp: number; badge?: Badge };
  hidden?: boolean;
}

export type AchievementTrigger =
  | { type: 'trade_count'; count: number }
  | { type: 'streak_days'; days: number }
  | { type: 'profit_streak'; count: number }
  | { type: 'volume_total'; amount: number }
  | { type: 'win_rate'; rate: number; minTrades: number }
  | { type: 'margin_trades'; count: number }
  | { type: 'margin_streak'; count: number }
  | { type: 'margin_pnl'; amount: number };

export interface XPAwardResult {
  xpAwarded: number;
  levelUp: boolean;
  newLevel?: number;
  previousLevel?: number;
}
