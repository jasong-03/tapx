import type { TradingSignal, PriceData, SignalConfig } from './types';
import { DEFAULT_SIGNAL_CONFIG } from './types';
import {
  calculateRSI,
  calculateMACD,
  detectMACrossover,
  detectVolumeAnomaly,
} from './indicators';

/**
 * Generate mock price data for a given pool
 * This simulates historical OHLCV data since we don't have real historical data yet
 *
 * @param currentPrice - Current mid price of the pool
 * @param volatility - Expected volatility (default 0.02 = 2%)
 * @param periods - Number of periods to generate (default 100)
 * @returns Array of PriceData
 */
export function generateMockPriceData(
  currentPrice: number,
  volatility: number = 0.02,
  periods: number = 100
): PriceData[] {
  if (currentPrice <= 0) {
    return [];
  }

  const data: PriceData[] = [];
  const now = Date.now();
  const periodMs = 60 * 60 * 1000; // 1 hour per period

  // Work backwards from current price
  let price = currentPrice;

  // Generate a slight trend bias for more realistic data
  const trendBias = (Math.random() - 0.5) * 0.001; // Small random trend

  for (let i = periods - 1; i >= 0; i--) {
    // Random walk with mean reversion tendency
    const randomChange = (Math.random() - 0.5) * 2 * volatility;
    const meanReversion = (currentPrice - price) / currentPrice * 0.1;
    const priceChange = randomChange + trendBias + meanReversion;

    const close = i === 0 ? currentPrice : price * (1 + priceChange);
    const open = price;

    // Generate high/low based on volatility
    const range = close * volatility * 0.5;
    const high = Math.max(open, close) + Math.random() * range;
    const low = Math.min(open, close) - Math.random() * range;

    // Generate volume with some randomness
    const baseVolume = 50000 + Math.random() * 100000;
    const volumeSpike = Math.random() > 0.9 ? 2 + Math.random() * 3 : 1;
    const volume = baseVolume * volumeSpike;

    data.unshift({
      timestamp: now - i * periodMs,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return data;
}

/**
 * Determine RSI signal interpretation
 *
 * @param rsiValue - RSI value (0-100)
 * @param config - Signal configuration
 * @returns RSI signal interpretation
 */
function interpretRSI(
  rsiValue: number,
  config: SignalConfig
): 'oversold' | 'overbought' | 'neutral' {
  if (rsiValue <= config.rsiOversold) {
    return 'oversold';
  } else if (rsiValue >= config.rsiOverbought) {
    return 'overbought';
  }
  return 'neutral';
}

/**
 * Determine MACD signal interpretation
 *
 * @param histogram - MACD histogram value
 * @returns MACD signal interpretation
 */
function interpretMACD(histogram: number): 'bullish' | 'bearish' | 'neutral' {
  if (histogram > 0.0001) {
    return 'bullish';
  } else if (histogram < -0.0001) {
    return 'bearish';
  }
  return 'neutral';
}

/**
 * Calculate overall signal direction based on indicator consensus
 *
 * @param rsiSignal - RSI interpretation
 * @param macdSignal - MACD interpretation
 * @param maCrossover - MA crossover type
 * @returns Overall signal direction
 */
function determineSignalDirection(
  rsiSignal: 'oversold' | 'overbought' | 'neutral',
  macdSignal: 'bullish' | 'bearish' | 'neutral',
  maCrossover: 'golden' | 'death' | 'none'
): 'bullish' | 'bearish' | 'neutral' {
  let bullishScore = 0;
  let bearishScore = 0;

  // RSI contribution
  if (rsiSignal === 'oversold') bullishScore += 2; // Oversold = potential reversal up
  if (rsiSignal === 'overbought') bearishScore += 2; // Overbought = potential reversal down

  // MACD contribution
  if (macdSignal === 'bullish') bullishScore += 3;
  if (macdSignal === 'bearish') bearishScore += 3;

  // MA Crossover contribution (strongest signal)
  if (maCrossover === 'golden') bullishScore += 4;
  if (maCrossover === 'death') bearishScore += 4;

  if (bullishScore > bearishScore + 2) {
    return 'bullish';
  } else if (bearishScore > bullishScore + 2) {
    return 'bearish';
  }
  return 'neutral';
}

/**
 * Calculate signal strength based on indicator alignment
 *
 * @param rsiValue - RSI value
 * @param macdHistogram - MACD histogram value
 * @param maCrossoverConfirmed - Whether MA crossover is confirmed
 * @param volumeAnomaly - Whether there's a volume anomaly
 * @returns Signal strength (1-10)
 */
function calculateSignalStrength(
  rsiValue: number,
  macdHistogram: number,
  maCrossoverConfirmed: boolean,
  volumeAnomaly: boolean
): number {
  let strength = 5; // Base strength

  // RSI extremes add strength
  if (rsiValue <= 20 || rsiValue >= 80) {
    strength += 2;
  } else if (rsiValue <= 30 || rsiValue >= 70) {
    strength += 1;
  }

  // Strong MACD adds strength
  if (Math.abs(macdHistogram) > 0.001) {
    strength += 1;
  }

  // Confirmed MA crossover adds strength
  if (maCrossoverConfirmed) {
    strength += 2;
  }

  // Volume anomaly adds strength (confirms momentum)
  if (volumeAnomaly) {
    strength += 1;
  }

  return Math.min(10, Math.max(1, strength));
}

/**
 * Calculate confidence score based on data quality and indicator agreement
 *
 * @param indicators - All calculated indicators
 * @param priceData - Available price data
 * @returns Confidence percentage (0-100)
 */
function calculateConfidence(
  direction: 'bullish' | 'bearish' | 'neutral',
  rsiSignal: 'oversold' | 'overbought' | 'neutral',
  macdSignal: 'bullish' | 'bearish' | 'neutral',
  maCrossover: 'golden' | 'death' | 'none',
  dataPoints: number
): number {
  let confidence = 40; // Base confidence

  // Data quality component (more data = higher confidence)
  const dataConfidence = Math.min(30, (dataPoints / 100) * 30);
  confidence += dataConfidence;

  // Indicator agreement component
  let agreementScore = 0;

  if (direction === 'bullish') {
    if (rsiSignal === 'oversold') agreementScore += 10;
    if (macdSignal === 'bullish') agreementScore += 10;
    if (maCrossover === 'golden') agreementScore += 10;
  } else if (direction === 'bearish') {
    if (rsiSignal === 'overbought') agreementScore += 10;
    if (macdSignal === 'bearish') agreementScore += 10;
    if (maCrossover === 'death') agreementScore += 10;
  } else {
    // Neutral signals have lower confidence by default
    agreementScore = 15;
  }

  confidence += agreementScore;

  return Math.min(100, Math.max(0, Math.round(confidence)));
}

/**
 * Generate a comprehensive trading signal for a pool
 * Combines multiple technical indicators into a unified signal
 *
 * @param priceData - Historical OHLCV data (or null to generate mock data)
 * @param currentPrice - Current price (used if priceData is null)
 * @param config - Signal generation configuration
 * @returns Complete trading signal with all indicators
 */
export function generateSignal(
  priceData: PriceData[] | null,
  currentPrice: number = 0,
  config: SignalConfig = DEFAULT_SIGNAL_CONFIG
): TradingSignal {
  // Use provided data or generate mock data
  const data = priceData && priceData.length > 0
    ? priceData
    : generateMockPriceData(currentPrice);

  if (data.length === 0) {
    return createNeutralSignal();
  }

  // Extract close prices and volumes for indicator calculations
  const closePrices = data.map((d) => d.close);
  const volumes = data.map((d) => d.volume);

  // Calculate all indicators
  const rsiValue = calculateRSI(closePrices, config.rsiPeriod);
  const rsiSignal = interpretRSI(rsiValue, config);

  const macdResult = calculateMACD(closePrices, config);
  const macdSignal = interpretMACD(macdResult.histogram);

  const maCrossover = detectMACrossover(closePrices, config);
  const volumeAnomaly = detectVolumeAnomaly(volumes, config);

  // Determine overall signal
  const direction = determineSignalDirection(rsiSignal, macdSignal, maCrossover.type);
  const strength = calculateSignalStrength(
    rsiValue,
    macdResult.histogram,
    maCrossover.confirmed,
    volumeAnomaly.anomaly
  );
  const confidence = calculateConfidence(
    direction,
    rsiSignal,
    macdSignal,
    maCrossover.type,
    data.length
  );

  return {
    direction,
    strength,
    confidence,
    indicators: {
      rsi: { value: rsiValue, signal: rsiSignal },
      macd: { histogram: macdResult.histogram, signal: macdSignal },
      volume: volumeAnomaly,
      maCrossover: maCrossover,
    },
    timestamp: Date.now(),
  };
}

/**
 * Create a neutral signal when insufficient data is available
 *
 * @returns Neutral trading signal
 */
function createNeutralSignal(): TradingSignal {
  return {
    direction: 'neutral',
    strength: 1,
    confidence: 0,
    indicators: {
      rsi: { value: 50, signal: 'neutral' },
      macd: { histogram: 0, signal: 'neutral' },
      volume: { anomaly: false, magnitude: 1 },
      maCrossover: { type: 'none', confirmed: false },
    },
    timestamp: Date.now(),
  };
}

/**
 * Get a human-readable signal summary
 *
 * @param signal - Trading signal
 * @returns Human-readable summary
 */
export function getSignalSummary(signal: TradingSignal): string {
  if (signal.confidence === 0) {
    return 'Insufficient data for signal generation';
  }

  const directionText = {
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
  }[signal.direction];

  const strengthText =
    signal.strength >= 8
      ? 'Strong'
      : signal.strength >= 5
        ? 'Moderate'
        : 'Weak';

  const rsiText = {
    oversold: 'RSI indicates oversold conditions',
    overbought: 'RSI indicates overbought conditions',
    neutral: 'RSI is neutral',
  }[signal.indicators.rsi.signal];

  const macdText = {
    bullish: 'MACD shows bullish momentum',
    bearish: 'MACD shows bearish momentum',
    neutral: 'MACD is neutral',
  }[signal.indicators.macd.signal];

  return `${strengthText} ${directionText.toLowerCase()} signal (${signal.confidence}% confidence). ${rsiText}. ${macdText}.`;
}
