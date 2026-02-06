"use client"

import { cn } from '@/lib/utils';

// Placeholder trade history data
interface TradeRecord {
  id: string;
  timestamp: number;
  side: 'buy' | 'sell';
  baseCoin: string;
  quoteCoin: string;
  baseAmount: number;
  quoteAmount: number;
  price: number;
  txDigest: string;
}

// Mock data for UI demonstration
const mockTrades: TradeRecord[] = [];

export function TradeHistory() {
  const trades = mockTrades;

  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">📜</p>
          <p className="text-xl font-semibold mb-2">No trades yet</p>
          <p className="text-slate-400">Your trading history will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-400 px-1">Recent Trades</h3>

      {trades.map((trade) => (
        <div
          key={trade.id}
          className="p-4 bg-slate-800/50 rounded-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2 py-0.5 rounded text-xs font-medium",
                trade.side === 'buy'
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              )}>
                {trade.side.toUpperCase()}
              </span>
              <span className="font-medium">
                {trade.baseCoin}/{trade.quoteCoin}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {new Date(trade.timestamp).toLocaleDateString()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Amount: </span>
              <span>{trade.baseAmount.toFixed(4)} {trade.baseCoin}</span>
            </div>
            <div>
              <span className="text-slate-400">Price: </span>
              <span>{trade.price.toFixed(4)}</span>
            </div>
          </div>

          <a
            href={`https://suiscan.xyz/mainnet/tx/${trade.txDigest}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 mt-2 inline-block"
          >
            View on Explorer →
          </a>
        </div>
      ))}
    </div>
  );
}
