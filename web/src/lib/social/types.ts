/**
 * Social signals types for community-driven trading insights
 */

/**
 * Combined social signals data for a pool
 */
export interface SocialSignals {
  whaleActivity: WhaleActivity;
  communitySwipes: SwipeConsensus;
  sentiment: SentimentData;
}

/**
 * Whale activity tracking for large holder behavior
 */
export interface WhaleActivity {
  /** Type of whale activity detected */
  type: 'accumulating' | 'distributing' | 'none';
  /** 24-hour trading volume from whale wallets */
  volume24h: number;
  /** Net flow (positive = buying, negative = selling) */
  netFlow: number;
  /** Timestamp of last update */
  lastUpdate: number;
}

/**
 * Community swipe consensus data
 */
export interface SwipeConsensus {
  /** Percentage of bullish swipes (0-100) */
  bullish: number;
  /** Percentage of bearish swipes (0-100) */
  bearish: number;
  /** Total number of swipes recorded */
  total: number;
  /** Current user's swipe direction (if any) */
  userSwipe?: 'bullish' | 'bearish';
}

/**
 * Sentiment analysis data from various sources
 */
export interface SentimentData {
  /** Overall sentiment score (-100 to 100) */
  score: number;
  /** Whether the token is currently trending */
  trending: boolean;
  /** Social volume metric */
  socialVolume: number;
  /** List of data sources */
  sources: string[];
}

/**
 * Stored swipe record for localStorage
 */
export interface StoredSwipe {
  poolAddress: string;
  direction: 'bullish' | 'bearish';
  timestamp: number;
}

/**
 * Consensus storage structure
 */
export interface ConsensusStorage {
  swipes: StoredSwipe[];
  lastUpdated: number;
}
