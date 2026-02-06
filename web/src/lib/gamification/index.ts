// Gamification system exports

// Types
export type {
  UserProgress,
  StreakData,
  Badge,
  UserRank,
  UserStats,
  Achievement,
  AchievementTrigger,
  XPAwardResult,
} from './types';

// XP and leveling utilities
export {
  XP_TABLE,
  CUMULATIVE_XP_TABLE,
  calculateLevel,
  getStreakMultiplier,
  getRank,
  getXpForLevel,
  getLevelProgress,
} from './xp';

// Achievements
export {
  ACHIEVEMENTS,
  checkAchievementTrigger,
  getUnlockedAchievements,
  getAchievementById,
  getVisibleAchievements,
} from './achievements';

// Storage
export {
  STORAGE_KEY,
  loadProgress,
  saveProgress,
  createInitialProgress,
  isNewDay,
  isStreakValid,
  clearProgress,
  getEarnedAchievementIds,
  saveEarnedAchievement,
} from './storage';
