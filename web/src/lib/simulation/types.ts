// Simulation mode types for paper trading

export interface SimulatedPortfolio {
  balances: Record<string, number>; // coinKey → human-readable amount
  trades: SimulatedTrade[];         // last 50 trades
  totalPnl: number;
  createdAt: number;
  updatedAt: number;
}

export interface SimulatedTrade {
  id: string;
  poolKey: string;
  side: 'buy' | 'sell';
  inputAmount: number;
  inputCoin: string;
  outputAmount: number;
  outputCoin: string;
  price: number;
  fee: number;
  gasEstimate: number;
  timestamp: number;
}

/** Default starting balances for new simulation portfolios */
export const DEFAULT_SIM_BALANCES: Record<string, number> = {
  SUI: 100,
  USDC: 500,
  DEEP: 50,
};

/** Estimated gas cost per transaction in SUI */
export const ESTIMATED_GAS_SUI = 0.003;

/** Estimated taker fee rate (0.1%) */
export const ESTIMATED_FEE_RATE = 0.001;

/** DEEP required per swap */
export const DEEP_PER_SWAP = 0.5;

/** Max trades stored in history */
export const MAX_TRADE_HISTORY = 50;
