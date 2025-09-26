import { QueryClient } from '@tanstack/react-query';

// Create a query client instance with optimized settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: How long before data is considered stale
      staleTime: 1000 * 60 * 5, // 5 minutes

      // Cache time: How long to keep unused data in cache
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)

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

      // Refetch on window focus
      refetchOnWindowFocus: false,

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

// Remove specific queries from cache
export const removeQueries = (queryKey: string | string[]) => {
  queryClient.removeQueries({
    queryKey: Array.isArray(queryKey) ? queryKey : [queryKey]
  });
};