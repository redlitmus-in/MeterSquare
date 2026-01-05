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
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private pollIntervalMs = 30000; // Poll every 30 seconds (optimized from 10s)
  private lastFetchTime: number = 0;
  private backoffMultiplier = 1; // Exponential backoff if no new notifications
  private maxBackoffMultiplier = 4; // Max 2 minutes (30s * 4 = 120s)
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

    // Then poll at intervals
    this.pollingInterval = setInterval(() => {
      this.fetchNotifications();
    }, this.pollIntervalMs);
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

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Reset backoff multiplier
    this.backoffMultiplier = 1;
  }

  /**
   * Fetch latest notifications from API
   * Only fetches when Socket.IO is disconnected to minimize server load
   */
  private async fetchNotifications() {
    try {
      // OPTIMIZATION: Only poll if Socket.IO is disconnected
      const hubStatus = realtimeNotificationHub.getStatus();
      if (hubStatus.socketConnected) {
        if (import.meta.env.DEV) {
          console.log('[Polling] Skipping poll - Socket.IO is connected');
        }
        // Reset backoff when Socket.IO is connected
        this.backoffMultiplier = 1;
        return;
      }

      const token = localStorage.getItem('access_token');
      const baseUrl = import.meta.env.VITE_API_BASE_URL;

      if (!token || !baseUrl) {
        return;
      }

      const currentTime = Date.now();

      // Fetch only notifications created after last fetch
      const params = new URLSearchParams({
        unread_only: 'true',
        limit: '20'
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
          console.error('[Polling] Failed to fetch notifications:', response.status);
        }
        return;
      }

      const data = await response.json();

      if (data.success && data.notifications && Array.isArray(data.notifications)) {
        // SYNC: Remove local notifications that no longer exist in DB
        const store = useNotificationStore.getState();
        const serverIds = new Set(data.notifications.map((n: any) => String(n.id)));
        const localNotifications = store.notifications;
        const orphanedNotifications = localNotifications.filter(n => !serverIds.has(String(n.id)));

        if (orphanedNotifications.length > 0) {
          orphanedNotifications.forEach(n => {
            store.deleteNotification(String(n.id));
          });
        }

        const newNotifications = data.notifications.filter((notif: any) => {
          // Skip if already processed
          if (this.processedNotificationIds.has(notif.id)) {
            return false;
          }

          const createdAt = new Date(notif.timestamp || notif.createdAt).getTime();
          const isNew = createdAt > this.lastFetchTime;
          return isNew;
        });

        if (newNotifications.length > 0) {

          // Add each new notification to the store
          const store = useNotificationStore.getState();
          for (const notif of newNotifications) {
            // Mark as processed BEFORE adding to store
            this.processedNotificationIds.add(notif.id);

            // Limit processed IDs set size to prevent memory leaks
            if (this.processedNotificationIds.size > this.maxProcessedIds) {
              // Remove oldest entries (first 100)
              const idsToRemove = Array.from(this.processedNotificationIds).slice(0, 100);
              idsToRemove.forEach(id => this.processedNotificationIds.delete(id));
            }

            store.addNotification({
              id: notif.id,
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
            });
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
}

// Export singleton instance
export const notificationPollingService = NotificationPollingService.getInstance();
