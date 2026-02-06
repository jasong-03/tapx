export interface PriceTick {
  price: number
  timestamp: number
}

export interface BinanceTradeEvent {
  e: string
  E: number
  s: string
  t: number
  p: string
  q: string
  T: number
  m: boolean
  M: boolean
}

export interface DepthUpdate {
  bids: [string, string][]
  asks: [string, string][]
  lastUpdateId: number
}

export interface Ticker24h {
  symbol: string
  priceChange: string
  priceChangePercent: string
  lastPrice: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
}

export interface ExchangeSymbolInfo {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  filters: unknown[]
}

type PriceCallback = (tick: PriceTick) => void
type ConnectionCallback = (connected: boolean) => void
type DepthCallback = (update: DepthUpdate) => void
type TickerCallback = (ticker: Ticker24h) => void

const BASE_URL = "https://api.binance.com/api/v3"

async function fetchDepthSnapshot(symbol: string): Promise<DepthUpdate> {
  const res = await fetch(`${BASE_URL}/depth?symbol=${symbol.toUpperCase()}&limit=20`)
  if (!res.ok) throw new Error(`Failed to fetch depth: ${res.status}`)
  const data = await res.json()
  return {
    bids: data.bids,
    asks: data.asks,
    lastUpdateId: data.lastUpdateId,
  }
}

async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const res = await fetch(`${BASE_URL}/ticker/24hr?symbol=${symbol.toUpperCase()}`)
  if (!res.ok) throw new Error(`Failed to fetch ticker: ${res.status}`)
  const data = await res.json()
  return {
    symbol: data.symbol,
    priceChange: data.priceChange,
    priceChangePercent: data.priceChangePercent,
    lastPrice: data.lastPrice,
    highPrice: data.highPrice,
    lowPrice: data.lowPrice,
    volume: data.volume,
    quoteVolume: data.quoteVolume,
  }
}

async function validateSymbol(symbol: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/exchangeInfo?symbol=${symbol.toUpperCase()}`)
    if (!res.ok) return false
    const data = await res.json()
    return data.symbols?.some(
      (s: ExchangeSymbolInfo) => s.symbol === symbol.toUpperCase() && s.status === "TRADING"
    ) ?? false
  } catch {
    return false
  }
}

class BinanceWebSocket {
  private ws: WebSocket | null = null
  private priceCallbacks: Set<PriceCallback> = new Set()
  private connectionCallbacks: Set<ConnectionCallback> = new Set()
  private depthCallbacks: Set<DepthCallback> = new Set()
  private tickerCallbacks: Set<TickerCallback> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 15
  private baseDelay = 1000
  private isConnecting = false
  private shouldReconnect = true
  private currentSymbol = "btcusdt"
  private subscriptionId = 1
  private endpoints = [
    "wss://stream.binance.com:9443/stream",
    "wss://stream.binance.com:443/stream",
    "wss://fstream.binance.com/stream",
  ]
  private currentEndpointIndex = 0

  async connect(symbol?: string) {
    if (typeof window === "undefined") return

    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return
    }

    if (symbol) {
      this.currentSymbol = symbol.toLowerCase()
    }

    const isValid = await validateSymbol(this.currentSymbol)
    if (!isValid) {
      console.log(`[tap] Symbol ${this.currentSymbol.toUpperCase()} is not valid or not trading`)
    }

    this.isConnecting = true
    this.shouldReconnect = true

    const endpoint = this.endpoints[this.currentEndpointIndex]
    console.log("[tap] Connecting to:", endpoint)

    try {
      this.ws = new WebSocket(endpoint)

      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          console.log("[tap] Connection timeout, trying next endpoint")
          this.ws?.close()
        }
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        this.isConnecting = false
        this.reconnectAttempts = 0
        console.log("[tap] Connected to Binance successfully")
        this.notifyConnection(true)
        this.sendSubscribe()
        this.fetchInitialData()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          // Combined stream wraps data in { stream, data }
          const data = message.data ?? message

          // Ignore subscription confirmations
          if (message.id !== undefined && message.result !== undefined) {
            return
          }

          if (data.e === "trade") {
            const tick: PriceTick = {
              price: Number.parseFloat(data.p),
              timestamp: data.T,
            }
            this.notifyPrice(tick)
          } else if (data.e === "depthUpdate") {
            const update: DepthUpdate = {
              bids: data.b,
              asks: data.a,
              lastUpdateId: data.u,
            }
            this.notifyDepth(update)
          } else if (data.e === "24hrTicker") {
            const ticker: Ticker24h = {
              symbol: data.s,
              priceChange: data.p,
              priceChangePercent: data.P,
              lastPrice: data.c,
              highPrice: data.h,
              lowPrice: data.l,
              volume: data.v,
              quoteVolume: data.q,
            }
            this.notifyTicker(ticker)
          }
        } catch {
          // Ignore parse errors
        }
      }

      this.ws.onclose = () => {
        clearTimeout(connectionTimeout)
        this.isConnecting = false
        this.notifyConnection(false)
        console.log("[tap] WebSocket closed")
        if (this.shouldReconnect) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        this.isConnecting = false
        console.log("[tap] WebSocket error:", error)
        this.ws?.close()
      }
    } catch (err) {
      console.log("[tap] Connection error:", err)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  private sendSubscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const params = [
      `${this.currentSymbol}@trade`,
      `${this.currentSymbol}@depth@100ms`,
      `${this.currentSymbol}@ticker`,
    ]

    const msg = {
      method: "SUBSCRIBE",
      params,
      id: this.subscriptionId++,
    }

    this.ws.send(JSON.stringify(msg))
    console.log(`[tap] Subscribed to: ${params.join(", ")}`)
  }

  private async fetchInitialData() {
    const symbol = this.currentSymbol

    try {
      const [depth, ticker] = await Promise.all([
        fetchDepthSnapshot(symbol),
        fetchTicker24h(symbol),
      ])

      console.log(`[tap] Fetched depth snapshot: {bids: ${depth.bids.length}, asks: ${depth.asks.length}}`)
      console.log(`[tap] Fetched 24h ticker: {lastPrice: ${ticker.lastPrice}}`)

      this.notifyDepth(depth)
      this.notifyTicker(ticker)
    } catch (err) {
      console.log("[tap] Failed to fetch initial data:", err)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[tap] Max reconnect attempts reached")
      return
    }

    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length

    const delay = Math.min(this.baseDelay * Math.pow(1.5, this.reconnectAttempts), 30000)
    this.reconnectAttempts++

    console.log(`[tap] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect()
      }
    }, delay)
  }

  disconnect() {
    this.shouldReconnect = false
    this.ws?.close()
    this.ws = null
  }

  onPrice(callback: PriceCallback) {
    this.priceCallbacks.add(callback)
    return () => this.priceCallbacks.delete(callback)
  }

  onConnection(callback: ConnectionCallback) {
    this.connectionCallbacks.add(callback)
    return () => this.connectionCallbacks.delete(callback)
  }

  onDepth(callback: DepthCallback) {
    this.depthCallbacks.add(callback)
    return () => this.depthCallbacks.delete(callback)
  }

  onTicker(callback: TickerCallback) {
    this.tickerCallbacks.add(callback)
    return () => this.tickerCallbacks.delete(callback)
  }

  private notifyPrice(tick: PriceTick) {
    this.priceCallbacks.forEach((cb) => cb(tick))
  }

  private notifyConnection(connected: boolean) {
    this.connectionCallbacks.forEach((cb) => cb(connected))
  }

  private notifyDepth(update: DepthUpdate) {
    this.depthCallbacks.forEach((cb) => cb(update))
  }

  private notifyTicker(ticker: Ticker24h) {
    this.tickerCallbacks.forEach((cb) => cb(ticker))
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

let instance: BinanceWebSocket | null = null

export const binanceWS = {
  connect: (symbol?: string) => {
    if (typeof window === "undefined") return
    if (!instance) instance = new BinanceWebSocket()
    instance.connect(symbol)
  },
  disconnect: () => instance?.disconnect(),
  onPrice: (cb: PriceCallback) => {
    if (!instance) instance = new BinanceWebSocket()
    return instance.onPrice(cb)
  },
  onConnection: (cb: ConnectionCallback) => {
    if (!instance) instance = new BinanceWebSocket()
    return instance.onConnection(cb)
  },
  onDepth: (cb: DepthCallback) => {
    if (!instance) instance = new BinanceWebSocket()
    return instance.onDepth(cb)
  },
  onTicker: (cb: TickerCallback) => {
    if (!instance) instance = new BinanceWebSocket()
    return instance.onTicker(cb)
  },
  isConnected: () => instance?.isConnected() ?? false,
}
