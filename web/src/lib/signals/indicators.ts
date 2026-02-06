import type { SignalConfig } from './types';
import { DEFAULT_SIGNAL_CONFIG } from './types';

/**
 * Calculate the Relative Strength Index (RSI)
 * RSI measures the magnitude of recent price changes to evaluate overbought/oversold conditions
 *
 * @param prices - Array of closing prices (most recent last)
 * @param period - The RSI period (default: 14)
 * @returns RSI value between 0 and 100
 */
export function calculateRSI(
  prices: number[],
  period: number = DEFAULT_SIGNAL_CONFIG.rsiPeriod
): number {
  if (prices.length < period + 1) {
    return 50; // Neutral value when insufficient data
  }

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // Calculate initial average gains and losses
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // Apply smoothed moving average for remaining periods
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return Math.round(rsi * 100) / 100;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * EMA gives more weight to recent prices
 *
 * @param prices - Array of closing prices (most recent last)
 * @param period - The EMA period
 * @returns Array of EMA values
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) {
    return [];
  }

  if (prices.length < period) {
    // Return SMA for insufficient data
    const sma = prices.reduce((a, b) => a + b, 0) / prices.length;
    return prices.map(() => sma);
  }

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // Start with SMA for the first period
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
    ema.push(sum / (i + 1)); // Progressive average for initial values
  }
  ema[period - 1] = sum / period; // Set actual SMA at period-1

  // Calculate EMA for remaining periods
  for (let i = period; i < prices.length; i++) {
    const currentEma = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(currentEma);
  }

  return ema;
}

/**
 * Calculate Simple Moving Average (SMA)
 *
 * @param prices - Array of closing prices
 * @param period - The SMA period
 * @returns Array of SMA values
 */
export function calculateSMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }

  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }

  return sma;
}

/**
 * MACD calculation result
 */
export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * Calculate Moving Average Convergence Divergence (MACD)
 * MACD is a trend-following momentum indicator
 *
 * @param prices - Array of closing prices (most recent last)
 * @param config - Signal configuration (optional)
 * @returns MACD, Signal line, and Histogram values
 */
export function calculateMACD(
  prices: number[],
  config: SignalConfig = DEFAULT_SIGNAL_CONFIG
): MACDResult {
  const { macdFast, macdSlow, macdSignal } = config;

  if (prices.length < macdSlow) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  const emaFast = calculateEMA(prices, macdFast);
  const emaSlow = calculateEMA(prices, macdSlow);

  // Calculate MACD line (difference between fast and slow EMA)
  const macdLine: number[] = [];
  for (let i = macdSlow - 1; i < prices.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  if (macdLine.length < macdSignal) {
    const lastMacd = macdLine[macdLine.length - 1] || 0;
    return { macd: lastMacd, signal: lastMacd, histogram: 0 };
  }

  // Calculate signal line (EMA of MACD line)
  const signalLine = calculateEMA(macdLine, macdSignal);

  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const histogram = macd - signal;

  return {
    macd: Math.round(macd * 1e8) / 1e8,
    signal: Math.round(signal * 1e8) / 1e8,
    histogram: Math.round(histogram * 1e8) / 1e8,
  };
}

/**
 * MA Crossover detection result
 */
export interface MACrossoverResult {
  type: 'golden' | 'death' | 'none';
  confirmed: boolean;
}

/**
 * Detect Moving Average crossovers (Golden Cross / Death Cross)
 * Golden Cross: Short-term MA crosses above long-term MA (bullish)
 * Death Cross: Short-term MA crosses below long-term MA (bearish)
 *
 * @param prices - Array of closing prices (most recent last)
 * @param config - Signal configuration (optional)
 * @returns Crossover type and confirmation status
 */
export function detectMACrossover(
  prices: number[],
  config: SignalConfig = DEFAULT_SIGNAL_CONFIG
): MACrossoverResult {
  const { shortMaPeriod, longMaPeriod } = config;

  if (prices.length < longMaPeriod + 5) {
    return { type: 'none', confirmed: false };
  }

  const shortMA = calculateSMA(prices, shortMaPeriod);
  const longMA = calculateSMA(prices, longMaPeriod);

  if (shortMA.length < 5 || longMA.length < 5) {
    return { type: 'none', confirmed: false };
  }

  // Align arrays - longMA starts later
  const alignedShortMA = shortMA.slice(longMaPeriod - shortMaPeriod);

  if (alignedShortMA.length < 5) {
    return { type: 'none', confirmed: false };
  }

  // Get the last few values to detect crossover
  const currentShort = alignedShortMA[alignedShortMA.length - 1];
  const prevShort = alignedShortMA[alignedShortMA.length - 2];
  const prev2Short = alignedShortMA[alignedShortMA.length - 3];

  const currentLong = longMA[longMA.length - 1];
  const prevLong = longMA[longMA.length - 2];
  const prev2Long = longMA[longMA.length - 3];

  // Detect Golden Cross: short crosses above long
  if (prevShort <= prevLong && currentShort > currentLong) {
    // Check if confirmed (stayed above for 2+ periods)
    const confirmed = prev2Short <= prev2Long;
    return { type: 'golden', confirmed };
  }

  // Detect Death Cross: short crosses below long
  if (prevShort >= prevLong && currentShort < currentLong) {
    // Check if confirmed (stayed below for 2+ periods)
    const confirmed = prev2Short >= prev2Long;
    return { type: 'death', confirmed };
  }

  // Check for ongoing trend (not a fresh crossover but still valid signal)
  if (currentShort > currentLong && prevShort > prevLong && prev2Short > prev2Long) {
    return { type: 'golden', confirmed: true };
  }
  if (currentShort < currentLong && prevShort < prevLong && prev2Short < prev2Long) {
    return { type: 'death', confirmed: true };
  }

  return { type: 'none', confirmed: false };
}

/**
 * Volume anomaly detection result
 */
export interface VolumeAnomalyResult {
  anomaly: boolean;
  magnitude: number;
}

/**
 * Detect unusual volume spikes using statistical analysis
 * Anomaly is detected when current volume exceeds threshold * standard deviation
 *
 * @param volumes - Array of volume values (most recent last)
 * @param config - Signal configuration (optional)
 * @returns Anomaly status and magnitude (multiple of average)
 */
export function detectVolumeAnomaly(
  volumes: number[],
  config: SignalConfig = DEFAULT_SIGNAL_CONFIG
): VolumeAnomalyResult {
  if (volumes.length < 5) {
    return { anomaly: false, magnitude: 1 };
  }

  const { volumeAnomalyThreshold } = config;

  // Use last 20 periods for baseline (or all available if less)
  const lookbackPeriod = Math.min(20, volumes.length - 1);
  const historicalVolumes = volumes.slice(-lookbackPeriod - 1, -1);
  const currentVolume = volumes[volumes.length - 1];

  if (historicalVolumes.length === 0 || currentVolume === 0) {
    return { anomaly: false, magnitude: 1 };
  }

  // Calculate mean
  const mean = historicalVolumes.reduce((a, b) => a + b, 0) / historicalVolumes.length;

  if (mean === 0) {
    return { anomaly: false, magnitude: 1 };
  }

  // Calculate standard deviation
  const squaredDiffs = historicalVolumes.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / historicalVolumes.length;
  const stdDev = Math.sqrt(variance);

  // Calculate z-score
  const zScore = stdDev > 0 ? (currentVolume - mean) / stdDev : 0;

  // Calculate magnitude (multiple of average)
  const magnitude = Math.round((currentVolume / mean) * 100) / 100;

  // Anomaly if z-score exceeds threshold
  const anomaly = Math.abs(zScore) > volumeAnomalyThreshold;

  return { anomaly, magnitude };
}

/**
 * Calculate standard deviation
 *
 * @param values - Array of numeric values
 * @returns Standard deviation
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate price volatility using returns
 *
 * @param prices - Array of closing prices
 * @param period - Lookback period for volatility calculation
 * @returns Volatility as a decimal (e.g., 0.05 = 5%)
 */
export function calculateVolatility(prices: number[], period: number = 20): number {
  if (prices.length < period + 1) {
    return 0;
  }

  // Calculate returns
  const returns: number[] = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }

  if (returns.length === 0) {
    return 0;
  }

  // Volatility is standard deviation of returns
  const volatility = calculateStdDev(returns);

  return Math.round(volatility * 10000) / 10000;
}
