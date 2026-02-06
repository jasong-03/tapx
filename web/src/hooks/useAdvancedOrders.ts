import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { toast } from 'sonner';
import type { Pool } from '@/lib/swipebook/types';
import type { OrderSide } from '@/lib/deepbook/orderTypes';
import { validateBundledOrderPrices } from '@/lib/deepbook/orderTypes';
import {
  buildLimitOrderTransaction,
  buildBundledOrderTransaction,
  buildCancelOrderTransaction,
  buildCancelAllOrdersTransaction,
} from '@/lib/deepbook/advancedOrders';
import { useDeepBookClient } from './swipebook/useDeepBookClient';

interface PlaceLimitOrderParams {
  pool: Pool;
  side: OrderSide;
  price: number;
  quantity: number;
  balanceManagerKey: string;
  expiration?: number;
}

interface PlaceBundledOrderParams {
  pool: Pool;
  side: OrderSide;
  entryPrice: number;
  quantity: number;
  balanceManagerKey: string;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

interface CancelOrderParams {
  pool: Pool;
  orderId: string;
  balanceManagerKey: string;
}

interface OrderResult {
  success: boolean;
  digest?: string;
  error?: string;
  timestamp: number;
}

/**
 * Hook for placing and managing advanced orders on DeepBook using the SDK.
 */
export function useAdvancedOrders() {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();
  const dbClient = useDeepBookClient();

  // Place limit order mutation
  const limitOrderMutation = useMutation({
    mutationFn: async (params: PlaceLimitOrderParams): Promise<OrderResult> => {
      if (!currentAccount) throw new Error('Wallet not connected');
      if (!dbClient) throw new Error('DeepBook client not initialized');

      const tx = buildLimitOrderTransaction(dbClient, {
        pool: params.pool,
        side: params.side,
        price: BigInt(Math.floor(params.price * 1e9)),
        quantity: BigInt(Math.floor(params.quantity * Math.pow(10, params.pool.baseDecimals))),
        balanceManagerKey: params.balanceManagerKey,
        expiration: params.expiration,
        sender: currentAccount.address,
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest = 'digest' in result ? (result as { digest: string }).digest : 'unknown';

      return { success: true, digest, timestamp: Date.now() };
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
      if (!currentAccount) throw new Error('Wallet not connected');
      if (!dbClient) throw new Error('DeepBook client not initialized');

      const bundledParams = {
        pool: params.pool,
        side: params.side,
        entryPrice: BigInt(Math.floor(params.entryPrice * 1e9)),
        quantity: BigInt(Math.floor(params.quantity * Math.pow(10, params.pool.baseDecimals))),
        stopLossPrice: params.stopLossPrice
          ? BigInt(Math.floor(params.stopLossPrice * 1e9))
          : undefined,
        takeProfitPrice: params.takeProfitPrice
          ? BigInt(Math.floor(params.takeProfitPrice * 1e9))
          : undefined,
        sender: currentAccount.address,
      };

      const validation = validateBundledOrderPrices(bundledParams);
      if (!validation.valid) throw new Error(validation.error);

      const tx = buildBundledOrderTransaction(dbClient, {
        ...bundledParams,
        balanceManagerKey: params.balanceManagerKey,
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest = 'digest' in result ? (result as { digest: string }).digest : 'unknown';

      return { success: true, digest, timestamp: Date.now() };
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
      if (!currentAccount) throw new Error('Wallet not connected');
      if (!dbClient) throw new Error('DeepBook client not initialized');

      const tx = buildCancelOrderTransaction(dbClient, {
        poolKey: params.pool.poolKey,
        balanceManagerKey: params.balanceManagerKey,
        orderId: params.orderId,
        sender: currentAccount.address,
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest = 'digest' in result ? (result as { digest: string }).digest : 'unknown';

      return { success: true, digest, timestamp: Date.now() };
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
    mutationFn: async (params: { pool: Pool; balanceManagerKey: string }): Promise<OrderResult> => {
      if (!currentAccount) throw new Error('Wallet not connected');
      if (!dbClient) throw new Error('DeepBook client not initialized');

      const tx = buildCancelAllOrdersTransaction(dbClient, {
        poolKey: params.pool.poolKey,
        balanceManagerKey: params.balanceManagerKey,
        sender: currentAccount.address,
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest = 'digest' in result ? (result as { digest: string }).digest : 'unknown';

      return { success: true, digest, timestamp: Date.now() };
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
    placeLimitOrder: limitOrderMutation.mutate,
    placeLimitOrderAsync: limitOrderMutation.mutateAsync,
    isPlacingLimitOrder: limitOrderMutation.isPending,
    limitOrderError: limitOrderMutation.error,

    placeBundledOrder: bundledOrderMutation.mutate,
    placeBundledOrderAsync: bundledOrderMutation.mutateAsync,
    isPlacingBundledOrder: bundledOrderMutation.isPending,
    bundledOrderError: bundledOrderMutation.error,

    cancelOrder: cancelOrderMutation.mutate,
    cancelOrderAsync: cancelOrderMutation.mutateAsync,
    isCancellingOrder: cancelOrderMutation.isPending,
    cancelOrderError: cancelOrderMutation.error,

    cancelAllOrders: cancelAllOrdersMutation.mutate,
    cancelAllOrdersAsync: cancelAllOrdersMutation.mutateAsync,
    isCancellingAllOrders: cancelAllOrdersMutation.isPending,
    cancelAllOrdersError: cancelAllOrdersMutation.error,

    isPending:
      limitOrderMutation.isPending ||
      bundledOrderMutation.isPending ||
      cancelOrderMutation.isPending ||
      cancelAllOrdersMutation.isPending,

    reset: () => {
      limitOrderMutation.reset();
      bundledOrderMutation.reset();
      cancelOrderMutation.reset();
      cancelAllOrdersMutation.reset();
    },
  };
}
