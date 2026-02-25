/**
 * Real-time Notification Hub
 * Manages WebSocket and Supabase connections for real-time notification delivery
 */

import { io, Socket } from 'socket.io-client';
import { supabase } from '@/api/config';
import { getSecureUserData } from '@/utils/notificationSecurity';
import { useNotificationStore } from '@/store/notificationStore';
import { toast } from 'sonner';
// NOTE: notificationPollingService imported lazily to avoid circular dependency
import { navigateTo } from '@/utils/navigationService';
import { normalizeRole, rolesMatch } from '@/utils/roleNormalization';
import { getApiClient } from '@/utils/apiClientLoader';

// NOTE: We use toast for INCOMING notifications but with DIFFERENT styling
// - YOUR actions: toast.success/error (green/red) - shown by component
// - INCOMING from others: toast with info style (blue/purple) - shown here

interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date | string;
  targetRole?: string;
  targetUserId?: string | number;
  userId?: string | number;
  senderId?: string | number;
  senderName?: string;
  metadata?: any;
}

class RealtimeNotificationHub {
  private static instance: RealtimeNotificationHub;
  private socket: Socket | null = null;
  private supabaseChannel: any = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity;
  private userId: string | null = null;
  private userRole: string | null = null;
  private authToken: string | null = null;
  private processedNotificationIds: Set<string> = new Set();
  private shownToastIds: Set<string> = new Set(); // Track shown toasts to prevent duplicates
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private authPollInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.initialize();
  }

  static getInstance(): RealtimeNotificationHub {
    if (!RealtimeNotificationHub.instance) {
      RealtimeNotificationHub.instance = new RealtimeNotificationHub();
    }
    return RealtimeNotificationHub.instance;
  }

  private initialize() {
    this.updateCredentials();
    this.setupSocketConnection();
    // Enable Supabase realtime as backup when Socket.IO is unreliable
    this.setupSupabaseRealtime();
    this.setupAuthListener();
    this.setupPeriodicHealthCheck();
    // Always start polling as safety net (runs alongside Socket.IO)
    this.startPollingFallback();
  }

  /**
   * Periodic health check to ensure Socket.IO connection and room membership is maintained
   * This helps recover from silent disconnections and server restarts
   */
  private setupPeriodicHealthCheck() {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    // Re-join rooms every 30 seconds to ensure we stay connected
    this.healthCheckInterval = setInterval(() => {
      if (this.socket && this.isConnected && this.userId) {
        console.log('[RealtimeNotificationHub] 🔄 Periodic room re-join for reliability');
        this.joinRooms();
        // Also fetch missed notifications as safety net (catches anything Socket.IO missed)
        this.fetchMissedNotifications();
      } else if (!this.isConnected && this.authToken) {
        console.log('[RealtimeNotificationHub] ⚠️ Health check: Socket disconnected, reconnecting...');
        // Clean up old socket before creating new one
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }
        this.setupSocketConnection();
        // Fetch missed notifications while reconnecting
        this.fetchMissedNotifications();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Setup Supabase realtime as fallback
   */
  private setupSupabaseRealtime() {
    if (!this.userId) return;

    try {
      console.log('[RealtimeNotificationHub] Setting up Supabase Realtime for user:', this.userId);
      this.supabaseChannel = supabase
        .channel('notifications-channel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${this.userId}`
          },
          (payload) => {
            console.log('[RealtimeNotificationHub] 📨 Supabase Realtime received notification:', payload.new);
            const notification = payload.new;
            // Convert DB format to our format
            const realtimeNotif: RealtimeNotification = {
              id: String(notification.id),
              type: notification.type || 'info',
              title: notification.title,
              message: notification.message,
              priority: notification.priority || 'medium',
              timestamp: notification.created_at,
              userId: notification.user_id,
              targetUserId: notification.user_id, // Add targetUserId to match Socket.IO format
              targetRole: notification.target_role, // Add targetRole from DB
              senderId: notification.sender_id,
              senderName: notification.sender_name,
              metadata: notification.metadata
            };
            this.handleIncomingNotification(realtimeNotif);
          }
        )
        .subscribe((status) => {
          console.log('[RealtimeNotificationHub] Supabase Realtime subscription status:', status);
        });
    } catch (err) {
      console.error('[RealtimeNotificationHub] Supabase Realtime setup error:', err);
    }
  }

  /**
   * Setup Socket.IO connection for real-time notifications
   */
  private setupSocketConnection() {
    if (!this.authToken) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) return;

    try {
      this.socket = io(socketUrl, {
        query: { token: this.authToken },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        // ALWAYS log connection for debugging
        console.log('[RealtimeNotificationHub] ✅ Socket.IO connected:', {
          socketId: this.socket?.id,
          userId: this.userId,
          userRole: this.userRole
        });
        this.joinRooms();
        // Fetch any missed notifications when connecting
        this.fetchMissedNotifications();
      });

      this.socket.on('disconnect', (reason: string) => {
        this.isConnected = false;
        // ALWAYS log disconnection for debugging
        console.log('[RealtimeNotificationHub] ❌ Socket.IO disconnected:', { reason });
        // Start polling fallback when Socket.IO disconnects
        this.startPollingFallback();
        // Immediately fetch missed notifications on disconnect (catches anything in-flight)
        setTimeout(() => this.fetchMissedNotifications(), 2000);
      });

      this.socket.on('connect_error', () => {
        this.reconnectAttempts++;
        // Start polling fallback when Socket.IO fails to connect
        this.startPollingFallback();
      });

      this.socket.on('notification', (notification: RealtimeNotification) => {
        // ALWAYS log notification receipt for debugging
        console.log('[RealtimeNotificationHub] 📨 Socket.IO received notification:', {
          id: notification.id,
          title: notification.title,
          userId: notification.userId,
          targetUserId: notification.targetUserId,
          targetRole: notification.targetRole,
          type: notification.type
        });
        this.handleIncomingNotification(notification);
      });

      this.socket.on('pr:submitted', (data) => this.handlePRNotification('submitted', data));
      this.socket.on('pr:approved', (data) => this.handlePRNotification('approved', data));
      this.socket.on('pr:rejected', (data) => this.handlePRNotification('rejected', data));
      this.socket.on('pr:reapproved', (data) => this.handlePRNotification('reapproved', data));
      this.socket.on('pr:forwarded', (data) => this.handlePRNotification('forwarded', data));

      // Listen for room join confirmation
      this.socket.on('room_joined', (data) => {
        if (import.meta.env.DEV) {
          console.log('[RealtimeNotificationHub] ✅ Room joined:', data);
        }
      });

      // Listen for connected event from server
      this.socket.on('connected', (data) => {
        if (import.meta.env.DEV) {
          console.log('[RealtimeNotificationHub] 🎉 Server confirmed connection:', data);
        }
      });

    } catch (error) {
      console.error('[RealtimeNotificationHub] Socket.IO setup error:', error);
    }
  }

  /**
   * Join Socket.IO rooms based on user ID and role
   */
  private joinRooms() {
    if (!this.socket || !this.isConnected) return;

    if (this.userId) {
      // ALWAYS log room joining for debugging
      console.log(`[RealtimeNotificationHub] 🚪 Joining user room: user_${this.userId}`);
      this.socket.emit('join:user', this.userId);
    }

    if (this.userRole) {
      // ALWAYS log room joining for debugging
      console.log(`[RealtimeNotificationHub] 🚪 Joining role room: role_${this.userRole}`);
      this.socket.emit('join:role', this.userRole);
    }
  }

  /**
   * Start polling as backup - always runs regardless of Socket.IO status
   * Acts as a safety net for server restarts, silent disconnections, etc.
   */
  private startPollingFallback() {
    console.log('[RealtimeNotificationHub] Starting polling backup (safety net)');
    // Lazy import to avoid circular dependency
    import('./notificationPollingService').then(({ notificationPollingService }) => {
      notificationPollingService.startPolling();
    });
  }

  /**
   * Handle incoming notification from Socket.IO
   */
  private async handleIncomingNotification(notification: RealtimeNotification) {
    // Deduplicate: Skip if already processed (normalize ID to string for consistent comparison)
    const notificationIdStr = String(notification.id);
    if (this.processedNotificationIds.has(notificationIdStr)) {
      return;
    }
    this.processedNotificationIds.add(notificationIdStr);

    // Clean up old IDs (keep last 100)
    if (this.processedNotificationIds.size > 100) {
      const ids = Array.from(this.processedNotificationIds);
      this.processedNotificationIds = new Set(ids.slice(-50));
    }

    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;
    // Backend sends 'userId' (camelCase), but also check for various formats
    const targetUserId = notification.targetUserId || notification.userId || (notification as any).user_id;

    if (import.meta.env.DEV) {
      console.log('[RealtimeNotificationHub] User check:', {
        targetUserId,
        currentUserId,
        notificationUserId: notification.userId,
        notificationTargetUserId: notification.targetUserId,
        rawNotification: notification,
        match: targetUserId ? String(targetUserId) === String(currentUserId) : 'no target'
      });
    }

    // Check if notification is for current user - ONLY filter if target is specified AND doesn't match
    // If no targetUserId, let it through (role-based or broadcast notification)
    if (targetUserId && currentUserId && String(targetUserId) !== String(currentUserId)) {
      if (import.meta.env.DEV) {
        console.log('[RealtimeNotificationHub] ❌ Skipping - user mismatch');
      }
      return;
    }

    // If notification has a specific targetUserId that matches current user, SKIP role check
    // The backend already determined this notification is for this specific user
    const userIdMatched = targetUserId && currentUserId && String(targetUserId) === String(currentUserId);

    // Check if notification is for current role - ONLY if no specific user was targeted
    // If the notification was sent to a specific user (like estimator from TD), skip role check
    if (!userIdMatched && notification.targetRole && this.userRole) {
      const targetNorm = normalizeRole(notification.targetRole);
      const currentNorm = normalizeRole(this.userRole);

      if (import.meta.env.DEV) {
        console.log('[RealtimeNotificationHub] Role check (no specific user target):', {
          targetRole: targetNorm,
          currentRole: currentNorm
        });
      }

      // Use centralized role matching (handles all abbreviations & variants)
      const isMatch = rolesMatch(notification.targetRole, this.userRole) ||
        targetNorm === 'client' || targetNorm === 'all';

      if (!isMatch) {
        if (import.meta.env.DEV) {
          console.log('[RealtimeNotificationHub] ❌ Skipping - role mismatch');
        }
        return;
      }
    } else if (userIdMatched) {
      if (import.meta.env.DEV) {
        console.log('[RealtimeNotificationHub] ✅ Skipping role check - notification sent to specific user');
      }
    }

    const notificationData = {
      id: String(notification.id),
      type: notification.type || 'info',
      title: notification.title,
      message: notification.message,
      priority: notification.priority || 'medium',
      timestamp: new Date(notification.timestamp || Date.now()),
      read: false,
      metadata: notification.metadata,
      actionUrl: (notification as any).actionUrl,
      actionLabel: (notification as any).actionLabel,
      senderName: notification.senderName,
      category: (notification as any).category || 'system'
    };

    // ALWAYS log when notification passes all checks
    console.log('[RealtimeNotificationHub] ✅ Passed all checks, showing notification:', notification.title);

    // Add to notification store (shows in notification panel + badge count)
    useNotificationStore.getState().addNotification(notificationData);

    // Show in-app notification popup (DIFFERENT from action toasts)
    // This is styled differently to distinguish from your own action feedback
    this.showIncomingNotificationPopup(notification);

    // Show desktop notification (browser notification for when minimized/background)
    this.showDesktopNotification(notification);
  }

  /**
   * Show desktop (browser) notification
   * Only shows when browser tab is in background or minimized
   * When tab is active/focused, user already sees in-app toast
   */
  private async showDesktopNotification(notification: RealtimeNotification) {
    // Prevent duplicate desktop notifications
    const notifId = `desktop_${notification.id}`;
    if (this.shownToastIds.has(notifId)) {
      return;
    }
    this.shownToastIds.add(notifId);

    // Check if browser supports notifications
    if (!('Notification' in window)) {
      return;
    }

    // Check permission
    if (Notification.permission !== 'granted') {
      return;
    }

    // Only show desktop notification when tab is NOT active/visible
    // If user is looking at the app, they'll see the in-app toast
    const isTabVisible = document.visibilityState === 'visible' && document.hasFocus();
    if (isTabVisible) {
      return;
    }

    try {
      const actionUrl = (notification as any).actionUrl || notification.metadata?.actionUrl;

      const desktopNotif = new Notification(notification.title, {
        body: notification.message,
        icon: '/assets/logo.png',
        tag: String(notification.id),
        requireInteraction: notification.priority === 'urgent' || notification.priority === 'high'
      });

      desktopNotif.onclick = () => {
        window.focus();
        desktopNotif.close();
        if (actionUrl) {
          // Use SPA navigation to avoid full page reload
          navigateTo(actionUrl);
        }
      };

      // Auto close after 8 seconds
      setTimeout(() => desktopNotif.close(), 8000);
    } catch {
      // Silent fail
    }
  }

  /**
   * Show in-app notification popup for INCOMING notifications
   * This is styled DIFFERENTLY from action toasts (success/error)
   * Uses info/message style to distinguish from your own actions
   */
  private showIncomingNotificationPopup(notification: RealtimeNotification) {
    // Prevent duplicate toasts for the same notification
    const toastId = String(notification.id);
    if (this.shownToastIds.has(toastId)) {
      return;
    }
    this.shownToastIds.add(toastId);

    // Clean up old toast IDs (keep last 50)
    if (this.shownToastIds.size > 50) {
      const ids = Array.from(this.shownToastIds);
      this.shownToastIds = new Set(ids.slice(-25));
    }

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
    const senderInfo = notification.senderName
      ? `From: ${notification.senderName}`
      : '';

    // Use toast.message() for incoming notifications - different from success/error
    // This creates a neutral-styled notification that looks different from action feedback
    toast.message(`${getIcon()} ${notification.title}`, {
      description: `${notification.message}${senderInfo ? `\n${senderInfo}` : ''}`,
      duration: notification.priority === 'urgent' || notification.priority === 'high' ? 8000 : 5000,
      action: (notification as any).actionUrl ? {
        label: 'View',
        onClick: () => {
          // Use SPA navigation to avoid full page reload
          navigateTo((notification as any).actionUrl);
        }
      } : undefined,
    });
  }

  /**
   * Handle PR-specific notifications
   */
  private async handlePRNotification(type: string, data: any) {
    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;

    const uid = String(currentUserId);
    const isSender = String(data.senderId) === uid ||
                    String(data.submittedBy) === uid ||
                    String(data.rejectedBy) === uid ||
                    String(data.approvedBy) === uid;

    if (isSender) {
      // Sender already gets toast from the component that performed the action
      // No need to show another toast here - would be duplicate
    } else if (rolesMatch(data.targetRole || '', this.userRole || '') || String(data.targetUserId) === uid) {
      // Receiver gets desktop notification + panel notification (no toast)
      const notification: RealtimeNotification = {
        id: `pr-${type}-${data.documentId}-${Date.now()}`,
        type: type === 'rejected' ? 'error' : 'success',
        title: `PR ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        message: `PR ${data.documentId} has been ${type}`,
        priority: 'high',
        timestamp: new Date(),
        metadata: data
      };
      this.handleIncomingNotification(notification);
    }
  }

  private setupAuthListener() {
    // Listen for storage changes (other tabs)
    window.addEventListener('storage', (event) => {
      if (event.key === 'access_token') {
        this.updateCredentials();
        if (this.authToken && this.userId) {
          this.reconnect();
        } else {
          this.disconnect();
        }
      }
    });

    // Poll for credential changes every 2 seconds (catches same-tab login)
    if (this.authPollInterval) clearInterval(this.authPollInterval);
    this.authPollInterval = setInterval(() => {
      const currentToken = localStorage.getItem('access_token');
      if (currentToken && !this.authToken) {
        // User just logged in
        console.log('[RealtimeNotificationHub] 🔑 User logged in, initializing connections...');
        this.updateCredentials();
        if (this.userId) {
          this.setupSocketConnection();
          this.setupSupabaseRealtime();
        }
      } else if (!currentToken && this.authToken) {
        // User just logged out
        console.log('[RealtimeNotificationHub] 🚪 User logged out, disconnecting...');
        this.disconnect();
        this.authToken = null;
        this.userId = null;
      }
    }, 2000);
  }

  private updateCredentials() {
    this.authToken = localStorage.getItem('access_token');
    const userDataStr = localStorage.getItem('user');
    if (userDataStr) {
      try {
        const user = JSON.parse(userDataStr);
        this.userId = String(user.user_id || user.id || user.userId || '');
        // Check multiple possible role fields
        this.userRole = user.role || user.role_name || null;
        // ALWAYS log credentials for debugging notification delivery
        console.log('[RealtimeNotificationHub] 👤 Credentials updated:', {
          userId: this.userId,
          userRole: this.userRole,
          hasToken: !!this.authToken,
          rawUser: user
        });
      } catch {
        this.userId = null;
        this.userRole = null;
      }
    } else {
      this.userId = null;
      this.userRole = null;
    }
  }

  async sendToUser(userId: string, notification: RealtimeNotification) {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit('notification:user', { targetUserId: userId, notification });
  }

  async sendToRole(role: string, notification: RealtimeNotification) {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit('notification:role', { targetRole: role, notification });
  }

  async broadcastPRStatus(type: string, data: any) {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(`pr:${type}`, data);
  }

  reconnect() {
    console.log('[RealtimeNotificationHub] 🔄 Reconnecting...');
    this.updateCredentials();
    this.disconnect();
    this.setupSocketConnection();
    this.setupSupabaseRealtime();
  }

  /**
   * Force re-join rooms - call this if notifications aren't being received
   */
  forceRejoinRooms() {
    console.log('[RealtimeNotificationHub] 🔄 Force re-joining rooms...');
    this.updateCredentials();
    if (this.socket && this.isConnected) {
      this.joinRooms();
    } else {
      console.log('[RealtimeNotificationHub] Socket not connected, reconnecting...');
      this.reconnect();
    }
  }

  disconnect() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.authPollInterval) {
      clearInterval(this.authPollInterval);
      this.authPollInterval = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.supabaseChannel) {
      supabase.removeChannel(this.supabaseChannel);
      this.supabaseChannel = null;
    }
    this.isConnected = false;
  }

  getStatus() {
    return {
      socketConnected: this.isConnected,
      userId: this.userId,
      userRole: this.userRole
    };
  }

  /**
   * Fetch missed notifications from the backend API
   * Called when user logs in, reconnects, or app mounts
   * PUBLIC method so it can be called from App.tsx on mount
   */
  async fetchMissedNotifications() {
    if (!this.authToken) return;

    try {
      const client = await getApiClient();
      if (!client) return;

      // Fetch recent notifications (read + unread) so read notifications persist after page reload
      const response = await client.get('/notifications', {
        params: { unread_only: false, limit: 50 }
      });

      const data = response.data;

      if (data.success && data.notifications && Array.isArray(data.notifications)) {
        const now = Date.now();
        const RECENT_THRESHOLD = 5 * 60 * 1000; // 5 minutes - show popup for recent notifications
        const store = useNotificationStore.getState();
        const existingIds = new Set(store.notifications.map(n => String(n.id)));

        // Collect batch for single store update
        const batch: any[] = [];
        const recentNew: RealtimeNotification[] = [];

        for (const notif of data.notifications) {
          const notification: RealtimeNotification = {
            id: notif.id,
            type: notif.type,
            title: notif.title,
            message: notif.message,
            priority: notif.priority || 'medium',
            timestamp: notif.timestamp || notif.createdAt,
            userId: notif.userId,
            targetUserId: notif.userId,
            targetRole: notif.targetRole,
            senderId: notif.senderId,
            senderName: notif.senderName,
            category: notif.category,
            metadata: {
              ...notif.metadata,
              actionUrl: notif.actionUrl,
              actionLabel: notif.actionLabel
            }
          } as any;

          // Skip if already processed (normalize ID to string)
          const notifIdStr = String(notification.id);
          if (this.processedNotificationIds.has(notifIdStr)) {
            continue;
          }
          this.processedNotificationIds.add(notifIdStr);

          const notificationData = {
            id: String(notification.id),
            type: notification.type || 'info',
            title: notification.title,
            message: notification.message,
            priority: notification.priority || 'medium',
            timestamp: new Date(notification.timestamp || Date.now()),
            read: notif.read === true,
            metadata: notification.metadata,
            actionUrl: (notification as any).actionUrl || notification.metadata?.actionUrl,
            actionLabel: (notification as any).actionLabel || notification.metadata?.actionLabel,
            senderName: notification.senderName,
            category: (notification as any).category || notif.category || notification.metadata?.category || 'system'
          };

          batch.push(notificationData);

          // Track recent + truly new notifications for popups
          const alreadyExists = existingIds.has(notifIdStr);
          const notificationTime = new Date(notification.timestamp || Date.now()).getTime();
          const isRecent = (now - notificationTime) < RECENT_THRESHOLD;
          if (isRecent && !alreadyExists) {
            recentNew.push(notification);
          }
        }

        // Single store update for all notifications
        store.addNotifications(batch);

        // Show popups for recent new notifications
        const isPageHidden = document.hidden || document.visibilityState === 'hidden';
        for (const notification of recentNew) {
          if (isPageHidden) {
            this.showDesktopNotification(notification);
          }
          this.showIncomingNotificationPopup(notification);
        }
      }
    } catch {
      // Silent fail
    }
  }

}

// Export singleton instance
export const realtimeNotificationHub = RealtimeNotificationHub.getInstance();