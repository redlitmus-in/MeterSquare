import { useCallback } from 'react';
import { queryClient, getCachedData, setCachedData } from '@/lib/queryClient';

// Type for optimistic update context
export interface OptimisticContext<T = any> {
  previousData: T | undefined;
  queryKey: any[];
}

/**
 * Hook for handling optimistic updates with rollback capability
 */
export function useOptimisticUpdates() {
  /**
   * Create optimistic update for a list
   */
  const optimisticAdd = useCallback(<T extends { id?: any }>(
    queryKey: any[],
    newItem: T,
    options?: {
      position?: 'start' | 'end';
      idGenerator?: () => string | number;
    }
  ): OptimisticContext<T[]> => {
    const { position = 'start', idGenerator } = options || {};

    // Get current data
    const previousData = getCachedData<T[]>(queryKey);

    // Generate temporary ID if needed
    const itemWithId = {
      ...newItem,
      id: newItem.id || idGenerator?.() || `temp_${Date.now()}`,
      _optimistic: true, // Mark as optimistic
    };

    // Update cache
    setCachedData(queryKey, (old: T[] | undefined) => {
      const currentList = old || [];
      return position === 'start'
        ? [itemWithId, ...currentList]
        : [...currentList, itemWithId];
    });

    return { previousData, queryKey };
  }, []);

  /**
   * Optimistically update an item in a list
   */
  const optimisticUpdate = useCallback(<T extends { id: any }>(
    queryKey: any[],
    updatedItem: Partial<T> & { id: any },
    options?: {
      mergeStrategy?: 'replace' | 'merge';
    }
  ): OptimisticContext<T[]> => {
    const { mergeStrategy = 'merge' } = options || {};

    // Get current data
    const previousData = getCachedData<T[]>(queryKey);

    // Update cache
    setCachedData(queryKey, (old: T[] | undefined) => {
      if (!old) return old;

      return old.map((item) => {
        if (item.id === updatedItem.id) {
          if (mergeStrategy === 'replace') {
            return { ...updatedItem, _optimistic: true } as T;
          } else {
            return { ...item, ...updatedItem, _optimistic: true };
          }
        }
        return item;
      });
    });

    return { previousData, queryKey };
  }, []);

  /**
   * Optimistically remove an item from a list
   */
  const optimisticRemove = useCallback(<T extends { id: any }>(
    queryKey: any[],
    itemId: any
  ): OptimisticContext<T[]> => {
    // Get current data
    const previousData = getCachedData<T[]>(queryKey);

    // Update cache
    setCachedData(queryKey, (old: T[] | undefined) => {
      if (!old) return old;
      return old.filter((item) => item.id !== itemId);
    });

    return { previousData, queryKey };
  }, []);

  /**
   * Optimistically update a single item (not in a list)
   */
  const optimisticUpdateSingle = useCallback(<T>(
    queryKey: any[],
    updater: T | ((old: T | undefined) => T)
  ): OptimisticContext<T> => {
    // Get current data
    const previousData = getCachedData<T>(queryKey);

    // Update cache
    setCachedData(queryKey, updater);

    return { previousData, queryKey };
  }, []);

  /**
   * Rollback an optimistic update
   */
  const rollback = useCallback((context: OptimisticContext) => {
    const { previousData, queryKey } = context;
    setCachedData(queryKey, previousData);
  }, []);

  /**
   * Remove optimistic flags after successful mutation
   */
  const confirmOptimistic = useCallback((queryKey: any[]) => {
    const data = getCachedData<any>(queryKey);

    if (Array.isArray(data)) {
      setCachedData(queryKey, (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((item) => {
          const { _optimistic, ...rest } = item;
          return rest;
        });
      });
    } else if (data && typeof data === 'object') {
      const { _optimistic, ...rest } = data;
      setCachedData(queryKey, rest);
    }
  }, []);

  return {
    optimisticAdd,
    optimisticUpdate,
    optimisticRemove,
    optimisticUpdateSingle,
    rollback,
    confirmOptimistic,
  };
}

/**
 * Hook for optimistic status updates
 */
export function useOptimisticStatus() {
  const { optimisticUpdate, rollback } = useOptimisticUpdates();

  const updateStatus = useCallback(<T extends { id: any; status: string }>(
    queryKey: any[],
    itemId: any,
    newStatus: string,
    additionalUpdates?: Partial<T>
  ): OptimisticContext<T[]> => {
    return optimisticUpdate<T>(queryKey, {
      id: itemId,
      status: newStatus,
      ...additionalUpdates,
    } as Partial<T> & { id: any });
  }, [optimisticUpdate]);

  return { updateStatus, rollback };
}

/**
 * Hook for optimistic counter updates
 */
export function useOptimisticCounter() {
  const { optimisticUpdateSingle, rollback } = useOptimisticUpdates();

  const increment = useCallback((
    queryKey: any[],
    field: string,
    amount: number = 1
  ): OptimisticContext => {
    return optimisticUpdateSingle(queryKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        [field]: (old[field] || 0) + amount,
      };
    });
  }, [optimisticUpdateSingle]);

  const decrement = useCallback((
    queryKey: any[],
    field: string,
    amount: number = 1
  ): OptimisticContext => {
    return optimisticUpdateSingle(queryKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        [field]: Math.max(0, (old[field] || 0) - amount),
      };
    });
  }, [optimisticUpdateSingle]);

  return { increment, decrement, rollback };
}

/**
 * Hook for optimistic form updates
 */
export function useOptimisticForm<T>() {
  const { optimisticUpdateSingle, rollback } = useOptimisticUpdates();

  const updateField = useCallback((
    queryKey: any[],
    field: keyof T,
    value: any
  ): OptimisticContext<T> => {
    return optimisticUpdateSingle<T>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        [field]: value,
      };
    });
  }, [optimisticUpdateSingle]);

  const updateFields = useCallback((
    queryKey: any[],
    updates: Partial<T>
  ): OptimisticContext<T> => {
    return optimisticUpdateSingle<T>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        ...updates,
      };
    });
  }, [optimisticUpdateSingle]);

  return { updateField, updateFields, rollback };
}

/**
 * Utility to check if an item is optimistic
 */
export function isOptimistic(item: any): boolean {
  return item?._optimistic === true;
}

/**
 * Filter out optimistic items from a list
 */
export function filterOptimistic<T>(items: T[]): T[] {
  return items.filter((item: any) => !item._optimistic);
}

/**
 * Get only optimistic items from a list
 */
export function getOptimisticItems<T>(items: T[]): T[] {
  return items.filter((item: any) => item._optimistic);
}