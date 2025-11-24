/**
 * Real-time Notification Hub
 * Manages WebSocket and Supabase connections for real-time notification delivery
 */

import { io, Socket } from 'socket.io-client';
import { supabase } from '@/api/config';
import { getSecureUserData } from '@/utils/notificationSecurity';
import { useNotificationStore } from '@/store/notificationStore';
import { toast } from 'sonner';

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
    if (notification.targetRole) {
      const targetRole = notification.targetRole.toLowerCase().replace(/[\s-_]/g, '');
      const currentRole = this.userRole?.toLowerCase().replace(/[\s-_]/g, '');
      if (targetRole !== currentRole) {
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

    // Add to notification store (shows in notification panel)
    useNotificationStore.getState().addNotification(notificationData);

    // Show toast notification
    const toastType = notification.type === 'error' ? 'error' :
                      notification.type === 'warning' ? 'warning' :
                      notification.type === 'success' || notification.type === 'approval' ? 'success' : 'info';

    if (toastType === 'success') {
      toast.success(notification.title, { description: notification.message });
    } else if (toastType === 'error') {
      toast.error(notification.title, { description: notification.message });
    } else if (toastType === 'warning') {
      toast.warning(notification.title, { description: notification.message });
    } else {
      toast.info(notification.title, { description: notification.message });
    }

    // Show desktop notification (browser notification)
    this.showDesktopNotification(notification);
  }

  /**
   * Show desktop (browser) notification
   */
  private async showDesktopNotification(notification: RealtimeNotification) {
    // Check if browser supports notifications
    if (!('Notification' in window)) return;

    // Check permission
    if (Notification.permission === 'default') {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
    } else if (Notification.permission !== 'granted') {
      return;
    }

    // Create desktop notification
    try {
      const desktopNotif = new Notification(notification.title, {
        body: notification.message,
        icon: '/assets/logo.png',
        badge: '/assets/logofavi.png',
        tag: notification.id,
        requireInteraction: notification.priority === 'urgent' || notification.priority === 'high',
        silent: false
      });

      // Handle click - focus window and navigate if actionUrl exists
      desktopNotif.onclick = () => {
        window.focus();
        desktopNotif.close();
        if ((notification as any).actionUrl) {
          window.location.href = (notification as any).actionUrl;
        }
      };

      // Auto close after 10 seconds for non-urgent
      if (notification.priority !== 'urgent' && notification.priority !== 'high') {
        setTimeout(() => desktopNotif.close(), 10000);
      }
    } catch (error) {
      console.error('❌ Desktop notification failed:', error);
      console.error('Notification data:', {
        title: notification.title,
        hasMessage: !!notification.message,
        priority: notification.priority,
        permission: Notification.permission
      });
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
      const message = `PR ${data.documentId} ${type} successfully`;
      toast.success('Action Confirmed', { description: message });
    } else if (data.targetRole === this.userRole || data.targetUserId === currentUserId) {
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
        this.userRole = user.role || null;
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
   * Called when user logs in or reconnects
   */
  private async fetchMissedNotifications() {
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
        console.log(`Checking for missed notifications... Found ${data.notifications.length} unsynced notifications out of ${data.total || 0} total`);

        // Process each notification
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

          // Add to store silently (no toast for old notifications)
          if (!this.processedNotificationIds.has(notification.id)) {
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

            // Add to notification store (shows in notification panel)
            useNotificationStore.getState().addNotification(notificationData);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch missed notifications:', error);
    }
  }

}

// Export singleton instance
export const realtimeNotificationHub = RealtimeNotificationHub.getInstance();