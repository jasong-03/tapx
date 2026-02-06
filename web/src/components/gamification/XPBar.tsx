"use client"

import { cn } from '@/lib/utils';
import type { UserProgress, UserRank } from '@/lib/gamification/types';
import { getLevelProgress } from '@/lib/gamification/xp';

interface XPBarProps {
  progress: UserProgress | null;
  compact?: boolean;
  className?: string;
}

/**
 * Get color classes for user rank
 */
function getRankColor(rank: UserRank): { bg: string; text: string; border: string } {
  switch (rank) {
    case 'Novice':
      return { bg: 'bg-slate-500', text: 'text-slate-300', border: 'border-slate-500' };
    case 'Trader':
      return { bg: 'bg-blue-500', text: 'text-blue-300', border: 'border-blue-500' };
    case 'Expert':
      return { bg: 'bg-purple-500', text: 'text-purple-300', border: 'border-purple-500' };
    case 'Master':
      return { bg: 'bg-orange-500', text: 'text-orange-300', border: 'border-orange-500' };
    case 'Legend':
      return { bg: 'bg-yellow-500', text: 'text-yellow-300', border: 'border-yellow-500' };
    default:
      return { bg: 'bg-slate-500', text: 'text-slate-300', border: 'border-slate-500' };
  }
}

/**
 * Get gradient color for XP bar based on rank
 */
function getRankGradient(rank: UserRank): string {
  switch (rank) {
    case 'Novice':
      return 'from-slate-600 to-slate-400';
    case 'Trader':
      return 'from-blue-600 to-blue-400';
    case 'Expert':
      return 'from-purple-600 to-purple-400';
    case 'Master':
      return 'from-orange-600 to-orange-400';
    case 'Legend':
      return 'from-yellow-600 via-amber-400 to-yellow-300';
    default:
      return 'from-slate-600 to-slate-400';
  }
}

export function XPBar({ progress, compact = false, className }: XPBarProps) {
  if (!progress) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="h-6 bg-slate-700 rounded-full" />
      </div>
    );
  }

  const levelProgress = getLevelProgress(progress.totalXp);
  const rankColors = getRankColor(progress.rank);
  const rankGradient = getRankGradient(progress.rank);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {/* Level Badge */}
        <div
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold",
            "bg-gradient-to-br",
            rankGradient
          )}
        >
          {progress.level}
        </div>

        {/* XP Bar */}
        <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r transition-all duration-500",
              rankGradient
            )}
            style={{ width: `${levelProgress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header with Level and Rank */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Level Badge */}
          <div
            className={cn(
              "flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold",
              "bg-gradient-to-br shadow-lg",
              rankGradient
            )}
          >
            {progress.level}
          </div>

          {/* Rank and XP Info */}
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-semibold", rankColors.text)}>
                {progress.rank}
              </span>
              {progress.streak.current > 0 && (
                <span className="text-xs text-orange-400">
                  {progress.streak.multiplier.toFixed(1)}x
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Level {progress.level}
            </p>
          </div>
        </div>

        {/* XP Counter */}
        <div className="text-right">
          <p className="text-sm font-medium text-white">
            {progress.xp.toLocaleString()} XP
          </p>
          <p className="text-xs text-slate-400">
            {progress.xpToNextLevel > 0
              ? `${progress.xpToNextLevel.toLocaleString()} to next`
              : 'Max Level'
            }
          </p>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
        {/* Background pattern for max level */}
        {progress.level >= 100 && (
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 animate-pulse" />
        )}

        {/* Progress fill */}
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-out",
            rankGradient,
            progress.level >= 100 && "animate-pulse"
          )}
          style={{ width: `${progress.level >= 100 ? 100 : levelProgress}%` }}
        />

        {/* Shine effect */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ width: `${levelProgress}%` }}
        />
      </div>

      {/* Total XP */}
      <div className="flex justify-between text-xs text-slate-500">
        <span>Total: {progress.totalXp.toLocaleString()} XP</span>
        <span>{Math.round(levelProgress)}% to Level {Math.min(progress.level + 1, 100)}</span>
      </div>
    </div>
  );
}
