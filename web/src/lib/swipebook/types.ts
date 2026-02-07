// Token and Pool types
export interface Token {
  type: string; // Full coin type (e.g., "0x2::sui::SUI")
  symbol: string; // Display symbol (e.g., "SUI")
  name: string; // Full name (e.g., "Sui")
  decimals: number;
  iconUrl?: string;
}

export interface Pool {
  poolKey: string; // SDK pool key (e.g., "DEEP_SUI", "SUI_DBUSDC")
  address: string; // Pool object ID
  baseCoin: string; // Base coin symbol (e.g., "SUI")
  quoteCoin: string; // Quote coin symbol (e.g., "USDC")
  baseType: string; // Full base coin type
  quoteType: string; // Full quote coin type
  baseDecimals: number;
  quoteDecimals: number;
}

export interface PoolWithMarketData extends Pool {
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPercent: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
}

// Swipe types
export type SwipeDirection = "left" | "right" | "up" | "down";
export type TradeSide = "buy" | "sell";

export interface SwipeAction {
  direction: SwipeDirection;
  pool: Pool;
  timestamp: number;
}

// Trade types
export interface TradeIntent {
  pool: Pool;
  side: TradeSide;
  amount: number; // Amount in base currency for sell, quote for buy
  isBaseAmount: boolean; // true if amount is in base currency
}

export interface TradePreview {
  intent: TradeIntent;
  estimatedPrice: number;
  estimatedReceived: number;
  estimatedFee: number;
  priceImpact: number;
  slippageTolerance: number;
  minReceived: number;
}

export interface TradeResult {
  success: boolean;
  digest?: string;
  error?: string;
  executedPrice?: number;
  executedQuantity?: number;
  fee?: number;
  timestamp: number;
  isSimulated?: boolean;
}

// Portfolio types
export interface Position {
  token: Token;
  balance: bigint;
  balanceFormatted: number;
  valueUsd: number;
}

export interface TradeHistoryItem {
  id: string;
  pool: Pool;
  side: TradeSide;
  price: number;
  baseQuantity: number;
  quoteQuantity: number;
  fee: number;
  timestamp: number;
  digest: string;
}

// UI State types
export type SwipeBookView = "swipe" | "portfolio" | "history" | "leaderboard" | "profile";

export interface SwipeBookState {
  currentView: SwipeBookView;
  currentPoolIndex: number;
  pools: PoolWithMarketData[];
  pendingTrade: TradeIntent | null;
  tradePreview: TradePreview | null;
  isConfirming: boolean;
  isExecuting: boolean;
  error: string | null;
}

export type SwipeBookAction =
  | { type: "SET_VIEW"; payload: SwipeBookView }
  | { type: "SET_POOLS"; payload: PoolWithMarketData[] }
  | { type: "NEXT_POOL" }
  | { type: "PREV_POOL" }
  | { type: "INITIATE_TRADE"; payload: TradeIntent }
  | { type: "SET_PREVIEW"; payload: TradePreview }
  | { type: "START_CONFIRMING" }
  | { type: "START_EXECUTING" }
  | { type: "TRADE_SUCCESS"; payload: string }
  | { type: "TRADE_ERROR"; payload: string }
  | { type: "CANCEL_TRADE" }
  | { type: "CLEAR_ERROR" };

// Configuration
export interface SwipeConfig {
  swipeThreshold: number; // Minimum pixels for swipe
  velocityThreshold: number; // Minimum velocity for swipe
  defaultSlippage: number; // Default slippage tolerance (e.g., 0.5 for 0.5%)
}

export const DEFAULT_SWIPE_CONFIG: SwipeConfig = {
  swipeThreshold: 100,
  velocityThreshold: 500,
  defaultSlippage: 0.5,
};
