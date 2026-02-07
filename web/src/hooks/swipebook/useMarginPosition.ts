"use client"

import { useQuery } from '@tanstack/react-query';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { useMarginManager } from './useMarginManager';
import { useDeepBookClient } from './useDeepBookClient';
import { DUMMY_SENDER, FLOAT_SCALAR } from '@/lib/deepbook/config';
import { calculateLiquidationPrice } from '@/lib/deepbook/margin-config';
import { getPool } from '@/lib/deepbook/pools';
import { prependPythPriceUpdate } from '@/lib/deepbook/pyth-refresh';

export interface MarginPosition {
  riskRatio: number;
  baseBalance: number;
  quoteBalance: number;
  baseDebt: number;
  quoteDebt: number;
  entryPrice: number;
  liquidationPrice: number;
  unrealizedPnL: number;
  leverage: number;
}

interface UseMarginPositionParams {
  managerId: string | null;
  poolKey: string | null;
  currentPrice: number | null;
  isLong: boolean;
  enabled?: boolean;
}

/**
 * Query margin position state via raw devInspectTransactionBlock.
 *
 * Uses the DeepBook SDK's `marginManager.managerState()` to build the moveCall,
 * then executes via `devInspectTransactionBlock` instead of `simulateTransaction`
 * to avoid the BCS serializer incompatibility with Sui SDK v2.
 */
export function useMarginPosition({
  managerId,
  poolKey,
  currentPrice,
  isLong,
  enabled = true,
}: UseMarginPositionParams) {
  const { marginManagers } = useMarginManager();
  const dbClient = useDeepBookClient();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;

  const managerKey = poolKey ? `${poolKey}_MGR` : null;
  const hasManager = !!(managerKey && marginManagers && managerKey in marginManagers);

  return useQuery({
    queryKey: ['margin-position', managerId, poolKey],
    queryFn: async (): Promise<MarginPosition | null> => {
      if (!dbClient || !suiClient || !managerKey || !poolKey || !currentPrice || !managerId) return null;

      const pool = getPool(poolKey);
      if (!pool) return null;

      try {
        // Build tx with Pyth price refresh + managerState query
        const tx = new Transaction();
        tx.setSenderIfNotSet(DUMMY_SENDER);

        // Prepend Pyth price updates so check_price_is_fresh() passes
        await prependPythPriceUpdate(tx, poolKey);

        // Add the managerState query (SDK knows the correct objects/types)
        dbClient.marginManager.managerState(poolKey, managerId)(tx);

        // Execute via devInspectTransactionBlock (avoids BCS serializer bug)
        const result = await suiClient.devInspectTransactionBlock({
          transactionBlock: tx,
          sender: DUMMY_SENDER,
        });

        if (!result.results || result.results.length === 0) {
          return null;
        }

        // managerState is the LAST command (Pyth updates are prepended before it)
        const returnValues = result.results[result.results.length - 1]?.returnValues;
        if (!returnValues || returnValues.length < 7) {
          return null;
        }

        // Parse return values from manager_state:
        // [0] manager_id (address), [1] pool_id (address), [2] risk_ratio (u64),
        // [3] base_asset (u64), [4] quote_asset (u64), [5] base_debt (u64),
        // [6] quote_debt (u64), [7+] pyth prices etc.

        const parseU64 = (rv: [number[], string]): bigint => {
          if (!rv || rv[1] !== 'u64') return 0n;
          return BigInt(bcs.u64().parse(new Uint8Array(rv[0])));
        };

        const riskRatioRaw = parseU64(returnValues[2] as [number[], string]);
        const baseAssetRaw = parseU64(returnValues[3] as [number[], string]);
        const quoteAssetRaw = parseU64(returnValues[4] as [number[], string]);
        const baseDebtRaw = parseU64(returnValues[5] as [number[], string]);
        const quoteDebtRaw = parseU64(returnValues[6] as [number[], string]);

        const riskRatio = Number(riskRatioRaw) / Number(FLOAT_SCALAR);

        // Scale by coin decimals
        const baseScalar = Math.pow(10, pool.baseDecimals);
        const quoteScalar = Math.pow(10, pool.quoteDecimals);

        const baseBalance = Number(baseAssetRaw) / baseScalar;
        const quoteBalance = Number(quoteAssetRaw) / quoteScalar;
        const baseDebt = Number(baseDebtRaw) / baseScalar;
        const quoteDebt = Number(quoteDebtRaw) / quoteScalar;

        // Determine leverage from debt ratio
        const totalValue = baseBalance * currentPrice + quoteBalance;
        const debtValue = baseDebt * currentPrice + quoteDebt;
        const equity = totalValue - debtValue;
        const leverage = equity > 0 ? totalValue / equity : 1;

        // Estimate entry price from position balances
        let entryPrice = currentPrice;
        if (isLong && baseBalance > 0 && quoteDebt > 0) {
          entryPrice = quoteDebt / baseBalance;
        } else if (!isLong && baseDebt > 0 && quoteBalance > 0) {
          entryPrice = quoteBalance / baseDebt;
        }

        const liquidationPrice = calculateLiquidationPrice(entryPrice, leverage, isLong);

        // Unrealized PnL based on price movement from entry
        const priceDelta = currentPrice - entryPrice;
        const unrealizedPnL = isLong
          ? priceDelta * baseBalance
          : -priceDelta * baseDebt;

        return {
          riskRatio,
          baseBalance,
          quoteBalance,
          baseDebt,
          quoteDebt,
          entryPrice,
          liquidationPrice,
          unrealizedPnL,
          leverage: Math.round(leverage * 10) / 10,
        };
      } catch (err) {
        console.warn('Failed to query margin position:', err);
        return null;
      }
    },
    enabled: enabled && !!managerId && !!poolKey && !!suiClient && !!dbClient && !!currentPrice && hasManager,
    refetchInterval: 3000,
    staleTime: 2000,
  });
}
