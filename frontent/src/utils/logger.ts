/**
 * Conditional Logger Utility
 *
 * Provides logging functionality that only executes in development mode.
 * In production, all console statements are no-ops to:
 * - Prevent memory leaks from retained references
 * - Improve performance
 * - Reduce bundle size
 * - Prevent sensitive data leakage
 *
 * Usage:
 *   import { logger } from '@/utils/logger';
 *   logger.log('Debug info');        // Only in dev
 *   logger.error('Error occurred');  // Always (errors should be logged)
 *   logger.warn('Warning');          // Only in dev
 *   logger.info('Info message');     // Only in dev
 *   logger.debug('Debug details');   // Only in dev
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * Log general information (dev only)
   */
  log: isDev ? console.log.bind(console) : (): void => {},

  /**
   * Log errors (always - errors should be visible in production)
   */
  error: console.error.bind(console),

  /**
   * Log warnings (dev only)
   */
  warn: isDev ? console.warn.bind(console) : (): void => {},

  /**
   * Log informational messages (dev only)
   */
  info: isDev ? console.info.bind(console) : (): void => {},

  /**
   * Log debug information (dev only)
   */
  debug: isDev ? console.debug.bind(console) : (): void => {},

  /**
   * Log tables (dev only)
   */
  table: isDev ? console.table.bind(console) : (): void => {},

  /**
   * Group logs together (dev only)
   */
  group: isDev ? console.group.bind(console) : (): void => {},
  groupEnd: isDev ? console.groupEnd.bind(console) : (): void => {},
  groupCollapsed: isDev ? console.groupCollapsed.bind(console) : (): void => {},

  /**
   * Time operations (dev only)
   */
  time: isDev ? console.time.bind(console) : (): void => {},
  timeEnd: isDev ? console.timeEnd.bind(console) : (): void => {},
} as const;

/**
 * Development-only logger
 * Use when you need guaranteed dev-only logging (even for errors)
 */
export const devLogger = {
  log: isDev ? console.log.bind(console) : (): void => {},
  error: isDev ? console.error.bind(console) : (): void => {},
  warn: isDev ? console.warn.bind(console) : (): void => {},
  info: isDev ? console.info.bind(console) : (): void => {},
  debug: isDev ? console.debug.bind(console) : (): void => {},
} as const;

/**
 * Production-safe error logger
 * Use for critical errors that need tracking in production
 * (You can later integrate with error tracking services like Sentry)
 */
export const errorLogger = {
  error: (message: string, error?: Error | unknown, context?: Record<string, unknown>): void => {
    console.error('[ERROR]', message, error);

    // TODO: Integrate with error tracking service (Sentry, LogRocket, etc.)
    // Example:
    // if (!isDev && window.Sentry) {
    //   window.Sentry.captureException(error, { extra: context });
    // }
  },

  warn: (message: string, context?: Record<string, unknown>): void => {
    if (isDev) {
      console.warn('[WARNING]', message, context);
    }

    // TODO: Track warnings in production if needed
  },
} as const;

export default logger;
