"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useCurrentClient } from "@mysten/dapp-kit-react"
import { Transaction } from "@mysten/sui/transactions"
import { bcs } from "@mysten/sui/bcs"
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc"
import type { Pool } from "@/lib/swipebook/types"
import type { PriceTick } from "@/lib/tap-trade/binance"
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER, FLOAT_SCALAR } from "@/lib/deepbook/config"

const POLL_INTERVAL_MS = 3000
const MAX_HISTORY = 300
const HISTORY_WINDOW_MS = 65000 // keep slightly more than 60s

async function fetchMidPrice(
  client: SuiJsonRpcClient,
  pool: Pool
): Promise<number> {
  const tx = new Transaction()
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::mid_price`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [tx.object(pool.address), tx.object("0x6")],
  })

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DUMMY_SENDER,
  })

  const raw = result.results?.[0]
  if (!raw?.returnValues?.[0]) return 0
  const bytes = new Uint8Array(raw.returnValues[0][0])
  const value = bcs.u64().parse(bytes)
  // Adjust for decimal difference between base and quote coins
  const decimalAdjustment = Math.pow(10, pool.baseDecimals - pool.quoteDecimals)
  return (Number(value) / Number(FLOAT_SCALAR)) * decimalAdjustment
}

interface UseDeepBookPriceStreamReturn {
  priceHistory: PriceTick[]
  currentPrice: number | null
  isConnected: boolean
}

export function useDeepBookPriceStream(
  pool: Pool | null
): UseDeepBookPriceStreamReturn {
  const client = useCurrentClient() as SuiJsonRpcClient
  const [priceHistory, setPriceHistory] = useState<PriceTick[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const poolKeyRef = useRef<string | null>(null)

  const poll = useCallback(async () => {
    if (!client || !pool) return
    try {
      const price = await fetchMidPrice(client, pool)
      if (price > 0) {
        const tick: PriceTick = { price, timestamp: Date.now() }
        setCurrentPrice(price)
        setPriceHistory((prev) => {
          const cutoff = Date.now() - HISTORY_WINDOW_MS
          const updated = [...prev.filter((t) => t.timestamp > cutoff), tick]
          if (updated.length > MAX_HISTORY) {
            return updated.slice(-MAX_HISTORY)
          }
          return updated
        })
        setIsConnected(true)
      }
    } catch (err) {
      console.error("[DeepBookPriceStream] poll error:", err)
    }
  }, [client, pool])

  useEffect(() => {
    // Reset when pool changes
    if (pool?.poolKey !== poolKeyRef.current) {
      poolKeyRef.current = pool?.poolKey ?? null
      setPriceHistory([])
      setCurrentPrice(null)
      setIsConnected(false)
    }

    if (!client || !pool) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Immediate first poll
    poll()

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [client, pool, poll])

  return { priceHistory, currentPrice, isConnected }
}
