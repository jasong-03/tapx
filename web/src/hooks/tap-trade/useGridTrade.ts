/**
 * Hook encapsulating Grid Trade business logic.
 * Prediction game: click cell, if price line enters cell = win (stake × multiplier).
 * Funded by session balance (real deposit via backend API).
 * Every win/loss triggers a real on-chain SUI transfer with tx hash proof.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { createBet, checkBetWin, isBetExpired, type Bet } from '@/lib/tap-trade/betting'
import { effects } from '@/lib/tap-trade/effects'
import { formatMultiplier } from '@/lib/tap-trade/formatters'
import type { ToastType } from './useToast'

interface UseGridTradeParams {
  currentPrice: number | null
  sessionBalance: number
  stake: number
  priceStep: number
  onBalanceChange: (delta: number) => void
  onBetResolved?: (betId: string, result: 'win' | 'loss', stake: number, payout: number) => void
  showToast: (message: string, type: ToastType) => void
}

export function useGridTrade({
  currentPrice,
  sessionBalance,
  stake,
  priceStep,
  onBalanceChange,
  onBetResolved,
  showToast,
}: UseGridTradeParams) {
  const [bets, setBets] = useState<Bet[]>([])
  const betsRef = useRef(bets)
  betsRef.current = bets

  // Cleanup old bets (keep closed bets for 30s for visual feedback)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setBets(prevBets =>
        prevBets.filter(bet => {
          if (bet.status === 'open') return true
          return now - bet.expiresAt < 30000
        })
      )
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // Auto-resolve bets: check if price entered cell (win) or time expired (loss)
  useEffect(() => {
    if (!currentPrice) return

    const interval = setInterval(() => {
      const now = Date.now()
      const price = currentPrice
      if (!price) return

      setBets(prev => {
        let balanceDelta = 0

        const updated = prev.map(bet => {
          if (bet.status !== 'open') return bet

          // Check win: price entered the cell
          if (checkBetWin(bet, price, now)) {
            const payout = bet.stake * bet.multiplier
            balanceDelta += payout
            effects.celebrateWin()
            console.log(
              `%c[WIN] %cBet ${bet.id} | stake=$${bet.stake} × ${bet.multiplier}x = +$${payout.toFixed(2)} | price=${price} hit [${bet.priceMin.toFixed(6)}, ${bet.priceMax.toFixed(6)}] | sending on-chain...`,
              'color: #00ff00; font-weight: bold',
              'color: #aaffaa'
            )
            onBetResolved?.(bet.id, 'win', bet.stake, payout)
            return { ...bet, status: 'won' as const, hitAt: now }
          }

          // Check expired: time ran out without hitting
          if (isBetExpired(bet)) {
            effects.notifyLoss()
            console.log(
              `%c[LOST] %cBet ${bet.id} | stake=$${bet.stake} | price=${price} missed [${bet.priceMin.toFixed(6)}, ${bet.priceMax.toFixed(6)}] | sending to house...`,
              'color: #ff4444; font-weight: bold',
              'color: #ffaaaa'
            )
            onBetResolved?.(bet.id, 'loss', bet.stake, 0)
            return { ...bet, status: 'lost' as const }
          }

          return bet
        })

        if (balanceDelta !== 0) {
          onBalanceChange(balanceDelta)
        }

        return updated
      })
    }, 500)

    return () => clearInterval(interval)
  }, [currentPrice, onBalanceChange, onBetResolved])

  // Handle cell click to place bet
  const handleCellClick = useCallback(
    (
      row: number,
      col: number,
      priceMin: number,
      priceMax: number,
      expiresAt: number,
      betStartTime: number,
      multiplier: number,
      absolutePrice: number
    ) => {
      if (!currentPrice) return

      // Check for duplicate bet on same cell
      const existingBet = betsRef.current.find(
        b =>
          b.betStartTime === betStartTime &&
          Math.abs((b.priceMin + b.priceMax) / 2 - absolutePrice) < priceStep / 2 &&
          b.status === 'open'
      )

      if (existingBet) {
        showToast('Order already placed here', 'info')
        return
      }

      // Check balance
      if (sessionBalance < stake) {
        showToast('Insufficient balance — deposit more', 'error')
        return
      }

      const direction: 'long' | 'short' = absolutePrice >= currentPrice ? 'long' : 'short'

      // Deduct stake from balance
      onBalanceChange(-stake)

      // Create bet tile for canvas rendering
      const bet = createBet(
        stake,
        multiplier,
        priceMin,
        priceMax,
        expiresAt,
        betStartTime,
        row,
        col,
        direction
      )

      setBets(prev => [...prev, bet])
      effects.tap()

      console.log(
        `%c[BET] %c${direction.toUpperCase()} $${stake} @ ${formatMultiplier(multiplier)} | id=${bet.id} | range=[${priceMin.toFixed(6)}, ${priceMax.toFixed(6)}] | expires=${new Date(expiresAt).toLocaleTimeString()}`,
        'color: #00ccff; font-weight: bold',
        'color: #aaddff'
      )

      showToast(
        `${direction === 'long' ? 'Long' : 'Short'} $${stake} @ ${formatMultiplier(multiplier)}`,
        'success'
      )
    },
    [currentPrice, stake, sessionBalance, priceStep, onBalanceChange, showToast]
  )

  return {
    bets,
    setBets,
    handleCellClick,
    openBetCount: bets.filter(b => b.status === 'open').length,
  }
}
