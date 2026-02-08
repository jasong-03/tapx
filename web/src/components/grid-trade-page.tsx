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
import { useSessionTrading } from "@/hooks/tap-trade/useSessionTrading"
import { useGridTrade } from "@/hooks/tap-trade/useGridTrade"
import { useToast } from "@/hooks/tap-trade/useToast"
import { getSwipeBookPools } from "@/lib/deepbook/pools"
import { SUI_NETWORK } from "@/lib/deepbook/config"
import { TRADING_CONSTANTS } from "@/lib/tap-trade/constants"
import { calculatePriceStep } from "@/lib/tap-trade/formatters"
import { tradeApi } from "@/lib/tap-trade/tradeApi"
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

  // Token balances (display only)
  const { quoteBalance, baseBalance, isLoading: balanceLoading } = useTokenBalances(selectedPool)

  // Session-based balance (real deposit via backend API)
  const {
    session,
    isLoadingSession,
    botAddress,
    deposit,
    isDepositing,
  } = useSessionTrading()

  // Local balance state — initialized from session, updated by bets client-side
  const [localBalance, setLocalBalance] = useState<number>(0)

  // Sync local balance when session updates (deposit, refresh)
  useEffect(() => {
    if (session) {
      setLocalBalance(session.balance)
      if (session.deposits.length > 0) {
        console.log(
          `%c[SESSION] %cbalance=$${session.balance.toFixed(2)} | deposited=$${session.totalDeposited.toFixed(2)} | lost=$${session.totalLost.toFixed(2)} | deposits=${session.deposits.map(d => d.txDigest.slice(0, 8)).join(', ')} | house=${session.houseAddress.slice(0, 10)}...`,
          'color: #cc88ff; font-weight: bold',
          'color: #ddaaff'
        )
      }
    }
  }, [session?.balance])

  // UI state
  const [stake, setStake] = useState(1)
  const [zoom, setZoom] = useState(TRADING_CONSTANTS.GRID_MODE.DEFAULT_ZOOM)
  const [depositAmount, setDepositAmount] = useState(5)
  const [showDepositRow, setShowDepositRow] = useState(false)

  // Price step calculation
  const priceStep = calculatePriceStep(currentPrice, zoom)

  // Balance change handler — updates local state instantly
  const handleBalanceChange = useCallback((delta: number) => {
    setLocalBalance(prev => Math.max(0, prev + delta))
  }, [])

  // Resolve bet on-chain — real SUI transfer (fire-and-forget)
  const handleBetResolved = useCallback((betId: string, result: 'win' | 'loss', betStake: number, payout: number) => {
    if (!currentAccount?.address) return
    tradeApi.resolveBet({
      senderAddress: currentAccount.address,
      betId,
      result,
      stake: betStake,
      payout: result === 'win' ? payout : undefined,
    }).then(res => {
      const tag = result === 'win' ? '[WIN TX]' : '[LOSS TX]'
      const color = result === 'win' ? '#00ff00' : '#ff4444'
      const explorerUrl = `${SUI_NETWORK === 'testnet' ? 'https://suiscan.xyz/testnet' : 'https://suiscan.xyz/mainnet'}/tx/${res.digest}`
      console.log(
        `%c${tag} %ctx=${res.digest} | $${res.amount} → ${res.recipient.slice(0, 10)}... | ${explorerUrl}`,
        `color: ${color}; font-weight: bold`,
        `color: ${color}88`
      )
    }).catch(err => console.warn(`[grid] resolveBet(${result}) failed:`, err))
  }, [currentAccount?.address])

  // Grid trade prediction game
  const { bets, setBets, handleCellClick, openBetCount } = useGridTrade({
    currentPrice,
    sessionBalance: localBalance,
    stake,
    priceStep,
    onBalanceChange: handleBalanceChange,
    onBetResolved: handleBetResolved,
    showToast,
  })

  // Reset bets when pool changes
  useEffect(() => {
    setBets([])
  }, [selectedPool.address, setBets])

  // Handle deposit (one wallet sign)
  const handleDeposit = useCallback(async () => {
    if (!selectedPool) return
    try {
      const digest = await deposit(depositAmount, selectedPool.quoteType, selectedPool.quoteDecimals)
      const explorerUrl = `${SUI_NETWORK === 'testnet' ? 'https://suiscan.xyz/testnet' : 'https://suiscan.xyz/mainnet'}/tx/${digest}`
      console.log(
        `%c[DEPOSIT TX] %c${depositAmount} ${selectedPool.quoteCoin} → bot:${botAddress?.slice(0, 10)}... | pool=${selectedPool.baseCoin}/${selectedPool.quoteCoin} | tx=${digest}\n${explorerUrl}`,
        'color: #ffcc00; font-weight: bold',
        'color: #ffeeaa'
      )
      showToast(`Deposited ${depositAmount} ${selectedPool.quoteCoin}`, 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deposit failed'
      showToast(message, 'error')
    }
  }, [deposit, depositAmount, selectedPool, botAddress, showToast])

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

  const hasBalance = localBalance > 0
  const explorerBase = SUI_NETWORK === 'testnet'
    ? 'https://suiscan.xyz/testnet'
    : 'https://suiscan.xyz/mainnet'

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
            {!currentAccount ? (
              /* No wallet */
              <div className="p-4 text-center text-white/50 text-sm">
                Connect wallet to trade
              </div>
            ) : !hasBalance && !isLoadingSession ? (
              /* No balance — deposit flow */
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/50">Deposit</span>
                  <div className="flex gap-0.5">
                    {[1, 5, 10].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setDepositAmount(amt)}
                        className={`
                          px-2 py-1 rounded-full text-[11px] font-bold transition-all
                          ${depositAmount === amt
                            ? 'bg-cyan-400 text-black'
                            : 'text-white/40 hover:text-white/60'
                          }
                        `}
                      >
                        {amt} {selectedPool.quoteCoin}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleDeposit}
                  disabled={isDepositing || !botAddress}
                  className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium text-xs disabled:opacity-50"
                >
                  {isDepositing ? 'Signing...' : 'Deposit & Start'}
                </button>
              </div>
            ) : (
              /* Has balance — normal controls */
              <div>
                {/* On-chain proof bar */}
                {session && (session.deposits.length > 0 || session.bets.length > 0) && (
                  <div className="flex items-center gap-2 px-3 py-1 border-b border-white/5 overflow-x-auto scrollbar-none">
                    <span className="text-[9px] text-white/30 uppercase tracking-wider shrink-0">On-chain</span>
                    {session.deposits.slice(-2).map((dep) => (
                      <a
                        key={dep.txDigest}
                        href={`${explorerBase}/tx/${dep.txDigest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] text-yellow-400/70 hover:text-yellow-300 font-mono shrink-0"
                        title={`Deposit ${dep.amount}`}
                      >
                        D:{dep.txDigest.slice(0, 6)}..
                      </a>
                    ))}
                    {session.bets.slice(-4).map((bet) => (
                      <a
                        key={bet.txDigest}
                        href={`${explorerBase}/tx/${bet.txDigest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-[9px] font-mono shrink-0 ${
                          bet.result === 'win'
                            ? 'text-green-400/70 hover:text-green-300'
                            : 'text-red-400/70 hover:text-red-300'
                        }`}
                        title={`${bet.result === 'win' ? 'Win' : 'Loss'} ${bet.amount}`}
                      >
                        {bet.result === 'win' ? 'W' : 'L'}:{bet.txDigest.slice(0, 6)}..
                      </a>
                    ))}
                    <a
                      href={`${explorerBase}/account/${session.houseAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-white/20 hover:text-white/40 font-mono shrink-0"
                      title="House address"
                    >
                      house:{session.houseAddress.slice(0, 8)}..
                    </a>
                  </div>
                )}
                {showDepositRow && (
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-white/50">Add</span>
                      <div className="flex gap-0.5">
                        {[1, 5, 10].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setDepositAmount(amt)}
                            className={`
                              px-2 py-0.5 rounded-full text-[10px] font-bold transition-all
                              ${depositAmount === amt
                                ? 'bg-cyan-400 text-black'
                                : 'text-white/40 hover:text-white/60'
                              }
                            `}
                          >
                            {amt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleDeposit}
                        disabled={isDepositing || !botAddress}
                        className="px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-medium text-[10px] disabled:opacity-50"
                      >
                        {isDepositing ? 'Signing...' : `Deposit ${depositAmount} ${selectedPool.quoteCoin}`}
                      </button>
                      <button
                        onClick={() => setShowDepositRow(false)}
                        className="text-white/30 hover:text-white/60 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <BalancePill
                      baseBalance={baseBalance}
                      quoteBalance={quoteBalance}
                      baseCoin={selectedPool.baseCoin}
                      quoteCoin={selectedPool.quoteCoin}
                      isLoading={balanceLoading || isLoadingSession}
                      isConnected={!!currentAccount}
                      predictionBalance={localBalance}
                    />
                    {!showDepositRow && (
                      <button
                        onClick={() => setShowDepositRow(true)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold"
                      >
                        + Add
                      </button>
                    )}
                  </div>
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
            )}
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
            canBuy={hasBalance && localBalance >= stake}
            canSell={hasBalance && localBalance >= stake}
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
