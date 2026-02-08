/**
 * Hook encapsulating Quick Trade business logic
 */
import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSwipeBook } from '@/context/SwipeBookContext'
import { useMarginManager } from '@/hooks/swipebook/useMarginManager'
import { useMarginPosition } from '@/hooks/swipebook/useMarginPosition'
import { MARGIN_POOL_KEYS, type MarginPoolKey, getMaxLeverage } from '@/lib/deepbook/margin-config'
import type { Pool } from '@/lib/swipebook/types'
import type { ToastType } from './useToast'

interface UseQuickTradeParams {
  selectedPool: Pool
  currentPrice: number | null
  showToast: (message: string, type: ToastType) => void
}

export function useQuickTrade({
  selectedPool,
  currentPrice,
  showToast,
}: UseQuickTradeParams) {
  const router = useRouter()
  const {
    state,
    setQuickTradeState,
    setActivePrediction,
    setLeverage,
  } = useSwipeBook()

  const { managerIds, isCreating, createManager, marginManagers } = useMarginManager()
  const currentPoolManagerId = managerIds[selectedPool.poolKey] ?? null

  // Check if pool supports margin trading
  const poolSupportsMargin = MARGIN_POOL_KEYS.includes(
    selectedPool.poolKey as typeof MARGIN_POOL_KEYS[number]
  )

  // Margin position query
  const activeDirection = state.activePrediction?.direction === 'long'
  const hasActivePosition =
    state.quickTradeState === 'watching' || state.quickTradeState === 'closing'

  const { data: marginPosition } = useMarginPosition({
    managerId: currentPoolManagerId,
    poolKey: selectedPool.poolKey,
    currentPrice,
    isLong: activeDirection,
    enabled: !!currentPoolManagerId && hasActivePosition,
  })

  // Redirect to grid if pool doesn't support margin
  useEffect(() => {
    if (!poolSupportsMargin) {
      router.replace('/swipebook/grid')
    }
  }, [poolSupportsMargin, router])

  // Clear state and auto-cap leverage on pool change
  useEffect(() => {
    setActivePrediction(null)
    setQuickTradeState('idle')

    if (poolSupportsMargin) {
      const maxLeverage = getMaxLeverage(selectedPool.poolKey as MarginPoolKey)
      if (state.selectedLeverage > maxLeverage) {
        setLeverage(maxLeverage)
      }
    }
  }, [
    selectedPool.poolKey,
    poolSupportsMargin,
    state.selectedLeverage,
    setActivePrediction,
    setQuickTradeState,
    setLeverage,
  ])

  // Handle margin manager creation
  const handleCreateManager = useCallback(async () => {
    try {
      const poolKey = selectedPool.poolKey as MarginPoolKey
      await createManager(poolKey)
      showToast('Margin account created!', 'success')
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Failed to create margin account'
      showToast(message, 'error')
    }
  }, [selectedPool.poolKey, createManager, showToast])

  // Handle result reveal completion
  const handleResultComplete = useCallback(() => {
    setActivePrediction(null)
    setQuickTradeState('idle')
  }, [setActivePrediction, setQuickTradeState])

  return {
    // Manager state
    currentPoolManagerId,
    isCreatingManager: isCreating,
    poolSupportsMargin,
    marginManagers,

    // Position data
    marginPosition,
    hasActivePosition,

    // Quick trade state
    quickTradeState: state.quickTradeState,
    activePrediction: state.activePrediction,
    selectedLeverage: state.selectedLeverage,
    roundHistory: state.roundHistory,

    // Actions
    handleCreateManager,
    handleResultComplete,
  }
}
