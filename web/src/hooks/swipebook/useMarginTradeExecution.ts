"use client"

import { useState, useCallback } from 'react';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import { useQueryClient } from '@tanstack/react-query';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { useMarginClient } from './useDeepBookClient';
import { useMarginManager } from './useMarginManager';
import {
  buildOpenLongOps,
  buildOpenShortOps,
  buildClosePositionOps,
  buildMarginLimitOrderOps,
  buildCancelOrderOps,
  queryPoolBookParams,
} from '@/lib/deepbook/margin-transactions';
import { buildMarginTxWithPythRefresh } from '@/lib/deepbook/pyth-refresh';

interface OpenPositionParams {
  direction: 'long' | 'short';
  poolKey: string;
  collateral: number;
  leverage: number;
  currentPrice: number;
}

interface ClosePositionParams {
  poolKey: string;
  quantity: number;
  isLong: boolean;
}

interface OpenLimitOrderParams {
  poolKey: string;
  targetPrice: number;
  direction: 'long' | 'short';
  collateral: number;
  leverage: number;
}

interface UseMarginTradeReturn {
  openPosition: (params: OpenPositionParams) => Promise<{ digest: string; entryPrice: number; baseQuantity: number }>;
  closePosition: (params: ClosePositionParams) => Promise<{ digest: string; exitPrice: number; pnl: number }>;
  openMarginLimitOrder: (params: OpenLimitOrderParams) => Promise<{ orderId: string }>;
  cancelOrder: (poolKey: string, orderId: string) => Promise<void>;
  isOpening: boolean;
  isClosing: boolean;
}

/**
 * Sign via wallet, execute directly via Sui RPC.
 * Bypasses the wallet's backend proxy which can return 502 on testnet.
 */
async function signAndExecuteDirect(
  dAppKit: ReturnType<typeof useDAppKit>,
  suiClient: SuiJsonRpcClient,
  tx: Parameters<ReturnType<typeof useDAppKit>['signTransaction']>[0]['transaction'],
): Promise<string> {
  const signed = await dAppKit.signTransaction({ transaction: tx });
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: signed.bytes,
    signature: signed.signature,
    options: { showEffects: true },
  });
  if (!result.digest) throw new Error('Transaction submitted but no digest returned');
  const effects = result.effects;
  if (effects?.status?.status === 'failure') {
    throw new Error(effects.status.error || 'Transaction failed on-chain');
  }
  return result.digest;
}

export function useMarginTradeExecution(): UseMarginTradeReturn {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;
  const queryClient = useQueryClient();
  const { marginManagers } = useMarginManager();
  const marginClient = useMarginClient(marginManagers);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const openPosition = useCallback(async (params: OpenPositionParams) => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    setIsOpening(true);
    try {
      const managerKey = `${params.poolKey}_MGR`;

      // Query on-chain lot_size for the pool (cached after first call)
      const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

      // Pre-compute the position builder to get the baseQuantity
      const builder = params.direction === 'long'
        ? buildOpenLongOps(marginClient, {
            poolKey: params.poolKey,
            managerKey,
            collateral: params.collateral,
            leverage: params.leverage,
            currentPrice: params.currentPrice,
            lotSize: bookParams.lotSize,
          })
        : buildOpenShortOps(marginClient, {
            poolKey: params.poolKey,
            managerKey,
            collateral: params.collateral,
            leverage: params.leverage,
            currentPrice: params.currentPrice,
            lotSize: bookParams.lotSize,
          });

      // Build tx with Pyth price refresh prepended, then margin ops
      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => builder.ops(t),
      );

      const digest = await signAndExecuteDirect(dAppKit, suiClient, tx);

      queryClient.invalidateQueries({ queryKey: ['margin-position'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });

      return {
        digest,
        entryPrice: params.currentPrice,
        baseQuantity: builder.baseQuantity,
      };
    } finally {
      setIsOpening(false);
    }
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient]);

  const closePosition = useCallback(async (params: ClosePositionParams) => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    setIsClosing(true);
    try {
      const managerKey = `${params.poolKey}_MGR`;

      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => {
          buildClosePositionOps(marginClient, {
            poolKey: params.poolKey,
            managerKey,
            quantity: params.quantity,
            isLong: params.isLong,
          })(t);
        },
      );

      const digest = await signAndExecuteDirect(dAppKit, suiClient, tx);

      queryClient.invalidateQueries({ queryKey: ['margin-position'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });

      return {
        digest,
        exitPrice: 0,
        pnl: 0,
      };
    } finally {
      setIsClosing(false);
    }
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient]);

  const openMarginLimitOrder = useCallback(async (params: OpenLimitOrderParams) => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    const managerKey = `${params.poolKey}_MGR`;

    // Query on-chain lot_size for the pool (cached after first call)
    const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

    const tx = await buildMarginTxWithPythRefresh(
      params.poolKey,
      currentAccount.address,
      (t) => {
        buildMarginLimitOrderOps(marginClient, {
          poolKey: params.poolKey,
          managerKey,
          targetPrice: params.targetPrice,
          direction: params.direction,
          collateral: params.collateral,
          leverage: params.leverage,
          lotSize: bookParams.lotSize,
        })(t);
      },
    );

    const digest = await signAndExecuteDirect(dAppKit, suiClient, tx);
    return { orderId: digest };
  }, [marginClient, currentAccount, dAppKit, suiClient]);

  const cancelOrder = useCallback(async (poolKey: string, orderId: string) => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    const managerKey = `${poolKey}_MGR`;

    const tx = await buildMarginTxWithPythRefresh(
      poolKey,
      currentAccount.address,
      (t) => {
        buildCancelOrderOps(marginClient, {
          poolKey,
          managerKey,
          orderId,
        })(t);
      },
    );

    await signAndExecuteDirect(dAppKit, suiClient, tx);
    queryClient.invalidateQueries({ queryKey: ['margin-position'] });
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient]);

  return {
    openPosition,
    closePosition,
    openMarginLimitOrder,
    cancelOrder,
    isOpening,
    isClosing,
  };
}
