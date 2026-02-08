/**
 * Hook for managing virtual prediction balance in localStorage
 */
import { useState, useEffect } from 'react'
import { TRADING_CONSTANTS } from '@/lib/tap-trade/constants'

const STORAGE_KEY_PREFIX = 'tapx_pred_balance_'

function loadBalance(address: string): number {
  if (typeof window === 'undefined') {
    return TRADING_CONSTANTS.GRID_MODE.INITIAL_PREDICTION_BALANCE
  }

  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${address}`)
    return stored
      ? parseFloat(stored)
      : TRADING_CONSTANTS.GRID_MODE.INITIAL_PREDICTION_BALANCE
  } catch {
    return TRADING_CONSTANTS.GRID_MODE.INITIAL_PREDICTION_BALANCE
  }
}

function saveBalance(address: string, balance: number): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${address}`, String(balance))
  } catch (error) {
    console.warn('Failed to save prediction balance:', error)
  }
}

export function usePredictionBalance(walletAddress: string | undefined) {
  const [balance, setBalance] = useState<number>(
    TRADING_CONSTANTS.GRID_MODE.INITIAL_PREDICTION_BALANCE
  )

  // Load balance when wallet connects
  useEffect(() => {
    if (walletAddress) {
      setBalance(loadBalance(walletAddress))
    }
  }, [walletAddress])

  // Save balance whenever it changes
  useEffect(() => {
    if (walletAddress) {
      saveBalance(walletAddress, balance)
    }
  }, [balance, walletAddress])

  return {
    balance,
    setBalance,
    addBalance: (amount: number) => setBalance(prev => prev + amount),
    subtractBalance: (amount: number) => setBalance(prev => prev - amount),
    resetBalance: () => setBalance(TRADING_CONSTANTS.GRID_MODE.INITIAL_PREDICTION_BALANCE),
  }
}
