import type { Pool } from '@/lib/swipebook/types';

export type OrderType = 'market' | 'limit';
export type OrderSide = 'buy' | 'sell';

export interface LimitOrderParams {
  pool: Pool;
  side: OrderSide;
  price: bigint;
  quantity: bigint;
  expiration?: number;
}

export interface BundledOrderParams {
  pool: Pool;
  side: OrderSide;
  entryPrice: bigint;
  quantity: bigint;
  stopLossPrice?: bigint;
  takeProfitPrice?: bigint;
  sender: string;
}

export interface ActiveOrder {
  orderId: string;
  poolAddress: string;
  side: OrderSide;
  price: number;
  quantity: number;
  filled: number;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
  createdAt: number;
}

/**
 * Validate stop-loss and take-profit prices based on order side
 * For buys: SL should be below entry, TP should be above entry
 * For sells: SL should be above entry, TP should be below entry
 */
export function validateBundledOrderPrices(params: BundledOrderParams): {
  valid: boolean;
  error?: string;
} {
  const { side, entryPrice, stopLossPrice, takeProfitPrice } = params;

  if (side === 'buy') {
    if (stopLossPrice && stopLossPrice >= entryPrice) {
      return {
        valid: false,
        error: 'Stop-loss price must be below entry price for buy orders',
      };
    }
    if (takeProfitPrice && takeProfitPrice <= entryPrice) {
      return {
        valid: false,
        error: 'Take-profit price must be above entry price for buy orders',
      };
    }
  } else {
    // sell
    if (stopLossPrice && stopLossPrice <= entryPrice) {
      return {
        valid: false,
        error: 'Stop-loss price must be above entry price for sell orders',
      };
    }
    if (takeProfitPrice && takeProfitPrice >= entryPrice) {
      return {
        valid: false,
        error: 'Take-profit price must be below entry price for sell orders',
      };
    }
  }

  return { valid: true };
}

/**
 * Convert human-readable price to on-chain price format
 * DeepBook uses fixed-point representation
 */
export function toOnChainPrice(price: number, baseDecimals: number, quoteDecimals: number): bigint {
  // Price is in quote/base, adjust for decimal differences
  const decimalAdjustment = quoteDecimals - baseDecimals;
  const adjustedPrice = price * Math.pow(10, 9 + decimalAdjustment);
  return BigInt(Math.floor(adjustedPrice));
}

/**
 * Convert on-chain price to human-readable format
 */
export function fromOnChainPrice(price: bigint, baseDecimals: number, quoteDecimals: number): number {
  const decimalAdjustment = quoteDecimals - baseDecimals;
  return Number(price) / Math.pow(10, 9 + decimalAdjustment);
}
