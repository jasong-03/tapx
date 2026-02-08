"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { useMarginClient } from './useDeepBookClient';
import { MARGIN_POOL_KEYS } from '@/lib/deepbook/margin-config';
import { queryMarginState } from '@/lib/deepbook/margin-transactions';
import type { MarginManager } from '@mysten/deepbook-v3';

export interface StaleDebtInfo {
  poolKey: string;
  baseAsset: number;
  quoteAsset: number;
  baseDebt: number;
  quoteDebt: number;
}

interface UseStaleDebtDetectorReturn {
  hasStaleDebt: boolean;
  staleDebts: StaleDebtInfo[];
  isScanning: boolean;
  rescan: () => void;
}

export function useStaleDebtDetector(
  marginManagers: Record<string, MarginManager>,
): UseStaleDebtDetectorReturn {
  const currentAccount = useCurrentAccount();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;
  const marginClient = useMarginClient(marginManagers);
  const [staleDebts, setStaleDebts] = useState<StaleDebtInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanTrigger, setScanTrigger] = useState(0);

  // Stabilize the dependency: only re-scan when the set of manager keys changes,
  // not when the object reference changes
  const managerKeysStr = useMemo(
    () => Object.keys(marginManagers).sort().join(','),
    [marginManagers],
  );

  // Keep refs for values used in scan to avoid dependency churn
  const managersRef = useRef(marginManagers);
  managersRef.current = marginManagers;

  const rescan = useCallback(() => setScanTrigger(t => t + 1), []);

  useEffect(() => {
    if (!currentAccount || !marginClient || !managerKeysStr) {
      setStaleDebts([]);
      setIsScanning(false);
      return;
    }

    let cancelled = false;
    const client = marginClient;
    const managers = managersRef.current;

    async function scan() {
      setIsScanning(true);
      const debts: StaleDebtInfo[] = [];

      for (const poolKey of MARGIN_POOL_KEYS) {
        if (cancelled) break;
        const mgrKey = `${poolKey}_MGR`;
        const manager = managers[mgrKey];
        if (!manager) continue;

        try {
          const state = await queryMarginState(suiClient, client, manager.address, poolKey);
          if (state.baseDebt > 0 || state.quoteDebt > 0) {
            debts.push({ poolKey, ...state });
          }
        } catch {
          // Pool query failed (no state, Pyth stale, etc.) — skip
        }
      }

      if (!cancelled) {
        setStaleDebts(debts);
        setIsScanning(false);
      }
    }

    scan();
    return () => { cancelled = true; };
  }, [currentAccount, marginClient, managerKeysStr, suiClient, scanTrigger]);

  return {
    hasStaleDebt: staleDebts.length > 0,
    staleDebts,
    isScanning,
    rescan,
  };
}
