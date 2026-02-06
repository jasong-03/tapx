import { useMemo } from 'react';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { DeepBookClient } from '@mysten/deepbook-v3';

/**
 * Hook to get a DeepBook client instance
 * Memoized to prevent unnecessary re-creation
 */
export function useDeepBookClient() {
  const suiClient = useCurrentClient();
  const currentAccount = useCurrentAccount();

  const deepBookClient = useMemo(() => {
    if (!suiClient || !currentAccount) return null;

    return new DeepBookClient({
      client: suiClient,
      address: currentAccount.address,
      network: 'mainnet',
    });
  }, [suiClient, currentAccount]);

  return deepBookClient;
}
