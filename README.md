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
- **Streaks**: Daily trading streak tracking
- **Leaderboard**: Compete with other traders
- **Achievements**: Unlock badges for milestones

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS, Canvas API |
| **Blockchain** | Sui Move, DeepBook V3 |
| **Wallet** | @mysten/dapp-kit-react |
| **Data** | TanStack Query, React Context |

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/jasong-03/tapx.git
cd tapx

# Install dependencies
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

## Project Structure

```
tapx/
├── engine/                 # Market maker bot (optional)
│   └── src/
│       ├── index.ts
│       ├── marketMaker.ts
│       └── config.ts
│
├── packages/               # Sui Move contracts
│   ├── amm/               # AMM vault contract
│   └── token/             # DRIP LP token
│
└── web/                    # Next.js frontend
    └── src/
        ├── app/
        │   └── swipebook/  # Main trading interface
        ├── components/
        │   ├── tap-trade/  # Canvas chart, controls
        │   └── swipebook/  # Portfolio, history
        ├── hooks/
        │   ├── tap-trade/  # Price stream
        │   └── swipebook/  # Trade execution
        └── lib/
            └── deepbook/   # Pool configs, transactions
```

## How It Works

1. **Connect Wallet**: Click "Connect Wallet" to link your Sui wallet
2. **Select Pool**: Choose trading pair from dropdown (SUI/USDC default)
3. **Set Stake**: Pick trade size (1, 5, or 10 USDC)
4. **Tap to Trade**:
   - Tap cell **above** current price → **BUY** (quote → base)
   - Tap cell **below** current price → **SELL** (base → quote)
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

## Development

```bash
# Start dev server
cd web && npm run dev

# Build for production
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

## License

MIT License

---

Built for [HackMoney 2026](https://hackmoney.xyz) | Powered by [Sui](https://sui.io) and [DeepBook](https://deepbook.tech)
