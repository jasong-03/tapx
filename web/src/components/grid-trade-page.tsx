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
import { useDeepBookPriceStream } from "@/hooks/tap-trade/useDeepBookPriceStream"
import { useUserBalance } from "@/hooks/useUserBalance"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
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

function formatMultiplier(mult: number): string {
  return `${mult.toFixed(2)}x`
}

function GridTradeContent() {
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
  const balanceLoading = quoteLoading || baseLoading

  // Virtual prediction balance (localStorage)
  const [predictionBalance, setPredictionBalance] = useState(INITIAL_PREDICTION_BALANCE)

  useEffect(() => {
    if (currentAccount?.address) {
      setPredictionBalance(loadPredictionBalance(currentAccount.address))
    }
  }, [currentAccount?.address])

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

  // Auto-resolve bets (virtual)
  useEffect(() => {
    if (!currentPrice) return

    const interval = setInterval(() => {
      const now = Date.now()
      const price = currentPrice
      if (!price) return

      setBets((prev) => {
        let balanceDelta = 0
        const updated = prev.map((bet) => {
          if (bet.status !== 'open') return bet

          if (checkBetWin(bet, price, now)) {
            balanceDelta += bet.stake * bet.multiplier
            haptic([50, 30, 100])
            fireConfetti()
            return { ...bet, status: 'won' as const, hitAt: now }
          }

          if (isBetExpired(bet)) {
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
  }, [currentPrice])

  // Grid cell click handler
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

      if (predictionBalance < stake) {
        setToast({ message: "Insufficient prediction balance", type: "error" })
        return
      }

      const direction: 'long' | 'short' = absolutePrice >= currentPrice ? 'long' : 'short'

      setPredictionBalance((prev) => prev - stake)

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

  // Main grid trading view
  return (
    <div className="fixed inset-0 overflow-hidden gradient-bg dotted-bg">
      {/* Testnet indicator */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-amber-500/90 text-black text-center text-[10px] font-bold py-0.5">
        TESTNET
      </div>

      {/* Top bar */}
      <div className="absolute left-0 right-0 z-20 px-3 pb-1 top-[20px] pt-2">
        <div className="flex items-center justify-between gap-2">
          <AssetPill
            pool={selectedPool}
            price={currentPrice}
            isConnected={isConnected}
            pools={allPools}
            onPoolChange={setSelectedPool}
          />
          <div className="flex items-center gap-1.5 shrink-0">
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

        {/* Second row: TileScaler zoom control */}
        <div className="flex justify-center mt-1.5">
          <TileScaler zoom={zoom} onZoomChange={setZoom} />
        </div>
      </div>

      {/* Bottom overlay: Balance + Stake */}
      <div className="absolute bottom-[84px] left-0 right-0 z-20">
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
      </div>

      {/* Chart area */}
      <div className="h-full w-full pt-[100px] sm:pt-[104px] pb-[128px] sm:pb-[120px]">
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
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Bottom Navigation */}
      <BottomNav currentView={state.currentView} onViewChange={handleViewChange} isAuthenticated={!!currentAccount} />
    </div>
  )
}

export default function GridTradePage() {
  return (
    <SwipeBookProvider>
      <GridTradeContent />
    </SwipeBookProvider>
  )
}
