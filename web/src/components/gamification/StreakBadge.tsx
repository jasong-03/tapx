"use client"

import { cn } from '@/lib/utils';
import { getStreakMultiplier } from '@/lib/gamification/xp';

interface StreakBadgeProps {
  streak: number;
  showMultiplier?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Get fire intensity based on streak length
 */
function getFireIntensity(streak: number): {
  icon: string;
  color: string;
  glow: string;
} {
  if (streak === 0) {
    return {
      icon: 'Streak',
      color: 'text-slate-400',
      glow: '',
    };
  }

  if (streak < 3) {
    return {
      icon: 'Fire',
      color: 'text-orange-400',
      glow: '',
    };
  }

  if (streak < 7) {
    return {
      icon: 'Fire',
      color: 'text-orange-500',
      glow: 'shadow-orange-500/30',
    };
  }

  if (streak < 14) {
    return {
      icon: 'Fire',
      color: 'text-red-500',
      glow: 'shadow-red-500/40',
    };
  }

  if (streak < 30) {
    return {
      icon: 'Fire',
      color: 'text-red-400',
      glow: 'shadow-red-400/50',
    };
  }

  // 30+ day streak
  return {
    icon: 'Fire',
    color: 'text-yellow-400',
    glow: 'shadow-yellow-400/60 animate-pulse',
  };
}

/**
 * Get size classes
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg'): {
  container: string;
  icon: string;
  text: string;
  multiplier: string;
} {
  switch (size) {
    case 'sm':
      return {
        container: 'px-2 py-1 gap-1',
        icon: 'text-sm',
        text: 'text-xs',
        multiplier: 'text-[10px]',
      };
    case 'md':
      return {
        container: 'px-3 py-1.5 gap-1.5',
        icon: 'text-base',
        text: 'text-sm',
        multiplier: 'text-xs',
      };
    case 'lg':
      return {
        container: 'px-4 py-2 gap-2',
        icon: 'text-xl',
        text: 'text-base',
        multiplier: 'text-sm',
      };
  }
}

export function StreakBadge({
  streak,
  showMultiplier = true,
  size = 'md',
  className,
}: StreakBadgeProps) {
  const { color, glow } = getFireIntensity(streak);
  const sizeClasses = getSizeClasses(size);
  const multiplier = getStreakMultiplier(streak);

  if (streak === 0) {
    return (
      <div
        className={cn(
          "flex items-center rounded-full bg-slate-800/50 border border-slate-700",
          sizeClasses.container,
          className
        )}
      >
        <span className={cn(sizeClasses.icon, "text-slate-500")}>--</span>
        <span className={cn(sizeClasses.text, "text-slate-500 font-medium")}>
          No streak
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center rounded-full bg-slate-800/80 border border-orange-500/30",
        "shadow-lg",
        glow,
        sizeClasses.container,
        className
      )}
    >
      {/* Fire emoji/icon */}
      <span className={cn(sizeClasses.icon, color)} role="img" aria-label="fire">
        {String.fromCodePoint(0x1F525)}
      </span>

      {/* Streak count */}
      <span className={cn(sizeClasses.text, "font-bold", color)}>
        {streak}
      </span>
      <span className={cn(sizeClasses.text, "text-slate-300 font-medium")}>
        {streak === 1 ? 'day' : 'days'}
      </span>

      {/* Multiplier */}
      {showMultiplier && multiplier > 1 && (
        <span
          className={cn(
            sizeClasses.multiplier,
            "ml-1 px-1.5 py-0.5 rounded-full",
            "bg-orange-500/20 text-orange-300 font-semibold"
          )}
        >
          {multiplier.toFixed(1)}x
        </span>
      )}
    </div>
  );
}

/**
 * Compact streak indicator for tight spaces
 */
export function StreakIndicator({
  streak,
  className,
}: {
  streak: number;
  className?: string;
}) {
  if (streak === 0) return null;

  const { color } = getFireIntensity(streak);

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <span className={cn("text-sm", color)} role="img" aria-label="fire">
        {String.fromCodePoint(0x1F525)}
      </span>
      <span className={cn("text-xs font-bold", color)}>
        {streak}
      </span>
    </div>
  );
}
