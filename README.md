# TapX

**Tap a price grid, execute real DeFi trades on Sui.**

TapX is a mobile-first trading interface built on DeepBook (Sui's native order book). Instead of complex order forms, users tap cells on an interactive price grid to instantly execute on-chain market orders.

Built for [HackMoney 2026](https://hackmoney.xyz) | Powered by [Sui](https://sui.io) and [DeepBook](https://deepbook.tech)

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
- **Round History**: Track your last 50 prediction outcomes

### Simulation Mode
- **Risk-free Demo**: Toggle to a simulated trading environment ($10,000 fake balance)
- **Identical UI**: Same interface as live trading for realistic practice
- **No On-chain Cost**: Trades execute locally without blockchain transactions
- **Visual Indicator**: Clear banner differentiates demo from live mode

### DeepBook Integration
- **On-chain Order Book**: Direct swaps on Sui's native CLOB
- **Real-time Prices**: 3-second polling with visual interpolation
- **22 Trading Pairs**: SUI/USDC, DEEP/USDC, WAL/USDC, NS/USDC, and more
- **Wallet Balance**: Live balance display from connected wallet

### Gamification
- **XP System**: Earn experience points per trade (100 levels)
- **Streaks**: Daily trading streak tracking with multipliers (1x-2x)
- **Leaderboard**: Compete with other traders (weekly/all-time)
- **Achievements**: Unlock badges for milestones

### AMM Vault (DeepMaker)
- **Liquidity Provision**: Deposit base/quote assets into managed vaults
- **LP Tokens (DRIP)**: Receive proportional share tokens (9 decimals)
- **Automated Market Making**: Engine bot places spread orders around mid-price
- **Inventory Skewing**: Dynamic order adjustment based on asset balance

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS v4, Canvas API |
| **Blockchain** | Sui Move (2024.beta), DeepBook V3, Pyth Oracle |
| **Wallet** | @mysten/dapp-kit-react |
| **Data** | TanStack Query v5, React Context, localStorage |
| **UI** | shadcn/ui (Radix), Framer Motion, Lucide Icons |
| **Engine** | Node.js, @mysten/deepbook-v3 SDK |

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
# Open http://localhost:3000/swipebook
```

### 4. Market Maker Bot (Optional)

```bash
cd engine && npm install
# Configure engine/.env.local (see engine/.env.example)
npm run dev
```

## How It Works

1. **Connect Wallet**: Click "Connect Wallet" to link your Sui wallet
2. **Select Pool**: Choose trading pair from dropdown (SUI/USDC default)
3. **Set Stake**: Pick trade size ($1, $5, or $10)
4. **Tap to Trade**:
   - Tap cell **above** current price -> **BUY** (quote -> base)
   - Tap cell **below** current price -> **SELL** (base -> quote)
5. **Confirm**: Sign transaction in wallet popup
6. **Done**: Trade executes on DeepBook, balance updates

**Quick Trade Mode**: Select leverage (2x/3x/5x), choose a timeframe (15s/30s/1m), and tap UP or DOWN to predict price direction. Watch your PnL in real-time as the countdown runs.

**Simulation Mode**: Toggle the demo switch to practice with $10,000 in fake funds. The UI is identical to live trading, but no transactions are submitted on-chain.

## Project Structure

```
tapx/
├── web/                    # Next.js 15 frontend (~122 files)
│   └── src/
│       ├── app/            # Pages (home, swipebook, leaderboard, profile)
│       ├── components/     # UI components (~35 files)
│       │   ├── swipebook/  # Trading UI, margin controls, simulation toggle
│       │   ├── tap-trade/  # Canvas chart, controls, overlays
│       │   ├── gamification/ # XP bar, streaks, achievements
│       │   └── ui/         # shadcn/ui primitives
│       ├── hooks/          # React hooks (~22 files)
│       │   └── swipebook/  # Trade, margin, simulation, pool hooks
│       ├── lib/            # Utilities (~28 files)
│       │   ├── deepbook/   # SDK integration, margin config/transactions
│       │   ├── simulation/ # Demo mode engine, storage, presets
│       │   ├── signals/    # RSI, MACD, risk scoring
│       │   └── gamification/ # XP, streaks, achievements
│       └── context/        # SwipeBook global state (~40 reducer actions)
│
├── engine/                 # Market maker bot (TypeScript/Node.js)
│   └── src/
│       ├── index.ts        # Entry point, vault bootstrap
│       ├── marketMaker.ts  # Spread order loop, balance monitoring
│       ├── config.ts       # Environment configuration
│       └── types.ts        # Type definitions, 17 mainnet pools
│
├── packages/               # Sui Move smart contracts (mainnet)
│   ├── amm/                # AMM vault: deposit, withdraw, spread orders
│   │   ├── sources/vault.move   # 366 LOC, 9 error codes
│   │   └── tests/               # vault_tests + strategy_tests (405 LOC)
│   └── token/              # DRIP LP token (9 decimals)
│       └── sources/drip.move
│
└── docs/                   # Project documentation
```

## Supported Pools (22 Mainnet)

| Pool | Base | Quote |
|------|------|-------|
| SUI/USDC | SUI | USDC |
| DEEP/USDC | DEEP | USDC |
| DEEP/SUI | DEEP | SUI |
| WAL/USDC | WAL | USDC |
| WAL/SUI | WAL | SUI |
| NS/USDC | NS | USDC |
| NS/SUI | NS | SUI |

Additional mainnet pools: WUSDT/USDC, WUSDC/USDC, BETH/USDC, TYPUS/SUI, SUI/AUSD, AUSD/USDC, DRF/SUI, SEND/USDC, XBTC/USDC, NAVX/SUI, CETUS/SUI, TURBOS/SUI, AFSUI/SUI, HASUI/SUI, VSUI/SUI

## Smart Contracts (Mainnet)

| Contract | Package ID |
|----------|-----------|
| AMM Vault (`deepbookamm`) | `0x180823228df40d9889a3b918a78248b43a9740e6b346402064762275ba761777` |
| DRIP Token | `0x9d38bc4d25492d7bf10afdedaf67450de14ec4faa6c89131aa3e4f5b2f00e82b` |

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
npm run dev         # Run market maker
npm run build       # Compile TypeScript
npm run typecheck   # Type checking

# Move contracts
cd packages/amm
sui move test       # Run Move tests
```

## Documentation

See [`docs/`](./docs/) for detailed documentation:
- [Project Overview & PDR](./docs/project-overview-pdr.md) - Product vision, requirements, and feature status
- [Codebase Summary](./docs/codebase-summary.md) - File tree, data flows, dependencies, and environment variables
- [Code Standards](./docs/code-standards.md) - Naming conventions, patterns, and coding guidelines
- [System Architecture](./docs/system-architecture.md) - Architecture diagrams, data flow, security, and deployment

## License

MIT License
