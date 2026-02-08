"use client"

import { CountdownRing } from './CountdownRing';

interface PredictionOverlayProps {
  entryPrice: number;
  currentPrice: number | null;
  direction: 'long' | 'short';
  tpPrice?: number;
  slPrice?: number;
  isResult?: boolean;
  isWin?: boolean;
  triggeredSide?: 'tp' | 'sl';
  timeframe?: number;
  startedAt?: number;
}

export function PredictionOverlay({
  entryPrice,
  currentPrice,
  direction,
  tpPrice,
  slPrice,
  isResult,
  isWin,
  triggeredSide,
  timeframe,
  startedAt,
}: PredictionOverlayProps) {
  const priceUp = currentPrice !== null && currentPrice >= entryPrice;
  const isLong = direction === 'long';
  const isProfitable = isLong ? priceUp : !priceUp;

  // Price diff for visual intensity
  const priceDiff = currentPrice ? Math.abs(currentPrice - entryPrice) / entryPrice : 0;
  const intensity = Math.min(priceDiff * 50, 0.35);

  // Compute vertical position of TP/SL lines relative to entry (center)
  const priceToPercent = (price: number) => {
    if (!entryPrice) return 50;
    const diff = (price - entryPrice) / entryPrice;
    const scaled = diff * 500; // 1% price diff = 5% chart
    return 50 - Math.max(-48, Math.min(48, scaled));
  };

  // Progress: how far is current price between SL and TP (0 = SL, 1 = TP)
  const progress = (tpPrice && slPrice && currentPrice)
    ? Math.max(0, Math.min(1, (currentPrice - slPrice) / (tpPrice - slPrice)))
    : 0.5;

  const tpY = tpPrice ? priceToPercent(tpPrice) : null;
  const slY = slPrice ? priceToPercent(slPrice) : null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {/* Profit zone (green) */}
      <div
        className="absolute inset-x-0 top-0 h-1/2 transition-opacity duration-500"
        style={{
          background: `linear-gradient(to bottom, rgba(34,197,94,${isProfitable ? intensity + 0.12 : 0.05}) 0%, rgba(34,197,94,0) 100%)`,
        }}
      />
      {/* Loss zone (red) */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 transition-opacity duration-500"
        style={{
          background: `linear-gradient(to top, rgba(239,68,68,${!isProfitable ? intensity + 0.12 : 0.05}) 0%, rgba(239,68,68,0) 100%)`,
        }}
      />

      {/* "Round In Progress" header text - top left */}
      {!isResult && (
        <div className="absolute top-3 left-3">
          <div className="text-sm font-black text-white/80 tracking-wide leading-tight">
            Round In Progress
          </div>
          <div className="text-[10px] font-medium text-white/40 mt-0.5">
            {triggeredSide
              ? (triggeredSide === 'tp' ? 'Take Profit Hit!' : 'Stop Loss Hit!')
              : `Target: ${isLong ? '+' : '-'}${tpPrice && entryPrice ? ((Math.abs(tpPrice - entryPrice) / entryPrice) * 100).toFixed(0) : '?'}%`
            }
          </div>
        </div>
      )}

      {/* Top right: Countdown ring + Progress bar */}
      {!isResult && (
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
          {timeframe && startedAt && (
            <CountdownRing duration={timeframe} startedAt={startedAt} size={48} />
          )}
          {tpPrice && slPrice && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-red-400 font-bold">SL</span>
              <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress * 100}%`,
                    background: progress > 0.5
                      ? `linear-gradient(90deg, rgba(250,204,21,0.8), rgba(34,197,94,0.9))`
                      : `linear-gradient(90deg, rgba(239,68,68,0.9), rgba(250,204,21,0.8))`,
                  }}
                />
              </div>
              <span className="text-[9px] text-green-400 font-bold">TP</span>
            </div>
          )}
        </div>
      )}

      {/* Entry price dashed line */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-px">
        <div className="w-full border-t-2 border-dashed border-white/20" />
      </div>

      {/* Start label - left */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10">
          <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
          <span className="text-[10px] text-white/50 font-medium">Entry</span>
          <span className="text-xs font-mono font-bold text-white">
            ${entryPrice.toFixed(4)}
          </span>
        </div>
      </div>

      {/* TP price line (green dashed) */}
      {tpY !== null && !isResult && (
        <div
          className="absolute left-0 right-0 -translate-y-px transition-all duration-300"
          style={{ top: `${tpY}%` }}
        >
          <div className="w-full border-t-2 border-dashed border-green-400/50" />
          <div className="absolute left-3 -translate-y-1/2">
            <div className={`flex items-center gap-1 bg-green-500/20 backdrop-blur-sm rounded-full px-2 py-0.5 border border-green-500/30 ${
              triggeredSide === 'tp' ? 'animate-pulse ring-2 ring-green-400' : ''
            }`}>
              <span className="text-[9px] text-green-400 font-bold">TP</span>
              <span className="text-[10px] font-mono text-green-400">${tpPrice?.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      {/* SL price line (red dashed) */}
      {slY !== null && !isResult && (
        <div
          className="absolute left-0 right-0 -translate-y-px transition-all duration-300"
          style={{ top: `${slY}%` }}
        >
          <div className="w-full border-t-2 border-dashed border-red-400/50" />
          <div className="absolute left-3 -translate-y-1/2">
            <div className={`flex items-center gap-1 bg-red-500/20 backdrop-blur-sm rounded-full px-2 py-0.5 border border-red-500/30 ${
              triggeredSide === 'sl' ? 'animate-pulse ring-2 ring-red-400' : ''
            }`}>
              <span className="text-[9px] text-red-400 font-bold">SL</span>
              <span className="text-[10px] font-mono text-red-400">${slPrice?.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Live price pill - right, vertically positioned */}
      {currentPrice !== null && !isResult && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className={`
            flex items-center gap-1.5 backdrop-blur-sm rounded-full px-2.5 py-1 border
            ${priceUp
              ? 'bg-green-500/20 border-green-500/30'
              : 'bg-red-500/20 border-red-500/30'
            }
          `}>
            <div className={`w-2 h-2 rounded-full ${priceUp ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
            <span className="text-[10px] text-white/70 font-medium">Live</span>
            <span className={`text-xs font-mono font-bold ${priceUp ? 'text-green-400' : 'text-red-400'}`}>
              ${currentPrice.toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Result flash overlay */}
      {isResult && (
        <div className={`
          absolute inset-0 flex flex-col items-center justify-center
          ${isWin ? 'bg-green-900/30' : 'bg-red-900/30'}
          backdrop-blur-[1px]
          animate-[fadeIn_0.3s_ease-out]
        `}>
          <div className={`
            text-4xl font-black tracking-wide mb-2
            ${isWin ? 'text-green-400' : 'text-red-400'}
          `}>
            {isWin ? 'WIN' : 'LOSS'}
          </div>
        </div>
      )}
    </div>
  );
}
