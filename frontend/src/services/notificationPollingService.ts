/**
 * Notification Polling Fallback Service
 * Polls for new notifications when Socket.IO is disconnected
 * Ensures 100% reliable notification delivery
 *
 * IMPORTANT: Only polls when Socket.IO is disconnected to minimize server load
 */

import { useNotificationStore } from '@/store/notificationStore';
import { realtimeNotificationHub } from './realtimeNotificationHub';

class NotificationPollingService {
  private static instance: NotificationPollingService;
  private isPolling = false;
  private pollIntervalMs = 30000; // Poll every 30 seconds when Socket.IO is disconnected
  private lastFetchTime: number = 0;
  private backoffMultiplier = 1; // Exponential backoff if no new notifications
  private maxBackoffMultiplier = 4; // Max 2 minutes (30s * 4 = 120s)
  private pollTimeout: NodeJS.Timeout | null = null; // Used for backoff-aware scheduling
  private processedNotificationIds: Set<string> = new Set(); // Track processed IDs
  private maxProcessedIds = 500; // Limit to prevent memory leaks

  private constructor() { }

  static getInstance(): NotificationPollingService {
    if (!NotificationPollingService.instance) {
      NotificationPollingService.instance = new NotificationPollingService();
    }
    return NotificationPollingService.instance;
  }

  /**
   * Start polling for notifications
   * Only polls when Socket.IO is disconnected
   */
  startPolling() {
    if (this.isPolling) {
      if (import.meta.env.DEV) {
        console.log('[Polling] Already polling');
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.log('[Polling] Starting notification polling (every 30s when Socket.IO disconnected)');
    }
    this.isPolling = true;

    // Fetch immediately
    this.fetchNotifications();

    // Schedule next poll with backoff-aware timeout
    this.scheduleNextPoll();
  }

  /**
   * Schedule the next poll using setTimeout so backoff multiplier actually takes effect.
   * Unlike setInterval, this adjusts the delay dynamically based on backoffMultiplier.
   */
  private scheduleNextPoll() {
    if (!this.isPolling) return;

    const delay = this.pollIntervalMs * this.backoffMultiplier;
    if (import.meta.env.DEV) {
      console.log(`[Polling] Next poll in ${delay / 1000}s (backoff: ${this.backoffMultiplier}x)`);
    }

    this.pollTimeout = setTimeout(async () => {
      await this.fetchNotifications();
      this.scheduleNextPoll();
    }, delay);
  }

  /**
   * Stop polling for notifications
   */
  stopPolling() {
    if (!this.isPolling) {
      return;
    }

    if (import.meta.env.DEV) {
      console.log('[Polling] Stopping notification polling');
    }
    this.isPolling = false;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Reset backoff multiplier
    this.backoffMultiplier = 1;
  }

  /**
   * Fetch latest notifications from API
   * Always fetches as safety net - Socket.IO can silently fail after server restarts
   */
  private async fetchNotifications() {
    try {
      const hubStatus = realtimeNotificationHub.getStatus();
      if (hubStatus.socketConnected) {
        // Socket.IO connected - use max backoff to reduce server load but still poll
        if (this.backoffMultiplier < this.maxBackoffMultiplier) {
          this.backoffMultiplier = this.maxBackoffMultiplier;
        }
      }

      const token = localStorage.getItem('access_token');
      const baseUrl = import.meta.env.VITE_API_BASE_URL;

      if (!token || !baseUrl) {
        if (import.meta.env.DEV) {
          console.warn('[Polling] Missing credentials:', { hasToken: !!token, hasBaseUrl: !!baseUrl });
        }
        return;
      }

      const currentTime = Date.now();

      // Fetch ALL notifications (not just unread) to ensure persistence across reloads
      const params = new URLSearchParams({
        unread_only: 'false',  // Changed from 'true' to fetch all notifications
        limit: '100'  // Increased from 20 to get more notifications
      });

      const response = await fetch(`${baseUrl}/notifications?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (import.meta.env.DEV) {
          console.error('[Polling] Failed to fetch notifications:', response.status, response.statusText);
        }
        // If unauthorized, clear token and notify user
        if (response.status === 401) {
          localStorage.removeItem('access_token');
          console.error('[Polling] Unauthorized - token may be expired');
        }
        return;
      }

      const data = await response.json();

      if (import.meta.env.DEV) {
        console.log('[Polling] Fetched notifications:', {
          success: data.success,
          count: data.notifications?.length,
          total: data.total,
          unreadCount: data.unread_count
        });
      }

      if (data.success && data.notifications && Array.isArray(data.notifications)) {
        const store = useNotificationStore.getState();

        // On first fetch or when notifications are empty, load all notifications from server
        if (this.lastFetchTime === 0 || store.notifications.length === 0) {
          if (import.meta.env.DEV) {
            console.log('[Polling] Initial load - adding all notifications from server');
          }

          // Add all notifications from server (will handle duplicates internally)
          const allNotifications = data.notifications.map((notif: any) => ({
            id: String(notif.id),
            type: notif.type || 'info',
            title: notif.title,
            message: notif.message,
            priority: notif.priority || 'medium',
            timestamp: new Date(notif.timestamp || notif.createdAt),
            read: notif.read || false,
            category: notif.category || 'system',
            metadata: notif.metadata,
            actionUrl: notif.actionUrl,
            actionLabel: notif.actionLabel,
            actionRequired: notif.actionRequired,
            senderName: notif.senderName
          }));

          if (import.meta.env.DEV) {
            console.log('[Polling] Adding notifications to store:', allNotifications.length, 'notifications');
          }

          store.addNotifications(allNotifications);
          this.lastFetchTime = currentTime;

          if (import.meta.env.DEV) {
            console.log('[Polling] Store updated. Current store state:', {
              totalNotifications: store.notifications.length,
              unreadCount: store.unreadCount
            });
          }

          return;
        }

        // SYNC: Remove local notifications that no longer exist in DB
        const serverIds = new Set(data.notifications.map((n: any) => String(n.id)));
        const localNotifications = store.notifications;
        const orphanedNotifications = localNotifications.filter(n => !serverIds.has(String(n.id)));

        if (orphanedNotifications.length > 0) {
          if (import.meta.env.DEV) {
            console.log('[Polling] Removing orphaned notifications:', orphanedNotifications.length);
          }
          orphanedNotifications.forEach(n => {
            store.deleteNotification(String(n.id));
          });
        }

        // Update existing notifications' read status from server
        const localNotifMap = new Map(store.notifications.map(n => [String(n.id), n]));
        data.notifications.forEach((serverNotif: any) => {
          const notifIdStr = String(serverNotif.id);
          const localNotif = localNotifMap.get(notifIdStr);

          // If local notification exists and read status changed, update it
          if (localNotif && localNotif.read !== serverNotif.read) {
            if (serverNotif.read) {
              store.markAsRead(notifIdStr);
            }
          }
        });

        const newNotifications = data.notifications.filter((notif: any) => {
          // Skip if already processed (normalize to string for consistent comparison)
          const notifIdStr = String(notif.id);
          if (this.processedNotificationIds.has(notifIdStr)) {
            return false;
          }

          const createdAt = new Date(notif.timestamp || notif.createdAt).getTime();
          const isNew = createdAt > this.lastFetchTime;
          return isNew;
        });

        if (newNotifications.length > 0) {

          // Add each new notification to the store AND show popup
          const store = useNotificationStore.getState();
          for (const notif of newNotifications) {
            // Normalize ID to string for consistent comparison
            const notifIdStr = String(notif.id);

            // Mark as processed BEFORE adding to store
            this.processedNotificationIds.add(notifIdStr);

            // Limit processed IDs set size to prevent memory leaks
            if (this.processedNotificationIds.size > this.maxProcessedIds) {
              // Remove oldest entries (first 100)
              const idsToRemove = Array.from(this.processedNotificationIds).slice(0, 100);
              idsToRemove.forEach(id => this.processedNotificationIds.delete(id));
            }

            const notificationData = {
              id: notifIdStr,
              type: notif.type || 'info',
              title: notif.title,
              message: notif.message,
              priority: notif.priority || 'medium',
              timestamp: new Date(notif.timestamp || notif.createdAt),
              read: false,
              metadata: notif.metadata,
              actionUrl: notif.actionUrl,
              actionLabel: notif.actionLabel,
              senderName: notif.senderName
            };

            store.addNotification(notificationData);

            // Show popup based on page visibility
            // This ensures notifications appear even when Socket.IO/Supabase Realtime fail
            const isPageHidden = document.hidden || document.visibilityState === 'hidden';

            if (import.meta.env.DEV) {
              console.log('[Polling] Page visibility:', { isPageHidden, title: notificationData.title });
            }

            if (isPageHidden) {
              // Page HIDDEN/MINIMIZED: Show BOTH desktop AND in-app notification
              // Desktop notification alerts the user, in-app notification is ready when they return
              if (import.meta.env.DEV) {
                console.log('[Polling] Page hidden - showing BOTH desktop and in-app notification');
              }
              this.showDesktopNotification(notificationData);
              this.showInAppNotification(notificationData);
            } else {
              // Page VISIBLE: Show in-app toast only (no desktop)
              if (import.meta.env.DEV) {
                console.log('[Polling] Page visible - showing ONLY in-app notification');
              }
              this.showInAppNotification(notificationData);
            }
          }

          // Reset backoff multiplier since we found new notifications
          this.backoffMultiplier = 1;
        } else {
          // No new notifications - apply exponential backoff
          if (this.backoffMultiplier < this.maxBackoffMultiplier) {
            this.backoffMultiplier++;
            if (import.meta.env.DEV) {
              console.log(`[Polling] No new notifications - backing off (${this.backoffMultiplier}x)`);
            }
          }
        }

        this.lastFetchTime = currentTime;
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Polling] Error fetching notifications:', error);
      }
    }
  }

  /**
   * Force fetch notifications now
   */
  async fetchNow() {
    await this.fetchNotifications();
  }

  /**
   * Check if currently polling
   */
  isActive(): boolean {
    return this.isPolling;
  }

  /**
   * Set polling interval
   */
  setPollingInterval(intervalMs: number) {
    this.pollIntervalMs = intervalMs;

    // Restart polling if active
    if (this.isPolling) {
      this.stopPolling();
      this.startPolling();
    }
  }

  /**
   * Show in-app toast notification
   */
  private showInAppNotification(notification: any) {
    if (import.meta.env.DEV) {
      console.log('[Polling] 🔔 Showing in-app toast for:', notification.title);
    }
    try {
      // Dynamic import to avoid circular dependencies
      import('sonner').then(({ toast }) => {
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
            default:
              return '🔔';
          }
        };

        toast.message(notification.title, {
          description: notification.message,
          icon: getIcon(),
          duration: 5000,
          action: notification.actionUrl ? {
            label: notification.actionLabel || 'View',
            onClick: () => {
              window.location.href = notification.actionUrl;
            }
          } : undefined
        });

        if (import.meta.env.DEV) {
          console.log('[Polling] ✅ In-app toast shown successfully');
        }
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Polling] ❌ Failed to show in-app notification:', error);
      }
    }
  }

  /**
   * Show desktop notification
   */
  private showDesktopNotification(notification: any) {
    if (import.meta.env.DEV) {
      console.log('[Polling] 🖥️ Attempting desktop notification for:', notification.title);
      console.log('[Polling] Desktop notification permission:', Notification.permission);
    }
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const desktopNotif = new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.id, // Prevent duplicate desktop notifications
          requireInteraction: notification.priority === 'urgent'
        });

        if (import.meta.env.DEV) {
          console.log('[Polling] ✅ Desktop notification created successfully');
        }

        desktopNotif.onclick = () => {
          window.focus();
          if (notification.actionUrl) {
            window.location.href = notification.actionUrl;
          }
          desktopNotif.close();
        };
      } else {
        if (import.meta.env.DEV) {
          console.log('[Polling] ❌ Desktop notification not available or permission denied');
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Polling] Failed to show desktop notification:', error);
      }
    }
  }
}

// Export singleton instance
export const notificationPollingService = NotificationPollingService.getInstance();
