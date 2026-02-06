import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Position, Token } from '@/lib/swipebook/types';
import { COIN_TYPES, COIN_DECIMALS, type CoinKey } from '@/lib/deepbook/pools';

// Token metadata for display
const TOKEN_METADATA: Record<CoinKey, Omit<Token, 'type' | 'decimals'>> = {
  SUI: { symbol: 'SUI', name: 'Sui' },
  USDC: { symbol: 'USDC', name: 'USD Coin' },
  DEEP: { symbol: 'DEEP', name: 'DeepBook Token' },
  WUSDT: { symbol: 'WUSDT', name: 'Wrapped USDT' },
  WUSDC: { symbol: 'WUSDC', name: 'Wrapped USDC' },
  BETH: { symbol: 'BETH', name: 'Bridged ETH' },
  NS: { symbol: 'NS', name: 'Navi Protocol' },
  TYPUS: { symbol: 'TYPUS', name: 'Typus Finance' },
  AUSD: { symbol: 'AUSD', name: 'Aries USD' },
  DRF: { symbol: 'DRF', name: 'Driftfi' },
  SEND: { symbol: 'SEND', name: 'SendCoin' },
  WAL: { symbol: 'WAL', name: 'Walrus' },
  XBTC: { symbol: 'XBTC', name: 'xBTC' },
};

// Coins to track for SwipeBook
const TRACKED_COINS: CoinKey[] = ['SUI', 'USDC', 'DEEP', 'WAL', 'NS'];

/**
 * Hook to fetch user's positions for SwipeBook-relevant tokens
 */
export function useUserPositions() {
  const currentAccount = useCurrentAccount();
  const client = useCurrentClient() as SuiJsonRpcClient;

  return useQuery({
    queryKey: ['user-positions', currentAccount?.address],
    queryFn: async (): Promise<Position[]> => {
      if (!currentAccount?.address) return [];

      const balancePromises = TRACKED_COINS.map(async (coinKey) => {
        const coinType = COIN_TYPES[coinKey];
        try {
          const balance = await client.getBalance({
            owner: currentAccount.address,
            coinType,
          });

          const decimals = COIN_DECIMALS[coinKey];
          const balanceBigInt = BigInt(balance.totalBalance);
          const balanceFormatted = Number(balanceBigInt) / Math.pow(10, decimals);

          const token: Token = {
            type: coinType,
            symbol: TOKEN_METADATA[coinKey].symbol,
            name: TOKEN_METADATA[coinKey].name,
            decimals,
          };

          return {
            token,
            balance: balanceBigInt,
            balanceFormatted,
            valueUsd: 0, // Would need price oracle for USD value
          } as Position;
        } catch (error) {
          console.error(`Failed to fetch balance for ${coinKey}:`, error);
          return null;
        }
      });

      const results = await Promise.all(balancePromises);
      return results.filter((p): p is Position => p !== null && p.balanceFormatted > 0);
    },
    enabled: !!currentAccount?.address && !!client,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });
}
