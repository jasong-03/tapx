"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit-react"
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
import type { Pool } from "@/lib/swipebook/types"
import type { SwipeBookView } from "@/lib/swipebook/types"

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

  // Phase B: Real wallet balance (quote coin, e.g. USDC)
  const { data: quoteBalanceData, isLoading: balanceLoading } = useUserBalance(selectedPool.quoteType)
  const quoteBalance = quoteBalanceData
    ? Number(quoteBalanceData.totalBalance) / Math.pow(10, selectedPool.quoteDecimals)
    : 0

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

      // Check quote balance
      if (quoteBalance < stake) {
        setToast({ message: `Insufficient ${selectedPool.quoteCoin} balance`, type: "error" })
        return
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

      // Determine trade side: above current price = BUY base, below = SELL base
      const side = absolutePrice >= currentPrice ? "buy" : "sell"

      // Create visual tile (shows as "open"/executing on chart)
      const bet = createBet(stake, multiplier, priceMin, priceMax, expiresAt, betStartTime, row, col)
      setBets((prev) => [...prev, bet])

      // Execute real DeepBook swap
      try {
        // BUY: spend `stake` quote to get base. SELL: sell `stake/price` base to get quote.
        const amount = side === "buy" ? stake : stake / currentPrice
        const estimatedOutput = side === "buy" ? stake / currentPrice : stake

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
        setToast({
          message: `${side.toUpperCase()} filled! TX: ${result.digest?.slice(0, 8)}...`,
          type: "success",
        })
      } catch (err) {
        // Mark tile as failed (red)
        setBets((prev) =>
          prev.map((b) => (b.id === bet.id ? { ...b, status: "lost" as const } : b)),
        )
        setToast({
          message: `Trade failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          type: "error",
        })
      }
    },
    [currentAccount, currentPrice, quoteBalance, stake, selectedPool, executeTradeAsync, priceStep],
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
      <div className="absolute top-4 left-4 z-20">
        <AssetPill
          pool={selectedPool}
          price={currentPrice}
          isConnected={isConnected}
          pools={allPools}
          onPoolChange={setSelectedPool}
        />
      </div>

      <div className="absolute bottom-16 left-4 z-20">
        <BalancePill
          balance={quoteBalance}
          coinSymbol={selectedPool.quoteCoin}
          isLoading={balanceLoading}
          isConnected={!!currentAccount}
        />
      </div>

      <div className="absolute bottom-16 right-4 z-20">
        <StakeSelector stake={stake} stakes={STAKES} onStakeChange={setStake} />
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <TileScaler zoom={zoom} onZoomChange={setZoom} />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
              isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {isConnected ? "Live" : "Connecting..."}
          </div>
          <ConnectButton />
        </div>
      </div>

      <div className="h-full w-full pt-16 pb-16 px-4">
        <UnifiedChart
          priceHistory={priceHistory}
          currentPrice={currentPrice}
          rows={ROWS}
          cols={COLS}
          priceStep={priceStep}
          timeStepMs={TIME_STEP_MS}
          historyWindowMs={HISTORY_WINDOW_MS}
          bets={bets}
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
