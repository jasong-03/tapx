"use client"

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { useTradePreview } from '@/hooks/swipebook/useTradePreview';
import { useTradeExecution } from '@/hooks/swipebook/useTradeExecution';
import { useUserBalance } from '@/hooks/useUserBalance';
import type { TradeIntent } from '@/lib/swipebook/types';

const tradeFormSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
});

interface TradeConfirmationProps {
  trade: TradeIntent;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TradeConfirmation({ trade, onConfirm, onCancel }: TradeConfirmationProps) {
  const [slippage, setSlippage] = useState(0.5);

  // Get user balance for the input token
  const inputCoinType = trade.side === 'buy' ? trade.pool.quoteType : trade.pool.baseType;
  const { data: balance } = useUserBalance(inputCoinType);

  const form = useForm<z.infer<typeof tradeFormSchema>>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: { amount: 0 },
  });

  const amount = form.watch('amount');

  // Get trade preview
  const { preview, isLoading: previewLoading } = useTradePreview(
    trade.pool,
    trade.side,
    amount,
    slippage
  );

  // Trade execution
  const { executeTrade, isPending } = useTradeExecution();

  const inputDecimals = trade.side === 'buy' ? trade.pool.quoteDecimals : trade.pool.baseDecimals;
  const balanceFormatted = balance ? Number(balance.totalBalance) / Math.pow(10, inputDecimals) : 0;

  const handleSubmit = (values: z.infer<typeof tradeFormSchema>) => {
    if (!preview) return;

    executeTrade({
      pool: trade.pool,
      side: trade.side,
      amount: values.amount,
      estimatedOutput: preview.estimatedReceived,
      slippagePercent: slippage,
    }, {
      onSuccess: () => {
        onConfirm();
      },
    });
  };

  const handleMaxClick = () => {
    form.setValue('amount', balanceFormatted);
  };

  const inputSymbol = trade.side === 'buy' ? trade.pool.quoteCoin : trade.pool.baseCoin;
  const outputSymbol = trade.side === 'buy' ? trade.pool.baseCoin : trade.pool.quoteCoin;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">
              <span className={cn(
                "px-3 py-1 rounded-full text-sm mr-2",
                trade.side === 'buy'
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              )}>
                {trade.side.toUpperCase()}
              </span>
              {trade.pool.baseCoin}/{trade.pool.quoteCoin}
            </h2>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-white text-2xl"
            >
              x
            </button>
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-slate-400">
                Amount ({inputSymbol})
              </label>
              <span className="text-xs text-slate-500">
                Balance: {balanceFormatted.toFixed(4)} {inputSymbol}
              </span>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)}>
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type="number"
                            step="any"
                            placeholder="0.00"
                            className="pr-16 bg-slate-800 border-slate-700 text-lg h-14"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleMaxClick}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300"
                          >
                            MAX
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Preview */}
                {amount > 0 && (
                  <div className="mt-4 p-4 bg-slate-800/50 rounded-xl space-y-3">
                    {previewLoading ? (
                      <div className="text-center text-slate-400">
                        Calculating...
                      </div>
                    ) : preview ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">You receive (est.)</span>
                          <span className="font-medium">
                            {preview.estimatedReceived.toFixed(6)} {outputSymbol}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Price</span>
                          <span className="font-medium">
                            {preview.estimatedPrice.toFixed(6)} {trade.pool.quoteCoin}/{trade.pool.baseCoin}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Min. received</span>
                          <span className="font-medium">
                            {preview.minReceived.toFixed(6)} {outputSymbol}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Fee (est.)</span>
                          <span className="font-medium">
                            ~{preview.estimatedFee.toFixed(6)} {inputSymbol}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-red-400">
                        Unable to estimate
                      </div>
                    )}
                  </div>
                )}

                {/* Slippage */}
                <div className="mt-4">
                  <label className="text-sm text-slate-400 mb-2 block">
                    Slippage Tolerance
                  </label>
                  <div className="flex gap-2">
                    {[0.1, 0.5, 1.0].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSlippage(value)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm transition-colors",
                          slippage === value
                            ? "bg-blue-500 text-white"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        )}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={!preview || isPending || amount <= 0}
                  className={cn(
                    "w-full mt-6 h-14 text-lg font-semibold",
                    trade.side === 'buy'
                      ? "bg-green-500 hover:bg-green-600"
                      : "bg-red-500 hover:bg-red-600"
                  )}
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      Executing...
                    </span>
                  ) : (
                    `Confirm ${trade.side === 'buy' ? 'Buy' : 'Sell'}`
                  )}
                </Button>
              </form>
            </Form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
