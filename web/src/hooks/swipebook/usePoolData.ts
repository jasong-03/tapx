import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Pool, PoolWithMarketData } from '@/lib/swipebook/types';
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from '@/lib/deepbook/config';

/**
 * Fetch orderbook data for a single pool using raw devInspect.
 */
export function usePoolData(pool: Pool | null) {
  const client = useCurrentClient() as SuiJsonRpcClient;

  const { data, isLoading, error } = useQuery({
    queryKey: ['pool-data', pool?.poolKey],
    queryFn: async () => {
      if (!pool) return null;

      const tx = new Transaction();

      // Get mid price
      tx.moveCall({
        target: `${DEEPBOOK_PACKAGE_ID}::pool::mid_price`,
        typeArguments: [pool.baseType, pool.quoteType],
        arguments: [
          tx.object(pool.address),
          tx.object('0x6'), // Clock
        ],
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

      if (!result.results || result.results.length < 3) {
        throw new Error('Failed to fetch pool data');
      }

      // Parse results (prices are returned as u64)
      const midPriceRaw = result.results[0]?.returnValues?.[0];
      const bestBidRaw = result.results[1]?.returnValues?.[0];
      const bestAskRaw = result.results[2]?.returnValues?.[0];

      // Adjust for decimal difference between base and quote coins
      const decimalAdjustment = Math.pow(10, pool.baseDecimals - pool.quoteDecimals);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsePrice = (raw: any): number => {
        if (!raw || raw[1] !== 'u64') return 0;
        const bytes = new Uint8Array(raw[0]);
        const value = bcs.u64().parse(bytes);
        // DeepBook prices have 9 decimal places (FLOAT_SCALAR)
        return (Number(value) / 1e9) * decimalAdjustment;
      };

      return {
        midPrice: parsePrice(midPriceRaw),
        bestBid: parsePrice(bestBidRaw),
        bestAsk: parsePrice(bestAskRaw),
      };
    },
    enabled: !!pool && !!client,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const poolWithData = useMemo((): PoolWithMarketData | null => {
    if (!pool || !data) return null;

    const spread = data.bestAsk - data.bestBid;
    const spreadPercent = data.midPrice > 0 ? (spread / data.midPrice) * 100 : 0;

    return {
      ...pool,
      midPrice: data.midPrice,
      bestBid: data.bestBid,
      bestAsk: data.bestAsk,
      spread,
      spreadPercent,
      volume24h: 0,
      priceChange24h: 0,
      priceChangePercent24h: 0,
    };
  }, [pool, data]);

  return {
    data: poolWithData,
    isLoading,
    error,
  };
}
