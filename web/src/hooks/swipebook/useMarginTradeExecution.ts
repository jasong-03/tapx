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
  buildUnwindStalePositionOps,
  queryPoolBookParams,
  queryManagerState,
  findStaleDebtPool,
  queryTokenBalance,
} from '@/lib/deepbook/margin-transactions';
import { buildMarginTxWithPythRefresh } from '@/lib/deepbook/pyth-refresh';
import { getPool } from '@/lib/deepbook/pools';

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
      const managerId = marginManagers[managerKey]?.address;

      // Query on-chain lot_size for the pool (cached after first call)
      const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

      // Check for stale position that would block borrowing.
      // First check the target pool, then scan ALL margin pools because error 4
      // (ECannotHaveLoanInMoreThanOneMarginPool) fires when the manager has debt
      // in a different pool than the one we're trying to borrow from.
      let stalePoolKey = params.poolKey;
      let staleLotSize = bookParams.lotSize;
      let stalePosition = managerId
        ? await queryManagerState(suiClient, marginClient, managerId, params.poolKey)
        : null;
      if (stalePosition && stalePosition.baseDebt <= 0 && stalePosition.quoteDebt <= 0) {
        stalePosition = null;
      }

      // If no stale debt in current pool, check other margin pools
      if (!stalePosition && managerId) {
        const otherPool = await findStaleDebtPool(
          suiClient, marginClient, managerId, params.poolKey,
        );
        if (otherPool) {
          stalePosition = otherPool.state;
          stalePoolKey = otherPool.poolKey;
          staleLotSize = otherPool.lotSize;
        }
      }

      // ── Step 1: Handle stale debt ──
      // Only attempt unwind if debt is in a DIFFERENT pool (cross-pool block).
      // Same-pool debt is OK — borrow from the same margin pool will succeed
      // (e.g., short+short both use base margin pool). If it's incompatible
      // (e.g., existing base debt + new quote borrow), let the on-chain error
      // tell us — the user needs to close their existing position first.
      if (stalePosition && stalePoolKey !== params.poolKey) {
        const staleManagerKey = `${stalePoolKey}_MGR`;
        console.log('[margin] Unwinding cross-pool stale debt (separate tx):', {
          pool: stalePoolKey, managerKey: staleManagerKey, state: stalePosition,
        });

        // Query wallet base balance for hybrid unwind
        const stalePool = getPool(stalePoolKey);
        const staleWalletBase = stalePool
          ? await queryTokenBalance(suiClient, currentAccount.address, stalePool.baseType, stalePool.baseDecimals)
          : 0;

        const unwindTx = await buildMarginTxWithPythRefresh(
          stalePoolKey,
          currentAccount.address,
          (t) => {
            buildUnwindStalePositionOps(
              marginClient, stalePoolKey, staleManagerKey, stalePosition!, staleLotSize, staleWalletBase,
            )(t);
          },
        );

        const unwindDigest = await signAndExecuteDirect(dAppKit, suiClient, unwindTx);
        console.log('[margin] Stale debt unwound, waiting for finality...', unwindDigest);

        await suiClient.waitForTransaction({ digest: unwindDigest });
        await new Promise((r) => setTimeout(r, 2000));

        // Verify debt cleared
        const postState = await queryManagerState(suiClient, marginClient, managerId!, stalePoolKey);
        console.log('[margin] Post-unwind state:', postState);
        if (postState && (postState.baseDebt > 0 || postState.quoteDebt > 0)) {
          console.error('[margin] Cross-pool debt not fully cleared (low liquidity):', postState);
          throw new Error(
            `Cannot clear debt in ${stalePoolKey} (low liquidity). ` +
            `Close your ${stalePoolKey} position manually first.`
          );
        }
        console.log('[margin] Debt cleared, opening position...');
      } else if (stalePosition) {
        // Same pool — check if the new direction is compatible.
        const existingIsShort = stalePosition.baseDebt > 0;
        const existingIsLong = stalePosition.quoteDebt > 0;
        const directionConflict =
          (existingIsShort && params.direction === 'long') ||
          (existingIsLong && params.direction === 'short');

        if (directionConflict) {
          // Direction conflict: must unwind existing position first.
          // Use hybrid approach: deposit available base from wallet + market buy.
          const existingDir = existingIsShort ? 'SHORT' : 'LONG';
          console.log(`[margin] Direction conflict — unwinding ${existingDir} before ${params.direction}:`, stalePosition);

          // Query user's wallet base balance to cap depositBase
          const pool = getPool(params.poolKey);
          const walletBaseBalance = pool
            ? await queryTokenBalance(suiClient, currentAccount.address, pool.baseType, pool.baseDecimals)
            : 0;
          console.log('[margin] Wallet base balance for unwind:', walletBaseBalance);

          const unwindTx = await buildMarginTxWithPythRefresh(
            params.poolKey,
            currentAccount.address,
            (t) => {
              buildUnwindStalePositionOps(
                marginClient, params.poolKey, managerKey, stalePosition!, bookParams.lotSize, walletBaseBalance,
              )(t);
            },
          );

          const unwindDigest = await signAndExecuteDirect(dAppKit, suiClient, unwindTx);
          console.log('[margin] Same-pool position unwound:', unwindDigest);

          await suiClient.waitForTransaction({ digest: unwindDigest });
          await new Promise((r) => setTimeout(r, 2000));

          const postState = await queryManagerState(suiClient, marginClient, managerId!, params.poolKey);
          console.log('[margin] Post-unwind state:', postState);
          if (postState && (postState.baseDebt > 0 || postState.quoteDebt > 0)) {
            const remaining = existingIsShort ? postState.baseDebt : postState.quoteDebt;
            const coin = existingIsShort ? 'DEEP' : 'DBUSDC';
            throw new Error(
              `Need ~${remaining.toFixed(1)} more ${coin} to fully close ${existingDir}. ` +
              `Get more tokens or trade ${existingDir.toLowerCase()} instead.`
            );
          }
          console.log('[margin] Position cleared, opening new trade...');
        } else {
          // Same direction: proceed without unwind (stack positions).
          console.log('[margin] Same pool, compatible direction — proceeding:', stalePosition);
        }
      }

      // ── Step 2: Open new position ──
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

      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => {
          builder.ops(t);
        },
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
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient, marginManagers]);

  const closePosition = useCallback(async (params: ClosePositionParams) => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    setIsClosing(true);
    try {
      const managerKey = `${params.poolKey}_MGR`;

      // Align close quantity to lot_size (on-chain balance may not be
      // exactly lot-aligned due to rounding in devInspect parsing)
      const bookParams = await queryPoolBookParams(suiClient, params.poolKey);
      const lotSize = bookParams.lotSize;
      const alignedQuantity = lotSize > 0
        ? Math.floor(params.quantity / lotSize) * lotSize
        : params.quantity;

      if (alignedQuantity <= 0) {
        throw new Error('Position too small to close');
      }

      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => {
          buildClosePositionOps(marginClient, {
            poolKey: params.poolKey,
            managerKey,
            quantity: alignedQuantity,
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
