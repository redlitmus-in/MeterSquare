import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NotificationData, notificationService } from '@/services/notificationService';
import { filterOldNotifications, sanitizeNotificationData } from '@/utils/notificationSecurity';

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
        set((state) => {
          const sanitizedNotification = sanitizeNotificationData(notification);

          // Check if notification already exists (prevent duplicates)
          const exists = state.notifications.find(n => n.id === sanitizedNotification.id);
          if (exists) {
            return state;
          }

          // Add new notification and apply storage limits
          let newNotifications = [sanitizedNotification, ...state.notifications];
          newNotifications = filterOldNotifications(newNotifications);

          const newUnreadCount = newNotifications.filter(n => !n.read).length;
          notificationService.updateTabTitle(newUnreadCount);

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

        // Mark as read on backend
        const token = localStorage.getItem('access_token');
        const baseUrl = import.meta.env.VITE_API_BASE_URL;
        if (token && baseUrl) {
          fetch(`${baseUrl}/notifications/read`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notification_ids: [id] })
          }).catch(() => { /* Silent fail */ });
        }
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

        // Mark all as read on backend
        const token = localStorage.getItem('access_token');
        const baseUrl = import.meta.env.VITE_API_BASE_URL;
        if (token && baseUrl) {
          fetch(`${baseUrl}/notifications/read-all`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }).catch(() => { /* Silent fail */ });
        }
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

        // Delete on backend to prevent re-fetching after refresh
        const token = localStorage.getItem('access_token');
        const baseUrl = import.meta.env.VITE_API_BASE_URL;
        if (token && baseUrl) {
          fetch(`${baseUrl}/notifications/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }).catch(() => { /* Silent fail */ });
        }
      },

      clearAll: () => {
        const currentNotifications = get().notifications;

        set({
          notifications: [],
          unreadCount: 0
        });

        // Update browser tab title
        notificationService.updateTabTitle(0);

        // Delete all notifications on backend to prevent re-fetching after refresh
        const token = localStorage.getItem('access_token');
        const baseUrl = import.meta.env.VITE_API_BASE_URL;
        if (token && baseUrl && currentNotifications.length > 0) {
          fetch(`${baseUrl}/notifications/delete-all`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }).catch(() => { /* Silent fail */ });
        }
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

// ✅ PERFORMANCE: Track subscriptions for proper cleanup to prevent memory leaks
let serviceInitialized = false;
let notificationUnsubscriber: (() => void) | null = null;
let indexedDBUnsubscriber: (() => void) | null = null;

export const initializeNotificationService = async () => {
  if (serviceInitialized) return;

  serviceInitialized = true;

  // Clear any existing subscriptions first (prevents duplicate subscriptions)
  cleanupNotificationService();

  // Subscribe to notifications from service
  notificationUnsubscriber = notificationService.subscribe((notification: NotificationData) => {
    useNotificationStore.getState().addNotification(notification);
  });

  // Setup IndexedDB persistence
  await setupIndexedDBPersistence();
};

// ✅ PERFORMANCE: Export cleanup function for proper resource management
export const cleanupNotificationService = () => {
  if (notificationUnsubscriber) {
    notificationUnsubscriber();
    notificationUnsubscriber = null;
  }
  if (indexedDBUnsubscriber) {
    indexedDBUnsubscriber();
    indexedDBUnsubscriber = null;
  }
  serviceInitialized = false;
};

// IndexedDB setup for notification persistence
async function setupIndexedDBPersistence() {
  try {
    if (!('indexedDB' in window)) return;

    const DB_NAME = 'MeterSquareNotifications';
    const DB_VERSION = 2;
    const STORE_NAME = 'notifications';

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onsuccess = () => {
      loadNotificationsFromIndexedDB(request.result);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('read', 'read', { unique: false });
        store.createIndex('targetRole', 'targetRole', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      } else if (oldVersion < 2) {
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore(STORE_NAME);
          if (!store.indexNames.contains('synced')) {
            store.createIndex('synced', 'synced', { unique: false });
          }
        }
      }
    };

    // ✅ PERFORMANCE: Store unsubscriber for proper cleanup
    indexedDBUnsubscriber = useNotificationStore.subscribe((state) => {
      saveNotificationsToIndexedDB(state.notifications);
    });
  } catch {
    // Silent fail
  }
}

// Load notifications from IndexedDB
async function loadNotificationsFromIndexedDB(db: IDBDatabase) {
  try {
    const tx = db.transaction('notifications', 'readonly');
    const store = tx.objectStore('notifications');
    const request = store.getAll();

    request.onsuccess = () => {
      const notifications = request.result || [];
      if (notifications.length > 0) {
        const filteredNotifications = filterOldNotifications(notifications);
        const currentNotifications = useNotificationStore.getState().notifications;
        const mergedNotifications = [...filteredNotifications];

        currentNotifications.forEach(current => {
          if (!mergedNotifications.find(n => n.id === current.id)) {
            mergedNotifications.unshift(current);
          }
        });

        useNotificationStore.setState({
          notifications: mergedNotifications,
          unreadCount: mergedNotifications.filter(n => !n.read).length
        });
      }
    };
  } catch {
    // Silent fail
  }
}

// Save notifications to IndexedDB
async function saveNotificationsToIndexedDB(notifications: NotificationData[]) {
  try {
    const DB_NAME = 'MeterSquareNotifications';
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('notifications', 'readwrite');
      const store = tx.objectStore('notifications');
      store.clear();

      const recentNotifications = notifications.slice(0, 100);
      recentNotifications.forEach(notification => {
        store.put(notification);
      });
    };
  } catch {
    // Silent fail
  }
}

// Auto-initialize when store is first accessed
if (typeof window !== 'undefined') {
  initializeNotificationService();
}