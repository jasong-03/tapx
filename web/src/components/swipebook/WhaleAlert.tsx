"use client"

import { cn } from '@/lib/utils';
import type { WhaleActivity } from '@/lib/social/types';
import {
  formatWhaleVolume,
  getWhaleActivityLabel,
  getWhaleActivityColor,
} from '@/lib/social/whaleTracking';

interface WhaleAlertProps {
  activity: WhaleActivity | null | undefined;
  showVolume?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Get size classes
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg') {
  switch (size) {
    case 'sm':
      return {
        container: 'px-2 py-1 gap-1',
        icon: 'text-sm',
        text: 'text-xs',
        volume: 'text-[10px]',
      };
    case 'md':
      return {
        container: 'px-3 py-1.5 gap-1.5',
        icon: 'text-base',
        text: 'text-sm',
        volume: 'text-xs',
      };
    case 'lg':
      return {
        container: 'px-4 py-2 gap-2',
        icon: 'text-xl',
        text: 'text-base',
        volume: 'text-sm',
      };
  }
}

/**
 * Display whale activity badge
 *
 * Shows whale emoji with activity type (Accumulating/Distributing).
 * Only shows when activity type is not 'none'.
 *
 * @example
 * ```tsx
 * <WhaleAlert
 *   activity={socialSignals?.whaleActivity}
 *   showVolume={true}
 * />
 * ```
 */
export function WhaleAlert({
  activity,
  showVolume = false,
  size = 'md',
  className,
}: WhaleAlertProps) {
  const sizeClasses = getSizeClasses(size);

  // Loading state
  if (!activity) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="h-6 w-24 bg-slate-700 rounded-full" />
      </div>
    );
  }

  // No whale activity to display
  if (activity.type === 'none') {
    return null;
  }

  const colors = getWhaleActivityColor(activity.type);
  const label = activity.type === 'accumulating' ? 'Accumulating' : 'Distributing';

  return (
    <div
      className={cn(
        "flex items-center rounded-full border",
        colors.bg,
        colors.border,
        sizeClasses.container,
        className
      )}
    >
      {/* Whale emoji */}
      <span className={sizeClasses.icon} role="img" aria-label="whale">
        {String.fromCodePoint(0x1F40B)}
      </span>

      {/* Activity label */}
      <span className={cn("font-medium", colors.text, sizeClasses.text)}>
        {label}
      </span>

      {/* Optional volume display */}
      {showVolume && (
        <span className={cn("text-slate-400", sizeClasses.volume)}>
          ({formatWhaleVolume(activity.volume24h)})
        </span>
      )}
    </div>
  );
}

/**
 * Compact whale indicator for card views
 */
export function WhaleIndicator({
  activity,
  className,
}: {
  activity: WhaleActivity | null | undefined;
  className?: string;
}) {
  if (!activity || activity.type === 'none') {
    return null;
  }

  const colors = getWhaleActivityColor(activity.type);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
        colors.bg,
        colors.border,
        "border",
        className
      )}
      title={getWhaleActivityLabel(activity.type)}
    >
      <span className="text-sm" role="img" aria-label="whale">
        {String.fromCodePoint(0x1F40B)}
      </span>
      <span className={cn("text-xs font-medium", colors.text)}>
        {activity.type === 'accumulating' ? '+' : '-'}
      </span>
    </div>
  );
}

/**
 * Detailed whale activity panel
 */
export function WhaleActivityPanel({
  activity,
  className,
}: {
  activity: WhaleActivity | null | undefined;
  className?: string;
}) {
  // Loading state
  if (!activity) {
    return (
      <div className={cn("animate-pulse p-4 rounded-xl bg-slate-800", className)}>
        <div className="h-16 bg-slate-700 rounded" />
      </div>
    );
  }

  const colors = getWhaleActivityColor(activity.type);
  const netFlowPositive = activity.netFlow >= 0;

  return (
    <div
      className={cn(
        "p-4 rounded-xl border",
        colors.bg,
        colors.border,
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl" role="img" aria-label="whale">
          {String.fromCodePoint(0x1F40B)}
        </span>
        <span className={cn("font-semibold", colors.text)}>
          {getWhaleActivityLabel(activity.type)}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">24h Volume</p>
          <p className="text-sm font-medium text-white">
            {formatWhaleVolume(activity.volume24h)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Net Flow</p>
          <p
            className={cn(
              "text-sm font-medium",
              netFlowPositive ? "text-green-400" : "text-red-400"
            )}
          >
            {netFlowPositive ? '+' : ''}
            {formatWhaleVolume(activity.netFlow)}
          </p>
        </div>
      </div>

      {/* Last update */}
      <p className="text-[10px] text-slate-500 mt-3">
        Updated {new Date(activity.lastUpdate).toLocaleTimeString()}
      </p>
    </div>
  );
}
