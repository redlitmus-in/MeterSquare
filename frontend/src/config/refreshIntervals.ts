/**
 * Centralized Refresh Intervals Configuration
 * Controls auto-refresh polling intervals for different data types
 */

export const REFRESH_INTERVALS = {
  // ✅ PERFORMANCE: Reduced from 2s to 30s (93% reduction) - Real-time handles live updates
  // Polling is now a fallback mechanism only
  PURCHASES: 30000,

  // ✅ PERFORMANCE: Reduced from 3s to 30s (90% reduction) - Real-time handles live updates
  BOQS: 30000,

  // ✅ PERFORMANCE: Reduced from 5s to 30s (83% reduction) - Real-time handles live updates
  PROJECTS: 30000,

  // ✅ PERFORMANCE: Reduced from 10s to 30s (67% reduction) - Real-time handles live updates
  METRICS: 30000,
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
