"use client"

import { cn } from '@/lib/utils';
import type { OrderType } from '@/lib/deepbook/orderTypes';

interface OrderTypeSelectorProps {
  selected: OrderType;
  onChange: (type: OrderType) => void;
  disabled?: boolean;
}

export function OrderTypeSelector({
  selected,
  onChange,
  disabled = false,
}: OrderTypeSelectorProps) {
  return (
    <div className="flex rounded-lg bg-slate-800 p-1">
      <button
        type="button"
        onClick={() => onChange('market')}
        disabled={disabled}
        className={cn(
          "flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
          selected === 'market'
            ? "bg-blue-500 text-white shadow-md"
            : "text-slate-400 hover:text-white hover:bg-slate-700",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        Market
      </button>
      <button
        type="button"
        onClick={() => onChange('limit')}
        disabled={disabled}
        className={cn(
          "flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
          selected === 'limit'
            ? "bg-blue-500 text-white shadow-md"
            : "text-slate-400 hover:text-white hover:bg-slate-700",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        Limit
      </button>
    </div>
  );
}

interface OrderTypeSelectorCompactProps {
  selected: OrderType;
  onChange: (type: OrderType) => void;
  disabled?: boolean;
}

export function OrderTypeSelectorCompact({
  selected,
  onChange,
  disabled = false,
}: OrderTypeSelectorCompactProps) {
  return (
    <div className="inline-flex rounded-md bg-slate-800/50 p-0.5">
      <button
        type="button"
        onClick={() => onChange('market')}
        disabled={disabled}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded transition-colors",
          selected === 'market'
            ? "bg-slate-700 text-white"
            : "text-slate-500 hover:text-slate-300",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        Market
      </button>
      <button
        type="button"
        onClick={() => onChange('limit')}
        disabled={disabled}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded transition-colors",
          selected === 'limit'
            ? "bg-slate-700 text-white"
            : "text-slate-500 hover:text-slate-300",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        Limit
      </button>
    </div>
  );
}
