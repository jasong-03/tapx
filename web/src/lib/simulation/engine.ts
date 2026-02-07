// Core simulation engine — computes trade results from devInspect price data
// Also provides prediction game helpers (deductStake / creditWinnings)

import type { Pool, TradeSide } from '@/lib/swipebook/types';
import type { SimulatedTrade, SimulatedPortfolio } from './types';
import {
  ESTIMATED_GAS_SUI,
  ESTIMATED_FEE_RATE,
  DEEP_PER_SWAP,
  MAX_TRADE_HISTORY,
} from './types';

interface SimulateResult {
  trade: SimulatedTrade;
  updatedPortfolio: SimulatedPortfolio;
}

interface SimulateError {
  error: string;
}

export function simulateTrade(
  portfolio: SimulatedPortfolio,
  pool: Pool,
  side: TradeSide,
  amount: number,
  estimatedOutput: number,
  currentPrice: number,
): SimulateResult | SimulateError {
  // Input validation
  if (!amount || amount <= 0 || !isFinite(amount)) {
    return { error: 'Invalid trade amount' };
  }
  if (!estimatedOutput || estimatedOutput <= 0 || !isFinite(estimatedOutput)) {
    return { error: 'Invalid estimated output' };
  }
  if (!currentPrice || currentPrice <= 0 || !isFinite(currentPrice)) {
    return { error: 'Invalid price' };
  }

  const spendCoin = side === 'buy' ? pool.quoteCoin : pool.baseCoin;
  const receiveCoin = side === 'buy' ? pool.baseCoin : pool.quoteCoin;
  const currentBalance = portfolio.balances[spendCoin] ?? 0;

  // 1. Check simulated balance for spend coin
  if (currentBalance < amount) {
    return { error: `Insufficient simulated ${spendCoin} balance (have ${currentBalance.toFixed(4)}, need ${amount.toFixed(4)})` };
  }

  // 2. Check SUI for gas (skip if spending SUI since gas comes from same pool)
  const suiBalance = portfolio.balances['SUI'] ?? 0;
  if (spendCoin !== 'SUI' && suiBalance < ESTIMATED_GAS_SUI) {
    return { error: 'Insufficient simulated SUI for gas' };
  }

  // 3. Compute result
  const fee = amount * ESTIMATED_FEE_RATE;
  const trade: SimulatedTrade = {
    id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    poolKey: pool.poolKey,
    side,
    inputAmount: amount,
    inputCoin: spendCoin,
    outputAmount: estimatedOutput,
    outputCoin: receiveCoin,
    price: currentPrice,
    fee,
    gasEstimate: ESTIMATED_GAS_SUI,
    timestamp: Date.now(),
  };

  // 4. Update balances
  const updatedBalances = { ...portfolio.balances };
  updatedBalances[spendCoin] = (updatedBalances[spendCoin] ?? 0) - amount;
  updatedBalances[receiveCoin] = (updatedBalances[receiveCoin] ?? 0) + estimatedOutput;

  // Deduct DEEP fee (if available)
  if ((updatedBalances['DEEP'] ?? 0) >= DEEP_PER_SWAP) {
    updatedBalances['DEEP'] -= DEEP_PER_SWAP;
  }

  // Deduct gas from SUI (unless SUI is the spend coin — gas deducted implicitly)
  if (spendCoin !== 'SUI') {
    updatedBalances['SUI'] = (updatedBalances['SUI'] ?? 0) - ESTIMATED_GAS_SUI;
  }

  const updatedPortfolio: SimulatedPortfolio = {
    ...portfolio,
    balances: updatedBalances,
    trades: [trade, ...portfolio.trades].slice(0, MAX_TRADE_HISTORY),
    totalPnl: portfolio.totalPnl, // P&L tracked by individual trades
    updatedAt: Date.now(),
  };

  return { trade, updatedPortfolio };
}

// --- Prediction game helpers ---

interface BalanceResult {
  updatedPortfolio: SimulatedPortfolio;
}

/**
 * Deduct stake from simulated balance when a prediction bet is placed.
 * The stake is denominated in the pool's quote coin (e.g. USDC).
 */
export function deductStake(
  portfolio: SimulatedPortfolio,
  coin: string,
  amount: number,
): BalanceResult | SimulateError {
  if (!amount || amount <= 0 || !isFinite(amount)) {
    return { error: 'Invalid stake amount' };
  }
  const balance = portfolio.balances[coin] ?? 0;
  if (balance < amount) {
    return { error: `Insufficient ${coin} (have ${balance.toFixed(2)}, need ${amount.toFixed(2)})` };
  }
  const updatedBalances = { ...portfolio.balances };
  updatedBalances[coin] = balance - amount;
  return {
    updatedPortfolio: {
      ...portfolio,
      balances: updatedBalances,
      updatedAt: Date.now(),
    },
  };
}

/**
 * Credit winnings back to simulated balance when a prediction bet wins.
 * PnL is tracked as net profit (winnings minus original stake, which was
 * already deducted when the bet was placed).
 * @param amount - total payout (stake * multiplier)
 * @param originalStake - the stake that was deducted on bet placement
 */
export function creditWinnings(
  portfolio: SimulatedPortfolio,
  coin: string,
  amount: number,
  originalStake: number = 0,
): BalanceResult {
  const updatedBalances = { ...portfolio.balances };
  updatedBalances[coin] = (updatedBalances[coin] ?? 0) + amount;
  const profit = originalStake > 0 ? amount - originalStake : amount;
  return {
    updatedPortfolio: {
      ...portfolio,
      balances: updatedBalances,
      totalPnl: portfolio.totalPnl + profit,
      updatedAt: Date.now(),
    },
  };
}
