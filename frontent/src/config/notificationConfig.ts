/**
 * Centralized Notification Configuration
 * All notification-related constants and settings in one place
 */

export const NotificationConfig = {
  // Notification Limits
  limits: {
    maxNotifications: 100,
    maxTitleLength: 200,
    maxMessageLength: 500,
    maxUrlLength: 2000,
    maxMetadataFieldLength: 100,
    maxProjectNameLength: 200,
  },

  // Timing Configuration (in milliseconds)
  timing: {
    minNotificationInterval: 1000, // 1 second between notifications
    toastDuration: {
      default: 5000,
      approval: 8000,
      error: 6000,
      success: 4000,
    },
    autoCloseDuration: {
      urgent: 30000,  // 30 seconds
      high: 15000,    // 15 seconds
      medium: 10000,  // 10 seconds
      low: 5000,      // 5 seconds
    },
    backgroundCheck: {
      interval: 30000, // 30 seconds
      retryDelay: 5000, // 5 seconds on failure
    },
  },

  // API Endpoints
  api: {
    subscribe: '/api/notifications/subscribe',
    unsubscribe: '/api/notifications/unsubscribe',
    fetch: '/api/notifications',
    markRead: '/api/notifications/read',
    markAllRead: '/api/notifications/read-all',
  },

  // Permission Settings
  permissions: {
    requestDelay: 3000, // Delay before requesting notification permission
    retryLimit: 3,
  },

  // Priority Levels
  priority: {
    urgent: {
      level: 4,
      sound: true,
      vibrate: true,
      requireInteraction: true,
    },
    high: {
      level: 3,
      sound: true,
      vibrate: true,
      requireInteraction: false,
    },
    medium: {
      level: 2,
      sound: false,
      vibrate: false,
      requireInteraction: false,
    },
    low: {
      level: 1,
      sound: false,
      vibrate: false,
      requireInteraction: false,
    },
  },

  // Notification Types Configuration
  types: {
    approval: {
      icon: '✅',
      color: 'green',
      priority: 'high',
    },
    rejection: {
      icon: '❌',
      color: 'red',
      priority: 'high',
    },
    info: {
      icon: 'ℹ️',
      color: 'blue',
      priority: 'medium',
    },
    warning: {
      icon: '⚠️',
      color: 'yellow',
      priority: 'high',
    },
    error: {
      icon: '🚨',
      color: 'red',
      priority: 'urgent',
    },
    success: {
      icon: '✨',
      color: 'green',
      priority: 'medium',
    },
  },

  // Role-based Configuration
  roles: {
    // Define which roles receive which types of notifications
    procurement: {
      receives: ['pr_submitted', 'pr_rejected', 'pr_reapproved', 'vendor_updates'],
      canSend: ['pr_forward', 'pr_reject', 'vendor_request'],
    },
    projectManager: {
      receives: ['pr_forwarded', 'pr_returned', 'vendor_proposals'],
      canSend: ['pr_approve', 'pr_reject', 'vendor_approve'],
    },
    estimation: {
      receives: ['pr_approved_pm', 'cost_verification'],
      canSend: ['pr_approve', 'pr_reject', 'cost_update'],
    },
    technicalDirector: {
      receives: ['pr_approved_estimation', 'final_approval_required'],
      canSend: ['pr_final_approve', 'pr_reject'],
    },
    siteSupervisor: {
      receives: ['pr_status_updates', 'pr_approved', 'pr_rejected'],
      canSend: ['pr_create', 'pr_resubmit'],
    },
    mepSupervisor: {
      receives: ['pr_status_updates', 'pr_approved', 'pr_rejected'],
      canSend: ['pr_create', 'pr_resubmit'],
    },
    accounts: {
      receives: ['payment_required', 'invoice_updates'],
      canSend: ['payment_processed', 'invoice_approved'],
    },
  },

  // Browser Notification Options
  browserNotification: {
    badge: '/assets/logofavi.png',
    icon: '/assets/logo.png',
    tag: 'metersquare-erp',
    renotify: true,
    requireInteraction: false,
    silent: false,
  },

  // Storage Configuration
  storage: {
    persistKey: 'notifications-storage',
    maxStoredNotifications: 100,
    cleanupInterval: 86400000, // 24 hours
    expiryDuration: 604800000, // 7 days
  },

  // Debug Configuration
  debug: {
    enabled: import.meta.env.DEV,
    logLevel: import.meta.env.DEV ? 'verbose' : 'error',
    showTestButtons: import.meta.env.DEV,
  },
};

// Type definitions for type safety
export type NotificationPriority = 'urgent' | 'high' | 'medium' | 'low';
export type NotificationType = keyof typeof NotificationConfig.types;
export type UserRole = keyof typeof NotificationConfig.roles;

// Helper functions
export const getToastDuration = (type: 'default' | 'approval' | 'error' | 'success' = 'default'): number => {
  return NotificationConfig.timing.toastDuration[type];
};

export const getAutoCloseDuration = (priority: NotificationPriority): number => {
  return NotificationConfig.timing.autoCloseDuration[priority];
};

export const getRoleNotificationSettings = (role: UserRole) => {
  return NotificationConfig.roles[role] || { receives: [], canSend: [] };
};

export const getNotificationTypeConfig = (type: NotificationType) => {
  return NotificationConfig.types[type];
};

export const getApiEndpoint = (action: keyof typeof NotificationConfig.api): string => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  return `${baseUrl}${NotificationConfig.api[action]}`;
};