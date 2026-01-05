/**
 * Performance Optimization Utilities
 * Aggressive optimizations for fast loading
 */

import { lazy } from 'react';

// Preload critical components
export const preloadComponent = (componentPath: string) => {
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = componentPath;
  document.head.appendChild(link);
};

// Intersection Observer for lazy loading
export const createLazyObserver = (callback: () => void) => {
  return new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          callback();
        }
      });
    },
    { rootMargin: '50px' }
  );
};

// Debounce for search/filter inputs
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Throttle for scroll events
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Memoize expensive calculations
export const memoize = <T extends (...args: any[]) => any>(fn: T) => {
  const cache = new Map();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

// Request Idle Callback wrapper
export const whenIdle = (callback: () => void) => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback);
  } else {
    setTimeout(callback, 1);
  }
};

// Batch DOM updates
export const batchUpdate = (updates: (() => void)[]) => {
  requestAnimationFrame(() => {
    updates.forEach(update => update());
  });
};

// Cache API responses
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const cachedFetch = async (url: string, options?: RequestInit) => {
  const cacheKey = `${url}${JSON.stringify(options)}`;
  const cached = apiCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const response = await fetch(url, options);
  const data = await response.json();

  apiCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};

// Virtual scroll helper
export const calculateVisibleItems = <T>(
  items: T[],
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  buffer = 3
) => {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + buffer
  );

  return {
    visibleItems: items.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    totalHeight: items.length * itemHeight
  };
};

// Prefetch next route
export const prefetchRoute = (path: string) => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = path;
  document.head.appendChild(link);
};

// Remove empty/null values from objects to reduce payload
export const cleanObject = (obj: any): any => {
  return Object.keys(obj).reduce((acc, key) => {
    if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
      acc[key] = obj[key];
    }
    return acc;
  }, {} as any);
};