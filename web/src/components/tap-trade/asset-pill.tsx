"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import type { Pool } from "@/lib/swipebook/types"

interface AssetPillProps {
  pool: Pool | null
  price: number | null
  isConnected: boolean
  pools: Pool[]
  onPoolChange: (pool: Pool) => void
}

export function AssetPill({ pool, price, isConnected, pools, onPoolChange }: AssetPillProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toFixed(2)
    if (p >= 1) return p.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    return p.toFixed(6)
  }

  const pairLabel = pool ? `${pool.baseCoin}/${pool.quoteCoin}` : "---"

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-secondary/80 backdrop-blur-sm px-4 py-2 border border-border/50 hover:bg-secondary transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
          {pool?.baseCoin?.[0] ?? "?"}
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{pairLabel}</span>
          <span className="text-sm font-mono font-semibold text-foreground">
            {isConnected && price ? `$${formatPrice(price)}` : <Loader2 className="w-4 h-4 animate-spin" />}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-secondary border border-border rounded-lg shadow-xl overflow-hidden">
          {pools.map((p) => (
            <button
              key={p.address}
              onClick={() => {
                onPoolChange(p)
                setOpen(false)
              }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                p.address === pool?.address ? "text-primary bg-muted/30" : "text-foreground"
              }`}
            >
              {p.baseCoin}/{p.quoteCoin}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
