# TapX

**Tap a price grid, execute real DeFi trades on Sui.**

TapX is a mobile-first trading interface built on DeepBook (Sui's native order book). Instead of complex order forms, users tap cells on an interactive price grid to instantly execute on-chain market orders.

## Key Features

### Tap-to-Trade Interface
- **Interactive Price Grid**: Real-time canvas chart with tap-to-trade cells
- **Instant Execution**: Tap above price to buy, below to sell
- **Zoom Controls**: 1x-20x resolution for precise price targeting
- **Smooth Animations**: Catmull-Rom spline interpolation at 60fps

### DeepBook Integration
- **On-chain Order Book**: Direct swaps on Sui's native CLOB
- **Real-time Prices**: 3-second polling with visual interpolation
- **Multiple Pairs**: SUI/USDC, DEEP/USDC, WAL/USDC, NS/USDC, and more
- **Wallet Balance**: Live balance display from connected wallet

### Gamification
- **XP System**: Earn experience points per trade
- **Streaks**: Daily trading streak tracking with multipliers (1x-2x)
- **Leaderboard**: Compete with other traders (weekly/all-time)
- **Achievements**: Unlock badges for milestones

### AMM Vault (DeepMaker)
- **Liquidity Provision**: Deposit base/quote assets into managed vaults
- **LP Tokens (DRIP)**: Receive proportional share tokens
- **Automated Market Making**: Engine bot places spread orders around mid-price

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS v4, Canvas API |
| **Blockchain** | Sui Move (2024.beta), DeepBook V3, Pyth Oracle |
| **Wallet** | @mysten/dapp-kit-react |
| **Data** | TanStack Query v5, React Context |
| **UI** | shadcn/ui (Radix), Framer Motion, Lucide Icons |

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

## Project Structure

```
tapx/
├── engine/                 # Market maker bot (TypeScript/Node.js)
│   └── src/
│       ├── index.ts        # Entry point, vault bootstrap
│       ├── marketMaker.ts  # Spread order loop, balance monitoring
│       ├── config.ts       # Environment configuration
│       └── types.ts        # Type definitions, pool registry
│
├── packages/               # Sui Move smart contracts (mainnet)
│   ├── amm/               # AMM vault: deposit, withdraw, spread orders
│   │   └── sources/vault.move
│   └── token/             # DRIP LP token (9 decimals)
│       └── sources/drip.move
│
├── web/                    # Next.js 15 frontend
│   └── src/
│       ├── app/
│       │   ├── page.tsx           # DeepMaker vault management
│       │   └── swipebook/        # TapTrade interface, leaderboard, profile
│       ├── components/
│       │   ├── tap-trade/        # Canvas chart, controls, overlays
│       │   ├── swipebook/        # Portfolio, history, navigation
│       │   ├── gamification/     # XP bar, streak badge
│       │   └── ui/              # shadcn/ui primitives
│       ├── hooks/               # React hooks (price stream, trade execution)
│       ├── lib/                 # DeepBook SDK, betting logic, gamification
│       └── context/             # SwipeBook state management
│
└── docs/                   # Project documentation
    ├── project-overview-pdr.md   # Product overview & requirements
    ├── codebase-summary.md       # File tree & data flows
    ├── code-standards.md         # Conventions & patterns
    └── system-architecture.md    # Architecture diagrams
```

## How It Works

1. **Connect Wallet**: Click "Connect Wallet" to link your Sui wallet
2. **Select Pool**: Choose trading pair from dropdown (SUI/USDC default)
3. **Set Stake**: Pick trade size (1, 5, or 10 USDC)
4. **Tap to Trade**:
   - Tap cell **above** current price -> **BUY** (quote -> base)
   - Tap cell **below** current price -> **SELL** (base -> quote)
5. **Confirm**: Sign transaction in wallet popup
6. **Done**: Trade executes on DeepBook, balance updates

## Supported Pools

| Pool | Base | Quote |
|------|------|-------|
| SUI/USDC | SUI | USDC |
| DEEP/USDC | DEEP | USDC |
| DEEP/SUI | DEEP | SUI |
| WAL/USDC | WAL | USDC |
| WAL/SUI | WAL | SUI |
| NS/USDC | NS | USDC |
| NS/SUI | NS | SUI |

## Smart Contracts (Mainnet)

| Contract | Package ID |
|----------|-----------|
| AMM Vault (deepbookamm) | `0x1808...1777` |
| DRIP Token | `0x9d38...e82b` |

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
- [Project Overview & PDR](./docs/project-overview-pdr.md)
- [Codebase Summary](./docs/codebase-summary.md)
- [Code Standards](./docs/code-standards.md)
- [System Architecture](./docs/system-architecture.md)

## License

MIT License

---

Built for [HackMoney 2026](https://hackmoney.xyz) | Powered by [Sui](https://sui.io) and [DeepBook](https://deepbook.tech)
