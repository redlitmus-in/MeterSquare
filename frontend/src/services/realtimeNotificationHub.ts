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
  private fetchMissedCooldown = false; // Prevents duplicate API calls within 3s window

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
        // Send token via Authorization header (production-safe — not logged in access logs)
        // Also include in query for dev/legacy compatibility
        extraHeaders: { Authorization: `Bearer ${this.authToken}` },
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
        // Fetch missed notifications on disconnect (catches anything in-flight)
        this.fetchMissedNotifications();
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
    }).catch((err) => {
      console.error('[RealtimeNotificationHub] CRITICAL: Failed to start polling fallback:', err);
    });
  }

  /**
   * Handle incoming notification from Socket.IO
   */
  private async handleIncomingNotification(notification: RealtimeNotification) {
    // Deduplicate: Track if already processed (normalize ID to string for consistent comparison)
    const notificationIdStr = String(notification.id);
    const alreadyProcessed = this.processedNotificationIds.has(notificationIdStr);

    // If already processed by polling initial load, still show toast but skip store add
    // This prevents the race condition where polling loads silently, then Socket.IO delivers
    // the same notification but can't show the toast because dedup blocks it
    if (alreadyProcessed) {
      // Check if toast was already shown — if so, fully skip
      if (this.shownToastIds.has(notificationIdStr)) {
        return;
      }
      // Toast not shown yet (polling loaded silently) — continue to show toast only
      console.log('[RealtimeNotificationHub] Already in store from polling, showing toast only:', notification.title);
    }

    this.processedNotificationIds.add(notificationIdStr);

    // Clean up old IDs (keep last 500 to prevent pruning recently-seen IDs during rapid dispatch)
    if (this.processedNotificationIds.size > 500) {
      const ids = Array.from(this.processedNotificationIds);
      this.processedNotificationIds = new Set(ids.slice(-250));
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

    // Only add to store if not already loaded by polling (prevents duplicates in bell icon)
    if (!alreadyProcessed) {
      // Add to notification store (shows in notification panel + badge count)
      useNotificationStore.getState().addNotification(notificationData);
    }

    // Show in-app notification popup (DIFFERENT from action toasts)
    // This is styled differently to distinguish from your own action feedback
    // ALWAYS show toast — even if polling already loaded the notification silently
    this.showIncomingNotificationPopup(notification);

    // Show desktop notification (browser notification for when minimized/background)
    this.showDesktopNotification(notification);
  }

  /**
   * Show desktop (browser) notification
   * Shows regardless of tab visibility — user wants OS notification popups
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
      console.warn('[RealtimeNotificationHub] Desktop notifications not supported by browser');
      return;
    }

    // Check permission — request if not yet asked
    if (Notification.permission === 'default') {
      console.log('[RealtimeNotificationHub] Desktop notification permission not yet granted, requesting...');
      try {
        const result = await Notification.requestPermission();
        console.log('[RealtimeNotificationHub] Permission result:', result);
        if (result !== 'granted') return;
      } catch {
        return;
      }
    } else if (Notification.permission === 'denied') {
      console.warn('[RealtimeNotificationHub] Desktop notifications are blocked by user. Enable in browser settings.');
      return;
    }

    // Show desktop notification regardless of tab visibility
    // User explicitly wants OS notification popups alongside in-app toasts
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
        // Use smart redirect (same logic as bell icon)
        import('@/utils/notificationRedirects').then(({ getNotificationRedirectPath, buildNotificationUrl }) => {
          const notifData = {
            id: String(notification.id),
            type: notification.type || 'info',
            title: notification.title,
            message: notification.message,
            category: (notification as any).category || notification.metadata?.category || 'system',
            metadata: notification.metadata,
            actionUrl,
          };
          const redirectConfig = getNotificationRedirectPath(notifData as any, this.userRole || '');
          if (redirectConfig) {
            navigateTo(buildNotificationUrl(redirectConfig));
          } else if (actionUrl) {
            navigateTo(actionUrl);
          }
          useNotificationStore.getState().markAsRead(String(notification.id));
        }).catch(() => {
          if (actionUrl) navigateTo(actionUrl);
        });
      };

      // Auto close after 8 seconds
      setTimeout(() => desktopNotif.close(), 8000);
    } catch (err) {
      console.error('[RealtimeNotificationHub] Failed to show desktop notification:', err);
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

    // Build navigation URL using the same smart redirect system as the bell icon
    const navigateToNotification = () => {
      // Lazy import to avoid circular dependency
      import('@/utils/notificationRedirects').then(({ getNotificationRedirectPath, buildNotificationUrl }) => {
        // Build a notification-like object for the redirect matcher
        const notifData = {
          id: String(notification.id),
          type: notification.type || 'info',
          title: notification.title,
          message: notification.message,
          priority: notification.priority || 'medium',
          category: (notification as any).category || notification.metadata?.category || 'system',
          metadata: notification.metadata,
          actionUrl: (notification as any).actionUrl || notification.metadata?.actionUrl,
        };

        // Priority 1: Smart content-based redirect (same as bell icon)
        const redirectConfig = getNotificationRedirectPath(notifData as any, this.userRole || '');
        if (redirectConfig) {
          const url = buildNotificationUrl(redirectConfig);
          // Mark as read
          useNotificationStore.getState().markAsRead(String(notification.id));
          navigateTo(url);
          return;
        }

        // Priority 2: Backend actionUrl
        const actionUrl = (notification as any).actionUrl || notification.metadata?.actionUrl;
        if (actionUrl) {
          useNotificationStore.getState().markAsRead(String(notification.id));
          navigateTo(actionUrl);
          return;
        }

        // No redirect - just mark as read
        useNotificationStore.getState().markAsRead(String(notification.id));
      }).catch(() => {
        // Fallback: use actionUrl directly
        const actionUrl = (notification as any).actionUrl || notification.metadata?.actionUrl;
        if (actionUrl) navigateTo(actionUrl);
      });
    };

    // Entire toast is clickable — navigates to relevant page (same as bell icon)
    toast.info(`${getIcon()} ${notification.title}`, {
      description: `${notification.message}${senderInfo ? `\n${senderInfo}` : ''}`,
      duration: notification.priority === 'urgent' || notification.priority === 'high' ? 8000 : 5000,
      action: {
        label: 'View →',
        onClick: navigateToNotification,
      },
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
    // CRITICAL: disconnect() kills healthCheck and authPoll intervals.
    // We must restart them, plus the polling safety net, otherwise
    // notifications silently stop arriving after login/reconnect.
    this.setupPeriodicHealthCheck();
    this.startPollingFallback();
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
   * Check if a toast was already shown for a notification ID.
   * Used by polling service to avoid duplicate toasts.
   */
  hasShownToast(notificationId: string): boolean {
    return this.shownToastIds.has(notificationId);
  }

  /**
   * Fetch missed notifications from the backend API
   * Called when user logs in, reconnects, or app mounts
   * PUBLIC method so it can be called from App.tsx on mount
   */
  async fetchMissedNotifications() {
    if (!this.authToken) return;

    // Deduplicate: if called multiple times within 3s (e.g. reconnect + disconnect + App.tsx),
    // only the first call goes through. This prevents 3x API hits on every page load.
    if (this.fetchMissedCooldown) return;
    this.fetchMissedCooldown = true;
    setTimeout(() => { this.fetchMissedCooldown = false; }, 3000);

    try {
      const client = await getApiClient();
      if (!client) return;

      // Fetch recent notifications (read + unread) so read notifications persist after page reload
      const response = await client.get('/notifications', {
        params: { unread_only: false, limit: 100 }
      });

      const data = response.data;

      if (data.success && data.notifications && Array.isArray(data.notifications)) {
        const store = useNotificationStore.getState();

        const batch: any[] = [];

        for (const notif of data.notifications) {
          const notifIdStr = String(notif.id);

          // Track as processed so Socket.IO handleIncomingNotification
          // doesn't re-add to store (but still shows toast)
          this.processedNotificationIds.add(notifIdStr);

          batch.push({
            id: notifIdStr,
            type: notif.type || 'info',
            title: notif.title,
            message: notif.message,
            priority: notif.priority || 'medium',
            timestamp: new Date(notif.timestamp || notif.createdAt || Date.now()),
            read: notif.read === true,
            metadata: {
              ...notif.metadata,
              actionUrl: notif.actionUrl,
              actionLabel: notif.actionLabel
            },
            actionUrl: notif.actionUrl || notif.metadata?.actionUrl,
            actionLabel: notif.actionLabel || notif.metadata?.actionLabel,
            senderName: notif.senderName,
            category: notif.category || notif.metadata?.category || 'system'
          });
        }

        // Single store update — handles dedup internally
        store.addNotifications(batch);

        // Show toasts for recent UNREAD notifications (created within last 2 minutes)
        // Since Socket.IO may be disconnected, this ensures users see toasts on login/reconnect
        const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
        for (const notif of data.notifications) {
          if (notif.read) continue;
          const notifTime = new Date(notif.timestamp || notif.createdAt || 0).getTime();
          if (notifTime <= twoMinutesAgo) continue;

          const notifIdStr = String(notif.id);
          if (this.shownToastIds.has(notifIdStr)) continue;

          // Show toast
          const realtimeNotif: RealtimeNotification = {
            id: notifIdStr,
            type: notif.type || 'info',
            title: notif.title,
            message: notif.message,
            priority: notif.priority || 'medium',
            timestamp: notif.timestamp || notif.createdAt,
            metadata: notif.metadata,
            senderName: notif.senderName
          };
          this.showIncomingNotificationPopup(realtimeNotif);
          this.showDesktopNotification(realtimeNotif);
        }
      }
    } catch {
      // Silent fail
    }
  }

}

// Export singleton instance
export const realtimeNotificationHub = RealtimeNotificationHub.getInstance();