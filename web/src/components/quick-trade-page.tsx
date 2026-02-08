"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit-react"
import { SwipeBookProvider, useSwipeBook } from "@/context/SwipeBookContext"
import { BottomNav } from "@/components/swipebook/BottomNav"
import { PortfolioView } from "@/components/swipebook/PortfolioView"
import { TradeHistory } from "@/components/swipebook/TradeHistory"
import { AssetPill } from "@/components/tap-trade/asset-pill"
import { UnifiedChart } from "@/components/tap-trade/unified-chart"
import { Toast } from "@/components/tap-trade/toast"
import { QuickTradeControls } from "@/components/tap-trade/QuickTradeControls"
import { RoundHistory } from "@/components/tap-trade/RoundHistory"
import { ResultReveal } from "@/components/tap-trade/ResultReveal"
import { useDeepBookPriceStream } from "@/hooks/tap-trade/useDeepBookPriceStream"
import { useUserBalance } from "@/hooks/useUserBalance"
import { useMarginManager } from "@/hooks/swipebook/useMarginManager"
import { useMarginPosition } from "@/hooks/swipebook/useMarginPosition"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { MARGIN_POOL_KEYS, type MarginPoolKey, getMaxLeverage } from "@/lib/deepbook/margin-config"
import type { Pool } from "@/lib/swipebook/types"
import type { SwipeBookView } from "@/lib/swipebook/types"

const STAKES = [0.5, 1, 5]
const ROWS = 14
const COLS = 12
const TIME_STEP_MS = 5000
const HISTORY_WINDOW_MS = 60000

function QuickTradeContent() {
  const router = useRouter()
  const currentAccount = useCurrentAccount()
  const {
    state,
    setView,
    setQuickTradeState,
    setActivePrediction,
    setLeverage,
  } = useSwipeBook()

  // Pool selection
  const allPools = getSwipeBookPools()
  const [selectedPool, setSelectedPool] = useState<Pool>(allPools[0])

  // DeepBook price stream
  const { priceHistory, currentPrice, isConnected } = useDeepBookPriceStream(selectedPool)

  // Real wallet balances (needed for QuickTradeControls)
  const { data: quoteBalanceData, isLoading: quoteLoading } = useUserBalance(selectedPool.quoteType)
  const quoteBalance = quoteBalanceData
    ? Number(quoteBalanceData.totalBalance) / Math.pow(10, selectedPool.quoteDecimals)
    : 0
  const { data: baseBalanceData, isLoading: baseLoading } = useUserBalance(selectedPool.baseType)
  const baseBalance = baseBalanceData
    ? Number(baseBalanceData.totalBalance) / Math.pow(10, selectedPool.baseDecimals)
    : 0

  // Margin manager
  const { managerIds, isCreating, createManager } = useMarginManager()
  const currentPoolManagerId = managerIds[selectedPool.poolKey] ?? null

  // Margin position query
  const activeDirection = state.activePrediction?.direction === 'long'
  const hasActivePosition = state.quickTradeState === 'watching' || state.quickTradeState === 'closing'
  const { data: marginPosition } = useMarginPosition({
    managerId: currentPoolManagerId,
    poolKey: selectedPool.poolKey,
    currentPrice,
    isLong: activeDirection,
    enabled: !!currentPoolManagerId && hasActivePosition,
  })

  const [stake, setStake] = useState(1)
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null)

  // Zoom-based priceStep (fixed for quick mode)
  const priceStep = currentPrice ? currentPrice * 0.0002 : 0.01

  // Check if pool supports margin
  const poolSupportsMargin = MARGIN_POOL_KEYS.includes(selectedPool.poolKey as typeof MARGIN_POOL_KEYS[number])

  // If pool doesn't support margin, redirect to grid
  useEffect(() => {
    if (!poolSupportsMargin) {
      router.replace('/swipebook/grid')
    }
  }, [selectedPool.poolKey, poolSupportsMargin, router])

  // Clear Quick Trade state on pool change + auto-cap leverage
  useEffect(() => {
    setActivePrediction(null)
    setQuickTradeState('idle')

    if (poolSupportsMargin) {
      const max = getMaxLeverage(selectedPool.poolKey as MarginPoolKey)
      if (state.selectedLeverage > max) {
        setLeverage(max)
      }
    }
  }, [selectedPool.poolKey, setActivePrediction, setQuickTradeState, poolSupportsMargin, state.selectedLeverage, setLeverage])

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

  // Margin manager creation
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
  }, [currentAccount, selectedPool.poolKey, createManager])

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

  // Main quick trade view
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

        {/* Second row: Round History */}
        <div className="flex justify-center mt-1.5">
          <RoundHistory rounds={state.roundHistory} />
        </div>
      </div>

      {/* Bottom overlay: Quick Trade controls */}
      <div className="absolute bottom-[84px] left-0 right-0 z-20">
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
              quoteCoin={selectedPool.quoteCoin}
              riskRatio={marginPosition?.riskRatio}
              marginPosition={marginPosition}
              managerId={currentPoolManagerId}
            />
          )}
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
          bets={[]}
          canBuy={false}
          canSell={false}
          onCellClick={() => {}}
          activePrediction={state.activePrediction}
          quickTradeState={state.quickTradeState}
          predictionMode="quick"
          selectedLeverage={state.selectedLeverage}
        />
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

export default function QuickTradePage() {
  return (
    <SwipeBookProvider>
      <QuickTradeContent />
    </SwipeBookProvider>
  )
}
