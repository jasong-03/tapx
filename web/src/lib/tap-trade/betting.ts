export type BetStatus = "open" | "won" | "lost"

export interface Bet {
  id: string
  placedAt: number
  expiresAt: number
  betStartTime: number
  priceMin: number
  priceMax: number
  multiplier: number
  stake: number
  status: BetStatus
  row: number
  col: number
  hitAt?: number
}

export function createBet(
  stake: number,
  multiplier: number,
  priceMin: number,
  priceMax: number,
  expiresAt: number,
  betStartTime: number,
  row: number,
  col: number,
): Bet {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    placedAt: Date.now(),
    expiresAt,
    betStartTime,
    priceMin,
    priceMax,
    multiplier,
    stake,
    status: "open",
    row,
    col,
  }
}

export function checkBetWin(bet: Bet, price: number, currentTime: number = Date.now()): boolean {
  if (bet.status !== "open") return false

  const priceInRange = price >= bet.priceMin && price <= bet.priceMax
  const timeInRange = currentTime >= bet.betStartTime && currentTime < bet.expiresAt

  return priceInRange && timeInRange
}

export function isBetExpired(bet: Bet): boolean {
  return Date.now() >= bet.expiresAt
}
