// Pre-loaded demo data for hackathon presentation

import type { SimulatedPortfolio, SimulatedTrade } from './types';

/** Demo portfolio with realistic starting balances */
export const DEMO_BALANCES: Record<string, number> = {
  SUI: 100,
  USDC: 500,
  DEEP: 50,
  WAL: 200,
  NS: 1000,
};

/** Pre-seeded trade history for non-empty trade view */
const DEMO_TRADES: SimulatedTrade[] = [
  {
    id: 'demo_1',
    poolKey: 'SUI_USDC',
    side: 'buy',
    inputAmount: 10,
    inputCoin: 'USDC',
    outputAmount: 2.63,
    outputCoin: 'SUI',
    price: 3.8,
    fee: 0.01,
    gasEstimate: 0.003,
    timestamp: Date.now() - 3600_000,
  },
  {
    id: 'demo_2',
    poolKey: 'DEEP_SUI',
    side: 'sell',
    inputAmount: 100,
    inputCoin: 'DEEP',
    outputAmount: 0.82,
    outputCoin: 'SUI',
    price: 0.0082,
    fee: 0.001,
    gasEstimate: 0.003,
    timestamp: Date.now() - 7200_000,
  },
  {
    id: 'demo_3',
    poolKey: 'SUI_USDC',
    side: 'sell',
    inputAmount: 5,
    inputCoin: 'SUI',
    outputAmount: 19.15,
    outputCoin: 'USDC',
    price: 3.83,
    fee: 0.02,
    gasEstimate: 0.003,
    timestamp: Date.now() - 10800_000,
  },
];

export function createDemoPortfolio(): SimulatedPortfolio {
  const now = Date.now();
  return {
    balances: { ...DEMO_BALANCES },
    trades: DEMO_TRADES.map((t) => ({ ...t })),
    totalPnl: 1.35,
    createdAt: now - 86400_000, // 1 day ago
    updatedAt: now,
  };
}
