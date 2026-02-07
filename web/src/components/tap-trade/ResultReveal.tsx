"use client"

import { useEffect, useState } from 'react';
import type { PredictionRound } from '@/context/SwipeBookContext';

interface ResultRevealProps {
  round: PredictionRound;
  xpEarned: number;
  onComplete: () => void;
}

export function ResultReveal({ round, xpEarned, onComplete }: ResultRevealProps) {
  const [phase, setPhase] = useState(0); // 0-3 animation phases

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(onComplete, 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  // Haptic feedback
  useEffect(() => {
    if (navigator.vibrate) {
      if (round.result === 'win') navigator.vibrate([50, 30, 100]);
      else if (round.result === 'liquidated') navigator.vibrate([200, 100, 200]);
      else navigator.vibrate([100, 50, 100]);
    }
  }, [round.result]);

  const isWin = round.result === 'win';
  const isLiquidated = round.result === 'liquidated';

  return (
    <div className={`
      fixed inset-0 z-50 flex items-center justify-center
      bg-black/60 backdrop-blur-sm
      transition-opacity duration-300
      ${phase >= 3 ? 'opacity-0' : 'opacity-100'}
    `}>
      <div className={`
        flex flex-col items-center gap-3
        transition-transform duration-500
        ${phase >= 1 ? 'scale-100' : 'scale-50'}
      `}>
        {/* PnL number */}
        <div className={`
          text-5xl font-black tabular-nums
          ${isWin ? 'text-green-400' : isLiquidated ? 'text-yellow-400' : 'text-red-400'}
          ${phase === 0 ? 'scale-0' : 'scale-100'}
          transition-transform duration-500
        `}>
          {round.pnl !== undefined && round.pnl >= 0 ? '+' : ''}${round.pnl?.toFixed(2) ?? '0.00'}
        </div>

        {/* Direction + leverage */}
        <div className={`
          text-sm text-white/60
          transition-opacity duration-300
          ${phase >= 1 ? 'opacity-100' : 'opacity-0'}
        `}>
          {round.direction.toUpperCase()} {round.leverage}x &middot; {round.pnlPercent?.toFixed(1)}%
        </div>

        {/* XP earned */}
        <div className={`
          flex items-center gap-1 text-lime-400 font-bold
          transition-opacity duration-300
          ${phase >= 2 ? 'opacity-100' : 'opacity-0'}
        `}>
          +{xpEarned} XP
        </div>

        {/* Result label */}
        {isLiquidated && (
          <div className="text-yellow-400 font-black text-2xl tracking-widest animate-pulse">
            LIQUIDATED
          </div>
        )}
      </div>
    </div>
  );
}
