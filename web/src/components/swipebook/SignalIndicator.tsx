"use client"

import { cn } from '@/lib/utils';
import type { TradingSignal } from '@/lib/signals/types';

interface SignalIndicatorProps {
  signal: TradingSignal | null;
}

export function SignalIndicator({ signal }: SignalIndicatorProps) {
  if (!signal) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-700/50 text-slate-400 text-xs">
        <span>-</span>
        <span>No Signal</span>
      </div>
    );
  }

  const directionConfig = {
    bullish: {
      icon: '↑',
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/30',
    },
    bearish: {
      icon: '↓',
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/30',
    },
    neutral: {
      icon: '→',
      color: 'text-slate-400',
      bgColor: 'bg-slate-500/20',
      borderColor: 'border-slate-500/30',
    },
  };

  const config = directionConfig[signal.direction];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-lg border",
        config.bgColor,
        config.borderColor
      )}
    >
      <span className={cn("text-sm font-bold", config.color)}>
        {config.icon}
      </span>
      <span className={cn("text-xs font-medium capitalize", config.color)}>
        {signal.direction}
      </span>
      <span className={cn("text-xs", config.color)}>
        {signal.confidence}%
      </span>
    </div>
  );
}
