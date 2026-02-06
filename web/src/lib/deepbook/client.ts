import { DeepBookClient } from '@mysten/deepbook-v3';
import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';

export type NetworkType = 'mainnet' | 'testnet';

/**
 * Creates a DeepBook client instance
 * The DeepBook SDK v1 expects a client compatible with ClientWithCoreApi
 */
export function createDeepBookClient(
  client: ClientWithCoreApi,
  address: string,
  network: SuiClientTypes.Network = 'mainnet'
): DeepBookClient {
  return new DeepBookClient({
    client,
    address,
    network,
  });
}

/**
 * Get the DeepBook package ID for a network
 */
export function getDeepBookPackageId(network: NetworkType): string {
  return network === 'mainnet'
    ? '0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963c8e04b1a1af5f7cf3'
    : '0x... testnet address';
}
