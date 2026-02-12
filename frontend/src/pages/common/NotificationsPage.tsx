import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  Filter,
  Archive,
  CheckCheck,
  BellOff,
  RefreshCw
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
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { getNotificationRedirectPath, buildNotificationUrl } from '@/utils/notificationRedirects';
import { useAuthStore } from '@/store/authStore';

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    notifications,
    unreadCount,
    isPermissionGranted,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    requestPermission
  } = useNotificationStore();

  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority'>('newest');
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getNotificationIcon = useCallback((type: NotificationData['type']) => {
    switch (type) {
      case 'email': return <Mail className="w-5 h-5" />;
      case 'approval': return <Clock className="w-5 h-5" />;
      case 'alert': return <AlertTriangle className="w-5 h-5" />;
      case 'success': return <CheckCircle className="w-5 h-5" />;
      case 'error': return <XCircle className="w-5 h-5" />;
      case 'info': return <Info className="w-5 h-5" />;
      case 'update': return <TrendingUp className="w-5 h-5" />;
      case 'reminder': return <Calendar className="w-5 h-5" />;
      default: return <Bell className="w-5 h-5" />;
    }
  }, []);

  const getNotificationColor = useCallback((type: NotificationData['type']) => {
    switch (type) {
      case 'email': return 'text-blue-600 bg-blue-100';
      case 'approval': return 'text-[#243d8a] bg-[#243d8a]/10';
      case 'alert': return 'text-amber-600 bg-amber-100';
      case 'success': return 'text-green-600 bg-green-100';
      case 'error': return 'text-red-600 bg-red-100';
      case 'info': return 'text-gray-600 bg-gray-100';
      case 'update': return 'text-purple-600 bg-purple-100';
      case 'reminder': return 'text-indigo-600 bg-indigo-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }, []);

  const getPriorityColor = useCallback((priority: NotificationData['priority']) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'medium': return 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30';
      case 'low': return 'bg-gray-100 text-gray-600 border-gray-300';
      default: return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  }, []);

  // Handle notification action with navigation (using proper redirect rules)
  const handleNotificationAction = useCallback((notification: NotificationData) => {
    try {
      const userRole = user?.role || '';

      // ── PRIORITY 1: Smart content-based redirect (handles all 50+ notification types) ──
      const redirectConfig = getNotificationRedirectPath(notification, userRole);
      if (redirectConfig) {
        const redirectUrl = buildNotificationUrl(redirectConfig);
        navigate(redirectUrl, {
          replace: false,
          state: { from: location.pathname }
        });
        markAsRead(notification.id);
        return;
      }

      // ── PRIORITY 2: Backend actionUrl (already has role-prefix from server) ──
      const backendUrl = notification.actionUrl || notification.metadata?.actionUrl || notification.metadata?.action_url;
      if (backendUrl && typeof backendUrl === 'string' && backendUrl.startsWith('/')) {
        navigate(backendUrl, {
          replace: false,
          state: { from: location.pathname }
        });
        markAsRead(notification.id);
        return;
      }

      // ── PRIORITY 3: metadata.link (legacy fallback) ──
      if (notification.metadata?.link) {
        const link = notification.metadata.link;
        if (link.startsWith('http')) {
          window.open(link, '_blank', 'noopener,noreferrer');
          markAsRead(notification.id);
        } else {
          navigate(link.startsWith('/') ? link : `/${link}`, {
            replace: false,
            state: { from: location.pathname }
          });
          markAsRead(notification.id);
        }
        return;
      }

      // No redirect available – just mark as read
      markAsRead(notification.id);
    } catch (error) {
      console.error('Navigation error:', error);
      showError('Failed to navigate to the requested page');
    }
  }, [markAsRead, navigate, location.pathname, user]);

  // Refresh notifications
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Trigger notification sync/refresh logic here
      showSuccess('Notifications refreshed');
    } catch (error) {
      showError('Failed to refresh notifications');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Bulk operations
  const handleMarkSelectedAsRead = () => {
    selectedNotifications.forEach(id => markAsRead(id));
    setSelectedNotifications([]);
    showSuccess(`Marked ${selectedNotifications.length} notifications as read`);
  };

  const handleDeleteSelected = () => {
    selectedNotifications.forEach(id => deleteNotification(id));
    setSelectedNotifications([]);
    showSuccess(`Deleted ${selectedNotifications.length} notifications`);
  };

  const toggleNotificationSelection = (id: string) => {
    setSelectedNotifications(prev =>
      prev.includes(id)
        ? prev.filter(nId => nId !== id)
        : [...prev, id]
    );
  };

  // Filter and sort notifications
  const filteredNotifications = useMemo(() => {
    let filtered = notifications
      .map(n => sanitizeNotification(n))
      .filter(n => {
        if (activeTab === 'unread' && n.read) return false;
        if (activeTab === 'archived' && !n.read) return false;

        if (selectedPriority !== 'all' && n.priority !== selectedPriority) return false;
        if (selectedCategory !== 'all' && n.category !== selectedCategory) return false;

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

    // Sort notifications
    switch (sortBy) {
      case 'oldest':
        filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        break;
      case 'priority':
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        break;
      default: // newest
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return filtered;
  }, [notifications, activeTab, selectedPriority, selectedCategory, searchQuery, sortBy]);

  // Get unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set(notifications.map(n => n.category).filter(Boolean));
    return Array.from(cats);
  }, [notifications]);

  // Notification counts
  const counts = useMemo(() => {
    const all = notifications.length;
    const unread = notifications.filter(n => !n.read).length;
    const archived = notifications.filter(n => n.read).length;
    const urgent = notifications.filter(n => n.priority === 'urgent' && !n.read).length;
    return { all, unread, archived, urgent };
  }, [notifications]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Bell className="w-8 h-8 text-[#243d8a]" />
            Notifications
          </h1>
          <p className="text-gray-600 mt-1">
            Manage all your notifications in one place
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isPermissionGranted && (
            <Button
              onClick={requestPermission}
              variant="outline"
              className="flex items-center gap-2"
            >
              <BellRing className="w-4 h-4" />
              Enable Desktop Notifications
            </Button>
          )}

          <Button
            onClick={handleRefresh}
            variant="outline"
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            Refresh
          </Button>

          {selectedNotifications.length > 0 && (
            <>
              <Button
                onClick={handleMarkSelectedAsRead}
                variant="outline"
                className="flex items-center gap-2"
              >
                <CheckCheck className="w-4 h-4" />
                Mark as Read ({selectedNotifications.length})
              </Button>
              <Button
                onClick={handleDeleteSelected}
                variant="outline"
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
                Delete ({selectedNotifications.length})
              </Button>
            </>
          )}

          {counts.unread > 0 && (
            <Button
              onClick={markAllAsRead}
              className="bg-[#243d8a] hover:bg-[#243d8a]/90"
            >
              <Check className="w-4 h-4 mr-2" />
              Mark All as Read
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold">{counts.all}</p>
              </div>
              <Bell className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Unread</p>
                <p className="text-2xl font-bold text-blue-600">{counts.unread}</p>
              </div>
              <BellRing className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Archived</p>
                <p className="text-2xl font-bold text-green-600">{counts.archived}</p>
              </div>
              <Archive className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Urgent</p>
                <p className="text-2xl font-bold text-red-600">{counts.urgent}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => cat && (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">
                All {counts.all > 0 && `(${counts.all})`}
              </TabsTrigger>
              <TabsTrigger value="unread">
                Unread
                {counts.unread > 0 && (
                  <Badge className="ml-2 bg-red-500 text-white">
                    {counts.unread}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="archived">
                Archived {counts.archived > 0 && `(${counts.archived})`}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="p-12 text-center">
                <BellOff className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-xl font-semibold text-gray-500 mb-2">
                  No notifications found
                </p>
                <p className="text-gray-400">
                  {searchQuery || selectedPriority !== 'all' || selectedCategory !== 'all'
                    ? 'Try adjusting your filters'
                    : 'You\'re all caught up!'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredNotifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-4 hover:bg-gray-50 transition-colors",
                      !notification.read && "bg-blue-50/30",
                      selectedNotifications.includes(notification.id) && "bg-blue-100/50"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      {/* Selection Checkbox */}
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={selectedNotifications.includes(notification.id)}
                          onChange={() => toggleNotificationSelection(notification.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </div>

                      {/* Icon */}
                      <div className={cn(
                        "p-2 rounded-lg flex-shrink-0",
                        getNotificationColor(notification.type)
                      )}>
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="font-semibold text-gray-900">
                            {notification.title}
                          </h4>
                          <Badge className={cn("ml-2", getPriorityColor(notification.priority))}>
                            {notification.priority}
                          </Badge>
                        </div>

                        <p className="text-sm text-gray-600 mb-2">
                          {notification.message}
                        </p>

                        {/* Metadata */}
                        {notification.metadata && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {notification.metadata.project && (
                              <Badge variant="outline" className="text-xs">
                                <FileText className="w-3 h-3 mr-1" />
                                {notification.metadata.project}
                              </Badge>
                            )}
                            {notification.metadata.amount && (
                              <Badge variant="outline" className="text-xs">
                                <Banknote className="w-3 h-3 mr-1" />
                                AED {notification.metadata.amount.toLocaleString()}
                              </Badge>
                            )}
                            {notification.metadata.sender && (
                              <Badge variant="outline" className="text-xs">
                                <Users className="w-3 h-3 mr-1" />
                                {notification.metadata.sender}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Actions and Timestamp */}
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-gray-400">
                            {formatRelativeTime(notification.timestamp)}
                          </span>

                          <div className="flex items-center gap-2">
                            {notification.actionRequired && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleNotificationAction(notification)}
                                className="h-7 text-xs"
                              >
                                {notification.actionLabel || 'View'}
                                <ChevronRight className="w-3 h-3 ml-1" />
                              </Button>
                            )}

                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAsRead(notification.id)}
                                className="h-7 w-7 p-0"
                                title="Mark as read"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteNotification(notification.id)}
                              className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
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
        </CardContent>
      </Card>

      {/* Clear All Button */}
      {notifications.length > 0 && (
        <div className="mt-6 flex justify-end">
          <Button
            onClick={() => {
              if (window.confirm('Are you sure you want to clear all notifications?')) {
                clearAll();
                showSuccess('All notifications cleared');
              }
            }}
            variant="destructive"
            className="flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear All Notifications
          </Button>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;