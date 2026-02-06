"use client"

import { cn } from '@/lib/utils';
import type { PoolWithMarketData } from '@/lib/swipebook/types';
import type { TradingSignal, RiskScore } from '@/lib/signals/types';
import { SignalIndicator } from './SignalIndicator';
import { RiskBadge } from './RiskBadge';

interface TokenCardProps {
  pool: PoolWithMarketData;
  className?: string;
  signal?: TradingSignal | null;
  risk?: RiskScore | null;
}

export function TokenCard({ pool, className, signal, risk }: TokenCardProps) {
  const priceChangePositive = pool.priceChangePercent24h >= 0;

  // Format price with appropriate decimals
  const formatPrice = (price: number) => {
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(3);
    return price.toFixed(2);
  };

  // Determine border color based on risk level
  const getRiskBorderClass = () => {
    if (!risk) return 'border-slate-700';
    switch (risk.level) {
      case 'high':
        return 'border-red-500/50';
      case 'medium':
        return 'border-yellow-500/50';
      case 'low':
        return 'border-green-500/30';
      default:
        return 'border-slate-700';
    }
  };

  return (
    <div
      className={cn(
        "w-full h-full rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900",
        "border-2 shadow-2xl",
        getRiskBorderClass(),
        "flex flex-col p-6 select-none",
        className
      )}
    >
      {/* Header - Token Pair */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Token Icons (stacked) */}
          <div className="relative w-14 h-14">
            <div className="absolute left-0 top-0 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm border-2 border-slate-800">
              {pool.baseCoin.slice(0, 2)}
            </div>
            <div className="absolute left-5 top-3 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm border-2 border-slate-800">
              {pool.quoteCoin.slice(0, 2)}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {pool.baseCoin}/{pool.quoteCoin}
            </h2>
            <p className="text-sm text-slate-400">DeepBook V3</p>
          </div>
        </div>
      </div>

      {/* Signal and Risk Indicators */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SignalIndicator signal={signal ?? null} />
        <RiskBadge risk={risk ?? null} />
      </div>

      {/* Price Display */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center mb-4">
          <p className="text-sm text-slate-400 mb-1">Mid Price</p>
          <p className="text-5xl font-bold text-white mb-2">
            {formatPrice(pool.midPrice)}
          </p>
          <p className="text-lg text-slate-400">
            {pool.quoteCoin} per {pool.baseCoin}
          </p>
        </div>

        {/* Price Change */}
        <div className="flex justify-center mb-6">
          <div
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium",
              priceChangePositive
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            )}
          >
            {priceChangePositive ? "↑" : "↓"} {Math.abs(pool.priceChangePercent24h).toFixed(2)}% (24h)
          </div>
        </div>
      </div>

      {/* Market Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
        <div className="text-center">
          <p className="text-xs text-slate-400 mb-1">Best Bid</p>
          <p className="text-sm font-medium text-green-400">
            {formatPrice(pool.bestBid)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-400 mb-1">Spread</p>
          <p className="text-sm font-medium text-white">
            {pool.spreadPercent.toFixed(3)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-400 mb-1">Best Ask</p>
          <p className="text-sm font-medium text-red-400">
            {formatPrice(pool.bestAsk)}
          </p>
        </div>
      </div>

      {/* Swipe Hints */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-700">
        <div className="flex items-center gap-2 text-red-400">
          <span className="text-lg">←</span>
          <span className="text-sm font-medium">Sell</span>
        </div>
        <div className="flex flex-col items-center text-amber-400">
          <span className="text-lg">↑</span>
          <span className="text-xs font-medium">Watch</span>
        </div>
        <div className="flex items-center gap-2 text-green-400">
          <span className="text-sm font-medium">Buy</span>
          <span className="text-lg">→</span>
        </div>
      </div>
    </div>
  );
}
