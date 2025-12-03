import { QueryClient } from '@tanstack/react-query';
import {
  CACHE_TIMES,
  queryKeys,
  STALE_TIMES,
  CACHE_GC_TIMES,
} from './constants';

// Re-export from constants for backwards compatibility
export { CACHE_TIMES, queryKeys, STALE_TIMES, CACHE_GC_TIMES };

// Create a query client instance with optimized settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: Data is immediately stale - always fetch fresh
      // This ensures we always get the latest data from the server
      staleTime: 0,

      // Cache time: How long to keep unused data in cache
      gcTime: CACHE_GC_TIMES.STANDARD, // 10 minutes (formerly cacheTime)

      // Retry configuration
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },

      // Retry delay
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on window focus - get fresh data when user returns to tab
      refetchOnWindowFocus: true,

      // Always refetch when component mounts
      refetchOnMount: true,

      // Refetch on reconnect
      refetchOnReconnect: 'always',
    },
    mutations: {
      // Retry configuration for mutations
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Helper function to invalidate and refetch queries
export const invalidateQueries = async (queryKey: string | string[]) => {
  await queryClient.invalidateQueries({
    queryKey: Array.isArray(queryKey) ? queryKey : [queryKey]
  });
};

// Helper function to prefetch data
export const prefetchQuery = async (
  queryKey: string | string[],
  queryFn: () => Promise<any>,
  staleTime?: number
) => {
  await queryClient.prefetchQuery({
    queryKey: Array.isArray(queryKey) ? queryKey : [queryKey],
    queryFn,
    staleTime: staleTime || 1000 * 60 * 5, // Default 5 minutes
  });
};

// Helper function to set query data directly
export const setQueryData = (queryKey: string | string[], data: any) => {
  queryClient.setQueryData(
    Array.isArray(queryKey) ? queryKey : [queryKey],
    data
  );
};

// Helper function to get cached query data
export const getQueryData = (queryKey: string | string[]) => {
  return queryClient.getQueryData(
    Array.isArray(queryKey) ? queryKey : [queryKey]
  );
};

// Clear all cache
export const clearAllCache = () => {
  queryClient.clear();
};

// Clear React Query cache on page load/refresh to ensure fresh data
// This is triggered alongside axios cache clearing
if (typeof window !== 'undefined') {
  // Use modern Navigation Timing API to detect page reload
  const navEntries = performance.getEntriesByType?.('navigation') as PerformanceNavigationTiming[] | undefined;
  const isPageReload = navEntries?.[0]?.type === 'reload';

  if (isPageReload) {
    // Clear query cache on hard refresh
    queryClient.clear();
  }
}

// Remove specific queries from cache
export const removeQueries = (queryKey: string | string[]) => {
  queryClient.removeQueries({
    queryKey: Array.isArray(queryKey) ? queryKey : [queryKey]
  });
};

// Alias exports for backwards compatibility with useOptimisticUpdates
export { getQueryData as getCachedData, setQueryData as setCachedData };