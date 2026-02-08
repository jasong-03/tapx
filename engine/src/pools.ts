// Pool configurations for DeepBook V3 margin trading
// Ported from web/src/lib/deepbook/pools.ts

export type SuiNetwork = 'testnet' | 'mainnet';

export interface Pool {
  poolKey: string;
  address: string;
  baseCoin: string;
  quoteCoin: string;
  baseType: string;
  quoteType: string;
  baseDecimals: number;
  quoteDecimals: number;
}

// Testnet coin types (DeepBook V3 VERSION 15)
const TESTNET_COIN_TYPES = {
  SUI: '0x2::sui::SUI',
  DEEP: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  DBUSDC: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
  DBUSDT: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDT::DBUSDT',
  WAL: '0x9ef7676a9f81937a52ae4b2af8d511a28a0b080477c0c2db40b0ab8882240d76::wal::WAL',
  DBTC: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86::dbtc::DBTC',
} as const;

// Mainnet coin types
const MAINNET_COIN_TYPES = {
  SUI: '0x2::sui::SUI',
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  WAL: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
} as const;

const TESTNET_POOLS: Record<string, Pool> = {
  DEEP_SUI: {
    poolKey: 'DEEP_SUI',
    address: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
    baseType: TESTNET_COIN_TYPES.DEEP,
    quoteType: TESTNET_COIN_TYPES.SUI,
    baseDecimals: 6,
    quoteDecimals: 9,
  },
  SUI_DBUSDC: {
    poolKey: 'SUI_DBUSDC',
    address: '0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5',
    baseCoin: 'SUI',
    quoteCoin: 'DBUSDC',
    baseType: TESTNET_COIN_TYPES.SUI,
    quoteType: TESTNET_COIN_TYPES.DBUSDC,
    baseDecimals: 9,
    quoteDecimals: 6,
  },
  DEEP_DBUSDC: {
    poolKey: 'DEEP_DBUSDC',
    address: '0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622',
    baseCoin: 'DEEP',
    quoteCoin: 'DBUSDC',
    baseType: TESTNET_COIN_TYPES.DEEP,
    quoteType: TESTNET_COIN_TYPES.DBUSDC,
    baseDecimals: 6,
    quoteDecimals: 6,
  },
  DBTC_DBUSDC: {
    poolKey: 'DBTC_DBUSDC',
    address: '0x0dce0aa771074eb83d1f4a29d48be8248d4d2190976a5241f66b43ec18fa34de',
    baseCoin: 'DBTC',
    quoteCoin: 'DBUSDC',
    baseType: TESTNET_COIN_TYPES.DBTC,
    quoteType: TESTNET_COIN_TYPES.DBUSDC,
    baseDecimals: 8,
    quoteDecimals: 6,
  },
};

const MAINNET_POOLS: Record<string, Pool> = {
  DEEP_SUI: {
    poolKey: 'DEEP_SUI',
    address: '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
    baseType: MAINNET_COIN_TYPES.DEEP,
    quoteType: MAINNET_COIN_TYPES.SUI,
    baseDecimals: 6,
    quoteDecimals: 9,
  },
  SUI_USDC: {
    poolKey: 'SUI_USDC',
    address: '0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407',
    baseCoin: 'SUI',
    quoteCoin: 'USDC',
    baseType: MAINNET_COIN_TYPES.SUI,
    quoteType: MAINNET_COIN_TYPES.USDC,
    baseDecimals: 9,
    quoteDecimals: 6,
  },
  DEEP_USDC: {
    poolKey: 'DEEP_USDC',
    address: '0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce',
    baseCoin: 'DEEP',
    quoteCoin: 'USDC',
    baseType: MAINNET_COIN_TYPES.DEEP,
    quoteType: MAINNET_COIN_TYPES.USDC,
    baseDecimals: 6,
    quoteDecimals: 6,
  },
};

let currentNetwork: SuiNetwork = 'testnet';

export function setNetwork(network: SuiNetwork): void {
  currentNetwork = network;
}

export function getNetwork(): SuiNetwork {
  return currentNetwork;
}

export function getPool(key: string): Pool | undefined {
  const pools = currentNetwork === 'testnet' ? TESTNET_POOLS : MAINNET_POOLS;
  return pools[key];
}

export function getAllPools(): Record<string, Pool> {
  return currentNetwork === 'testnet' ? TESTNET_POOLS : MAINNET_POOLS;
}

// Margin-enabled pool keys per network
const TESTNET_MARGIN_POOL_KEYS = ['SUI_DBUSDC', 'DEEP_SUI', 'DEEP_DBUSDC', 'DBTC_DBUSDC'] as const;
const MAINNET_MARGIN_POOL_KEYS = ['SUI_USDC', 'DEEP_USDC', 'DEEP_SUI'] as const;

export function getMarginPoolKeys(): string[] {
  return [...(currentNetwork === 'testnet' ? TESTNET_MARGIN_POOL_KEYS : MAINNET_MARGIN_POOL_KEYS)];
}

// DeepBook spot package IDs per network
const DEEPBOOK_PACKAGE_IDS: Record<SuiNetwork, string> = {
  testnet: '0xbc331f09e5c737d45f074ad2d17c3038421b3b9018699e370d88d94938c53d28',
  mainnet: '0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497',
};

export function getDeepBookPackageId(): string {
  return DEEPBOOK_PACKAGE_IDS[currentNetwork];
}

export const DUMMY_SENDER = '0x44e12ed495a913b594b5b73c5358b6a6516d4e3742f7a0dcdec12053b6b0aced';
