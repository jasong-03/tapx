"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit-react"
import confetti from "canvas-confetti"
import { SwipeBookProvider, useSwipeBook } from "@/context/SwipeBookContext"
import { BottomNav } from "@/components/swipebook/BottomNav"
import { PortfolioView } from "@/components/swipebook/PortfolioView"
import { TradeHistory } from "@/components/swipebook/TradeHistory"
import { createBet, checkBetWin, isBetExpired, type Bet } from "@/lib/tap-trade/betting"
import { AssetPill } from "@/components/tap-trade/asset-pill"
import { BalancePill } from "@/components/tap-trade/balance-pill"
import { StakeSelector } from "@/components/tap-trade/stake-selector"
import { UnifiedChart } from "@/components/tap-trade/unified-chart"
import { Toast } from "@/components/tap-trade/toast"
import { TileScaler } from "@/components/tap-trade/tile-scaler"
import { ModeToggle } from "@/components/tap-trade/ModeToggle"
import { QuickTradeControls } from "@/components/tap-trade/QuickTradeControls"
import { RoundHistory } from "@/components/tap-trade/RoundHistory"
import { ResultReveal } from "@/components/tap-trade/ResultReveal"
import { PredictionOverlay } from "@/components/tap-trade/PredictionOverlay"
import { usePythPriceStream } from "@/hooks/tap-trade/usePythPriceStream"
import { useUserBalance } from "@/hooks/useUserBalance"
import { useMarginManager } from "@/hooks/swipebook/useMarginManager"
import { useMarginPosition } from "@/hooks/swipebook/useMarginPosition"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { MARGIN_POOL_KEYS, type MarginPoolKey } from "@/lib/deepbook/margin-config"
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
const INITIAL_PREDICTION_BALANCE = 100

// --- Prediction balance persistence (keyed by wallet) ---
function loadPredictionBalance(address: string): number {
  if (typeof window === 'undefined') return INITIAL_PREDICTION_BALANCE
  try {
    const stored = localStorage.getItem(`tapx_pred_balance_${address}`)
    return stored ? parseFloat(stored) : INITIAL_PREDICTION_BALANCE
  } catch {
    return INITIAL_PREDICTION_BALANCE
  }
}

function savePredictionBalance(address: string, balance: number): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`tapx_pred_balance_${address}`, String(balance))
  } catch {}
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
  } = useSwipeBook()

  const isQuickMode = state.predictionMode === 'quick'

  // Pool selection
  const allPools = getSwipeBookPools()
  const [selectedPool, setSelectedPool] = useState<Pool>(allPools[0])

  // Pyth oracle price stream (real mainnet prices, fluctuates naturally)
  const { priceHistory, currentPrice, isConnected } = usePythPriceStream(selectedPool)

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

  // Margin manager (for Quick Trade mode)
  const { managerId, isCreating, createManager, managerIds, marginManagers } = useMarginManager()
  const currentPoolManagerId = managerIds[selectedPool.poolKey] ?? null

  // Determine direction from active prediction for margin position query
  const activeDirection = state.activePrediction?.direction === 'long'

  // Margin position query (Quick Trade only, when position is open)
  const hasActivePosition = isQuickMode && (state.quickTradeState === 'watching' || state.quickTradeState === 'closing')
  const { data: marginPosition } = useMarginPosition({
    managerId: currentPoolManagerId,
    poolKey: selectedPool.poolKey,
    currentPrice,
    isLong: activeDirection,
    enabled: !!currentPoolManagerId && hasActivePosition,
  })

  // --- Grid mode: virtual prediction balance ---
  const [predictionBalance, setPredictionBalance] = useState(INITIAL_PREDICTION_BALANCE)

  // Load prediction balance on wallet connect
  useEffect(() => {
    if (currentAccount?.address) {
      setPredictionBalance(loadPredictionBalance(currentAccount.address))
    }
  }, [currentAccount?.address])

  // Save whenever balance changes
  useEffect(() => {
    if (currentAccount?.address) {
      savePredictionBalance(currentAccount.address, predictionBalance)
    }
  }, [predictionBalance, currentAccount?.address])

  const [stake, setStake] = useState(1)
  const [bets, setBets] = useState<Bet[]>([])
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null)
  const [zoom, setZoom] = useState(10)

  const betsRef = useRef(bets)
  betsRef.current = bets

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

  // Clear Quick Trade overlay when switching to Grid mode or changing pools
  useEffect(() => {
    if (!isQuickMode) {
      // Entering Grid mode — clear any stale Quick Trade state
      setActivePrediction(null)
      setQuickTradeState('idle')
    }
  }, [isQuickMode, setActivePrediction, setQuickTradeState])

  useEffect(() => {
    // Pool changed — clear Quick Trade state to avoid stale overlays
    setActivePrediction(null)
    setQuickTradeState('idle')
  }, [selectedPool.poolKey, setActivePrediction, setQuickTradeState])

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

  // --- Grid mode: auto-resolve bets (virtual) ---
  useEffect(() => {
    if (isQuickMode || !currentPrice) return

    const interval = setInterval(() => {
      const now = Date.now()
      const price = currentPrice
      if (!price) return

      setBets((prev) => {
        let balanceDelta = 0
        const updated = prev.map((bet) => {
          if (bet.status !== 'open') return bet

          // Check win: price in range during the bet's time window
          if (checkBetWin(bet, price, now)) {
            balanceDelta += bet.stake * bet.multiplier
            haptic([50, 30, 100])
            fireConfetti()
            return { ...bet, status: 'won' as const, hitAt: now }
          }

          // Check expired
          if (isBetExpired(bet)) {
            balanceDelta -= 0 // stake already deducted on placement
            haptic([100, 50, 100])
            return { ...bet, status: 'lost' as const }
          }

          return bet
        })

        if (balanceDelta !== 0) {
          setPredictionBalance((prev) => prev + balanceDelta)
        }

        return updated
      })
    }, 500)

    return () => clearInterval(interval)
  }, [isQuickMode, currentPrice])

  // Grid mode cell click handler — virtual prediction bet
  const handleCellClick = useCallback(
    (
      row: number,
      col: number,
      priceMin: number,
      priceMax: number,
      expiresAt: number,
      betStartTime: number,
      multiplier: number,
      absolutePrice: number,
    ) => {
      if (!currentPrice) return

      // Prevent duplicate on same cell
      const existingBet = betsRef.current.find(
        (b) =>
          b.betStartTime === betStartTime &&
          Math.abs((b.priceMin + b.priceMax) / 2 - absolutePrice) < priceStep / 2 &&
          b.status === "open",
      )
      if (existingBet) {
        setToast({ message: "Order already placed here", type: "info" })
        return
      }

      // Check prediction balance
      if (predictionBalance < stake) {
        setToast({ message: "Insufficient prediction balance", type: "error" })
        return
      }

      const direction: 'long' | 'short' = absolutePrice >= currentPrice ? 'long' : 'short'

      // Deduct stake from prediction balance
      setPredictionBalance((prev) => prev - stake)

      // Create bet tile
      const bet = createBet(stake, multiplier, priceMin, priceMax, expiresAt, betStartTime, row, col, direction)
      setBets((prev) => [...prev, bet])

      haptic(30)
      setToast({
        message: `${direction === 'long' ? 'Long' : 'Short'} $${stake} @ ${formatMultiplier(multiplier)}`,
        type: "success",
      })
    },
    [currentPrice, stake, predictionBalance, priceStep],
  )

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

  // Handle margin manager creation (Quick Trade only)
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

  // ResultReveal callback (Quick Trade)
  const handleResultComplete = useCallback(() => {
    setActivePrediction(null)
    setQuickTradeState('idle')
  }, [setActivePrediction, setQuickTradeState])

  // Count open bets for grid mode
  const openBetCount = bets.filter((b) => b.status === 'open').length

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
          /* Quick Trade Mode: real margin trading */
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
                stakes={STAKES}
                onStakeChange={setStake}
                marginManagers={marginManagers}
                riskRatio={marginPosition?.riskRatio}
                marginPosition={marginPosition}
              />
            )}
          </div>
        ) : (
          /* Grid Mode: virtual prediction bets */
          <div className="bg-black/40 backdrop-blur-sm border-t border-white/5">
            <div className="flex items-center justify-between px-3 py-2">
              <BalancePill
                baseBalance={baseBalance}
                quoteBalance={quoteBalance}
                baseCoin={selectedPool.baseCoin}
                quoteCoin={selectedPool.quoteCoin}
                isLoading={balanceLoading}
                isConnected={!!currentAccount}
                predictionBalance={predictionBalance}
              />
              <div className="flex items-center gap-2">
                {openBetCount > 0 && (
                  <span className="text-xs text-neon-lime font-mono">
                    {openBetCount} open
                  </span>
                )}
                <StakeSelector stake={stake} stakes={STAKES} onStakeChange={setStake} />
              </div>
            </div>
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
            canBuy={predictionBalance >= stake}
            canSell={predictionBalance >= stake}
            onCellClick={handleCellClick}
            predictionMode="grid"
          />
        ) : (
          /* Quick mode: chart with prediction overlay */
          <div className="relative h-full w-full">
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
            />
            {/* Prediction overlay shown during active trade (watching + triggered + closing + settling) */}
            {state.activePrediction && ['watching', 'triggered', 'closing', 'settling'].includes(state.quickTradeState) && (
              <PredictionOverlay
                entryPrice={state.activePrediction.entryPrice}
                currentPrice={currentPrice}
                direction={state.activePrediction.direction}
                tpPrice={state.activePrediction.tpPrice}
                slPrice={state.activePrediction.slPrice}
                triggeredSide={state.activePrediction.triggeredSide}
                timeframe={state.activePrediction.timeframe}
                startedAt={state.activePrediction.startedAt}
              />
            )}
            {/* Result overlay on chart */}
            {state.quickTradeState === 'result' && state.activePrediction && (
              <PredictionOverlay
                entryPrice={state.activePrediction.entryPrice}
                currentPrice={currentPrice}
                direction={state.activePrediction.direction}
                isResult={true}
                isWin={state.activePrediction.result === 'win'}
              />
            )}
          </div>
        )}
      </div>

      {/* ResultReveal overlay (Quick Trade only) */}
      {isQuickMode && state.quickTradeState === 'result' && state.activePrediction && (
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

function formatMultiplier(mult: number): string {
  return `${mult.toFixed(2)}x`
}

export default function SwipeBookPage() {
  return (
    <SwipeBookProvider>
      <TapTradeContent />
    </SwipeBookProvider>
  )
}
