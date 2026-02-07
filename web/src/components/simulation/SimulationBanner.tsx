"use client"

interface SimulationBannerProps {
  isDemo: boolean;
  onToggleOff?: () => void;
}

export function SimulationBanner({ isDemo, onToggleOff }: SimulationBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-500/15 border-b border-amber-500/20">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <span className="text-[11px] font-medium text-amber-400 truncate">
          {isDemo ? 'DEMO MODE' : 'SIMULATION'}
        </span>
        <span className="text-[10px] text-amber-400/60 truncate hidden sm:inline">
          Real prices, simulated trades
        </span>
      </div>
      {onToggleOff && (
        <button
          onClick={onToggleOff}
          className="text-[10px] text-amber-400/80 hover:text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 shrink-0 transition-colors"
        >
          Go Live
        </button>
      )}
    </div>
  );
}
