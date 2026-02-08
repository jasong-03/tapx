"use client"

import { useState, useCallback } from 'react';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import { useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { useDeepBookClient, useMarginClient } from './useDeepBookClient';
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
import { buildMarketBuyTransaction, estimateSwapOutput, calculateMinOutput } from '@/lib/deepbook/transactions';
import { getPool } from '@/lib/deepbook/pools';
import { MARGIN_POOL_KEYS } from '@/lib/deepbook/margin-config';

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
  swapAndRepay: (debtPoolKey: string, baseDebt: number, quoteDebt: number) => Promise<string>;
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
  const dbClient = useDeepBookClient();
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

      // Query on-chain position state. Always sell ALL base via regular market order
      // to avoid reduce-only assertion failures. Excess quote gets withdrawn after repay.
      let closeQuantity = params.quantity;
      try {
        const posState = await queryMarginState(suiClient, marginClient, manager.address, params.poolKey);
        const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

        console.log('[closePosition] on-chain state:', posState, 'requested qty:', params.quantity);

        closeQuantity = alignToLotSize(posState.baseAsset, bookParams.lotSize);
        console.log('[closePosition] selling all base:', closeQuantity);
      } catch (err) {
        console.warn('[closePosition] Failed to query state, using 95% of original qty:', err);
        const bookParams = await queryPoolBookParams(suiClient, params.poolKey).catch(() => null);
        closeQuantity = params.quantity * 0.95;
        if (bookParams) closeQuantity = alignToLotSize(closeQuantity, bookParams.lotSize);
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
            useReduceOnly: false,
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
        // Cancel any active conditional orders first to unlock assets
        marginClient.marginTPSL.cancelAllConditionalOrders(managerKey)(t);
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

  /**
   * Swap tokens then repay margin debt in two sequential wallet signatures.
   * TX1: Swap quote→base or base→quote to acquire the debt token
   * TX2: Force-repay (deposit + repay + withdraw)
   */
  const swapAndRepay = useCallback(async (
    debtPoolKey: string,
    baseDebt: number,
    quoteDebt: number,
  ): Promise<string> => {
    if (!dbClient || !marginClient || !currentAccount) throw new Error('Not connected');

    const pool = getPool(debtPoolKey);
    if (!pool) throw new Error(`Unknown pool: ${debtPoolKey}`);

    // Step 1: Swap to acquire the debt token
    if (baseDebt > 0) {
      // Need base tokens (e.g. DEEP on DEEP_SUI pool).
      // Strategy: estimate how much quote (SUI) to spend by simulating
      // a sell of the needed base amount to get the quote price.
      const neededBase = baseDebt * 1.05; // 5% buffer for interest

      // estimateSwapOutput('sell', neededBase) tells us how much quote
      // we'd GET for selling neededBase — this is roughly the quote cost to buy it
      const priceEstimate = await estimateSwapOutput(suiClient, pool, 'sell', neededBase);
      // Add 20% buffer to ensure we get enough base out
      const quoteToSpend = priceEstimate.output > 0
        ? priceEstimate.output * 1.20
        : neededBase * 0.025; // fallback: ~0.025 quote per base (rough DEEP/SUI price)

      console.log(`[swapAndRepay] Buying ~${neededBase.toFixed(2)} ${pool.baseCoin} by spending ~${quoteToSpend.toFixed(4)} ${pool.quoteCoin}`);

      const minBaseOut = calculateMinOutput(neededBase, 10); // 10% slippage tolerance
      const swapTx = buildMarketBuyTransaction(dbClient, {
        poolKey: debtPoolKey,
        quoteAmount: quoteToSpend,
        minBaseOut,
        sender: currentAccount.address,
      });

      console.log('[swapAndRepay] Step 1/2: Sign swap tx...');
      await signAndExecuteDirect(dAppKit, suiClient, swapTx);
      console.log('[swapAndRepay] Swap complete');

    } else if (quoteDebt > 0) {
      // Need quote tokens. Sell base to get quote.
      const neededQuote = quoteDebt * 1.05;

      // Estimate base amount needed by checking how much base yields neededQuote
      const priceEstimate = await estimateSwapOutput(suiClient, pool, 'buy', neededQuote);
      const baseToSell = priceEstimate.output > 0
        ? priceEstimate.output * 1.20
        : neededQuote * 50; // fallback

      console.log(`[swapAndRepay] Selling ~${baseToSell.toFixed(4)} ${pool.baseCoin} for ~${neededQuote.toFixed(2)} ${pool.quoteCoin}`);

      const swapTx = new Transaction();
      swapTx.setSenderIfNotSet(currentAccount.address);
      const [base, quote, deep] = dbClient.deepBook.swapExactBaseForQuote({
        poolKey: debtPoolKey,
        amount: baseToSell,
        deepAmount: 0,
        minOut: calculateMinOutput(neededQuote, 10),
      })(swapTx);
      swapTx.transferObjects([base, quote, deep], currentAccount.address);

      console.log('[swapAndRepay] Step 1/2: Sign swap tx...');
      await signAndExecuteDirect(dAppKit, suiClient, swapTx);
      console.log('[swapAndRepay] Swap complete');
    }

    // Step 2: Force repay — tokens are now in wallet
    console.log('[swapAndRepay] Step 2/2: Sign repay tx...');
    const digest = await forceRepay(debtPoolKey);
    console.log('[swapAndRepay] Repay complete:', digest);

    return digest;
  }, [dbClient, marginClient, currentAccount, dAppKit, suiClient, forceRepay]);

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

      // ── Pre-flight: scan ALL margin pools for existing debt ──
      // Do this BEFORE the balance check so we can account for stale debt repay cost.
      // DeepBook only allows debt in ONE pool at a time (error 4).
      // Check if there's debt on another pool before proceeding.
      const manager = marginManagers[managerKey];
      let needsAutoRepay = false;
      let staleBaseDebt = 0;
      let staleQuoteDebt = 0;
      let staleDebtPoolKey = params.poolKey;
      const poolsToRefresh: string[] = [params.poolKey];

      for (const pk of MARGIN_POOL_KEYS) {
        const mgrKey = `${pk}_MGR`;
        const mgr = marginManagers[mgrKey];
        if (!mgr) continue;
        try {
          const posState = await queryMarginState(suiClient, marginClient, mgr.address, pk);
          const hasDebt = posState.baseDebt > 0 || posState.quoteDebt > 0;
          // Also detect leftover assets with no debt (partially closed positions where
          // debt was repaid but base/quote assets weren't withdrawn). These leave
          // conditional orders and locked assets in the BalanceManager.
          const hasStaleAssets = !hasDebt && (posState.baseAsset > 0.001 || posState.quoteAsset > 0.001);

          if (hasDebt || hasStaleAssets) {
            if (pk !== params.poolKey) {
              if (hasDebt) {
                throw new Error(
                  `Active position on ${pk} is blocking trading on ${params.poolKey}. ` +
                  `DeepBook only allows one pool at a time. Close your ${pk} position first.`,
                );
              }
              // Stale assets on different pool — still need cleanup
              console.log(`[openWithTPSL] found stale assets in ${pk}, will clean up:`, posState);
            }
            console.log(`[openWithTPSL] found stale state in ${pk}, auto-cleaning:`, posState);
            staleBaseDebt = posState.baseDebt;
            staleQuoteDebt = posState.quoteDebt;
            staleDebtPoolKey = pk;
            needsAutoRepay = true;
            break;
          }
        } catch (err) {
          // Re-throw our own errors (the "Active position" message above)
          if (err instanceof Error && err.message.includes('Active position')) throw err;
          // Query failed for this pool — skip
        }
      }

      // ── Pre-flight: check wallet balances for stale debt repay + new collateral ──
      // Both withdrawals happen in the same PTB, so the wallet must cover both.
      const pool = getPool(params.poolKey);
      if (pool) {
        const balanceResult = await suiClient.getBalance({
          owner: currentAccount.address,
          coinType: pool.quoteType,
        });
        const walletQuote = Number(balanceResult.totalBalance) / Math.pow(10, pool.quoteDecimals);
        const gasBuffer = pool.quoteType.includes('::sui::SUI') ? 0.1 : 0;

        // Combined cost: collateral + gas + stale debt repay (if any)
        let totalQuoteNeeded = params.collateral + gasBuffer;
        if (needsAutoRepay && staleQuoteDebt > 0) {
          totalQuoteNeeded += staleQuoteDebt * 1.02;
        }

        if (walletQuote < totalQuoteNeeded) {
          const parts = [`${params.collateral} collateral`];
          if (gasBuffer) parts.push('gas');
          if (needsAutoRepay && staleQuoteDebt > 0) parts.push(`${(staleQuoteDebt * 1.02).toFixed(4)} stale debt repay`);
          throw new Error(
            `Insufficient ${pool.quoteCoin}: you have ${walletQuote.toFixed(4)} but need ${totalQuoteNeeded.toFixed(4)} (${parts.join(' + ')})`,
          );
        }

        // Check base balance for stale base debt repay (if any)
        if (needsAutoRepay && staleBaseDebt > 0) {
          const baseBal = await suiClient.getBalance({
            owner: currentAccount.address,
            coinType: pool.baseType,
          });
          const walletBase = Number(baseBal.totalBalance) / Math.pow(10, pool.baseDecimals);
          const neededBase = staleBaseDebt * 1.02;
          if (walletBase < neededBase) {
            throw new Error(
              `Stuck base debt: ${staleBaseDebt.toFixed(4)} ${pool.baseCoin} on ${staleDebtPoolKey}. ` +
              `You have ${walletBase.toFixed(4)} but need ${neededBase.toFixed(4)}. ` +
              `Use "Swap & Repay" to clear it first.`,
            );
          }
        }
      }

      // ── Step 1: Clean up stale position (separate tx if needed) ──
      // When there's an old position with debt/assets, we MUST clean it up in a
      // SEPARATE transaction. Combining cleanup + new position in one PTB fails
      // because coinWithBalance (used by SDK methods) resolves against initial
      // wallet coins, not coins returned mid-PTB by withdrawSettledAmounts.
      if (needsAutoRepay) {
        console.log('[openWithTPSL] Step 1/2: Cleaning up stale position...');
        const cleanupTx = await buildMarginTxWithPythRefresh(
          params.poolKey,
          currentAccount.address,
          (t) => {
            // Cancel old TP/SL conditional orders to unlock assets
            marginClient.marginTPSL.cancelAllConditionalOrders(managerKey)(t);

            // Repay outstanding debt
            if (staleQuoteDebt > 0) {
              marginClient.marginManager.depositQuote({
                managerKey,
                amount: staleQuoteDebt * 1.02,
              })(t);
              marginClient.marginManager.repayQuote(managerKey)(t);
            }
            if (staleBaseDebt > 0) {
              marginClient.marginManager.depositBase({
                managerKey,
                amount: staleBaseDebt * 1.02,
              })(t);
              marginClient.marginManager.repayBase(managerKey)(t);
            }

            // Withdraw everything (now unlocked) back to wallet
            marginClient.poolProxy.withdrawSettledAmounts(managerKey)(t);
          },
        );

        const cleanupDigest = await signAndExecuteDirect(dAppKit, suiClient, cleanupTx);
        console.log('[openWithTPSL] Stale position cleaned up:', cleanupDigest);

        // Brief pause to ensure on-chain state is updated before next tx
        await new Promise(r => setTimeout(r, 1500));
      }

      // ── Step 2: Open new position with TPSL ──
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

      console.log('[openWithTPSL] Opening position:', {
        direction: params.direction,
        poolKey: params.poolKey,
        collateral: params.collateral,
        leverage: params.leverage,
        price: params.currentPrice,
        baseQuantity: builder.baseQuantity,
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

      // Query on-chain state to determine how much base to sell.
      // Always use regular market orders (not reduce-only) and sell ALL base.
      // This avoids reduce-only edge cases and validate_inputs abort 1 issues.
      // Excess quote from the sale stays in BalanceManager and gets withdrawn after repay.
      let closeQuantity = params.quantity;
      try {
        const posState = await queryMarginState(suiClient, marginClient, manager.address, params.poolKey);
        const bookParams = await queryPoolBookParams(suiClient, params.poolKey);

        console.log('[closeEarly] on-chain state:', posState, 'requested qty:', params.quantity);

        // Sell ALL base to fully close the position. Regular market order avoids
        // reduce-only assertion failures and quantity capping edge cases.
        closeQuantity = alignToLotSize(posState.baseAsset, bookParams.lotSize);
        console.log('[closeEarly] selling all base:', closeQuantity);
      } catch (err) {
        console.warn('[closeEarly] Failed to query state, using 95% of original qty:', err);
        const bookParams = await queryPoolBookParams(suiClient, params.poolKey).catch(() => null);
        closeQuantity = params.quantity * 0.95;
        if (bookParams) closeQuantity = alignToLotSize(closeQuantity, bookParams.lotSize);
      }

      if (closeQuantity <= 0) {
        console.warn('[closeEarly] quantity rounded to 0, skipping market order — cancel + repay + withdraw only');
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
            useReduceOnly: false,
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
    swapAndRepay,
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
