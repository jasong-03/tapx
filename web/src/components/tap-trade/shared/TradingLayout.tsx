/**
 * Main trading layout with testnet indicator and top bar
 */
"use client"

import { ReactNode } from 'react'
import { ConnectButton } from "@mysten/dapp-kit-react"
import { AssetPill } from "@/components/tap-trade/asset-pill"
import { BottomNav } from "@/components/swipebook/BottomNav"
import type { Pool } from "@/lib/swipebook/types"
import type { SwipeBookView } from "@/lib/swipebook/types"
import { TRADING_CONSTANTS } from "@/lib/tap-trade/constants"

interface TradingLayoutProps {
  // Pool data
  selectedPool: Pool
  allPools: Pool[]
  onPoolChange: (pool: Pool) => void

  // Price stream
  currentPrice: number | null
  isConnected: boolean

  // Navigation
  currentView: SwipeBookView
  onViewChange: (view: SwipeBookView) => void
  isAuthenticated: boolean

  // Layout sections
  secondRow?: ReactNode
  bottomControls: ReactNode
  chartArea: ReactNode
  overlay?: ReactNode
}

export function TradingLayout({
  selectedPool,
  allPools,
  onPoolChange,
  currentPrice,
  isConnected,
  currentView,
  onViewChange,
  isAuthenticated,
  secondRow,
  bottomControls,
  chartArea,
  overlay,
}: TradingLayoutProps) {
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
            onPoolChange={onPoolChange}
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium ${
                isConnected
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                }`}
              />
              <span className="hidden sm:inline">
                {isConnected ? "Live" : "..."}
              </span>
            </div>
            <ConnectButton />
          </div>
        </div>

        {/* Second row (Round History or Zoom controls) */}
        {secondRow && (
          <div className="flex justify-center mt-1.5">{secondRow}</div>
        )}
      </div>

      {/* Bottom controls overlay */}
      <div className={`absolute bottom-[${TRADING_CONSTANTS.LAYOUT.BOTTOM_NAV_HEIGHT}] left-0 right-0 z-20`}>
        {bottomControls}
      </div>

      {/* Chart area */}
      <div
        className="h-full w-full"
        style={{
          paddingTop: TRADING_CONSTANTS.LAYOUT.TOP_BAR_HEIGHT,
          paddingBottom: TRADING_CONSTANTS.LAYOUT.BOTTOM_CONTROLS_HEIGHT,
        }}
      >
        {chartArea}
      </div>

      {/* Overlay (e.g., ResultReveal) */}
      {overlay}

      {/* Bottom Navigation */}
      <BottomNav
        currentView={currentView}
        onViewChange={onViewChange}
        isAuthenticated={isAuthenticated}
      />
    </div>
  )
}
