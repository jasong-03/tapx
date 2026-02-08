"use client"

import type { PredictionRound } from '@/context/SwipeBookContext';

interface RoundHistoryProps {
  rounds: PredictionRound[];
}

export function RoundHistory({ rounds }: RoundHistoryProps) {
  if (rounds.length === 0) return null;

  // Show up to 20 most recent, right-aligned
  const visible = rounds.slice(0, 20);

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2">
      {visible.map((round, i) => {
        const isNewest = i === 0;
        let bgColor = 'bg-white/20';
        let borderColor = 'border-white/10';
        if (round.result === 'win') {
          bgColor = 'bg-green-500';
          borderColor = 'border-green-400/50';
        } else if (round.result === 'loss') {
          bgColor = 'bg-red-500';
          borderColor = 'border-red-400/50';
        } else if (round.result === 'liquidated') {
          bgColor = 'bg-yellow-500';
          borderColor = 'border-yellow-400/50';
        }

        const isLong = round.direction === 'long';

        return (
          <div
            key={round.id}
            className={`
              w-5 h-5 rounded-full flex items-center justify-center
              ${bgColor} border ${borderColor}
              ${isNewest ? 'animate-pulse ring-2 ring-white/20 scale-110' : ''}
              transition-all duration-300
            `}
            title={`${round.direction} ${round.leverage}x: ${round.result ?? 'pending'} (${round.pnlPercent?.toFixed(2) ?? '?'}%)`}
          >
            <span className="text-[8px] font-black text-white leading-none">
              {isLong ? '↑' : '↓'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
