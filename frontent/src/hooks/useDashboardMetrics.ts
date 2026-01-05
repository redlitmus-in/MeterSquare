import { useEffect } from 'react';
import { useApiQuery, prefetchData } from './useApiQuery';
import { API_ENDPOINTS } from '@/api/config';
import { queryKeys } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';

// Dashboard metrics types
export interface DashboardMetrics {
  totalPurchases: number;
  pendingApprovals: number;
  activeProjects: number;
  totalSpending: number;
  recentActivities: Activity[];
  chartData: ChartData[];
}

export interface Activity {
  id: string;
  type: 'purchase' | 'approval' | 'project' | 'task';
  title: string;
  description: string;
  timestamp: string;
  status: string;
}

export interface ChartData {
  name: string;
  value: number;
  date?: string;
}

/**
 * Hook for fetching dashboard metrics with real-time updates
 * Real-time subscriptions are set up globally in App.tsx via setupRealtimeSubscriptions
 */
export function useDashboardMetrics() {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';

  // Determine API endpoint based on role
  const getEndpoint = () => {
    switch (userRole.toLowerCase()) {
      case 'site supervisor':
      case 'sitesupervisor':
        return API_ENDPOINTS.DASHBOARDS.SITE_SUPERVISOR;
      case 'mep supervisor':
      case 'mepsupervisor':
        return API_ENDPOINTS.DASHBOARDS.MEP_SUPERVISOR;
      case 'estimation':
        return API_ENDPOINTS.ESTIMATION.DASHBOARD;
      case 'technical director':
      case 'technicaldirector':
        return API_ENDPOINTS.TECHNICAL_DIRECTOR.DASHBOARD;
      case 'accounts':
        return API_ENDPOINTS.ACCOUNTS.DASHBOARD;
      default:
        return '/dashboard/metrics'; // Generic endpoint
    }
  };

  const query = useApiQuery<DashboardMetrics>(
    queryKeys.dashboard.metrics(userRole),
    getEndpoint(),
    {
      cacheStrategy: 'DASHBOARD', // 30s stale time, 2min cache
      refetchInterval: false, // ✅ NO POLLING! Use real-time subscriptions instead
      showErrorToast: false, // Don't show errors for dashboard
    }
  );

  return {
    metrics: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isStale,
    error: query.error,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

/**
 * Hook for fetching pending approvals count
 */
export function usePendingApprovalsCount() {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';

  const query = useApiQuery<{ count: number }>(
    queryKeys.approvals.pending(userRole),
    API_ENDPOINTS.ACCOUNTS.PENDING_APPROVALS,
    {
      cacheStrategy: 'REALTIME', // 10s stale time for real-time feel
      refetchInterval: false, // ✅ NO POLLING! Use real-time subscriptions instead
      enabled: !!userRole,
    }
  );

  return {
    count: query.data?.count || 0,
    isLoading: query.isLoading,
    hasNewApprovals: query.isFetching && !query.isLoading,
  };
}

/**
 * Hook for fetching analytics data
 */
export function useAnalyticsData(timeRange: 'day' | 'week' | 'month' | 'year' = 'month') {
  const queryKey = queryKeys.dashboard.analytics;

  const query = useApiQuery<{
    procurement: ChartData[];
    projects: ChartData[];
    spending: ChartData[];
  }>(
    [...queryKey, timeRange],
    `${API_ENDPOINTS.ANALYTICS.PROJECTS_PROGRESS}?range=${timeRange}`,
    {
      cacheStrategy: 'DYNAMIC', // 1min stale time
      showErrorToast: false,
    }
  );

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching role-specific dashboard data
 */
export function useRoleDashboard() {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';

  // Prefetch related data for better performance
  useEffect(() => {
    if (userRole) {
      // Prefetch common data that user might need
      const doPrefetch = async () => {
        // Prefetch based on role
        switch (userRole.toLowerCase()) {
          case 'procurement':
            await prefetchData(
              [...queryKeys.purchases.list()],
              API_ENDPOINTS.PROCUREMENT.ALL_PURCHASES,
              'DYNAMIC'
            );
            break;

          case 'project manager':
          case 'projectmanager':
            await prefetchData(
              [...queryKeys.purchases.list({ status: 'pending' })],
              API_ENDPOINTS.PROJECT_MANAGER.GET_PURCHASES,
              'DYNAMIC'
            );
            break;

          case 'accounts':
            await prefetchData(
              [...queryKeys.dashboard.metrics('accounts')],
              API_ENDPOINTS.ACCOUNTS.FINANCIAL_SUMMARY,
              'DASHBOARD'
            );
            break;
        }
      };

      doPrefetch();
    }
  }, [userRole]);

  const query = useApiQuery<any>(
    ['role-dashboard', userRole],
    `/api/dashboards/${userRole.toLowerCase()}`,
    {
      cacheStrategy: 'DASHBOARD',
      enabled: !!userRole,
      refetchInterval: false, // ✅ NO POLLING! Use real-time subscriptions
    }
  );

  return {
    dashboardData: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for dashboard notifications with real-time updates
 */
export function useDashboardNotifications() {
  const query = useApiQuery<{
    notifications: Array<{
      id: string;
      message: string;
      type: 'info' | 'warning' | 'success' | 'error';
      timestamp: string;
      read: boolean;
    }>;
    unreadCount: number;
  }>(
    queryKeys.dashboard.notifications,
    '/api/notifications',
    {
      cacheStrategy: 'REALTIME', // Very short cache for notifications
      refetchInterval: false, // ✅ NO POLLING! Notifications pushed via Socket.io
    }
  );

  return {
    notifications: query.data?.notifications || [],
    unreadCount: query.data?.unreadCount || 0,
    isLoading: query.isLoading,
    hasNewNotifications: query.isFetching && !query.isLoading,
  };
}

/**
 * Custom hook to show cache status in UI
 */
export function useCacheStatus(queryKey: any[]) {
  const query = useApiQuery(queryKey, '', { enabled: false });

  return {
    isCached: query.isSuccess && !query.isFetching,
    isStale: query.isStale,
    isFetching: query.isFetching,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    isFromCache: query.isSuccess && !query.isLoading && !query.isFetching,
  };
}