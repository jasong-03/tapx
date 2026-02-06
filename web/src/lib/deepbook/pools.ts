import type { Pool } from '@/lib/swipebook/types';
import { SUI_NETWORK } from '@/lib/deepbook/config';

// Coin type addresses for mainnet
export const COIN_TYPES = {
  SUI: '0x2::sui::SUI',
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  WUSDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
  WUSDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  BETH: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH',
  NS: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS',
  TYPUS: '0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cda4f695c420f7c57ab8::typus::TYPUS',
  AUSD: '0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD',
  DRF: '0x294de7579d55c110a00a7c1439c2391c2fd4ca0fc5ec1a4361c6fc571b4579a8::drf::DRF',
  SEND: '0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND',
  WAL: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
  XBTC: '0x5a5b8db7a73f047f8c5a3f6893b77c0a8e5a3c8d::xbtc::XBTC',
} as const;

// Testnet coin types
export const TESTNET_COIN_TYPES = {
  SUI: '0x2::sui::SUI',
  DEEP: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  DBUSDC: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
} as const;

export type CoinKey = keyof typeof COIN_TYPES;

// Coin decimals
export const COIN_DECIMALS: Record<CoinKey, number> = {
  SUI: 9,
  USDC: 6,
  DEEP: 6,
  WUSDT: 6,
  WUSDC: 6,
  BETH: 8,
  NS: 6,
  TYPUS: 9,
  AUSD: 6,
  DRF: 9,
  SEND: 6,
  WAL: 9,
  XBTC: 8,
};

// Pool configurations for mainnet (addresses from engine/src/types.ts)
export const MAINNET_POOLS: Record<string, Pool> = {
  DEEP_SUI: {
    address: '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
    baseType: COIN_TYPES.DEEP,
    quoteType: COIN_TYPES.SUI,
    baseDecimals: COIN_DECIMALS.DEEP,
    quoteDecimals: COIN_DECIMALS.SUI,
  },
  SUI_USDC: {
    address: '0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407',
    baseCoin: 'SUI',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.SUI,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.SUI,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  DEEP_USDC: {
    address: '0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce',
    baseCoin: 'DEEP',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.DEEP,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.DEEP,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  WUSDT_USDC: {
    address: '0x4e2ca3988246e1d50b9bf209abb9c1cbfec65bd95afdacc620a36c67bdb8452f',
    baseCoin: 'WUSDT',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.WUSDT,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.WUSDT,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  WUSDC_USDC: {
    address: '0xa0b9ebefb38c963fd115f52d71fa64501b79d1adcb5270563f92ce0442376545',
    baseCoin: 'WUSDC',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.WUSDC,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.WUSDC,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  BETH_USDC: {
    address: '0x1109352b9112717bd2a7c3eb9a416fff1ba6951760f5bdd5424cf5e4e5b3e65c',
    baseCoin: 'BETH',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.BETH,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.BETH,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  NS_USDC: {
    address: '0x0c0fdd4008740d81a8a7d4281322aee71a1b62c449eb5b142656753d89ebc060',
    baseCoin: 'NS',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.NS,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.NS,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  NS_SUI: {
    address: '0x27c4fdb3b846aa3ae4a65ef5127a309aa3c1f466671471a806d8912a18b253e8',
    baseCoin: 'NS',
    quoteCoin: 'SUI',
    baseType: COIN_TYPES.NS,
    quoteType: COIN_TYPES.SUI,
    baseDecimals: COIN_DECIMALS.NS,
    quoteDecimals: COIN_DECIMALS.SUI,
  },
  TYPUS_SUI: {
    address: '0xe8e56f377ab5a261449b92ac42c8ddaacd5671e9fec2179d7933dd1a91200eec',
    baseCoin: 'TYPUS',
    quoteCoin: 'SUI',
    baseType: COIN_TYPES.TYPUS,
    quoteType: COIN_TYPES.SUI,
    baseDecimals: COIN_DECIMALS.TYPUS,
    quoteDecimals: COIN_DECIMALS.SUI,
  },
  SUI_AUSD: {
    address: '0x183df694ebc852a5f90a959f0f563b82ac9691e42357e9a9fe961d71a1b809c8',
    baseCoin: 'SUI',
    quoteCoin: 'AUSD',
    baseType: COIN_TYPES.SUI,
    quoteType: COIN_TYPES.AUSD,
    baseDecimals: COIN_DECIMALS.SUI,
    quoteDecimals: COIN_DECIMALS.AUSD,
  },
  AUSD_USDC: {
    address: '0x5661fc7f88fbeb8cb881150a810758cf13700bb4e1f31274a244581b37c303c3',
    baseCoin: 'AUSD',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.AUSD,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.AUSD,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  DRF_SUI: {
    address: '0x126865a0197d6ab44bfd15fd052da6db92fd2eb831ff9663451bbfa1219e2af2',
    baseCoin: 'DRF',
    quoteCoin: 'SUI',
    baseType: COIN_TYPES.DRF,
    quoteType: COIN_TYPES.SUI,
    baseDecimals: COIN_DECIMALS.DRF,
    quoteDecimals: COIN_DECIMALS.SUI,
  },
  SEND_USDC: {
    address: '0x1fe7b99c28ded39774f37327b509d58e2be7fff94899c06d22b407496a6fa990',
    baseCoin: 'SEND',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.SEND,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.SEND,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  WAL_USDC: {
    address: '0x56a1c985c1f1123181d6b881714793689321ba24301b3585eec427436eb1c76d',
    baseCoin: 'WAL',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.WAL,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.WAL,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
  WAL_SUI: {
    address: '0x81f5339934c83ea19dd6bcc75c52e83509629a5f71d3257428c2ce47cc94d08b',
    baseCoin: 'WAL',
    quoteCoin: 'SUI',
    baseType: COIN_TYPES.WAL,
    quoteType: COIN_TYPES.SUI,
    baseDecimals: COIN_DECIMALS.WAL,
    quoteDecimals: COIN_DECIMALS.SUI,
  },
  XBTC_USDC: {
    address: '0x20b9a3ec7a02d4f344aa1ebc5774b7b0ccafa9a5d76230662fdc0300bb215307',
    baseCoin: 'XBTC',
    quoteCoin: 'USDC',
    baseType: COIN_TYPES.XBTC,
    quoteType: COIN_TYPES.USDC,
    baseDecimals: COIN_DECIMALS.XBTC,
    quoteDecimals: COIN_DECIMALS.USDC,
  },
};

// Testnet pools
export const TESTNET_POOLS: Record<string, Pool> = {
  SUI_DBUSDC: {
    address: '0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5',
    baseCoin: 'SUI',
    quoteCoin: 'DBUSDC',
    baseType: TESTNET_COIN_TYPES.SUI,
    quoteType: TESTNET_COIN_TYPES.DBUSDC,
    baseDecimals: 9,
    quoteDecimals: 6,
  },
  DEEP_SUI: {
    address: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
    baseType: TESTNET_COIN_TYPES.DEEP,
    quoteType: TESTNET_COIN_TYPES.SUI,
    baseDecimals: 6,
    quoteDecimals: 9,
  },
  DEEP_DBUSDC: {
    address: '0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622',
    baseCoin: 'DEEP',
    quoteCoin: 'DBUSDC',
    baseType: TESTNET_COIN_TYPES.DEEP,
    quoteType: TESTNET_COIN_TYPES.DBUSDC,
    baseDecimals: 6,
    quoteDecimals: 6,
  },
};

// SwipeBook pools - curated list for the swipe interface (most liquid pairs)
export const SWIPEBOOK_POOL_KEYS = [
  'SUI_USDC',
  'DEEP_USDC',
  'WAL_USDC',
  'NS_USDC',
  'DEEP_SUI',
  'WAL_SUI',
  'NS_SUI',
] as const;

export const TESTNET_SWIPEBOOK_POOL_KEYS = [
  'SUI_DBUSDC',
  'DEEP_SUI',
  'DEEP_DBUSDC',
] as const;

export type SwipeBookPoolKey = (typeof SWIPEBOOK_POOL_KEYS)[number];

export function getPool(key: string): Pool | undefined {
  const pools = SUI_NETWORK === 'testnet' ? TESTNET_POOLS : MAINNET_POOLS;
  return pools[key];
}

export function getSwipeBookPools(): Pool[] {
  if (SUI_NETWORK === 'testnet') {
    return TESTNET_SWIPEBOOK_POOL_KEYS.map((key) => TESTNET_POOLS[key]).filter(Boolean);
  }
  return SWIPEBOOK_POOL_KEYS.map((key) => MAINNET_POOLS[key]).filter(Boolean);
}

export function getPoolByAddress(address: string): Pool | undefined {
  const pools = SUI_NETWORK === 'testnet' ? TESTNET_POOLS : MAINNET_POOLS;
  return Object.values(pools).find((pool) => pool.address === address);
}
