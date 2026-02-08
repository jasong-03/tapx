// Margin trading configuration for DeepBook V3
// The SDK handles all package IDs, registry IDs, and margin pool addresses
// internally based on the network (testnet/mainnet) — no manual config needed.

import { SUI_NETWORK } from './config';

// Margin-enabled pools per network
// Pool keys MUST match the SDK's internal pool registry (see @mysten/deepbook-v3/dist/utils/constants.mjs)
const TESTNET_MARGIN_POOLS = {
  SUI_DBUSDC: {
    poolKey: 'SUI_DBUSDC',
    baseCoin: 'SUI',
    quoteCoin: 'DBUSDC',
    baseDecimals: 9,
    quoteDecimals: 6,
    maxLeverage: 5,
  },
  DEEP_SUI: {
    poolKey: 'DEEP_SUI',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
    baseDecimals: 6,
    quoteDecimals: 9,
    maxLeverage: 3,
  },
  DEEP_DBUSDC: {
    poolKey: 'DEEP_DBUSDC',
    baseCoin: 'DEEP',
    quoteCoin: 'DBUSDC',
    baseDecimals: 6,
    quoteDecimals: 6,
    maxLeverage: 3,
  },
  DBTC_DBUSDC: {
    poolKey: 'DBTC_DBUSDC',
    baseCoin: 'DBTC',
    quoteCoin: 'DBUSDC',
    baseDecimals: 8,
    quoteDecimals: 6,
    maxLeverage: 3,
  },
} as const;

const MAINNET_MARGIN_POOLS = {
  SUI_USDC: {
    poolKey: 'SUI_USDC',
    baseCoin: 'SUI',
    quoteCoin: 'USDC',
    baseDecimals: 9,
    quoteDecimals: 6,
    maxLeverage: 5,
  },
  DEEP_USDC: {
    poolKey: 'DEEP_USDC',
    baseCoin: 'DEEP',
    quoteCoin: 'USDC',
    baseDecimals: 6,
    quoteDecimals: 6,
    maxLeverage: 3,
  },
  DEEP_SUI: {
    poolKey: 'DEEP_SUI',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
    baseDecimals: 6,
    quoteDecimals: 9,
    maxLeverage: 3,
  },
} as const;

export const MARGIN_POOLS = SUI_NETWORK === 'testnet' ? TESTNET_MARGIN_POOLS : MAINNET_MARGIN_POOLS;

export type MarginPoolKey = keyof typeof TESTNET_MARGIN_POOLS | keyof typeof MAINNET_MARGIN_POOLS;

export const MARGIN_POOL_KEYS = Object.keys(MARGIN_POOLS) as MarginPoolKey[];

// Leverage options with risk ratio and liquidation buffer mapping
export const LEVERAGE_OPTIONS = [
  { value: 2 as const, label: '2x', riskRatio: 2.0, liquidationBuffer: '~45%' },
  { value: 3 as const, label: '3x', riskRatio: 1.5, liquidationBuffer: '~27%' },
  { value: 5 as const, label: '5x', riskRatio: 1.25, liquidationBuffer: '~12%' },
] as const;

export type LeverageValue = (typeof LEVERAGE_OPTIONS)[number]['value'];

// Timeframe options for quick trade countdown
export const TIMEFRAME_OPTIONS = [
  { value: 15 as const, label: '15s' },
  { value: 30 as const, label: '30s' },
  { value: 60 as const, label: '1m' },
] as const;

export type TimeframeValue = (typeof TIMEFRAME_OPTIONS)[number]['value'];

// Get max leverage for a given pool
export function getMaxLeverage(poolKey: MarginPoolKey): LeverageValue {
  const pool = (MARGIN_POOLS as Record<string, { maxLeverage: number }>)[poolKey];
  return (pool?.maxLeverage ?? 3) as LeverageValue;
}

// Get available leverage options for a pool
export function getAvailableLeverages(poolKey: MarginPoolKey): typeof LEVERAGE_OPTIONS[number][] {
  const max = getMaxLeverage(poolKey);
  return LEVERAGE_OPTIONS.filter((opt) => opt.value <= max);
}

// Risk parameters from DeepBook Margin testnet docs (same for all pairs)
export const MARGIN_RISK_PARAMS = {
  minWithdrawRiskRatio: 2.0,
  minBorrowRiskRatio: 1.25,
  liquidationRiskRatio: 1.1,
  targetLiquidationRiskRatio: 1.25,
  userLiquidationReward: 0.02,
  poolLiquidationReward: 0.03,
} as const;

// Calculate liquidation price from entry price and leverage
export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  isLong: boolean,
): number {
  const liqRatio = MARGIN_RISK_PARAMS.liquidationRiskRatio;
  if (isLong) {
    return entryPrice * (1 - (1 - liqRatio / leverage) / leverage);
  }
  return entryPrice * (1 + (1 - liqRatio / leverage) / leverage);
}
