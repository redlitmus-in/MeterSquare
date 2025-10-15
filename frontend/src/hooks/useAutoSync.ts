/**
 * useAutoSync Hook
 * Provides real-time auto-refresh functionality for PM and SE roles
 * Zero UI flicker, cache-based incremental updates
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeToRealtime } from '@/lib/realtimeSubscriptions';
import { invalidateQueries } from '@/lib/queryClient';

interface UseAutoSyncOptions<TData = any> {
  /**
   * Unique query key for this data
   */
  queryKey: string[];

  /**
   * Function to fetch data from API
   */
  fetchFn: () => Promise<TData>;

  /**
   * Supabase table(s) to subscribe to for real-time updates
   */
  realtimeTables?: string[];

  /**
   * Enable/disable auto-sync (default: true)
   */
  enabled?: boolean;

  /**
   * Stale time in milliseconds (default: 30 seconds)
   */
  staleTime?: number;

  /**
   * Refetch interval in milliseconds (fallback polling, default: disabled)
   */
  refetchInterval?: number | false;

  /**
   * Callback when data updates
   */
  onUpdate?: (newData: TData) => void;

  /**
   * Callback when real-time event occurs
   */
  onRealtimeEvent?: (event: any) => void;

  /**
   * Show toast notifications on updates (default: false)
   */
  showNotifications?: boolean;
}

/**
 * Auto-sync hook with real-time updates and cache management
 * Prevents UI flicker by using cached data and background revalidation
 */
export function useAutoSync<TData = any>({
  queryKey,
  fetchFn,
  realtimeTables = [],
  enabled = true,
  staleTime = 30000, // 30 seconds
  refetchInterval = false,
  onUpdate,
  onRealtimeEvent,
  showNotifications = false
}: UseAutoSyncOptions<TData>) {
  const queryClient = useQueryClient();
  const cleanupFnsRef = useRef<(() => void)[]>([]);

  // React Query for data fetching with cache
  const query = useQuery<TData>({
    queryKey,
    queryFn: fetchFn,
    enabled,
    staleTime,
    gcTime: 1000 * 60 * 10, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: enabled && refetchInterval ? refetchInterval : false,
    refetchIntervalInBackground: true, // Continue polling in background
  });

  // Silent background refresh without UI flicker
  const silentRefresh = useCallback(async () => {
    // Invalidate and refetch in background
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Setup real-time subscriptions
  useEffect(() => {
    if (!enabled || realtimeTables.length === 0) return;

    // Subscribe to each table
    realtimeTables.forEach(table => {
      const cleanup = subscribeToRealtime({
        table,
        event: '*',
        onInsert: (payload) => {
          if (onRealtimeEvent) onRealtimeEvent(payload);
          silentRefresh();
        },
        onUpdate: (payload) => {
          if (onRealtimeEvent) onRealtimeEvent(payload);
          silentRefresh();
        },
        onDelete: (payload) => {
          if (onRealtimeEvent) onRealtimeEvent(payload);
          silentRefresh();
        },
        invalidateKeys: [queryKey]
      });

      cleanupFnsRef.current.push(cleanup);
    });

    // Cleanup on unmount
    return () => {
      cleanupFnsRef.current.forEach(cleanup => cleanup());
      cleanupFnsRef.current = [];
    };
  }, [enabled, realtimeTables, queryKey, silentRefresh, onRealtimeEvent]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    silentRefresh,
    isStale: query.isStale
  };
}

/**
 * Specialized hook for Change Requests with auto-sync
 */
export function useChangeRequestsAutoSync(fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['change-requests'],
    fetchFn,
    realtimeTables: ['change_requests'],
    staleTime: 2000, // 2 seconds
    enabled: true,
    refetchInterval: 2000 // Poll every 2 seconds
  });
}

/**
 * Specialized hook for BOQ with auto-sync
 */
export function useBOQAutoSync(boqId: number, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['boq', boqId],
    fetchFn,
    realtimeTables: ['boq', 'boq_items', 'boq_sub_items'],
    staleTime: 2000, // 2 seconds
    enabled: !!boqId,
    refetchInterval: 2000 // Poll every 2 seconds
  });
}

/**
 * Specialized hook for Projects with auto-sync
 */
export function useProjectsAutoSync(fetchFn: () => Promise<any>, enabled: boolean = true) {
  return useAutoSync({
    queryKey: ['projects'],
    fetchFn,
    realtimeTables: ['projects', 'boq', 'boq_items'],
    staleTime: 2000, // 2 seconds
    enabled: enabled, // Can be disabled when editing
    refetchInterval: enabled ? 2000 : false // Poll every 2 seconds when enabled
  });
}

/**
 * Specialized hook for Extra Materials with auto-sync
 */
export function useExtraMaterialsAutoSync(fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['extra-materials'],
    fetchFn,
    realtimeTables: ['change_requests'],
    staleTime: 2000, // 2 seconds
    enabled: true,
    refetchInterval: 2000 // Poll every 2 seconds
  });
}

/**
 * Specialized hook for Purchase Requests with auto-sync
 */
export function usePurchaseRequestsAutoSync(fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['purchase-requests'],
    fetchFn,
    realtimeTables: ['purchases', 'purchase_materials'],
    staleTime: 30000,
    enabled: true
  });
}

/**
 * Specialized hook for Dashboard Metrics with auto-sync
 */
export function useDashboardMetricsAutoSync(role: string, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['dashboard-metrics', role],
    fetchFn,
    realtimeTables: ['projects', 'purchases', 'tasks', 'change_requests'],
    staleTime: 2000, // 2 seconds
    enabled: true,
    refetchInterval: 2000 // Poll every 2 seconds
  });
}

/**
 * Specialized hook for BOQ Details with auto-sync
 */
export function useBOQDetailsAutoSync(boqId: number, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['boq-details', boqId],
    fetchFn,
    realtimeTables: ['boq', 'boq_items', 'boq_sub_items'],
    staleTime: 30000,
    enabled: !!boqId
  });
}

/**
 * Specialized hook for Notifications with auto-sync
 */
export function useNotificationsAutoSync(userId: string, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['notifications', userId],
    fetchFn,
    realtimeTables: ['notifications'],
    staleTime: 15000, // 15 seconds for notifications
    enabled: !!userId
  });
}

/**
 * Specialized hook for Tasks with auto-sync
 */
export function useTasksAutoSync(userId: string, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['tasks', userId],
    fetchFn,
    realtimeTables: ['tasks'],
    staleTime: 30000,
    enabled: !!userId
  });
}

/**
 * Specialized hook for Material Purchases with auto-sync
 */
export function useMaterialPurchasesAutoSync(projectId: number, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['material-purchases', projectId],
    fetchFn,
    realtimeTables: ['purchases', 'purchase_materials'],
    staleTime: 30000,
    enabled: !!projectId
  });
}

/**
 * Specialized hook for Labour Hours with auto-sync
 */
export function useLabourHoursAutoSync(projectId: number, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['labour-hours', projectId],
    fetchFn,
    realtimeTables: ['labour_hours'],
    staleTime: 30000,
    enabled: !!projectId
  });
}

/**
 * Specialized hook for Project Overview with auto-sync
 */
export function useProjectOverviewAutoSync(projectId: number, fetchFn: () => Promise<any>) {
  return useAutoSync({
    queryKey: ['project-overview', projectId],
    fetchFn,
    realtimeTables: ['projects', 'boq', 'purchases', 'change_requests'],
    staleTime: 30000,
    enabled: !!projectId
  });
}
