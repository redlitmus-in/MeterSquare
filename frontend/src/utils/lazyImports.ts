/**
 * Lazy import utilities for heavy libraries
 * These functions ensure libraries are only loaded when needed
 */

// Lazy load PDF generation libraries
export const loadPDFLibraries = async () => {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  // Apply autoTable plugin to jsPDF
  const autoTable = autoTableModule.default;

  return { jsPDF, autoTable };
};

// Lazy load Excel library
export const loadExcelLibrary = async () => {
  const XLSX = await import('xlsx');
  return XLSX;
};

// Lazy load Highcharts libraries with better typing and error handling
export const loadChartLibraries = async () => {
  try {
    const [Highcharts, { default: HighchartsReact }] = await Promise.all([
      import('highcharts'),
      import('highcharts-react-official')
    ]);
    return { Highcharts: Highcharts.default, HighchartsReact };
  } catch (error) {
    console.error('Failed to load chart libraries:', error);
    throw error;
  }
};

// Preload critical chunks for better performance
export const preloadCriticalChunks = () => {
  // Use requestIdleCallback for non-critical preloading
  const idlePreload = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: 2000 });
    } else {
      setTimeout(callback, 1);
    }
  };

  // Preload router chunk (critical)
  idlePreload(() => {
    import('react-router-dom');
  });

  // Preload UI core components after initial render (medium priority)
  setTimeout(() => {
    import('@radix-ui/react-dialog');
    import('@radix-ui/react-select');
    import('@radix-ui/react-tabs');
  }, 1000);

  // Preload export utilities when idle (low priority)
  idlePreload(() => {
    // These will be loaded when user is idle, improving perceived performance
    setTimeout(() => {
      import('jspdf').catch(() => {}); // Silent fail for preloading
      import('xlsx').catch(() => {});
    }, 3000);
  });
};

// Prefetch role-specific dashboards based on user role
export const prefetchRoleDashboard = (role: string) => {
  const roleLower = role.toLowerCase();

  // Prefetch the appropriate dashboard based on role
  switch (roleLower) {
    case 'project manager':
    case 'projectmanager':
      import('@/roles/project-manager/pages/ProjectManagerHub');
      break;
    case 'estimator':
      import('@/roles/estimator/pages/EstimatorHub');
      break;
    case 'technical director':
    case 'technicaldirector':
      import('@/roles/technical-director/pages/TechnicalDirectorHub');
      break;
  }
};