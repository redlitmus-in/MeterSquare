import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getEnvironmentConfig } from '../utils/environment';

// Get validated environment configuration
const envConfig = getEnvironmentConfig();

// API Configuration
export const API_BASE_URL = envConfig.api.baseUrl;

// Supabase Configuration with optimized Realtime settings
export const supabase = createClient(envConfig.supabase.url, envConfig.supabase.anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    timeout: 30000, // Increase timeout to 30 seconds
    heartbeatIntervalMs: 15000, // Send heartbeat every 15 seconds
  },
  global: {
    headers: {
      'apikey': envConfig.supabase.anonKey
    }
  }
});

// Axios instance with enhanced error handling
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // Increased timeout to 5 minutes for large BOQ operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for authentication
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

        if (viewingAsRole && viewingAsRole !== 'admin') {
          config.headers['X-Viewing-As-Role'] = viewingAsRole;
          config.headers['X-Viewing-As-Role-Id'] = viewingAsRoleId;
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

    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor with error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Log error details to console for debugging
    console.error('API Error:', {
      message: error.response?.data?.message || error.response?.data?.error || error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method,
      data: error.response?.data,
      headers: error.response?.headers
    });

    // Handle 401 Unauthorized - clear auth but don't redirect
    if (error.response?.status === 401) {
      // Clear auth data
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      localStorage.removeItem('auth-storage');
      
      // Clear auth store
      const authStore = (await import('@/store/authStore')).useAuthStore;
      authStore.setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
      
      // DISABLED: Auto redirect to login for debugging
      // Uncomment to re-enable redirects
      if (!window.location.pathname.includes('/login')) {
        window.location.replace('/login');
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