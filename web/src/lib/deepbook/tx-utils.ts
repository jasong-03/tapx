const TRANSIENT_STATUS_CODES = [502, 503, 504];

export function getUserFriendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (TRANSIENT_STATUS_CODES.some((code) => msg.includes(`status code: ${code}`))) {
    return 'Network is busy. Please try again in a few seconds.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('network error')) {
    return 'Network connection lost. Check your internet and try again.';
  }
  if (msg.includes('Rejected') || msg.includes('rejected') || msg.includes('User rejected')) {
    return 'Transaction was rejected in your wallet.';
  }
  if (msg.includes('Insufficient') || msg.includes('insufficient')) {
    return 'Insufficient balance for this trade.';
  }
  // DeepBook pool::swap_exact_quantity abort codes
  if (msg.includes('swap_exact_quantity') && msg.includes(', 12)')) {
    return 'Not enough liquidity in the pool. Try a smaller amount or different pair.';
  }
  if (msg.includes('swap_exact_quantity') && msg.includes(', 1)')) {
    return 'Trade amount is too small. Increase the amount and try again.';
  }
  // Pyth oracle stale price
  if (msg.includes('check_price_is_fresh') || (msg.includes('pyth') && msg.includes(', 3)'))) {
    return 'Oracle price is stale. Please try again in a few seconds.';
  }
  // DeepBook order_info::validate_inputs
  if (msg.includes('validate_inputs') && msg.includes(', 1)')) {
    return 'Order quantity too small. Increase the trade amount.';
  }
  return msg;
}
