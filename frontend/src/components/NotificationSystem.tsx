import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  X,
  Info,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Banknote,
  FileText,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Trash2,
  Mail,
  BellRing,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/utils/dateFormatter';
import { useNotificationStore } from '@/store/notificationStore';
import { NotificationData } from '@/services/notificationService';
import { cn } from '@/lib/utils';
import { getNotificationRedirectPath, buildNotificationUrl } from '@/utils/notificationRedirects';
import { useAuthStore } from '@/store/authStore';
import { buildRolePath } from '@/utils/roleRouting';

interface NotificationSystemProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  maxNotifications?: number;
  onNavigate?: (path: string) => void; // Optional custom navigation handler
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({
  position = 'top-right',
  maxNotifications = 5,
  onNavigate
}) => {
  const navigate = useNavigate();

  const { user } = useAuthStore();

  const {
    notifications,
    unreadCount,
    isPermissionGranted,
    isPermissionRequested,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    requestPermission
  } = useNotificationStore();

  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  // Delay rendering to prevent flash during page load
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 300); // Wait for page to load before showing bell icon
    return () => clearTimeout(timer);
  }, []);

  // Refs for click outside detection
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Handle click outside with proper cleanup
  useEffect(() => {
    if (!showPanel) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)) {
        setShowPanel(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPanel]);

  // Request notification permission on first load
  useEffect(() => {
    if (!isPermissionRequested) {
      const timer = setTimeout(() => {
        requestPermission();
      }, 2000);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isPermissionRequested, requestPermission]);



  const getNotificationIcon = useCallback((type: NotificationData['type']) => {
    switch (type) {
      case 'email':
        return <Mail className="w-5 h-5" />;
      case 'approval':
        return <Clock className="w-5 h-5" />;
      case 'alert':
        return <AlertTriangle className="w-5 h-5" />;
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
      case 'update':
        return <TrendingUp className="w-5 h-5" />;
      case 'reminder':
        return <Calendar className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  }, []);

  const getNotificationColor = useCallback((type: NotificationData['type']) => {
    switch (type) {
      case 'email':
        return 'text-blue-600 bg-blue-100';
      case 'approval':
        return 'text-[#243d8a] bg-[#243d8a]/10';
      case 'alert':
        return 'text-amber-600 bg-amber-100';
      case 'success':
        return 'text-green-600 bg-green-100';
      case 'error':
        return 'text-red-600 bg-red-100';
      case 'info':
        return 'text-gray-600 bg-gray-100';
      case 'update':
        return 'text-purple-600 bg-purple-100';
      case 'reminder':
        return 'text-indigo-600 bg-indigo-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }, []);

  const getPriorityColor = useCallback((priority: NotificationData['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'medium':
        return 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30';
      case 'low':
        return 'bg-gray-100 text-gray-600 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  }, []);

  // Notification counts
  const counts = useMemo(() => {
    const all = notifications.length;
    const unread = notifications.filter(n => !n.read).length;
    const urgent = notifications.filter(n => n.priority === 'urgent' && !n.read).length;
    return { all, unread, urgent };
  }, [notifications]);

  // Notifications are already sanitized in notificationStore.addNotification via sanitizeNotificationData
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (activeTab === 'unread' && n.read) return false;
      return true;
    });
  }, [notifications, activeTab]);

  const formatTimestamp = useCallback((date: Date) => {
    return formatRelativeTime(date);
  }, []);

  // NOTE: removeToast callback removed - toast is now handled by realtimeNotificationHub.ts

  // Helper: navigate to a path (SPA-aware, closes panel, marks read)
  const doNavigate = useCallback((path: string, notificationId?: string) => {
    setShowPanel(false);

    try {
      if (onNavigate) {
        if (notificationId) markAsRead(notificationId);
        onNavigate(path);
        return;
      }

      if (notificationId) markAsRead(notificationId);

      const currentPathname = window.location.pathname;
      const targetPathname = path.split('?')[0].split('#')[0];
      const navState = { from: currentPathname, notification: notificationId, autoFocus: true, ts: Date.now() };

      if (currentPathname === targetPathname) {
        // Same-page navigation: defer to next tick so the panel-close state update
        // and the route change are processed in separate React render cycles.
        // Without this, React 18 batching can prevent useSearchParams from
        // detecting the URL change when the pathname hasn't changed.
        setTimeout(() => {
          navigate(path, { replace: true, state: navState });
        }, 0);
      } else {
        navigate(path, { replace: false, state: navState });
      }
    } catch (error) {
      console.error('[NotificationSystem] Navigation error:', error);
      window.location.href = path;
    }
  }, [navigate, onNavigate, markAsRead]);

  // Notification click handler: determines the correct redirect path
  const handleNotificationAction = useCallback((notification: NotificationData) => {
    const userRole = user?.role || '';

    // ── PRIORITY 1: Smart content-based redirect (handles all 50+ notification types) ──
    const redirectConfig = getNotificationRedirectPath(notification, userRole);
    if (redirectConfig) {
      const redirectUrl = buildNotificationUrl(redirectConfig);
      doNavigate(redirectUrl, String(notification.id));
      return;
    }

    // ── PRIORITY 2: Backend actionUrl (already has role-prefix from server) ──
    const backendUrl = notification.actionUrl || notification.metadata?.actionUrl || notification.metadata?.action_url;
    if (backendUrl && typeof backendUrl === 'string' && backendUrl.startsWith('/')) {
      doNavigate(backendUrl, String(notification.id));
      return;
    }

    // ── PRIORITY 3: metadata.link (legacy fallback) ──
    if (notification.metadata?.link) {
      const link = notification.metadata.link;
      if (link.startsWith('http')) {
        window.open(link, '_blank', 'noopener,noreferrer');
      } else {
        doNavigate(link.startsWith('/') ? link : `/${link}`, String(notification.id));
        return;
      }
    }

    // No redirect available – just mark as read
    markAsRead(String(notification.id));
  }, [markAsRead, doNavigate, user]);

  // Register desktop notification click handler
  useEffect(() => {
    // Import notification service and register click handler
    import('@/services/notificationService').then(({ notificationService }) => {
      notificationService.setNotificationClickHandler((notification) => {
        // Use the same handler as panel notifications
        handleNotificationAction(notification);
      });
    });

    // Listen for service worker messages (for when notification is clicked while window is open)
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        handleNotificationAction(event.data.notification);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      // Cleanup handlers on unmount
      import('@/services/notificationService').then(({ notificationService }) => {
        notificationService.setNotificationClickHandler(null as any);
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [handleNotificationAction]);

  // Position classes for toast notifications
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  // Don't render until page is loaded to prevent flash during loading
  if (!isReady) {
    return null;
  }

  return (
    <>
      {/* Notification Bell Icon */}
      <div className="relative">
        <Button
          ref={buttonRef}
          variant="outline"
          size="icon"
          onClick={() => setShowPanel(!showPanel)}
          className="relative"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
          {counts.urgent > 0 && (
            <motion.span
              className="absolute -top-1 -left-1 w-2 h-2 bg-orange-500 rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          )}
        </Button>
      </div>

      {/* Notification Panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={cn(
              "fixed sm:absolute inset-x-2 sm:inset-x-auto sm:right-0 top-14 sm:top-full sm:mt-2 bg-white rounded-lg shadow-xl border z-[9999] overflow-hidden",
              "sm:w-[380px] max-h-[85vh] sm:max-h-[480px]"
            )}
          >
            {/* Header - Compact on mobile */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Bell className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                  <h3 className="font-semibold text-xs sm:text-sm">Notifications</h3>
                  {counts.unread > 0 && (
                    <Badge className="bg-white/20 text-white text-[10px] sm:text-xs px-1 sm:px-1.5 py-0">
                      {counts.unread}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1">
                  {counts.unread > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={markAllAsRead}
                      className="text-white hover:bg-white/10 h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs"
                      title="Mark all as read"
                    >
                      <Check className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (notifications.length === 0) {
                        return;
                      }
                      if (window.confirm('Are you sure you want to clear all notifications?')) {
                        clearAll();
                      }
                    }}
                    disabled={notifications.length === 0}
                    className={`h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs ${
                      notifications.length > 0
                        ? 'text-white hover:bg-red-500/80'
                        : 'text-white/50 cursor-not-allowed'
                    }`}
                    title={notifications.length > 0 ? "Clear all notifications" : "No notifications to clear"}
                  >
                    <Trash2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1" />
                    Clear All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      // Build role-based path for notifications
                      const userRole = String(user?.role_id || user?.role || '');
                      const notificationsPath = buildRolePath(userRole, '/notifications');
                      navigate(notificationsPath);
                      setShowPanel(false);
                    }}
                    className="text-white hover:bg-white/10 h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs"
                    title="View all notifications"
                  >
                    View All
                  </Button>
                  {!isPermissionGranted && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={requestPermission}
                      className="text-white hover:bg-white/10 h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs hidden sm:flex"
                      title="Enable desktop notifications"
                    >
                      <BellRing className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPanel(false)}
                    className="text-white hover:bg-white/10 h-6 sm:h-7 w-6 sm:w-7 p-0"
                  >
                    <X className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Tabs - Simplified, Compact on mobile */}
            <div className="border-b border-gray-200 bg-gray-50">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 px-3 py-2 text-center text-[11px] sm:text-xs font-medium transition-colors ${activeTab === 'all'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                  All {counts.all > 0 && `(${counts.all})`}
                </button>
                <button
                  onClick={() => setActiveTab('unread')}
                  className={`flex-1 px-3 py-2 text-center text-[11px] sm:text-xs font-medium transition-colors flex items-center justify-center gap-1 ${activeTab === 'unread'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                  Unread
                  {counts.unread > 0 && (
                    <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px]">
                      {counts.unread}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Notifications Content */}
            <div className="flex-1 overflow-hidden">
              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto max-h-[calc(85vh-100px)] sm:h-[400px]">
                {filteredNotifications.length === 0 ? (
                  <div className="p-6 sm:p-8 text-center">
                    <Bell className="w-10 sm:w-12 h-10 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                    <p className="text-gray-500 text-sm">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredNotifications.map((notification) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-2.5 sm:p-3 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.read ? 'bg-[#243d8a]/5/30' : ''
                          }`}
                        onClick={() => handleNotificationAction(notification)}
                      >
                        <div className="flex items-start gap-2 sm:gap-3">
                          <div className={`p-1 sm:p-1.5 rounded-md flex-shrink-0 ${getNotificationColor(notification.type)}`}>
                            <span className="[&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-5 sm:[&>svg]:h-5">
                              {getNotificationIcon(notification.type)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-xs sm:text-sm text-gray-900 mb-0.5 sm:mb-1 line-clamp-2">
                              {notification.title}
                            </h4>
                            <p className="text-[10px] sm:text-xs text-gray-600 mb-1.5 sm:mb-2 line-clamp-2">
                              {notification.message}
                            </p>

                            {/* Metadata - Hidden on mobile for compactness */}
                            {notification.metadata && (
                              <div className="hidden sm:flex flex-wrap gap-1.5 mb-2">
                                {notification.metadata.project && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                    <FileText className="w-3 h-3 mr-1" />
                                    {notification.metadata.project}
                                  </Badge>
                                )}
                                {notification.metadata.amount && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                    <Banknote className="w-3 h-3 mr-1" />
                                    AED {notification.metadata.amount.toLocaleString()}
                                  </Badge>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                                <span className="text-[10px] sm:text-xs text-gray-400 whitespace-nowrap">
                                  <Clock className="w-2.5 sm:w-3 h-2.5 sm:h-3 inline mr-0.5" />
                                  {formatTimestamp(notification.timestamp)}
                                </span>
                                {notification.metadata?.sender && (
                                  <span className="text-[10px] sm:text-xs text-gray-500 truncate">
                                    <Users className="w-2.5 sm:w-3 h-2.5 sm:h-3 inline mr-0.5 sm:mr-1" />
                                    {notification.metadata.sender}
                                  </span>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                                <Badge className={`text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0 sm:py-0.5 ${getPriorityColor(notification.priority)} border`}>
                                  {notification.priority}
                                </Badge>
                                {!notification.read && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(String(notification.id));
                                    }}
                                    className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                                    title="Mark as read"
                                  >
                                    <Check className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(String(notification.id));
                                  }}
                                  className="h-5 w-5 sm:h-6 sm:w-6 p-0 text-gray-400 hover:text-red-600"
                                  title="Delete"
                                >
                                  <X className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NOTE: Toast notifications section removed - now handled by realtimeNotificationHub.ts
          This prevents duplicate toast popups. The sonner toast from realtimeNotificationHub
          is sufficient for showing incoming notifications. */}
    </>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (692 lines - CRITICAL)
export default React.memo(NotificationSystem);