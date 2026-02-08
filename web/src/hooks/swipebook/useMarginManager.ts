"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { useDeepBookClient } from './useDeepBookClient';
import { MARGIN_POOL_KEYS, type MarginPoolKey } from '@/lib/deepbook/margin-config';
import type { MarginManager } from '@mysten/deepbook-v3';

const STORAGE_PREFIX = 'tapx_margin_manager';
const MANAGER_UPDATED_EVENT = 'tapx-margin-manager-updated';

function getManagerStorageKey(address: string, poolKey: string): string {
  return `${STORAGE_PREFIX}_${address}_${poolKey}`;
}

function loadManagerId(address: string, poolKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(getManagerStorageKey(address, poolKey));
  } catch {
    return null;
  }
}

function saveManagerId(address: string, poolKey: string, managerId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getManagerStorageKey(address, poolKey), managerId);
  } catch {
    console.error('Failed to save margin manager ID');
  }
}

function loadAllManagerIds(address: string): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const poolKey of MARGIN_POOL_KEYS) {
    const id = loadManagerId(address, poolKey);
    if (id) ids[poolKey] = id;
  }
  return ids;
}

interface UseMarginManagerReturn {
  managerId: string | null;
  isCreating: boolean;
  createManager: (poolKey: MarginPoolKey) => Promise<string>;
  managerIds: Record<string, string>;
  /** Map of managerKey -> MarginManager for SDK config */
  marginManagers: Record<string, MarginManager>;
}

export function useMarginManager(): UseMarginManagerReturn {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;
  const dbClient = useDeepBookClient();
  const [isCreating, setIsCreating] = useState(false);
  const [managerIds, setManagerIds] = useState<Record<string, string>>({});

  const address = currentAccount?.address;

  // Load all stored manager IDs on mount / wallet change
  useEffect(() => {
    if (!address) {
      setManagerIds({});
      return;
    }
    setManagerIds(loadAllManagerIds(address));
  }, [address]);

  // Listen for manager updates from other hook instances (same tab)
  useEffect(() => {
    if (!address) return;
    const handler = () => {
      setManagerIds(loadAllManagerIds(address));
    };
    window.addEventListener(MANAGER_UPDATED_EVENT, handler);
    return () => window.removeEventListener(MANAGER_UPDATED_EVENT, handler);
  }, [address]);

  // Current active manager ID (first available)
  const managerId = useMemo(() => {
    const keys = Object.keys(managerIds);
    return keys.length > 0 ? managerIds[keys[0]] : null;
  }, [managerIds]);

  // Build MarginManager map for SDK config.
  // Register the manager for ALL margin pools — the on-chain MarginManager is
  // pool-agnostic and can operate on any pool. Without this, the SDK can't
  // build repay/unwind transactions for pools other than the one the manager
  // was originally created for, causing error 4 (ECannotHaveLoanInMoreThanOneMarginPool)
  // when stale debt exists in a different pool.
  const marginManagers = useMemo(() => {
    const mgrs: Record<string, MarginManager> = {};
    // Get any available manager address (typically the user has one manager)
    const addresses = Object.values(managerIds);
    if (addresses.length === 0) return mgrs;
    const primaryAddr = addresses[0];

    // Register under every margin pool key so the SDK can operate on any pool
    for (const poolKey of MARGIN_POOL_KEYS) {
      const mgrKey = `${poolKey}_MGR`;
      // Prefer pool-specific manager if one exists, otherwise use primary
      const addr = managerIds[poolKey] ?? primaryAddr;
      mgrs[mgrKey] = { address: addr, poolKey };
    }
    return mgrs;
  }, [managerIds]);

  const createManager = useCallback(async (poolKey: MarginPoolKey): Promise<string> => {
    if (!dbClient || !address) throw new Error('Client or wallet not connected');

    setIsCreating(true);
    try {
      const tx = new Transaction();
      tx.setSenderIfNotSet(address);

      // Create margin manager with initializer
      const { manager, initializer } = dbClient.marginManager.newMarginManagerWithInitializer(poolKey)(tx);

      // Share the margin manager
      dbClient.marginManager.shareMarginManager(poolKey, manager, initializer)(tx);

      // Sign via wallet, execute directly via Sui RPC
      const signed = await dAppKit.signTransaction({ transaction: tx });
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: signed.bytes,
        signature: signed.signature,
        options: { showEffects: true, showObjectChanges: true },
      });

      // Extract MarginManager object ID from transaction result
      let createdId = '';

      if (result.objectChanges) {
        // Filter for MarginManager type specifically
        const marginManagerObj = result.objectChanges.find(
          (c) => c.type === 'created' && 'objectType' in c && c.objectType.includes('MarginManager')
        );
        if (marginManagerObj && 'objectId' in marginManagerObj) {
          createdId = marginManagerObj.objectId;
        }

        // Fallback: first shared object (MarginManager is shared)
        if (!createdId) {
          const sharedObj = result.objectChanges.find(
            (c) => c.type === 'created' && 'owner' in c && typeof c.owner === 'object' && c.owner !== null && 'Shared' in c.owner
          );
          if (sharedObj && 'objectId' in sharedObj) {
            createdId = sharedObj.objectId;
          }
        }
      }

      if (!createdId) {
        throw new Error('Could not extract MarginManager ID from transaction. Check objectChanges in the result.');
      }

      saveManagerId(address, poolKey, createdId);
      setManagerIds((prev) => ({ ...prev, [poolKey]: createdId }));

      // Notify other hook instances (e.g. useMarginTradeExecution) to reload
      window.dispatchEvent(new Event(MANAGER_UPDATED_EVENT));

      return createdId;
    } finally {
      setIsCreating(false);
    }
  }, [dbClient, address, dAppKit, suiClient]);

  return {
    managerId,
    isCreating,
    createManager,
    managerIds,
    marginManagers,
  };
}
