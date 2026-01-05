/**
 * Security utilities for notification system
 * Provides sanitization, validation, and rate limiting
 */

import { sanitizeText } from '@/utils/sanitizer';
import { NotificationData } from '@/services/notificationService';
import { NotificationConfig } from '@/config/notificationConfig';

// Use centralized config for all limits
const MAX_NOTIFICATIONS = NotificationConfig.limits.maxNotifications;
const MAX_NOTIFICATION_AGE_DAYS = 30; // Keep this as is for now
const MIN_NOTIFICATION_INTERVAL_MS = NotificationConfig.timing.minNotificationInterval;
const MAX_TITLE_LENGTH = NotificationConfig.limits.maxTitleLength;
const MAX_MESSAGE_LENGTH = NotificationConfig.limits.maxMessageLength;
const MAX_URL_LENGTH = NotificationConfig.limits.maxUrlLength;

/**
 * Rate limiter for notifications
 */
class NotificationRateLimit {
  private lastNotificationTime: Map<string, number> = new Map();
  private readonly minInterval: number = MIN_NOTIFICATION_INTERVAL_MS;

  /**
   * Check if notification can be sent based on rate limits
   */
  canSend(notificationType: string): boolean {
    const now = Date.now();
    const lastTime = this.lastNotificationTime.get(notificationType) || 0;

    if (now - lastTime < this.minInterval) {
      return false;
    }

    this.lastNotificationTime.set(notificationType, now);
    return true;
  }

  /**
   * Reset rate limit for a specific type
   */
  reset(notificationType?: string) {
    if (notificationType) {
      this.lastNotificationTime.delete(notificationType);
    } else {
      this.lastNotificationTime.clear();
    }
  }
}

// Singleton instance of rate limiter
export const notificationRateLimit = new NotificationRateLimit();

/**
 * Securely parse and validate user data from localStorage
 */
export function getSecureUserData(): { role: string; id?: string; userId?: string; name?: string } | null {
  try {
    const userData = localStorage.getItem('user');
    if (!userData) return null;

    // Parse with error handling
    const user = JSON.parse(userData);

    // Validate structure
    if (!user || typeof user !== 'object') return null;

    // Sanitize and validate role
    const role = user.role;
    if (typeof role !== 'string' || role.length === 0 || role.length > 50) {
      return null;
    }

    // Return sanitized data
    // Support both 'id' and 'user_id' field names
    const userId = user.id || user.user_id || user.userId;
    return {
      role: sanitizeText(role.toLowerCase()),
      id: userId ? sanitizeText(String(userId)) : undefined,
      userId: userId ? sanitizeText(String(userId)) : undefined,  // Also include userId for compatibility
      name: user.full_name || user.name ? sanitizeText(user.full_name || user.name) : undefined
    };
  } catch (error) {
    // Log error in development only
    if (import.meta.env.DEV) {
      console.error('Failed to parse user data:', error);
    }
    return null;
  }
}

/**
 * Validate if URL is safe and internal
 */
export function isValidInternalUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.length > MAX_URL_LENGTH) return false;

  try {
    // Handle relative URLs
    if (url.startsWith('/')) {
      return true; // Relative URLs are safe
    }

    // Parse absolute URLs
    const parsed = new URL(url, window.location.origin);

    // Check if same origin
    if (parsed.origin !== window.location.origin) {
      return false;
    }

    // Check for javascript: protocol
    if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize notification data to prevent XSS
 */
export function sanitizeNotificationData(notification: NotificationData): NotificationData {
  return {
    ...notification,
    title: sanitizeText(notification.title).substring(0, MAX_TITLE_LENGTH),
    message: sanitizeText(notification.message).substring(0, MAX_MESSAGE_LENGTH),
    actionUrl: notification.actionUrl && isValidInternalUrl(notification.actionUrl)
      ? notification.actionUrl
      : undefined,
    actionLabel: notification.actionLabel
      ? sanitizeText(notification.actionLabel).substring(0, 50)
      : undefined,
    metadata: notification.metadata ? {
      ...notification.metadata,
      documentId: notification.metadata.documentId
        ? sanitizeText(notification.metadata.documentId).substring(0, 100)
        : undefined,
      documentType: notification.metadata.documentType
        ? sanitizeText(notification.metadata.documentType).substring(0, 50)
        : undefined,
      sender: notification.metadata.sender
        ? sanitizeText(notification.metadata.sender).substring(0, 100)
        : undefined,
      project: notification.metadata.project
        ? sanitizeText(notification.metadata.project).substring(0, 200)
        : undefined,
      recipient: notification.metadata.recipient
        ? sanitizeText(notification.metadata.recipient).substring(0, 100)
        : undefined,
      amount: typeof notification.metadata.amount === 'number'
        ? Math.max(0, Math.min(notification.metadata.amount, Number.MAX_SAFE_INTEGER))
        : undefined
    } : undefined
  };
}

/**
 * Filter old notifications to prevent storage bloat
 */
export function filterOldNotifications(notifications: NotificationData[]): NotificationData[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_NOTIFICATION_AGE_DAYS);

  return notifications
    .filter(n => {
      const notificationDate = n.timestamp instanceof Date
        ? n.timestamp
        : new Date(n.timestamp);
      return notificationDate > cutoffDate;
    })
    .slice(0, MAX_NOTIFICATIONS);
}

/**
 * Validate notification priority
 */
export function isValidPriority(priority: string): priority is NotificationData['priority'] {
  return ['low', 'medium', 'high', 'urgent'].includes(priority);
}

/**
 * Validate notification type
 */
export function isValidType(type: string): type is NotificationData['type'] {
  return ['email', 'approval', 'alert', 'info', 'success', 'error', 'update', 'reminder'].includes(type);
}

/**
 * Validate notification category
 */
export function isValidCategory(category: string): category is NotificationData['category'] {
  return ['procurement', 'approval', 'vendor', 'system', 'project'].includes(category);
}

/**
 * Get safe debug logger that only logs in development
 */
export function getDebugLogger() {
  if (import.meta.env.DEV) {
    return {
      log: (...args: any[]) => console.log(...args),
      warn: (...args: any[]) => console.warn(...args),
      error: (...args: any[]) => console.error(...args),
      info: (...args: any[]) => console.info(...args)
    };
  }

  // No-op in production
  return {
    log: () => {},
    warn: () => {},
    error: () => {},
    info: () => {}
  };
}

/**
 * Validate and sanitize service worker URL
 */
export function isValidServiceWorkerUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  // Only allow specific service worker files
  const allowedPaths = ['/sw.js', '/service-worker.js'];
  return allowedPaths.includes(url);
}

/**
 * Create a secure notification ID
 */
export function createSecureNotificationId(prefix: string = 'notif'): string {
  const sanitizedPrefix = sanitizeText(prefix).substring(0, 20);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${sanitizedPrefix}-${timestamp}-${random}`;
}

/**
 * Validate role name format
 */
export function isValidRole(role: string): boolean {
  if (!role || typeof role !== 'string') return false;
  if (role.length === 0 || role.length > 50) return false;

  // Check for valid role pattern (alphanumeric, spaces, hyphens, underscores)
  const validRolePattern = /^[a-zA-Z0-9\s\-_]+$/;
  return validRolePattern.test(role);
}

// Export singleton rate limiter instance
export const rateLimiter = notificationRateLimit;