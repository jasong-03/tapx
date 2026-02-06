"use client"

import { useUserPositions } from '@/hooks/swipebook/useUserPositions';
import { cn } from '@/lib/utils';

export function PortfolioView() {
  const { data: positions, isLoading, error } = useUserPositions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-red-400">Failed to load portfolio</p>
        </div>
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">💰</p>
          <p className="text-xl font-semibold mb-2">No tokens yet</p>
          <p className="text-slate-400">Start trading to build your portfolio</p>
        </div>
      </div>
    );
  }

  // Calculate total portfolio value (simplified - just sum of balances)
  const totalValue = positions.reduce((sum, pos) => sum + pos.valueUsd, 0);

  return (
    <div className="p-4 space-y-6">
      {/* Portfolio Summary */}
      <div className="text-center py-6 bg-gradient-to-b from-slate-800/50 to-transparent rounded-2xl">
        <p className="text-sm text-slate-400 mb-1">Total Balance</p>
        <p className="text-3xl font-bold">
          {totalValue > 0 ? `$${totalValue.toFixed(2)}` : '—'}
        </p>
      </div>

      {/* Positions List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-400 px-1">Your Tokens</h3>

        {positions.map((position) => (
          <div
            key={position.token.type}
            className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              {/* Token Icon */}
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm",
                position.token.symbol === 'SUI' ? "bg-blue-500" :
                position.token.symbol === 'USDC' ? "bg-green-500" :
                position.token.symbol === 'DEEP' ? "bg-purple-500" :
                position.token.symbol === 'WAL' ? "bg-orange-500" :
                "bg-slate-600"
              )}>
                {position.token.symbol.slice(0, 2)}
              </div>

              <div>
                <p className="font-medium">{position.token.symbol}</p>
                <p className="text-sm text-slate-400">{position.token.name}</p>
              </div>
            </div>

            <div className="text-right">
              <p className="font-medium">
                {position.balanceFormatted.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}
              </p>
              {position.valueUsd > 0 && (
                <p className="text-sm text-slate-400">
                  ${position.valueUsd.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
