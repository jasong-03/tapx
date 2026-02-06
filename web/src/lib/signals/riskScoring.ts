import type { PoolWithMarketData } from '@/lib/swipebook/types';
import type { RiskScore, RiskFactor } from './types';

/**
 * Risk weight configuration
 * Total must equal 100%
 */
const RISK_WEIGHTS = {
  volatility: 0.30, // 30%
  liquidity: 0.25, // 25%
  spread: 0.20, // 20%
  volume: 0.15, // 15%
  correlation: 0.10, // 10%
} as const;

/**
 * Thresholds for risk assessment
 */
const RISK_THRESHOLDS = {
  spread: {
    low: 0.1, // < 0.1% spread = low risk
    high: 0.5, // > 0.5% spread = high risk
  },
  volume: {
    low: 100000, // > $100k volume = low risk
    high: 10000, // < $10k volume = high risk
  },
  priceChange: {
    low: 2, // < 2% change = low volatility
    high: 10, // > 10% change = high volatility
  },
} as const;

/**
 * Calculate risk contribution from spread percentage
 *
 * @param spreadPercent - Bid-ask spread as percentage
 * @returns Risk score contribution (1-10)
 */
function calculateSpreadRisk(spreadPercent: number): { score: number; description: string } {
  const { low, high } = RISK_THRESHOLDS.spread;

  if (spreadPercent <= low) {
    return { score: 2, description: 'Tight spread indicates good liquidity' };
  } else if (spreadPercent >= high) {
    return { score: 9, description: 'Wide spread may result in significant slippage' };
  }

  // Linear interpolation between thresholds
  const normalizedRisk = (spreadPercent - low) / (high - low);
  const score = Math.round(2 + normalizedRisk * 7);

  if (score <= 4) {
    return { score, description: 'Moderate spread, acceptable for most trades' };
  } else if (score <= 6) {
    return { score, description: 'Elevated spread, consider order size carefully' };
  }

  return { score, description: 'High spread, potential for significant slippage' };
}

/**
 * Calculate risk contribution from 24h volume
 *
 * @param volume24h - 24-hour trading volume in USD
 * @returns Risk score contribution (1-10)
 */
function calculateVolumeRisk(volume24h: number): { score: number; description: string } {
  const { low, high } = RISK_THRESHOLDS.volume;

  if (volume24h >= low) {
    return { score: 2, description: 'High volume indicates active market' };
  } else if (volume24h <= high) {
    return { score: 9, description: 'Low volume may cause difficulty executing trades' };
  }

  // Logarithmic scale for volume risk
  const logVolume = Math.log10(Math.max(volume24h, 1));
  const logLow = Math.log10(low);
  const logHigh = Math.log10(high);

  const normalizedRisk = 1 - (logVolume - logHigh) / (logLow - logHigh);
  const score = Math.round(2 + Math.max(0, Math.min(1, normalizedRisk)) * 7);

  if (score <= 4) {
    return { score, description: 'Adequate trading volume' };
  } else if (score <= 6) {
    return { score, description: 'Moderate volume, larger trades may impact price' };
  }

  return { score, description: 'Limited volume, trade with caution' };
}

/**
 * Calculate risk contribution from price volatility
 *
 * @param priceChangePercent24h - 24-hour price change percentage
 * @returns Risk score contribution (1-10)
 */
function calculateVolatilityRisk(priceChangePercent24h: number): {
  score: number;
  description: string;
} {
  const { low, high } = RISK_THRESHOLDS.priceChange;
  const absChange = Math.abs(priceChangePercent24h);

  if (absChange <= low) {
    return { score: 2, description: 'Low volatility, stable price action' };
  } else if (absChange >= high) {
    return { score: 9, description: 'High volatility, significant price swings expected' };
  }

  const normalizedRisk = (absChange - low) / (high - low);
  const score = Math.round(2 + normalizedRisk * 7);

  if (score <= 4) {
    return { score, description: 'Moderate volatility within normal range' };
  } else if (score <= 6) {
    return { score, description: 'Elevated volatility, monitor positions closely' };
  }

  return { score, description: 'High volatility, consider reducing position size' };
}

/**
 * Calculate risk contribution from liquidity depth
 * Uses bid-ask spread and volume as proxy for liquidity
 *
 * @param pool - Pool with market data
 * @returns Risk score contribution (1-10)
 */
function calculateLiquidityRisk(pool: PoolWithMarketData): {
  score: number;
  description: string;
} {
  // Combine spread and volume signals for liquidity assessment
  const spreadFactor = pool.spreadPercent <= 0.1 ? 0 : pool.spreadPercent <= 0.5 ? 0.5 : 1;
  const volumeFactor = pool.volume24h >= 100000 ? 0 : pool.volume24h >= 10000 ? 0.5 : 1;

  const combinedFactor = (spreadFactor + volumeFactor) / 2;
  const score = Math.round(2 + combinedFactor * 7);

  if (score <= 3) {
    return { score, description: 'Deep liquidity, efficient order execution expected' };
  } else if (score <= 5) {
    return { score, description: 'Moderate liquidity, suitable for medium-sized trades' };
  } else if (score <= 7) {
    return { score, description: 'Limited liquidity, may experience slippage' };
  }

  return { score, description: 'Thin liquidity, high slippage risk for larger orders' };
}

/**
 * Calculate correlation risk (placeholder for future implementation)
 * This would assess correlation with major assets like BTC/ETH
 *
 * @param pool - Pool with market data
 * @returns Risk score contribution (1-10)
 */
function calculateCorrelationRisk(pool: PoolWithMarketData): {
  score: number;
  description: string;
} {
  // For now, return moderate risk as we don't have correlation data
  // In the future, this could use historical price correlation with BTC/ETH
  const baseCoin = pool.baseCoin.toUpperCase();

  // Major assets have lower correlation risk
  if (['SUI', 'BTC', 'ETH', 'USDC', 'USDT'].includes(baseCoin)) {
    return { score: 3, description: 'Major asset with established market dynamics' };
  }

  // Unknown or newer assets have higher correlation risk
  return { score: 5, description: 'Correlation with major assets unknown' };
}

/**
 * Determine risk level from overall score
 *
 * @param score - Overall risk score (1-10)
 * @returns Risk level and corresponding color
 */
function determineRiskLevel(score: number): {
  level: 'low' | 'medium' | 'high';
  color: '#22c55e' | '#eab308' | '#ef4444';
} {
  if (score <= 3.5) {
    return { level: 'low', color: '#22c55e' }; // Green
  } else if (score <= 6.5) {
    return { level: 'medium', color: '#eab308' }; // Yellow
  }

  return { level: 'high', color: '#ef4444' }; // Red
}

/**
 * Calculate comprehensive risk score for a trading pool
 * Combines multiple risk factors with weighted contributions
 *
 * @param pool - Pool with market data including price, spread, and volume information
 * @returns Complete risk assessment with score, level, and contributing factors
 */
export function calculateRiskScore(pool: PoolWithMarketData): RiskScore {
  // Calculate individual risk components
  const spreadRisk = calculateSpreadRisk(pool.spreadPercent);
  const volumeRisk = calculateVolumeRisk(pool.volume24h);
  const volatilityRisk = calculateVolatilityRisk(pool.priceChangePercent24h);
  const liquidityRisk = calculateLiquidityRisk(pool);
  const correlationRisk = calculateCorrelationRisk(pool);

  // Build risk factors array
  const factors: RiskFactor[] = [
    {
      name: 'Volatility',
      contribution: volatilityRisk.score * RISK_WEIGHTS.volatility,
      description: volatilityRisk.description,
    },
    {
      name: 'Liquidity',
      contribution: liquidityRisk.score * RISK_WEIGHTS.liquidity,
      description: liquidityRisk.description,
    },
    {
      name: 'Spread',
      contribution: spreadRisk.score * RISK_WEIGHTS.spread,
      description: spreadRisk.description,
    },
    {
      name: 'Volume',
      contribution: volumeRisk.score * RISK_WEIGHTS.volume,
      description: volumeRisk.description,
    },
    {
      name: 'Correlation',
      contribution: correlationRisk.score * RISK_WEIGHTS.correlation,
      description: correlationRisk.description,
    },
  ];

  // Calculate weighted overall score
  const overallScore =
    volatilityRisk.score * RISK_WEIGHTS.volatility +
    liquidityRisk.score * RISK_WEIGHTS.liquidity +
    spreadRisk.score * RISK_WEIGHTS.spread +
    volumeRisk.score * RISK_WEIGHTS.volume +
    correlationRisk.score * RISK_WEIGHTS.correlation;

  // Round to one decimal place
  const roundedScore = Math.round(overallScore * 10) / 10;

  // Determine risk level and color
  const { level, color } = determineRiskLevel(roundedScore);

  return {
    level,
    score: roundedScore,
    factors: factors.sort((a, b) => b.contribution - a.contribution), // Sort by contribution
    color,
  };
}

/**
 * Get a human-readable summary of the risk assessment
 *
 * @param riskScore - Calculated risk score
 * @returns Human-readable risk summary
 */
export function getRiskSummary(riskScore: RiskScore): string {
  const topFactors = riskScore.factors.slice(0, 2).map((f) => f.name.toLowerCase());

  switch (riskScore.level) {
    case 'low':
      return `Low risk trading opportunity. ${topFactors.join(' and ')} factors are favorable.`;
    case 'medium':
      return `Moderate risk. Consider ${topFactors.join(' and ')} when sizing your position.`;
    case 'high':
      return `High risk. Significant concerns with ${topFactors.join(' and ')}. Trade with caution.`;
  }
}
