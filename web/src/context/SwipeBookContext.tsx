"use client"

import { createContext, useContext, useReducer, useMemo, type ReactNode } from 'react';
import type {
  SwipeBookState,
  SwipeBookAction,
  SwipeBookView,
  TradeIntent,
  TradePreview,
  PoolWithMarketData,
} from '@/lib/swipebook/types';
import type { TradingSignal, RiskScore } from '@/lib/signals/types';
import type { SocialSignals } from '@/lib/social/types';
import type { UserProgress } from '@/lib/gamification/types';
import type { LeverageValue, TimeframeValue } from '@/lib/deepbook/margin-config';

// Prediction round types
export type PredictionDirection = 'long' | 'short';
export type QuickTradeState = 'idle' | 'opening' | 'watching' | 'closing' | 'result';
export type PredictionMode = 'quick' | 'grid';

export interface PredictionRound {
  id: string;
  poolKey: string;
  direction: PredictionDirection;
  leverage: LeverageValue;
  collateral: number;
  entryPrice: number;
  baseQuantity: number; // position size in base units (needed for closing)
  exitPrice?: number;
  timeframe: TimeframeValue;
  startedAt: number;
  closedAt?: number;
  pnl?: number;
  pnlPercent?: number;
  txDigestOpen?: string;
  txDigestClose?: string;
  result?: 'win' | 'loss' | 'liquidated';
}

// Extended state interface with margin/prediction features
interface ExtendedSwipeBookState extends SwipeBookState {
  signals: Map<string, TradingSignal>;
  risks: Map<string, RiskScore>;
  social: Map<string, SocialSignals>;
  userProgress: UserProgress | null;
  watchlist: string[];
  // Margin/prediction state
  quickTradeState: QuickTradeState;
  activePrediction: PredictionRound | null;
  selectedTimeframe: TimeframeValue;
  selectedLeverage: LeverageValue;
  predictionMode: PredictionMode;
  roundHistory: PredictionRound[];
  marginManagerId: string | null;
  // Grid mode
  activeGridOrderId: string | null;
  // Simulation mode
  simulationMode: boolean;
}

// Extended action types
type ExtendedSwipeBookAction =
  | SwipeBookAction
  | { type: 'SET_SIGNALS'; payload: Map<string, TradingSignal> }
  | { type: 'SET_SIGNAL'; payload: { poolAddress: string; signal: TradingSignal } }
  | { type: 'SET_RISKS'; payload: Map<string, RiskScore> }
  | { type: 'SET_RISK'; payload: { poolAddress: string; risk: RiskScore } }
  | { type: 'SET_SOCIAL'; payload: Map<string, SocialSignals> }
  | { type: 'SET_SOCIAL_SIGNALS'; payload: { poolAddress: string; social: SocialSignals } }
  | { type: 'SET_USER_PROGRESS'; payload: UserProgress | null }
  | { type: 'SET_WATCHLIST'; payload: string[] }
  | { type: 'ADD_TO_WATCHLIST'; payload: string }
  | { type: 'REMOVE_FROM_WATCHLIST'; payload: string }
  // Margin/prediction actions
  | { type: 'SET_QUICK_TRADE_STATE'; payload: QuickTradeState }
  | { type: 'SET_ACTIVE_PREDICTION'; payload: PredictionRound | null }
  | { type: 'SET_TIMEFRAME'; payload: TimeframeValue }
  | { type: 'SET_LEVERAGE'; payload: LeverageValue }
  | { type: 'SET_PREDICTION_MODE'; payload: PredictionMode }
  | { type: 'ADD_ROUND'; payload: PredictionRound }
  | { type: 'SET_MARGIN_MANAGER'; payload: string | null }
  | { type: 'SET_GRID_ORDER_ID'; payload: string | null }
  | { type: 'SET_SIMULATION_MODE'; payload: boolean };

const initialState: ExtendedSwipeBookState = {
  currentView: 'swipe',
  currentPoolIndex: 0,
  pools: [],
  pendingTrade: null,
  tradePreview: null,
  isConfirming: false,
  isExecuting: false,
  error: null,
  signals: new Map(),
  risks: new Map(),
  social: new Map(),
  userProgress: null,
  watchlist: [],
  // Margin/prediction defaults
  quickTradeState: 'idle',
  activePrediction: null,
  selectedTimeframe: 30,
  selectedLeverage: 2,
  predictionMode: 'quick',
  roundHistory: [],
  marginManagerId: null,
  activeGridOrderId: null,
  simulationMode: false, // Live testnet mode
};

function swipeBookReducer(state: ExtendedSwipeBookState, action: ExtendedSwipeBookAction): ExtendedSwipeBookState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'SET_POOLS':
      return { ...state, pools: action.payload };
    case 'NEXT_POOL':
      return {
        ...state,
        currentPoolIndex: Math.min(state.currentPoolIndex + 1, state.pools.length - 1),
      };
    case 'PREV_POOL':
      return {
        ...state,
        currentPoolIndex: Math.max(state.currentPoolIndex - 1, 0),
      };
    case 'INITIATE_TRADE':
      return { ...state, pendingTrade: action.payload, isConfirming: true };
    case 'SET_PREVIEW':
      return { ...state, tradePreview: action.payload };
    case 'START_CONFIRMING':
      return { ...state, isConfirming: true };
    case 'START_EXECUTING':
      return { ...state, isExecuting: true, isConfirming: false };
    case 'TRADE_SUCCESS':
      return {
        ...state,
        pendingTrade: null,
        tradePreview: null,
        isConfirming: false,
        isExecuting: false,
        currentPoolIndex: Math.min(state.currentPoolIndex + 1, state.pools.length - 1),
      };
    case 'TRADE_ERROR':
      return {
        ...state,
        isExecuting: false,
        error: action.payload,
      };
    case 'CANCEL_TRADE':
      return {
        ...state,
        pendingTrade: null,
        tradePreview: null,
        isConfirming: false,
        isExecuting: false,
      };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_SIGNALS':
      return { ...state, signals: action.payload };
    case 'SET_SIGNAL': {
      const newSignals = new Map(state.signals);
      newSignals.set(action.payload.poolAddress, action.payload.signal);
      return { ...state, signals: newSignals };
    }
    case 'SET_RISKS':
      return { ...state, risks: action.payload };
    case 'SET_RISK': {
      const newRisks = new Map(state.risks);
      newRisks.set(action.payload.poolAddress, action.payload.risk);
      return { ...state, risks: newRisks };
    }
    case 'SET_SOCIAL':
      return { ...state, social: action.payload };
    case 'SET_SOCIAL_SIGNALS': {
      const newSocial = new Map(state.social);
      newSocial.set(action.payload.poolAddress, action.payload.social);
      return { ...state, social: newSocial };
    }
    case 'SET_USER_PROGRESS':
      return { ...state, userProgress: action.payload };
    case 'SET_WATCHLIST':
      return { ...state, watchlist: action.payload };
    case 'ADD_TO_WATCHLIST':
      if (state.watchlist.includes(action.payload)) {
        return state;
      }
      return { ...state, watchlist: [...state.watchlist, action.payload] };
    case 'REMOVE_FROM_WATCHLIST':
      return {
        ...state,
        watchlist: state.watchlist.filter((addr) => addr !== action.payload),
      };
    // Margin/prediction reducers
    case 'SET_QUICK_TRADE_STATE':
      if (state.quickTradeState === action.payload) return state;
      return { ...state, quickTradeState: action.payload };
    case 'SET_ACTIVE_PREDICTION':
      if (state.activePrediction === action.payload) return state;
      return { ...state, activePrediction: action.payload };
    case 'SET_TIMEFRAME':
      return { ...state, selectedTimeframe: action.payload };
    case 'SET_LEVERAGE':
      return { ...state, selectedLeverage: action.payload };
    case 'SET_PREDICTION_MODE':
      if (state.predictionMode === action.payload) return state;
      return { ...state, predictionMode: action.payload };
    case 'ADD_ROUND': {
      const history = [action.payload, ...state.roundHistory].slice(0, 50);
      return { ...state, roundHistory: history };
    }
    case 'SET_MARGIN_MANAGER':
      return { ...state, marginManagerId: action.payload };
    case 'SET_GRID_ORDER_ID':
      return { ...state, activeGridOrderId: action.payload };
    case 'SET_SIMULATION_MODE':
      return { ...state, simulationMode: action.payload };
    default:
      return state;
  }
}

interface SwipeBookContextValue {
  state: ExtendedSwipeBookState;
  dispatch: React.Dispatch<ExtendedSwipeBookAction>;
  // Convenience actions
  setView: (view: SwipeBookView) => void;
  setPools: (pools: PoolWithMarketData[]) => void;
  nextPool: () => void;
  prevPool: () => void;
  initiateTrade: (intent: TradeIntent) => void;
  setPreview: (preview: TradePreview) => void;
  cancelTrade: () => void;
  startExecuting: () => void;
  tradeSuccess: (digest: string) => void;
  tradeError: (error: string) => void;
  clearError: () => void;
  setSignals: (signals: Map<string, TradingSignal>) => void;
  setSignal: (poolAddress: string, signal: TradingSignal) => void;
  setRisks: (risks: Map<string, RiskScore>) => void;
  setRisk: (poolAddress: string, risk: RiskScore) => void;
  setSocial: (social: Map<string, SocialSignals>) => void;
  setSocialSignals: (poolAddress: string, social: SocialSignals) => void;
  setUserProgress: (progress: UserProgress | null) => void;
  setWatchlist: (watchlist: string[]) => void;
  addToWatchlist: (poolAddress: string) => void;
  removeFromWatchlist: (poolAddress: string) => void;
  // Margin/prediction convenience actions
  setQuickTradeState: (state: QuickTradeState) => void;
  setActivePrediction: (prediction: PredictionRound | null) => void;
  setTimeframe: (tf: TimeframeValue) => void;
  setLeverage: (lev: LeverageValue) => void;
  setPredictionMode: (mode: PredictionMode) => void;
  addRound: (round: PredictionRound) => void;
  setMarginManager: (id: string | null) => void;
  setGridOrderId: (id: string | null) => void;
  setSimulationMode: (mode: boolean) => void;
  // Computed values
  currentPool: PoolWithMarketData | null;
  currentSignal: TradingSignal | null;
  currentRisk: RiskScore | null;
  currentSocial: SocialSignals | null;
}

const SwipeBookContext = createContext<SwipeBookContextValue | null>(null);

export function SwipeBookProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(swipeBookReducer, initialState);

  // Compute current pool's data
  const currentPool = state.pools[state.currentPoolIndex] || null;

  const currentSignal = useMemo(() => {
    if (!currentPool) return null;
    return state.signals.get(currentPool.address) || null;
  }, [currentPool, state.signals]);

  const currentRisk = useMemo(() => {
    if (!currentPool) return null;
    return state.risks.get(currentPool.address) || null;
  }, [currentPool, state.risks]);

  const currentSocial = useMemo(() => {
    if (!currentPool) return null;
    return state.social.get(currentPool.address) || null;
  }, [currentPool, state.social]);

  const value: SwipeBookContextValue = useMemo(() => ({
    state,
    dispatch,
    setView: (view) => dispatch({ type: 'SET_VIEW', payload: view }),
    setPools: (pools) => dispatch({ type: 'SET_POOLS', payload: pools }),
    nextPool: () => dispatch({ type: 'NEXT_POOL' }),
    prevPool: () => dispatch({ type: 'PREV_POOL' }),
    initiateTrade: (intent) => dispatch({ type: 'INITIATE_TRADE', payload: intent }),
    setPreview: (preview) => dispatch({ type: 'SET_PREVIEW', payload: preview }),
    cancelTrade: () => dispatch({ type: 'CANCEL_TRADE' }),
    startExecuting: () => dispatch({ type: 'START_EXECUTING' }),
    tradeSuccess: (digest) => dispatch({ type: 'TRADE_SUCCESS', payload: digest }),
    tradeError: (error) => dispatch({ type: 'TRADE_ERROR', payload: error }),
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
    setSignals: (signals) => dispatch({ type: 'SET_SIGNALS', payload: signals }),
    setSignal: (poolAddress, signal) =>
      dispatch({ type: 'SET_SIGNAL', payload: { poolAddress, signal } }),
    setRisks: (risks) => dispatch({ type: 'SET_RISKS', payload: risks }),
    setRisk: (poolAddress, risk) =>
      dispatch({ type: 'SET_RISK', payload: { poolAddress, risk } }),
    setSocial: (social) => dispatch({ type: 'SET_SOCIAL', payload: social }),
    setSocialSignals: (poolAddress, social) =>
      dispatch({ type: 'SET_SOCIAL_SIGNALS', payload: { poolAddress, social } }),
    setUserProgress: (progress) => dispatch({ type: 'SET_USER_PROGRESS', payload: progress }),
    setWatchlist: (watchlist) => dispatch({ type: 'SET_WATCHLIST', payload: watchlist }),
    addToWatchlist: (poolAddress) => dispatch({ type: 'ADD_TO_WATCHLIST', payload: poolAddress }),
    removeFromWatchlist: (poolAddress) =>
      dispatch({ type: 'REMOVE_FROM_WATCHLIST', payload: poolAddress }),
    // Margin/prediction actions
    setQuickTradeState: (s) => dispatch({ type: 'SET_QUICK_TRADE_STATE', payload: s }),
    setActivePrediction: (p) => dispatch({ type: 'SET_ACTIVE_PREDICTION', payload: p }),
    setTimeframe: (tf) => dispatch({ type: 'SET_TIMEFRAME', payload: tf }),
    setLeverage: (lev) => dispatch({ type: 'SET_LEVERAGE', payload: lev }),
    setPredictionMode: (mode) => dispatch({ type: 'SET_PREDICTION_MODE', payload: mode }),
    addRound: (round) => dispatch({ type: 'ADD_ROUND', payload: round }),
    setMarginManager: (id) => dispatch({ type: 'SET_MARGIN_MANAGER', payload: id }),
    setGridOrderId: (id) => dispatch({ type: 'SET_GRID_ORDER_ID', payload: id }),
    setSimulationMode: (mode) => dispatch({ type: 'SET_SIMULATION_MODE', payload: mode }),
    // Computed values
    currentPool,
    currentSignal,
    currentRisk,
    currentSocial,
  }), [state, currentPool, currentSignal, currentRisk, currentSocial]);

  return (
    <SwipeBookContext.Provider value={value}>
      {children}
    </SwipeBookContext.Provider>
  );
}

export function useSwipeBook() {
  const context = useContext(SwipeBookContext);
  if (!context) {
    throw new Error('useSwipeBook must be used within a SwipeBookProvider');
  }
  return context;
}
