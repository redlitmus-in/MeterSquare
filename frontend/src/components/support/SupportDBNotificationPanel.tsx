/**
 * Support DB Notification Panel
 * Fetches notifications from the database API for the support-management page
 * This is separate from the localStorage-based NotificationPanel to avoid affecting other roles
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellOff,
  X,
  CheckCheck,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageCircle,
  ExternalLink
} from 'lucide-react';
import { API_BASE_URL } from '@/api/config';

interface DBNotification {
  id: number;
  userId: number | null;
  targetRole: string | null;
  type: string;
  title: string;
  message: string;
  priority: string;
  category: string;
  read: boolean;
  actionRequired: boolean;
  actionUrl: string | null;
  actionLabel: string | null;
  metadata: {
    ticket_id?: number;
    ticket_number?: string;
    client_email?: string;
    client_name?: string;
    priority?: string;
    event_type?: string;
    [key: string]: any;
  } | null;
  senderId: number | null;
  senderName: string | null;
  timestamp: string;
  readAt: string | null;
}

interface SupportDBNotificationPanelProps {
  className?: string;
}

const SupportDBNotificationPanel: React.FC<SupportDBNotificationPanelProps> = ({
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const panelRef = useRef<HTMLDivElement>(null);
  const lastNotificationIdRef = useRef<number>(-1); // -1 means not initialized yet

  // Check if desktop notifications are supported
  const isNotificationSupported = () => 'Notification' in window;

  // Request notification permission
  const requestNotificationPermission = async () => {
    if (!isNotificationSupported()) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';

    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch {
      return 'denied';
    }
  };

  // Show desktop notification
  const showDesktopNotification = (notification: DBNotification) => {
    console.log('[Desktop Notification] Attempting to show:', notification.title);

    if (!isNotificationSupported()) {
      console.log('[Desktop Notification] Not supported');
      return;
    }

    if (Notification.permission !== 'granted') {
      console.log('[Desktop Notification] Permission not granted:', Notification.permission);
      return;
    }

    try {
      console.log('[Desktop Notification] Creating notification...');
      const desktopNotif = new Notification(notification.title, {
        body: notification.message,
        icon: '/assets/structo-logo.png',
        tag: `support-${notification.id}`,
        requireInteraction: true, // Keep notification until user interacts
      });

      desktopNotif.onclick = () => {
        window.focus();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
        desktopNotif.close();
      };

      // Auto-close after 15 seconds
      setTimeout(() => desktopNotif.close(), 15000);
      console.log('[Desktop Notification] Notification shown successfully');
    } catch (e) {
      console.error('[Desktop Notification] Error:', e);
    }
  };

  // Fetch notifications from the database API
  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/notifications/support/public?limit=50`);
      const data = await response.json();

      if (data.success) {
        const newNotifications = data.notifications as DBNotification[];
        const latestId = newNotifications[0]?.id ?? 0;

        console.log('[Support Notifications] Fetched:', newNotifications.length, 'notifications');
        console.log('[Support Notifications] Latest ID:', latestId, '| Last known ID:', lastNotificationIdRef.current);

        // Check for new notifications and show desktop notification
        // lastNotificationIdRef is initialized to -1, so first fetch sets it to actual value
        if (lastNotificationIdRef.current >= 0 && newNotifications.length > 0) {
          if (latestId > lastNotificationIdRef.current) {
            // New notification arrived
            const newOnes = newNotifications.filter(n => n.id > lastNotificationIdRef.current);
            console.log('[Support Notifications] NEW notifications detected:', newOnes.length);
            newOnes.forEach(n => {
              if (!n.read) {
                showDesktopNotification(n);
              }
            });
          }
        } else if (lastNotificationIdRef.current === -1) {
          console.log('[Support Notifications] First fetch - initializing lastNotificationIdRef to:', latestId);
        }

        // Always update lastNotificationIdRef (even if 0 notifications, set to 0)
        lastNotificationIdRef.current = latestId;

        setNotifications(newNotifications);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (error) {
      console.error('Error fetching support notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and check desktop notification permission
  useEffect(() => {
    if (isNotificationSupported()) {
      setDesktopPermission(Notification.permission);
    } else {
      setDesktopPermission('unsupported');
    }
    fetchNotifications();
  }, [fetchNotifications]);

  // Poll for notifications - faster when visible, slower when minimized (for desktop notifications)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const POLL_INTERVAL_VISIBLE = 30000; // 30 seconds when tab is visible
    const POLL_INTERVAL_HIDDEN = 60000;  // 60 seconds when tab is hidden/minimized

    const startPolling = (intervalMs: number) => {
      if (interval) clearInterval(interval);
      interval = setInterval(fetchNotifications, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Slower polling when minimized - still need it for desktop notifications
        console.log('[Support Notifications] Tab hidden - switching to slow polling (60s)');
        startPolling(POLL_INTERVAL_HIDDEN);
      } else {
        // Fetch immediately when tab becomes visible, then fast polling
        console.log('[Support Notifications] Tab visible - switching to fast polling (30s)');
        fetchNotifications();
        startPolling(POLL_INTERVAL_VISIBLE);
      }
    };

    // Start polling based on current visibility
    if (document.hidden) {
      startPolling(POLL_INTERVAL_HIDDEN);
    } else {
      startPolling(POLL_INTERVAL_VISIBLE);
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchNotifications]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Mark notifications as read
  const handleMarkAsRead = async (notificationIds: number[]) => {
    try {
      await fetch(`${API_BASE_URL}/notifications/support/public/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: notificationIds })
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length > 0) {
      handleMarkAsRead(unreadIds);
    }
  };

  const handleNotificationClick = (notification: DBNotification) => {
    if (!notification.read) {
      handleMarkAsRead([notification.id]);
    }
    if (notification.actionUrl) {
      // Scroll to ticket if on same page
      const ticketId = notification.metadata?.ticket_id;
      if (ticketId) {
        // Trigger a custom event to expand the ticket
        window.dispatchEvent(new CustomEvent('expandTicket', { detail: { ticketId } }));
      }
    }
    setIsOpen(false);
  };

  const handleToggleDesktopNotifications = async () => {
    if (desktopPermission === 'unsupported') return;
    const permission = await requestNotificationPermission();
    setDesktopPermission(permission);
  };

  const getNotificationIcon = (type: string, eventType?: string) => {
    if (eventType === 'ticket_submitted') {
      return <AlertCircle className="w-4 h-4 text-blue-500" />;
    }
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'error':
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div ref={panelRef} className={`relative ${className}`}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-colors ${
          desktopPermission === 'granted'
            ? 'hover:bg-green-50'
            : 'hover:bg-gray-100'
        }`}
        title={desktopPermission === 'granted' ? 'Notifications enabled' : 'Click to view notifications'}
      >
        {desktopPermission === 'granted' ? (
          <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-green-600' : 'text-green-500'}`} />
        ) : (
          <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-blue-600' : 'text-gray-600'}`} />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Support Notifications
                {unreadCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Notification Toggle */}
            {desktopPermission !== 'unsupported' && (
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                <button
                  onClick={handleToggleDesktopNotifications}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                    desktopPermission === 'granted'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    {desktopPermission === 'granted' ? (
                      <Bell className="w-4 h-4" />
                    ) : (
                      <BellOff className="w-4 h-4" />
                    )}
                    Desktop Notifications
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    desktopPermission === 'granted'
                      ? 'bg-green-200 text-green-800'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {desktopPermission === 'granted' ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            )}

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {isLoading && notifications.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-sm">Loading...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <Bell className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No notifications yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    You'll see new ticket alerts here
                  </p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !notification.read ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getNotificationIcon(notification.type, notification.metadata?.event_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notification.title}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(notification.timestamp)}
                          </span>
                          {notification.metadata?.ticket_number && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {notification.metadata.ticket_number}
                            </span>
                          )}
                          {notification.metadata?.priority && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              notification.metadata.priority === 'critical' || notification.metadata.priority === 'high'
                                ? 'bg-red-100 text-red-600'
                                : notification.metadata.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-600'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {notification.metadata.priority}
                            </span>
                          )}
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SupportDBNotificationPanel;
