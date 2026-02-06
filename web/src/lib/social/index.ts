/**
 * Social features module barrel export
 */

// Types
export type {
  SocialSignals,
  WhaleActivity,
  SwipeConsensus,
  SentimentData,
  StoredSwipe,
  ConsensusStorage,
} from './types';

// Consensus functions
export {
  CONSENSUS_KEY,
  recordSwipe,
  getConsensus,
  getConsensusStrength,
  getDominantDirection,
  clearConsensusData,
} from './consensus';

// Whale tracking functions
export {
  getWhaleActivity,
  classifyWhaleActivity,
  formatWhaleVolume,
  getWhaleActivityLabel,
  getWhaleActivityColor,
} from './whaleTracking';
