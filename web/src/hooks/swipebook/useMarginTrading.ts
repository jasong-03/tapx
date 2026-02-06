import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { toast } from 'sonner';
import { useDeepBookClient } from './useDeepBookClient';

interface MarginManagerState {
  baseAsset: string;
  quoteAsset: string;
  baseDebt: string;
  quoteDebt: string;
}

/**
 * Hook for testnet margin trading using the DeepBook SDK.
 * Provides margin manager creation, deposit, borrow, repay, and state queries.
 */
export function useMarginTrading(poolKey: string) {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const dbClient = useDeepBookClient();
  const queryClient = useQueryClient();

  // Query existing margin manager IDs for the user
  const { data: marginManagerIds, isLoading: isLoadingManagers } = useQuery({
    queryKey: ['margin-managers', currentAccount?.address],
    queryFn: async () => {
      if (!dbClient || !currentAccount) return [];
      return dbClient.getMarginManagerIdsForOwner(currentAccount.address);
    },
    enabled: !!dbClient && !!currentAccount,
    staleTime: 30000,
  });

  const marginManagerId = marginManagerIds?.[0] ?? null;

  // Query margin manager state
  const { data: marginState, isLoading: isLoadingState } = useQuery({
    queryKey: ['margin-state', marginManagerId],
    queryFn: async (): Promise<MarginManagerState | null> => {
      if (!dbClient || !marginManagerId) return null;
      return dbClient.getMarginManagerState(marginManagerId);
    },
    enabled: !!dbClient && !!marginManagerId,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // Create margin manager mutation
  const createManagerMutation = useMutation({
    mutationFn: async () => {
      if (!dbClient || !currentAccount) throw new Error('Not connected');

      const tx = new Transaction();
      tx.setSenderIfNotSet(currentAccount.address);
      dbClient.marginManager.newMarginManager(poolKey)(tx);

      return dAppKit.signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      toast.success('Margin manager created!');
      queryClient.invalidateQueries({ queryKey: ['margin-managers'] });
    },
    onError: (err) => {
      toast.error(`Failed to create margin manager: ${err.message}`);
    },
  });

  // Deposit base mutation
  const depositBaseMutation = useMutation({
    mutationFn: async (params: { managerKey: string; amount: number }) => {
      if (!dbClient || !currentAccount) throw new Error('Not connected');

      const tx = new Transaction();
      tx.setSenderIfNotSet(currentAccount.address);
      dbClient.marginManager.depositBase({
        managerKey: params.managerKey,
        amount: params.amount,
      })(tx);

      return dAppKit.signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      toast.success('Deposit successful!');
      queryClient.invalidateQueries({ queryKey: ['margin-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (err) => {
      toast.error(`Deposit failed: ${err.message}`);
    },
  });

  // Deposit quote mutation
  const depositQuoteMutation = useMutation({
    mutationFn: async (params: { managerKey: string; amount: number }) => {
      if (!dbClient || !currentAccount) throw new Error('Not connected');

      const tx = new Transaction();
      tx.setSenderIfNotSet(currentAccount.address);
      dbClient.marginManager.depositQuote({
        managerKey: params.managerKey,
        amount: params.amount,
      })(tx);

      return dAppKit.signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      toast.success('Deposit successful!');
      queryClient.invalidateQueries({ queryKey: ['margin-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (err) => {
      toast.error(`Deposit failed: ${err.message}`);
    },
  });

  // Borrow base mutation
  const borrowBaseMutation = useMutation({
    mutationFn: async (params: { managerKey: string; amount: number }) => {
      if (!dbClient || !currentAccount) throw new Error('Not connected');

      const tx = new Transaction();
      tx.setSenderIfNotSet(currentAccount.address);
      const coin = dbClient.marginManager.borrowBase(params.managerKey, params.amount)(tx);
      tx.transferObjects([coin], currentAccount.address);

      return dAppKit.signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      toast.success('Borrow successful!');
      queryClient.invalidateQueries({ queryKey: ['margin-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (err) => {
      toast.error(`Borrow failed: ${err.message}`);
    },
  });

  // Borrow quote mutation
  const borrowQuoteMutation = useMutation({
    mutationFn: async (params: { managerKey: string; amount: number }) => {
      if (!dbClient || !currentAccount) throw new Error('Not connected');

      const tx = new Transaction();
      tx.setSenderIfNotSet(currentAccount.address);
      const coin = dbClient.marginManager.borrowQuote(params.managerKey, params.amount)(tx);
      tx.transferObjects([coin], currentAccount.address);

      return dAppKit.signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      toast.success('Borrow successful!');
      queryClient.invalidateQueries({ queryKey: ['margin-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (err) => {
      toast.error(`Borrow failed: ${err.message}`);
    },
  });

  // Repay base mutation
  const repayBaseMutation = useMutation({
    mutationFn: async (params: { managerKey: string; amount?: number }) => {
      if (!dbClient || !currentAccount) throw new Error('Not connected');

      const tx = new Transaction();
      tx.setSenderIfNotSet(currentAccount.address);
      const coin = dbClient.marginManager.repayBase(params.managerKey, params.amount)(tx);
      tx.transferObjects([coin], currentAccount.address);

      return dAppKit.signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      toast.success('Repayment successful!');
      queryClient.invalidateQueries({ queryKey: ['margin-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (err) => {
      toast.error(`Repay failed: ${err.message}`);
    },
  });

  // Repay quote mutation
  const repayQuoteMutation = useMutation({
    mutationFn: async (params: { managerKey: string; amount?: number }) => {
      if (!dbClient || !currentAccount) throw new Error('Not connected');

      const tx = new Transaction();
      tx.setSenderIfNotSet(currentAccount.address);
      const coin = dbClient.marginManager.repayQuote(params.managerKey, params.amount)(tx);
      tx.transferObjects([coin], currentAccount.address);

      return dAppKit.signAndExecuteTransaction({ transaction: tx });
    },
    onSuccess: () => {
      toast.success('Repayment successful!');
      queryClient.invalidateQueries({ queryKey: ['margin-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
    },
    onError: (err) => {
      toast.error(`Repay failed: ${err.message}`);
    },
  });

  return {
    // State
    marginManagerId,
    marginManagerIds: marginManagerIds ?? [],
    marginState,
    isLoadingManagers,
    isLoadingState,
    hasMarginManager: !!marginManagerId,

    // Create
    createMarginManager: createManagerMutation.mutateAsync,
    isCreatingManager: createManagerMutation.isPending,

    // Deposit
    depositBase: depositBaseMutation.mutateAsync,
    depositQuote: depositQuoteMutation.mutateAsync,
    isDepositing: depositBaseMutation.isPending || depositQuoteMutation.isPending,

    // Borrow
    borrowBase: borrowBaseMutation.mutateAsync,
    borrowQuote: borrowQuoteMutation.mutateAsync,
    isBorrowing: borrowBaseMutation.isPending || borrowQuoteMutation.isPending,

    // Repay
    repayBase: repayBaseMutation.mutateAsync,
    repayQuote: repayQuoteMutation.mutateAsync,
    isRepaying: repayBaseMutation.isPending || repayQuoteMutation.isPending,

    // Combined
    isPending:
      createManagerMutation.isPending ||
      depositBaseMutation.isPending ||
      depositQuoteMutation.isPending ||
      borrowBaseMutation.isPending ||
      borrowQuoteMutation.isPending ||
      repayBaseMutation.isPending ||
      repayQuoteMutation.isPending,
  };
}
