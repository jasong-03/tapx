/**
 * Trading signal types for AI-powered market analysis
 */
export interface TradingSignal {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 1-10
  confidence: number; // 0-100
  indicators: {
    rsi: { value: number; signal: 'oversold' | 'overbought' | 'neutral' };
    macd: { histogram: number; signal: 'bullish' | 'bearish' | 'neutral' };
    volume: { anomaly: boolean; magnitude: number };
    maCrossover: { type: 'golden' | 'death' | 'none'; confirmed: boolean };
  };
  timestamp: number;
}

/**
 * Risk assessment score for a trading pool
 */
export interface RiskScore {
  level: 'low' | 'medium' | 'high';
  score: number; // 1-10
  factors: RiskFactor[];
  color: '#22c55e' | '#eab308' | '#ef4444';
}

/**
 * Individual risk factor contribution
 */
export interface RiskFactor {
  name: string;
  contribution: number;
  description: string;
}

/**
 * OHLCV price data for technical analysis
 */
export interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Configuration for signal generation
 */
export interface SignalConfig {
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  volumeAnomalyThreshold: number;
  shortMaPeriod: number;
  longMaPeriod: number;
}

/**
 * Default configuration for signal generation
 */
export const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  volumeAnomalyThreshold: 2.0, // 2x standard deviation
  shortMaPeriod: 50,
  longMaPeriod: 200,
};
