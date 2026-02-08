"use client"

import { useState, useCallback } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useAllMarginPositions, type MarginPositionSummary } from '@/hooks/swipebook/useAllMarginPositions';
import { useTradeHistory, type TradeRecord } from '@/hooks/swipebook/useTradeHistory';
import { useMarginManager } from '@/hooks/swipebook/useMarginManager';
import { useMarginTradeExecution } from '@/hooks/swipebook/useMarginTradeExecution';
import { PortfolioView } from './PortfolioView';
import { cn } from '@/lib/utils';

type HistoryFilter = 'all' | 'quick' | 'grid' | 'wins' | 'losses';

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatPrice(price: number): string {
  if (price === 0) return '—';
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

function PositionCard({
  position,
  onClose,
  onSwapRepay,
  isClosing,
}: {
  position: MarginPositionSummary;
  onClose: (pos: MarginPositionSummary) => void;
  onSwapRepay: (pos: MarginPositionSummary) => void;
  isClosing: boolean;
}) {
  const isLong = position.direction === 'long';

  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">
            {position.baseCoin}/{position.quoteCoin}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
            isLong
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          )}>
            {position.direction} {position.leverage}x
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div className="text-slate-400">
          Base: <span className="text-slate-200">{position.baseAsset.toFixed(4)}</span>
          {position.baseDebt > 0 && (
            <span className="text-red-400/70"> ({position.baseDebt.toFixed(4)} debt)</span>
          )}
        </div>
        <div className="text-slate-400">
          Quote: <span className="text-slate-200">{position.quoteAsset.toFixed(4)}</span>
          {position.quoteDebt > 0 && (
            <span className="text-red-400/70"> ({position.quoteDebt.toFixed(4)} debt)</span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onClose(position)}
          disabled={isClosing}
          className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {isClosing ? 'Closing...' : 'Close Position'}
        </button>
        <button
          onClick={() => onSwapRepay(position)}
          disabled={isClosing}
          className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-xs rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          Swap & Repay
        </button>
      </div>
    </div>
  );
}

function TradeHistoryItem({ trade }: { trade: TradeRecord }) {
  const resultConfig = {
    win: { label: 'Win', color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: '+' },
    loss: { label: 'Loss', color: 'text-red-400', bg: 'bg-red-500/20', icon: '-' },
    closed: { label: 'Closed', color: 'text-slate-400', bg: 'bg-slate-500/20', icon: '~' },
    repaid: { label: 'Repaid', color: 'text-amber-400', bg: 'bg-amber-500/20', icon: '!' },
    swap: { label: 'Swap', color: 'text-blue-400', bg: 'bg-blue-500/20', icon: '~' },
  }[trade.result];

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/50 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
          resultConfig.bg, resultConfig.color,
        )}>
          {resultConfig.icon}
        </span>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-200">
              {trade.baseCoin}/{trade.quoteCoin}
            </span>
            <span className={cn(
              "text-[10px] font-medium uppercase",
              trade.direction === 'long' || trade.direction === 'buy'
                ? "text-emerald-400"
                : "text-red-400"
            )}>
              {trade.direction}
            </span>
            {trade.leverage && (
              <span className="text-[10px] text-slate-500">{trade.leverage}x</span>
            )}
          </div>
          <span className="text-[10px] text-slate-500">
            {formatTimeAgo(trade.closedAt ?? trade.timestamp)}
            {trade.mode === 'grid' && ' (Grid)'}
          </span>
        </div>
      </div>
      <div className="text-right">
        {trade.pnl != null ? (
          <span className={cn(
            "text-xs font-mono font-medium",
            trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
          )}>
            {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(4)}
          </span>
        ) : (
          <span className="text-xs text-slate-500">—</span>
        )}
        {trade.txDigest && (
          <a
            href={`https://suiscan.xyz/testnet/tx/${trade.txDigest}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[10px] text-blue-400/60 hover:text-blue-400"
          >
            tx
          </a>
        )}
      </div>
    </div>
  );
}

export function PositionsDashboard() {
  const currentAccount = useCurrentAccount();
  const { marginManagers } = useMarginManager();
  const { positions, isLoading: positionsLoading, refetch } = useAllMarginPositions();
  const { trades, clearHistory } = useTradeHistory(currentAccount?.address);
  const { closePosition, forceRepay, swapAndRepay } = useMarginTradeExecution(marginManagers);

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [closingPool, setClosingPool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClosePosition = useCallback(async (pos: MarginPositionSummary) => {
    setClosingPool(pos.poolKey);
    setError(null);
    try {
      await closePosition({
        poolKey: pos.poolKey,
        quantity: pos.baseAsset,
        isLong: pos.direction === 'long',
        currentPrice: pos.currentPrice,
      });
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Close failed: ${msg}`);
      // Try force repay as fallback
      try {
        await forceRepay(pos.poolKey);
        refetch();
        setError('Debt repaid. Base assets may still remain — check wallet balances.');
      } catch {
        setError(`Close failed: ${msg}. Try Swap & Repay instead.`);
      }
    } finally {
      setClosingPool(null);
    }
  }, [closePosition, forceRepay, refetch]);

  const handleSwapRepay = useCallback(async (pos: MarginPositionSummary) => {
    setClosingPool(pos.poolKey);
    setError(null);
    try {
      await swapAndRepay(pos.poolKey, pos.baseDebt, pos.quoteDebt);
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Swap & Repay failed: ${msg}`);
    } finally {
      setClosingPool(null);
    }
  }, [swapAndRepay, refetch]);

  const filteredTrades = trades
    .filter((t) => {
      if (historyFilter === 'quick') return t.mode === 'quick';
      if (historyFilter === 'grid') return t.mode === 'grid';
      if (historyFilter === 'wins') return t.result === 'win';
      if (historyFilter === 'losses') return t.result === 'loss';
      return true;
    })
    .sort((a, b) => (b.closedAt ?? b.timestamp) - (a.closedAt ?? a.timestamp));

  const filters: { key: HistoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'quick', label: 'Quick' },
    { key: 'grid', label: 'Grid' },
    { key: 'wins', label: 'Wins' },
    { key: 'losses', label: 'Losses' },
  ];

  if (!currentAccount) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">Connect Wallet</p>
          <p className="text-slate-400">Connect your wallet to view positions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Open Positions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-400">Open Positions</h3>
          <button
            onClick={() => refetch()}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Refresh
          </button>
        </div>

        {positionsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-slate-800/40 rounded-xl h-32 animate-pulse" />
            ))}
          </div>
        ) : positions.length > 0 ? (
          <div className="space-y-3">
            {positions.map((pos) => (
              <PositionCard
                key={pos.poolKey}
                position={pos}
                onClose={handleClosePosition}
                onSwapRepay={handleSwapRepay}
                isClosing={closingPool === pos.poolKey}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-800/30 rounded-xl p-6 text-center">
            <p className="text-slate-500 text-sm">No open margin positions</p>
          </div>
        )}
      </section>

      {/* Wallet Balances */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 mb-3">Wallet Balances</h3>
        <PortfolioView />
      </section>

      {/* Trade History */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-400">Trade History</h3>
          {trades.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] text-slate-600 hover:text-slate-400"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 mb-3">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setHistoryFilter(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors",
                historyFilter === f.key
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-slate-800/50 text-slate-500 hover:text-slate-400"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredTrades.length > 0 ? (
          <div className="bg-slate-800/30 rounded-xl px-4">
            {filteredTrades.slice(0, 50).map((trade) => (
              <TradeHistoryItem key={trade.id} trade={trade} />
            ))}
          </div>
        ) : (
          <div className="bg-slate-800/30 rounded-xl p-6 text-center">
            <p className="text-slate-500 text-sm">
              {trades.length === 0
                ? "No trades yet — start trading to build your history"
                : "No trades match this filter"}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
