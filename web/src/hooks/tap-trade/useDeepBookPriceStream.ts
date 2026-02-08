"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc"
import { Transaction } from "@mysten/sui/transactions"
import type { Pool } from "@/lib/swipebook/types"
import type { PriceTick } from "@/lib/tap-trade/binance"
import { MAINNET_DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from "@/lib/deepbook/config"
import { getMainnetPool } from "@/lib/deepbook/pools"

const POLL_INTERVAL_MS = 800 // sub-second for real-time feel
const MAX_HISTORY = 600
const HISTORY_WINDOW_MS = 65000 // keep slightly more than 60s

// Singleton mainnet client — no wallet needed, just reads orderbook
let mainnetClient: SuiJsonRpcClient | null = null
function getMainnetClient(): SuiJsonRpcClient {
  if (!mainnetClient) {
    mainnetClient = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl("mainnet"),
      network: "mainnet",
    })
  }
  return mainnetClient
}

/**
 * Parse a BCS-encoded vector<u64> from devInspect return values.
 * Format: ULEB128 length prefix followed by little-endian u64 values.
 */
function parseU64Vector(raw: number[]): number[] {
  const buf = new Uint8Array(raw)
  if (buf.length < 1) return []

  let length = 0
  let shift = 0
  let offset = 0
  while (offset < buf.length) {
    const byte = buf[offset]
    length |= (byte & 0x7f) << shift
    offset++
    if ((byte & 0x80) === 0) break
    shift += 7
  }

  const values: number[] = []
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

  for (let i = 0; i < length && offset + 8 <= buf.length; i++) {
    const lo = dv.getUint32(offset, true)
    const hi = dv.getUint32(offset + 4, true)
    values.push(hi * 0x100000000 + lo)
    offset += 8
  }

  return values
}

/**
 * Fetch best bid/ask from mainnet DeepBook via get_level2_ticks_from_mid.
 * Returns mid price computed from top-of-book, matching price-stream.ts.
 */
async function fetchLevel2Price(
  client: SuiJsonRpcClient,
  pool: Pool,
): Promise<number> {
  const tx = new Transaction()
  tx.moveCall({
    target: `${MAINNET_DEEPBOOK_PACKAGE_ID}::pool::get_level2_ticks_from_mid`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [
      tx.object(pool.address),
      tx.pure.u64(1),
      tx.object("0x6"),
    ],
  })

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DUMMY_SENDER,
  })

  const rv = result.results?.[0]?.returnValues
  if (!rv || rv.length < 4) return 0

  const bidPrices = parseU64Vector(rv[0][0])
  const askPrices = parseU64Vector(rv[2][0])

  if (bidPrices.length === 0 && askPrices.length === 0) return 0

  const priceScale = Math.pow(10, pool.baseDecimals - pool.quoteDecimals)

  const bestBid = bidPrices.length > 0 ? (bidPrices[0] / 1e9) * priceScale : 0
  const bestAsk = askPrices.length > 0 ? (askPrices[0] / 1e9) * priceScale : 0

  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2
  if (bestBid > 0) return bestBid
  return bestAsk
}

interface UseDeepBookPriceStreamReturn {
  priceHistory: PriceTick[]
  currentPrice: number | null
  isConnected: boolean
}

export function useDeepBookPriceStream(
  pool: Pool | null
): UseDeepBookPriceStreamReturn {
  const [priceHistory, setPriceHistory] = useState<PriceTick[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const poolKeyRef = useRef<string | null>(null)
  const inflightRef = useRef(false)

  // Resolve the mainnet pool for price data
  const mainnetPool = pool ? getMainnetPool(pool.poolKey) : null

  const poll = useCallback(async () => {
    if (!mainnetPool) return
    if (inflightRef.current) return
    inflightRef.current = true
    try {
      const client = getMainnetClient()
      const price = await fetchLevel2Price(client, mainnetPool)

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
    } finally {
      inflightRef.current = false
    }
  }, [mainnetPool])

  useEffect(() => {
    // Reset when pool changes
    if (pool?.poolKey !== poolKeyRef.current) {
      poolKeyRef.current = pool?.poolKey ?? null
      setPriceHistory([])
      setCurrentPrice(null)
      setIsConnected(false)
    }

    if (!mainnetPool) {
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
  }, [mainnetPool, poll])

  return { priceHistory, currentPrice, isConnected }
}
