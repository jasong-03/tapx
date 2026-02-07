"use client"

import { ArrowUp, ArrowDown } from 'lucide-react';

interface UpDownButtonsProps {
  onUp: () => void;
  onDown: () => void;
  disabled: boolean;
  isActive: boolean;
  activeDirection?: 'long' | 'short';
}

export function UpDownButtons({
  onUp,
  onDown,
  disabled,
  isActive,
  activeDirection,
}: UpDownButtonsProps) {
  const handleTap = (direction: 'long' | 'short') => {
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(30);
    if (direction === 'long') onUp();
    else onDown();
  };

  return (
    <div className="flex gap-3 w-full">
      {/* LONG / UP button */}
      <button
        onClick={() => handleTap('long')}
        disabled={disabled}
        className={`
          flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl
          font-bold text-lg transition-all duration-200
          ${disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}
          ${isActive && activeDirection === 'long'
            ? 'bg-green-500 text-black shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-pulse'
            : isActive && activeDirection === 'short'
              ? 'bg-green-500/20 text-green-500/40'
              : 'bg-gradient-to-r from-green-600 to-green-500 text-black hover:from-green-500 hover:to-green-400 shadow-lg'
          }
        `}
      >
        <ArrowUp className="w-6 h-6" />
        <span>LONG</span>
      </button>

      {/* SHORT / DOWN button */}
      <button
        onClick={() => handleTap('short')}
        disabled={disabled}
        className={`
          flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl
          font-bold text-lg transition-all duration-200
          ${disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}
          ${isActive && activeDirection === 'short'
            ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse'
            : isActive && activeDirection === 'long'
              ? 'bg-red-500/20 text-red-500/40'
              : 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400 shadow-lg'
          }
        `}
      >
        <ArrowDown className="w-6 h-6" />
        <span>SHORT</span>
      </button>
    </div>
  );
}
