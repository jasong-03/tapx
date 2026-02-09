/**
 * Pyth oracle price refresh for DeepBook margin operations.
 *
 * DeepBook's margin module calls `pyth::check_price_is_fresh()` which aborts
 * with code 3 when the on-chain Pyth PriceInfoObject hasn't been updated recently.
 * This utility fetches fresh VAAs from Hermes and prepends `updatePriceFeeds`
 * commands to the transaction so prices are fresh when margin operations execute.
 *
 * NOTE: We do NOT use the DeepBook SDK's SuiPythClient because it internally
 * calls `getDynamicField` which in Sui SDK v2 uses `deriveDynamicFieldID` to
 * compute the wrapper object ID locally. For DynamicObject fields (like the
 * price_info table), the derived wrapper ID doesn't exist on-chain, causing
 * "Object does not exist" errors. Instead, we hardcode the PriceInfoObject IDs
 * from the DeepBook SDK constants and build the moveCall commands directly.
 */

import { bcs } from '@mysten/sui/bcs';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { SUI_NETWORK } from './config';

const MAX_ARGUMENT_SIZE = 16 * 1024;

/**
 * Extract VAA bytes from an accumulator message.
 * (Inlined from @mysten/deepbook-v3 pyth-helpers — not publicly exported)
 */
function extractVaaBytesFromAccumulatorMessage(msg: Uint8Array): Uint8Array {
  const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
  const trailingPayloadSize = dv.getUint8(6);
  const vaaSizeOffset = 7 + trailingPayloadSize + 1;
  const vaaSize = dv.getUint16(vaaSizeOffset, false);
  const vaaOffset = vaaSizeOffset + 2;
  return msg.subarray(vaaOffset, vaaOffset + vaaSize);
}

// Static config per network (from DeepBook SDK constants + on-chain lookups)
const PYTH_CONFIGS = {
  testnet: {
    pythStateId: '0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c',
    wormholeStateId: '0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790',
    pythPackageId: '0xabf837e98c26087cba0883c0a7a28326b1fa3c5e1e2c5abdb486f9e8f594c837',
    wormholePackageId: '0x21473617f3565d704aa67be73ea41243e9e34a42d434c31f8182c67ba01ccf49',
    baseUpdateFee: 1,
    hermesUrl: 'https://hermes-beta.pyth.network',
  },
  mainnet: {
    pythStateId: '0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8',
    wormholeStateId: '0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c',
    pythPackageId: '0x04e20ddf36af412a4096f9014f4a565af9e812db9a05cc40254846cf6ed0ad91',
    wormholePackageId: '0x5306f64e312b581766351c07af79c72fcb1cd25147157fdc2f8ad76de9a3fb6a',
    baseUpdateFee: 1,
    hermesUrl: 'https://hermes.pyth.network',
  },
} as const;

// Pyth price feed IDs + PriceInfoObject IDs per coin per network
// (from DeepBook SDK constants.ts)
const PRICE_FEEDS = {
  testnet: {
    DEEP: {
      feedId: '0x99137a18354efa7fb6840889d059fdb04c46a6ce21be97ab60d9ad93e91ac758',
      priceInfoObjectId: '0x3d52fffa2cd9e54b39bb36d282bdda560b15b8b4fdf4766a3c58499ef172bafc',
    },
    SUI: {
      feedId: '0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266',
      priceInfoObjectId: '0x1ebb295c789cc42b3b2a1606482cd1c7124076a0f5676718501fda8c7fd075a0',
    },
    DBUSDC: {
      feedId: '0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722',
      priceInfoObjectId: '0x9c4dd4008297ffa5e480684b8100ec21cc934405ed9a25d4e4d7b6259aad9c81',
    },
    DBTC: {
      feedId: '0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b',
      priceInfoObjectId: '0x72431a238277695d3f31e4425225a4462674ee6cceeea9d66447b210755fffba',
    },
  },
  mainnet: {
    DEEP: {
      feedId: '0x29bdd5248234e33bd93d3b81100b5fa32eaa5997843847e2c2cb16d7c6d9f7ff',
      priceInfoObjectId: '0x8c7f3a322b94cc69db2a2ac575cbd94bf5766113324c3a3eceac91e3e88a51ed',
    },
    SUI: {
      feedId: '0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',
      priceInfoObjectId: '0x801dbc2f0053d34734814b2d6df491ce7807a725fe9a01ad74a07e9c51396c37',
    },
    USDC: {
      feedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
      priceInfoObjectId: '0x5dec622733a204ca27f5a90d8c2fad453cc6665186fd5dff13a83d0b6c9027ab',
    },
    WAL: {
      feedId: '0xeba0732395fae9dec4bae12e52760b35fc1c5671e2da8b449c9af4efe5d54341',
      priceInfoObjectId: '0xeb7e669f74d976c0b99b6ef9801e3a77716a95f1a15754e0f1399ce3fb60973d',
    },
  },
} as const;

// Pool key → [baseCoin, quoteCoin] mapping
const POOL_COINS: Record<string, [string, string]> = {
  // Testnet
  SUI_DBUSDC: ['SUI', 'DBUSDC'],
  DEEP_SUI: ['DEEP', 'SUI'],
  DEEP_DBUSDC: ['DEEP', 'DBUSDC'],
  DBTC_DBUSDC: ['DBTC', 'DBUSDC'],
  // Mainnet
  SUI_USDC: ['SUI', 'USDC'],
  DEEP_USDC: ['DEEP', 'USDC'],
};

/**
 * Fetch price update data from Hermes v2 API.
 * The old `/api/latest_vaas` endpoint returns 404; v2 uses `/v2/updates/price/latest`.
 */
async function fetchPriceUpdateData(feedIds: string[]): Promise<Uint8Array[]> {
  const params = new URLSearchParams();
  for (const id of feedIds) {
    params.append('ids[]', id);
  }
  params.append('encoding', 'base64');
  params.append('parsed', 'false');

  const config = PYTH_CONFIGS[SUI_NETWORK];
  const resp = await fetch(`${config.hermesUrl}/v2/updates/price/latest?${params.toString()}`);
  if (!resp.ok) {
    throw new Error(`Hermes API error: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json() as { binary: { encoding: string; data: string[] } };
  return json.binary.data.map((b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  });
}

/**
 * Get the feed info (feedId + priceInfoObjectId) for coins in a pool.
 */
function getFeedInfoForPool(poolKey: string): Array<{ feedId: string; priceInfoObjectId: string }> {
  const coins = POOL_COINS[poolKey];
  if (!coins) return [];

  const feeds = PRICE_FEEDS[SUI_NETWORK] as Record<string, { feedId: string; priceInfoObjectId: string }>;
  const result: Array<{ feedId: string; priceInfoObjectId: string }> = [];

  for (const coin of coins) {
    const feed = feeds[coin];
    if (feed) result.push(feed);
  }

  return result;
}

/**
 * Get the Pyth price feed IDs needed for a given pool.
 */
export function getFeedIdsForPool(poolKey: string): string[] {
  return getFeedInfoForPool(poolKey).map(f => f.feedId);
}

/**
 * Build Pyth price update commands directly on a transaction.
 *
 * This replaces SuiPythClient.updatePriceFeeds() which breaks on Sui SDK v2
 * due to getDynamicField deriving a non-existent wrapper object ID for
 * DynamicObject fields.
 *
 * Flow: verify VAA → create authenticated price infos → update each feed → destroy hot potato
 */
async function addPythPriceUpdates(
  tx: Transaction,
  poolKey: string,
): Promise<string[]> {
  const feedInfo = getFeedInfoForPool(poolKey);
  if (feedInfo.length === 0) return [];

  const feedIds = feedInfo.map(f => f.feedId);
  const config = PYTH_CONFIGS[SUI_NETWORK];

  // Fetch fresh VAAs from Hermes v2 API
  const updates = await fetchPriceUpdateData(feedIds);

  const coins = POOL_COINS[poolKey] ?? [];
  console.log(
    `%c[PYTH] %cRefreshing ${feedInfo.length} oracle feeds for ${poolKey}: ${coins.join(', ')} → VAA fetched (${updates[0].length} bytes)`,
    'color: #e6a817; font-weight: bold', 'color: #f0d070'
  );

  if (updates.length > 1) {
    throw new Error('SDK does not support multiple accumulator messages in a single transaction');
  }

  // 1. Extract VAA from accumulator message and verify via Wormhole
  const vaa = extractVaaBytesFromAccumulatorMessage(updates[0]);
  const [verifiedVaa] = tx.moveCall({
    target: `${config.wormholePackageId}::vaa::parse_and_verify`,
    arguments: [
      tx.object(config.wormholeStateId),
      tx.pure.vector('u8', vaa),
      tx.object.clock(),
    ],
  });

  // 2. Create authenticated price infos using the full accumulator message
  let [priceUpdatesHotPotato] = tx.moveCall({
    target: `${config.pythPackageId}::pyth::create_authenticated_price_infos_using_accumulator`,
    arguments: [
      tx.object(config.pythStateId),
      tx.pure(
        bcs
          .vector(bcs.U8)
          .serialize(Array.from(updates[0]), { maxSize: MAX_ARGUMENT_SIZE })
          .toBytes(),
      ),
      verifiedVaa,
      tx.object.clock(),
    ],
  });

  // 3. Update each price feed with its PriceInfoObject
  const priceInfoObjectIds: string[] = [];
  for (const feed of feedInfo) {
    priceInfoObjectIds.push(feed.priceInfoObjectId);
    [priceUpdatesHotPotato] = tx.moveCall({
      target: `${config.pythPackageId}::pyth::update_single_price_feed`,
      arguments: [
        tx.object(config.pythStateId),
        priceUpdatesHotPotato,
        tx.object(feed.priceInfoObjectId),
        coinWithBalance({ balance: config.baseUpdateFee }),
        tx.object.clock(),
      ],
    });
  }

  // 4. Destroy the hot potato
  tx.moveCall({
    target: `${config.pythPackageId}::hot_potato_vector::destroy`,
    arguments: [priceUpdatesHotPotato],
    typeArguments: [`${config.pythPackageId}::price_info::PriceInfo`],
  });

  console.log(
    `%c[PYTH] %cUpdated PriceInfoObjects: ${priceInfoObjectIds.map(id => id.slice(0, 10) + '...').join(', ')} (${config.baseUpdateFee} MIST/feed)`,
    'color: #e6a817; font-weight: bold', 'color: #f0d070'
  );

  return priceInfoObjectIds;
}

/**
 * Prepend Pyth price update commands to a transaction.
 * This ensures the on-chain PriceInfoObjects are fresh before margin operations.
 */
export async function prependPythPriceUpdate(
  tx: Transaction,
  poolKey: string,
): Promise<Transaction> {
  await addPythPriceUpdates(tx, poolKey);
  return tx;
}

/**
 * Build a fresh transaction with Pyth price updates prepended,
 * then apply margin operations on top.
 *
 * @param poolKeys - One or more pool keys (e.g. 'SUI_DBUSDC' or ['DEEP_SUI', 'SUI_DBUSDC']).
 *                   When multiple pools are provided, Pyth updates are added for all
 *                   (needed when unwinding stale debt in pool A before opening in pool B).
 * @param sender - Transaction sender address
 * @param buildMarginOps - Callback to add margin operations to the tx
 */
export async function buildMarginTxWithPythRefresh(
  poolKeys: string | string[],
  sender: string,
  buildMarginOps: (tx: Transaction) => void,
): Promise<Transaction> {
  const tx = new Transaction();
  tx.setSenderIfNotSet(sender);

  const keys = Array.isArray(poolKeys) ? poolKeys : [poolKeys];
  // Deduplicate and add Pyth updates for each pool
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    await addPythPriceUpdates(tx, key);
  }

  // Now add the margin operations
  buildMarginOps(tx);

  console.log(
    `%c[PTB] %cMargin tx built with Pyth refresh for: ${keys.join(', ')}`,
    'color: #00bfff; font-weight: bold', 'color: #88ddff'
  );

  return tx;
}
