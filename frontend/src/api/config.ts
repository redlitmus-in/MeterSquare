import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getEnvironmentConfig } from '../utils/environment';
import { API_TIMEOUTS, REALTIME_SETTINGS, STALE_TIMES } from '@/lib/constants';

// Get validated environment configuration
const envConfig = getEnvironmentConfig();

// ✅ PERFORMANCE: In-memory cache for GET requests (stale-while-revalidate pattern)
interface CacheEntry {
  data: any;
  timestamp: number;
  etag?: string;
}
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL = STALE_TIMES.STANDARD; // 30 seconds cache for GET requests from constants

export const getCacheKey = (url: string, params?: any): string => {
  return `${url}-${JSON.stringify(params || {})}`;
};

export const getFromCache = (key: string): any | null => {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
};

export const setCache = (key: string, data: any): void => {
  responseCache.set(key, { data, timestamp: Date.now() });
  // Limit cache size to prevent memory issues
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
};

export const clearCache = (pattern?: string): void => {
  if (pattern) {
    for (const key of responseCache.keys()) {
      if (key.includes(pattern)) {
        responseCache.delete(key);
      }
    }
  } else {
    responseCache.clear();
  }
};

// Clear cache on page load/refresh to ensure fresh data
// This prevents stale data after hard refresh
if (typeof window !== 'undefined') {
  // Clear on page load
  responseCache.clear();

  // Also clear on beforeunload to ensure clean state on navigation
  window.addEventListener('beforeunload', () => {
    responseCache.clear();
  });
}

// API Configuration
export const API_BASE_URL = envConfig.api.baseUrl;

// Supabase Configuration with optimized Realtime settings from constants
export const supabase = createClient(envConfig.supabase.url, envConfig.supabase.anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: REALTIME_SETTINGS.EVENTS_PER_SECOND
    },
    timeout: REALTIME_SETTINGS.TIMEOUT,
    heartbeatIntervalMs: REALTIME_SETTINGS.HEARTBEAT_INTERVAL,
  },
  global: {
    headers: {
      'apikey': envConfig.supabase.anonKey
    }
  }
});

// ✅ PERFORMANCE: Standard API client with reasonable timeout from constants
// Most operations should complete within 60 seconds
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUTS.STANDARD, // 60 seconds from constants
  headers: {
    'Content-Type': 'application/json',
  },
});

// ✅ PERFORMANCE: Separate client for long-running operations (BOQ uploads, bulk operations)
// Only use this for operations that genuinely need extended time
export const longRunningApiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUTS.LONG_RUNNING, // 5 minutes from constants
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for authentication and deduplication
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add viewing context for admin role
    const adminViewStore = localStorage.getItem('admin-view-storage');
    if (adminViewStore) {
      try {
        const viewState = JSON.parse(adminViewStore);
        const viewingAsRole = viewState?.state?.viewingAsRole;
        const viewingAsRoleId = viewState?.state?.viewingAsRoleId;
        const viewingAsUserId = viewState?.state?.viewingAsUserId;

        if (viewingAsRole && viewingAsRole !== 'admin') {
          config.headers['X-Viewing-As-Role'] = viewingAsRole;
          config.headers['X-Viewing-As-Role-Id'] = viewingAsRoleId;
          // Send specific user ID if viewing as a specific user
          if (viewingAsUserId) {
            config.headers['X-Viewing-As-User-Id'] = viewingAsUserId;
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // Add request ID for tracing
    config.headers['X-Request-ID'] = crypto.randomUUID();

    // IMPORTANT: Remove Content-Type for FormData requests
    // Let browser set it with proper boundary for multipart/form-data
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    // ❌ DISABLED: In-memory axios cache causes stale data issues
    // React Query already handles caching properly with invalidation on mutations
    // The custom adapter was preventing fresh data from being fetched
    // Keeping the cache infrastructure for potential future use, but not using it

    // Always fetch fresh data - let React Query handle caching
    config.headers['X-Skip-Cache'] = 'true';

    return config;
  },
  (error) => {
    if (import.meta.env.DEV) {
      console.error('Request interceptor error:', error);
    }
    return Promise.reject(error);
  }
);

// ✅ FIXED: Robust token validation with retry mechanism
// Prevents false logouts when:
// 1. One request fails with 401 but others succeed (race condition)
// 2. Temporary network issues cause 401
// 3. Background refresh requests fail intermittently

// Increased debounce to handle slow concurrent requests
const LOGOUT_DEBOUNCE_MS = 1500;

// Number of consecutive 401s required before logout (prevents single request failures)
const CONSECUTIVE_401_THRESHOLD = 2;

// Auth endpoints that should NOT trigger logout on 401 (expected for invalid credentials)
const AUTH_ENDPOINTS = ['/login', '/register', '/verification_otp', '/refresh', '/reset-password', '/self'];

// Background endpoints that should not trigger logout (soft failures)
const BACKGROUND_ENDPOINTS = ['/self', '/me', '/user/status'];

const isAuthEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

const isBackgroundEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return BACKGROUND_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Module-scoped state for logout debouncing
let isLoggingOut = false;
let logoutTimeout: ReturnType<typeof window.setTimeout> | null = null;
let successfulRequestReceived = false;
let consecutive401Count = 0; // Track consecutive 401 errors
let lastSuccessfulRequestTime = Date.now();

// Reset 401 counter on successful request
const resetConsecutive401Count = () => {
  consecutive401Count = 0;
  lastSuccessfulRequestTime = Date.now();
};

const handleUnauthorized = async (requestUrl?: string) => {
  // Skip background endpoints - they shouldn't trigger logout
  if (isBackgroundEndpoint(requestUrl)) {
    if (import.meta.env.DEV) {
      console.log('[Auth] Background endpoint 401, ignoring:', requestUrl);
    }
    return;
  }

  // Increment consecutive 401 counter
  consecutive401Count++;

  if (import.meta.env.DEV) {
    console.log(`[Auth] 401 received (count: ${consecutive401Count}/${CONSECUTIVE_401_THRESHOLD}), url: ${requestUrl}`);
  }

  // Only proceed if we've hit the threshold
  if (consecutive401Count < CONSECUTIVE_401_THRESHOLD) {
    // Check if we had a recent successful request (within last 5 seconds)
    const timeSinceLastSuccess = Date.now() - lastSuccessfulRequestTime;
    if (timeSinceLastSuccess < 5000) {
      if (import.meta.env.DEV) {
        console.log('[Auth] Recent successful request, likely race condition. Skipping logout.');
      }
      return;
    }
  }

  // If already logging out, skip
  if (isLoggingOut) {
    if (import.meta.env.DEV) {
      console.log('[Auth] Already logging out, skipping duplicate call');
    }
    return;
  }

  // Check if token still exists
  const token = localStorage.getItem('access_token');
  if (!token) {
    if (!window.location.pathname.includes('/login')) {
      window.location.replace('/login');
    }
    return;
  }

  // Set flag to prevent multiple logout triggers
  isLoggingOut = true;
  successfulRequestReceived = false;

  // Clear any pending logout timeout
  if (logoutTimeout) {
    clearTimeout(logoutTimeout);
  }

  if (import.meta.env.DEV) {
    console.log('[Auth] Starting debounce timer for logout');
  }

  // Delay to allow concurrent requests to complete
  logoutTimeout = setTimeout(async () => {
    // Check if any successful request was received during debounce window
    if (successfulRequestReceived) {
      if (import.meta.env.DEV) {
        console.log('[Auth] Successful request received during debounce, canceling logout');
      }
      isLoggingOut = false;
      logoutTimeout = null;
      consecutive401Count = 0;
      return;
    }

    // Double-check token still exists after delay
    const tokenAfterDelay = localStorage.getItem('access_token');
    if (!tokenAfterDelay) {
      isLoggingOut = false;
      logoutTimeout = null;
      return;
    }

    // Final verification: Try to validate token one more time
    try {
      const response = await fetch(`${API_BASE_URL}/self`, {
        headers: { 'Authorization': `Bearer ${tokenAfterDelay}` }
      });

      if (response.ok) {
        if (import.meta.env.DEV) {
          console.log('[Auth] Token validation succeeded, canceling logout');
        }
        isLoggingOut = false;
        logoutTimeout = null;
        consecutive401Count = 0;
        return;
      }
    } catch {
      // Validation failed, proceed with logout
    }

    if (import.meta.env.DEV) {
      console.log('[Auth] Token invalid, proceeding with logout');
    }

    // Clear auth data
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth-storage');

    // Clear auth store
    try {
      const authStore = (await import('@/store/authStore')).useAuthStore;
      authStore.setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[Auth] Failed to clear auth store:', error);
      }
    }

    // Redirect to login
    if (!window.location.pathname.includes('/login')) {
      window.location.replace('/login');
    }

    // Reset flags
    isLoggingOut = false;
    logoutTimeout = null;
    consecutive401Count = 0;
  }, LOGOUT_DEBOUNCE_MS);
};

// Cleanup on page unload to prevent memory leaks
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (logoutTimeout) {
      clearTimeout(logoutTimeout);
      logoutTimeout = null;
      isLoggingOut = false;
    }
  });

  // Sync logout across browser tabs
  window.addEventListener('storage', (e) => {
    if (e.key === 'access_token' && !e.newValue && e.oldValue) {
      // Token was removed in another tab - redirect this tab too
      if (!window.location.pathname.includes('/login')) {
        window.location.replace('/login');
      }
    }
  });
}

// Response interceptor with error handling and caching
apiClient.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toLowerCase();

    // ✅ Clear ALL cache after any mutation to ensure fresh data
    // This prevents stale data showing after status changes
    if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
      responseCache.clear();
    }
    // ✅ PERFORMANCE: Cache successful GET responses
    else if (method === 'get' &&
        !response.config.headers?.['X-Cache-Hit'] &&
        !response.config.headers?.['X-Skip-Cache']) {
      const cacheKey = getCacheKey(response.config.url || '', response.config.params);
      setCache(cacheKey, response.data);
    }

    // ✅ FIXED: Reset 401 counter on any successful request
    // This prevents false logouts from isolated 401 errors
    resetConsecutive401Count();

    // If a request succeeds during debounce window, mark it
    if (isLoggingOut) {
      successfulRequestReceived = true;
      if (import.meta.env.DEV) {
        console.log('[Auth] Successful request during logout debounce window');
      }
    }

    return response;
  },
  async (error) => {
    // Log error details to console for debugging (only in development)
    if (import.meta.env.DEV) {
      console.error('API Error:', {
        message: error.response?.data?.message || error.response?.data?.error || error.message,
        status: error.response?.status,
        url: error.config?.url,
        method: error.config?.method,
      });
    }

    // Handle 401 Unauthorized - with consecutive count and debounce
    if (error.response?.status === 401) {
      // Skip auth endpoints - these 401s are expected for invalid credentials
      if (!isAuthEndpoint(error.config?.url)) {
        await handleUnauthorized(error.config?.url);
      }
    }
    
    // DISABLED: All automatic error page redirects for debugging
    // Uncomment this block to re-enable error page redirects
    /*
    if (error.response?.status === 403) {
      if (!window.location.pathname.includes('/403')) {
        window.location.replace('/403');
      }
    } else if (error.response?.status === 404) {
      const isAuthEndpoint = error.config?.url?.includes('/login') || 
                             error.config?.url?.includes('/verification_otp') ||
                             error.config?.url?.includes('/register');
      
      if (!isAuthEndpoint) {
        if (!window.location.pathname.includes('/404')) {
          window.location.replace('/404');
        }
      }
    } else if (error.response?.status >= 500) {
      if (!window.location.pathname.includes('/500')) {
        window.location.replace('/500');
      }
    } else if (!error.response) {
      if (!window.location.pathname.includes('/500')) {
        window.location.replace('/500');
      }
    }
    */

    return Promise.reject(error);
  }
);

// ✅ PERFORMANCE: Apply same interceptors to long-running client
// This ensures auth tokens and cache behavior work for bulk operations
longRunningApiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Skip cache for long-running operations (they're usually writes)
    config.headers['X-Skip-Cache'] = 'true';
    return config;
  },
  (error) => Promise.reject(error)
);

longRunningApiClient.interceptors.response.use(
  (response) => {
    // ✅ FIXED: Reset 401 counter on successful request
    resetConsecutive401Count();

    // Mark successful request during logout debounce window
    if (isLoggingOut) {
      successfulRequestReceived = true;
      if (import.meta.env.DEV) {
        console.log('[Auth] Successful long-running request during logout debounce window');
      }
    }
    return response;
  },
  async (error) => {
    if (import.meta.env.DEV) {
      console.error('Long-running API Error:', error.message);
    }
    // ✅ FIXED: Use consecutive count and debounced handler
    if (error.response?.status === 401) {
      if (!isAuthEndpoint(error.config?.url)) {
        await handleUnauthorized(error.config?.url);
      }
    }
    return Promise.reject(error);
  }
);

// API endpoints - cleaned and optimized
export const API_ENDPOINTS = {
  // Authentication endpoints
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
    ME: '/self',
  },
  
  // Common purchase endpoints used across roles
  PURCHASE: {
    CREATE: '/purchase',
    GET: (id: string | number) => `/purchase/${id}`,
    UPDATE: (id: string | number) => `/purchase/${id}`,
    DELETE: (id: string | number) => `/purchase/${id}`,
    HISTORY: (id: string | number) => `/purchase_history/${id}`,
    EMAIL: (id: string | number) => `/purchase_email/${id}`,
    UPLOAD_FILE: (id: string | number) => `/upload_file/${id}`,
    ALL: '/all_purchase',
  },
  
  // Project management endpoints
  PROJECTS: {
    LIST: '/projects',
    GET: (id: string) => `/projects/${id}`,
    CREATE: '/projects',
    UPDATE: (id: string) => `/projects/${id}`,
    DELETE: (id: string) => `/projects/${id}`,
    PROGRESS: (id: string) => `/projects/${id}/progress`,
  },
  
  // Task management endpoints
  TASKS: {
    LIST: '/tasks',
    GET: (id: string) => `/tasks/${id}`,
    CREATE: '/tasks',
    UPDATE: (id: string) => `/tasks/${id}`,
    DELETE: (id: string) => `/tasks/${id}`,
    MY_TASKS: '/tasks/my-tasks',
  },
  
  // Analytics endpoints
  ANALYTICS: {
    PROJECTS_PROGRESS: '/analytics/projects/progress',
  },
  
  // Dashboard endpoints
  DASHBOARDS: {
    SITE_SUPERVISOR: '/site_supervisor_dashboard',
    MEP_SUPERVISOR: '/mep_supervisor_dashboard',
  },
  
  // Role-specific endpoints
  PROJECT_MANAGER: {
    APPROVE_PURCHASE: '/pm_approval',
    GET_PURCHASES: '/projectmanger_purchases', // Match backend typo
  },
  
  ESTIMATION: {
    APPROVAL: '/estimation_approval',
    DASHBOARD: '/estimation_dashboard',
    PURCHASES: '/estimation_purchase',
    PURCHASE_DETAILS: (id: string | number) => `/purchase/${id}`,
    PURCHASE_HISTORY: (id: string | number) => `/purchase_history/${id}`,
  },
  
  // File Download endpoint - used across roles
  DOWNLOAD_FILES: (key: string, id: string | number) => `/download_files?key=${key}&id=${id}`,

  // Change Request endpoints
  CHANGE_REQUEST: {
    CREATE: '/boq/change-request',
    LIST: '/change-requests',
    GET: (id: string | number) => `/change-request/${id}`,
    UPDATE: (id: string | number) => `/change-request/${id}`,
    APPROVE: (id: string | number) => `/change-request/${id}/approve`,
    REJECT: (id: string | number) => `/change-request/${id}/reject`,
    SEND_FOR_REVIEW: (id: string | number) => `/change-request/${id}/send-for-review`,
    COMPLETE_PURCHASE: (id: string | number) => `/change-request/${id}/complete-purchase`,
    BOQ_REQUESTS: (boqId: string | number) => `/boq/${boqId}/change-requests`,
    BUYERS: '/buyers',
  },

  TECHNICAL_DIRECTOR: {
    APPROVAL: '/tech_approval',
    DASHBOARD: '/tech_dashboard',
    PURCHASES: '/technical_purchase',
    PURCHASE_DETAILS: (id: string | number) => `/purchase/${id}`,
    PURCHASE_HISTORY: (id: string | number) => `/purchase_history/${id}`,
  },
  
  ACCOUNTS: {
    PROCESS_PAYMENT: '/payments/process',
    APPROVE_PAYMENT: '/payments/approve',
    GET_PAYMENTS: '/payments',
    CREATE_ACKNOWLEDGEMENT: '/acknowledgements',
    GET_ACKNOWLEDGEMENTS: '/acknowledgements',
    FINANCIAL_SUMMARY: '/financial_summary',
    PENDING_APPROVALS: '/pending_approvals',
    DASHBOARD: '/account_dashboard',
    GET_PURCHASES: '/account_purchase',
  },
  
  // Procurement endpoints
  PROCUREMENT: {
    ALL_PURCHASES: '/all_procurement',
    APPROVAL: (id: string | number) => `/procurement_approval/${id}`,
  },
  
  // Site Supervisor specific
  SITE_SUPERVISOR: {
    ALL_PURCHASES: '/all_purchase',
  },
};

// Response wrapper utility
export const apiWrapper = {
  async get<T>(url: string, params?: any): Promise<T> {
    const response = await apiClient.get(url, { params });
    return response.data;
  },

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await apiClient.post(url, data);
    return response.data;
  },

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await apiClient.put(url, data);
    return response.data;
  },

  async patch<T>(url: string, data?: any): Promise<T> {
    const response = await apiClient.patch(url, data);
    return response.data;
  },

  async delete<T>(url: string): Promise<T> {
    const response = await apiClient.delete(url);
    return response.data;
  },
};