"use client"

import { useState, useCallback } from 'react';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import { useQueryClient } from '@tanstack/react-query';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { useMarginClient } from './useDeepBookClient';
import type { MarginManager } from '@mysten/deepbook-v3';
import {
  buildOpenLongOps,
  buildOpenShortOps,
  buildClosePositionOps,
  buildForceRepayOps,
  buildMarginLimitOrderOps,
  buildCancelOrderOps,
  buildOpenWithTPSLOps,
  buildSettleTPSLOps,
  buildCloseEarlyOps,
  queryPoolBookParams,
  queryMarginState,
  alignToLotSize,
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
  currentPrice: number;
}

interface OpenWithTPSLParams {
  direction: 'long' | 'short';
  poolKey: string;
  collateral: number;
  leverage: number;
  currentPrice: number;
  tpPrice: number;
  slPrice: number;
}

interface SettleTPSLParams {
  poolKey: string;
  isLong: boolean;
}

interface CloseEarlyParams {
  poolKey: string;
  quantity: number;
  isLong: boolean;
  currentPrice: number;
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
  forceRepay: (poolKey: string) => Promise<string>;
  openMarginLimitOrder: (params: OpenLimitOrderParams) => Promise<{ orderId: string }>;
  cancelOrder: (poolKey: string, orderId: string) => Promise<void>;
  openPositionWithTPSL: (params: OpenWithTPSLParams) => Promise<{ digest: string; entryPrice: number; baseQuantity: number; tpOrderId: string; slOrderId: string }>;
  settleTPSL: (params: SettleTPSLParams) => Promise<string>;
  closeEarly: (params: CloseEarlyParams) => Promise<string>;
  isOpening: boolean;
  isClosing: boolean;
  isSettling: boolean;
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

export function useMarginTradeExecution(
  marginManagers: Record<string, MarginManager>,
): UseMarginTradeReturn {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;
  const queryClient = useQueryClient();
  const marginClient = useMarginClient(marginManagers);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  const openPosition = useCallback(async (params: OpenPositionParams) => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    setIsOpening(true);
    try {
      const managerKey = `${params.poolKey}_MGR`;
      console.log('[openPosition] managerKey:', managerKey, 'sender:', currentAccount.address);

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
      const manager = marginManagers[managerKey];
      if (!manager) throw new Error(`No margin manager for pool ${params.poolKey}`);

      // Query on-chain position state to calculate correct reduce-only quantity.
      // When asset >= debt on the closing side, reduce-only will fail (error 3),
      // so we fall back to a regular market order.
      let closeQuantity = params.quantity;
      let useReduceOnly = true;
      try {
        const posState = await queryMarginState(suiClient, marginClient, manager.address, params.poolKey);
        const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

        console.log('[closePosition] on-chain state:', posState, 'requested qty:', params.quantity);

        if (params.isLong) {
          const netQuoteDebt = posState.quoteDebt - posState.quoteAsset;
          if (netQuoteDebt <= 0) {
            console.log('[closePosition] quoteAsset >= quoteDebt, using regular market order');
            useReduceOnly = false;
            closeQuantity = posState.baseAsset;
          } else if (params.currentPrice > 0) {
            const maxBase = (netQuoteDebt / params.currentPrice) * 0.98;
            closeQuantity = Math.min(closeQuantity, maxBase);
          }
        } else {
          const netBaseDebt = posState.baseDebt - posState.baseAsset;
          if (netBaseDebt <= 0) {
            console.log('[closePosition] baseAsset >= baseDebt, using regular market order');
            useReduceOnly = false;
            closeQuantity = posState.baseAsset;
          } else {
            closeQuantity = Math.min(closeQuantity, netBaseDebt * 0.98);
          }
        }

        closeQuantity = alignToLotSize(closeQuantity, bookParams.lotSize);
        console.log('[closePosition] adjusted qty:', closeQuantity, 'reduceOnly:', useReduceOnly);
      } catch (err) {
        console.warn('[closePosition] Failed to query state, using original qty:', err);
      }

      if (closeQuantity <= 0) {
        throw new Error('Position too small to close');
      }

      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => {
          buildClosePositionOps(marginClient, {
            poolKey: params.poolKey,
            managerKey,
            quantity: closeQuantity,
            isLong: params.isLong,
            useReduceOnly,
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
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient, marginManagers]);

  const forceRepay = useCallback(async (poolKey: string): Promise<string> => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    const managerKey = `${poolKey}_MGR`;
    const manager = marginManagers[managerKey];
    if (!manager) throw new Error(`No margin manager for pool ${poolKey}`);

    // Query on-chain state to determine which side has debt
    let baseDebt = 0;
    let quoteDebt = 0;
    try {
      const posState = await queryMarginState(suiClient, marginClient, manager.address, poolKey);
      baseDebt = posState.baseDebt;
      quoteDebt = posState.quoteDebt;
      console.log('[forceRepay] on-chain state:', posState);
    } catch (err) {
      // If we can't query state, try quote (most common for longs)
      console.warn('[forceRepay] Failed to query state, defaulting to repayQuote:', err);
      quoteDebt = 0.01; // small fallback amount
    }

    if (baseDebt <= 0 && quoteDebt <= 0) {
      throw new Error('No outstanding debt found on this pool');
    }

    const tx = await buildMarginTxWithPythRefresh(
      poolKey,
      currentAccount.address,
      (t) => {
        buildForceRepayOps(marginClient, {
          poolKey,
          managerKey,
          baseDebt,
          quoteDebt,
        })(t);
      },
    );

    const digest = await signAndExecuteDirect(dAppKit, suiClient, tx);

    queryClient.invalidateQueries({ queryKey: ['margin-position'] });
    queryClient.invalidateQueries({ queryKey: ['user-balance'] });

    return digest;
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient, marginManagers]);

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

  // ── TPSL Methods ──────────────────────────────────────────────────

  const openPositionWithTPSL = useCallback(async (params: OpenWithTPSLParams) => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    setIsOpening(true);
    try {
      const managerKey = `${params.poolKey}_MGR`;

      // ── Pre-flight: check wallet balance for collateral ──
      const pool = getPool(params.poolKey);
      if (pool) {
        const balanceResult = await suiClient.getBalance({
          owner: currentAccount.address,
          coinType: pool.quoteType,
        });
        const walletBalance = Number(balanceResult.totalBalance) / Math.pow(10, pool.quoteDecimals);
        // Need collateral + gas buffer (~0.05 SUI for gas)
        const gasBuffer = pool.quoteType.includes('::sui::SUI') ? 0.1 : 0;
        if (walletBalance < params.collateral + gasBuffer) {
          throw new Error(
            `Insufficient ${pool.quoteCoin} balance: you have ${walletBalance.toFixed(4)} but need ${(params.collateral + gasBuffer).toFixed(4)} (${params.collateral} collateral${gasBuffer ? ' + gas' : ''})`,
          );
        }
      }

      // ── Pre-flight: check for stale debt and auto-repay ──
      const manager = marginManagers[managerKey];
      let needsAutoRepay = false;
      let staleBaseDebt = 0;
      let staleQuoteDebt = 0;
      if (manager) {
        try {
          const posState = await queryMarginState(suiClient, marginClient, manager.address, params.poolKey);
          staleBaseDebt = posState.baseDebt;
          staleQuoteDebt = posState.quoteDebt;
          if (staleBaseDebt > 0 || staleQuoteDebt > 0) {
            console.log('[openWithTPSL] found stale debt, auto-repaying:', posState);
            needsAutoRepay = true;
          }
        } catch {
          // No existing state or query failed — proceed normally
        }
      }

      const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

      const builder = buildOpenWithTPSLOps(marginClient, {
        poolKey: params.poolKey,
        managerKey,
        collateral: params.collateral,
        leverage: params.leverage,
        currentPrice: params.currentPrice,
        lotSize: bookParams.lotSize,
        direction: params.direction,
        tpPrice: params.tpPrice,
        slPrice: params.slPrice,
      });

      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => {
          // Auto-repay stale debt before opening (prevents error 4:
          // ECannotHaveLoanInMoreThanOneMarginPool). We must DEPOSIT enough
          // to cover the outstanding debt first — otherwise repay is a no-op
          // (0 assets in manager) and margin_pool_id stays dirty.
          if (needsAutoRepay) {
            if (staleQuoteDebt > 0) {
              // Deposit quote to cover debt + 2% buffer for accrued interest
              marginClient.marginManager.depositQuote({
                managerKey,
                amount: staleQuoteDebt * 1.02,
              })(t);
              marginClient.marginManager.repayQuote(managerKey)(t);
            }
            if (staleBaseDebt > 0) {
              // Deposit base to cover debt + 2% buffer for accrued interest
              marginClient.marginManager.depositBase({
                managerKey,
                amount: staleBaseDebt * 1.02,
              })(t);
              marginClient.marginManager.repayBase(managerKey)(t);
            }
            marginClient.poolProxy.withdrawSettledAmounts(managerKey)(t);
          }
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
        tpOrderId: builder.tpOrderId,
        slOrderId: builder.slOrderId,
      };
    } finally {
      setIsOpening(false);
    }
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient, marginManagers]);

  const settleTPSL = useCallback(async (params: SettleTPSLParams): Promise<string> => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    setIsSettling(true);
    try {
      const managerKey = `${params.poolKey}_MGR`;

      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => {
          buildSettleTPSLOps(marginClient, {
            poolKey: params.poolKey,
            managerKey,
            isLong: params.isLong,
          })(t);
        },
      );

      const digest = await signAndExecuteDirect(dAppKit, suiClient, tx);

      queryClient.invalidateQueries({ queryKey: ['margin-position'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });

      return digest;
    } finally {
      setIsSettling(false);
    }
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient]);

  const closeEarly = useCallback(async (params: CloseEarlyParams): Promise<string> => {
    if (!marginClient || !currentAccount) throw new Error('Not connected');

    setIsClosing(true);
    try {
      const managerKey = `${params.poolKey}_MGR`;
      const manager = marginManagers[managerKey];
      if (!manager) {
        console.error('[closeEarly] marginManagers keys:', Object.keys(marginManagers));
        throw new Error(`Margin manager not loaded for ${params.poolKey}. Try refreshing the page.`);
      }

      // Query on-chain state for reduce-only quantity capping.
      // The reduce-only assertion on-chain requires the order's output not to exceed net debt.
      // When asset >= debt on the closing side, reduce-only will fail (error 3),
      // so we fall back to a regular market order.
      let closeQuantity = params.quantity;
      let useReduceOnly = true;
      try {
        const posState = await queryMarginState(suiClient, marginClient, manager.address, params.poolKey);
        const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

        console.log('[closeEarly] on-chain state:', posState, 'requested qty:', params.quantity);

        if (params.isLong) {
          const netQuoteDebt = posState.quoteDebt - posState.quoteAsset;
          if (netQuoteDebt <= 0) {
            // quoteAsset >= quoteDebt: reduce-only assertion will fail.
            // Use regular market order and sell ALL base (lot-aligned) to maximize
            // quote proceeds for full debt repayment. No safety margin — alignToLotSize
            // already rounds down.
            console.log('[closeEarly] quoteAsset >= quoteDebt, using regular market order');
            useReduceOnly = false;
            closeQuantity = posState.baseAsset;
          } else if (params.currentPrice > 0) {
            // Cap base sell so quote output ≈ netQuoteDebt (15% safety margin)
            const maxBase = (netQuoteDebt / params.currentPrice) * 0.85;
            closeQuantity = Math.min(closeQuantity, maxBase);
          }
        } else {
          const netBaseDebt = posState.baseDebt - posState.baseAsset;
          if (netBaseDebt <= 0) {
            // baseAsset >= baseDebt: reduce-only assertion will fail.
            // Sell all available base to close the position fully.
            console.log('[closeEarly] baseAsset >= baseDebt, using regular market order');
            useReduceOnly = false;
            closeQuantity = posState.baseAsset;
          } else {
            closeQuantity = Math.min(closeQuantity, netBaseDebt * 0.85);
          }
        }
        closeQuantity = alignToLotSize(closeQuantity, bookParams.lotSize);
        console.log('[closeEarly] adjusted qty:', closeQuantity, 'reduceOnly:', useReduceOnly);
      } catch (err) {
        console.warn('[closeEarly] Failed to query state, using 80% of original qty:', err);
        const bookParams = await queryPoolBookParams(suiClient, params.poolKey).catch(() => null);
        closeQuantity = params.quantity * 0.80;
        if (bookParams) closeQuantity = alignToLotSize(closeQuantity, bookParams.lotSize);
      }

      const tx = await buildMarginTxWithPythRefresh(
        params.poolKey,
        currentAccount.address,
        (t) => {
          buildCloseEarlyOps(marginClient, {
            poolKey: params.poolKey,
            managerKey,
            quantity: closeQuantity,
            isLong: params.isLong,
            useReduceOnly,
          })(t);
        },
      );

      const digest = await signAndExecuteDirect(dAppKit, suiClient, tx);

      queryClient.invalidateQueries({ queryKey: ['margin-position'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });

      return digest;
    } finally {
      setIsClosing(false);
    }
  }, [marginClient, currentAccount, dAppKit, suiClient, queryClient, marginManagers]);

  return {
    openPosition,
    closePosition,
    forceRepay,
    openMarginLimitOrder,
    cancelOrder,
    openPositionWithTPSL,
    settleTPSL,
    closeEarly,
    isOpening,
    isClosing,
    isSettling,
  };
}
