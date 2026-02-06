"use client"

import { motion, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SwipeOverlayProps {
  direction: 'left' | 'right';
  opacity: MotionValue<number>;
}

export function SwipeOverlay({ direction, opacity }: SwipeOverlayProps) {
  const isLeft = direction === 'left';

  return (
    <motion.div
      className={cn(
        "absolute inset-0 rounded-3xl z-10 pointer-events-none",
        "flex items-center",
        isLeft ? "justify-start pl-8" : "justify-end pr-8"
      )}
      style={{ opacity }}
    >
      {/* Background gradient */}
      <div
        className={cn(
          "absolute inset-0 rounded-3xl",
          isLeft
            ? "bg-gradient-to-r from-red-500/30 to-transparent"
            : "bg-gradient-to-l from-green-500/30 to-transparent"
        )}
      />

      {/* Label */}
      <div
        className={cn(
          "relative px-6 py-3 rounded-xl text-2xl font-bold border-4 transform",
          isLeft
            ? "bg-red-500/20 text-red-400 border-red-400 -rotate-12"
            : "bg-green-500/20 text-green-400 border-green-400 rotate-12"
        )}
      >
        {isLeft ? "SELL" : "BUY"}
      </div>
    </motion.div>
  );
}
