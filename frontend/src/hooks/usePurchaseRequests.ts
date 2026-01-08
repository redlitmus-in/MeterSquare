import { useApiQuery, useApiMutation } from './useApiQuery';
import { useOptimisticUpdates } from './useOptimisticUpdates';
import { API_ENDPOINTS, apiWrapper } from '@/api/config';
import { queryKeys } from '@/lib/constants';
import { queryClient } from '@/lib/queryClient';
import { CACHE_TIMES } from '@/lib/constants';

// Types for purchase requests
export interface PurchaseRequest {
  id: number;
  project_name: string;
  vendor_name?: string;
  material?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  status: string;
  created_at: string;
  updated_at: string;
  requested_by?: string;
  approved_by?: string;
  approval_date?: string;
  remarks?: string;
}

export interface CreatePurchaseData {
  project_name: string;
  vendor_name?: string;
  material?: string;
  quantity?: number;
  unit_price?: number;
  remarks?: string;
}

export interface UpdatePurchaseData extends Partial<CreatePurchaseData> {
  status?: string;
}

/**
 * Hook for managing purchase requests with real-time updates and caching
 * Real-time subscriptions are set up globally in App.tsx via setupRealtimeSubscriptions
 * NO POLLING - Real-time handles all updates
 */
export function usePurchaseRequests(filters?: any) {
  const queryKey = [...queryKeys.purchases.list(filters)];

  // Fetch purchase requests with caching
  // Real-time subscriptions are handled globally in App.tsx
  const query = useApiQuery<PurchaseRequest[]>(
    queryKey,
    API_ENDPOINTS.PURCHASE.ALL,
    {
      cacheStrategy: 'DYNAMIC',
      refetchInterval: false, // ✅ NO POLLING! Real-time subscriptions handle updates
      showErrorToast: true,
    }
  );

  return {
    purchases: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching a single purchase request
 */
export function usePurchaseRequest(id: string | number) {
  const queryKey = [...queryKeys.purchases.detail(id)];

  const query = useApiQuery<PurchaseRequest>(
    queryKey,
    API_ENDPOINTS.PURCHASE.GET(id),
    {
      cacheStrategy: 'DYNAMIC',
      enabled: !!id,
    }
  );

  return {
    purchase: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for creating purchase requests with optimistic updates
 */
export function useCreatePurchase() {
  const { optimisticAdd, rollback } = useOptimisticUpdates();

  const mutation = useApiMutation<PurchaseRequest, CreatePurchaseData>(
    async (data) => {
      const response = await apiWrapper.post<PurchaseRequest>(
        API_ENDPOINTS.PURCHASE.CREATE,
        data
      );
      return response;
    },
    {
      invalidateKeys: [
        queryKeys.purchases.all,
        queryKeys.dashboard.metrics(),
      ],
      successMessage: 'Purchase request created successfully',
      onMutate: (newPurchase) => {
        // Optimistic update - add to list immediately
        const context = optimisticAdd<PurchaseRequest>(
          queryKeys.purchases.list(),
          {
            ...newPurchase,
            id: 0, // Temporary ID
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as PurchaseRequest,
          { position: 'start' }
        );

        return context;
      },
      onError: (error, variables, context) => {
        // Rollback optimistic update on error
        if (context) {
          rollback(context as any);
        }
      },
    }
  );

  return {
    createPurchase: mutation.mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

/**
 * Hook for updating purchase requests with optimistic updates
 */
export function useUpdatePurchase(id: string | number) {
  const { optimisticUpdate, rollback } = useOptimisticUpdates();

  const mutation = useApiMutation<PurchaseRequest, UpdatePurchaseData>(
    async (data) => {
      const response = await apiWrapper.put<PurchaseRequest>(
        API_ENDPOINTS.PURCHASE.UPDATE(id),
        data
      );
      return response;
    },
    {
      invalidateKeys: [
        queryKeys.purchases.detail(id),
        queryKeys.purchases.all,
        queryKeys.dashboard.metrics(),
      ],
      successMessage: 'Purchase request updated successfully',
      onMutate: (updatedData) => {
        // Optimistic update - update in list immediately
        const context = optimisticUpdate<PurchaseRequest>(
          queryKeys.purchases.list(),
          {
            id: Number(id),
            ...updatedData,
          } as Partial<PurchaseRequest> & { id: any }
        );

        return context;
      },
      onError: (error, variables, context) => {
        // Rollback optimistic update on error
        if (context) {
          rollback(context as any);
        }
      },
    }
  );

  return {
    updatePurchase: mutation.mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

/**
 * Hook for deleting purchase requests
 */
export function useDeletePurchase() {
  const { optimisticRemove, rollback } = useOptimisticUpdates();

  const mutation = useApiMutation<void, number>(
    async (id) => {
      await apiWrapper.delete(API_ENDPOINTS.PURCHASE.DELETE(id));
    },
    {
      invalidateKeys: [
        queryKeys.purchases.all,
        queryKeys.dashboard.metrics(),
      ],
      successMessage: 'Purchase request deleted successfully',
      onMutate: (id) => {
        // Optimistic update - remove from list immediately
        const context = optimisticRemove<PurchaseRequest>(
          queryKeys.purchases.list(),
          id
        );

        return context;
      },
      onError: (error, variables, context) => {
        // Rollback optimistic update on error
        if (context) {
          rollback(context as any);
        }
      },
    }
  );

  return {
    deletePurchase: mutation.mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

/**
 * Hook for approving purchase requests
 */
export function useApprovePurchase() {
  const { optimisticUpdate, rollback } = useOptimisticUpdates();

  const mutation = useApiMutation<PurchaseRequest, { id: number; remarks?: string }>(
    async ({ id, remarks }) => {
      const response = await apiWrapper.post<PurchaseRequest>(
        API_ENDPOINTS.PROJECT_MANAGER.APPROVE_PURCHASE,
        { purchase_id: id, remarks }
      );
      return response;
    },
    {
      invalidateKeys: [
        queryKeys.purchases.all,
        queryKeys.approvals.pending(),
        queryKeys.dashboard.metrics(),
      ],
      successMessage: 'Purchase request approved successfully',
      onMutate: ({ id }) => {
        // Optimistic update - update status immediately
        const context = optimisticUpdate<PurchaseRequest>(
          queryKeys.purchases.list(),
          {
            id,
            status: 'approved',
            approval_date: new Date().toISOString(),
          } as Partial<PurchaseRequest> & { id: any }
        );

        return context;
      },
      onError: (error, variables, context) => {
        // Rollback optimistic update on error
        if (context) {
          rollback(context as any);
        }
      },
    }
  );

  return {
    approvePurchase: mutation.mutate,
    isLoading: mutation.isLoading,
    error: mutation.error,
  };
}

/**
 * Hook for fetching purchase history
 */
export function usePurchaseHistory(id: string | number) {
  const queryKey = [...queryKeys.purchases.history(id)];

  const query = useApiQuery<any[]>(
    queryKey,
    API_ENDPOINTS.PURCHASE.HISTORY(id),
    {
      cacheStrategy: 'STATIC', // History doesn't change often
      enabled: !!id,
    }
  );

  return {
    history: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Hook for prefetching purchase data
 * Use this when you know user will navigate to a purchase
 */
export function usePrefetchPurchase() {
  const prefetch = async (id: string | number) => {
    // Prefetch both detail and history
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: [...queryKeys.purchases.detail(id)],
        queryFn: () => apiWrapper.get(API_ENDPOINTS.PURCHASE.GET(id)),
        staleTime: CACHE_TIMES.DYNAMIC.staleTime,
      }),
      queryClient.prefetchQuery({
        queryKey: [...queryKeys.purchases.history(id)],
        queryFn: () => apiWrapper.get(API_ENDPOINTS.PURCHASE.HISTORY(id)),
        staleTime: CACHE_TIMES.STATIC.staleTime,
      }),
    ]);
  };

  return { prefetch };
}