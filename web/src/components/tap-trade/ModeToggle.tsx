"use client"

import type { PredictionMode } from '@/context/SwipeBookContext';

interface ModeToggleProps {
  mode: PredictionMode;
  onChange: (mode: PredictionMode) => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="flex rounded-full bg-white/5 p-0.5">
      <button
        onClick={() => onChange('quick')}
        disabled={disabled}
        className={`
          px-4 py-1 rounded-full text-xs font-medium transition-all
          ${mode === 'quick'
            ? 'bg-white/15 text-white'
            : 'text-white/40 hover:text-white/60'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        Quick
      </button>
      <button
        onClick={() => onChange('grid')}
        disabled={disabled}
        className={`
          px-4 py-1 rounded-full text-xs font-medium transition-all
          ${mode === 'grid'
            ? 'bg-white/15 text-white'
            : 'text-white/40 hover:text-white/60'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        Grid
      </button>
    </div>
  );
}
