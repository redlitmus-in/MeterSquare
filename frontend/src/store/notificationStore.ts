import { create } from 'zustand';
import { NotificationData, notificationService } from '@/services/notificationService';
import { filterOldNotifications, sanitizeNotificationData } from '@/utils/notificationSecurity';
import { getApiClient } from '@/utils/apiClientLoader';

// ─── Backend sync helper ────────────────────────────────────────
async function syncToBackend(method: 'post' | 'delete', path: string, data?: any) {
  try {
    const client = await getApiClient();
    if (method === 'delete') {
      await client.delete(path);
    } else {
      await client.post(path, data);
    }
  } catch (err) {
    // Log but don't throw – notification UI should not break on sync failures
    if (import.meta.env.DEV) {
      console.warn('[NotificationStore] Backend sync failed:', path, err);
    }
  }
}

// One-time cleanup: Remove old localStorage and IndexedDB caches from previous versions
function cleanupOldCaches() {
  try {
    localStorage.removeItem('notification-store');
    localStorage.removeItem('notification-cache-version');
    if ('indexedDB' in window) {
      indexedDB.deleteDatabase('MeterSquareNotifications');
    }
  } catch {
    // Silent fail
  }
}
cleanupOldCaches();

interface NotificationStore {
  notifications: NotificationData[];
  unreadCount: number;
  isPermissionRequested: boolean;
  isPermissionGranted: boolean;

  addNotification: (notification: NotificationData) => void;
  addNotifications: (batch: NotificationData[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
  requestPermission: () => Promise<void>;
  getUnreadNotifications: () => NotificationData[];
  getNotificationsByCategory: (category: string) => NotificationData[];
  getNotificationsByPriority: (priority: string) => NotificationData[];
}

// Notifications are fetched fresh from server on each page load via Socket.IO + polling fallback
export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isPermissionRequested: false,
  isPermissionGranted: false,

  addNotification: (notification: NotificationData) => {
    set((state) => {
      const sanitized = sanitizeNotificationData(notification);
      // Normalize ID to string to prevent number/string mismatch with === comparisons
      const sanitizedId = String(sanitized.id);
      if (state.notifications.find(n => String(n.id) === sanitizedId)) return state;

      const normalized = { ...sanitized, id: sanitizedId };
      let newNotifications = [normalized, ...state.notifications];
      newNotifications = filterOldNotifications(newNotifications);
      const newUnreadCount = newNotifications.filter(n => !n.read).length;
      notificationService.updateTabTitle(newUnreadCount);

      return { notifications: newNotifications, unreadCount: newUnreadCount };
    });
  },

  addNotifications: (batch: NotificationData[]) => {
    if (!batch.length) return;
    set((state) => {
      const existingIds = new Set(state.notifications.map(n => String(n.id)));
      const newItems = batch
        .map(sanitizeNotificationData)
        .map(n => ({ ...n, id: String(n.id) }))
        .filter(n => !existingIds.has(n.id));
      if (!newItems.length) return state;

      let merged = [...newItems, ...state.notifications];
      merged = filterOldNotifications(merged);
      const newUnreadCount = merged.filter(n => !n.read).length;
      notificationService.updateTabTitle(newUnreadCount);
      return { notifications: merged, unreadCount: newUnreadCount };
    });
  },

  markAsRead: (id: string) => {
    const strId = String(id);
    set((state) => {
      const newNotifications = state.notifications.map(n =>
        String(n.id) === strId ? { ...n, read: true } : n
      );
      const newUnreadCount = newNotifications.filter(n => !n.read).length;
      notificationService.updateTabTitle(newUnreadCount);
      return { notifications: newNotifications, unreadCount: newUnreadCount };
    });
    syncToBackend('post', '/notifications/read', { notification_ids: [strId] });
  },

  markAllAsRead: () => {
    set((state) => {
      const newNotifications = state.notifications.map(n => ({ ...n, read: true }));
      notificationService.updateTabTitle(0);
      return { notifications: newNotifications, unreadCount: 0 };
    });
    syncToBackend('post', '/notifications/read-all');
  },

  deleteNotification: (id: string) => {
    const strId = String(id);
    set((state) => {
      const newNotifications = state.notifications.filter(n => String(n.id) !== strId);
      const newUnreadCount = newNotifications.filter(n => !n.read).length;
      notificationService.updateTabTitle(newUnreadCount);
      return { notifications: newNotifications, unreadCount: newUnreadCount };
    });
    syncToBackend('delete', `/notifications/${strId}`);
  },

  clearAll: () => {
    const hadNotifications = get().notifications.length > 0;
    set({ notifications: [], unreadCount: 0 });
    notificationService.updateTabTitle(0);
    if (hadNotifications) {
      syncToBackend('post', '/notifications/delete-all');
    }
  },

  requestPermission: async () => {
    const permission = await notificationService.requestPermission();
    set({ isPermissionRequested: true, isPermissionGranted: permission === 'granted' });
  },

  getUnreadNotifications: () => get().notifications.filter(n => !n.read),
  getNotificationsByCategory: (category: string) => get().notifications.filter(n => n.category === category),
  getNotificationsByPriority: (priority: string) => get().notifications.filter(n => n.priority === priority),
}));

// Track subscription for cleanup
let serviceInitialized = false;
let notificationUnsubscriber: (() => void) | null = null;

export const initializeNotificationService = async () => {
  if (serviceInitialized) return;
  serviceInitialized = true;
  cleanupNotificationService();
  notificationUnsubscriber = notificationService.subscribe((notification: NotificationData) => {
    useNotificationStore.getState().addNotification(notification);
  });
};

export const cleanupNotificationService = () => {
  if (notificationUnsubscriber) {
    notificationUnsubscriber();
    notificationUnsubscriber = null;
  }
  serviceInitialized = false;
};

// Auto-initialize when store is first accessed
if (typeof window !== 'undefined') {
  initializeNotificationService();
}
