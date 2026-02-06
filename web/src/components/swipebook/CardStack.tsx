"use client"

import { useState } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { TokenCard } from './TokenCard';
import { SwipeOverlay } from './SwipeOverlay';
import { WatchlistOverlay } from './WatchlistOverlay';
import type { PoolWithMarketData, SwipeDirection, TradeSide } from '@/lib/swipebook/types';
import type { TradingSignal, RiskScore } from '@/lib/signals/types';
import { DEFAULT_SWIPE_CONFIG } from '@/lib/swipebook/types';

interface CardStackProps {
  pools: PoolWithMarketData[];
  currentIndex: number;
  onSwipe: (pool: PoolWithMarketData, direction: SwipeDirection, side: TradeSide) => void;
  onSkip: () => void;
  onWatchlist?: (pool: PoolWithMarketData) => void;
  signal?: TradingSignal | null;
  risk?: RiskScore | null;
}

export function CardStack({
  pools,
  currentIndex,
  onSwipe,
  onSkip,
  onWatchlist,
  signal,
  risk,
}: CardStackProps) {
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | 'up' | null>(null);

  // Get current and next cards
  const currentPool = pools[currentIndex];
  const nextPool = pools[currentIndex + 1];

  // Motion values for the active card
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);

  // Overlay opacity based on drag
  const leftOverlayOpacity = useTransform(x, [-150, 0], [1, 0]);
  const rightOverlayOpacity = useTransform(x, [0, 150], [0, 1]);
  const watchlistOverlayOpacity = useTransform(y, [-120, 0], [1, 0]);

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }
  ) => {
    const { offset, velocity } = info;
    const swipeThreshold = DEFAULT_SWIPE_CONFIG.swipeThreshold;
    const velocityThreshold = DEFAULT_SWIPE_CONFIG.velocityThreshold;

    // Watchlist swipe threshold
    const watchlistThreshold = 80;
    const watchlistVelocityThreshold = 500;

    // Check for upward swipe (watchlist) first
    if (offset.y < -watchlistThreshold || velocity.y < -watchlistVelocityThreshold) {
      setExitDirection('up');

      // Trigger watchlist callback after animation
      setTimeout(() => {
        if (currentPool && onWatchlist) {
          onWatchlist(currentPool);
        }
        setExitDirection(null);
      }, 200);
      return;
    }

    // Check if horizontal swipe is strong enough
    if (Math.abs(offset.x) > swipeThreshold || Math.abs(velocity.x) > velocityThreshold) {
      const direction: SwipeDirection = offset.x > 0 ? 'right' : 'left';
      const side: TradeSide = direction === 'right' ? 'buy' : 'sell';

      setExitDirection(direction);

      // Trigger callback after animation
      setTimeout(() => {
        if (currentPool) {
          onSwipe(currentPool, direction, side);
        }
        setExitDirection(null);
      }, 200);
    }
  };

  if (!currentPool) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        <p>No more pools to show</p>
      </div>
    );
  }

  // Calculate exit animation based on direction
  const getExitAnimation = () => {
    switch (exitDirection) {
      case 'left':
        return { x: -300, opacity: 0 };
      case 'right':
        return { x: 300, opacity: 0 };
      case 'up':
        return { y: -300, opacity: 0 };
      default:
        return { opacity: 0 };
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Background card (next) */}
      {nextPool && (
        <div className="absolute w-[90%] h-[90%] max-w-md">
          <motion.div
            className="w-full h-full"
            initial={{ scale: 0.9, opacity: 0.5 }}
            animate={{ scale: 0.95, opacity: 0.7 }}
          >
            <TokenCard pool={nextPool} className="pointer-events-none" />
          </motion.div>
        </div>
      )}

      {/* Active card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPool.address}
          className="absolute w-[90%] h-[90%] max-w-md cursor-grab active:cursor-grabbing"
          style={{ x, y, rotate, opacity }}
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.7}
          onDragEnd={handleDragEnd}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{
            ...getExitAnimation(),
            transition: { duration: 0.2 },
          }}
          whileTap={{ scale: 1.02 }}
        >
          {/* Swipe overlays */}
          <SwipeOverlay
            direction="left"
            opacity={leftOverlayOpacity}
          />
          <SwipeOverlay
            direction="right"
            opacity={rightOverlayOpacity}
          />
          <WatchlistOverlay
            opacity={watchlistOverlayOpacity}
          />

          <TokenCard
            pool={currentPool}
            signal={signal}
            risk={risk}
          />
        </motion.div>
      </AnimatePresence>

      {/* Skip button */}
      <button
        onClick={onSkip}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full bg-slate-700/50 text-slate-300 text-sm hover:bg-slate-600/50 transition-colors"
      >
        Skip
      </button>
    </div>
  );
}
