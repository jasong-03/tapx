export function displayMultiplier({
  P0,
  Pt,
  leverage = 100,
  feeIn = 0.05,
  feeWin = 0.05,
  baseMulti = 1.5,
}: {
  P0: number
  Pt: number
  leverage?: number
  feeIn?: number
  feeWin?: number
  baseMulti?: number
}) {
  // absolute move needed to touch Pt from P0
  const r = Pt >= P0 ? Pt / P0 - 1 : 1 - Pt / P0

  const grossMultiple = baseMulti + leverage * r
  const netMultiple = (1 - feeIn) * (1 - feeWin) * grossMultiple

  return netMultiple
}

// For UI label like "1.8x"
export function formatMultiplierX(m: number) {
  return `${m.toFixed(1)}x`
}

// Keep old function signature for compatibility, now calls displayMultiplier internally
export function calculateMultiplier(
  currentPrice: number,
  targetPrice: number,
  leverage?: number,
  feeIn?: number,
  feeWin?: number,
): number {
  return displayMultiplier({
    P0: currentPrice,
    Pt: targetPrice,
    leverage,
    feeIn,
    feeWin,
  })
}

export function formatMultiplier(mult: number): string {
  return `${mult.toFixed(2)}x`
}

/**
 * Calculate leverage-adjusted cell multiplier for grid mode.
 * Returns percentage return if price reaches target.
 */
export function calculateLeveragedMultiplier(
  currentPrice: number,
  targetPrice: number,
  leverage: number,
): number {
  const distance = Math.abs(targetPrice - currentPrice) / currentPrice;
  return leverage * distance * 100; // as percentage
}
