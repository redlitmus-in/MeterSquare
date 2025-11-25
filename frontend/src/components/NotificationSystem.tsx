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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    // Get user role for building proper paths
    const userRole = user?.role_id || user?.role || '';

    // PRIORITY 1: Use actionUrl from backend if available (most accurate)
    const backendActionUrl = notification.actionUrl || notification.metadata?.actionUrl;
    if (backendActionUrl) {
      try {
        // Build role-prefixed path from backend action URL
        const fullPath = backendActionUrl.startsWith('/') && !backendActionUrl.includes('/technical-director/') && !backendActionUrl.includes('/estimator/') && !backendActionUrl.includes('/project-manager/')
          ? buildRolePath(userRole, backendActionUrl)
          : backendActionUrl;

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
        // Fall through to smart redirect
      }
    }

    // PRIORITY 2: Get smart redirect path based on notification content
    const redirectConfig = getNotificationRedirectPath(notification, userRole);

    if (redirectConfig) {
      const redirectUrl = buildNotificationUrl(redirectConfig);

      try {
        // Use custom navigation handler if provided
        if (onNavigate) {
          onNavigate(redirectUrl);
        } else {
          // Navigate to the specific page/tab
          navigate(redirectUrl, {
            replace: false,
            state: {
              from: location.pathname,
              notification: notification.id,
              autoFocus: true // Flag to auto-focus the related item
            }
          });
        }

        // Close the notification panel after navigation
        setShowPanel(false);
      } catch (error) {
        console.error('Navigation error:', error);
        // Fallback to direct navigation
        window.location.href = redirectUrl;
      }
    } else if (notification.metadata?.link) {
      // Fallback to metadata.link if no smart redirect found
      try {
        // Check if the link contains /boq/ and needs special handling
        if (notification.metadata.link.includes('/boq/')) {
          const boqId = notification.metadata.link.split('/boq/').pop()?.split('?')[0];

          // Check if user is Technical Director for proper routing
          const isTD = userRole && (
            userRole.toString().toLowerCase().includes('technical') ||
            userRole.toString().toLowerCase().includes('director') ||
            userRole === '2' || // TD role_id
            userRole === 2
          );

          // TD should go to project-approvals for pending BOQs
          const targetPath = isTD ? '/project-approvals' : '/projects';
          const fullPath = buildRolePath(userRole, targetPath);

          navigate(`${fullPath}?boq_id=${boqId}&tab=pending`, {
            replace: false,
            state: { from: location.pathname }
          });
        } else if (notification.metadata.link.startsWith('/')) {
          navigate(notification.metadata.link, {
            replace: false,
            state: { from: location.pathname }
          });
        } else if (notification.metadata.link.startsWith('http')) {
          window.open(notification.metadata.link, '_blank', 'noopener,noreferrer');
        } else {
          navigate(`/${notification.metadata.link}`, {
            replace: false,
            state: { from: location.pathname }
          });
        }
        setShowPanel(false);
      } catch (error) {
        console.error('Navigation error:', error);
        window.location.href = notification.metadata.link;
      }
    }

    // Mark notification as read
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
              "absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border z-[9999] overflow-hidden",
              "w-[380px] max-h-[480px]"
            )}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  {counts.unread > 0 && (
                    <Badge className="bg-white/20 text-white text-xs px-1.5 py-0">
                      {counts.unread}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
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
                    className="text-white hover:bg-white/10 h-7 px-2 text-xs"
                    title="View all notifications"
                  >
                    View All
                  </Button>
                  {!isPermissionGranted && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={requestPermission}
                      className="text-white hover:bg-white/10 h-7 px-2 text-xs"
                      title="Enable desktop notifications"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPanel(false)}
                    className="text-white hover:bg-white/10 h-7 w-7 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Tabs - Simplified */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="w-full rounded-none border-b bg-gray-50 grid grid-cols-2 h-9">
                <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 text-xs">
                  All {counts.all > 0 && `(${counts.all})`}
                </TabsTrigger>
                <TabsTrigger value="unread" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 text-xs">
                  Unread
                  {counts.unread > 0 && (
                    <Badge className="bg-red-500 text-white ml-1 h-4 px-1.5 text-xs">
                      {counts.unread}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              {/* Removed PR and System tabs for simplicity */}

              <TabsContent value={activeTab} className="mt-0">
                {/* Notifications List */}
                <div className="h-[400px] overflow-y-auto">
                  {filteredNotifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredNotifications.map((notification) => (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`p-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                            !notification.read ? 'bg-[#243d8a]/5/30' : ''
                          }`}
                          onClick={() => handleNotificationAction(notification)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-1.5 rounded-md ${getNotificationColor(notification.type)}`}>
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm text-gray-900 mb-1">
                                {notification.title}
                              </h4>
                              <p className="text-xs text-gray-600 mb-2">
                                {notification.message}
                              </p>
                              
                              {/* Metadata */}
                              {notification.metadata && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
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

                              <div className="flex items-center gap-2 mt-2">
                                <div className="flex items-center gap-2 flex-1">
                                  {/* Temporarily hidden - timestamp showing incorrect time */}
                                  {/* <span className="text-xs text-gray-400">
                                    {formatTimestamp(notification.timestamp)}
                                  </span> */}
                                  {notification.metadata?.sender && (
                                    <span className="text-xs text-gray-500">
                                      <Users className="w-3 h-3 inline mr-1" />
                                      {notification.metadata.sender}
                                    </span>
                                  )}
                                </div>
                                
                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Badge className={`text-[10px] px-1.5 py-0.5 ${getPriorityColor(notification.priority)} border`}>
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
                                      className="h-6 w-6 p-0"
                                      title="Mark as read"
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteNotification(notification.id);
                                    }}
                                    className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                                    title="Delete"
                                  >
                                    <X className="w-3 h-3" />
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
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Toast Notifications with PR Support */}
      <div className={cn(
        "fixed z-[10000] space-y-2 pointer-events-none",
        positionClasses[position]
      )}>
        <AnimatePresence>
          {toastNotifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{
                opacity: 0,
                x: position.includes('right') ? 100 : -100,
                scale: 0.9
              }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1
              }}
              exit={{
                opacity: 0,
                x: position.includes('right') ? 100 : -100,
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
                "bg-white rounded-lg shadow-2xl border p-4 w-80 pointer-events-auto",
                notification.priority === 'urgent' && "border-red-500 border-2 animate-pulse",
                notification.category === 'approval' && "border-l-4 border-amber-500"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-2 rounded-lg flex-shrink-0",
                  getNotificationColor(notification.type)
                )}>
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-gray-900">
                    {notification.title}
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {notification.message}
                  </p>
                  {notification.category === 'approval' && notification.metadata && (
                    <div className="mt-2 flex items-center gap-2">
                      {notification.metadata.project && (
                        <Badge variant="outline" className="text-[10px]">
                          <FileText className="w-3 h-3 mr-1" />
                          {notification.metadata.project}
                        </Badge>
                      )}
                      {notification.metadata.amount && (
                        <Badge variant="outline" className="text-[10px]">
                          AED {notification.metadata.amount.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                  )}
                  {notification.actionRequired && (
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[11px] mt-2 bg-red-500 hover:bg-red-600 text-white"
                      onClick={() => {
                        handleNotificationAction(notification);
                        removeToast(notification.id);
                      }}
                    >
                      View PR
                      <ChevronRight className="w-3 h-3 ml-0.5" />
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeToast(notification.id)}
                  className="h-6 w-6 p-0 hover:bg-gray-100"
                >
                  <X className="w-3 h-3" />
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