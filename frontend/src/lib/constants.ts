/**
 * Centralized Constants for MeterSquare Frontend
 *
 * This file contains all timing constants, cache configurations, and query keys
 * to ensure consistency across the application and avoid hardcoded values.
 *
 * STANDARD DATA REFRESH FLOW:
 * 1. User performs action → Optimistic update (0ms)
 * 2. API call made → Cache invalidation on success
 * 3. Real-time subscription → Background refresh for other users
 * 4. NO polling → Real-time handles all updates
 */

// =============================================================================
// TIMING CONSTANTS (in milliseconds)
// =============================================================================

/**
 * Stale times - How long data is considered fresh before needing revalidation
 * Based on data criticality and update frequency
 */
export const STALE_TIMES = {
  /** Very fresh data - notifications, alerts (10 seconds) */
  REALTIME: 10 * 1000,

  /** Critical data - change requests, BOQ (15 seconds) */
  CRITICAL: 15 * 1000,

  /** High priority - BOQ details, extra materials (20 seconds) */
  HIGH_PRIORITY: 20 * 1000,

  /** Standard data - projects, purchases, tasks (30 seconds) */
  STANDARD: 30 * 1000,

  /** Dashboard metrics - aggregated data (60 seconds) */
  DASHBOARD: 60 * 1000,

  /** Static data - rarely changes (5 minutes) */
  STATIC: 5 * 60 * 1000,

  /** Dynamic data - default (1 minute) */
  DYNAMIC: 60 * 1000,
} as const;

/**
 * Cache/GC times - How long to keep unused data in cache
 */
export const CACHE_GC_TIMES = {
  /** Short cache for real-time data (5 minutes) */
  SHORT: 5 * 60 * 1000,

  /** Standard cache (10 minutes) */
  STANDARD: 10 * 60 * 1000,

  /** Extended cache for frequently accessed data (15 minutes) */
  EXTENDED: 15 * 60 * 1000,

  /** Long cache for static data (30 minutes) */
  LONG: 30 * 60 * 1000,
} as const;

/**
 * API timeouts
 */
export const API_TIMEOUTS = {
  /** Standard API calls (60 seconds) */
  STANDARD: 60 * 1000,

  /** Long-running operations like BOQ uploads (5 minutes) */
  LONG_RUNNING: 5 * 60 * 1000,

  /** Quick operations (30 seconds) */
  QUICK: 30 * 1000,
} as const;

/**
 * Supabase real-time settings
 */
export const REALTIME_SETTINGS = {
  /** Connection timeout (30 seconds) */
  TIMEOUT: 30 * 1000,

  /** Heartbeat interval (15 seconds) */
  HEARTBEAT_INTERVAL: 15 * 1000,

  /** Events per second limit */
  EVENTS_PER_SECOND: 10,

  /** Max retry attempts for critical subscriptions */
  MAX_RETRIES: 5,

  /** Retry delay base (3 seconds) */
  RETRY_DELAY_BASE: 3 * 1000,

  /** Max retry delay (30 seconds) */
  MAX_RETRY_DELAY: 30 * 1000,
} as const;

/**
 * Toast/Notification durations
 */
export const TOAST_DURATIONS = {
  /** Short toast (2 seconds) */
  SHORT: 2000,

  /** Standard toast (3 seconds) */
  STANDARD: 3000,

  /** Long toast (5 seconds) */
  LONG: 5000,

  /** Persistent toast (10 seconds) */
  PERSISTENT: 10000,
} as const;

/**
 * Debounce/Throttle timings
 */
export const DEBOUNCE_TIMES = {
  /** Quick debounce for search (150ms) */
  SEARCH: 150,

  /** Standard debounce for inputs (300ms) */
  INPUT: 300,

  /** Visibility change debounce (300ms) */
  VISIBILITY: 300,

  /** Window focus refresh skip threshold (2 seconds) */
  FOCUS_SKIP: 2000,

  /** Recent update skip threshold (3 seconds) */
  RECENT_UPDATE_SKIP: 3000,
} as const;

// =============================================================================
// CACHE STRATEGY CONFIGURATIONS
// =============================================================================

/**
 * Pre-configured cache strategies for different data types
 * Use these in useApiQuery's cacheStrategy option
 *
 * NOTE: All staleTime values set to 0 to ensure fresh data is always fetched.
 * This prevents stale data issues after actions like sending BOQ to PM/TD.
 * The gcTime (cache time) is kept to avoid refetching during the same session
 * when navigating between pages, but data is always revalidated on mount.
 */
export const CACHE_TIMES = {
  /** Real-time data - always fetch fresh */
  REALTIME: {
    staleTime: 0,
    cacheTime: CACHE_GC_TIMES.SHORT,
  },

  /** Critical workflow data - always fetch fresh */
  CRITICAL: {
    staleTime: 0,
    cacheTime: CACHE_GC_TIMES.STANDARD,
  },

  /** Dashboard and aggregated metrics - always fetch fresh */
  DASHBOARD: {
    staleTime: 0,
    cacheTime: CACHE_GC_TIMES.EXTENDED,
  },

  /** Dynamic data - always fetch fresh */
  DYNAMIC: {
    staleTime: 0,
    cacheTime: CACHE_GC_TIMES.STANDARD,
  },

  /** Static data - rarely changes but still fetch fresh */
  STATIC: {
    staleTime: 0,
    cacheTime: CACHE_GC_TIMES.LONG,
  },
} as const;

// =============================================================================
// QUERY KEYS FACTORY
// =============================================================================

/**
 * Centralized query keys factory
 * Ensures consistent query key structure across the application
 *
 * Usage:
 * ```typescript
 * const { data } = useQuery({
 *   queryKey: queryKeys.purchases.list({ status: 'pending' }),
 *   queryFn: fetchPurchases
 * });
 * ```
 */
export const queryKeys = {
  // Purchase related
  purchases: {
    all: ['purchases'] as const,
    list: (filters?: any) => ['purchases', 'list', filters] as const,
    detail: (id: string | number) => ['purchases', 'detail', id] as const,
    history: (id: string | number) => ['purchases', 'history', id] as const,
  },

  // BOQ related
  boq: {
    all: ['boqs'] as const,
    list: (filters?: any) => ['boqs', 'list', filters] as const,
    detail: (id: string | number) => ['boq', id] as const,
    details: (id: string | number) => ['boq-details', id] as const,
    items: (boqId: string | number) => ['boq', boqId, 'items'] as const,
    subItems: (boqId: string | number, itemId: string | number) =>
      ['boq', boqId, 'items', itemId, 'sub-items'] as const,
  },

  // Project related
  projects: {
    all: ['projects'] as const,
    list: (filters?: any) => ['projects', 'list', filters] as const,
    detail: (id: string | number) => ['projects', id] as const,
    boqs: (projectId: string | number) => ['project-boqs', projectId] as const,
    overview: (projectId: string | number) => ['project-overview', projectId] as const,
  },

  // Dashboard related
  dashboard: {
    all: ['dashboard'] as const,
    metrics: (role?: string) => ['dashboard', 'metrics', role] as const,
    analytics: ['dashboard', 'analytics'] as const,
    notifications: ['dashboard', 'notifications'] as const,
  },

  // Change requests
  changeRequests: {
    all: ['change-requests'] as const,
    list: (filters?: any) => ['change-requests', 'list', filters] as const,
    detail: (id: string | number) => ['change-request', id] as const,
    byBoq: (boqId: string | number) => ['change-requests', 'boq', boqId] as const,
  },

  // Tasks
  tasks: {
    all: ['tasks'] as const,
    list: (filters?: any) => ['tasks', 'list', filters] as const,
    detail: (id: string | number) => ['tasks', id] as const,
    byUser: (userId: string) => ['tasks', userId] as const,
  },

  // Approvals
  approvals: {
    all: ['approvals'] as const,
    pending: (role?: string) => ['approvals', 'pending', role] as const,
    vendorApprovals: ['vendor-approvals'] as const,
  },

  // Notifications
  notifications: {
    all: ['notifications'] as const,
    byUser: (userId: string) => ['notifications', userId] as const,
    unread: ['notifications', 'unread'] as const,
  },

  // Materials
  materials: {
    all: ['materials'] as const,
    list: (filters?: any) => ['materials', 'list', filters] as const,
    detail: (id: string | number) => ['material', id] as const,
    extra: ['extra-materials'] as const,
    purchases: (projectId: string | number) => ['material-purchases', projectId] as const,
  },

  // Labour
  labour: {
    hours: (projectId: string | number) => ['labour-hours', projectId] as const,
  },

  // Vendors
  vendors: {
    all: ['vendors'] as const,
    list: (filters?: any) => ['vendors', 'list', filters] as const,
    detail: (id: string | number) => ['vendor', id] as const,
  },

  // Buyers
  buyers: {
    pendingPurchases: ['buyer-pending-purchases'] as const,
    approvedPOChildren: ['buyer-approved-po-children'] as const,
    pendingPOChildren: ['buyer-pending-po-children'] as const,
    completedPurchases: ['buyer-completed-purchases'] as const,
  },

  // Role-specific BOQs
  roleBOQs: {
    td: ['td_boqs'] as const,
    pm: ['pm_boqs'] as const,
    estimator: ['estimator_boqs'] as const,
  },

  // Purchase requests (different from purchases for compatibility)
  purchaseRequests: {
    all: ['purchase-requests'] as const,
    list: (filters?: any) => ['purchase-requests', 'list', filters] as const,
  },
} as const;

// =============================================================================
// REALTIME TABLES CONFIGURATION
// =============================================================================

/**
 * Supabase tables to subscribe to for different data types
 * Used by useAutoSync and real-time subscription setup
 */
export const REALTIME_TABLES = {
  /** BOQ data */
  BOQ: ['boq', 'boq_items', 'boq_sub_items'] as const,

  /** BOQ details */
  BOQ_DETAILS: ['boq', 'boq_items', 'boq_sub_items', 'boq_details'] as const,

  /** Change requests */
  CHANGE_REQUESTS: ['change_requests'] as const,

  /** Purchases */
  PURCHASES: ['purchases', 'purchase_materials'] as const,

  /** Purchases with change requests */
  PURCHASES_FULL: ['purchases', 'purchase_materials', 'change_requests'] as const,

  /** Projects */
  PROJECTS: ['projects'] as const,

  /** Projects with BOQ */
  PROJECTS_FULL: ['projects', 'boq', 'boq_items'] as const,

  /** Tasks */
  TASKS: ['tasks'] as const,

  /** Notifications */
  NOTIFICATIONS: ['notifications'] as const,

  /** Materials */
  MATERIALS: ['materials'] as const,

  /** Dashboard metrics (aggregated from multiple tables) */
  DASHBOARD: ['projects', 'purchases', 'tasks', 'change_requests'] as const,

  /** Labour hours */
  LABOUR: ['labour_hours'] as const,

  /** Project overview (comprehensive) */
  PROJECT_OVERVIEW: ['projects', 'boq', 'purchases', 'change_requests'] as const,
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CacheStrategy = keyof typeof CACHE_TIMES;
export type StaleTimeKey = keyof typeof STALE_TIMES;
export type QueryKeyFactory = typeof queryKeys;
