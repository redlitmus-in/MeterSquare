import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom'; // Add router imports
import {
  Bell,
  Check,
  X,
  AlertCircle,
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
  ChevronRight,
  Mail,
  BellRing,
  Search,
  Folder,
  Tag,
  Eye,
  Archive,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Tabs removed - using custom buttons for better mobile support
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatRelativeTime } from '@/utils/dateFormatter';
import { useNotificationStore } from '@/store/notificationStore';
import { NotificationData } from '@/services/notificationService';
import { sanitizeNotification, sanitizeText } from '@/utils/sanitizer';
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
  const location = useLocation();
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [toastNotifications, setToastNotifications] = useState<NotificationData[]>([]);

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
  const toastTimeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

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

  // Clean up all toast timeouts on unmount
  useEffect(() => {
    return () => {
      toastTimeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      toastTimeoutRefs.current.clear();
    };
  }, []);

  // Update toast notifications when new notifications arrive
  useEffect(() => {
    if (notifications.length === 0) return;

    const latestNotification = notifications[0];

    // Only show toast for new notifications (less than 10 seconds old)
    const notificationTime = latestNotification.timestamp instanceof Date
      ? latestNotification.timestamp.getTime()
      : new Date(latestNotification.timestamp).getTime();
    const isRecent = new Date().getTime() - notificationTime < 10000;

    if (isRecent && !latestNotification.read) {
      setToastNotifications(prev => {
        const exists = prev.find(n => n.id === latestNotification.id);
        if (exists) return prev;

        const sanitized = sanitizeNotification(latestNotification);
        const newToasts = [sanitized, ...prev.slice(0, maxNotifications - 1)];

        const existingTimeout = toastTimeoutRefs.current.get(latestNotification.id);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        const timeoutId = setTimeout(() => {
          setToastNotifications(current =>
            current.filter(n => n.id !== latestNotification.id)
          );
          toastTimeoutRefs.current.delete(latestNotification.id);
        }, 5000);

        toastTimeoutRefs.current.set(latestNotification.id, timeoutId);

        return newToasts;
      });
    }
  }, [notifications, maxNotifications]);

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
    const pr = notifications.filter(n => n.category === 'approval').length;
    const system = notifications.filter(n => n.category === 'system').length;
    const urgent = notifications.filter(n => n.priority === 'urgent' && !n.read).length;
    return { all, unread, pr, system, urgent };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications
      .map(n => sanitizeNotification(n))
      .filter(n => {
        if (activeTab === 'unread' && n.read) return false;
        if (activeTab === 'pr' && n.category !== 'approval') return false;
        if (activeTab === 'system' && n.category !== 'system') return false;

        if (selectedPriority !== 'all' && n.priority !== selectedPriority) return false;

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            n.title.toLowerCase().includes(query) ||
            n.message.toLowerCase().includes(query) ||
            n.metadata?.project?.toLowerCase().includes(query) ||
            n.metadata?.sender?.toLowerCase().includes(query)
          );
        }
        return true;
      });
  }, [notifications, activeTab, selectedPriority, searchQuery]);

  const formatTimestamp = useCallback((date: Date) => {
    return formatRelativeTime(date);
  }, []);

  // Remove individual toast with cleanup
  const removeToast = useCallback((notificationId: string) => {
    setToastNotifications(prev => prev.filter(n => n.id !== notificationId));

    const timeout = toastTimeoutRefs.current.get(notificationId);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutRefs.current.delete(notificationId);
    }
  }, []);

  // Enhanced notification action handler with smart redirects
  const handleNotificationAction = useCallback((notification: NotificationData) => {
    // Get user role for building proper paths - use role name (string), NOT role_id (number)
    // role is the string name like "buyer", "technicalDirector", etc.
    const userRole = user?.role || '';

    console.log('[NotificationSystem] Handling notification:', {
      title: notification.title,
      category: notification.category,
      metadata: notification.metadata,
      actionUrl: notification.actionUrl,
      userRole
    });

    // PRIORITY 1: Use smart redirect based on notification content (most reliable)
    // This ensures correct routing based on what the notification is about
    const redirectConfig = getNotificationRedirectPath(notification, userRole);

    if (redirectConfig) {
      const redirectUrl = buildNotificationUrl(redirectConfig);
      console.log('[NotificationSystem] Smart redirect URL:', redirectUrl);

      try {
        if (onNavigate) {
          onNavigate(redirectUrl);
        } else {
          navigate(redirectUrl, {
            replace: false,
            state: {
              from: location.pathname,
              notification: notification.id,
              autoFocus: true
            }
          });
        }
        setShowPanel(false);
        markAsRead(notification.id);
        return;
      } catch (error) {
        console.error('[NotificationSystem] Navigation error:', error);
      }
    }


    // PRIORITY 2: Use backend actionUrl if smart redirect didn't work
    const backendActionUrl = notification.actionUrl || notification.metadata?.actionUrl || notification.metadata?.action_url;
    if (backendActionUrl && typeof backendActionUrl === 'string') {
      try {
        // SPECIAL CASE: Estimators receiving purchase/material-purchase notifications
        // Should go to their change-requests page, not buyer's purchase-orders page
        const isEstimator = userRole && (
          userRole.toString().toLowerCase().includes('estimator') ||
          userRole === '3' || userRole === 3
        );

        // Check if URL is for buyer/purchase pages that Estimator shouldn't access
        // Handle both /extra-material and /estimator/extra-material formats
        const isBuyerPurchaseUrl =
          backendActionUrl.includes('/material-purchase') ||
          backendActionUrl.includes('/purchase-orders') ||
          backendActionUrl.includes('/extra-material') ||
          backendActionUrl.includes('/buyer/');

        if (isEstimator && isBuyerPurchaseUrl) {
          // Redirect Estimator to their change-requests page instead
          const redirectPath = buildRolePath(userRole, '/change-requests');
          const queryParams = new URLSearchParams();

          // Extract cr_id from the original URL or metadata
          if (notification.metadata?.cr_id) {
            queryParams.set('cr_id', String(notification.metadata.cr_id));
          } else {
            // Try to extract from URL query params
            try {
              const urlObj = new URL(backendActionUrl, window.location.origin);
              const crId = urlObj.searchParams.get('cr_id');
              if (crId) {
                queryParams.set('cr_id', crId);
              }
            } catch {
              // Invalid URL, ignore
            }
          }

          const fullPath = queryParams.toString()
            ? `${redirectPath}?${queryParams.toString()}`
            : redirectPath;

          if (onNavigate) {
            onNavigate(fullPath);
          } else {
            navigate(fullPath, {
              replace: false,
              state: {
                from: location.pathname,
                notification: notification.id,
                autoFocus: true
              }
            });
          }
          setShowPanel(false);
          markAsRead(notification.id);
          return;
        }

        // SPECIAL CASE: TD receiving vendor approval notifications
        // Old notifications may have /vendor-approval URL, should go to /change-requests
        const isTD = userRole && (
          userRole.toString().toLowerCase().includes('technical') ||
          userRole.toString().toLowerCase().includes('director') ||
          userRole === '2' || userRole === 2
        );

        const isOldVendorApprovalUrl = backendActionUrl.includes('/vendor-approval');

        if (isTD && isOldVendorApprovalUrl) {
          // Redirect TD to their change-requests page instead
          const redirectPath = buildRolePath(userRole, '/change-requests');
          const queryParams = new URLSearchParams();

          // Extract cr_id from the original URL or metadata
          if (notification.metadata?.cr_id) {
            queryParams.set('cr_id', String(notification.metadata.cr_id));
          } else {
            // Try to extract from URL query params
            try {
              const urlObj = new URL(backendActionUrl, window.location.origin);
              const crId = urlObj.searchParams.get('cr_id');
              if (crId) {
                queryParams.set('cr_id', crId);
              }
            } catch {
              // Invalid URL, ignore
            }
          }

          const fullPath = queryParams.toString()
            ? `${redirectPath}?${queryParams.toString()}`
            : redirectPath;

          if (onNavigate) {
            onNavigate(fullPath);
          } else {
            navigate(fullPath, {
              replace: false,
              state: {
                from: location.pathname,
                notification: notification.id,
                autoFocus: true
              }
            });
          }
          setShowPanel(false);
          markAsRead(notification.id);
          return;
        }

        // Normal backend URL handling
        const knownRolePrefixes = [
          '/technical-director', '/estimator', '/project-manager',
          '/site-engineer', '/buyer', '/admin', '/production-manager',
          '/site-supervisor', '/mep-supervisor', '/mep', '/accounts'
        ];
        const hasRolePrefix = knownRolePrefixes.some(prefix =>
          backendActionUrl.startsWith(prefix + '/') || backendActionUrl.startsWith(prefix + '?')
        );

        const fullPath = backendActionUrl.startsWith('/') && !hasRolePrefix
          ? buildRolePath(userRole, backendActionUrl)
          : backendActionUrl;

        console.log('[NotificationSystem] Backend action URL fallback:', fullPath);

        if (onNavigate) {
          onNavigate(fullPath);
        } else {
          navigate(fullPath, {
            replace: false,
            state: {
              from: location.pathname,
              notification: notification.id,
              autoFocus: true
            }
          });
        }
        setShowPanel(false);
        markAsRead(notification.id);
        return;
      } catch (error) {
        console.error('[NotificationSystem] Backend URL navigation error:', error);
      }
    }

    // PRIORITY 3: Fallback to metadata.link
    if (notification.metadata?.link) {
      try {
        const link = notification.metadata.link;
        if (link.includes('/boq/')) {
          const boqId = link.split('/boq/').pop()?.split('?')[0];
          const isTD = userRole && (
            userRole.toString().toLowerCase().includes('technical') ||
            userRole.toString().toLowerCase().includes('director') ||
            userRole === '2' || userRole === 2
          );
          const targetPath = isTD ? '/project-approvals' : '/projects';
          const fullPath = buildRolePath(userRole, targetPath);
          navigate(`${fullPath}?boq_id=${boqId}&tab=pending`, {
            replace: false,
            state: { from: location.pathname }
          });
        } else if (link.startsWith('http')) {
          window.open(link, '_blank', 'noopener,noreferrer');
        } else {
          const fullPath = link.startsWith('/') ? link : `/${link}`;
          navigate(fullPath, {
            replace: false,
            state: { from: location.pathname }
          });
        }
        setShowPanel(false);
      } catch (error) {
        console.error('[NotificationSystem] Link navigation error:', error);
        window.location.href = notification.metadata.link;
      }
    }

    markAsRead(notification.id);
  }, [markAsRead, navigate, location.pathname, onNavigate, user]);

  // ADDED: Helper function to safely navigate
  const safeNavigate = useCallback((path: string) => {
    try {
      if (onNavigate) {
        onNavigate(path);
      } else {
        navigate(path, {
          replace: false,
          state: { from: location.pathname }
        });
      }
    } catch (error) {
      console.error('Safe navigation error:', error);
      // Fallback
      window.location.href = path;
    }
  }, [navigate, location.pathname, onNavigate]);

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
        notificationService.setNotificationClickHandler(null);
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      // Build role-based path for notifications
                      const userRole = user?.role_id || user?.role || '';
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
                                {/* Temporarily hidden - timestamp showing incorrect time */}
                                {/* <span className="text-xs text-gray-400">
                                    {formatTimestamp(notification.timestamp)}
                                  </span> */}
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
                                      markAsRead(notification.id);
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
                                    deleteNotification(notification.id);
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

      {/* Enhanced Toast Notifications with PR Support - Mobile friendly */}
      <div className={cn(
        "fixed z-[10000] space-y-2 pointer-events-none",
        "top-4 right-2 sm:right-4 left-2 sm:left-auto"
      )}>
        <AnimatePresence>
          {toastNotifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{
                opacity: 0,
                x: 100,
                scale: 0.9
              }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1
              }}
              exit={{
                opacity: 0,
                x: 100,
                scale: 0.9
              }}
              transition={{
                type: "spring",
                damping: 20,
                stiffness: 300
              }}
              style={{
                zIndex: 10000 - index
              }}
              className={cn(
                "bg-white rounded-lg shadow-2xl border p-3 sm:p-4 w-full sm:w-80 pointer-events-auto ml-auto",
                notification.priority === 'urgent' && "border-red-500 border-2 animate-pulse",
                notification.category === 'approval' && "border-l-4 border-amber-500"
              )}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <div className={cn(
                  "p-1.5 sm:p-2 rounded-lg flex-shrink-0",
                  getNotificationColor(notification.type)
                )}>
                  <span className="[&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-5 sm:[&>svg]:h-5">
                    {getNotificationIcon(notification.type)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-xs sm:text-sm text-gray-900 line-clamp-2">
                    {notification.title}
                  </h4>
                  <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5 sm:mt-1 line-clamp-2">
                    {notification.message}
                  </p>
                  {notification.category === 'approval' && notification.metadata && (
                    <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-1 sm:gap-2">
                      {notification.metadata.project && (
                        <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5">
                          <FileText className="w-2.5 sm:w-3 h-2.5 sm:h-3 mr-0.5 sm:mr-1" />
                          <span className="truncate max-w-[80px] sm:max-w-none">{notification.metadata.project}</span>
                        </Badge>
                      )}
                      {notification.metadata.amount && (
                        <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5">
                          AED {notification.metadata.amount.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                  )}
                  {notification.actionRequired && (
                    <Button
                      size="sm"
                      className="h-5 sm:h-6 px-1.5 sm:px-2 text-[10px] sm:text-[11px] mt-1.5 sm:mt-2 bg-red-500 hover:bg-red-600 text-white"
                      onClick={() => {
                        handleNotificationAction(notification);
                        removeToast(notification.id);
                      }}
                    >
                      View PR
                      <ChevronRight className="w-2.5 sm:w-3 h-2.5 sm:h-3 ml-0.5" />
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeToast(notification.id)}
                  className="h-5 w-5 sm:h-6 sm:w-6 p-0 hover:bg-gray-100 flex-shrink-0"
                >
                  <X className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (692 lines - CRITICAL)
export default React.memo(NotificationSystem);