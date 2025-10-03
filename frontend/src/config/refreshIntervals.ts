/**
 * Centralized Refresh Intervals Configuration
 * Controls auto-refresh polling intervals for different data types
 */

export const REFRESH_INTERVALS = {
  // Purchases - Most critical, fastest updates (2 seconds)
  PURCHASES: 2000,

  // BOQs - Moderate priority (3 seconds)
  BOQS: 3000,

  // Projects - Slower changing data (5 seconds)
  PROJECTS: 5000,

  // Dashboard Metrics - Least frequent (10 seconds)
  METRICS: 10000,
} as const;

/**
 * Minimum refresh interval to prevent server overload
 */
export const MIN_REFRESH_INTERVAL = 1000; // 1 second

/**
 * Maximum refresh interval
 */
export const MAX_REFRESH_INTERVAL = 60000; // 1 minute

/**
 * Check if refresh interval is valid
 */
export const isValidInterval = (interval: number): boolean => {
  return interval >= MIN_REFRESH_INTERVAL && interval <= MAX_REFRESH_INTERVAL;
};
