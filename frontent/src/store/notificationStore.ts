import { create } from 'zustand';
import { NotificationData, notificationService } from '@/services/notificationService';
import { filterOldNotifications, sanitizeNotificationData } from '@/utils/notificationSecurity';

// One-time cleanup: Remove old localStorage and IndexedDB caches from previous versions
function cleanupOldCaches() {
  try {
    // Clear old localStorage
    localStorage.removeItem('notification-store');
    localStorage.removeItem('notification-cache-version');

    // Clear old IndexedDB
    if ('indexedDB' in window) {
      indexedDB.deleteDatabase('MeterSquareNotifications');
    }
  } catch {
    // Silent fail
  }
}

// Run cleanup once on load
cleanupOldCaches();

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

// Simple in-memory store - no localStorage/IndexedDB persistence
// Notifications are fetched fresh from server on each page load via Socket.IO
export const useNotificationStore = create<NotificationStore>()((set, get) => ({
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

    // Delete on backend
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

    // Delete all notifications on backend
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
}));

// Track subscription for cleanup
let serviceInitialized = false;
let notificationUnsubscriber: (() => void) | null = null;

export const initializeNotificationService = async () => {
  if (serviceInitialized) return;

  serviceInitialized = true;

  // Clear any existing subscriptions first
  cleanupNotificationService();

  // Subscribe to notifications from service
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
