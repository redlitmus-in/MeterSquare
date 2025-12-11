/**
 * Real-time Notification Hub
 * Manages WebSocket and Supabase connections for real-time notification delivery
 */

import { io, Socket } from 'socket.io-client';
import { supabase } from '@/api/config';
import { getSecureUserData } from '@/utils/notificationSecurity';
import { useNotificationStore } from '@/store/notificationStore';
import { toast } from 'sonner';

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
  private maxReconnectAttempts = 5;
  private userId: string | null = null;
  private userRole: string | null = null;
  private authToken: string | null = null;
  private processedNotificationIds: Set<string> = new Set();

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
    // Supabase realtime disabled - Socket.IO is working and handles everything
    // this.setupSupabaseRealtime();
    this.setupAuthListener();
  }

  /**
   * Setup Supabase realtime as fallback
   */
  private setupSupabaseRealtime() {
    if (!this.userId) return;

    try {
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
              senderId: notification.sender_id,
              senderName: notification.sender_name,
              metadata: notification.metadata
            };
            this.handleIncomingNotification(realtimeNotif);
          }
        )
        .subscribe();
    } catch {
      // Silent fail
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
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts,
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.joinRooms();
        // Fetch any missed notifications when connecting
        this.fetchMissedNotifications();
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
      });

      this.socket.on('connect_error', () => {
        this.reconnectAttempts++;
      });

      this.socket.on('notification', (notification: RealtimeNotification) => {
        this.handleIncomingNotification(notification);
      });

      this.socket.on('pr:submitted', (data) => this.handlePRNotification('submitted', data));
      this.socket.on('pr:approved', (data) => this.handlePRNotification('approved', data));
      this.socket.on('pr:rejected', (data) => this.handlePRNotification('rejected', data));
      this.socket.on('pr:reapproved', (data) => this.handlePRNotification('reapproved', data));
      this.socket.on('pr:forwarded', (data) => this.handlePRNotification('forwarded', data));

    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Join Socket.IO rooms based on user ID and role
   */
  private joinRooms() {
    if (!this.socket || !this.isConnected) return;

    if (this.userId) {
      this.socket.emit('join:user', this.userId);
    }

    if (this.userRole) {
      this.socket.emit('join:role', this.userRole);
    }
  }

  /**
   * Handle incoming notification from Socket.IO
   */
  private async handleIncomingNotification(notification: RealtimeNotification) {
    // Deduplicate: Skip if already processed
    if (this.processedNotificationIds.has(notification.id)) {
      return;
    }
    this.processedNotificationIds.add(notification.id);

    // Clean up old IDs (keep last 100)
    if (this.processedNotificationIds.size > 100) {
      const ids = Array.from(this.processedNotificationIds);
      this.processedNotificationIds = new Set(ids.slice(-50));
    }

    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;
    const targetUserId = notification.targetUserId || notification.userId;

    // Check if notification is for current user
    if (targetUserId && String(targetUserId) !== String(currentUserId)) {
      return;
    }

    // Check if notification is for current role
    if (notification.targetRole && this.userRole) {
      const normalizeRole = (role: string) => role.toLowerCase().replace(/[\s\-_]/g, '');
      const targetRole = normalizeRole(notification.targetRole);
      const currentRole = normalizeRole(this.userRole);

      // Also check common role mappings
      const roleMatches = targetRole === currentRole ||
        (targetRole === 'technicaldirector' && (currentRole === 'technicaldirector' || currentRole === 'td')) ||
        (targetRole === 'projectmanager' && (currentRole === 'projectmanager' || currentRole === 'pm')) ||
        (targetRole === 'siteengineer' && (currentRole === 'siteengineer' || currentRole === 'se')) ||
        (targetRole === 'buyer' && (currentRole === 'buyer' || currentRole === 'procurement')) ||
        (targetRole === 'procurement' && (currentRole === 'buyer' || currentRole === 'procurement')) ||
        (targetRole === 'estimator' && (currentRole === 'estimator' || currentRole === 'estimation'));

      if (!roleMatches) {
        return;
      }
    }

    const notificationData = {
      id: notification.id,
      type: notification.type || 'info',
      title: notification.title,
      message: notification.message,
      priority: notification.priority || 'medium',
      timestamp: new Date(notification.timestamp || Date.now()),
      read: false,
      metadata: notification.metadata,
      actionUrl: (notification as any).actionUrl,
      actionLabel: (notification as any).actionLabel,
      senderName: notification.senderName
    };

    // Add to notification store (shows in notification panel + badge count)
    useNotificationStore.getState().addNotification(notificationData);

    // Show in-app notification popup (DIFFERENT from action toasts)
    // This is styled differently to distinguish from your own action feedback
    this.showIncomingNotificationPopup(notification);

    // Also show desktop notification (browser notification)
    this.showDesktopNotification(notification);
  }

  /**
   * Show in-app notification popup for INCOMING notifications
   * This is styled DIFFERENTLY from action toasts (success/error)
   * Uses info/message style to distinguish from your own actions
   */
  private showIncomingNotificationPopup(notification: RealtimeNotification) {
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
          window.location.href = (notification as any).actionUrl;
        }
      } : undefined,
    });
  }

  /**
   * Show desktop (browser) notification
   * Firefox has stricter requirements - check permissions in Firefox settings
   */
  private async showDesktopNotification(notification: RealtimeNotification) {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
      return;
    }

    // Check permission - Firefox may block if not from user gesture
    let permission = Notification.permission;

    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        return;
      }
    }

    if (permission !== 'granted') {
      return;
    }

    // Create desktop notification with Firefox-compatible options
    try {
      const actionUrl = (notification as any).actionUrl || notification.metadata?.actionUrl || notification.metadata?.action_url;

      // Base options that work in all browsers
      const notifOptions: NotificationOptions = {
        body: notification.message,
        icon: window.location.origin + '/assets/logo.png',
        tag: notification.id
      };

      // requireInteraction may cause issues in Firefox - only use for urgent
      if (notification.priority === 'urgent') {
        notifOptions.requireInteraction = true;
      }

      const desktopNotif = new Notification(notification.title, notifOptions);

      // Handle click
      desktopNotif.onclick = () => {
        window.focus();
        desktopNotif.close();
        if (actionUrl) {
          window.location.href = actionUrl;
        }
      };

      // Auto close after 8 seconds
      setTimeout(() => desktopNotif.close(), 8000);
    } catch {
      // Silent fail
    }
  }

  /**
   * Handle PR-specific notifications
   */
  private async handlePRNotification(type: string, data: any) {
    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;

    const isSender = data.senderId === currentUserId ||
                    data.submittedBy === currentUserId ||
                    data.rejectedBy === currentUserId ||
                    data.approvedBy === currentUserId;

    if (isSender) {
      // Sender already gets toast from the component that performed the action
      // No need to show another toast here - would be duplicate
    } else if (data.targetRole === this.userRole || data.targetUserId === currentUserId) {
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
    setInterval(() => {
      const currentToken = localStorage.getItem('access_token');
      if (currentToken && !this.authToken) {
        // User just logged in
        this.updateCredentials();
        if (this.userId) {
          this.setupSocketConnection();
        }
      } else if (!currentToken && this.authToken) {
        // User just logged out
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
    this.updateCredentials();
    this.disconnect();
    this.setupSocketConnection();
  }

  disconnect() {
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
      const baseUrl = import.meta.env.VITE_API_BASE_URL;
      if (!baseUrl) return;

      // Fetch unread notifications from API
      const response = await fetch(`${baseUrl}/notifications?unread_only=true&limit=50`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) return;

      const data = await response.json();

      if (data.success && data.notifications && Array.isArray(data.notifications)) {
        // Process each notification
        const now = Date.now();
        const RECENT_THRESHOLD = 5 * 60 * 1000; // 5 minutes - show popup for recent notifications

        for (const notif of data.notifications) {
          // Convert backend format to frontend format
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
            metadata: {
              ...notif.metadata,
              actionUrl: notif.actionUrl,
              actionLabel: notif.actionLabel
            }
          };

          // Skip if already processed
          if (this.processedNotificationIds.has(notification.id)) {
            continue;
          }
          this.processedNotificationIds.add(notification.id);

          const notificationData = {
            id: notification.id,
            type: notification.type || 'info',
            title: notification.title,
            message: notification.message,
            priority: notification.priority || 'medium',
            timestamp: new Date(notification.timestamp || Date.now()),
            read: false,
            metadata: notification.metadata,
            actionUrl: (notification as any).actionUrl || notification.metadata?.actionUrl,
            actionLabel: (notification as any).actionLabel || notification.metadata?.actionLabel,
            senderName: notification.senderName
          };

          // Add to notification store (shows in notification panel + badge count)
          useNotificationStore.getState().addNotification(notificationData);

          // Check if notification is recent (within 5 minutes)
          const notificationTime = new Date(notification.timestamp || Date.now()).getTime();
          const isRecent = (now - notificationTime) < RECENT_THRESHOLD;

          // Show popup and desktop notification for recent missed notifications
          if (isRecent) {
            this.showIncomingNotificationPopup(notification);
            this.showDesktopNotification(notification);
          }
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[NotificationHub] Failed to fetch missed notifications:', error);
      }
    }
  }

}

// Export singleton instance
export const realtimeNotificationHub = RealtimeNotificationHub.getInstance();