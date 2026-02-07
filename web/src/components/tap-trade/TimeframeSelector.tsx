"use client"

import { TIMEFRAME_OPTIONS, type TimeframeValue } from '@/lib/deepbook/margin-config';

interface TimeframeSelectorProps {
  timeframe: TimeframeValue;
  onChange: (tf: TimeframeValue) => void;
}

export function TimeframeSelector({ timeframe, onChange }: TimeframeSelectorProps) {
  return (
    <div className="flex gap-2">
      {TIMEFRAME_OPTIONS.map((opt) => {
        const isActive = opt.value === timeframe;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`
              px-3 py-1 rounded-full text-xs font-medium transition-all
              ${isActive
                ? 'bg-white/20 text-white border border-white/30'
                : 'bg-transparent text-white/50 border border-white/10 hover:border-white/20'
              }
            `}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
