"use client"

// Session-based trading hook — deposit once, trade without wallet signing.
// Replaces useMarginManager + useMarginTradeExecution for grid mode.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { tradeApi, type SessionInfo } from '@/lib/tap-trade/tradeApi';

interface UseSessionTradingReturn {
  // Session state
  session: SessionInfo | null;
  isLoadingSession: boolean;
  botAddress: string | null;

  // Deposit
  deposit: (amount: number, quoteType: string, quoteDecimals: number) => Promise<void>;
  isDepositing: boolean;

  // Trade functions (no wallet signing!)
  openPositionWithTPSL: (params: {
    direction: 'long' | 'short';
    poolKey: string;
    collateral: number;
    leverage: number;
    currentPrice: number;
    tpPrice: number;
    slPrice: number;
  }) => Promise<{
    digest: string;
    entryPrice: number;
    baseQuantity: number;
    tpOrderId: string;
    slOrderId: string;
  }>;
  settleTPSL: (params: { poolKey: string; isLong: boolean }) => Promise<string>;
  closeEarly: (params: {
    poolKey: string;
    quantity: number;
    isLong: boolean;
    currentPrice: number;
  }) => Promise<string>;

  // Withdraw
  withdraw: (amount: number) => Promise<void>;
  isWithdrawing: boolean;

  // Refresh
  refreshSession: () => Promise<void>;
}

export function useSessionTrading(): UseSessionTradingReturn {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = useCurrentClient() as SuiJsonRpcClient;

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [botAddress, setBotAddress] = useState<string | null>(null);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const address = currentAccount?.address;
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Fetch bot address on mount
  useEffect(() => {
    tradeApi.health()
      .then((info) => setBotAddress(info.botAddress))
      .catch((err) => console.warn('[useSessionTrading] health check failed:', err));
  }, []);

  // Fetch session on wallet connect + poll every 5s
  const refreshSession = useCallback(async () => {
    if (!address) return;
    try {
      const info = await tradeApi.getSession(address);
      setSession(info);
    } catch (err) {
      console.warn('[useSessionTrading] session fetch failed:', err);
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setSession(null);
      return;
    }

    setIsLoadingSession(true);
    refreshSession().finally(() => setIsLoadingSession(false));

    // Poll every 5s
    pollRef.current = setInterval(refreshSession, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [address, refreshSession]);

  // Deposit: user transfers quote coin to bot address (signs ONCE)
  const deposit = useCallback(async (amount: number, quoteType: string, quoteDecimals: number) => {
    if (!address || !botAddress) throw new Error('Not connected or bot not available');

    setIsDepositing(true);
    try {
      const rawAmount = BigInt(Math.floor(amount * Math.pow(10, quoteDecimals)));

      const tx = new Transaction();
      tx.setSenderIfNotSet(address);

      // For SUI, use splitCoins from gas
      if (quoteType.includes('::sui::SUI')) {
        const [coin] = tx.splitCoins(tx.gas, [rawAmount]);
        tx.transferObjects([coin], botAddress);
      } else {
        // For other coins, get user's coins and merge/split
        const coins = await suiClient.getCoins({
          owner: address,
          coinType: quoteType,
        });

        if (!coins.data.length) throw new Error('No coins found for deposit');

        // Use first coin, split the amount
        const primaryCoin = tx.object(coins.data[0].coinObjectId);

        // Merge additional coins if needed
        if (coins.data.length > 1) {
          tx.mergeCoins(primaryCoin, coins.data.slice(1).map(c => tx.object(c.coinObjectId)));
        }

        const [splitCoin] = tx.splitCoins(primaryCoin, [rawAmount]);
        tx.transferObjects([splitCoin], botAddress);
      }

      // Sign via wallet (the ONE signing event)
      const signed = await dAppKit.signTransaction({ transaction: tx });
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: signed.bytes,
        signature: signed.signature,
        options: { showEffects: true },
      });

      if (!result.digest) throw new Error('Transaction failed');
      const effects = result.effects;
      if (effects?.status?.status === 'failure') {
        throw new Error(effects.status.error || 'Deposit transaction failed');
      }

      // Confirm deposit with backend
      const confirmation = await tradeApi.confirmDeposit({
        txDigest: result.digest,
        amount,
        senderAddress: address,
      });

      setSession((prev) => prev ? { ...prev, balance: confirmation.balance } : prev);
    } finally {
      setIsDepositing(false);
    }
  }, [address, botAddress, dAppKit, suiClient]);

  // Trade functions — NO wallet signing, just API calls
  const openPositionWithTPSL = useCallback(async (params: {
    direction: 'long' | 'short';
    poolKey: string;
    collateral: number;
    leverage: number;
    currentPrice: number;
    tpPrice: number;
    slPrice: number;
  }) => {
    if (!address) throw new Error('Not connected');

    const result = await tradeApi.openTrade({
      senderAddress: address,
      ...params,
    });

    // Refresh session to get updated balance
    await refreshSession();

    return {
      digest: result.digest,
      entryPrice: result.entryPrice,
      baseQuantity: result.baseQuantity,
      tpOrderId: result.tpOrderId,
      slOrderId: result.slOrderId,
    };
  }, [address, refreshSession]);

  const settleTPSL = useCallback(async (_params: { poolKey: string; isLong: boolean }) => {
    if (!address) throw new Error('Not connected');

    const result = await tradeApi.settleTrade(address);
    await refreshSession();
    return result.digest;
  }, [address, refreshSession]);

  const closeEarly = useCallback(async (params: {
    poolKey: string;
    quantity: number;
    isLong: boolean;
    currentPrice: number;
  }) => {
    if (!address) throw new Error('Not connected');

    const result = await tradeApi.closeTrade(address, params.currentPrice);
    await refreshSession();
    return result.digest;
  }, [address, refreshSession]);

  const withdraw = useCallback(async (amount: number) => {
    if (!address) throw new Error('Not connected');

    setIsWithdrawing(true);
    try {
      await tradeApi.withdraw(address, amount);
      await refreshSession();
    } finally {
      setIsWithdrawing(false);
    }
  }, [address, refreshSession]);

  return {
    session,
    isLoadingSession,
    botAddress,
    deposit,
    isDepositing,
    openPositionWithTPSL,
    settleTPSL,
    closeEarly,
    withdraw,
    isWithdrawing,
    refreshSession,
  };
}
