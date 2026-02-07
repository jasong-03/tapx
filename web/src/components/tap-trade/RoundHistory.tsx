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
    <div className="flex items-center justify-center gap-1.5 px-4 py-2">
      {visible.map((round, i) => {
        const isNewest = i === 0;
        let color = 'bg-white/20'; // placeholder
        if (round.result === 'win') color = 'bg-green-500';
        else if (round.result === 'loss') color = 'bg-red-500';
        else if (round.result === 'liquidated') color = 'bg-yellow-500';

        return (
          <div
            key={round.id}
            className={`
              w-2 h-2 rounded-full ${color}
              ${isNewest ? 'animate-pulse ring-1 ring-white/30' : ''}
            `}
            title={`${round.direction} ${round.leverage}x: ${round.result ?? 'pending'}`}
          />
        );
      })}
    </div>
  );
}
