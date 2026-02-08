"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useCurrentAccount } from "@mysten/dapp-kit-react"
import { SwipeBookProvider, useSwipeBook } from "@/context/SwipeBookContext"
import { ViewLayout } from "@/components/tap-trade/shared/ViewLayout"
import { TradingLayout } from "@/components/tap-trade/shared/TradingLayout"
import { PositionsDashboard } from "@/components/swipebook/PositionsDashboard"
import { BalancePill } from "@/components/tap-trade/balance-pill"
import { StakeSelector } from "@/components/tap-trade/stake-selector"
import { UnifiedChart } from "@/components/tap-trade/unified-chart"
import { Toast } from "@/components/tap-trade/toast"
import { TileScaler } from "@/components/tap-trade/tile-scaler"
import { usePythPriceStream } from "@/hooks/tap-trade/usePythPriceStream"
import { useTokenBalances } from "@/hooks/tap-trade/useTokenBalances"
import { usePredictionBalance } from "@/hooks/tap-trade/usePredictionBalance"
import { useGridTrade } from "@/hooks/tap-trade/useGridTrade"
import { useToast } from "@/hooks/tap-trade/useToast"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { TRADING_CONSTANTS } from "@/lib/tap-trade/constants"
import { calculatePriceStep } from "@/lib/tap-trade/formatters"
import type { Pool } from "@/lib/swipebook/types"
import type { SwipeBookView } from "@/lib/swipebook/types"

function GridTradeContent() {
  const router = useRouter()
  const currentAccount = useCurrentAccount()
  const { state, setView } = useSwipeBook()
  const { toast, showToast, hideToast } = useToast()

  // Pool selection
  const allPools = getSwipeBookPools()
  const [selectedPool, setSelectedPool] = useState<Pool>(allPools[0])

  // Price stream
  const { priceHistory, currentPrice, isConnected } = usePythPriceStream(selectedPool)

  // Token balances
  const { quoteBalance, baseBalance, isLoading: balanceLoading } = useTokenBalances(selectedPool)

  // Virtual prediction balance
  const {
    balance: predictionBalance,
    setBalance: setPredictionBalance,
  } = usePredictionBalance(currentAccount?.address)

  // UI state
  const [stake, setStake] = useState(1)
  const [zoom, setZoom] = useState(TRADING_CONSTANTS.GRID_MODE.DEFAULT_ZOOM)

  // Price step calculation
  const priceStep = calculatePriceStep(currentPrice, zoom)

  // Grid trade business logic
  const { bets, setBets, handleCellClick, openBetCount } = useGridTrade({
    currentPrice,
    predictionBalance,
    stake,
    priceStep,
    setPredictionBalance,
    showToast,
  })

  // Reset bets when pool changes
  useEffect(() => {
    setBets([])
  }, [selectedPool.address, setBets])

  // View change handler
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
    [router, setView]
  )

  // Render portfolio/positions view
  if (state.currentView === "portfolio" || state.currentView === "history") {
    return (
      <ViewLayout
        title="Positions"
        currentView={state.currentView}
        onViewChange={handleViewChange}
        isAuthenticated={!!currentAccount}
      >
        <PositionsDashboard />
      </ViewLayout>
    )
  }

  // Main grid trading view
  return (
    <>
      <TradingLayout
        selectedPool={selectedPool}
        allPools={allPools}
        onPoolChange={setSelectedPool}
        currentPrice={currentPrice}
        isConnected={isConnected}
        currentView={state.currentView}
        onViewChange={handleViewChange}
        isAuthenticated={!!currentAccount}
        secondRow={<TileScaler zoom={zoom} onZoomChange={setZoom} />}
        bottomControls={
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
                <StakeSelector
                  stake={stake}
                  stakes={TRADING_CONSTANTS.STAKES}
                  onStakeChange={setStake}
                />
              </div>
            </div>
          </div>
        }
        chartArea={
          <UnifiedChart
            priceHistory={priceHistory}
            currentPrice={currentPrice}
            rows={TRADING_CONSTANTS.GRID.ROWS}
            cols={TRADING_CONSTANTS.GRID.COLS}
            priceStep={priceStep}
            timeStepMs={TRADING_CONSTANTS.TIME.STEP_MS}
            historyWindowMs={TRADING_CONSTANTS.TIME.HISTORY_WINDOW_MS}
            bets={bets}
            canBuy={predictionBalance >= stake}
            canSell={predictionBalance >= stake}
            onCellClick={handleCellClick}
            predictionMode="grid"
          />
        }
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}
    </>
  )
}

export default function GridTradePage() {
  return (
    <SwipeBookProvider>
      <GridTradeContent />
    </SwipeBookProvider>
  )
}
