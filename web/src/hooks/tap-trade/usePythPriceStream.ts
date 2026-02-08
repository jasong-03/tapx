"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { Pool } from "@/lib/swipebook/types"
import type { PriceTick } from "@/lib/tap-trade/binance"
import { SUI_NETWORK } from "@/lib/deepbook/config"

const POLL_INTERVAL_MS = 2000 // Pyth updates ~every 1-2s
const MAX_HISTORY = 300
const HISTORY_WINDOW_MS = 65000

// Hermes endpoints
const HERMES_TESTNET = 'https://hermes-beta.pyth.network'
const HERMES_MAINNET = 'https://hermes.pyth.network'
const HERMES_URL = SUI_NETWORK === 'testnet' ? HERMES_TESTNET : HERMES_MAINNET

// Pyth price feed IDs (hex, without 0x prefix for Hermes API)
// Testnet feeds use hermes-beta; some coins (WAL) only exist on mainnet Hermes
const PYTH_FEEDS: Record<string, { feedId: string; hermes?: string }> = {
  // Testnet coins (available on hermes-beta)
  SUI: { feedId: '50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266' },
  DEEP: { feedId: '99137a18354efa7fb6840889d059fdb04c46a6ce21be97ab60d9ad93e91ac758' },
  DBUSDC: { feedId: '41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722' },
  DBTC: { feedId: 'f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b' },
  // Mainnet coins
  USDC: { feedId: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' },
  // WAL: no feed on hermes-beta, use mainnet hermes (Pyth prices are same)
  WAL: { feedId: 'eba0732395fae9dec4bae12e52760b35fc1c5671e2da8b449c9af4efe5d54341', hermes: HERMES_MAINNET },
}

interface HermesParsedPrice {
  id: string
  price: {
    price: string  // integer string
    conf: string
    expo: number   // negative exponent
    publish_time: number
  }
}

interface HermesResponse {
  parsed: HermesParsedPrice[]
}

/**
 * Parse Pyth price: price * 10^expo
 */
function parsePythPrice(p: { price: string; expo: number }): number {
  return Number(p.price) * Math.pow(10, p.expo)
}

/**
 * Fetch latest prices from Hermes v2 API.
 * Returns a map of feedId -> USD price.
 * Retries once on failure to handle transient errors.
 */
async function fetchPythPrices(feedIds: string[], retries = 1): Promise<Map<string, number>> {
  // Build URL manually to avoid URLSearchParams encoding brackets
  const idsParam = feedIds.map(id => `ids[]=${id}`).join('&')
  const url = `${HERMES_URL}/v2/updates/price/latest?${idsParam}&parsed=true`

  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 500))
      return fetchPythPrices(feedIds, retries - 1)
    }
    throw new Error(`Hermes API error: ${resp.status}`)
  }

  const json = await resp.json() as HermesResponse
  const prices = new Map<string, number>()

  for (const parsed of json.parsed) {
    const usdPrice = parsePythPrice(parsed.price)
    if (usdPrice > 0) {
      prices.set(parsed.id, usdPrice)
    }
  }

  return prices
}

/**
 * Get the pool price (base/quote) from Pyth oracle feeds.
 * Pool price = baseUsdPrice / quoteUsdPrice
 */
async function fetchPoolPrice(pool: Pool): Promise<number> {
  const baseFeed = PYTH_FEEDS[pool.baseCoin]
  const quoteFeed = PYTH_FEEDS[pool.quoteCoin]

  if (!baseFeed || !quoteFeed) {
    throw new Error(`No Pyth feed for ${pool.baseCoin} or ${pool.quoteCoin}`)
  }

  const prices = await fetchPythPrices([baseFeed.feedId, quoteFeed.feedId])
  const baseUsd = prices.get(baseFeed.feedId)
  const quoteUsd = prices.get(quoteFeed.feedId)

  if (!baseUsd || !quoteUsd || quoteUsd === 0) {
    throw new Error(`Missing Pyth price for ${pool.baseCoin}/${pool.quoteCoin}`)
  }

  return baseUsd / quoteUsd
}

interface UsePythPriceStreamReturn {
  priceHistory: PriceTick[]
  currentPrice: number | null
  isConnected: boolean
}

export function usePythPriceStream(
  pool: Pool | null
): UsePythPriceStreamReturn {
  const [priceHistory, setPriceHistory] = useState<PriceTick[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const poolKeyRef = useRef<string | null>(null)

  const poll = useCallback(async () => {
    if (!pool) return
    try {
      const price = await fetchPoolPrice(pool)
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
      console.error("[PythPriceStream] poll error:", err)
    }
  }, [pool])

  useEffect(() => {
    // Reset when pool changes
    if (pool?.poolKey !== poolKeyRef.current) {
      poolKeyRef.current = pool?.poolKey ?? null
      setPriceHistory([])
      setCurrentPrice(null)
      setIsConnected(false)
    }

    if (!pool) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Check feeds exist
    if (!PYTH_FEEDS[pool.baseCoin] || !PYTH_FEEDS[pool.quoteCoin]) {
      console.warn(`[PythPriceStream] No Pyth feed for ${pool.baseCoin}/${pool.quoteCoin}`)
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
  }, [pool, poll])

  return { priceHistory, currentPrice, isConnected }
}
