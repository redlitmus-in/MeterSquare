/**
 * Centralized Notification Middleware
 * Single entry point for all notification operations
 */

import { toast } from 'sonner';
import {
  NotificationConfig,
  NotificationPriority,
  NotificationType,
  getToastDuration,
  getAutoCloseDuration,
  getNotificationTypeConfig,
  getRoleNotificationSettings,
  UserRole
} from '@/config/notificationConfig';
import { useNotificationStore } from '@/store/notificationStore';
import { getSecureUserData } from '@/utils/notificationSecurity';
import { navigateTo } from '@/utils/navigationService';

// Notification data interface
export interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  timestamp?: Date;
  isSenderNotification?: boolean;
  targetUserId?: string;
  targetRole?: string;
  metadata?: {
    documentId?: string;
    workflowStep?: string;
    sender?: string;
    senderId?: string;
    recipient?: string;
    recipientId?: string;
    project?: string;
    reason?: string;
    actionUrl?: string;
  };
}

// Purchase Request specific data
export interface PRNotificationData {
  documentId: string;
  projectName?: string;
  submittedBy?: string;
  currentStep?: string;
  nextRole?: string;
  rejectedBy?: string;
  reapprovedBy?: string;
  reason?: string;
  amount?: number;
}

// Global set to track processed notification IDs across all notification systems
// This prevents duplicate notifications when both realtimeNotificationHub and notificationMiddleware
// receive the same notification
const globalProcessedNotificationIds = new Set<string>();

// Export for use by other notification systems
export function isNotificationAlreadyProcessed(notificationId: string): boolean {
  return globalProcessedNotificationIds.has(notificationId);
}

export function markNotificationAsProcessed(notificationId: string): void {
  globalProcessedNotificationIds.add(notificationId);
  // Clean up old IDs (keep last 100)
  if (globalProcessedNotificationIds.size > 100) {
    const ids = Array.from(globalProcessedNotificationIds);
    globalProcessedNotificationIds.clear();
    ids.slice(-50).forEach(id => globalProcessedNotificationIds.add(id));
  }
}

class NotificationMiddleware {
  private static instance: NotificationMiddleware;
  private lastNotificationTime: number = 0;
  private notificationQueue: NotificationData[] = [];
  private isProcessingQueue: boolean = false;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  private constructor() {
    this.initialize();
  }

  static getInstance(): NotificationMiddleware {
    if (!NotificationMiddleware.instance) {
      NotificationMiddleware.instance = new NotificationMiddleware();
    }
    return NotificationMiddleware.instance;
  }

  private async initialize() {
    console.log('🔧 Initializing NotificationMiddleware...');

    // Get service worker registration if available
    if ('serviceWorker' in navigator) {
      try {
        console.log('Waiting for service worker to be ready...');
        this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
        console.log('✅ Service worker is ready:', {
          active: !!this.serviceWorkerRegistration.active,
          waiting: !!this.serviceWorkerRegistration.waiting,
          installing: !!this.serviceWorkerRegistration.installing
        });
      } catch (error) {
        console.warn('⚠️ Service worker not available:', error);
      }
    } else {
      console.warn('⚠️ ServiceWorker API not supported in this browser');
    }

    // Check and log notification permission status
    if ('Notification' in window) {
      console.log('📋 Notification permission status:', Notification.permission);
      if (Notification.permission === 'default') {
        console.log('ℹ️ Notifications not yet requested. Call requestNotificationPermission() to enable.');
      } else if (Notification.permission === 'denied') {
        console.warn('❌ Notifications are blocked. User needs to enable in browser settings.');
      } else {
        console.log('✅ Notifications are enabled');
      }
    } else {
      console.warn('⚠️ Notification API not supported in this browser');
    }
  }

  /**
   * Main notification sending method
   */
  async sendNotification(data: NotificationData): Promise<void> {
    // Apply rate limiting
    if (!this.checkRateLimit()) {
      console.warn('Notification rate limit exceeded, queueing notification');
      this.notificationQueue.push(data);
      this.processQueue();
      return;
    }

    // NOTE: Removed role permission check here
    // Incoming notifications from backend should always be displayed
    // The backend already validates who should receive notifications

    // Sanitize and validate notification data
    const sanitizedData = this.sanitizeNotificationData(data);

    // Deduplicate notifications
    if (this.isDuplicate(sanitizedData)) {
      console.warn('Duplicate notification detected, skipping');
      return;
    }

    // Send the notification through appropriate channel
    await this.dispatchNotification(sanitizedData);

    // Update last notification time
    this.lastNotificationTime = Date.now();
  }

  /**
   * Purchase Request specific notifications
   */
  async sendPRNotification(type: 'submitted' | 'approved' | 'rejected' | 'reapproved' | 'forwarded', prData: PRNotificationData): Promise<void> {
    const typeConfig = this.getPRNotificationType(type);
    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;

    // Determine sender information
    const senderName = prData.submittedBy || prData.rejectedBy || prData.reapprovedBy || userData?.name;
    const senderId = currentUserId;

    // Create notification for the receiver (next role)
    const receiverNotification: NotificationData = {
      id: `pr-${prData.documentId}-receiver-${Date.now()}`,
      type: typeConfig.type,
      title: this.getPRNotificationTitle(type, prData),
      message: this.getPRNotificationMessage(type, prData),
      priority: typeConfig.priority,
      timestamp: new Date(),
      isSenderNotification: false,
      targetRole: prData.nextRole,
      metadata: {
        documentId: prData.documentId,
        project: prData.projectName,
        sender: senderName,
        senderId: senderId,
        recipient: prData.nextRole,
        workflowStep: prData.currentStep,
        reason: prData.reason,
        actionUrl: `/procurement/purchase/${prData.documentId}`
      }
    };

    // Send notification to receiver via background service
    await this.sendToBackgroundService(receiverNotification);

    // Also create a notification for the sender to see in their notification list
    const senderNotification: NotificationData = {
      id: `pr-${prData.documentId}-sender-${Date.now()}`,
      type: 'success' as NotificationType,
      title: this.getSenderNotificationTitle(type, prData),
      message: this.getSenderConfirmationMessage(type, prData),
      priority: 'medium',
      timestamp: new Date(),
      isSenderNotification: true,
      targetUserId: currentUserId,
      metadata: {
        documentId: prData.documentId,
        project: prData.projectName,
        sender: senderName,
        senderId: senderId,
        workflowStep: prData.currentStep,
        actionUrl: `/procurement/purchase/${prData.documentId}`
      }
    };

    // Send sender notification to background service so it appears in notification list
    await this.sendToBackgroundService(senderNotification);

    // NOTE: No toast here - the component that calls sendPRNotification
    // should show its own toast for immediate feedback
  }

  /**
   * System notifications (info, warning, error, success)
   */
  async sendSystemNotification(type: 'info' | 'warning' | 'error' | 'success', title: string, message: string): Promise<void> {
    const notification: NotificationData = {
      id: `system-${Date.now()}`,
      type: type as NotificationType,
      title,
      message,
      priority: type === 'error' ? 'urgent' : type === 'warning' ? 'high' : 'medium',
      timestamp: new Date()
    };

    await this.sendNotification(notification);
  }

  /**
   * Email notification trigger
   */
  async notifyEmailSent(recipient: string, subject: string, documentId?: string): Promise<void> {
    const notification: NotificationData = {
      id: `email-${Date.now()}`,
      type: 'info',
      title: 'Email Notification Sent',
      message: `Email sent to ${recipient}: ${subject}`,
      priority: 'low',
      timestamp: new Date(),
      metadata: {
        recipient,
        documentId
      }
    };

    // Only show as toast, don't persist
    this.showToast(notification);
  }

  /**
   * Private helper methods
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const minInterval = NotificationConfig.timing.minNotificationInterval;
    return (now - this.lastNotificationTime) >= minInterval;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.notificationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.notificationQueue.length > 0) {
      if (this.checkRateLimit()) {
        const notification = this.notificationQueue.shift();
        if (notification) {
          await this.dispatchNotification(notification);
          this.lastNotificationTime = Date.now();
        }
      }
      await new Promise(resolve => setTimeout(resolve, NotificationConfig.timing.minNotificationInterval));
    }

    this.isProcessingQueue = false;
  }

  private getCurrentUserRole(): UserRole | null {
    const userData = getSecureUserData();
    if (!userData?.role) return null;

    // Normalize role name
    const role = userData.role.toLowerCase().replace(/[\s-_]/g, '');
    const roleMap: Record<string, UserRole> = {
      'procurement': 'procurement',
      'projectmanager': 'projectManager',
      'estimation': 'estimation',
      'technicaldirector': 'technicalDirector',
      'sitesupervisor': 'siteSupervisor',
      'mepsupervisor': 'mepSupervisor',
      'accounts': 'accounts'
    };

    return roleMap[role] as UserRole || null;
  }

  private canSendNotification(role: UserRole | null, type: NotificationType): boolean {
    if (!role) return false;

    // System notifications are always allowed
    if (['info', 'warning', 'error', 'success'].includes(type)) {
      return true;
    }

    const roleSettings = getRoleNotificationSettings(role);
    // For now, allow all notification types for configured roles
    return roleSettings.canSend.length > 0;
  }

  private sanitizeNotificationData(data: NotificationData): NotificationData {
    const { limits } = NotificationConfig;

    return {
      ...data,
      id: data.id || `notif-${Date.now()}`,
      title: data.title.substring(0, limits.maxTitleLength),
      message: data.message.substring(0, limits.maxMessageLength),
      priority: data.priority || 'medium',
      timestamp: data.timestamp || new Date(),
      metadata: data.metadata ? {
        ...data.metadata,
        documentId: data.metadata.documentId?.substring(0, limits.maxMetadataFieldLength),
        sender: data.metadata.sender?.substring(0, limits.maxMetadataFieldLength),
        recipient: data.metadata.recipient?.substring(0, limits.maxMetadataFieldLength),
        project: data.metadata.project?.substring(0, limits.maxProjectNameLength),
        actionUrl: data.metadata.actionUrl?.substring(0, limits.maxUrlLength)
      } : undefined
    };
  }

  private isDuplicate(notification: NotificationData): boolean {
    const store = useNotificationStore.getState();
    const recentNotifications = store.notifications.slice(0, 10);

    return recentNotifications.some(recent =>
      recent.title === notification.title &&
      recent.message === notification.message &&
      (Date.now() - new Date(recent.timestamp).getTime()) < 5000
    );
  }

  private async dispatchNotification(notification: NotificationData): Promise<void> {
    // Check global deduplication first - prevents duplicate popups when both
    // realtimeNotificationHub and notificationMiddleware receive the same notification
    if (isNotificationAlreadyProcessed(notification.id)) {
      if (import.meta.env.DEV) {
        console.log('[NotificationMiddleware] Skipping duplicate notification:', notification.id);
      }
      return;
    }
    markNotificationAsProcessed(notification.id);

    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;

    // Check if current user is the sender
    const isSender = notification.metadata?.senderId === currentUserId ||
                    notification.isSenderNotification === true;

    if (import.meta.env.DEV) {
      console.log('📨 Dispatching notification:', {
        notificationId: notification.id,
        isSender,
        currentUserId,
        targetRole: notification.targetRole,
        priority: notification.priority
      });
    }

    if (isSender) {
      // Sender already gets toast from the component that performs the action
      // No additional toast needed here - would be duplicate
      if (import.meta.env.DEV) {
        console.log('[NotificationMiddleware] Sender action confirmed (no toast - component handles it)');
      }
    } else {
      // Receiver gets notification experience:
      // 1. Add to panel (store)
      // 2. Based on page visibility: BOTH notifications or just in-app

      // Add to store (shows in notification panel + badge)
      const store = useNotificationStore.getState();
      store.addNotification(notification);

      // Check if page is visible or hidden/minimized
      const isPageHidden = document.hidden || document.visibilityState === 'hidden';

      if (import.meta.env.DEV) {
        console.log('[NotificationMiddleware] Page visibility:', { isPageHidden, hidden: document.hidden, visibilityState: document.visibilityState });
      }

      if (isPageHidden) {
        // Page is HIDDEN/MINIMIZED: Show BOTH desktop AND in-app notification
        // Desktop notification alerts the user, in-app notification is ready when they return
        if (import.meta.env.DEV) {
          console.log('[NotificationMiddleware] Page hidden - showing BOTH desktop and in-app notification');
        }
        const hasPermission = await this.hasNotificationPermission();
        if (hasPermission) {
          await this.showBrowserNotification(notification);
        }
        this.showIncomingNotificationPopup(notification);
      } else {
        // Page is VISIBLE: Show in-app notification popup only (no desktop)
        if (import.meta.env.DEV) {
          console.log('[NotificationMiddleware] Page visible - showing ONLY in-app notification');
        }
        this.showIncomingNotificationPopup(notification);
      }

      // Send to background service for persistence
      await this.sendToBackgroundService(notification);
    }
  }

  /**
   * Send notification to background service
   */
  private async sendToBackgroundService(notification: NotificationData): Promise<void> {
    // Send to service worker for background handling
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'NOTIFICATION_RECEIVED',
        data: notification
      });
    }
  }

  /**
   * Get sender confirmation message
   */
  private getSenderConfirmationMessage(type: string, prData: PRNotificationData): string {
    const messages: Record<string, string> = {
      'submitted': `PR ${prData.documentId} submitted successfully`,
      'approved': `PR ${prData.documentId} approved and forwarded`,
      'rejected': `PR ${prData.documentId} rejection sent`,
      'reapproved': `PR ${prData.documentId} reapproved and forwarded`,
      'forwarded': `PR ${prData.documentId} forwarded to ${prData.nextRole}`
    };
    return messages[type] || `PR ${prData.documentId} action completed`;
  }

  /**
   * Show in-app notification popup for INCOMING notifications
   * This is styled DIFFERENTLY from action toasts (success/error)
   */
  private showIncomingNotificationPopup(notification: NotificationData): void {
    // Determine icon based on notification type
    const getIcon = () => {
      switch (notification.type) {
        case 'approval':
        case 'success':
          return '✅';
        case 'rejection':
        case 'error':
          return '❌';
        case 'warning':
        case 'alert':
          return '⚠️';
        case 'assignment':
          return '📋';
        default:
          return '🔔';
      }
    };

    // Format sender info if available
    const senderInfo = notification.metadata?.sender
      ? `From: ${notification.metadata.sender}`
      : '';

    // Use toast.message() for incoming notifications - different from success/error
    toast.message(`${getIcon()} ${notification.title}`, {
      description: `${notification.message}${senderInfo ? `\n${senderInfo}` : ''}`,
      duration: notification.priority === 'urgent' || notification.priority === 'high' ? 8000 : 5000,
      action: notification.metadata?.actionUrl ? {
        label: 'View',
        onClick: () => navigateTo(notification.metadata!.actionUrl!)
      } : undefined
    });
  }

  private showToast(notification: NotificationData): void {
    const typeConfig = getNotificationTypeConfig(notification.type);
    const duration = getToastDuration(
      notification.type === 'approval' || notification.type === 'rejection' ? 'approval' :
      notification.type === 'error' ? 'error' :
      notification.type === 'success' ? 'success' : 'default'
    );

    const toastMethod =
      notification.type === 'error' ? toast.error :
      notification.type === 'success' ? toast.success :
      notification.type === 'warning' ? toast.warning :
      toast;

    toastMethod(notification.title, {
      description: notification.message,
      duration,
      action: notification.metadata?.actionUrl ? {
        label: 'View',
        onClick: () => navigateTo(notification.metadata!.actionUrl!)
      } : undefined
    });
  }

  private async hasNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }

  private async showBrowserNotification(notification: NotificationData): Promise<void> {
    // Only show desktop notification when tab is NOT active/visible
    // If user is looking at the app, they'll see the in-app toast
    const isTabVisible = document.visibilityState === 'visible' && document.hasFocus();
    if (isTabVisible) {
      console.log('🔔 Skipping browser notification - tab is visible/focused');
      return;
    }

    console.log('🔔 Attempting to show browser notification:', {
      title: notification.title,
      permission: Notification.permission,
      hasServiceWorker: !!this.serviceWorkerRegistration,
      serviceWorkerActive: !!this.serviceWorkerRegistration?.active
    });

    try {
      if (this.serviceWorkerRegistration?.active) {
        console.log('Using service worker for notification');
        // Use service worker for rich notifications
        await this.serviceWorkerRegistration.showNotification(notification.title, {
          body: notification.message,
          icon: NotificationConfig.browserNotification.icon,
          badge: NotificationConfig.browserNotification.badge,
          tag: `${NotificationConfig.browserNotification.tag}-${notification.id}`,
          requireInteraction: notification.priority === 'urgent' || notification.priority === 'high',
          silent: false,
          vibrate: [200, 100, 200],
          data: notification.metadata,
          actions: notification.metadata?.actionUrl ? [
            { action: 'view', title: 'View', icon: NotificationConfig.browserNotification.icon }
          ] : []
        });
        console.log('✅ Browser notification shown via service worker');
      } else {
        console.log('Fallback to direct Notification API');
        // Fallback to basic notification
        const browserNotif = new Notification(notification.title, {
          body: notification.message,
          icon: NotificationConfig.browserNotification.icon,
          badge: NotificationConfig.browserNotification.badge,
          tag: `${NotificationConfig.browserNotification.tag}-${notification.id}`,
          requireInteraction: notification.priority === 'urgent' || notification.priority === 'high',
          silent: false
        });

        // Add click handler - use SPA navigation to avoid page reload
        browserNotif.onclick = () => {
          window.focus();
          if (notification.metadata?.actionUrl) {
            navigateTo(notification.metadata.actionUrl);
          }
          browserNotif.close();
        };

        console.log('✅ Browser notification shown via direct API');
      }
    } catch (error) {
      console.error('❌ Failed to show browser notification:', error);
      console.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }

  private getPRNotificationType(type: string): { type: NotificationType, priority: NotificationPriority } {
    const typeMap: Record<string, { type: NotificationType, priority: NotificationPriority }> = {
      'submitted': { type: 'info', priority: 'high' },
      'approved': { type: 'approval', priority: 'high' },
      'rejected': { type: 'rejection', priority: 'high' },
      'reapproved': { type: 'approval', priority: 'high' },
      'forwarded': { type: 'info', priority: 'medium' }
    };
    return typeMap[type] || { type: 'info', priority: 'medium' };
  }

  private getPRNotificationTitle(type: string, prData: PRNotificationData): string {
    const titles: Record<string, string> = {
      'submitted': `New Purchase Request: ${prData.documentId}`,
      'approved': `PR Approved: ${prData.documentId}`,
      'rejected': `PR Rejected: ${prData.documentId}`,
      'reapproved': `PR Reapproved: ${prData.documentId}`,
      'forwarded': `PR Forwarded: ${prData.documentId}`
    };
    return titles[type] || `Purchase Request Update: ${prData.documentId}`;
  }

  private getSenderNotificationTitle(type: string, prData: PRNotificationData): string {
    const titles: Record<string, string> = {
      'submitted': `✅ PR Submitted Successfully`,
      'approved': `✅ You Approved PR ${prData.documentId}`,
      'rejected': `❌ You Rejected PR ${prData.documentId}`,
      'reapproved': `✅ You Reapproved PR ${prData.documentId}`,
      'forwarded': `➡️ You Forwarded PR ${prData.documentId}`
    };
    return titles[type] || `PR Action Completed: ${prData.documentId}`;
  }

  private getPRNotificationMessage(type: string, prData: PRNotificationData): string {
    switch(type) {
      case 'submitted':
        return `Submitted by ${prData.submittedBy || 'User'} for ${prData.projectName || 'Project'}`;
      case 'approved':
        return `Approved and forwarded to ${prData.nextRole || 'next step'}`;
      case 'rejected':
        return `Rejected by ${prData.rejectedBy || 'approver'}${prData.reason ? `: ${prData.reason}` : ''}`;
      case 'reapproved':
        return `Reapproved by ${prData.reapprovedBy || 'approver'} and sent to ${prData.nextRole || 'next step'}`;
      case 'forwarded':
        return `Forwarded to ${prData.nextRole || 'next approver'} for review`;
      default:
        return `Status updated for ${prData.projectName || 'project'}`;
    }
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Send a welcome notification
        await this.sendSystemNotification('success', 'Notifications Enabled', 'You will now receive real-time updates');
      }
      return permission;
    }

    return 'denied';
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    const store = useNotificationStore.getState();
    store.clearAll();
    this.notificationQueue = [];
  }

  /**
   * Test browser notification directly
   */
  async testBrowserNotification(): Promise<void> {
    console.log('🧪 Testing browser notification directly...');
    console.log('Current permission:', Notification.permission);

    // First ensure we have permission
    if (Notification.permission === 'default') {
      console.log('Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('Permission result:', permission);
      if (permission !== 'granted') {
        console.error('❌ Permission denied by user');
        return;
      }
    } else if (Notification.permission === 'denied') {
      console.error('❌ Notifications are blocked. Please enable in browser settings.');
      return;
    }

    try {
      // Test 1: Direct Notification API
      console.log('Test 1: Direct Notification API');
      const directNotif = new Notification('🔔 Direct Browser Notification Test', {
        body: 'This is a direct browser notification without service worker',
        icon: '/logo.png',
        badge: '/logo.png',
        requireInteraction: false,
        silent: false
      });

      directNotif.onclick = () => {
        console.log('Direct notification clicked');
        directNotif.close();
      };

      console.log('✅ Direct notification created');

      // Test 2: Service Worker notification (if available)
      if (this.serviceWorkerRegistration?.active) {
        console.log('Test 2: Service Worker notification');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        await this.serviceWorkerRegistration.showNotification('📢 Service Worker Notification Test', {
          body: 'This notification is shown via Service Worker',
          icon: '/logo.png',
          badge: '/logo.png',
          requireInteraction: true,
          vibrate: [200, 100, 200],
          actions: [
            { action: 'view', title: 'Open App', icon: '/logo.png' },
            { action: 'dismiss', title: 'Dismiss', icon: '/logo.png' }
          ]
        });
        console.log('✅ Service worker notification shown');
      } else {
        console.warn('⚠️ Service worker not available for testing');
      }

      // Test 3: Through middleware system
      console.log('Test 3: Through middleware system (after 4 seconds)');
      await new Promise(resolve => setTimeout(resolve, 4000));

      await this.sendSystemNotification('success', '🎉 Middleware Notification Test', 'This notification goes through the full middleware system');
      console.log('✅ Middleware notification sent');

    } catch (error) {
      console.error('❌ Test failed:', error);
      console.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId: string): void {
    const store = useNotificationStore.getState();
    store.markAsRead(notificationId);
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    const store = useNotificationStore.getState();
    store.markAllAsRead();
  }
}

// Export singleton instance
export const notificationMiddleware = NotificationMiddleware.getInstance();

// Export convenience methods
export const sendNotification = (data: NotificationData) => notificationMiddleware.sendNotification(data);
export const sendPRNotification = (type: 'submitted' | 'approved' | 'rejected' | 'reapproved' | 'forwarded', prData: PRNotificationData) =>
  notificationMiddleware.sendPRNotification(type, prData);
export const sendSystemNotification = (type: 'info' | 'warning' | 'error' | 'success', title: string, message: string) =>
  notificationMiddleware.sendSystemNotification(type, title, message);
export const notifyEmailSent = (recipient: string, subject: string, documentId?: string) =>
  notificationMiddleware.notifyEmailSent(recipient, subject, documentId);
export const requestNotificationPermission = () => notificationMiddleware.requestPermission();

// Make test function available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).testBrowserNotification = () => notificationMiddleware.testBrowserNotification();
  (window as any).notificationMiddleware = notificationMiddleware;
  console.log('💡 Browser notification test available. Run: testBrowserNotification()');
}
export const clearAllNotifications = () => notificationMiddleware.clearAll();
export const markNotificationAsRead = (id: string) => notificationMiddleware.markAsRead(id);
export const markAllNotificationsAsRead = () => notificationMiddleware.markAllAsRead();