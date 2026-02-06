"use client"

import { Wallet, Loader2 } from "lucide-react"

interface BalancePillProps {
  balance: number | null
  coinSymbol: string
  isLoading?: boolean
  isConnected?: boolean
}

export function BalancePill({ balance, coinSymbol, isLoading, isConnected }: BalancePillProps) {
  let display: string
  if (!isConnected) {
    display = "Connect wallet"
  } else if (isLoading) {
    display = "..."
  } else {
    display = `${(balance ?? 0).toFixed(2)} ${coinSymbol}`
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-secondary/80 backdrop-blur-sm px-4 py-2 border border-border/50">
      {isLoading ? (
        <Loader2 className="w-4 h-4 text-neon-lime animate-spin" />
      ) : (
        <Wallet className="w-4 h-4 text-neon-lime" />
      )}
      <span className="text-sm font-mono font-semibold text-foreground">{display}</span>
    </div>
  )
}
