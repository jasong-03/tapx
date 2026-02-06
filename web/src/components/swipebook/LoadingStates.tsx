"use client"

import { cn } from '@/lib/utils';

export function CardSkeleton() {
  return (
    <div className="w-full h-full rounded-3xl bg-slate-800 animate-pulse">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14">
            <div className="absolute left-0 top-0 w-10 h-10 rounded-full bg-slate-700" />
            <div className="absolute left-5 top-3 w-10 h-10 rounded-full bg-slate-700" />
          </div>
          <div className="space-y-2">
            <div className="h-6 w-32 bg-slate-700 rounded" />
            <div className="h-4 w-20 bg-slate-700 rounded" />
          </div>
        </div>

        {/* Price */}
        <div className="text-center space-y-3 py-8">
          <div className="h-4 w-16 bg-slate-700 rounded mx-auto" />
          <div className="h-12 w-40 bg-slate-700 rounded mx-auto" />
          <div className="h-4 w-24 bg-slate-700 rounded mx-auto" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
          {[1, 2, 3].map((i) => (
            <div key={i} className="text-center space-y-2">
              <div className="h-3 w-12 bg-slate-700 rounded mx-auto" />
              <div className="h-5 w-16 bg-slate-700 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PositionSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-700" />
        <div className="space-y-2">
          <div className="h-4 w-16 bg-slate-700 rounded" />
          <div className="h-3 w-24 bg-slate-700 rounded" />
        </div>
      </div>
      <div className="space-y-2 text-right">
        <div className="h-4 w-20 bg-slate-700 rounded" />
        <div className="h-3 w-12 bg-slate-700 rounded ml-auto" />
      </div>
    </div>
  );
}

export function PortfolioSkeleton() {
  return (
    <div className="p-4 space-y-6 animate-pulse">
      {/* Summary */}
      <div className="text-center py-6 bg-slate-800/50 rounded-2xl">
        <div className="h-4 w-24 bg-slate-700 rounded mx-auto mb-2" />
        <div className="h-8 w-32 bg-slate-700 rounded mx-auto" />
      </div>

      {/* Positions */}
      <div className="space-y-3">
        <div className="h-4 w-24 bg-slate-700 rounded" />
        {[1, 2, 3].map((i) => (
          <PositionSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-2',
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-blue-500 border-t-transparent",
        sizeClasses[size],
        className
      )}
    />
  );
}
