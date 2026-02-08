"use client"

import { Wallet, Loader2 } from "lucide-react"

interface BalancePillProps {
  baseBalance: number | null
  quoteBalance: number | null
  baseCoin: string
  quoteCoin: string
  isLoading?: boolean
  isConnected?: boolean
}

function fmt(n: number): string {
  if (n >= 1000) return n.toFixed(0)
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

export function BalancePill({ baseBalance, quoteBalance, baseCoin, quoteCoin, isLoading, isConnected }: BalancePillProps) {
  let display: string
  if (!isConnected) {
    display = "Connect wallet"
  } else if (isLoading) {
    display = "..."
  } else {
    const b = fmt(baseBalance ?? 0)
    const q = fmt(quoteBalance ?? 0)
    display = `${b} ${baseCoin} · ${q} ${quoteCoin}`
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-secondary/80 backdrop-blur-sm px-3 py-1.5 border border-border/50">
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 text-neon-lime animate-spin" />
      ) : (
        <Wallet className="w-3.5 h-3.5 text-neon-lime" />
      )}
      <span className="text-xs sm:text-sm font-mono font-semibold text-foreground">{display}</span>
    </div>
  )
}
