"use client"

import { cn } from '@/lib/utils';
import type { SwipeConsensus } from '@/lib/social/types';
import { getConsensusStrength, getDominantDirection } from '@/lib/social/consensus';

interface SocialIndicatorProps {
  consensus: SwipeConsensus | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
  className?: string;
}

/**
 * Get size classes for the component
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg') {
  switch (size) {
    case 'sm':
      return {
        container: 'gap-2',
        bar: 'h-1.5',
        text: 'text-xs',
        badge: 'text-[10px] px-1.5 py-0.5',
      };
    case 'md':
      return {
        container: 'gap-2.5',
        bar: 'h-2',
        text: 'text-sm',
        badge: 'text-xs px-2 py-0.5',
      };
    case 'lg':
      return {
        container: 'gap-3',
        bar: 'h-2.5',
        text: 'text-base',
        badge: 'text-sm px-2.5 py-1',
      };
  }
}

/**
 * Display community swipe consensus
 *
 * Shows bullish/bearish percentage with a visual bar and optional strength badge.
 * Only displays meaningful data when total swipes >= 5.
 *
 * @example
 * ```tsx
 * <SocialIndicator
 *   consensus={socialSignals?.communitySwipes}
 *   showBadge={true}
 * />
 * ```
 */
export function SocialIndicator({
  consensus,
  size = 'md',
  showBadge = true,
  className,
}: SocialIndicatorProps) {
  const sizeClasses = getSizeClasses(size);

  // Loading state
  if (!consensus) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className={cn("bg-slate-700 rounded-full", sizeClasses.bar, "w-full")} />
      </div>
    );
  }

  // Not enough data
  if (consensus.total < 5) {
    return (
      <div className={cn("flex items-center", sizeClasses.container, className)}>
        <span className={cn("text-slate-500", sizeClasses.text)}>
          Not enough swipes yet
        </span>
      </div>
    );
  }

  const strength = getConsensusStrength(consensus);
  const direction = getDominantDirection(consensus);

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Header with percentages */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium text-green-400", sizeClasses.text)}>
            {consensus.bullish}% Bullish
          </span>
          {showBadge && strength === 'strong' && (
            <span
              className={cn(
                "rounded-full font-medium",
                sizeClasses.badge,
                direction === 'bullish'
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              )}
            >
              Strong {direction === 'bullish' ? 'Bullish' : 'Bearish'}
            </span>
          )}
        </div>
        <span className={cn("text-slate-400", sizeClasses.text)}>
          {consensus.total} swipes
        </span>
      </div>

      {/* Consensus bar */}
      <div className={cn("flex rounded-full overflow-hidden bg-slate-700", sizeClasses.bar)}>
        {/* Bullish portion */}
        <div
          className="bg-gradient-to-r from-green-600 to-green-400 transition-all duration-500"
          style={{ width: `${consensus.bullish}%` }}
        />
        {/* Bearish portion */}
        <div
          className="bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
          style={{ width: `${consensus.bearish}%` }}
        />
      </div>

      {/* Footer with bearish percentage */}
      <div className="flex justify-between">
        <span className={cn("text-slate-500", sizeClasses.text)}>
          Community Sentiment
        </span>
        <span className={cn("text-red-400", sizeClasses.text)}>
          {consensus.bearish}% Bearish
        </span>
      </div>

      {/* User's own swipe indicator */}
      {consensus.userSwipe && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cn("text-slate-500", sizeClasses.text)}>
            Your vote:
          </span>
          <span
            className={cn(
              "font-medium",
              sizeClasses.text,
              consensus.userSwipe === 'bullish' ? 'text-green-400' : 'text-red-400'
            )}
          >
            {consensus.userSwipe === 'bullish' ? 'Bullish' : 'Bearish'}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for tight spaces
 */
export function SocialIndicatorCompact({
  consensus,
  className,
}: {
  consensus: SwipeConsensus | null | undefined;
  className?: string;
}) {
  if (!consensus || consensus.total < 5) {
    return null;
  }

  const direction = getDominantDirection(consensus);
  const strength = getConsensusStrength(consensus);

  if (direction === 'neutral') {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full",
        direction === 'bullish' ? "bg-green-500/20" : "bg-red-500/20",
        className
      )}
    >
      <span
        className={cn(
          "text-xs font-medium",
          direction === 'bullish' ? "text-green-400" : "text-red-400"
        )}
      >
        {direction === 'bullish' ? consensus.bullish : consensus.bearish}%
      </span>
      <span
        className={cn(
          "text-xs",
          direction === 'bullish' ? "text-green-300" : "text-red-300"
        )}
      >
        {strength === 'strong' ? 'Strong ' : ''}
        {direction === 'bullish' ? 'Bullish' : 'Bearish'}
      </span>
    </div>
  );
}
