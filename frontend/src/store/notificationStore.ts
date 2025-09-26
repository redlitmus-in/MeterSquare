import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { NotificationData, notificationService } from '@/services/notificationService';
import {
  filterOldNotifications,
  sanitizeNotificationData,
  getDebugLogger
} from '@/utils/notificationSecurity';

interface NotificationStore {
  notifications: NotificationData[];
  unreadCount: number;
  isPermissionRequested: boolean;
  isPermissionGranted: boolean;

  // Actions
  addNotification: (notification: NotificationData) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;

  // Permission handling
  requestPermission: () => Promise<void>;

  // Getters
  getUnreadNotifications: () => NotificationData[];
  getNotificationsByCategory: (category: string) => NotificationData[];
  getNotificationsByPriority: (priority: string) => NotificationData[];
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      isPermissionRequested: false,
      isPermissionGranted: false,

      addNotification: (notification: NotificationData) => {
        const debug = getDebugLogger();

        set((state) => {
          // Sanitize notification first
          const sanitizedNotification = sanitizeNotificationData(notification);

          // Check if notification already exists (prevent duplicates)
          const exists = state.notifications.find(n => n.id === sanitizedNotification.id);
          if (exists) {
            debug.warn(`Notification ${sanitizedNotification.id} already exists`);
            return state;
          }

          debug.info('Adding new notification', {
            id: sanitizedNotification.id,
            type: sanitizedNotification.type
          });

          // Add new notification and apply storage limits
          let newNotifications = [sanitizedNotification, ...state.notifications];

          // Apply storage limits and filter old notifications
          newNotifications = filterOldNotifications(newNotifications);

          const newUnreadCount = newNotifications.filter(n => !n.read).length;

          // Update browser tab title
          notificationService.updateTabTitle(newUnreadCount);

          debug.info(`Notification stats: Total=${newNotifications.length}, Unread=${newUnreadCount}`);

          return {
            notifications: newNotifications,
            unreadCount: newUnreadCount
          };
        });
      },

      markAsRead: (id: string) => {
        set((state) => {
          const newNotifications = state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
          );
          const newUnreadCount = newNotifications.filter(n => !n.read).length;

          // Update browser tab title
          notificationService.updateTabTitle(newUnreadCount);

          return {
            notifications: newNotifications,
            unreadCount: newUnreadCount
          };
        });
      },

      markAllAsRead: () => {
        set((state) => {
          const newNotifications = state.notifications.map(n => ({ ...n, read: true }));

          // Update browser tab title
          notificationService.updateTabTitle(0);

          return {
            notifications: newNotifications,
            unreadCount: 0
          };
        });
      },

      deleteNotification: (id: string) => {
        set((state) => {
          const newNotifications = state.notifications.filter(n => n.id !== id);
          const newUnreadCount = newNotifications.filter(n => !n.read).length;

          // Update browser tab title
          notificationService.updateTabTitle(newUnreadCount);

          return {
            notifications: newNotifications,
            unreadCount: newUnreadCount
          };
        });
      },

      clearAll: () => {
        set({
          notifications: [],
          unreadCount: 0
        });

        // Update browser tab title
        notificationService.updateTabTitle(0);
      },

      requestPermission: async () => {
        const permission = await notificationService.requestPermission();
        set({
          isPermissionRequested: true,
          isPermissionGranted: permission === 'granted'
        });
      },

      getUnreadNotifications: () => {
        return get().notifications.filter(n => !n.read);
      },

      getNotificationsByCategory: (category: string) => {
        return get().notifications.filter(n => n.category === category);
      },

      getNotificationsByPriority: (priority: string) => {
        return get().notifications.filter(n => n.priority === priority);
      }
    }),
    {
      name: 'notification-store',
      // Only persist notifications and permission status, not computed values
      partialize: (state) => ({
        notifications: state.notifications,
        isPermissionRequested: state.isPermissionRequested,
        isPermissionGranted: state.isPermissionGranted
      }),
      // Rehydrate computed values after loading from storage
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Apply storage limits to rehydrated notifications
          state.notifications = filterOldNotifications(state.notifications);

          const unreadCount = state.notifications.filter(n => !n.read).length;
          state.unreadCount = unreadCount;

          // Update browser tab title on app load
          notificationService.updateTabTitle(unreadCount);
        }
      }
    }
  )
);

// Initialize notification service subscription
let serviceInitialized = false;

export const initializeNotificationService = async () => {
  if (serviceInitialized) return;

  serviceInitialized = true;

  // Subscribe to notifications from service
  notificationService.subscribe((notification: NotificationData) => {
    useNotificationStore.getState().addNotification(notification);
  });

  // Setup IndexedDB persistence
  await setupIndexedDBPersistence();
};

// IndexedDB setup for notification persistence
async function setupIndexedDBPersistence() {
  const debug = getDebugLogger();

  try {
    // Check if IndexedDB is supported
    if (!('indexedDB' in window)) {
      debug.warn('IndexedDB not supported');
      return;
    }

    const DB_NAME = 'MeterSquareNotifications';
    const DB_VERSION = 2;
    const STORE_NAME = 'notifications';

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      debug.error('Failed to open IndexedDB:', request.error);
    };

    request.onsuccess = () => {
      debug.info('IndexedDB initialized for notifications');
      const db = request.result;

      // Load existing notifications from IndexedDB
      loadNotificationsFromIndexedDB(db);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('read', 'read', { unique: false });
        store.createIndex('targetRole', 'targetRole', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
        debug.info('IndexedDB store created for notifications');
      } else if (oldVersion < 2) {
        // Upgrade existing store to add synced index
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          store = transaction.objectStore(STORE_NAME);
          if (!store.indexNames.contains('synced')) {
            store.createIndex('synced', 'synced', { unique: false });
            debug.info('Added synced index to existing store');
          }
        }
      }
    };

    // Subscribe to store changes to persist to IndexedDB
    useNotificationStore.subscribe((state) => {
      saveNotificationsToIndexedDB(state.notifications);
    });
  } catch (error) {
    debug.error('Error setting up IndexedDB:', error);
  }
}

// Load notifications from IndexedDB
async function loadNotificationsFromIndexedDB(db: IDBDatabase) {
  const debug = getDebugLogger();

  try {
    const tx = db.transaction('notifications', 'readonly');
    const store = tx.objectStore('notifications');
    const request = store.getAll();

    request.onsuccess = () => {
      const notifications = request.result || [];

      if (notifications.length > 0) {
        debug.info(`Loading ${notifications.length} notifications from IndexedDB`);

        // Filter old notifications
        const filteredNotifications = filterOldNotifications(notifications);

        // Update store with persisted notifications
        const currentNotifications = useNotificationStore.getState().notifications;
        const mergedNotifications = [...filteredNotifications];

        // Merge with current notifications (avoid duplicates)
        currentNotifications.forEach(current => {
          if (!mergedNotifications.find(n => n.id === current.id)) {
            mergedNotifications.unshift(current);
          }
        });

        // Update store
        useNotificationStore.setState({
          notifications: mergedNotifications,
          unreadCount: mergedNotifications.filter(n => !n.read).length
        });
      }
    };

    request.onerror = () => {
      debug.error('Failed to load notifications from IndexedDB:', request.error);
    };
  } catch (error) {
    debug.error('Error loading notifications from IndexedDB:', error);
  }
}

// Save notifications to IndexedDB
async function saveNotificationsToIndexedDB(notifications: NotificationData[]) {
  const debug = getDebugLogger();

  try {
    const DB_NAME = 'MeterSquareNotifications';
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('notifications', 'readwrite');
      const store = tx.objectStore('notifications');

      // Clear existing notifications
      store.clear();

      // Save current notifications (limited to recent ones)
      const recentNotifications = notifications.slice(0, 100); // Keep latest 100
      recentNotifications.forEach(notification => {
        store.put(notification);
      });

      tx.oncomplete = () => {
        debug.info(`Saved ${recentNotifications.length} notifications to IndexedDB`);
      };

      tx.onerror = () => {
        debug.error('Failed to save notifications to IndexedDB:', tx.error);
      };
    };
  } catch (error) {
    debug.error('Error saving notifications to IndexedDB:', error);
  }
}

// Auto-initialize when store is first accessed
if (typeof window !== 'undefined') {
  initializeNotificationService();

  // REMOVED: Auto-clear for production use
  // Notifications should persist across sessions
  // To manually clear for testing, use: useNotificationStore.getState().clearAll()
}