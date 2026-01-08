import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from '@/utils/performanceOptimizer';

interface UseOptimizedDataOptions<T> {
  fetchFn: () => Promise<T>;
  debounceMs?: number;
  cacheKey?: string;
  cacheDuration?: number;
}

// Global cache
const dataCache = new Map<string, { data: any; timestamp: number }>();

export function useOptimizedData<T>({
  fetchFn,
  debounceMs = 300,
  cacheKey,
  cacheDuration = 60000 // 1 minute default
}: UseOptimizedDataOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Check cache first
    if (cacheKey) {
      const cached = dataCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cacheDuration) {
        setData(cached.data);
        setLoading(false);
        return;
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();

      // Cache the result
      if (cacheKey) {
        dataCache.set(cacheKey, { data: result, timestamp: Date.now() });
      }

      setData(result);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchFn, cacheKey, cacheDuration]);

  const debouncedFetch = useCallback(
    debounce(fetchData, debounceMs),
    [fetchData, debounceMs]
  );

  const refresh = useCallback(() => {
    // Clear cache and refetch
    if (cacheKey) {
      dataCache.delete(cacheKey);
    }
    fetchData();
  }, [cacheKey, fetchData]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, loading, error, refresh, refetch: debouncedFetch };
}