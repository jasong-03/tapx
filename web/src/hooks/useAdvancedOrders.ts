import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useDAppKit, useCurrentClient } from '@mysten/dapp-kit-react';
import { toast } from 'sonner';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Pool } from '@/lib/swipebook/types';
import type { OrderSide, BundledOrderParams, LimitOrderParams } from '@/lib/deepbook/orderTypes';
import { toOnChainPrice, validateBundledOrderPrices } from '@/lib/deepbook/orderTypes';
import {
  buildLimitOrderTransaction,
  buildBundledOrderTransaction,
  buildCancelOrderTransaction,
  buildCancelAllOrdersTransaction,
} from '@/lib/deepbook/advancedOrders';
import { toOnChainAmount } from '@/lib/deepbook/transactions';

interface PlaceLimitOrderParams {
  pool: Pool;
  side: OrderSide;
  price: number;
  quantity: number;
  expiration?: number;
}

interface PlaceBundledOrderParams {
  pool: Pool;
  side: OrderSide;
  entryPrice: number;
  quantity: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

interface CancelOrderParams {
  pool: Pool;
  orderId: string;
}

interface OrderResult {
  success: boolean;
  digest?: string;
  error?: string;
  timestamp: number;
}

/**
 * Hook for placing and managing advanced orders on DeepBook
 */
export function useAdvancedOrders() {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = useCurrentClient();
  const queryClient = useQueryClient();

  // Place limit order mutation
  const limitOrderMutation = useMutation({
    mutationFn: async (params: PlaceLimitOrderParams): Promise<OrderResult> => {
      if (!currentAccount) {
        throw new Error('Wallet not connected');
      }

      const { pool, side, price, quantity, expiration } = params;

      // Convert to on-chain values
      const onChainPrice = toOnChainPrice(price, pool.baseDecimals, pool.quoteDecimals);
      const onChainQuantity = toOnChainAmount(quantity, pool.baseDecimals);

      const orderParams: LimitOrderParams & { sender: string } = {
        pool,
        side,
        price: onChainPrice,
        quantity: onChainQuantity,
        expiration,
        sender: currentAccount.address,
      };

      const tx = buildLimitOrderTransaction(orderParams);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      const digest =
        'digest' in result
          ? (result as { digest: string }).digest
          : 'Transaction' in result
            ? 'pending'
            : 'unknown';

      return {
        success: true,
        digest,
        timestamp: Date.now(),
      };
    },
    onSuccess: (result) => {
      toast.success(`Limit order placed! TX: ${result.digest?.slice(0, 8)}...`);
      queryClient.invalidateQueries({ queryKey: ['user-orders'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (error) => {
      console.error('Limit order failed:', error);
      toast.error(`Order failed: ${error.message}`);
    },
  });

  // Place bundled order mutation (entry + SL + TP)
  const bundledOrderMutation = useMutation({
    mutationFn: async (params: PlaceBundledOrderParams): Promise<OrderResult> => {
      if (!currentAccount) {
        throw new Error('Wallet not connected');
      }

      if (!suiClient) {
        throw new Error('Sui client not available');
      }

      const { pool, side, entryPrice, quantity, stopLossPrice, takeProfitPrice } = params;

      // Convert to on-chain values
      const onChainEntryPrice = toOnChainPrice(entryPrice, pool.baseDecimals, pool.quoteDecimals);
      const onChainQuantity = toOnChainAmount(quantity, pool.baseDecimals);
      const onChainStopLoss = stopLossPrice
        ? toOnChainPrice(stopLossPrice, pool.baseDecimals, pool.quoteDecimals)
        : undefined;
      const onChainTakeProfit = takeProfitPrice
        ? toOnChainPrice(takeProfitPrice, pool.baseDecimals, pool.quoteDecimals)
        : undefined;

      const bundledParams: BundledOrderParams = {
        pool,
        side,
        entryPrice: onChainEntryPrice,
        quantity: onChainQuantity,
        stopLossPrice: onChainStopLoss,
        takeProfitPrice: onChainTakeProfit,
        sender: currentAccount.address,
      };

      // Validate prices before building transaction
      const validation = validateBundledOrderPrices(bundledParams);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const tx = await buildBundledOrderTransaction(suiClient as SuiJsonRpcClient, bundledParams);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      const digest =
        'digest' in result
          ? (result as { digest: string }).digest
          : 'Transaction' in result
            ? 'pending'
            : 'unknown';

      return {
        success: true,
        digest,
        timestamp: Date.now(),
      };
    },
    onSuccess: (result) => {
      toast.success(`Bundled orders placed! TX: ${result.digest?.slice(0, 8)}...`);
      queryClient.invalidateQueries({ queryKey: ['user-orders'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (error) => {
      console.error('Bundled order failed:', error);
      toast.error(`Order failed: ${error.message}`);
    },
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async (params: CancelOrderParams): Promise<OrderResult> => {
      if (!currentAccount) {
        throw new Error('Wallet not connected');
      }

      const { pool, orderId } = params;

      const tx = buildCancelOrderTransaction({
        poolAddress: pool.address,
        baseType: pool.baseType,
        quoteType: pool.quoteType,
        orderId,
        sender: currentAccount.address,
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      const digest =
        'digest' in result
          ? (result as { digest: string }).digest
          : 'Transaction' in result
            ? 'pending'
            : 'unknown';

      return {
        success: true,
        digest,
        timestamp: Date.now(),
      };
    },
    onSuccess: (result) => {
      toast.success(`Order cancelled! TX: ${result.digest?.slice(0, 8)}...`);
      queryClient.invalidateQueries({ queryKey: ['user-orders'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (error) => {
      console.error('Cancel order failed:', error);
      toast.error(`Cancel failed: ${error.message}`);
    },
  });

  // Cancel all orders mutation
  const cancelAllOrdersMutation = useMutation({
    mutationFn: async (pool: Pool): Promise<OrderResult> => {
      if (!currentAccount) {
        throw new Error('Wallet not connected');
      }

      const tx = buildCancelAllOrdersTransaction({
        poolAddress: pool.address,
        baseType: pool.baseType,
        quoteType: pool.quoteType,
        sender: currentAccount.address,
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      const digest =
        'digest' in result
          ? (result as { digest: string }).digest
          : 'Transaction' in result
            ? 'pending'
            : 'unknown';

      return {
        success: true,
        digest,
        timestamp: Date.now(),
      };
    },
    onSuccess: (result) => {
      toast.success(`All orders cancelled! TX: ${result.digest?.slice(0, 8)}...`);
      queryClient.invalidateQueries({ queryKey: ['user-orders'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (error) => {
      console.error('Cancel all orders failed:', error);
      toast.error(`Cancel failed: ${error.message}`);
    },
  });

  return {
    // Limit orders
    placeLimitOrder: limitOrderMutation.mutate,
    placeLimitOrderAsync: limitOrderMutation.mutateAsync,
    isPlacingLimitOrder: limitOrderMutation.isPending,
    limitOrderError: limitOrderMutation.error,

    // Bundled orders (entry + SL + TP)
    placeBundledOrder: bundledOrderMutation.mutate,
    placeBundledOrderAsync: bundledOrderMutation.mutateAsync,
    isPlacingBundledOrder: bundledOrderMutation.isPending,
    bundledOrderError: bundledOrderMutation.error,

    // Cancel orders
    cancelOrder: cancelOrderMutation.mutate,
    cancelOrderAsync: cancelOrderMutation.mutateAsync,
    isCancellingOrder: cancelOrderMutation.isPending,
    cancelOrderError: cancelOrderMutation.error,

    // Cancel all orders
    cancelAllOrders: cancelAllOrdersMutation.mutate,
    cancelAllOrdersAsync: cancelAllOrdersMutation.mutateAsync,
    isCancellingAllOrders: cancelAllOrdersMutation.isPending,
    cancelAllOrdersError: cancelAllOrdersMutation.error,

    // Combined pending state
    isPending:
      limitOrderMutation.isPending ||
      bundledOrderMutation.isPending ||
      cancelOrderMutation.isPending ||
      cancelAllOrdersMutation.isPending,

    // Reset all mutations
    reset: () => {
      limitOrderMutation.reset();
      bundledOrderMutation.reset();
      cancelOrderMutation.reset();
      cancelAllOrdersMutation.reset();
    },
  };
}
