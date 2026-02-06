"use client"

import { motion, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';

interface WatchlistOverlayProps {
  opacity: number | MotionValue<number>;
}

export function WatchlistOverlay({ opacity }: WatchlistOverlayProps) {
  return (
    <motion.div
      className={cn(
        "absolute inset-0 rounded-3xl z-10 pointer-events-none",
        "flex flex-col items-center justify-start pt-12"
      )}
      style={{ opacity }}
    >
      {/* Background gradient */}
      <div
        className={cn(
          "absolute inset-0 rounded-3xl",
          "bg-gradient-to-b from-amber-500/30 to-transparent"
        )}
      />

      {/* Label */}
      <div
        className={cn(
          "relative flex flex-col items-center gap-2 px-6 py-4 rounded-xl",
          "bg-amber-500/20 border-4 border-amber-400"
        )}
      >
        {/* Star Icon */}
        <svg
          className="w-8 h-8 text-amber-400"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span className="text-xl font-bold text-amber-400">
          Add to Watchlist
        </span>
      </div>
    </motion.div>
  );
}
