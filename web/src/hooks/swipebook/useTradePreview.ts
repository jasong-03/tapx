import { useQuery } from '@tanstack/react-query';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Pool, TradeIntent, TradePreview, TradeSide } from '@/lib/swipebook/types';
import { toOnChainAmount, fromOnChainAmount } from '@/lib/deepbook/transactions';
import { DEEPBOOK_PACKAGE_ID, DUMMY_SENDER } from '@/lib/deepbook/config';

/**
 * Hook to calculate trade preview (estimated output, price impact, fees)
 * using raw devInspect calls to the DeepBook pool contract.
 */
export function useTradePreview(
  pool: Pool | null,
  side: TradeSide | null,
  amount: number,
  slippageTolerance: number = 0.5
) {
  const client = useCurrentClient() as SuiJsonRpcClient;

  const { data, isLoading, error } = useQuery({
    queryKey: ['trade-preview', pool?.poolKey, side, amount],
    queryFn: async (): Promise<TradePreview | null> => {
      if (!pool || !side || amount <= 0) return null;

      const tx = new Transaction();

      if (side === 'buy') {
        // Buying base with quote - estimate base output
        const quoteAmount = toOnChainAmount(amount, pool.quoteDecimals);

        tx.moveCall({
          target: `${DEEPBOOK_PACKAGE_ID}::pool::get_base_quantity_out`,
          typeArguments: [pool.baseType, pool.quoteType],
          arguments: [
            tx.object(pool.address),
            tx.pure.u64(quoteAmount),
            tx.object('0x6'),
          ],
        });
      } else {
        // Selling base for quote - estimate quote output
        const baseAmount = toOnChainAmount(amount, pool.baseDecimals);

        tx.moveCall({
          target: `${DEEPBOOK_PACKAGE_ID}::pool::get_quote_quantity_out`,
          typeArguments: [pool.baseType, pool.quoteType],
          arguments: [
            tx.object(pool.address),
            tx.pure.u64(baseAmount),
            tx.object('0x6'),
          ],
        });
      }

      const result = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: DUMMY_SENDER,
      });

      const returnValue = result.results?.[0]?.returnValues?.[0];
      if (!returnValue || returnValue[1] !== 'u64') {
        throw new Error('Failed to estimate trade output');
      }

      const bytes = new Uint8Array(returnValue[0]);
      const outputRaw = bcs.u64().parse(bytes);

      const outputDecimals = side === 'buy' ? pool.baseDecimals : pool.quoteDecimals;
      const estimatedOutput = fromOnChainAmount(BigInt(outputRaw), outputDecimals);

      // Calculate estimated price
      const estimatedPrice = side === 'buy'
        ? amount / estimatedOutput  // quote per base
        : estimatedOutput / amount; // quote per base

      // Calculate minimum received with slippage
      const minReceived = estimatedOutput * (1 - slippageTolerance / 100);

      // Price impact (simplified - would need mid price for accurate calculation)
      const priceImpact = 0;

      // Trading fee (DeepBook typically 0.1% maker, varies for taker)
      const estimatedFee = amount * 0.001;

      const intent: TradeIntent = {
        pool,
        side,
        amount,
        isBaseAmount: side === 'sell',
      };

      return {
        intent,
        estimatedPrice,
        estimatedReceived: estimatedOutput,
        estimatedFee,
        priceImpact,
        slippageTolerance,
        minReceived,
      };
    },
    enabled: !!pool && !!side && amount > 0 && !!client,
    staleTime: 5000,
  });

  return {
    preview: data,
    isLoading,
    error,
  };
}
