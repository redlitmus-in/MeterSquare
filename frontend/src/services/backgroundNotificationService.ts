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
    this.setupVisibilityListener();
    this.setupAuthListener();
    await this.initializeServiceWorker();
    this.setupWebSocket();
    this.startBackgroundCheck();
    this.isInitialized = true;
  }

  private async initializeServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
      await this.setupPushSubscription();
      await this.registerBackgroundSync();
    } catch {
      // Silent fail
    }
  }

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

  private async setupPushSubscription() {
    if (!this.serviceWorkerRegistration || !('PushManager' in window)) return;

    try {
      this.pushSubscription = await this.serviceWorkerRegistration.pushManager.getSubscription();

      if (!this.pushSubscription) {
        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) return;

        const convertedVapidKey = this.urlBase64ToUint8Array(vapidPublicKey);
        this.pushSubscription = await this.serviceWorkerRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
        await this.sendSubscriptionToServer(this.pushSubscription);
      } else {
        await this.sendSubscriptionToServer(this.pushSubscription);
      }
    } catch {
      // Silent fail
    }
  }

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

  private async sendSubscriptionToServer(subscription: PushSubscription) {
    if (!this.authToken) return;

    try {
      await fetch(getApiEndpoint('subscribe'), {
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
    } catch {
      // Silent fail
    }
  }

  private async registerBackgroundSync() {
    if (!this.serviceWorkerRegistration || !('sync' in this.serviceWorkerRegistration)) return;

    try {
      await this.serviceWorkerRegistration.sync.register('notification-sync');
    } catch {
      // Silent fail
    }
  }

  private setupWebSocket() {
    if (!this.authToken || !this.userId) return;

    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) return;

    try {
      this.websocket = new WebSocket(`${wsUrl}/notifications?token=${this.authToken}&userId=${this.userId}`);

      this.websocket.onopen = () => {
        this.retryCount = 0;
      };

      this.websocket.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          this.processIncomingNotification(notification);
        } catch {
          // Silent fail
        }
      };

      this.websocket.onclose = () => {
        if (this.retryCount < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
          setTimeout(() => {
            this.retryCount++;
            this.setupWebSocket();
          }, delay);
        }
      };
    } catch {
      // Silent fail
    }
  }

  private async processIncomingNotification(notification: BackgroundNotification) {
    const userData = getSecureUserData();

    if (notification.targetUserId && notification.targetUserId !== userData?.id) return;
    if (notification.targetRole && notification.targetRole.toLowerCase() !== userData?.role?.toLowerCase()) return;

    const isSender = notification.sender === userData?.id || notification.sender === userData?.name;
    const isSenderNotification = notification.metadata?.isSenderNotification || notification.isSenderNotification;

    if (isSender && isSenderNotification) {
      await this.showSenderNotification(notification);
    } else if (!isSender) {
      await this.showReceiverNotification(notification);
    } else {
      await this.showReceiverNotification(notification);
    }
  }

  private async showSenderNotification(notification: BackgroundNotification) {
    await this.storeNotificationInDB(notification);

    await notificationMiddleware.sendNotification({
      id: notification.id,
      type: notification.type as any,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      timestamp: notification.timestamp,
      metadata: notification.metadata
    });

    await notificationMiddleware.sendSystemNotification(
      'success',
      notification.title,
      notification.message
    );
  }

  private async showReceiverNotification(notification: BackgroundNotification) {
    await this.storeNotificationInDB(notification);

    if (this.visibilityState === 'hidden' || this.visibilityState === 'visible') {
      await this.showBrowserNotification(notification);
    }

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

  private async showBrowserNotification(notification: BackgroundNotification) {
    if (!this.serviceWorkerRegistration?.active) {
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

  private async storeNotificationInDB(notification: BackgroundNotification) {
    try {
      const db = await this.openDB();
      const tx = db.transaction('notifications', 'readwrite');
      const store = tx.objectStore('notifications');

      const notificationToStore = {
        ...notification,
        timestamp: notification.timestamp instanceof Date
          ? notification.timestamp.toISOString()
          : notification.timestamp,
        synced: 0,
        createdAt: Date.now()
      };

      const existingNotif = await store.get(notification.id).catch(() => null);

      if (existingNotif) {
        await store.put(notificationToStore);
      } else {
        await store.add(notificationToStore);
      }

      db.close();
    } catch (error) {
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
            synced: 0,
            createdAt: Date.now()
          });
          db.close();
        } catch {
          // Silent fail
        }
      }
    }
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MeterSquareNotifications', 3);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains('notifications')) {
          store = db.createObjectStore('notifications', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('targetRole', 'targetRole', { unique: false });
          store.createIndex('read', 'read', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        } else {
          const transaction = (event.target as IDBOpenDBRequest).transaction;
          if (transaction) {
            store = transaction.objectStore('notifications');

            if (!store.indexNames.contains('synced')) {
              store.createIndex('synced', 'synced', { unique: false });
            }
            if (!store.indexNames.contains('read')) {
              store.createIndex('read', 'read', { unique: false });
            }
            if (!store.indexNames.contains('category')) {
              store.createIndex('category', 'category', { unique: false });
            }

            if (oldVersion < 3 && store.objectStoreNames.contains('notifications')) {
              const updateTx = event.target.transaction;
              const updateStore = updateTx.objectStore('notifications');
              const cursorRequest = updateStore.openCursor();

              cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                  const record = cursor.value;
                  if (typeof record.synced === 'boolean') {
                    record.synced = record.synced ? 1 : 0;
                    cursor.update(record);
                  }
                  cursor.continue();
                }
              };
            }
          }
        }
      };
    });
  }

  private setupVisibilityListener() {
    // Disabled: Socket.IO handles real-time notifications now
    // This was causing duplicate toasts on tab focus
    document.addEventListener('visibilitychange', () => {
      this.visibilityState = document.visibilityState;
    });
  }

  private setupAuthListener() {
    window.addEventListener('storage', (event) => {
      if (event.key === 'access_token') {
        this.updateCredentials(event.newValue, this.userRole, this.userId);
      }
    });

    this.authToken = localStorage.getItem('access_token');
    const userData = getSecureUserData();
    this.userRole = userData?.role || null;
    this.userId = userData?.id || null;
  }

  updateCredentials(token: string | null, role: string | null, userId: string | null) {
    this.authToken = token;
    this.userRole = role;
    this.userId = userId;

    if (token && userId) {
      if (this.websocket) {
        this.websocket.close();
      }
      this.setupWebSocket();

      if (this.pushSubscription) {
        this.sendSubscriptionToServer(this.pushSubscription);
      }
    } else {
      if (this.websocket) {
        this.websocket.close();
        this.websocket = null;
      }
    }

    this.sendAuthToServiceWorker();
  }

  private async sendAuthToServiceWorker() {
    if (!this.serviceWorkerRegistration?.active) return;

    this.serviceWorkerRegistration.active.postMessage({
      type: 'AUTH_UPDATE',
      authToken: this.authToken,
      userRole: this.userRole,
      userId: this.userId
    });
  }

  private startBackgroundCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      const isWebSocketConnected = this.websocket?.readyState === WebSocket.OPEN;

      if (this.visibilityState === 'hidden' && !isWebSocketConnected) {
        this.checkForNotifications();
      }
    }, 60000);
  }

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
    } catch {
      // Silent fail
    }
  }

  private async checkForMissedNotifications() {
    await this.checkForNotifications();
    await this.syncOfflineNotifications();
  }

  private enableBackgroundMode() {
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage({
        type: 'ENABLE_BACKGROUND_MODE'
      });
    }
  }

  private async syncOfflineNotifications() {
    try {
      if (!('indexedDB' in window)) return;

      const db = await this.openDB();

      if (!db.objectStoreNames.contains('notifications')) {
        db.close();
        return;
      }

      const tx = db.transaction('notifications', 'readonly');
      const store = tx.objectStore('notifications');

      let unsyncedNotifications: any[] = [];

      try {
        const allNotifications = await new Promise<any[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });

        unsyncedNotifications = allNotifications.filter(n => {
          return !n.synced || n.synced === 0 || n.synced === false;
        });
      } catch {
        unsyncedNotifications = [];
      }

      for (const notificationData of unsyncedNotifications) {
        try {
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

          if (notification.id && notification.type && notification.title) {
            await this.processIncomingNotification(notification);
          }
        } catch {
          // Silent fail
        }
      }

      db.close();
    } catch {
      // Silent fail
    }
  }

  private handleNotificationClick(notification: BackgroundNotification) {
    if (window.parent) {
      window.parent.focus();
    }
    window.focus();

    if (notification.metadata?.actionUrl) {
      window.location.href = notification.metadata.actionUrl;
    }
  }

  private processBackgroundNotification(notification: BackgroundNotification) {
    this.processIncomingNotification(notification);
  }

  async testBackgroundNotification() {
    const testNotification: BackgroundNotification = {
      id: `test-${Date.now()}`,
      type: 'info',
      title: 'Background Notification Test',
      message: 'This notification works when app is in background!',
      timestamp: new Date(),
      priority: 'high',
      metadata: {
        actionUrl: '/procurement'
      }
    };

    await this.processIncomingNotification(testNotification);
  }

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
