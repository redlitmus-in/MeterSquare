/**
 * Real-time Notification Hub
 * Manages WebSocket connections and real-time notification delivery
 */

import { io, Socket } from 'socket.io-client';
import { supabase } from '@/api/config';
import { notificationMiddleware } from '@/middleware/notificationMiddleware';
import { getSecureUserData } from '@/utils/notificationSecurity';
import { NotificationConfig } from '@/config/notificationConfig';

interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  targetRole?: string;
  targetUserId?: string;
  senderId?: string;
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
    console.log('🔄 Initializing Realtime Notification Hub...');

    // Get user credentials
    this.updateCredentials();

    // Setup both WebSocket and Supabase real-time
    this.setupSocketConnection();
    this.setupSupabaseRealtime();

    // Listen for auth changes
    this.setupAuthListener();
  }

  /**
   * Setup Socket.IO connection for real-time notifications
   */
  private setupSocketConnection() {
    if (!this.authToken || !this.userId) {
      console.log('No auth credentials, skipping socket connection');
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

    try {
      this.socket = io(socketUrl, {
        auth: {
          token: this.authToken,
          userId: this.userId,
          userRole: this.userRole
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts
      });

      // Connection events
      this.socket.on('connect', () => {
        console.log('✅ Socket.IO connected for real-time notifications');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Join user and role rooms
        this.joinRooms();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
        this.isConnected = false;
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error.message);
        this.reconnectAttempts++;
      });

      // Notification events
      this.socket.on('notification', (notification: RealtimeNotification) => {
        this.handleIncomingNotification(notification);
      });

      this.socket.on('pr:submitted', (data) => {
        this.handlePRNotification('submitted', data);
      });

      this.socket.on('pr:approved', (data) => {
        this.handlePRNotification('approved', data);
      });

      this.socket.on('pr:rejected', (data) => {
        this.handlePRNotification('rejected', data);
      });

      this.socket.on('pr:reapproved', (data) => {
        this.handlePRNotification('reapproved', data);
      });

      this.socket.on('pr:forwarded', (data) => {
        this.handlePRNotification('forwarded', data);
      });

    } catch (error) {
      console.error('Failed to setup Socket.IO connection:', error);
    }
  }

  /**
   * Setup Supabase real-time for database changes
   */
  private setupSupabaseRealtime() {
    if (!this.userId || !this.userRole) {
      console.log('No user credentials, skipping Supabase realtime');
      return;
    }

    try {
      // Subscribe to notifications table for current user
      this.supabaseChannel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `target_user_id=eq.${this.userId}`
          },
          (payload) => {
            console.log('New notification from database:', payload);
            this.handleDatabaseNotification(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `target_role=eq.${this.userRole}`
          },
          (payload) => {
            console.log('New role notification from database:', payload);
            this.handleDatabaseNotification(payload.new);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Supabase realtime subscribed');
          }
        });

    } catch (error) {
      console.error('Failed to setup Supabase realtime:', error);
    }
  }

  /**
   * Join Socket.IO rooms based on user ID and role
   */
  private joinRooms() {
    if (!this.socket || !this.isConnected) return;

    // Join user-specific room
    if (this.userId) {
      this.socket.emit('join:user', this.userId);
      console.log(`Joined user room: ${this.userId}`);
    }

    // Join role-specific room
    if (this.userRole) {
      this.socket.emit('join:role', this.userRole);
      console.log(`Joined role room: ${this.userRole}`);
    }
  }

  /**
   * Handle incoming notification from Socket.IO
   */
  private async handleIncomingNotification(notification: RealtimeNotification) {
    console.log('Received real-time notification:', notification);

    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;

    // Check if notification is for current user
    if (notification.targetUserId && notification.targetUserId !== currentUserId) {
      console.log('Notification not for current user');
      return;
    }

    // Check if notification is for current role
    if (notification.targetRole) {
      const targetRole = notification.targetRole.toLowerCase().replace(/[\s-_]/g, '');
      const currentRole = this.userRole?.toLowerCase().replace(/[\s-_]/g, '');

      if (targetRole !== currentRole) {
        console.log('Notification not for current role');
        return;
      }
    }

    // Determine if user is sender or receiver
    const isSender = notification.senderId === currentUserId;

    // Process notification based on sender/receiver status
    if (isSender) {
      // Sender gets simple confirmation
      await notificationMiddleware.sendSystemNotification(
        'success',
        'Action Confirmed',
        notification.message
      );
    } else {
      // Receiver gets full notification
      await notificationMiddleware.sendNotification({
        id: notification.id,
        type: notification.type as any,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        timestamp: notification.timestamp,
        targetUserId: notification.targetUserId,
        targetRole: notification.targetRole,
        metadata: notification.metadata
      });
    }
  }

  /**
   * Handle PR-specific notifications
   */
  private async handlePRNotification(type: string, data: any) {
    console.log(`Received PR ${type} notification:`, data);

    const userData = getSecureUserData();
    const currentUserId = userData?.id || userData?.userId;

    // Check if current user is the sender
    const isSender = data.senderId === currentUserId ||
                    data.submittedBy === currentUserId ||
                    data.rejectedBy === currentUserId ||
                    data.approvedBy === currentUserId;

    if (isSender) {
      // Sender confirmation
      const message = `PR ${data.documentId} ${type} successfully`;
      await notificationMiddleware.sendSystemNotification('success', 'Action Confirmed', message);
    } else if (data.targetRole === this.userRole || data.targetUserId === currentUserId) {
      // Receiver notification
      await notificationMiddleware.sendPRNotification(type as any, {
        documentId: data.documentId,
        projectName: data.projectName,
        submittedBy: data.submittedBy,
        rejectedBy: data.rejectedBy,
        reapprovedBy: data.reapprovedBy,
        currentStep: data.currentStep,
        nextRole: data.nextRole,
        reason: data.reason,
        amount: data.amount
      });
    }
  }

  /**
   * Handle notification from Supabase database
   */
  private async handleDatabaseNotification(notification: any) {
    console.log('Database notification received:', notification);

    // Convert database notification to our format
    const realtimeNotification: RealtimeNotification = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message || notification.body,
      priority: notification.priority || 'medium',
      timestamp: new Date(notification.created_at),
      targetRole: notification.target_role,
      targetUserId: notification.target_user_id,
      senderId: notification.sender_id,
      senderName: notification.sender_name,
      metadata: notification.metadata
    };

    await this.handleIncomingNotification(realtimeNotification);
  }

  /**
   * Setup auth listener
   */
  private setupAuthListener() {
    // Listen for storage changes
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
  }

  /**
   * Update credentials from storage
   */
  private updateCredentials() {
    this.authToken = localStorage.getItem('access_token');
    const userData = getSecureUserData();
    this.userRole = userData?.role || null;
    this.userId = userData?.id || userData?.userId || null;
  }

  /**
   * Send notification to specific user
   */
  async sendToUser(userId: string, notification: RealtimeNotification) {
    if (!this.socket || !this.isConnected) {
      console.warn('Socket not connected, cannot send notification');
      return;
    }

    this.socket.emit('notification:user', {
      targetUserId: userId,
      notification
    });
  }

  /**
   * Send notification to role
   */
  async sendToRole(role: string, notification: RealtimeNotification) {
    if (!this.socket || !this.isConnected) {
      console.warn('Socket not connected, cannot send notification');
      return;
    }

    this.socket.emit('notification:role', {
      targetRole: role,
      notification
    });
  }

  /**
   * Broadcast PR status change
   */
  async broadcastPRStatus(type: string, data: any) {
    if (!this.socket || !this.isConnected) {
      console.warn('Socket not connected, cannot broadcast');
      return;
    }

    this.socket.emit(`pr:${type}`, data);
  }

  /**
   * Reconnect to services
   */
  reconnect() {
    this.disconnect();
    this.setupSocketConnection();
    this.setupSupabaseRealtime();
  }

  /**
   * Disconnect from services
   */
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

  /**
   * Get connection status
   */
  getStatus() {
    return {
      socketConnected: this.isConnected,
      supabaseConnected: this.supabaseChannel ? true : false,
      userId: this.userId,
      userRole: this.userRole
    };
  }

  /**
   * Test real-time notification
   */
  async testRealtimeNotification() {
    const testNotification: RealtimeNotification = {
      id: `realtime-test-${Date.now()}`,
      type: 'info',
      title: '🔄 Real-time Test',
      message: 'Real-time notifications are working!',
      priority: 'high',
      timestamp: new Date(),
      targetUserId: this.userId || undefined,
      targetRole: this.userRole || undefined,
      metadata: {
        test: true
      }
    };

    await this.handleIncomingNotification(testNotification);
  }
}

// Export singleton instance
export const realtimeNotificationHub = RealtimeNotificationHub.getInstance();

// Make available globally for testing
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).realtimeHub = realtimeNotificationHub;
  (window as any).testRealtimeNotification = () => realtimeNotificationHub.testRealtimeNotification();
}