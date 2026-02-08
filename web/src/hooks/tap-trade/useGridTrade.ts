/**
 * Hook encapsulating Grid Trade business logic
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { createBet, checkBetWin, isBetExpired, type Bet } from '@/lib/tap-trade/betting'
import { effects } from '@/lib/tap-trade/effects'
import { formatMultiplier } from '@/lib/tap-trade/formatters'
import type { ToastType } from './useToast'

interface UseGridTradeParams {
  currentPrice: number | null
  predictionBalance: number
  stake: number
  priceStep: number
  setPredictionBalance: (value: number | ((prev: number) => number)) => void
  showToast: (message: string, type: ToastType) => void
}

export function useGridTrade({
  currentPrice,
  predictionBalance,
  stake,
  priceStep,
  setPredictionBalance,
  showToast,
}: UseGridTradeParams) {
  const [bets, setBets] = useState<Bet[]>([])
  const betsRef = useRef(bets)
  betsRef.current = bets

  // Cleanup old bets
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setBets(prevBets =>
        prevBets.filter(bet => {
          if (bet.status === 'open') return true
          return now - bet.expiresAt < 30000 // Keep closed bets for 30s
        })
      )
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // Auto-resolve bets
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

          // Check win
          if (checkBetWin(bet, price, now)) {
            balanceDelta += bet.stake * bet.multiplier
            effects.celebrateWin()
            return { ...bet, status: 'won' as const, hitAt: now }
          }

          // Check expired
          if (isBetExpired(bet)) {
            effects.notifyLoss()
            return { ...bet, status: 'lost' as const }
          }

          return bet
        })

        if (balanceDelta !== 0) {
          setPredictionBalance(prev => prev + balanceDelta)
        }

        return updated
      })
    }, 500)

    return () => clearInterval(interval)
  }, [currentPrice, setPredictionBalance])

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

      // Check for duplicate bet
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
      if (predictionBalance < stake) {
        showToast('Insufficient prediction balance', 'error')
        return
      }

      const direction: 'long' | 'short' = absolutePrice >= currentPrice ? 'long' : 'short'

      // Deduct stake
      setPredictionBalance(prev => prev - stake)

      // Create bet
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

      showToast(
        `${direction === 'long' ? 'Long' : 'Short'} $${stake} @ ${formatMultiplier(multiplier)}`,
        'success'
      )
    },
    [currentPrice, stake, predictionBalance, priceStep, setPredictionBalance, showToast]
  )

  return {
    bets,
    setBets,
    handleCellClick,
    openBetCount: bets.filter(b => b.status === 'open').length,
  }
}
