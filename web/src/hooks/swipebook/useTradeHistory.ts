"use client"

import { useState, useCallback, useEffect } from 'react';

export interface TradeRecord {
  id: string;
  poolKey: string;
  mode: 'quick' | 'grid';
  direction: 'long' | 'short' | 'buy' | 'sell';
  baseCoin: string;
  quoteCoin: string;
  baseAmount: number;
  quoteAmount: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  result: 'win' | 'loss' | 'closed' | 'repaid' | 'swap';
  leverage: number | null;
  targetPercent: number | null;
  timestamp: number;
  closedAt: number | null;
  txDigest: string | null;
}

const MAX_RECORDS = 200;

function getStorageKey(walletAddress: string): string {
  return `tapx_trade_history_${walletAddress}`;
}

function loadTrades(walletAddress: string): TradeRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(walletAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TradeRecord[];
  } catch {
    return [];
  }
}

function saveTrades(walletAddress: string, trades: TradeRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(trades));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useTradeHistory(walletAddress: string | undefined) {
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  // Load trades when walletAddress changes
  useEffect(() => {
    if (!walletAddress) {
      setTrades([]);
      return;
    }
    setTrades(loadTrades(walletAddress));
  }, [walletAddress]);

  // Persist trades whenever they change
  useEffect(() => {
    if (!walletAddress) return;
    saveTrades(walletAddress, trades);
  }, [walletAddress, trades]);

  const addTrade = useCallback(
    (record: Omit<TradeRecord, 'id'> & { id?: string }) => {
      if (!walletAddress) return;

      const id = record.id ?? `${Date.now()}_${record.poolKey}`;
      const newRecord: TradeRecord = { ...record, id };

      setTrades((prev) => {
        const updated = [...prev, newRecord];
        // FIFO eviction: drop oldest records when over limit
        if (updated.length > MAX_RECORDS) {
          return updated.slice(updated.length - MAX_RECORDS);
        }
        return updated;
      });
    },
    [walletAddress],
  );

  const updateTrade = useCallback(
    (id: string, updates: Partial<TradeRecord>) => {
      setTrades((prev) =>
        prev.map((trade) =>
          trade.id === id ? { ...trade, ...updates } : trade,
        ),
      );
    },
    [],
  );

  const clearHistory = useCallback(() => {
    setTrades([]);
    if (walletAddress && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(getStorageKey(walletAddress));
      } catch {
        // silently ignore
      }
    }
  }, [walletAddress]);

  return { trades, addTrade, updateTrade, clearHistory };
}
