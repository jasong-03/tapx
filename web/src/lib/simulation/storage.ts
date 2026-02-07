// localStorage CRUD for simulated portfolio — follows gamification/storage.ts pattern

import type { SimulatedPortfolio } from './types';
import { DEFAULT_SIM_BALANCES, MAX_TRADE_HISTORY } from './types';

const STORAGE_KEY = 'tapx_sim_portfolio';

function getStorageKey(address: string): string {
  return `${STORAGE_KEY}_${address}`;
}

export function createInitialPortfolio(
  balances?: Record<string, number>,
): SimulatedPortfolio {
  const now = Date.now();
  return {
    balances: { ...DEFAULT_SIM_BALANCES, ...(balances ?? {}) },
    trades: [],
    totalPnl: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadPortfolio(address: string): SimulatedPortfolio | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(getStorageKey(address));
    if (!stored) return null;
    const data = JSON.parse(stored);
    if (!data.balances || !Array.isArray(data.trades)) return null;
    return data as SimulatedPortfolio;
  } catch {
    return null;
  }
}

export function savePortfolio(address: string, portfolio: SimulatedPortfolio): void {
  if (typeof window === 'undefined') return;
  try {
    const toStore: SimulatedPortfolio = {
      ...portfolio,
      trades: portfolio.trades.slice(0, MAX_TRADE_HISTORY),
      updatedAt: Date.now(),
    };
    localStorage.setItem(getStorageKey(address), JSON.stringify(toStore));
  } catch {
    console.error('Failed to save simulation portfolio');
  }
}

export function clearPortfolio(address: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(address));
  } catch {
    console.error('Failed to clear simulation portfolio');
  }
}

/**
 * Load existing portfolio or create initial one with given balances.
 * Used for demo mode — always returns a portfolio.
 */
export function loadOrCreatePortfolio(
  address: string,
  initialBalances?: Record<string, number>,
): SimulatedPortfolio {
  const existing = loadPortfolio(address);
  if (existing) return existing;
  const portfolio = createInitialPortfolio(initialBalances);
  savePortfolio(address, portfolio);
  return portfolio;
}
