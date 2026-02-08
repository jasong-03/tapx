/**
 * Shared layout for Portfolio and History views
 */
"use client"

import { ReactNode } from 'react'
import { ConnectButton } from "@mysten/dapp-kit-react"
import { BottomNav } from "@/components/swipebook/BottomNav"
import type { SwipeBookView } from "@/lib/swipebook/types"

interface ViewLayoutProps {
  title: string
  currentView: SwipeBookView
  onViewChange: (view: SwipeBookView) => void
  isAuthenticated: boolean
  children: ReactNode
}

export function ViewLayout({
  title,
  currentView,
  onViewChange,
  isAuthenticated,
  children,
}: ViewLayoutProps) {
  return (
    <div className="flex flex-col h-screen gradient-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/40 backdrop-blur-sm">
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
        <ConnectButton />
      </header>
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>
      <BottomNav
        currentView={currentView}
        onViewChange={onViewChange}
        isAuthenticated={isAuthenticated}
      />
    </div>
  )
}
