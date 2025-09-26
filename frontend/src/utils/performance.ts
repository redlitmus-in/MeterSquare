// Performance monitoring utilities for production

// Web Vitals monitoring
export const reportWebVitals = (onPerfEntry?: (metric: any) => void) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

// Custom performance metrics
interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private marks: Map<string, number> = new Map();

  // Start timing
  startMark(name: string): void {
    this.marks.set(name, performance.now());
  }

  // End timing and record metric
  endMark(name: string, unit = 'ms'): number | null {
    const startTime = this.marks.get(name);
    if (!startTime) {
      console.warn(`No start mark found for: ${name}`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Store metric
    const metric: PerformanceMetric = {
      name,
      value: duration,
      unit,
      timestamp: Date.now(),
    };

    const metrics = this.metrics.get(name) || [];
    metrics.push(metric);
    this.metrics.set(name, metrics);

    // Clean up mark
    this.marks.delete(name);

    // Log slow operations
    if (duration > 1000) {
      console.warn(`[Performance] Slow operation: ${name} took ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  // Get average metric value
  getAverageMetric(name: string): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;

    const sum = metrics.reduce((acc, m) => acc + m.value, 0);
    return sum / metrics.length;
  }

  // Get all metrics
  getAllMetrics(): Record<string, PerformanceMetric[]> {
    return Object.fromEntries(this.metrics);
  }

  // Clear metrics
  clearMetrics(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }

  // Report metrics to analytics
  reportToAnalytics(): void {
    const allMetrics = this.getAllMetrics();

    // Send to Google Analytics if available
    if (typeof window !== 'undefined' && (window as any).gtag) {
      Object.entries(allMetrics).forEach(([name, metrics]) => {
        const avgValue = this.getAverageMetric(name);
        if (avgValue) {
          (window as any).gtag('event', 'timing_complete', {
            name,
            value: Math.round(avgValue),
            event_category: 'Performance',
          });
        }
      });
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.table(
        Object.entries(allMetrics).map(([name, metrics]) => ({
          name,
          count: metrics.length,
          average: this.getAverageMetric(name)?.toFixed(2) + 'ms',
          last: metrics[metrics.length - 1]?.value.toFixed(2) + 'ms',
        }))
      );
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Measure function execution time
export const measurePerformance = async <T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> => {
  performanceMonitor.startMark(name);
  try {
    const result = await fn();
    performanceMonitor.endMark(name);
    return result;
  } catch (error) {
    performanceMonitor.endMark(name);
    throw error;
  }
};

// Measure React component render time
export const measureComponentPerformance = (componentName: string) => {
  return {
    onRender: (
      id: string,
      phase: 'mount' | 'update',
      actualDuration: number,
      baseDuration: number,
      startTime: number,
      commitTime: number
    ) => {
      // Log slow renders
      if (actualDuration > 16) {
        // More than 1 frame (16ms)
        console.warn(
          `[Performance] Slow ${phase} in ${componentName}: ${actualDuration.toFixed(2)}ms`
        );
      }

      // Store metric
      performanceMonitor.metrics.set(`${componentName}-${phase}`, [
        ...(performanceMonitor.metrics.get(`${componentName}-${phase}`) || []),
        {
          name: `${componentName}-${phase}`,
          value: actualDuration,
          unit: 'ms',
          timestamp: Date.now(),
        },
      ]);
    },
  };
};

// Bundle size analyzer helper
export const analyzeBundleSize = () => {
  if (typeof window !== 'undefined' && performance.getEntriesByType) {
    const resources = performance.getEntriesByType('resource');
    const jsResources = resources.filter((r) => r.name.endsWith('.js'));
    const cssResources = resources.filter((r) => r.name.endsWith('.css'));

    const totalJsSize = jsResources.reduce((sum, r: any) => sum + (r.transferSize || 0), 0);
    const totalCssSize = cssResources.reduce((sum, r: any) => sum + (r.transferSize || 0), 0);

    console.group('📊 Bundle Size Analysis');
    console.log(`Total JS: ${(totalJsSize / 1024).toFixed(2)} KB`);
    console.log(`Total CSS: ${(totalCssSize / 1024).toFixed(2)} KB`);
    console.log(`Total: ${((totalJsSize + totalCssSize) / 1024).toFixed(2)} KB`);

    // List large bundles
    const largeResources = resources
      .filter((r: any) => r.transferSize > 100 * 1024) // > 100KB
      .sort((a: any, b: any) => b.transferSize - a.transferSize);

    if (largeResources.length > 0) {
      console.warn('⚠️ Large resources detected:');
      largeResources.forEach((r: any) => {
        const name = r.name.split('/').pop();
        const size = (r.transferSize / 1024).toFixed(2);
        console.warn(`  - ${name}: ${size} KB`);
      });
    }

    console.groupEnd();
  }
};

// Intersection Observer for lazy loading
export const createLazyObserver = (
  onIntersect: () => void,
  options?: IntersectionObserverInit
) => {
  return new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        onIntersect();
      }
    });
  }, options);
};

// Resource hints for critical resources
export const addResourceHints = () => {
  const criticalResources = [
    '/assets/js/react-core.js',
    '/assets/js/ui-core.js',
    '/assets/css/index.css',
  ];

  criticalResources.forEach((resource) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource;
    link.as = resource.endsWith('.js') ? 'script' : 'style';
    document.head.appendChild(link);
  });
};

// Export performance report
export const exportPerformanceReport = () => {
  const report = {
    timestamp: new Date().toISOString(),
    metrics: performanceMonitor.getAllMetrics(),
    navigation: performance.getEntriesByType('navigation')[0],
    resources: performance.getEntriesByType('resource').map((r: any) => ({
      name: r.name.split('/').pop(),
      duration: r.duration,
      size: r.transferSize,
    })),
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `performance-report-${Date.now()}.json`;
  link.click();
};

// Initialize performance monitoring
export const initPerformanceMonitoring = () => {
  // Report web vitals
  reportWebVitals(console.log);

  // Analyze bundle size after load
  window.addEventListener('load', () => {
    setTimeout(() => {
      analyzeBundleSize();
    }, 1000);
  });

  // Add resource hints
  addResourceHints();

  // Report metrics periodically
  setInterval(() => {
    performanceMonitor.reportToAnalytics();
  }, 60000); // Every minute

  // Export global for debugging
  if (process.env.NODE_ENV === 'development') {
    (window as any).__PERF__ = {
      monitor: performanceMonitor,
      exportReport: exportPerformanceReport,
      analyze: analyzeBundleSize,
    };
  }
};