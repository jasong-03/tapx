/**
 * Trading constants shared across quick trade and grid modes
 */

export const TRADING_CONSTANTS = {
  // Stake options (in USDC)
  STAKES: [0.5, 1, 5],

  // Chart grid configuration
  GRID: {
    ROWS: 14,
    COLS: 12,
  },

  // Time windows
  TIME: {
    STEP_MS: 5000,
    HISTORY_WINDOW_MS: 60000,
  },

  // Grid mode specific
  GRID_MODE: {
    INITIAL_PREDICTION_BALANCE: 100,
    DEFAULT_ZOOM: 10,
  },

  // Quick mode specific
  QUICK_MODE: {
    PRICE_STEP_MULTIPLIER: 0.0002,
    DEFAULT_PRICE_STEP: 0.01,
  },

  // Layout
  LAYOUT: {
    TOP_BAR_HEIGHT: '100px',
    TOP_BAR_HEIGHT_SM: '104px',
    BOTTOM_CONTROLS_HEIGHT: '128px',
    BOTTOM_CONTROLS_HEIGHT_SM: '120px',
    BOTTOM_NAV_HEIGHT: '84px',
  },
}

export type StakeValue = number
