"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useCurrentAccount } from "@mysten/dapp-kit-react"
import { SwipeBookProvider, useSwipeBook } from "@/context/SwipeBookContext"
import { ViewLayout } from "@/components/tap-trade/shared/ViewLayout"
import { TradingLayout } from "@/components/tap-trade/shared/TradingLayout"
import { PortfolioView } from "@/components/swipebook/PortfolioView"
import { TradeHistory } from "@/components/swipebook/TradeHistory"
import { UnifiedChart } from "@/components/tap-trade/unified-chart"
import { Toast } from "@/components/tap-trade/toast"
import { QuickTradeControls } from "@/components/tap-trade/QuickTradeControls"
import { RoundHistory } from "@/components/tap-trade/RoundHistory"
import { ResultReveal } from "@/components/tap-trade/ResultReveal"
import { PredictionOverlay } from "@/components/tap-trade/PredictionOverlay"
import { usePythPriceStream } from "@/hooks/tap-trade/usePythPriceStream"
import { useTokenBalances } from "@/hooks/tap-trade/useTokenBalances"
import { useQuickTrade } from "@/hooks/tap-trade/useQuickTrade"
import { useToast } from "@/hooks/tap-trade/useToast"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { TRADING_CONSTANTS } from "@/lib/tap-trade/constants"
import { calculatePriceStep } from "@/lib/tap-trade/formatters"
import type { Pool } from "@/lib/swipebook/types"
import type { SwipeBookView } from "@/lib/swipebook/types"

function QuickTradeContent() {
  const router = useRouter()
  const currentAccount = useCurrentAccount()
  const { state, setView } = useSwipeBook()
  const { toast, showToast, showError, showSuccess, hideToast } = useToast()

  // Pool selection
  const allPools = getSwipeBookPools()
  const [selectedPool, setSelectedPool] = useState<Pool>(allPools[0])

  // Price stream
  const { priceHistory, currentPrice, isConnected } = usePythPriceStream(selectedPool)

  // Token balances
  const { quoteBalance, baseBalance } = useTokenBalances(selectedPool)

  // Quick trade business logic
  const {
    currentPoolManagerId,
    isCreatingManager,
    poolSupportsMargin,
    marginManagers,
    marginPosition,
    quickTradeState,
    activePrediction,
    selectedLeverage,
    roundHistory,
    handleCreateManager,
    handleResultComplete,
  } = useQuickTrade({
    selectedPool,
    currentPrice,
    showToast,
  })

  // UI state
  const [stake, setStake] = useState(1)

  // Price step calculation
  const priceStep = calculatePriceStep(
    currentPrice,
    1,
    TRADING_CONSTANTS.QUICK_MODE.PRICE_STEP_MULTIPLIER
  )

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

  // Render portfolio view
  if (state.currentView === "portfolio") {
    return (
      <ViewLayout
        title="Portfolio"
        currentView={state.currentView}
        onViewChange={handleViewChange}
        isAuthenticated={!!currentAccount}
      >
        <PortfolioView />
      </ViewLayout>
    )
  }

  // Render history view
  if (state.currentView === "history") {
    return (
      <ViewLayout
        title="Trade History"
        currentView={state.currentView}
        onViewChange={handleViewChange}
        isAuthenticated={!!currentAccount}
      >
        <TradeHistory />
      </ViewLayout>
    )
  }

  // Main quick trade view
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
        secondRow={<RoundHistory rounds={roundHistory} />}
        bottomControls={
          <div className="bg-black/40 backdrop-blur-sm border-t border-white/5">
            {!currentAccount ? (
              <div className="p-4 text-center text-white/50 text-sm">
                Connect wallet to trade
              </div>
            ) : !currentPoolManagerId ? (
              <div className="p-4 text-center">
                <button
                  onClick={handleCreateManager}
                  disabled={isCreatingManager}
                  className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium text-sm disabled:opacity-50"
                >
                  {isCreatingManager ? 'Creating...' : 'Create Margin Account'}
                </button>
                <p className="text-white/40 text-xs mt-2">
                  Required for leveraged trading
                </p>
              </div>
            ) : (
              <QuickTradeControls
                currentPrice={currentPrice}
                poolKey={selectedPool.poolKey}
                stake={stake}
                stakes={TRADING_CONSTANTS.STAKES}
                onStakeChange={setStake}
                marginManagers={marginManagers}
                riskRatio={marginPosition?.riskRatio}
                marginPosition={marginPosition}
              />
            )}
          </div>
        }
        chartArea={
          <>
            <UnifiedChart
              priceHistory={priceHistory}
              currentPrice={currentPrice}
              rows={TRADING_CONSTANTS.GRID.ROWS}
              cols={TRADING_CONSTANTS.GRID.COLS}
              priceStep={priceStep}
              timeStepMs={TRADING_CONSTANTS.TIME.STEP_MS}
              historyWindowMs={TRADING_CONSTANTS.TIME.HISTORY_WINDOW_MS}
              bets={[]}
              canBuy={false}
              canSell={false}
              onCellClick={() => {}}
              activePrediction={activePrediction}
              quickTradeState={quickTradeState}
              predictionMode="quick"
              selectedLeverage={selectedLeverage}
            />
            {activePrediction && ['watching', 'triggered', 'closing', 'settling'].includes(quickTradeState) && (
              <PredictionOverlay
                entryPrice={activePrediction.entryPrice}
                currentPrice={currentPrice}
                direction={activePrediction.direction}
                tpPrice={activePrediction.tpPrice}
                slPrice={activePrediction.slPrice}
                triggeredSide={activePrediction.triggeredSide}
                timeframe={activePrediction.timeframe}
                startedAt={activePrediction.startedAt}
              />
            )}
            {quickTradeState === 'result' && activePrediction && (
              <PredictionOverlay
                entryPrice={activePrediction.entryPrice}
                currentPrice={currentPrice}
                direction={activePrediction.direction}
                isResult={true}
                isWin={activePrediction.result === 'win'}
                triggeredSide={activePrediction.triggeredSide}
              />
            )}
          </>
        }
        overlay={
          quickTradeState === 'result' && activePrediction ? (
            <ResultReveal
              round={activePrediction}
              xpEarned={0}
              onComplete={handleResultComplete}
            />
          ) : null
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

export default function QuickTradePage() {
  return (
    <SwipeBookProvider>
      <QuickTradeContent />
    </SwipeBookProvider>
  )
}
