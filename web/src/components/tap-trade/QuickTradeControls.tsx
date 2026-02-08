"use client"

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSwipeBook } from '@/context/SwipeBookContext';
import { useMarginTradeExecution } from '@/hooks/swipebook/useMarginTradeExecution';
import { UpDownButtons } from './UpDownButtons';
import { LeverageSelector } from './LeverageSelector';
import { TimeframeSelector } from './TimeframeSelector';
import { MarginHealthGauge } from './MarginHealthGauge';
import type { PredictionDirection, PredictionRound } from '@/context/SwipeBookContext';
import type { MarginPosition } from '@/hooks/swipebook/useMarginPosition';

interface QuickTradeControlsProps {
  currentPrice: number | null;
  poolKey: string;
  stake: number;
  riskRatio?: number;
  marginPosition?: MarginPosition | null;
}

export function QuickTradeControls({ currentPrice, poolKey, stake, riskRatio, marginPosition }: QuickTradeControlsProps) {
  const {
    state,
    setQuickTradeState,
    setActivePrediction,
    setTimeframe,
    setLeverage,
    addRound,
  } = useSwipeBook();

  const {
    quickTradeState,
    activePrediction,
    selectedTimeframe,
    selectedLeverage,
    predictionMode,
  } = state;

  const { openPosition, closePosition } = useMarginTradeExecution();
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Auto-close when timer expires (only once — no retry loop)
  useEffect(() => {
    if (quickTradeState !== 'watching' || !activePrediction) return;

    const elapsed = Date.now() - activePrediction.startedAt;
    const remaining = activePrediction.timeframe * 1000 - elapsed;

    if (remaining <= 0) {
      setTimerExpired(true);
      // Don't auto-call handleClose — let user click the button
      // This avoids infinite loop on wallet rejection
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      setTimerExpired(true);
    }, remaining);

    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [quickTradeState, activePrediction]);

  // Reset state when prediction changes (new round)
  useEffect(() => {
    if (!activePrediction) {
      setTimerExpired(false);
      setCloseError(null);
    }
  }, [activePrediction]);

  const handleDirection = useCallback(async (direction: PredictionDirection) => {
    if (quickTradeState !== 'idle' || !currentPrice || predictionMode !== 'quick') return;

    setQuickTradeState('opening');

    try {
      const result = await openPosition({
        direction,
        poolKey,
        collateral: stake,
        leverage: selectedLeverage,
        currentPrice,
      });

      const round: PredictionRound = {
        id: result.digest,
        poolKey,
        direction,
        leverage: selectedLeverage,
        collateral: stake,
        entryPrice: result.entryPrice,
        baseQuantity: result.baseQuantity,
        timeframe: selectedTimeframe,
        startedAt: Date.now(),
        txDigestOpen: result.digest,
      };

      setActivePrediction(round);
      setQuickTradeState('watching');
    } catch (err) {
      console.error('Failed to open position:', err);
      setQuickTradeState('idle');
    }
  }, [quickTradeState, currentPrice, predictionMode, poolKey, stake, selectedLeverage, selectedTimeframe, openPosition, setQuickTradeState, setActivePrediction]);

  const handleClose = useCallback(async () => {
    if (!activePrediction || !currentPrice) return;

    setQuickTradeState('closing');
    setCloseError(null);

    try {
      // Use real on-chain position balance instead of stored baseQuantity.
      // Market orders can partial-fill, so the actual position may differ
      // from the requested quantity. Using the stale baseQuantity causes
      // MoveAbort code 3 (reduce-only quantity exceeds position).
      const isLong = activePrediction.direction === 'long';
      const onChainQuantity = marginPosition
        ? (isLong ? marginPosition.baseBalance : marginPosition.baseDebt)
        : activePrediction.baseQuantity;

      const result = await closePosition({
        poolKey: activePrediction.poolKey,
        quantity: onChainQuantity,
        isLong,
      });

      const exitPrice = currentPrice;
      const priceDiff = exitPrice - activePrediction.entryPrice;
      const pnl = activePrediction.direction === 'long'
        ? priceDiff * activePrediction.collateral * activePrediction.leverage / activePrediction.entryPrice
        : -priceDiff * activePrediction.collateral * activePrediction.leverage / activePrediction.entryPrice;
      const pnlPercent = (pnl / activePrediction.collateral) * 100;

      const completedRound: PredictionRound = {
        ...activePrediction,
        exitPrice,
        closedAt: Date.now(),
        pnl,
        pnlPercent,
        txDigestClose: result.digest,
        result: pnl > 0 ? 'win' : 'loss',
      };

      setActivePrediction(completedRound);
      addRound(completedRound);
      setQuickTradeState('result');

      // Auto-reset to idle after 3s
      setTimeout(() => {
        setActivePrediction(null);
        setQuickTradeState('idle');
      }, 3000);
    } catch (err) {
      console.error('Failed to close position:', err);
      setCloseError(err instanceof Error ? err.message : 'Close failed');
      setQuickTradeState('watching'); // Go back to watching — user can retry manually
    }
  }, [activePrediction, currentPrice, marginPosition, closePosition, setQuickTradeState, setActivePrediction, addRound]);

  const isDisabled = quickTradeState !== 'idle' || !currentPrice;
  const isActive = quickTradeState === 'watching' || quickTradeState === 'closing';

  // Calculate remaining time for display
  const remaining = activePrediction
    ? Math.max(0, activePrediction.timeframe - (Date.now() - activePrediction.startedAt) / 1000)
    : 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Selectors row */}
      <div className="flex items-center justify-between">
        <TimeframeSelector
          timeframe={selectedTimeframe}
          onChange={setTimeframe}
        />
        <LeverageSelector
          leverage={selectedLeverage}
          onChange={setLeverage}
        />
      </div>

      {/* Status row (during active trade) */}
      {isActive && activePrediction && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${activePrediction.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
              {activePrediction.direction.toUpperCase()} {activePrediction.leverage}x
            </span>
            <span className="text-xs text-white/40">
              @ ${activePrediction.entryPrice.toFixed(4)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm font-mono text-white/80">
              {timerExpired ? 'Expired' : `${Math.ceil(remaining)}s`}
            </span>
          </div>
        </div>
      )}

      {/* Close error message */}
      {closeError && isActive && (
        <div className="text-center text-xs text-red-400/80 px-2">
          Close failed — approve wallet to close position
        </div>
      )}

      {/* Result display */}
      {quickTradeState === 'result' && activePrediction && (
        <div className={`text-center py-2 rounded-xl ${activePrediction.result === 'win' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
          <div className={`text-2xl font-bold ${activePrediction.result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
            {activePrediction.pnl && activePrediction.pnl >= 0 ? '+' : ''}${activePrediction.pnl?.toFixed(2)}
          </div>
          <div className="text-xs text-white/50">
            {activePrediction.pnlPercent?.toFixed(1)}% PnL
          </div>
        </div>
      )}

      {/* UP/DOWN buttons */}
      <UpDownButtons
        onUp={() => handleDirection('long')}
        onDown={() => handleDirection('short')}
        disabled={isDisabled}
        isActive={isActive}
        activeDirection={activePrediction?.direction}
      />

      {/* Health gauge during active position */}
      {isActive && (
        <div className="flex justify-center">
          <MarginHealthGauge riskRatio={riskRatio ?? 2.0} visible={true} />
        </div>
      )}

      {/* Close position button — shown when timer expired or user wants to close early */}
      {quickTradeState === 'watching' && (
        <button
          onClick={handleClose}
          className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
            timerExpired
              ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/30'
              : 'bg-white/10 text-white/70 hover:bg-white/15'
          }`}
        >
          {timerExpired ? 'Close Position (Approve Wallet)' : 'Close Early'}
        </button>
      )}

      {/* Show loading state during close */}
      {quickTradeState === 'closing' && (
        <div className="w-full py-2.5 rounded-xl bg-white/5 text-white/50 text-sm font-medium text-center">
          Closing position...
        </div>
      )}
    </div>
  );
}
