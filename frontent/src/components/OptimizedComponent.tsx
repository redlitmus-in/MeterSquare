/**
 * Optimized Component Wrapper
 * Provides performance optimizations for React components
 */

import React, { memo, useMemo, useCallback, useRef, useEffect, ComponentType } from 'react';
import { errorHandler } from '@/utils/errorHandler';

interface OptimizationOptions {
  memoize?: boolean;
  debounceMs?: number;
  throttleMs?: number;
  lazyLoad?: boolean;
  trackPerformance?: boolean;
}

/**
 * Higher-order component for optimization
 */
export function withOptimization<P extends object>(
  Component: ComponentType<P>,
  options: OptimizationOptions = {}
): ComponentType<P> {
  const {
    memoize = true,
    debounceMs,
    throttleMs,
    lazyLoad = false,
    trackPerformance = false,
  } = options;

  const OptimizedComponent: React.FC<P> = (props) => {
    const renderCount = useRef(0);
    const lastRenderTime = useRef(Date.now());

    useEffect(() => {
      if (trackPerformance) {
        renderCount.current++;
        const now = Date.now();
        const timeSinceLastRender = now - lastRenderTime.current;
        lastRenderTime.current = now;

        if (renderCount.current > 1) {
          console.debug(
            `[Performance] ${Component.displayName || Component.name} rendered ${renderCount.current} times. Time since last render: ${timeSinceLastRender}ms`
          );
        }
      }
    });

    return <Component {...props} />;
  };

  OptimizedComponent.displayName = `Optimized(${Component.displayName || Component.name})`;

  return memoize ? memo(OptimizedComponent) : OptimizedComponent;
}

/**
 * Hook for debouncing values
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for throttling values
 */
export function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastUpdate = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdate.current >= delay) {
      setThrottledValue(value);
      lastUpdate.current = now;
    } else {
      const timeoutId = setTimeout(() => {
        setThrottledValue(value);
        lastUpdate.current = Date.now();
      }, delay - (now - lastUpdate.current));

      return () => clearTimeout(timeoutId);
    }
  }, [value, delay]);

  return throttledValue;
}

/**
 * Hook for optimized callbacks
 */
export function useOptimizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList,
  options: { debounce?: number; throttle?: number } = {}
): T {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastCallTime = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  });

  const optimizedCallback = useCallback((...args: Parameters<T>) => {
    const { debounce, throttle } = options;

    if (debounce) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, debounce);
    } else if (throttle) {
      const now = Date.now();
      if (now - lastCallTime.current >= throttle) {
        lastCallTime.current = now;
        callbackRef.current(...args);
      }
    } else {
      callbackRef.current(...args);
    }
  }, deps) as T;

  return optimizedCallback;
}

/**
 * Hook for lazy loading components
 */
export function useLazyLoad(
  importFn: () => Promise<{ default: ComponentType<any> }>,
  options: { preload?: boolean; fallback?: React.ReactNode } = {}
): {
  Component: React.LazyExoticComponent<ComponentType<any>> | null;
  isLoading: boolean;
  error: Error | null;
} {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [Component, setComponent] = React.useState<React.LazyExoticComponent<ComponentType<any>> | null>(null);

  useEffect(() => {
    if (options.preload) {
      setIsLoading(true);
      importFn()
        .then(() => {
          setComponent(React.lazy(importFn));
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err);
          setIsLoading(false);
          errorHandler.handleError(err, 'medium', 'system', {
            action: 'lazy_load_preload',
          });
        });
    } else {
      setComponent(React.lazy(importFn));
    }
  }, []);

  return { Component, isLoading, error };
}

/**
 * Performance monitoring HOC
 */
export function withPerformanceMonitoring<P extends object>(
  Component: ComponentType<P>,
  componentName?: string
): ComponentType<P> {
  const MonitoredComponent: React.FC<P> = (props) => {
    const renderStart = useRef(Date.now());
    const renderCount = useRef(0);

    useEffect(() => {
      renderCount.current++;
      const renderTime = Date.now() - renderStart.current;
      const name = componentName || Component.displayName || Component.name;

      if (renderTime > 16) {
        // 16ms is roughly 60fps
        console.warn(`[Performance Warning] ${name} took ${renderTime}ms to render (render #${renderCount.current})`);
      }

      // Reset render start time for next render
      renderStart.current = Date.now();
    });

    return <Component {...props} />;
  };

  MonitoredComponent.displayName = `Monitored(${componentName || Component.displayName || Component.name})`;

  return MonitoredComponent;
}

/**
 * Virtual list hook for large lists
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3,
}: {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}): {
  visibleItems: T[];
  totalHeight: number;
  offsetY: number;
  startIndex: number;
  endIndex: number;
} {
  const [scrollTop, setScrollTop] = React.useState(0);

  const { visibleItems, totalHeight, offsetY, startIndex, endIndex } = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
      visibleItems: items.slice(startIndex, endIndex + 1),
      totalHeight,
      offsetY: startIndex * itemHeight,
      startIndex,
      endIndex,
    };
  }, [items, itemHeight, containerHeight, scrollTop, overscan]);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    startIndex,
    endIndex,
  };
}

/**
 * Optimized context provider
 */
export function createOptimizedContext<T>() {
  const Context = React.createContext<T | undefined>(undefined);

  const Provider: React.FC<{ value: T; children: React.ReactNode }> = memo(({ value, children }) => {
    const memoizedValue = useMemo(() => value, [value]);
    return <Context.Provider value={memoizedValue}>{children}</Context.Provider>;
  });

  const useContext = () => {
    const context = React.useContext(Context);
    if (context === undefined) {
      throw new Error('useContext must be used within Provider');
    }
    return context;
  };

  return { Provider, useContext };
}

/**
 * Image optimization component
 */
export const OptimizedImage = memo<{
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  onError?: () => void;
}>(({ src, alt, className, loading = 'lazy', onError }) => {
  const [imageSrc, setImageSrc] = React.useState(src);
  const [isLoading, setIsLoading] = React.useState(true);

  const handleError = useCallback(() => {
    setImageSrc('/placeholder.png'); // Fallback image
    if (onError) onError();
  }, [onError]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <>
      {isLoading && <div className={`${className} bg-gray-200 animate-pulse`} />}
      <img
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading ? 'hidden' : ''}`}
        loading={loading}
        onError={handleError}
        onLoad={handleLoad}
      />
    </>
  );
});

OptimizedImage.displayName = 'OptimizedImage';