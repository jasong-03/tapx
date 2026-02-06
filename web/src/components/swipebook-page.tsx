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
import { useDeepBookPriceStream } from "@/hooks/tap-trade/useDeepBookPriceStream"
import { useUserBalance } from "@/hooks/useUserBalance"
import { useTradeExecution } from "@/hooks/swipebook/useTradeExecution"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { SUI_NETWORK } from "@/lib/deepbook/config"
import { COIN_TYPES, TESTNET_COIN_TYPES } from "@/lib/deepbook/pools"
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

const STAKES = [1, 5, 10]
const ROWS = 14
const COLS = 12
const TIME_STEP_MS = 5000
const HISTORY_WINDOW_MS = 60000
const DEFAULT_SLIPPAGE = 1 // 1%

function TapTradeContent() {
  const router = useRouter()
  const currentAccount = useCurrentAccount()
  const { state, setView } = useSwipeBook()

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
  // DEEP balance (needed for swap fees)
  const deepCoinType = SUI_NETWORK === 'testnet' ? TESTNET_COIN_TYPES.DEEP : COIN_TYPES.DEEP
  const { data: deepBalanceData } = useUserBalance(deepCoinType)
  const deepBalance = deepBalanceData
    ? Number(deepBalanceData.totalBalance) / 1e6  // DEEP has 6 decimals
    : 0
  const balanceLoading = quoteLoading || baseLoading

  // Phase C: Real trade execution
  const { executeTradeAsync } = useTradeExecution()

  const [stake, setStake] = useState(5)
  const [bets, setBets] = useState<Bet[]>([])
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null)
  const [zoom, setZoom] = useState(10)

  const betsRef = useRef(bets)
  betsRef.current = bets

  // Zoom-based priceStep: higher zoom = smaller cells = finer Y resolution
  const priceStep = currentPrice ? currentPrice * (0.002 / zoom) : 0.01

  // Cleanup old order tiles from chart
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
      // Must be connected
      if (!currentAccount) {
        setToast({ message: "Connect wallet first", type: "error" })
        return
      }

      if (!currentPrice) return

      // Determine trade side early so we can validate the right balance
      const side = absolutePrice >= currentPrice ? "buy" : "sell"

      // Check DEEP balance for swap fees (DeepBook V3 requires DEEP)
      if (currentAccount && deepBalance < 0.5) {
        setToast({ message: `Need at least 0.5 DEEP for swap fees (have ${deepBalance.toFixed(2)})`, type: "error" })
        return
      }

      // Check balance for the token being spent
      if (side === "buy") {
        // BUY base: spending quote tokens
        if (quoteBalance < stake) {
          setToast({ message: `Insufficient ${selectedPool.quoteCoin} balance`, type: "error" })
          return
        }
      } else {
        // SELL base: spending base tokens (need stake/price amount of base)
        const baseNeeded = stake / currentPrice
        if (baseBalance < baseNeeded) {
          setToast({ message: `Insufficient ${selectedPool.baseCoin} balance (need ~${baseNeeded.toFixed(4)}, have ${baseBalance.toFixed(4)})`, type: "error" })
          return
        }
      }

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

      // Create visual tile (shows as "open"/executing on chart)
      const bet = createBet(stake, multiplier, priceMin, priceMax, expiresAt, betStartTime, row, col)
      setBets((prev) => [...prev, bet])

      // Execute real DeepBook swap
      try {
        // BUY: spend `stake` quote to get base. SELL: sell `stake/price` base to get quote.
        const amount = side === "buy" ? stake : stake / currentPrice
        const estimatedOutput = side === "buy" ? stake / currentPrice : stake

        haptic(30) // light tap on submit

        const result = await executeTradeAsync({
          pool: selectedPool,
          side,
          amount,
          estimatedOutput,
          slippagePercent: DEFAULT_SLIPPAGE,
        })

        // Mark tile as filled (green + win animation)
        setBets((prev) =>
          prev.map((b) => (b.id === bet.id ? { ...b, status: "won" as const, hitAt: Date.now() } : b)),
        )

        // Celebration!
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
        // Mark tile as failed (red)
        setBets((prev) =>
          prev.map((b) => (b.id === bet.id ? { ...b, status: "lost" as const } : b)),
        )
        haptic([100, 50, 100])

        // Translate common Move abort errors to user-friendly messages
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
        setToast({
          message: userMsg,
          type: "error",
        })
      }
    },
    [currentAccount, currentPrice, quoteBalance, baseBalance, deepBalance, stake, selectedPool, executeTradeAsync, priceStep],
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
      {/* Top bar - responsive layout */}
      <div className="absolute top-0 left-0 right-0 z-20 px-3 pt-3 pb-1">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Asset pill */}
          <AssetPill
            pool={selectedPool}
            price={currentPrice}
            isConnected={isConnected}
            pools={allPools}
            onPoolChange={setSelectedPool}
          />
          {/* Right: Live + Connect */}
          <div className="flex items-center gap-2 shrink-0">
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
        {/* Second row: Zoom selector */}
        <div className="flex justify-center mt-1.5">
          <TileScaler zoom={zoom} onZoomChange={setZoom} />
        </div>
      </div>

      {/* Bottom overlays - above nav */}
      <div className="absolute bottom-[84px] left-0 right-0 z-20 flex items-center justify-between px-3 py-2">
        <BalancePill
          balance={quoteBalance}
          coinSymbol={selectedPool.quoteCoin}
          isLoading={balanceLoading}
          isConnected={!!currentAccount}
        />
        <StakeSelector stake={stake} stakes={STAKES} onStakeChange={setStake} />
      </div>

      {/* Chart area */}
      <div className="h-full w-full pt-[88px] sm:pt-[92px] pb-[128px] sm:pb-[120px]">
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
      </div>

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
