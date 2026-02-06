"use client"

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { RiskScore } from '@/lib/signals/types';

interface RiskBadgeProps {
  risk: RiskScore | null;
}

export function RiskBadge({ risk }: RiskBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!risk) {
    return (
      <div className="px-2 py-1 rounded-lg bg-slate-700/50 text-slate-400 text-xs">
        No Risk Data
      </div>
    );
  }

  const levelConfig = {
    low: {
      label: 'Low Risk',
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/30',
    },
    medium: {
      label: 'Medium Risk',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/20',
      borderColor: 'border-yellow-500/30',
    },
    high: {
      label: 'High Risk',
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/30',
    },
  };

  const config = levelConfig[risk.level];

  return (
    <div className="relative">
      <button
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-lg border cursor-help transition-colors",
          config.bgColor,
          config.borderColor,
          "hover:opacity-80"
        )}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
      >
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
        <span className={cn("text-xs", config.color)}>
          ({risk.score}/10)
        </span>
      </button>

      {/* Tooltip */}
      {showTooltip && risk.factors.length > 0 && (
        <div
          className={cn(
            "absolute z-50 top-full left-0 mt-2 p-3 rounded-lg",
            "bg-slate-800 border border-slate-600 shadow-xl",
            "min-w-[200px] max-w-[280px]"
          )}
        >
          <p className="text-xs font-semibold text-slate-300 mb-2">
            Risk Factors:
          </p>
          <ul className="space-y-1.5">
            {risk.factors.map((factor, index) => (
              <li key={index} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">{factor.name}</span>
                  <span className={cn(
                    "font-medium",
                    factor.contribution >= 3 ? "text-red-400" :
                    factor.contribution >= 2 ? "text-yellow-400" :
                    "text-green-400"
                  )}>
                    +{factor.contribution.toFixed(1)}
                  </span>
                </div>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  {factor.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
