"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit-react"
import confetti from "canvas-confetti"
import { SwipeBookProvider, useSwipeBook } from "@/context/SwipeBookContext"
import { BottomNav } from "@/components/swipebook/BottomNav"
import { PortfolioView } from "@/components/swipebook/PortfolioView"
import { TradeHistory } from "@/components/swipebook/TradeHistory"
import { createBet, type Bet } from "@/lib/tap-trade/betting"
import { AssetPill } from "@/components/tap-trade/asset-pill"
import { BalancePill } from "@/components/tap-trade/balance-pill"
import { StakeSelector } from "@/components/tap-trade/stake-selector"
import { UnifiedChart } from "@/components/tap-trade/unified-chart"
import { Toast } from "@/components/tap-trade/toast"
import { TileScaler } from "@/components/tap-trade/tile-scaler"
import { ModeToggle } from "@/components/tap-trade/ModeToggle"
import { QuickTradeControls } from "@/components/tap-trade/QuickTradeControls"
import { LeverageSelector } from "@/components/tap-trade/LeverageSelector"
import { MarginHealthGauge } from "@/components/tap-trade/MarginHealthGauge"
import { RoundHistory } from "@/components/tap-trade/RoundHistory"
import { ResultReveal } from "@/components/tap-trade/ResultReveal"
import { useDeepBookPriceStream } from "@/hooks/tap-trade/useDeepBookPriceStream"
import { useUserBalance } from "@/hooks/useUserBalance"
import { useMarginManager } from "@/hooks/swipebook/useMarginManager"
import { useMarginPosition } from "@/hooks/swipebook/useMarginPosition"
import { useMarginTradeExecution } from "@/hooks/swipebook/useMarginTradeExecution"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { MARGIN_POOL_KEYS, type MarginPoolKey } from "@/lib/deepbook/margin-config"
import type { PredictionRound } from "@/context/SwipeBookContext"
import type { Pool } from "@/lib/swipebook/types"
import type { SwipeBookView } from "@/lib/swipebook/types"

function fireConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#a3e635", "#22d3ee", "#f472b6", "#facc15"],
    disableForReducedMotion: true,
  })
}

function haptic(pattern: number | number[] = 50) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern)
  }
}

const STAKES = [0.5, 1, 5]
const ROWS = 14
const COLS = 12
const TIME_STEP_MS = 5000
const HISTORY_WINDOW_MS = 60000

// Grid target bet: tracks the cell the user clicked for monitoring
interface GridTargetBet {
  priceMin: number
  priceMax: number
  direction: 'long' | 'short'
  absolutePrice: number
}

function TapTradeContent() {
  const router = useRouter()
  const currentAccount = useCurrentAccount()
  const {
    state,
    setView,
    setPredictionMode,
    setQuickTradeState,
    setActivePrediction,
    setLeverage,
    addRound,
  } = useSwipeBook()

  const isQuickMode = state.predictionMode === 'quick'

  // Pool selection
  const allPools = getSwipeBookPools()
  const [selectedPool, setSelectedPool] = useState<Pool>(allPools[0])

  // DeepBook price stream
  const { priceHistory, currentPrice, isConnected } = useDeepBookPriceStream(selectedPool)

  // Real wallet balances
  const { data: quoteBalanceData, isLoading: quoteLoading } = useUserBalance(selectedPool.quoteType)
  const quoteBalance = quoteBalanceData
    ? Number(quoteBalanceData.totalBalance) / Math.pow(10, selectedPool.quoteDecimals)
    : 0
  const { data: baseBalanceData, isLoading: baseLoading } = useUserBalance(selectedPool.baseType)
  const baseBalance = baseBalanceData
    ? Number(baseBalanceData.totalBalance) / Math.pow(10, selectedPool.baseDecimals)
    : 0
  const balanceLoading = quoteLoading || baseLoading

  // Margin manager (shared between Quick Trade and Grid mode)
  const { managerIds, isCreating, createManager } = useMarginManager()

  // Pool-specific manager ID: ensures we have a manager for the CURRENT pool
  // (managerId returns the first available from ANY pool, which may not match)
  const currentPoolManagerId = managerIds[selectedPool.poolKey] ?? null

  // Determine direction from active prediction for margin position query
  const activeDirection = state.activePrediction?.direction === 'long'

  // Margin position query (enabled in both Quick and Grid mode when position is open)
  const hasActivePosition = state.quickTradeState === 'watching' || state.quickTradeState === 'closing'
  const { data: marginPosition } = useMarginPosition({
    managerId: currentPoolManagerId,
    poolKey: selectedPool.poolKey,
    currentPrice,
    isLong: activeDirection,
    enabled: !!currentPoolManagerId && hasActivePosition,
  })

  // Margin trade execution (for Grid mode)
  const { openPosition, closePosition } = useMarginTradeExecution()

  // Grid mode state
  const [gridTargetBet, setGridTargetBet] = useState<GridTargetBet | null>(null)
  const [timerExpired, setTimerExpired] = useState(false)
  const [targetReached, setTargetReached] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const [stake, setStake] = useState(1)
  const [bets, setBets] = useState<Bet[]>([])
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null)
  const [zoom, setZoom] = useState(10)

  const betsRef = useRef(bets)
  betsRef.current = bets
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Zoom-based priceStep
  const priceStep = currentPrice ? currentPrice * (0.002 / zoom) : 0.01

  // Check if current pool supports margin trading
  const poolSupportsMargin = MARGIN_POOL_KEYS.includes(selectedPool.poolKey as typeof MARGIN_POOL_KEYS[number])

  // Auto-switch to grid if pool doesn't support margin
  useEffect(() => {
    if (isQuickMode && !poolSupportsMargin) {
      setPredictionMode('grid')
    }
  }, [selectedPool.poolKey, isQuickMode, poolSupportsMargin, setPredictionMode])

  // Cleanup old order tiles
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setBets((prevBets) =>
        prevBets.filter((bet) => {
          if (bet.status === "open") return true
          return now - bet.expiresAt < 30000
        }),
      )
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Reset tiles when pool changes
  useEffect(() => {
    setBets([])
  }, [selectedPool.address])

  // Grid mode: Timer expiry effect (same pattern as QuickTradeControls)
  useEffect(() => {
    if (isQuickMode) return
    if (state.quickTradeState !== 'watching' || !state.activePrediction) return

    const elapsed = Date.now() - state.activePrediction.startedAt
    const remaining = state.activePrediction.timeframe * 1000 - elapsed

    if (remaining <= 0) {
      setTimerExpired(true)
      return
    }

    closeTimerRef.current = setTimeout(() => {
      setTimerExpired(true)
    }, remaining)

    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [isQuickMode, state.quickTradeState, state.activePrediction])

  // Grid mode: Target price monitoring (every 500ms)
  useEffect(() => {
    if (isQuickMode) return
    if (state.quickTradeState !== 'watching' || !gridTargetBet || !currentPrice) return

    const interval = setInterval(() => {
      if (!currentPrice || !gridTargetBet) return
      if (currentPrice >= gridTargetBet.priceMin && currentPrice <= gridTargetBet.priceMax) {
        setTargetReached(true)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [isQuickMode, state.quickTradeState, gridTargetBet, currentPrice])

  // Reset grid state when prediction clears
  useEffect(() => {
    if (!state.activePrediction) {
      setTimerExpired(false)
      setTargetReached(false)
      setCloseError(null)
      setGridTargetBet(null)
    }
  }, [state.activePrediction])

  // Grid mode cell click handler — opens real margin position
  const handleCellClick = useCallback(
    async (
      row: number,
      col: number,
      priceMin: number,
      priceMax: number,
      expiresAt: number,
      betStartTime: number,
      multiplier: number,
      absolutePrice: number,
    ) => {
      // Block if position already open
      if (state.quickTradeState !== 'idle') {
        setToast({ message: "Position active — close it first", type: "info" })
        return
      }

      if (!currentAccount) {
        setToast({ message: "Connect wallet first", type: "error" })
        return
      }

      if (!currentPoolManagerId) {
        setToast({ message: "Create margin account first", type: "error" })
        return
      }

      if (!currentPrice) return

      // Determine direction: cell above current price = long, below = short
      const direction: 'long' | 'short' = absolutePrice >= currentPrice ? 'long' : 'short'

      setQuickTradeState('opening')

      try {
        const result = await openPosition({
          direction,
          poolKey: selectedPool.poolKey,
          collateral: stake,
          leverage: state.selectedLeverage,
          currentPrice,
        })

        // Create PredictionRound (same shape as Quick Trade)
        const round: PredictionRound = {
          id: result.digest,
          poolKey: selectedPool.poolKey,
          direction,
          leverage: state.selectedLeverage,
          collateral: stake,
          entryPrice: result.entryPrice,
          baseQuantity: result.baseQuantity,
          timeframe: state.selectedTimeframe,
          startedAt: Date.now(),
          txDigestOpen: result.digest,
        }

        setActivePrediction(round)

        // Store target cell for monitoring
        setGridTargetBet({
          priceMin,
          priceMax,
          direction,
          absolutePrice,
        })

        // Create visual bet tile on the chart
        const bet = createBet(stake, multiplier, priceMin, priceMax, expiresAt, betStartTime, row, col, direction)
        setBets([bet])

        setQuickTradeState('watching')

        haptic(30)
        setToast({
          message: `${direction === 'long' ? 'Long' : 'Short'} ${state.selectedLeverage}x opened @ $${currentPrice.toFixed(4)}`,
          type: "success",
        })
      } catch (err) {
        console.error('Failed to open grid position:', err)
        setQuickTradeState('idle')
        const msg = err instanceof Error ? err.message : 'Failed to open position'
        setToast({ message: msg, type: "error" })
      }
    },
    [currentAccount, currentPrice, currentPoolManagerId, stake, state.quickTradeState, state.selectedLeverage, state.selectedTimeframe, selectedPool.poolKey, openPosition, setQuickTradeState, setActivePrediction],
  )

  // Grid mode: close position handler (same pattern as QuickTradeControls)
  const handleGridClose = useCallback(async () => {
    if (!state.activePrediction || !currentPrice) return

    setQuickTradeState('closing')
    setCloseError(null)

    try {
      const isLong = state.activePrediction.direction === 'long'
      const onChainQuantity = marginPosition
        ? (isLong ? marginPosition.baseBalance : marginPosition.baseDebt)
        : state.activePrediction.baseQuantity

      await closePosition({
        poolKey: state.activePrediction.poolKey,
        quantity: onChainQuantity,
        isLong,
      })

      const exitPrice = currentPrice
      const priceDiff = exitPrice - state.activePrediction.entryPrice
      const pnl = state.activePrediction.direction === 'long'
        ? priceDiff * state.activePrediction.collateral * state.activePrediction.leverage / state.activePrediction.entryPrice
        : -priceDiff * state.activePrediction.collateral * state.activePrediction.leverage / state.activePrediction.entryPrice
      const pnlPercent = (pnl / state.activePrediction.collateral) * 100

      const completedRound: PredictionRound = {
        ...state.activePrediction,
        exitPrice,
        closedAt: Date.now(),
        pnl,
        pnlPercent,
        result: pnl > 0 ? 'win' : 'loss',
      }

      // Update bet tile to won/lost
      setBets((prev) =>
        prev.map((b) =>
          b.status === 'open'
            ? { ...b, status: pnl > 0 ? 'won' as const : 'lost' as const, hitAt: Date.now() }
            : b
        ),
      )

      if (pnl > 0) {
        fireConfetti()
        haptic([50, 30, 100])
      } else {
        haptic([100, 50, 100])
      }

      setActivePrediction(completedRound)
      addRound(completedRound)
      setQuickTradeState('result')

      // Auto-reset to idle after 3s
      setTimeout(() => {
        setActivePrediction(null)
        setQuickTradeState('idle')
      }, 3000)
    } catch (err) {
      console.error('Failed to close grid position:', err)
      setCloseError(err instanceof Error ? err.message : 'Close failed')
      setQuickTradeState('watching')
    }
  }, [state.activePrediction, currentPrice, marginPosition, closePosition, setQuickTradeState, setActivePrediction, addRound])

  const handleViewChange = useCallback(
    (view: SwipeBookView) => {
      if (view === "leaderboard") {
        router.push("/swipebook/leaderboard")
        return
      }
      if (view === "profile") {
        router.push("/swipebook/profile")
        return
      }
      setView(view)
    },
    [router, setView],
  )

  // Handle margin manager creation
  const handleCreateManager = useCallback(async () => {
    if (!currentAccount) {
      setToast({ message: "Connect wallet first", type: "error" })
      return
    }
    try {
      const poolKey = selectedPool.poolKey as MarginPoolKey
      await createManager(poolKey)
      setToast({ message: "Margin account created!", type: "success" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create margin account"
      setToast({ message: msg, type: "error" })
    }
  }, [currentAccount, selectedPool.poolKey, createManager, setToast])

  // ResultReveal callback
  const handleResultComplete = useCallback(() => {
    setActivePrediction(null)
    setQuickTradeState('idle')
  }, [setActivePrediction, setQuickTradeState])

  // Grid bottom bar: active position info
  const gridIsActive = !isQuickMode && (state.quickTradeState === 'watching' || state.quickTradeState === 'closing')
  const gridPnl = state.activePrediction && currentPrice
    ? (() => {
        const priceDiff = currentPrice - state.activePrediction.entryPrice
        return state.activePrediction.direction === 'long'
          ? priceDiff * state.activePrediction.collateral * state.activePrediction.leverage / state.activePrediction.entryPrice
          : -priceDiff * state.activePrediction.collateral * state.activePrediction.leverage / state.activePrediction.entryPrice
      })()
    : null
  const gridPnlPercent = gridPnl !== null && state.activePrediction
    ? (gridPnl / state.activePrediction.collateral) * 100
    : null

  // Portfolio / History views
  if (state.currentView === "portfolio") {
    return (
      <div className="flex flex-col h-screen gradient-bg">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/40 backdrop-blur-sm">
          <h1 className="text-lg font-bold text-foreground">Portfolio</h1>
          <ConnectButton />
        </header>
        <main className="flex-1 overflow-auto pb-20">
          <PortfolioView />
        </main>
        <BottomNav currentView={state.currentView} onViewChange={handleViewChange} isAuthenticated={!!currentAccount} />
      </div>
    )
  }

  if (state.currentView === "history") {
    return (
      <div className="flex flex-col h-screen gradient-bg">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/40 backdrop-blur-sm">
          <h1 className="text-lg font-bold text-foreground">Trade History</h1>
          <ConnectButton />
        </header>
        <main className="flex-1 overflow-auto pb-20">
          <TradeHistory />
        </main>
        <BottomNav currentView={state.currentView} onViewChange={handleViewChange} isAuthenticated={!!currentAccount} />
      </div>
    )
  }

  // Main trading view
  return (
    <div className="fixed inset-0 overflow-hidden gradient-bg dotted-bg">
      {/* Testnet indicator */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-amber-500/90 text-black text-center text-[10px] font-bold py-0.5">
        TESTNET
      </div>

      {/* Top bar */}
      <div className="absolute left-0 right-0 z-20 px-3 pb-1 top-[20px] pt-2">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Asset pill */}
          <AssetPill
            pool={selectedPool}
            price={currentPrice}
            isConnected={isConnected}
            pools={allPools}
            onPoolChange={setSelectedPool}
          />
          {/* Right: Mode toggle + Live + Connect */}
          <div className="flex items-center gap-1.5 shrink-0">
            {poolSupportsMargin && (
              <ModeToggle
                mode={state.predictionMode}
                onChange={setPredictionMode}
                disabled={state.quickTradeState !== 'idle'}
              />
            )}
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium ${
                isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
              <span className="hidden sm:inline">{isConnected ? "Live" : "..."}</span>
            </div>
            <ConnectButton />
          </div>
        </div>

        {/* Second row: Zoom selector (grid mode) or Round History (quick mode) */}
        <div className="flex justify-center mt-1.5">
          {isQuickMode ? (
            <RoundHistory rounds={state.roundHistory} />
          ) : (
            <TileScaler zoom={zoom} onZoomChange={setZoom} />
          )}
        </div>
      </div>

      {/* Bottom overlays - above nav */}
      <div className="absolute bottom-[84px] left-0 right-0 z-20">
        {isQuickMode ? (
          /* Quick Trade Mode: UP/DOWN controls */
          <div className="bg-black/40 backdrop-blur-sm border-t border-white/5">
            {!currentAccount ? (
              <div className="p-4 text-center text-white/50 text-sm">
                Connect wallet to trade
              </div>
            ) : !currentPoolManagerId ? (
              <div className="p-4 text-center">
                <button
                  onClick={handleCreateManager}
                  disabled={isCreating}
                  className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium text-sm disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create Margin Account'}
                </button>
                <p className="text-white/40 text-xs mt-2">Required for leveraged trading</p>
              </div>
            ) : (
              <QuickTradeControls
                currentPrice={currentPrice}
                poolKey={selectedPool.poolKey}
                stake={stake}
                riskRatio={marginPosition?.riskRatio}
                marginPosition={marginPosition}
              />
            )}
          </div>
        ) : (
          /* Grid Mode: Real margin trading bottom bar */
          <div className="bg-black/40 backdrop-blur-sm border-t border-white/5">
            {!currentAccount ? (
              <div className="p-4 text-center text-white/50 text-sm">
                Connect wallet to trade
              </div>
            ) : !poolSupportsMargin ? (
              <div className="flex items-center justify-between px-3 py-2">
                <BalancePill
                  baseBalance={baseBalance}
                  quoteBalance={quoteBalance}
                  baseCoin={selectedPool.baseCoin}
                  quoteCoin={selectedPool.quoteCoin}
                  isLoading={balanceLoading}
                  isConnected={!!currentAccount}
                />
                <StakeSelector stake={stake} stakes={STAKES} onStakeChange={setStake} />
              </div>
            ) : !currentPoolManagerId ? (
              <div className="p-4 text-center">
                <button
                  onClick={handleCreateManager}
                  disabled={isCreating}
                  className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium text-sm disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create Margin Account'}
                </button>
                <p className="text-white/40 text-xs mt-2">Required for grid trading</p>
              </div>
            ) : state.quickTradeState === 'opening' ? (
              <div className="p-4 text-center text-white/50 text-sm">
                Opening position...
              </div>
            ) : state.quickTradeState === 'result' && state.activePrediction ? (
              /* Result display */
              <div className={`p-3 text-center rounded-t-xl ${state.activePrediction.result === 'win' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <div className={`text-2xl font-bold ${state.activePrediction.result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                  {state.activePrediction.pnl && state.activePrediction.pnl >= 0 ? '+' : ''}${state.activePrediction.pnl?.toFixed(2)}
                </div>
                <div className="text-xs text-white/50">
                  {state.activePrediction.pnlPercent?.toFixed(1)}% PnL
                </div>
              </div>
            ) : state.quickTradeState === 'closing' ? (
              <div className="p-4 text-center text-white/50 text-sm">
                Closing position...
              </div>
            ) : gridIsActive && state.activePrediction ? (
              /* Watching: position info + close button */
              <div className="flex flex-col gap-2 p-3">
                {/* Position info row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${state.activePrediction.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                      {state.activePrediction.direction.toUpperCase()} {state.activePrediction.leverage}x
                    </span>
                    <span className="text-xs text-white/40">
                      @ ${state.activePrediction.entryPrice.toFixed(4)}
                    </span>
                  </div>
                  <div className="text-right">
                    {gridPnl !== null && (
                      <span className={`text-sm font-bold font-mono ${gridPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {gridPnl >= 0 ? '+' : ''}${gridPnl.toFixed(2)} ({gridPnlPercent?.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Health gauge */}
                <div className="flex justify-center">
                  <MarginHealthGauge riskRatio={marginPosition?.riskRatio ?? 2.0} visible={true} />
                </div>

                {/* Close error */}
                {closeError && (
                  <div className="text-center text-xs text-red-400/80">
                    Close failed — approve wallet to close position
                  </div>
                )}

                {/* Status + Close button */}
                {targetReached ? (
                  <button
                    onClick={handleGridClose}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30 transition-colors"
                  >
                    Target reached! Close to collect
                  </button>
                ) : timerExpired ? (
                  <button
                    onClick={handleGridClose}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/30 transition-colors"
                  >
                    Expired — Close Position (Approve Wallet)
                  </button>
                ) : (
                  <button
                    onClick={handleGridClose}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-white/10 text-white/70 hover:bg-white/15 transition-colors"
                  >
                    Close Position
                  </button>
                )}
              </div>
            ) : (
              /* Idle: Balance + Leverage + Stake */
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between">
                  <BalancePill
                    baseBalance={baseBalance}
                    quoteBalance={quoteBalance}
                    baseCoin={selectedPool.baseCoin}
                    quoteCoin={selectedPool.quoteCoin}
                    isLoading={balanceLoading}
                    isConnected={!!currentAccount}
                  />
                  <StakeSelector stake={stake} stakes={STAKES} onStakeChange={setStake} />
                </div>
                <div className="flex justify-center">
                  <LeverageSelector
                    leverage={state.selectedLeverage}
                    poolKey={selectedPool.poolKey as MarginPoolKey}
                    onChange={setLeverage}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart area */}
      <div className="h-full w-full pt-[100px] sm:pt-[104px] pb-[128px] sm:pb-[120px]">
        {!isQuickMode ? (
          <UnifiedChart
            priceHistory={priceHistory}
            currentPrice={currentPrice}
            rows={ROWS}
            cols={COLS}
            priceStep={priceStep}
            timeStepMs={TIME_STEP_MS}
            historyWindowMs={HISTORY_WINDOW_MS}
            bets={bets}
            canBuy={!!currentAccount && !!currentPoolManagerId && state.quickTradeState === 'idle'}
            canSell={!!currentAccount && !!currentPoolManagerId && state.quickTradeState === 'idle'}
            onCellClick={state.quickTradeState !== 'idle' ? () => {} : handleCellClick}
            activePrediction={state.activePrediction}
            quickTradeState={state.quickTradeState}
            predictionMode="grid"
            selectedLeverage={state.selectedLeverage}
          />
        ) : (
          /* Quick mode: show chart without grid overlay */
          <UnifiedChart
            priceHistory={priceHistory}
            currentPrice={currentPrice}
            rows={ROWS}
            cols={COLS}
            priceStep={priceStep}
            timeStepMs={TIME_STEP_MS}
            historyWindowMs={HISTORY_WINDOW_MS}
            bets={[]}
            canBuy={false}
            canSell={false}
            onCellClick={() => {}}
            activePrediction={state.activePrediction}
            quickTradeState={state.quickTradeState}
            predictionMode="quick"
            selectedLeverage={state.selectedLeverage}
          />
        )}
      </div>

      {/* ResultReveal overlay */}
      {state.quickTradeState === 'result' && state.activePrediction && (
        <ResultReveal
          round={state.activePrediction}
          xpEarned={0}
          onComplete={handleResultComplete}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Bottom Navigation */}
      <BottomNav currentView={state.currentView} onViewChange={handleViewChange} isAuthenticated={!!currentAccount} />
    </div>
  )
}

export default function SwipeBookPage() {
  return (
    <SwipeBookProvider>
      <TapTradeContent />
    </SwipeBookProvider>
  )
}
