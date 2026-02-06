import { useQueries } from '@tanstack/react-query';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Pool, PoolWithMarketData } from '@/lib/swipebook/types';
import { getSwipeBookPools } from '@/lib/deepbook/pools';
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from '@/lib/deepbook/config';

async function fetchPoolMarketData(
  client: SuiJsonRpcClient,
  pool: Pool
): Promise<PoolWithMarketData> {
  const tx = new Transaction();

  // Get mid price
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::mid_price`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [tx.object(pool.address), tx.object('0x6')],
  });

  // Get best bid
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::best_bid_price`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [tx.object(pool.address)],
  });

  // Get best ask
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::best_ask_price`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [tx.object(pool.address)],
  });

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DUMMY_SENDER,
  });

  // Adjust for decimal difference between base and quote coins
  const decimalAdjustment = Math.pow(10, pool.baseDecimals - pool.quoteDecimals);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsePrice = (raw: any): number => {
    if (!raw?.returnValues?.[0] || raw.returnValues[0][1] !== 'u64') return 0;
    const bytes = new Uint8Array(raw.returnValues[0][0]);
    const value = bcs.u64().parse(bytes);
    return (Number(value) / 1e9) * decimalAdjustment;
  };

  const midPrice = parsePrice(result.results?.[0]);
  const bestBid = parsePrice(result.results?.[1]);
  const bestAsk = parsePrice(result.results?.[2]);
  const spread = bestAsk - bestBid;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  return {
    ...pool,
    midPrice,
    bestBid,
    bestAsk,
    spread,
    spreadPercent,
    volume24h: 0,
    priceChange24h: 0,
    priceChangePercent24h: 0,
  };
}

/**
 * Hook to fetch market data for all SwipeBook pools
 */
export function useSwipeBookPools() {
  const client = useCurrentClient() as SuiJsonRpcClient;
  const pools = getSwipeBookPools();

  const results = useQueries({
    queries: pools.map((pool) => ({
      queryKey: ['pool-market-data', pool.address],
      queryFn: () => fetchPoolMarketData(client, pool),
      enabled: !!client,
      refetchInterval: 10000,
      staleTime: 5000,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const error = results.find((r) => r.error)?.error;
  const poolsWithData = results
    .map((r) => r.data)
    .filter((p): p is PoolWithMarketData => p !== undefined);

  return {
    pools: poolsWithData,
    isLoading,
    error,
    refetch: () => results.forEach((r) => r.refetch()),
  };
}
