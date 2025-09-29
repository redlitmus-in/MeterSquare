/**
 * Enhanced Background Notification Service
 * Handles notifications when app is minimized, in background, or closed
 */

import { NotificationConfig, getApiEndpoint } from '@/config/notificationConfig';
import { notificationMiddleware } from '@/middleware/notificationMiddleware';
import { getSecureUserData } from '@/utils/notificationSecurity';

interface BackgroundNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: Date;
  targetRole?: string;
  targetUserId?: string;
  sender?: string;
  isSenderNotification?: boolean;
  metadata?: any;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

class EnhancedBackgroundNotificationService {
  private static instance: EnhancedBackgroundNotificationService;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private pushSubscription: PushSubscription | null = null;
  private isInitialized = false;
  private authToken: string | null = null;
  private userRole: string | null = null;
  private userId: string | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private visibilityState: DocumentVisibilityState = 'visible';
  private websocket: WebSocket | null = null;
  private retryCount = 0;
  private maxRetries = 5;

  private constructor() {
    this.initialize();
  }

  static getInstance(): EnhancedBackgroundNotificationService {
    if (!EnhancedBackgroundNotificationService.instance) {
      EnhancedBackgroundNotificationService.instance = new EnhancedBackgroundNotificationService();
    }
    return EnhancedBackgroundNotificationService.instance;
  }

  private async initialize() {
    console.log('🔔 Initializing Enhanced Background Notification Service...');

    // Setup visibility listener
    this.setupVisibilityListener();

    // Setup auth listener
    this.setupAuthListener();

    // Initialize service worker
    await this.initializeServiceWorker();

    // Setup WebSocket for real-time notifications
    this.setupWebSocket();

    // Start background check interval
    this.startBackgroundCheck();

    this.isInitialized = true;
    console.log('✅ Background Notification Service initialized');
  }

  /**
   * Initialize and register service worker
   */
  private async initializeServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers not supported');
      return;
    }

    try {
      // Wait for service worker to be ready
      this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
      console.log('Service Worker is ready for background notifications');

      // Setup message listener for service worker communication
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));

      // Setup push subscription
      await this.setupPushSubscription();

      // Register background sync
      await this.registerBackgroundSync();
    } catch (error) {
      console.error('Failed to initialize service worker:', error);
    }
  }

  /**
   * Handle messages from service worker
   */
  private handleServiceWorkerMessage(event: MessageEvent) {
    const { type, data } = event.data;

    switch (type) {
      case 'NOTIFICATION_CLICK':
        this.handleNotificationClick(data);
        break;
      case 'BACKGROUND_NOTIFICATION':
        this.processBackgroundNotification(data);
        break;
      case 'AUTH_REQUEST':
        this.sendAuthToServiceWorker();
        break;
      case 'NOTIFICATION_RECEIVED':
        this.processIncomingNotification(data);
        break;
    }
  }

  /**
   * Setup push subscription for server notifications
   */
  private async setupPushSubscription() {
    if (!this.serviceWorkerRegistration || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return;
    }

    try {
      // Check current subscription
      this.pushSubscription = await this.serviceWorkerRegistration.pushManager.getSubscription();

      if (!this.pushSubscription) {
        // Create new subscription
        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

        if (!vapidPublicKey) {
          console.log('VAPID key not configured, push notifications disabled');
          return;
        }

        const convertedVapidKey = this.urlBase64ToUint8Array(vapidPublicKey);

        this.pushSubscription = await this.serviceWorkerRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });

        console.log('Push subscription created');
        await this.sendSubscriptionToServer(this.pushSubscription);
      } else {
        console.log('Existing push subscription found');
        // Update server with existing subscription
        await this.sendSubscriptionToServer(this.pushSubscription);
      }
    } catch (error) {
      console.error('Failed to setup push subscription:', error);
    }
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Send push subscription to backend
   */
  private async sendSubscriptionToServer(subscription: PushSubscription) {
    if (!this.authToken) {
      console.warn('No auth token, skipping subscription sync');
      return;
    }

    try {
      const response = await fetch(getApiEndpoint('subscribe'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userRole: this.userRole,
          userId: this.userId
        })
      });

      if (response.ok) {
        console.log('✅ Push subscription sent to server');
      } else {
        console.error('Failed to send push subscription:', response.status);
      }
    } catch (error) {
      console.error('Error sending push subscription:', error);
    }
  }

  /**
   * Register background sync for offline support
   */
  private async registerBackgroundSync() {
    if (!this.serviceWorkerRegistration || !('sync' in this.serviceWorkerRegistration)) {
      console.log('Background sync not supported');
      return;
    }

    try {
      await this.serviceWorkerRegistration.sync.register('notification-sync');
      console.log('Background sync registered');
    } catch (error) {
      console.error('Failed to register background sync:', error);
    }
  }

  /**
   * Setup WebSocket connection for real-time notifications
   */
  private setupWebSocket() {
    if (!this.authToken || !this.userId) {
      console.log('No auth, skipping WebSocket setup');
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL;

    if (!wsUrl) {
      console.error('VITE_WS_URL environment variable is not set');
      return;
    }

    try {
      this.websocket = new WebSocket(`${wsUrl}/notifications?token=${this.authToken}&userId=${this.userId}`);

      this.websocket.onopen = () => {
        console.log('✅ WebSocket connected for real-time notifications');
        this.retryCount = 0;
      };

      this.websocket.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          this.processIncomingNotification(notification);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.websocket.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect with exponential backoff
        if (this.retryCount < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
          setTimeout(() => {
            this.retryCount++;
            this.setupWebSocket();
          }, delay);
        }
      };
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }
  }

  /**
   * Process incoming notification from WebSocket or service worker
   */
  private async processIncomingNotification(notification: BackgroundNotification) {
    const userData = getSecureUserData();

    // Check if notification is for current user
    if (notification.targetUserId && notification.targetUserId !== userData?.id) {
      console.log('Notification not for current user, ignoring');
      return;
    }

    // Check if notification is for current role
    if (notification.targetRole && notification.targetRole.toLowerCase() !== userData?.role?.toLowerCase()) {
      console.log('Notification not for current role, ignoring');
      return;
    }

    // Determine if user is sender or receiver
    const isSender = notification.sender === userData?.id || notification.sender === userData?.name;

    // Check if this is explicitly marked as a sender notification
    const isSenderNotification = notification.metadata?.isSenderNotification || notification.isSenderNotification;

    if (isSender && isSenderNotification) {
      // Sender gets both notification storage and toast
      console.log('User is sender, showing sender notification');
      await this.showSenderNotification(notification);
    } else if (!isSender) {
      // Receiver gets full notification
      console.log('User is receiver, showing full notification');
      await this.showReceiverNotification(notification);
    } else {
      // For other cases, show receiver notification
      await this.showReceiverNotification(notification);
    }
  }

  /**
   * Show simple confirmation for sender (deprecated - use showSenderNotification)
   */
  private async showSenderConfirmation(notification: BackgroundNotification) {
    // Only show toast, no browser notification
    await notificationMiddleware.sendSystemNotification(
      'success',
      'Action Confirmed',
      notification.message
    );
  }

  /**
   * Show full notification for sender (stores in DB and shows in notification panel)
   */
  private async showSenderNotification(notification: BackgroundNotification) {
    // Store in IndexedDB for persistence
    await this.storeNotificationInDB(notification);

    // Add to notification store for UI display
    await notificationMiddleware.sendNotification({
      id: notification.id,
      type: notification.type as any,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      timestamp: notification.timestamp,
      metadata: notification.metadata
    });

    // Show toast for immediate feedback
    await notificationMiddleware.sendSystemNotification(
      'success',
      notification.title,
      notification.message
    );
  }

  /**
   * Show full notification for receiver
   */
  private async showReceiverNotification(notification: BackgroundNotification) {
    // Store in IndexedDB for persistence
    await this.storeNotificationInDB(notification);

    // Show browser notification if app is in background
    if (this.visibilityState === 'hidden' || this.visibilityState === 'visible') {
      await this.showBrowserNotification(notification);
    }

    // Add to notification store for UI display
    await notificationMiddleware.sendNotification({
      id: notification.id,
      type: notification.type as any,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      timestamp: notification.timestamp,
      metadata: notification.metadata
    });
  }

  /**
   * Show browser notification
   */
  private async showBrowserNotification(notification: BackgroundNotification) {
    if (!this.serviceWorkerRegistration?.active) {
      // Fallback to basic notification
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/logo.png',
          badge: '/badge.png',
          tag: notification.id,
          requireInteraction: notification.priority === 'urgent' || notification.priority === 'high',
          data: notification
        });
      }
      return;
    }

    // Use service worker for rich notifications
    await this.serviceWorkerRegistration.showNotification(notification.title, {
      body: notification.message,
      icon: '/logo.png',
      badge: '/badge.png',
      tag: notification.id,
      requireInteraction: notification.priority === 'urgent' || notification.priority === 'high',
      data: notification,
      actions: notification.metadata?.actionUrl ? [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ] : []
    });
  }

  /**
   * Store notification in IndexedDB for persistence
   */
  private async storeNotificationInDB(notification: BackgroundNotification) {
    try {
      const db = await this.openDB();
      const tx = db.transaction('notifications', 'readwrite');
      const store = tx.objectStore('notifications');

      // Ensure timestamp is properly serialized and use 0/1 for synced
      const notificationToStore = {
        ...notification,
        timestamp: notification.timestamp instanceof Date
          ? notification.timestamp.toISOString()
          : notification.timestamp,
        synced: 0, // Use 0 instead of false for IndexedDB compatibility
        createdAt: Date.now()
      };

      // Check if notification already exists
      const existingNotif = await store.get(notification.id).catch(() => null);

      if (existingNotif) {
        await store.put(notificationToStore);
        console.log('Notification updated in IndexedDB');
      } else {
        await store.add(notificationToStore);
        console.log('Notification stored in IndexedDB');
      }

      db.close();
    } catch (error) {
      console.error('Failed to store notification:', error);
      // If it's a constraint error, try to update instead
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        try {
          const db = await this.openDB();
          const tx = db.transaction('notifications', 'readwrite');
          const store = tx.objectStore('notifications');

          await store.put({
            ...notification,
            timestamp: notification.timestamp instanceof Date
              ? notification.timestamp.toISOString()
              : notification.timestamp,
            synced: 0, // Use 0 instead of false for IndexedDB compatibility
            createdAt: Date.now()
          });
          console.log('Notification updated after constraint error');
          db.close();
        } catch (updateError) {
          console.error('Failed to update notification:', updateError);
        }
      }
    }
  }

  /**
   * Open IndexedDB
   */
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MeterSquareNotifications', 3); // Increment version to force migration

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        // Create object store if it doesn't exist
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains('notifications')) {
          store = db.createObjectStore('notifications', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('targetRole', 'targetRole', { unique: false });
          store.createIndex('read', 'read', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        } else {
          // Upgrade existing store
          const transaction = (event.target as IDBOpenDBRequest).transaction;
          if (transaction) {
            store = transaction.objectStore('notifications');

            // Add synced index if it doesn't exist
            if (!store.indexNames.contains('synced')) {
              store.createIndex('synced', 'synced', { unique: false });
            }

            // Add other indexes if they don't exist
            if (!store.indexNames.contains('read')) {
              store.createIndex('read', 'read', { unique: false });
            }
            if (!store.indexNames.contains('category')) {
              store.createIndex('category', 'category', { unique: false });
            }

            // For version 3: Migrate boolean synced values to 0/1
            if (oldVersion < 3 && store.objectStoreNames.contains('notifications')) {
              console.log('Migrating synced field from boolean to numeric...');

              // Open a cursor to iterate through all records
              const updateTx = event.target.transaction;
              const updateStore = updateTx.objectStore('notifications');
              const cursorRequest = updateStore.openCursor();

              cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                  const record = cursor.value;

                  // Convert boolean synced to numeric
                  if (typeof record.synced === 'boolean') {
                    record.synced = record.synced ? 1 : 0;
                    cursor.update(record);
                  }

                  cursor.continue();
                }
              };

              console.log('Database upgraded to version 3: synced field now uses 0/1');
            }
          }
        }
      };
    });
  }

  /**
   * Setup visibility change listener
   */
  private setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      this.visibilityState = document.visibilityState;

      if (document.visibilityState === 'visible') {
        console.log('App became visible, checking for missed notifications');
        this.checkForMissedNotifications();
      } else {
        console.log('App became hidden, background mode active');
        this.enableBackgroundMode();
      }
    });

    // Also listen for window focus/blur
    window.addEventListener('focus', () => {
      console.log('Window gained focus');
      this.checkForMissedNotifications();
    });

    window.addEventListener('blur', () => {
      console.log('Window lost focus');
      this.enableBackgroundMode();
    });
  }

  /**
   * Setup auth listener
   */
  private setupAuthListener() {
    // Listen for storage changes (login/logout)
    window.addEventListener('storage', (event) => {
      if (event.key === 'access_token') {
        this.updateCredentials(event.newValue, this.userRole, this.userId);
      }
    });

    // Get initial auth state
    this.authToken = localStorage.getItem('access_token');
    const userData = getSecureUserData();
    this.userRole = userData?.role || null;
    this.userId = userData?.id || null;
  }

  /**
   * Update credentials
   */
  updateCredentials(token: string | null, role: string | null, userId: string | null) {
    this.authToken = token;
    this.userRole = role;
    this.userId = userId;

    if (token && userId) {
      // Reconnect WebSocket with new credentials
      if (this.websocket) {
        this.websocket.close();
      }
      this.setupWebSocket();

      // Update push subscription
      if (this.pushSubscription) {
        this.sendSubscriptionToServer(this.pushSubscription);
      }
    } else {
      // Clear connections on logout
      if (this.websocket) {
        this.websocket.close();
        this.websocket = null;
      }
    }

    // Send auth data to service worker
    this.sendAuthToServiceWorker();
  }

  /**
   * Send auth data to service worker
   */
  private async sendAuthToServiceWorker() {
    if (!this.serviceWorkerRegistration?.active) return;

    this.serviceWorkerRegistration.active.postMessage({
      type: 'AUTH_UPDATE',
      authToken: this.authToken,
      userRole: this.userRole,
      userId: this.userId
    });
  }

  /**
   * Start background check interval
   */
  private startBackgroundCheck() {
    // Clear existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Start new interval
    this.checkInterval = setInterval(() => {
      if (this.visibilityState === 'hidden') {
        this.checkForNotifications();
      }
    }, NotificationConfig.timing.backgroundCheck.interval);
  }

  /**
   * Check for notifications from server
   */
  private async checkForNotifications() {
    if (!this.authToken || !this.userId) return;

    try {
      const response = await fetch(getApiEndpoint('fetch'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.ok) {
        const notifications = await response.json();

        for (const notification of notifications) {
          await this.processIncomingNotification(notification);
        }
      }
    } catch (error) {
      console.error('Failed to check for notifications:', error);
    }
  }

  /**
   * Check for missed notifications when app becomes visible
   */
  private async checkForMissedNotifications() {
    console.log('Checking for missed notifications...');

    // Check server for new notifications
    await this.checkForNotifications();

    // Check IndexedDB for unsynced notifications
    await this.syncOfflineNotifications();
  }

  /**
   * Enable background mode
   */
  private enableBackgroundMode() {
    // Tell service worker to enable background checks
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage({
        type: 'ENABLE_BACKGROUND_MODE'
      });
    }
  }

  /**
   * Sync offline notifications
   */
  private async syncOfflineNotifications() {
    try {
      // First check if IndexedDB is available
      if (!('indexedDB' in window)) {
        console.log('IndexedDB not available');
        return;
      }

      const db = await this.openDB();

      // Check if notifications store exists
      if (!db.objectStoreNames.contains('notifications')) {
        console.log('Notifications store not found');
        db.close();
        return;
      }

      const tx = db.transaction('notifications', 'readonly');
      const store = tx.objectStore('notifications');

      // Try to get all notifications first, regardless of sync status
      let unsyncedNotifications: any[] = [];

      try {
        // Get all notifications and filter for unsynced ones
        // This approach handles both boolean (false) and numeric (0) values
        const allNotifications = await new Promise<any[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });

        // Filter for unsynced notifications - handle both false and 0 values
        unsyncedNotifications = allNotifications.filter(n => {
          // Check for unsynced notifications (synced can be false, 0, or undefined)
          return !n.synced || n.synced === 0 || n.synced === false;
        });

        console.log(`Found ${unsyncedNotifications.length} unsynced notifications out of ${allNotifications.length} total`);
      } catch (indexError) {
        console.log('Error accessing notifications:', indexError);
        unsyncedNotifications = [];
      }

      // Process unsynced notifications with proper data validation
      for (const notificationData of unsyncedNotifications) {
        try {
          // Clean up the notification data before processing
          const notification: BackgroundNotification = {
            id: notificationData.id || `notification-${Date.now()}-${Math.random()}`,
            type: notificationData.type || 'info',
            title: notificationData.title || 'Notification',
            message: notificationData.message || '',
            timestamp: notificationData.timestamp ? new Date(notificationData.timestamp) : new Date(),
            targetRole: notificationData.targetRole,
            targetUserId: notificationData.targetUserId,
            sender: notificationData.sender,
            metadata: notificationData.metadata,
            priority: notificationData.priority || 'medium'
          };

          // Only process valid notifications
          if (notification.id && notification.type && notification.title) {
            await this.processIncomingNotification(notification);
          }
        } catch (notifError) {
          console.error('Failed to process individual notification:', notifError);
        }
      }

      // Close the database connection
      db.close();
    } catch (error) {
      console.error('Failed to sync offline notifications:', error);
    }
  }

  /**
   * Handle notification click
   */
  private handleNotificationClick(notification: BackgroundNotification) {
    // Focus the window
    if (window.parent) {
      window.parent.focus();
    }
    window.focus();

    // Navigate to action URL if available
    if (notification.metadata?.actionUrl) {
      window.location.href = notification.metadata.actionUrl;
    }
  }

  /**
   * Process background notification from service worker
   */
  private processBackgroundNotification(notification: BackgroundNotification) {
    // Process the notification as if it came from WebSocket
    this.processIncomingNotification(notification);
  }

  /**
   * Test background notification
   */
  async testBackgroundNotification() {
    const testNotification: BackgroundNotification = {
      id: `test-${Date.now()}`,
      type: 'info',
      title: '🔔 Background Notification Test',
      message: 'This notification works when app is in background!',
      timestamp: new Date(),
      priority: 'high',
      metadata: {
        actionUrl: '/procurement'
      }
    };

    await this.processIncomingNotification(testNotification);
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }
}

// Export singleton instance
export const backgroundNotificationService = EnhancedBackgroundNotificationService.getInstance();

// Make available globally for testing
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).backgroundNotificationService = backgroundNotificationService;
  (window as any).testBackgroundNotification = () => backgroundNotificationService.testBackgroundNotification();
}