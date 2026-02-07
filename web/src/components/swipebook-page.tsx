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
import { RoundHistory } from "@/components/tap-trade/RoundHistory"
import { ResultReveal } from "@/components/tap-trade/ResultReveal"
import { useDeepBookPriceStream } from "@/hooks/tap-trade/useDeepBookPriceStream"
import { useUserBalance } from "@/hooks/useUserBalance"
import { useTradeExecution } from "@/hooks/swipebook/useTradeExecution"
import { useMarginManager } from "@/hooks/swipebook/useMarginManager"
import { useMarginPosition } from "@/hooks/swipebook/useMarginPosition"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { MARGIN_POOL_KEYS } from "@/lib/deepbook/margin-config"
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
const DEFAULT_SLIPPAGE = 1 // 1%

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

  // Margin manager (for Quick Trade mode)
  const { managerId, isCreating, createManager } = useMarginManager()

  // Margin position query (for Quick Trade mode)
  const { data: marginPosition } = useMarginPosition({
    managerId,
    poolKey: selectedPool.poolKey,
    currentPrice,
    isLong: state.activePrediction?.direction === 'long',
    enabled: isQuickMode && !!managerId,
  })

  // Trade execution hook (Grid mode)
  const realTrade = useTradeExecution()

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

  // Grid mode cell click handler (real spot swap)
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
      if (!currentAccount) {
        setToast({ message: "Connect wallet first", type: "error" })
        return
      }

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

      const side = absolutePrice >= currentPrice ? "buy" : "sell"

      // Balance checks
      if (side === "buy" && quoteBalance < stake) {
        setToast({ message: `Insufficient ${selectedPool.quoteCoin} balance`, type: "error" })
        return
      }
      if (side === "sell") {
        const baseNeeded = stake / currentPrice
        if (baseBalance < baseNeeded) {
          setToast({ message: `Insufficient ${selectedPool.baseCoin} balance`, type: "error" })
          return
        }
      }

      // Create visual tile
      const bet = createBet(stake, multiplier, priceMin, priceMax, expiresAt, betStartTime, row, col)
      setBets((prev) => [...prev, bet])

      // Execute real swap
      try {
        const amount = side === "buy" ? stake : stake / currentPrice
        const estimatedOutput = side === "buy" ? stake / currentPrice : stake

        haptic(30)

        const result = await realTrade.executeTradeAsync({
          pool: selectedPool,
          side,
          amount,
          estimatedOutput,
          slippagePercent: DEFAULT_SLIPPAGE,
        })

        setBets((prev) =>
          prev.map((b) => (b.id === bet.id ? { ...b, status: "won" as const, hitAt: Date.now() } : b)),
        )

        fireConfetti()
        haptic([50, 30, 100])

        const txShort = result.digest && result.digest !== "unknown"
          ? result.digest.slice(0, 8)
          : null
        const outputLabel = side === "buy" ? selectedPool.baseCoin : selectedPool.quoteCoin
        setToast({
          message: txShort
            ? `Swapped ${stake} ${side === "buy" ? selectedPool.quoteCoin : selectedPool.baseCoin} for ~${estimatedOutput.toFixed(4)} ${outputLabel} (${txShort}...)`
            : `Swapped for ~${estimatedOutput.toFixed(4)} ${outputLabel}`,
          type: "success",
        })
      } catch (err) {
        setBets((prev) =>
          prev.map((b) => (b.id === bet.id ? { ...b, status: "lost" as const } : b)),
        )
        haptic([100, 50, 100])

        const rawMsg = err instanceof Error ? err.message : "Unknown error"
        let userMsg = rawMsg
        if (rawMsg.includes("swap_exact_quantity") || rawMsg.includes("MoveAbort")) {
          userMsg = "No liquidity — try a different pair or smaller amount"
        } else if (rawMsg.includes("Insufficient") || rawMsg.includes("InsufficientCoinBalance")) {
          userMsg = "Insufficient token balance for this trade"
        } else if (rawMsg.includes("Dry run failed") || rawMsg.includes("simulation failed")) {
          userMsg = "Simulation failed — pool may lack liquidity"
        } else if (rawMsg.includes("Rejected") || rawMsg.includes("rejected")) {
          userMsg = "Transaction rejected by wallet"
        }
        setToast({ message: userMsg, type: "error" })
      }
    },
    [currentAccount, currentPrice, quoteBalance, baseBalance, stake, selectedPool, realTrade, priceStep],
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

  // Handle margin manager creation for Quick Trade
  const handleCreateManager = useCallback(async () => {
    if (!currentAccount) {
      setToast({ message: "Connect wallet first", type: "error" })
      return
    }
    try {
      const poolKey = selectedPool.poolKey as typeof MARGIN_POOL_KEYS[number]
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
            ) : !managerId ? (
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
              />
            )}
          </div>
        ) : (
          /* Grid Mode: Balance + Stake selector */
          <div className="flex items-center justify-between px-3 py-2">
            <BalancePill
              balance={quoteBalance}
              coinSymbol={selectedPool.quoteCoin}
              isLoading={balanceLoading}
              isConnected={!!currentAccount}
            />
            <StakeSelector stake={stake} stakes={STAKES} onStakeChange={setStake} />
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
            canBuy={!currentAccount || quoteBalance >= stake}
            canSell={!currentAccount || (currentPrice ? baseBalance >= stake / currentPrice : false)}
            onCellClick={handleCellClick}
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
