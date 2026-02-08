/**
 * Formatting utilities for trading UI
 */

/**
 * Format multiplier for display (e.g., 2.5x)
 */
export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`
}

/**
 * Format token amount with proper decimals
 */
export function formatTokenAmount(
  balance: bigint | number,
  decimals: number
): number {
  const amount = typeof balance === 'bigint' ? Number(balance) : balance
  return amount / Math.pow(10, decimals)
}

/**
 * Calculate price step based on current price and zoom level
 */
export function calculatePriceStep(
  currentPrice: number | null,
  zoom: number = 1,
  baseMultiplier: number = 0.002
): number {
  if (!currentPrice) return 0.01
  return currentPrice * (baseMultiplier / zoom)
}

/**
 * Format price for display
 */
export function formatPrice(price: number, decimals: number = 4): string {
  return price.toFixed(decimals)
}
