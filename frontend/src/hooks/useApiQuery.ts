import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { apiWrapper } from '@/api/config';
import { queryClient, invalidateQueries } from '@/lib/queryClient';
import { CACHE_TIMES, type CacheStrategy } from '@/lib/constants';
import { showSuccess, showError } from '@/utils/toastHelper';

// Types for API responses
export type ApiError = {
  response?: {
    status: number;
    data?: {
      detail?: string;
      message?: string;
      error?: string;
    };
  };
  message?: string;
};

// Enhanced options for queries
export interface ApiQueryOptions<TData = any> extends Omit<UseQueryOptions<TData, ApiError>, 'queryKey' | 'queryFn'> {
  cacheStrategy?: CacheStrategy;
  showErrorToast?: boolean;
  retryOnMount?: boolean;
  backgroundRefetch?: boolean;
  refetchInterval?: number | false;
}

// Enhanced options for mutations
export interface ApiMutationOptions<TData = any, TVariables = any> extends Omit<UseMutationOptions<TData, ApiError, TVariables>, 'mutationFn'> {
  invalidateKeys?: any[][];
  optimisticUpdate?: (variables: TVariables) => void;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
}

/**
 * Smart API Query Hook with caching
 * Automatically handles caching, retries, and error handling
 */
export function useApiQuery<TData = any>(
  queryKey: any[],
  endpoint: string,
  options?: ApiQueryOptions<TData>
) {
  const {
    cacheStrategy = 'DYNAMIC',
    showErrorToast = false,
    backgroundRefetch = true,
    ...queryOptions
  } = options || {};

  const cacheConfig = CACHE_TIMES[cacheStrategy];

  return useQuery<TData, ApiError>({
    queryKey,
    queryFn: async () => {
      try {
        const response = await apiWrapper.get<TData>(endpoint);
        return response;
      } catch (error) {
        // Let React Query handle the error
        throw error;
      }
    },
    staleTime: cacheConfig.staleTime,
    gcTime: cacheConfig.cacheTime, // gcTime replaced cacheTime in React Query v5
    // Always refetch on mount to ensure fresh data
    refetchOnMount: 'always',
    // Refetch when window gains focus
    refetchOnWindowFocus: true,
    ...queryOptions,
  });
}

/**
 * Smart API Mutation Hook
 * Handles optimistic updates, cache invalidation, and notifications
 */
export function useApiMutation<TData = any, TVariables = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: ApiMutationOptions<TData, TVariables>
) {
  const {
    invalidateKeys = [],
    optimisticUpdate,
    showSuccessToast = true,
    showErrorToast = true,
    successMessage,
    onSuccess,
    onError,
    onMutate,
    ...mutationOptions
  } = options || {};

  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    onMutate: async (variables) => {
      // Cancel outgoing queries that would overwrite optimistic update
      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map(key => queryClient.cancelQueries({ queryKey: key }))
        );
      }

      // Apply optimistic update if provided
      if (optimisticUpdate) {
        optimisticUpdate(variables);
      }

      // Call user's onMutate if provided
      if (onMutate) {
        return (onMutate as (variables: TVariables) => unknown)(variables);
      }
      return undefined;
    },
    onSuccess: async (data, variables, context) => {
      // Show success toast
      if (showSuccessToast) {
        showSuccess(successMessage || 'Operation successful');
      }

      // Invalidate and refetch queries
      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map(key => invalidateQueries(key))
        );
      }

      // Call user's onSuccess if provided
      if (onSuccess) {
        (onSuccess as (data: TData, variables: TVariables, context: unknown) => void)(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      // Show error toast
      if (showErrorToast) {
        const message = error?.response?.data?.detail ||
                       error?.response?.data?.message ||
                       error?.message ||
                       'Operation failed';
        showError(message);
      }

      // Rollback optimistic update on error
      if (invalidateKeys.length > 0) {
        invalidateKeys.forEach(key => invalidateQueries(key));
      }

      // Call user's onError if provided
      if (onError) {
        (onError as (error: ApiError, variables: TVariables, context: unknown) => void)(error, variables, context);
      }
    },
    ...mutationOptions,
  });
}

/**
 * Prefetch data for instant loading
 * Use this to preload data before user navigates
 */
export async function prefetchData<TData = any>(
  queryKey: any[],
  endpoint: string,
  cacheStrategy: CacheStrategy = 'DYNAMIC'
) {
  const cacheConfig = CACHE_TIMES[cacheStrategy];

  return queryClient.prefetchQuery({
    queryKey,
    queryFn: () => apiWrapper.get<TData>(endpoint),
    staleTime: cacheConfig.staleTime,
    gcTime: cacheConfig.cacheTime, // gcTime replaced cacheTime in React Query v5
  });
}

/**
 * Invalidate specific queries and trigger refetch
 * Use this when data changes outside of mutations
 */
export async function invalidateAndRefetch(queryKeys: any[][]) {
  await Promise.all(
    queryKeys.map(key => invalidateQueries(key))
  );
}

/**
 * Get data from cache without triggering a fetch
 * Useful for reading data that was already fetched
 */
export function getCachedData<TData = any>(queryKey: any[]): TData | undefined {
  return queryClient.getQueryData<TData>(queryKey);
}

/**
 * Set data in cache manually
 * Useful for optimistic updates or seeding cache
 */
export function setCachedData<TData = any>(
  queryKey: any[],
  updater: TData | ((old: TData | undefined) => TData)
) {
  queryClient.setQueryData<TData>(queryKey, updater);
}

/**
 * Check if query is currently fetching
 */
export function isQueryFetching(queryKey: any[]): boolean {
  return queryClient.isFetching({ queryKey }) > 0;
}

/**
 * Check if query has data in cache
 */
export function hasQueryData(queryKey: any[]): boolean {
  return queryClient.getQueryData(queryKey) !== undefined;
}