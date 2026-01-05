/**
 * Notification Panel Component
 * Shows stored notifications with bell icon and dropdown panel
 * Includes desktop notification permission toggle
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellOff,
  X,
  Check,
  CheckCheck,
  Trash2,
  MessageCircle,
  AlertCircle,
  CheckCircle,
  Clock,
  Settings
} from 'lucide-react';
import {
  StoredNotification,
  getStoredNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
  deleteNotification,
  getUnreadNotificationCount,
  requestNotificationPermission,
  getNotificationPermission,
  isNotificationSupported
} from '@/utils/supportNotificationHelper';

interface NotificationPanelProps {
  onNavigate?: (url: string) => void;
  className?: string;
  currentUserRole?: string;
  currentUserEmail?: string;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({
  onNavigate,
  className = '',
  currentUserRole,
  currentUserEmail
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const panelRef = useRef<HTMLDivElement>(null);

  // Load notifications - filter by role if provided
  const loadNotifications = () => {
    let allNotifications = getStoredNotifications();

    // Filter notifications by current user role/email if provided
    if (currentUserRole || currentUserEmail) {
      allNotifications = allNotifications.filter(n => {
        // Normalize roles for comparison (case-insensitive, handle underscores/hyphens)
        const normalizeRole = (role: string) => role?.toLowerCase().replace(/[_\s]/g, '-') || '';
        const normalizedTargetRole = normalizeRole(n.targetRole || '');
        const normalizedCurrentRole = normalizeRole(currentUserRole || '');
        const normalizedReporterRole = normalizeRole(n.reporterRole || '');

        // Check if notification is targeted to this user
        // 1. Check by email first (most specific)
        if (n.targetEmail && currentUserEmail) {
          if (n.targetEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
            return true;
          }
        }

        // 2. Check by targetRole
        if (n.targetRole) {
          // 'admin' role notifications go to support-management page
          if (normalizedTargetRole === 'admin' && normalizedCurrentRole === 'admin') {
            return true;
          }
          // 'all' means everyone can see it
          if (normalizedTargetRole === 'all') {
            return true;
          }
          // Match by role
          if (normalizedTargetRole === normalizedCurrentRole) {
            return true;
          }
        }

        // 3. Check if current user is the reporter (by email or role)
        if (n.reporterEmail && currentUserEmail) {
          if (n.reporterEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
            return true;
          }
        }
        if (normalizedReporterRole && normalizedCurrentRole) {
          if (normalizedReporterRole === normalizedCurrentRole) {
            return true;
          }
        }

        // 4. If no targeting specified, show to all
        if (!n.targetRole && !n.targetEmail) {
          return true;
        }

        return false;
      });
    }

    setNotifications(allNotifications);
    setUnreadCount(allNotifications.filter(n => !n.isRead).length);
  };

  // Check desktop notification permission
  useEffect(() => {
    if (isNotificationSupported()) {
      setDesktopPermission(getNotificationPermission());
    } else {
      setDesktopPermission('unsupported');
    }
  }, []);

  // Initial load and refresh every 3 seconds for faster updates
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 3000);
    return () => clearInterval(interval);
  }, [currentUserRole, currentUserEmail]);

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

  const handleNotificationClick = (notification: StoredNotification) => {
    markNotificationAsRead(notification.id);
    loadNotifications();

    if (notification.url && onNavigate) {
      onNavigate(notification.url);
    } else if (notification.url) {
      window.location.href = notification.url;
    }

    setIsOpen(false);
  };

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead();
    loadNotifications();
  };

  const handleClearAll = () => {
    clearAllNotifications();
    loadNotifications();
  };

  const handleDeleteNotification = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    deleteNotification(notificationId);
    loadNotifications();
  };

  const handleToggleDesktopNotifications = async () => {
    if (desktopPermission === 'unsupported') return;

    const permission = await requestNotificationPermission();
    setDesktopPermission(permission);
  };

  const getNotificationIcon = (type: StoredNotification['type']) => {
    switch (type) {
      case 'new_ticket':
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case 'status_change':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'new_comment':
        return <MessageCircle className="w-4 h-4 text-purple-500" />;
      case 'admin_response':
        return <Check className="w-4 h-4 text-emerald-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-500" />;
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
                Notifications
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
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Clear all notifications"
                  >
                    <Trash2 className="w-4 h-4" />
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
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <Bell className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No notifications yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    You'll see updates here when they happen
                  </p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !notification.isRead ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notification.title}
                          </p>
                          <button
                            onClick={(e) => handleDeleteNotification(e, notification.id)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                          {notification.body}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(notification.timestamp)}
                          </span>
                          {notification.ticketNumber && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {notification.ticketNumber}
                            </span>
                          )}
                          {!notification.isRead && (
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

export default NotificationPanel;
