"use client"

import { LEVERAGE_OPTIONS, type LeverageValue, type MarginPoolKey, getMaxLeverage } from '@/lib/deepbook/margin-config';

interface LeverageSelectorProps {
  leverage: LeverageValue;
  poolKey?: MarginPoolKey;
  onChange: (leverage: LeverageValue) => void;
}

export function LeverageSelector({ leverage, poolKey, onChange }: LeverageSelectorProps) {
  const maxLev = poolKey ? getMaxLeverage(poolKey) : 5;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        {LEVERAGE_OPTIONS.map((opt) => {
          const isDisabled = opt.value > maxLev;
          const isActive = opt.value === leverage;

          return (
            <button
              key={opt.value}
              onClick={() => !isDisabled && onChange(opt.value)}
              disabled={isDisabled}
              className={`
                px-4 py-1.5 rounded-full text-sm font-bold transition-all
                ${isDisabled
                  ? 'opacity-30 cursor-not-allowed text-white/30 bg-white/5'
                  : isActive
                    ? 'bg-lime-400 text-black shadow-[0_0_12px_rgba(163,230,53,0.4)]'
                    : 'bg-white/10 text-white/70 hover:bg-white/15'
                }
              `}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <span className="text-[10px] text-white/40 ml-1">
        {LEVERAGE_OPTIONS.find((o) => o.value === leverage)?.liquidationBuffer ?? ''} liq buffer
      </span>
    </div>
  );
}
