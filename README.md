# TapX

**Tap a price grid, execute real DeFi trades on Sui.**

TapX is a DeFi trading platform built on DeepBook (Sui's native order book). Instead of complex order forms, users tap cells on an interactive price grid to instantly execute on-chain market orders. A session-based margin trading engine enables leveraged predictions with take-profit/stop-loss automation.

Built for [HackMoney 2026](https://ethglobal.com/events/hackmoney2026/home) | Powered by [Sui](https://sui.io) and [DeepBook](https://deepbook.tech)

---

## Key Features

### Tap-to-Trade Interface (SwipeBook)
- **Interactive Price Grid**: Real-time canvas chart with tap-to-trade cells
- **Instant Execution**: Tap above price to buy, below to sell
- **Zoom Controls**: 1x-20x resolution for precise price targeting
- **Smooth Animations**: Catmull-Rom spline interpolation at 60fps

### Margin / Quick Trading
- **Direction Prediction**: Tap UP or DOWN to predict price movement
- **Leveraged Positions**: 2x, 3x, or 5x leverage selection
- **Countdown Timeframes**: 15-second, 30-second, or 1-minute rounds
- **Real-time PnL**: Live profit/loss tracking during open positions
- **TPSL Orders**: Take-profit/stop-loss via DeepBook conditional orders
- **Positions Dashboard**: View all active margin positions with close buttons

### Grid Trade Mode
- **Price Grid Predictions**: Grid of price cells with multiplier-based payouts
- **Separate Route**: Dedicated `/swipebook/grid` route
- **Shared Infrastructure**: Uses same margin engine as Quick Trade

### Session-Based Trading Engine
- **HTTP Trade API**: Express server with deposit, open, settle, close endpoints
- **Automated TPSL**: Engine manages take-profit/stop-loss orders
- **Pyth VAA Caching**: Background oracle refresh for low-latency execution

### Simulation Mode
- **Risk-free Demo**: Toggle to a simulated trading environment ($10,000 fake balance)
- **Identical UI**: Same interface as live trading for realistic practice
- **No On-chain Cost**: Trades execute locally without blockchain transactions

### DeepBook Integration
- **On-chain Order Book**: Direct swaps on Sui's native CLOB
- **Real-time Prices**: 800ms polling with visual interpolation
- **16+ Trading Pairs**: SUI/USDC, DEEP/USDC, WAL/USDC, NS/USDC, and more

### Gamification
- **XP System**: Earn experience points per trade (100 levels)
- **Streaks**: Daily trading streak tracking with multipliers (1x-2x)
- **Leaderboard**: Compete with other traders (weekly/all-time)
- **Achievements**: 20 unlockable badges across 7 categories

### AMM Vault (DeepMaker)
- **Liquidity Provision**: Deposit base/quote assets into managed vaults
- **LP Tokens (DRIP)**: Receive proportional share tokens (9 decimals)
- **Automated Market Making**: Engine bot places spread orders around mid-price

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS v4, Canvas API |
| **Blockchain** | Sui Move (2024.beta), DeepBook V3, Pyth Oracle |
| **Wallet** | @mysten/dapp-kit-react |
| **Data** | TanStack Query v5, React Context, localStorage |
| **UI** | shadcn/ui (Radix), Framer Motion, Lucide Icons |
| **Engine** | Node.js, Express 5.2.1, @mysten/deepbook-v3 SDK |

---

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/jasong-03/tapx.git
cd tapx
cd web && npm install
```

### 2. Configure Environment

Create `web/.env.local`:
```bash
NEXT_PUBLIC_SUI_NETWORK=mainnet
NEXT_PUBLIC_AMM_PACKAGE_ID=0x180823228df40d9889a3b918a78248b43a9740e6b346402064762275ba761777
NEXT_PUBLIC_PRICE_ID_SUI_USD=23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744
NEXT_PUBLIC_PRICE_ID_DEEP_USD=29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff
```

### 3. Run Development Server

```bash
cd web && npm run dev
# Open http://localhost:3000 (landing page)
# Trading UI at http://localhost:3000/swipebook
# Grid Trade at http://localhost:3000/swipebook/grid
# Vault page at http://localhost:3000/vault
```

### 4. Engine (Market Maker + Trade Server)

```bash
cd engine && npm install

# One-time setup: create MarginManager
npm run setup

# Configure engine/.env.local (see engine/.env.example)
# Required: PRIVATE_KEY, MARGIN_MANAGER_ID, BALANCE_MANAGER_ID, etc.

npm run dev
# Starts MarketMaker (AMM spread bot) + TradeServer (port 3001)
```

---

## How It Works

0. **Explore Landing Page**: Visit `/` to see the product overview and feature showcase
1. **Connect Wallet**: Click "Connect Wallet" to link your Sui wallet
2. **Select Pool**: Choose trading pair from dropdown (SUI/USDC default)
3. **Set Stake**: Pick trade size ($1, $5, or $10)
4. **Tap to Trade**:
   - Tap cell **above** current price -- **BUY** (quote to base)
   - Tap cell **below** current price -- **SELL** (base to quote)
5. **Confirm**: Sign transaction in wallet popup
6. **Done**: Trade executes on DeepBook, balance updates

**Quick Trade Mode**: Select leverage (2x/3x/5x), choose a timeframe (15s/30s/1m), and tap UP or DOWN to predict price direction. Watch your PnL in real-time as the countdown runs.

**Grid Trade Mode**: Navigate to `/swipebook/grid` and tap price cells on the grid to predict where the price will go, with multiplier-based payouts.

**Simulation Mode**: Toggle the demo switch to practice with $10,000 in fake funds. The UI is identical to live trading, but no transactions are submitted on-chain.

---

## Project Structure

```
tapx/
├── web/                    # Next.js 15 frontend (~170+ files)
│   └── src/
│       ├── app/            # 7 routes (landing, swipebook, grid, vault, etc.)
│       ├── components/     # UI components (~70 files)
│       │   ├── landing/    # Animated landing page (hero, features, stats)
│       │   ├── swipebook/  # Trading UI, positions dashboard, signals
│       │   ├── tap-trade/  # Canvas chart, margin controls, predictions
│       │   │   └── shared/ # ViewLayout, TradingLayout (shared layouts)
│       │   ├── gamification/ # XP bar, streaks, achievements
│       │   └── ui/         # shadcn/ui primitives
│       ├── hooks/          # React hooks (~35 files)
│       │   ├── tap-trade/  # Price streams, quick/grid trade, sessions
│       │   └── swipebook/  # Trade, margin, positions, debt detection
│       ├── lib/            # Utilities (~38 files)
│       │   ├── deepbook/   # SDK integration, margin config/transactions
│       │   ├── tap-trade/  # Constants, formatters, effects, trade API
│       │   ├── simulation/ # Demo mode engine, storage, presets
│       │   └── signals/    # RSI, MACD, risk scoring
│       └── context/        # SwipeBook global state (~50 reducer actions)
│
├── engine/                 # Market maker + trade server (Node.js/TypeScript)
│   └── src/                # 11 source files
│       ├── index.ts        # Dual-mode: MarketMaker + TradeServer
│       ├── server.ts       # Express API (6 endpoints, port 3001)
│       ├── sessionManager.ts # In-memory per-user session tracking
│       ├── marginOps.ts    # DeepBook V3 margin transaction builders
│       ├── pythRefresh.ts  # Pyth VAA caching (3s refresh, 5s TTL)
│       ├── marketMaker.ts  # AMM spread order bot
│       ├── pools.ts        # Pool configs, margin-enabled pools
│       ├── setup.ts        # One-time MarginManager creation
│       ├── config.ts       # Environment configuration
│       └── types.ts        # Type definitions, 18 mainnet pools
│
├── packages/               # Sui Move smart contracts (mainnet)
│   ├── amm/                # AMM vault: deposit, withdraw, spread orders
│   │   ├── sources/vault.move   # 366 LOC, 9 error codes
│   │   └── tests/               # vault_tests + strategy_tests (405 LOC)
│   └── token/              # DRIP LP token (9 decimals)
│       └── sources/drip.move
│
└── docs/                   # Project documentation (gitignored)
```

---

## Engine API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service status + bot address |
| GET | `/api/session/:address` | User balance, deposits, position info |
| POST | `/api/deposit/confirm` | Verify on-chain deposit, credit session |
| POST | `/api/trade/open` | Open margin position with TP/SL orders |
| POST | `/api/trade/settle` | Execute TP/SL trigger and close position |
| POST | `/api/trade/close` | Close position early (manual exit) |

---

## Supported Pools

### Mainnet (16 pairs)

| Pool | Base | Quote |
|------|------|-------|
| SUI/USDC | SUI | USDC |
| DEEP/USDC | DEEP | USDC |
| DEEP/SUI | DEEP | SUI |
| WAL/USDC | WAL | USDC |
| WAL/SUI | WAL | SUI |
| NS/USDC | NS | USDC |
| NS/SUI | NS | SUI |

Additional mainnet pools: WUSDT/USDC, WUSDC/USDC, BETH/USDC, TYPUS/SUI, SUI/AUSD, AUSD/USDC, DRF/SUI, SEND/USDC, XBTC/USDC

### Testnet (7 pairs)

SUI/DBUSDC, DEEP/SUI, DEEP/DBUSDC, DBUSDT/DBUSDC, WAL/DBUSDC, WAL/SUI, DBTC/DBUSDC

### Margin-Enabled

- **Mainnet**: SUI_USDC (5x), DEEP_USDC (3x), DEEP_SUI (3x)
- **Testnet**: SUI_DBUSDC (5x), DEEP_SUI (3x), DEEP_DBUSDC (3x), DBTC_DBUSDC (3x)

---

## Smart Contracts (Mainnet)

| Contract | Package ID |
|----------|-----------|
| AMM Vault (`deepbookamm`) | `0x180823228df40d9889a3b918a78248b43a9740e6b346402064762275ba761777` |
| DRIP Token | `0x9d38bc4d25492d7bf10afdedaf67450de14ec4faa6c89131aa3e4f5b2f00e82b` |

---

## Development

```bash
# Frontend
cd web
npm run dev         # Dev server (Turbopack)
npm run build       # Production build
npm run typecheck   # Type checking
npm run lint        # ESLint

# Engine
cd engine
npm run setup       # One-time MarginManager creation
npm run dev         # Run market maker + trade server
npm run build       # Compile TypeScript
npm run typecheck   # Type checking

# Move contracts
cd packages/amm
sui move test       # Run Move tests
```

---

## Documentation

See [`docs/`](./docs/) for detailed documentation:
- [Project Overview & PDR](./docs/project-overview-pdr.md) - Product vision, requirements, and feature status
- [Codebase Summary](./docs/codebase-summary.md) - File tree, data flows, dependencies, and environment variables
- [Code Standards](./docs/code-standards.md) - Naming conventions, patterns, and coding guidelines
- [System Architecture](./docs/system-architecture.md) - Architecture diagrams, data flow, security, and deployment

---

## License

MIT License
