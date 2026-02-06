# DeepMaker / SwipeBook

**Decentralized vaults for market-making on [DeepBook](https://deepbook.tech/) with a swipe-to-trade interface.**

DeepMaker provides automated market-making infrastructure for Sui's native CLOB, while SwipeBook offers a gamified trading experience - swipe right to buy, left to sell.

## Key Features

### SwipeBook Trading Interface
- **Swipe-to-Trade**: Intuitive mobile-first UX inspired by dating apps
- **AI Trading Signals**: RSI, MACD, and EMA-based buy/sell recommendations
- **Risk Assessment**: Real-time pool risk scoring based on volatility and liquidity
- **Gamification**: XP, levels, achievements, streaks, and leaderboards
- **Social Features**: Whale alerts, community consensus, and watchlists

### DeepMaker AMM Vaults
- **Pooled Liquidity**: Deposit token pairs to earn from market-making spreads
- **LP Tokens (DRIP)**: Proportional representation of vault share
- **Automated Spread Orders**: Dynamic bid/ask placement on DeepBook
- **Pyth Oracle Integration**: Accurate pricing for deposits and withdrawals
- **Portfolio Rebalancing**: Automatic order skewing to maintain balance

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS, Framer Motion |
| **Blockchain** | Sui Move, DeepBook V3, Pyth Oracle |
| **Wallet** | @mysten/dapp-kit-react, Sui Wallet |
| **Data** | TanStack Query, React Context |
| **Engine** | Node.js, @mysten/sui SDK |

## Prerequisites

- Node.js 20+
- npm or yarn
- Sui Wallet browser extension
- Sui CLI (for contract deployment)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-org/swipe-trading-.git
cd swipe-trading-

# Install frontend dependencies
cd web && npm install

# Install engine dependencies
cd ../engine && npm install
```

### 2. Configure Environment

**Frontend** (`web/.env.local`):
```bash
NEXT_PUBLIC_AMM_PACKAGE_ID=<deployed package ID>
NEXT_PUBLIC_PRICE_ID_SUI_USD=<Pyth SUI/USD feed ID>
NEXT_PUBLIC_PRICE_ID_DEEP_USD=<Pyth DEEP/USD feed ID>
```

**Engine** (`engine/.env.local`):
```bash
RPC_URL=https://fullnode.mainnet.sui.io
AMM_PACKAGE_ID=<deployed package ID>
TRADE_CAP_ID=<TradingCap object ID>
POOL_ID=<DeepBook pool ID>
PRIVATE_KEY=<operator wallet key>
SPREAD_BPS=1000
ORDER_SIZE=100
INTERVAL_MS=10000
```

### 3. Run Development Servers

```bash
# Terminal 1: Frontend
cd web && npm run dev
# Open http://localhost:3000

# Terminal 2: Trading Engine (optional)
cd engine && npm run dev
```

### 4. Deploy Contracts (if needed)

```bash
cd packages/amm
sui move build
sui client publish --gas-budget 100000000

cd ../token
sui move build
sui client publish --gas-budget 100000000
```

## Project Structure

```
swipe-trading-/
|-- engine/                 # Market maker bot (TypeScript)
|   |-- src/
|   |   |-- index.ts       # Entry point
|   |   |-- marketMaker.ts # Core trading logic
|   |   |-- config.ts      # Environment config
|   |   +-- types.ts       # Type definitions
|
|-- packages/               # Sui Move smart contracts
|   |-- amm/               # AMM vault contract
|   |   +-- sources/vault.move
|   +-- token/             # DRIP LP token
|       +-- sources/drip.move
|
|-- web/                    # Next.js frontend
|   +-- src/
|       |-- app/           # App Router pages
|       |   |-- page.tsx           # Vault management
|       |   +-- swipebook/         # Trading interface
|       |-- components/    # React components
|       |-- hooks/         # Custom hooks (signals, risk, gamification)
|       |-- context/       # State management
|       +-- lib/           # Utilities and types
|
+-- docs/                   # Documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Product Overview](./docs/project-overview-prd.md) | Vision, features, roadmap, success metrics |
| [Codebase Summary](./docs/codebase-summary.md) | Architecture, directory structure, data flows |
| [Code Standards](./docs/code-standards.md) | Conventions for TypeScript, Move, React |
| [System Architecture](./docs/system-architecture.md) | Technical architecture, integrations, deployment |

## Supported Trading Pairs

The engine supports 16+ DeepBook mainnet pools:

| Pool | Address |
|------|---------|
| DEEP/SUI | `0xb663...fc22` |
| SUI/USDC | `0xe05d...4407` |
| DEEP/USDC | `0xf948...95ce` |
| WAL/SUI | `0x81f5...d08b` |
| NS/USDC | `0x0c0f...e060` |

See `engine/src/types.ts` for complete pool registry.

## Smart Contract Functions

### AMM Vault (`packages/amm`)

| Function | Description |
|----------|-------------|
| `create_vault` | Initialize new vault with LP treasury cap |
| `deposit` | Add liquidity, receive DRIP tokens |
| `withdraw` | Burn DRIP tokens, receive assets |
| `create_spread_order` | Place bid/ask orders on DeepBook |
| `generate_trade_proof` | Authorize trading operations |

### DRIP Token (`packages/token`)

| Property | Value |
|----------|-------|
| Symbol | DRIP |
| Decimals | 9 |
| Supply | Elastic (minted on deposit, burned on withdrawal) |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes following our [code standards](./docs/code-standards.md)
4. Write/update tests as needed
5. Submit a pull request

### Development Commands

```bash
# Frontend
cd web
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run typecheck    # TypeScript check

# Engine
cd engine
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm run start        # Run compiled JS

# Contracts
cd packages/amm
sui move build       # Compile Move
sui move test        # Run tests
```

## Security

- Smart contracts use capability-based access control
- All transactions require wallet signature approval
- No private keys stored in frontend
- Oracle prices validated for staleness (max 60s)

For security concerns, please open a private issue or contact the team directly.

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

Built for [HackMoney 2026](https://hackmoney.xyz) | Powered by [Sui](https://sui.io) and [DeepBook](https://deepbook.tech)
