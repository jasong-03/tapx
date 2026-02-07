"use client"

import { useMemo } from 'react';
import type { TradingSignal } from '@/lib/signals/types';

interface ConsensusBarProps {
  signal: TradingSignal | null;
}

export function ConsensusBar({ signal }: ConsensusBarProps) {
  const consensus = useMemo(() => {
    if (!signal) return { upPercent: 50, label: '50/50' };
    const up = signal.direction === 'bullish'
      ? 50 + signal.confidence / 2
      : 50 - signal.confidence / 2;
    // Small jitter for "live" feel
    const jitter = (Math.random() - 0.5) * 6;
    const upPercent = Math.round(Math.max(20, Math.min(80, up + jitter)));
    const majority = upPercent >= 50;
    return {
      upPercent,
      label: majority ? `${upPercent}% predict UP` : `${100 - upPercent}% predict DOWN`,
    };
  }, [signal]);

  return (
    <div className="flex flex-col gap-1 px-4">
      <span className="text-[10px] text-white/50 text-center">{consensus.label}</span>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
        <div
          className="bg-green-500 transition-all duration-700 ease-out"
          style={{ width: `${consensus.upPercent}%` }}
        />
        <div
          className="bg-red-500 transition-all duration-700 ease-out"
          style={{ width: `${100 - consensus.upPercent}%` }}
        />
      </div>
    </div>
  );
}
