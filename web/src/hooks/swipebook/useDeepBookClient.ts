import { useMemo } from 'react';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { Transaction } from '@mysten/sui/transactions';
import { DUMMY_SENDER } from '@/lib/deepbook/config';

export type { DeepBookClient };

/**
 * Creates a DeepBookClient with a patched core client that auto-injects
 * the sender address into transactions during simulation.
 *
 * This works around a bug in the DeepBook SDK where query methods
 * (midPrice, getLevel2TicksFromMid, etc.) create Transaction objects
 * but never call setSenderIfNotSet() before simulateTransaction(),
 * causing "Missing transaction sender" errors.
 */
function createDeepBookClient(
  suiClient: ReturnType<typeof useCurrentClient>,
  address: string,
): DeepBookClient {
  // Proxy the core client to auto-set sender on simulate calls
  const patchedCore = new Proxy(suiClient.core, {
    get(target, prop, receiver) {
      if (prop === 'simulateTransaction') {
        return async (options: { transaction: unknown; [key: string]: unknown }) => {
          if (
            options.transaction &&
            !(options.transaction instanceof Uint8Array) &&
            typeof (options.transaction as Transaction).setSenderIfNotSet === 'function'
          ) {
            (options.transaction as Transaction).setSenderIfNotSet(address);
          }
          return target.simulateTransaction(
            options as Parameters<typeof target.simulateTransaction>[0],
          );
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  // Create a shallow wrapper that swaps out core
  const patchedClient = Object.create(suiClient, {
    core: { value: patchedCore, enumerable: true },
  });

  return new DeepBookClient({
    client: patchedClient,
    address,
    network: suiClient.network,
  });
}

/**
 * Hook to get a DeepBook client instance.
 *
 * Works both with and without a connected wallet:
 * - With wallet: uses the wallet address for transactions and queries
 * - Without wallet: uses DUMMY_SENDER for read-only queries (prices, orderbook)
 */
export function useDeepBookClient() {
  const suiClient = useCurrentClient();
  const currentAccount = useCurrentAccount();

  const deepBookClient = useMemo(() => {
    if (!suiClient) return null;

    const address = currentAccount?.address ?? DUMMY_SENDER;
    return createDeepBookClient(suiClient, address);
  }, [suiClient, currentAccount]);

  return deepBookClient;
}
