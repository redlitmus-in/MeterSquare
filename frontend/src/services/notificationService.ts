import { toast } from 'sonner';
import {
  getSecureUserData,
  isValidInternalUrl,
  sanitizeNotificationData,
  notificationRateLimit,
  getDebugLogger,
  isValidServiceWorkerUrl,
  createSecureNotificationId
} from '@/utils/notificationSecurity';
import { NotificationConfig, getToastDuration, getAutoCloseDuration } from '@/config/notificationConfig';

export interface NotificationData {
  id: string;
  type: 'email' | 'approval' | 'alert' | 'info' | 'success' | 'error' | 'update' | 'reminder';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'procurement' | 'approval' | 'vendor' | 'system' | 'project';
  actionRequired?: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: {
    documentId?: string;
    documentType?: string;
    amount?: number;
    sender?: string;
    project?: string;
    emailId?: string;
    recipient?: string;
    link?: string;
  };
}

class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = 'default';
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private callbacks: Set<(notification: NotificationData) => void> = new Set();

  constructor() {
    this.initializeService();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async initializeService() {
    const debug = getDebugLogger();

    // Check if notifications are supported
    if (!('Notification' in window)) {
      debug.warn('This browser does not support notifications');
      return;
    }

    // Get current permission
    this.permission = Notification.permission;
    debug.info('Notification permission status:', this.permission);

    // Register service worker if supported
    if ('serviceWorker' in navigator) {
      try {
        const swUrl = '/sw.js';
        // Validate service worker URL
        if (isValidServiceWorkerUrl(swUrl)) {
          this.serviceWorkerRegistration = await navigator.serviceWorker.register(swUrl);
          debug.info('Service Worker registered successfully');

          // Wait for service worker to be ready and active
          const registration = await navigator.serviceWorker.ready;
          this.serviceWorkerRegistration = registration;

          // Ensure the service worker is activated
          if (registration.active) {
            debug.info('Service Worker is active and ready');
          } else {
            debug.warn('Service Worker registered but not yet active');
            // Listen for the service worker to become active
            registration.addEventListener('activate', () => {
              debug.info('Service Worker activated');
            });
          }
        } else {
          debug.error('Invalid service worker URL');
        }
      } catch (error) {
        debug.error('Service Worker registration failed:', error);
      }
    }

    // Listen for messages from service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'NOTIFICATION_CLICK') {
          this.handleNotificationClick(event.data.notification);
        }
      });
    }

    // Listen for visibility changes to enhance notifications
    document.addEventListener('visibilitychange', () => {
      debug.info(`Tab visibility changed: ${document.visibilityState}`);
    });

    // Listen for window focus/blur
    window.addEventListener('blur', () => {
      debug.info('Window lost focus');
    });

    window.addEventListener('focus', () => {
      debug.info('Window gained focus');
    });
  }

  async requestPermission(): Promise<NotificationPermission> {
    const debug = getDebugLogger();

    if (!('Notification' in window)) {
      debug.warn('Browser does not support notifications');
      return 'denied';
    }

    if (this.permission === 'granted') {
      return 'granted';
    }

    if (this.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        this.permission = permission;

        if (permission === 'granted') {
          debug.info('Notification permission granted');

          // Show toast only (removed welcome notification to avoid persistent display)
          toast.success('Notifications enabled! You will receive real-time updates.');
        } else if (permission === 'denied') {
          debug.warn('Notification permission denied');
          toast.error('Notifications blocked. You can enable them in browser settings.');
        }

        return permission;
      } catch (error) {
        debug.error('Error requesting notification permission:', error);
        return 'denied';
      }
    }

    return this.permission;
  }

  isPermissionGranted(): boolean {
    return this.permission === 'granted';
  }

  // Send browser/system notification
  async sendBrowserNotification(notification: NotificationData): Promise<void> {
    const debug = getDebugLogger();

    // Sanitize notification data first
    const sanitizedNotification = sanitizeNotificationData(notification);

    // Check rate limiting
    if (!notificationRateLimit.canSend(sanitizedNotification.type)) {
      debug.warn('Notification rate limit exceeded');
      return;
    }

    // Always add to in-app notifications first
    this.notifyCallbacks(sanitizedNotification);

    // Check permission for browser notifications
    if (this.permission !== 'granted') {
      debug.info('Browser notifications not permitted, showing in-app only');
      return;
    }

    try {
      const options: NotificationOptions = {
        body: sanitizedNotification.message, // Already sanitized
        icon: '/assets/logo.png', // MeterSquare ERP logo
        badge: '/assets/logofavi.png',
        tag: sanitizedNotification.id,
        data: sanitizedNotification, // Use sanitized data
        requireInteraction: sanitizedNotification.priority === 'urgent' || sanitizedNotification.priority === 'high',
        silent: sanitizedNotification.priority === 'low',
        timestamp: sanitizedNotification.timestamp instanceof Date
          ? sanitizedNotification.timestamp.getTime()
          : new Date(sanitizedNotification.timestamp).getTime(),
        dir: 'ltr',
        lang: 'en'
      };

      // Add custom notification sound for high priority
      if (sanitizedNotification.priority === 'urgent' || sanitizedNotification.priority === 'high') {
        options.silent = false;
      }

      // Add action buttons based on notification type (only if URL is valid)
      if (sanitizedNotification.actionRequired && sanitizedNotification.actionUrl && isValidInternalUrl(sanitizedNotification.actionUrl)) {
        options.actions = [
          {
            action: 'view',
            title: sanitizedNotification.actionLabel || 'View',
            icon: '/assets/logo.png'
          },
          {
            action: 'dismiss',
            title: 'Dismiss',
            icon: '/assets/logo.png'
          }
        ];
      }

      debug.info('Sending browser notification');

      // Try to use service worker for better handling (works even when tab is closed)
      if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
        debug.info('Using service worker for notification');
        try {
          await this.serviceWorkerRegistration.showNotification(sanitizedNotification.title, options);
        } catch (error) {
          debug.warn('Service worker notification failed, falling back to direct API:', error);
          // Fallback to direct notification if service worker fails
          const browserNotification = new Notification(sanitizedNotification.title, options);
          this.setupDirectNotificationHandlers(browserNotification, sanitizedNotification);
        }
      } else {
        debug.info('Using direct notification API');
        // Fallback to regular notification
        const browserNotification = new Notification(sanitizedNotification.title, options);
        this.setupDirectNotificationHandlers(browserNotification, sanitizedNotification);
      }

      // Update browser tab title with notification badge
      this.updateTabTitle(1);

    } catch (error) {
      debug.error('Failed to send browser notification:', error);
    }
  }

  // Send email notification (triggers when email is sent)
  async sendEmailNotification(emailData: {
    recipient: string;
    subject: string;
    documentType: string;
    documentId: string;
    amount?: number;
    project?: string;
    sender?: string;
  }): Promise<void> {
    const notification: NotificationData = {
      id: `email-${emailData.documentId}-${Date.now()}`,
      type: 'email',
      title: '📧 Email Sent',
      message: `${emailData.subject} sent to ${emailData.recipient}`,
      timestamp: new Date(),
      read: false,
      priority: 'medium',
      category: 'procurement',
      actionRequired: true,
      actionUrl: `/procurement`,
      actionLabel: 'View',
      metadata: {
        documentId: emailData.documentId,
        documentType: emailData.documentType,
        amount: emailData.amount,
        sender: emailData.sender || 'System',
        project: emailData.project,
        recipient: emailData.recipient
      }
    };

    // Send browser notification
    await this.sendBrowserNotification(notification);

    // Show toast notification
    toast.success(`Email sent to ${emailData.recipient}`, {
      description: emailData.subject,
      duration: getToastDuration('default')
    });
  }

  // Send approval notification (with role-based filtering)
  async sendApprovalNotification(approvalData: {
    type: 'received' | 'approved' | 'rejected';
    documentType: string;
    documentId: string;
    amount?: number;
    project?: string;
    sender: string;
    recipient?: string;
    targetRole?: string; // Who should receive this notification
  }): Promise<void> {
    const debug = getDebugLogger();

    // Get current user role securely
    const userData = getSecureUserData();
    const currentUserRole = userData?.role || '';

    debug.info('Processing approval notification', {
      type: approvalData.type,
      targetRole: approvalData.targetRole,
      currentUserRole: currentUserRole
    });

    // Check if this notification is relevant to current user
    if (approvalData.targetRole) {
      const targetRole = approvalData.targetRole.toLowerCase();

      // Only show notification if it's for this user's role
      if (currentUserRole !== targetRole &&
          currentUserRole !== targetRole.replace(/\s+/g, '') &&
          currentUserRole !== targetRole.replace(/\s+/g, '').replace('_', '')) {
        debug.info('Notification filtered: Not for current role');
        return;
      }
      debug.info('Notification passed role filter');
    }

    const typeMap = {
      received: { title: '📋 New Purchase Requisition', priority: 'high' as const, icon: '📋' },
      approved: { title: '✅ Purchase Approved', priority: 'medium' as const, icon: '✅' },
      rejected: { title: '❌ Purchase Rejected', priority: 'high' as const, icon: '❌' }
    };

    const config = typeMap[approvalData.type];

    const notification: NotificationData = {
      id: createSecureNotificationId('approval'),
      type: 'approval',
      title: config.title,
      message: `${approvalData.documentType} ${approvalData.documentId} from ${approvalData.sender}${approvalData.project ? ` (${approvalData.project})` : ''}`,
      timestamp: new Date(),
      read: false,
      priority: config.priority,
      category: 'approval',
      actionRequired: approvalData.type === 'received',
      actionUrl: `/procurement`,
      actionLabel: approvalData.type === 'received' ? 'Review' : 'View',
      metadata: {
        documentId: approvalData.documentId,
        documentType: approvalData.documentType,
        amount: approvalData.amount,
        sender: approvalData.sender,
        project: approvalData.project,
        recipient: approvalData.recipient
      }
    };

    debug.info('Sending approval notification');
    await this.sendBrowserNotification(notification);

    // Show toast with appropriate styling
    const toastMethod = approvalData.type === 'rejected' ? toast.error :
                       approvalData.type === 'approved' ? toast.success : toast.info;

    toastMethod(`${config.icon} ${config.title}`, {
      description: notification.message,
      duration: approvalData.type === 'received' ? getToastDuration('approval') : getToastDuration('default')
    });
  }

  // Send system notification
  async sendSystemNotification(data: {
    type: 'info' | 'success' | 'error' | 'alert';
    title: string;
    message: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<void> {
    const notification: NotificationData = {
      id: `system-${Date.now()}`,
      type: data.type,
      title: data.title,
      message: data.message,
      timestamp: new Date(),
      read: false,
      priority: data.priority || 'medium',
      category: 'system'
    };

    await this.sendBrowserNotification(notification);
  }

  // Setup handlers for direct notification API
  private setupDirectNotificationHandlers(browserNotification: Notification, sanitizedNotification: NotificationData) {
    const debug = getDebugLogger();

    browserNotification.onclick = () => {
      debug.info('Notification clicked');
      this.handleNotificationClick(sanitizedNotification);
      browserNotification.close();
    };

    browserNotification.onshow = () => {
      debug.info('Browser notification shown');
    };

    browserNotification.onerror = (error) => {
      debug.error('Browser notification error:', error);
    };

    // Auto-close after specified time based on priority
    const autoCloseTime = getAutoCloseDuration(sanitizedNotification.priority || 'medium');

    setTimeout(() => {
      browserNotification.close();
    }, autoCloseTime);
  }

  // Handle notification click
  private handleNotificationClick(notification: NotificationData) {
    const debug = getDebugLogger();

    // Focus the window
    if (window.parent) {
      window.parent.focus();
    }
    window.focus();

    // Navigate to action URL if available and valid
    if (notification.actionUrl && isValidInternalUrl(notification.actionUrl)) {
      debug.info('Navigating to notification action URL');
      window.location.href = notification.actionUrl;
    } else if (notification.actionUrl) {
      debug.warn('Invalid action URL blocked');
    }

    // Mark as read
    this.markAsRead(notification.id);
  }

  // Mark notification as read
  markAsRead(notificationId: string) {
    // This will be handled by the notification store
    // Just trigger callbacks for now
    this.callbacks.forEach(callback => {
      // Simulate marking as read - the store will handle the actual state
    });
  }

  // Subscribe to notifications
  subscribe(callback: (notification: NotificationData) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  // Notify all subscribers
  notifyCallbacks(notification: NotificationData) {
    this.callbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Error in notification callback:', error);
      }
    });
  }

  // Update browser tab title with unread count
  updateTabTitle(unreadCount: number) {
    const baseTitle = document.title.includes('MeterSquare ERP')
      ? document.title
      : 'MeterSquare ERP';

    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle.replace(/^\(\d+\)\s/, '');
    }
  }

  // Clear all notifications
  clearAll() {
    // This will be handled by the store
    this.updateTabTitle(0);
  }

  // Get permission status for UI
  getPermissionStatus() {
    return {
      permission: this.permission,
      supported: 'Notification' in window,
      serviceWorkerSupported: 'serviceWorker' in navigator,
      serviceWorkerActive: this.serviceWorkerRegistration?.active ? true : false
    };
  }

  // Test notification function for debugging
  async testNotification(): Promise<void> {
    const debug = getDebugLogger();
    debug.info('Testing browser notification...');

    // Request permission first
    if (!this.isPermissionGranted()) {
      await this.requestPermission();
    }

    if (!this.isPermissionGranted()) {
      debug.warn('Cannot test notification - permission not granted');
      return;
    }

    // Send a test notification
    await this.sendSystemNotification({
      type: 'info',
      title: '🔔 Test Notification',
      message: 'Browser notifications are working correctly!',
      priority: 'medium'
    });

    debug.info('Test notification sent');
  }
}

export const notificationService = NotificationService.getInstance();

// Make test function available globally in development mode for easy testing
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).testNotification = () => notificationService.testNotification();
  (window as any).notificationService = notificationService;
}