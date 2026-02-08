"use client"

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useSwipeBook } from '@/context/SwipeBookContext';
import { useMarginTradeExecution } from '@/hooks/swipebook/useMarginTradeExecution';
import { useTradeHistory } from '@/hooks/swipebook/useTradeHistory';
import {
  TARGET_PERCENT_OPTIONS,
  LEVERAGE_OPTIONS,
  TIMEFRAME_OPTIONS,
  MARGIN_POOL_KEYS,
  calculateTPSLPrices,
} from '@/lib/deepbook/margin-config';
import { getPool } from '@/lib/deepbook/pools';
import { CountdownRing } from './CountdownRing';
import type { PredictionDirection, PredictionRound } from '@/context/SwipeBookContext';
import { useStaleDebtDetector } from '@/hooks/swipebook/useStaleDebtDetector';
import type { MarginPosition } from '@/hooks/swipebook/useMarginPosition';
import type { MarginManager } from '@mysten/deepbook-v3';

interface QuickTradeControlsProps {
  currentPrice: number | null;
  poolKey: string;
  stake: number;
  stakes: number[];
  onStakeChange: (stake: number) => void;
  marginManagers: Record<string, MarginManager>;
  riskRatio?: number;
  marginPosition?: MarginPosition | null;
}

export function QuickTradeControls({
  currentPrice,
  poolKey,
  stake,
  stakes,
  onStakeChange,
  marginManagers,
  riskRatio,
  marginPosition,
}: QuickTradeControlsProps) {
  const {
    state,
    setQuickTradeState,
    setActivePrediction,
    setTargetPercent,
    setLeverage,
    setTimeframe,
    addRound,
  } = useSwipeBook();

  const {
    quickTradeState,
    activePrediction,
    selectedTargetPercent,
    selectedLeverage,
    selectedTimeframe,
    predictionMode,
  } = state;

  const currentAccount = useCurrentAccount();
  const { openPositionWithTPSL, settleTPSL, closeEarly, forceRepay, swapAndRepay } = useMarginTradeExecution(marginManagers);
  const { hasStaleDebt, staleDebts, isScanning: isDebtScanning, rescan: rescanDebt } = useStaleDebtDetector(marginManagers);
  const { addTrade, updateTrade } = useTradeHistory(currentAccount?.address);
  const activeTradeIdRef = useRef<string | null>(null);
  const currentPriceRef = useRef(currentPrice);
  currentPriceRef.current = currentPrice;

  // Live PnL calculation during watching phase
  const [livePnl, setLivePnl] = useState<{ amount: number; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRepaying, setIsRepaying] = useState(false);
  const [hasStuckPosition, setHasStuckPosition] = useState(false);
  const [debtBannerDismissed, setDebtBannerDismissed] = useState(false);

  // Calculate live PnL
  useEffect(() => {
    if ((quickTradeState !== 'watching' && quickTradeState !== 'triggered') || !activePrediction || !currentPrice) {
      setLivePnl(null);
      return;
    }
    const priceDiff = currentPrice - activePrediction.entryPrice;
    const pnl = activePrediction.direction === 'long'
      ? priceDiff * activePrediction.collateral * activePrediction.leverage / activePrediction.entryPrice
      : -priceDiff * activePrediction.collateral * activePrediction.leverage / activePrediction.entryPrice;
    const pnlPercent = (pnl / activePrediction.collateral) * 100;
    setLivePnl({ amount: pnl, percent: pnlPercent });
  }, [quickTradeState, activePrediction, currentPrice]);

  // Reset error when prediction clears
  useEffect(() => {
    if (!activePrediction) {
      setError(null);
    }
  }, [activePrediction]);

  // ── Trigger detection: compare live price against TP/SL ──
  useEffect(() => {
    if (quickTradeState !== 'watching' || !activePrediction || !currentPrice) return;
    if (!activePrediction.tpPrice || !activePrediction.slPrice) return;

    const isLong = activePrediction.direction === 'long';
    let triggered: 'tp' | 'sl' | null = null;

    if (isLong) {
      if (currentPrice >= activePrediction.tpPrice) triggered = 'tp';
      else if (currentPrice <= activePrediction.slPrice) triggered = 'sl';
    } else {
      if (currentPrice <= activePrediction.tpPrice) triggered = 'tp';
      else if (currentPrice >= activePrediction.slPrice) triggered = 'sl';
    }

    if (triggered) {
      setActivePrediction({ ...activePrediction, triggeredSide: triggered });
      setQuickTradeState('triggered');
    }
  }, [quickTradeState, activePrediction, currentPrice, setActivePrediction, setQuickTradeState]);

  // ── Auto-close on timer expiry ──
  const autoCloseRef = useRef(false);
  // Only reset when returning to idle (new round), NOT on closing/settling/triggered
  useEffect(() => {
    if (quickTradeState === 'idle') {
      autoCloseRef.current = false;
    }
  }, [quickTradeState]);

  useEffect(() => {
    if (quickTradeState !== 'watching' || !activePrediction || autoCloseRef.current) {
      return;
    }
    const elapsed = (Date.now() - activePrediction.startedAt) / 1000;
    const remaining = activePrediction.timeframe - elapsed;
    if (remaining <= 0) {
      autoCloseRef.current = true;
      handleCloseEarly();
      return;
    }
    const timer = setTimeout(() => {
      if (autoCloseRef.current) return;
      autoCloseRef.current = true;
      handleCloseEarly();
    }, remaining * 1000);
    return () => clearTimeout(timer);
  }, [quickTradeState, activePrediction]); // handleCloseEarly added below after definition

  // ── Settle: execute conditional orders + repay + withdraw ──
  const handleSettle = useCallback(async () => {
    if (!activePrediction) return;
    setError(null);
    setQuickTradeState('settling');

    try {
      const digest = await settleTPSL({
        poolKey: activePrediction.poolKey ?? poolKey,
        isLong: activePrediction.direction === 'long',
      });

      // Use the TP/SL trigger price as exit price (not current market price which may have bounced)
      const isWin = activePrediction.triggeredSide === 'tp';
      const exitPrice = isWin
        ? (activePrediction.tpPrice ?? currentPriceRef.current ?? activePrediction.entryPrice)
        : (activePrediction.slPrice ?? currentPriceRef.current ?? activePrediction.entryPrice);
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
        txDigestClose: digest,
        result: isWin ? 'win' : 'loss',
      };

      setActivePrediction(completedRound);
      addRound(completedRound);
      setQuickTradeState('result');

      // Update persistent trade history
      if (activeTradeIdRef.current) {
        updateTrade(activeTradeIdRef.current, {
          exitPrice,
          pnl,
          result: isWin ? 'win' : 'loss',
          closedAt: Date.now(),
        });
        activeTradeIdRef.current = null;
      }

      setTimeout(() => {
        setActivePrediction(null);
        setQuickTradeState('idle');
      }, 3000);
    } catch (err) {
      console.error('[QuickTrade] settle failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to settle position');
      setQuickTradeState('triggered'); // Stay in triggered so user can retry
    }
  }, [activePrediction, poolKey, settleTPSL, setQuickTradeState, setActivePrediction, addRound, updateTrade]);

  // ── Close early: cancel conditionals + reduce-only + repay ──
  const handleCloseEarly = useCallback(async () => {
    if (!activePrediction) return;
    setError(null);
    setQuickTradeState('closing');

    try {
      const exitPrice = currentPriceRef.current ?? activePrediction.entryPrice;
      const digest = await closeEarly({
        poolKey: activePrediction.poolKey ?? poolKey,
        quantity: activePrediction.baseQuantity,
        isLong: activePrediction.direction === 'long',
        currentPrice: exitPrice,
      });

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
        txDigestClose: digest,
        result: pnl > 0 ? 'win' : 'loss',
      };

      setActivePrediction(completedRound);
      addRound(completedRound);
      setQuickTradeState('result');

      // Update persistent trade history
      if (activeTradeIdRef.current) {
        updateTrade(activeTradeIdRef.current, {
          exitPrice,
          pnl,
          result: pnl > 0 ? 'win' : 'loss',
          closedAt: Date.now(),
        });
        activeTradeIdRef.current = null;
      }

      setTimeout(() => {
        setActivePrediction(null);
        setQuickTradeState('idle');
      }, 3000);
    } catch (err) {
      console.error('[QuickTrade] close early failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to close position');
      setQuickTradeState('watching'); // Stay in watching so user can retry
    }
  }, [activePrediction, poolKey, closeEarly, setQuickTradeState, setActivePrediction, addRound, updateTrade]);

  // Swap tokens + repay debt (for when user doesn't have the debt token)
  const handleSwapAndRepay = useCallback(async () => {
    if (staleDebts.length === 0) return;
    setIsRepaying(true);
    setError(null);
    try {
      const debt = staleDebts[0];
      await swapAndRepay(debt.poolKey, debt.baseDebt, debt.quoteDebt);
      setHasStuckPosition(false);
      setDebtBannerDismissed(false);
      setError(null);
      rescanDebt();
    } catch (err) {
      console.error('[handleSwapAndRepay] failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg);
    } finally {
      setIsRepaying(false);
    }
  }, [staleDebts, swapAndRepay, rescanDebt]);

  // Force-repay all debt across all known margin pools to clear error 4
  const handleForceRepay = useCallback(async () => {
    setIsRepaying(true);
    setError(null);
    let anySuccess = false;
    try {
      for (const pk of MARGIN_POOL_KEYS) {
        const mgrKey = `${pk}_MGR`;
        if (!marginManagers[mgrKey]) continue;
        try {
          await forceRepay(pk);
          anySuccess = true;
        } catch {
          // Some pools may not have debt
        }
      }
      if (anySuccess) {
        setHasStuckPosition(false);
        setDebtBannerDismissed(false);
        setError(null);
        rescanDebt();
      } else {
        setError('No positions found to close.');
      }
    } catch {
      setError('Failed to clear position. Try again.');
    } finally {
      setIsRepaying(false);
    }
  }, [marginManagers, forceRepay, rescanDebt]);

  // ── Open position with TP/SL ──
  const handleDirection = useCallback(async (direction: PredictionDirection) => {
    if (quickTradeState !== 'idle' || !currentPrice || predictionMode !== 'quick') return;

    const targetOption = TARGET_PERCENT_OPTIONS.find(o => o.value === selectedTargetPercent)!;
    const { tpPrice, slPrice } = calculateTPSLPrices(
      currentPrice,
      direction,
      targetOption.value,
      targetOption.slPercent,
    );

    setQuickTradeState('opening');

    try {
      const result = await openPositionWithTPSL({
        direction,
        poolKey,
        collateral: stake,
        leverage: selectedLeverage,
        currentPrice,
        tpPrice,
        slPrice,
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
        tpPrice,
        slPrice,
        tpOrderId: result.tpOrderId,
        slOrderId: result.slOrderId,
        targetPercent: selectedTargetPercent,
      };

      setActivePrediction(round);
      setQuickTradeState('watching');

      // Record trade in persistent history
      const pool = getPool(poolKey);
      const tradeId = `${Date.now()}_${poolKey}_${Math.random().toString(36).slice(2, 8)}`;
      activeTradeIdRef.current = tradeId;
      addTrade({
        id: tradeId,
        poolKey,
        mode: 'quick',
        direction,
        baseCoin: pool?.baseCoin ?? poolKey.split('_')[0],
        quoteCoin: pool?.quoteCoin ?? poolKey.split('_')[1],
        baseAmount: result.baseQuantity,
        quoteAmount: stake,
        entryPrice: result.entryPrice,
        exitPrice: null,
        pnl: null,
        result: 'closed',
        leverage: selectedLeverage,
        targetPercent: selectedTargetPercent,
        timestamp: Date.now(),
        closedAt: null,
        txDigest: result.digest,
      });
    } catch (err) {
      console.error('Failed to open position:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Swap & Repay')) {
        // Stale debt detected, wallet doesn't have enough — show stuck position UI
        setError(msg);
        setHasStuckPosition(true);
      } else if (msg.includes('Insufficient') && msg.includes('balance')) {
        setError(msg);
      } else if (msg.includes('"margin_manager"') && msg.includes(', 4)')) {
        setError('Existing position open. Close it first before trading.');
        setHasStuckPosition(true);
      } else if (msg.includes('InsufficientCoinBalance')) {
        setError('Not enough funds in wallet. Deposit more tokens to trade.');
      } else {
        setError(msg.length > 120 ? msg.slice(0, 120) + '...' : msg);
      }
      setQuickTradeState('idle');
    }
  }, [quickTradeState, currentPrice, predictionMode, poolKey, stake, selectedLeverage, selectedTargetPercent, selectedTimeframe, openPositionWithTPSL, setQuickTradeState, setActivePrediction, addTrade]);

  const isDisabled = quickTradeState !== 'idle' || !currentPrice;
  const isOpening = quickTradeState === 'opening';

  // ─── SETTLING STATE: Wallet signature pending ──────────────────────
  if (quickTradeState === 'settling' && activePrediction) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-6">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm font-bold text-white">Settling position...</div>
        <div className="text-[10px] text-white/40">Approve the transaction in your wallet</div>
      </div>
    );
  }

  // ─── CLOSING STATE: Early close in progress ────────────────────────
  if (quickTradeState === 'closing' && activePrediction) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-6">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm font-bold text-white">Closing position...</div>
        <div className="text-[10px] text-white/40">Approve the transaction in your wallet</div>
      </div>
    );
  }

  // ─── TRIGGERED STATE: TP or SL hit, show Claim button ──────────────
  if (quickTradeState === 'triggered' && activePrediction) {
    const isTP = activePrediction.triggeredSide === 'tp';
    const isLong = activePrediction.direction === 'long';

    return (
      <div className="flex flex-col gap-3 px-4 py-3">
        {/* Trigger banner */}
        <div className={`text-center py-2 rounded-xl font-bold text-lg ${
          isTP ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {isTP ? 'Take Profit Hit!' : 'Stop Loss Hit!'}
        </div>

        {/* Position summary */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/50">
            {isLong ? 'LONG' : 'SHORT'} {activePrediction.leverage}x
          </span>
          {livePnl && (
            <span className={livePnl.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
              {livePnl.amount >= 0 ? '+' : ''}{livePnl.percent.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="text-[10px] text-red-400 text-center">{error}</div>
        )}

        {/* Claim / Settle button */}
        <button
          onClick={handleSettle}
          className={`w-full py-3 rounded-xl font-bold text-base transition-all ${
            isTP
              ? 'bg-gradient-to-r from-green-600 to-green-500 text-black hover:from-green-500 hover:to-green-400'
              : 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400'
          } animate-pulse`}
        >
          {isTP ? 'Claim Win' : 'Settle Loss'}
        </button>
      </div>
    );
  }

  // ─── WATCHING STATE: Live position with TP/SL lines + countdown ────
  if (quickTradeState === 'watching' && activePrediction) {
    const isLong = activePrediction.direction === 'long';
    const isProfitable = livePnl ? livePnl.amount > 0 : false;

    return (
      <div className="flex flex-col gap-2 px-3 sm:px-4 py-2 sm:py-3">
        {/* Top: Position info + Countdown + Live PnL */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[11px] sm:text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
              isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {isLong ? '↑' : '↓'} {activePrediction.leverage}x
            </span>
            <span className="text-[10px] text-white/40 font-mono truncate">
              @ ${activePrediction.entryPrice.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CountdownRing
              duration={activePrediction.timeframe}
              startedAt={activePrediction.startedAt}
              size={44}
            />
            {livePnl && (
              <div className={`text-right ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                <div className="text-base sm:text-lg font-black tabular-nums">
                  {livePnl.percent >= 0 ? '+' : ''}{livePnl.percent.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TP/SL price targets */}
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-green-400/70">
            TP: ${activePrediction.tpPrice?.toFixed(4)}
          </span>
          <span className="text-white/30">|</span>
          <span className="text-red-400/70">
            SL: ${activePrediction.slPrice?.toFixed(4)}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="text-[10px] text-red-400 text-center">{error}</div>
        )}

        {/* Close Early button */}
        <button
          onClick={handleCloseEarly}
          className="w-full py-2 rounded-xl text-sm font-bold bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80 transition-all active:scale-95"
        >
          Close Early
        </button>
      </div>
    );
  }

  // ─── Computed multiplier ──────────────────────────────────────────
  const targetOption = TARGET_PERCENT_OPTIONS.find(o => o.value === selectedTargetPercent);
  const potentialMultiplier = targetOption
    ? (selectedLeverage * targetOption.value / 100 + 1).toFixed(1)
    : '1.0';

  // Show stale debt banner when no active position but on-chain debt exists
  const showDebtBanner = hasStaleDebt && !activePrediction && quickTradeState === 'idle' && !debtBannerDismissed;

  // ─── IDLE STATE: Selectors + UP/DOWN ───────────────────────────────
  return (
    <div className="flex flex-col gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3">
      {/* Stale debt recovery banner */}
      {showDebtBanner && (
        <div className="flex flex-col gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-amber-400 font-bold">Stuck position detected</span>
            <button onClick={() => setDebtBannerDismissed(true)} className="text-amber-400/60 hover:text-amber-400 text-xs ml-2">✕</button>
          </div>
          {staleDebts.map(d => (
            <div key={d.poolKey} className="text-[10px] text-white/50">
              {d.poolKey}: {d.baseDebt > 0 ? `${d.baseDebt.toFixed(2)} base debt` : ''}{d.baseDebt > 0 && d.quoteDebt > 0 ? ' + ' : ''}{d.quoteDebt > 0 ? `${d.quoteDebt.toFixed(2)} quote debt` : ''}
            </div>
          ))}
          <div className="text-[10px] text-white/40">
            An old position left debt on-chain. Repay to unlock trading.
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSwapAndRepay}
              disabled={isRepaying}
              className="flex-1 py-2 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50"
            >
              {isRepaying ? 'Processing...' : 'Swap & Repay'}
            </button>
            <button
              onClick={handleForceRepay}
              disabled={isRepaying}
              className="flex-1 py-2 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {isRepaying ? 'Clearing...' : 'Direct Repay'}
            </button>
          </div>
        </div>
      )}

      {/* Error banner with force-repay option */}
      {error && quickTradeState === 'idle' && (
        <div className="flex flex-col gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-red-400">{error}</span>
            <button onClick={() => { setError(null); setHasStuckPosition(false); }} className="text-red-400/60 hover:text-red-400 text-xs ml-2">✕</button>
          </div>
          {hasStuckPosition && (
            <div className="flex gap-2">
              <button
                onClick={handleSwapAndRepay}
                disabled={isRepaying}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                {isRepaying ? 'Processing...' : 'Swap & Repay'}
              </button>
              <button
                onClick={handleForceRepay}
                disabled={isRepaying}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {isRepaying ? 'Clearing...' : 'Direct Repay'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Row 1: Target % + Leverage */}
      <div className="flex items-center justify-between gap-1">
        {/* Target percent */}
        <div className="flex gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar">
          {TARGET_PERCENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTargetPercent(opt.value)}
              disabled={isOpening}
              className={`
                px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all shrink-0
                ${selectedTargetPercent === opt.value
                  ? 'bg-white/15 text-white border border-white/25'
                  : 'text-white/40 hover:text-white/60'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Leverage */}
        <div className="flex gap-0.5 sm:gap-1 shrink-0">
          {LEVERAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLeverage(opt.value)}
              disabled={isOpening}
              className={`
                px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all
                ${selectedLeverage === opt.value
                  ? 'bg-lime-400 text-black shadow-[0_0_12px_rgba(163,230,53,0.3)]'
                  : 'text-white/40 hover:text-white/60'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Duration + Stake */}
      <div className="flex items-center justify-between gap-2">
        {/* Duration selector */}
        <div className="flex gap-0.5 sm:gap-1">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeframe(opt.value)}
              disabled={isOpening}
              className={`
                px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all
                ${selectedTimeframe === opt.value
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-white/40 hover:text-white/60'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Stake selector */}
        <div className="flex gap-0.5 sm:gap-1">
          {stakes.map((s) => (
            <button
              key={s}
              onClick={() => onStakeChange(s)}
              disabled={isOpening}
              className={`
                px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all
                ${stake === s
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-white/40 hover:text-white/60 border border-transparent'
                }
              `}
            >
              ${s}
            </button>
          ))}
        </div>
      </div>

      {/* Multiplier display */}
      <div className="text-center">
        <span className="text-[11px] text-white/40">Potential: </span>
        <span className="text-sm font-black text-lime-400">{potentialMultiplier}x</span>
        <span className="text-[10px] text-white/30 ml-1">({selectedTimeframe}s)</span>
      </div>

      {/* Row 3: LONG / SHORT buttons */}
      <div className="flex gap-2 sm:gap-3 w-full">
        <button
          onClick={() => handleDirection('long')}
          disabled={isDisabled || isOpening}
          className={`
            flex-1 flex items-center justify-center gap-1.5 py-3 sm:py-4 rounded-2xl
            font-bold text-base sm:text-lg transition-all duration-200
            ${isDisabled || isOpening
              ? 'opacity-40 cursor-not-allowed'
              : 'active:scale-95'
            }
            bg-gradient-to-r from-green-600 to-green-500 text-black
            hover:from-green-500 hover:to-green-400 shadow-lg
          `}
        >
          <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6" />
          <span>{isOpening ? 'Opening...' : 'LONG'}</span>
        </button>

        <button
          onClick={() => handleDirection('short')}
          disabled={isDisabled || isOpening}
          className={`
            flex-1 flex items-center justify-center gap-1.5 py-3 sm:py-4 rounded-2xl
            font-bold text-base sm:text-lg transition-all duration-200
            ${isDisabled || isOpening
              ? 'opacity-40 cursor-not-allowed'
              : 'active:scale-95'
            }
            bg-gradient-to-r from-red-600 to-red-500 text-white
            hover:from-red-500 hover:to-red-400 shadow-lg
          `}
        >
          <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6" />
          <span>{isOpening ? 'Opening...' : 'SHORT'}</span>
        </button>
      </div>
    </div>
  );
}
