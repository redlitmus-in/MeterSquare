/**
 * Admin API Service
 * Handles all admin-related API calls
 */

import { apiClient } from '@/api/config';

// Note: apiClient already handles auth headers, base URL, and cache control

// ============================================
// USER MANAGEMENT
// ============================================

export interface User {
  user_id: number;
  email: string;
  full_name: string;
  phone?: string;
  role_id: number;
  role_name?: string;
  department?: string;
  is_active: boolean;
  user_status?: string;
  last_login?: string;
  created_at?: string;
  last_modified_at?: string;
}

export interface CreateUserData {
  email: string;
  full_name: string;
  role_id: number;
  phone?: string;
  department?: string;
}

export interface UpdateUserData {
  full_name?: string;
  phone?: string;
  role_id?: number;
  department?: string;
  is_active?: boolean;
}

export interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
    has_prev: boolean;
    has_next: boolean;
  };
}

export const adminApi = {
  // Get all users with filtering
  async getUsers(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    role_id?: number;
    is_active?: boolean;
    department?: string;
  }): Promise<UsersResponse> {
    const response = await apiClient.get(`/admin/users`, {
      
      params
    });
    return response.data;
  },

  // Create new user
  async createUser(userData: CreateUserData): Promise<{ message: string; user: User }> {
    const response = await apiClient.post(`/admin/users`, userData);
    return response.data;
  },

  // Update user
  async updateUser(userId: number, userData: UpdateUserData): Promise<{ message: string; user: User }> {
    const response = await apiClient.put(`/admin/users/${userId}`, userData);
    return response.data;
  },

  // Delete user (soft delete)
  async deleteUser(userId: number): Promise<{ message: string; user_id: number }> {
    const response = await apiClient.delete(`/admin/users/${userId}`);
    return response.data;
  },

  // Toggle user active status
  async toggleUserStatus(userId: number, isActive: boolean): Promise<{ message: string; user_id: number; is_active: boolean }> {
    const response = await apiClient.post(`/admin/users/${userId}/status`, { is_active: isActive });
    return response.data;
  },

  // ============================================
  // ROLE MANAGEMENT
  // ============================================

  async getRoles(): Promise<{ roles: Role[] }> {
    const response = await apiClient.get(`/admin/roles`);
    return response.data;
  },

  // ============================================
  // PROJECT MANAGEMENT (Admin Override)
  // ============================================

  async getProjects(params?: {
    page?: number;
    per_page?: number;
    search?: string;
    status?: string;
  }): Promise<ProjectsResponse> {
    const response = await apiClient.get(`/admin/projects`, {
      
      params
    });
    return response.data;
  },

  async assignProjectManager(projectId: number, userId: number): Promise<{ message: string; project_id: number; assigned_pm: any }> {
    const response = await apiClient.post(`/admin/projects/${projectId}/assign-pm`, { user_id: userId });
    return response.data;
  },

  // ============================================
  // RECENT ACTIVITY
  // ============================================

  async getRecentActivity(limit?: number): Promise<{ activities: Activity[] }> {
    const response = await apiClient.get(`/admin/activity`, {
      params: { limit }
    });
    return response.data;
  },

  // ============================================
  // SETTINGS MANAGEMENT
  // ============================================

  async getSettings(): Promise<{ settings: SystemSettings }> {
    const response = await apiClient.get(`/admin/settings`);
    return response.data;
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<{ message: string; settings: SystemSettings }> {
    const response = await apiClient.put(`/admin/settings`, settings);
    return response.data;
  },

  // Upload signature image (base64)
  async uploadSignature(signatureImage: string): Promise<{ success: boolean; message: string; signatureEnabled: boolean }> {
    const response = await apiClient.post(`/admin/settings/signature`, { signatureImage });
    return response.data;
  },

  // Delete signature image
  async deleteSignature(): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete(`/admin/settings/signature`);
    return response.data;
  },

  // ============================================
  // BOQ MANAGEMENT
  // ============================================

  async getBOQs(params?: {
    page?: number;
    per_page?: number;
    status?: string;
  }): Promise<{ boqs: BOQItem[]; pagination: any }> {
    const response = await apiClient.get(`/admin/boqs`, {
      
      params
    });
    return response.data;
  },

  async approveBOQ(boqId: number, data: { approved: boolean; comments?: string }): Promise<{ message: string; boq_id: number; status: string }> {
    const response = await apiClient.post(`/admin/boqs/${boqId}/approve`, data);
    return response.data;
  },

  // ============================================
  // LOGIN HISTORY
  // ============================================

  // Get login history for a specific user
  async getUserLoginHistory(userId: number, params?: {
    page?: number;
    per_page?: number;
    days?: number;
  }): Promise<LoginHistoryResponse> {
    const response = await apiClient.get(`/admin/users/${userId}/login-history`, { params });
    return response.data;
  },

  // Get all users' login history (recent overview)
  async getAllLoginHistory(params?: {
    page?: number;
    per_page?: number;
    days?: number;
  }): Promise<LoginHistoryResponse> {
    const response = await apiClient.get(`/admin/login-history`, { params });
    return response.data;
  }
};

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface Role {
  role_id: number;
  role: string;
  description?: string;
  permissions?: string[];
  is_active: boolean;
  user_count: number;
  approval_limit?: number | null;
  level?: number;
  tier?: string;
  created_at?: string;
}

export interface Project {
  project_id: number;
  project_name: string;
  description?: string;
  location?: string;
  client?: string;
  work_type?: string;
  status: string;
  start_date?: string;
  end_date?: string;
  duration_days?: number;
  area?: string;
  assigned_pm?: {
    user_id: number;
    name: string;
    email: string;
  } | null;
  created_by?: string;
  created_at?: string;
}

export interface ProjectsResponse {
  projects: Project[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
  };
}

export interface Activity {
  id: string;
  type: string;
  action: string;
  user: string;
  details: string;
  timestamp: string;
}

export interface SystemSettings {
  // General Settings
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  timezone: string;
  currency: string;
  dateFormat: string;

  // Notification Settings
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  dailyReports: boolean;
  weeklyReports: boolean;

  // Security Settings
  sessionTimeout: number;
  passwordExpiry: number;
  twoFactorAuth: boolean;
  ipWhitelist: string;

  // System Settings
  maintenanceMode: boolean;
  debugMode: boolean;
  autoBackup: boolean;
  backupFrequency: string;
  dataRetention: number;

  // Project Settings
  defaultProjectDuration: number;
  autoAssignProjects: boolean;
  requireApproval: boolean;
  budgetAlertThreshold: number;

  // Document/Signature Settings
  signatureImage?: string | null;
  signatureEnabled?: boolean;

  // LPO Signature Settings
  mdSignatureImage?: string | null;
  mdName?: string;
  tdSignatureImage?: string | null;
  tdName?: string;
  companyStampImage?: string | null;
  companyTrn?: string;
  companyFax?: string;
  defaultPaymentTerms?: string;
}

export interface BOQItem {
  boq_id: number;
  project_id: number;
  project_name: string;
  created_by: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_review';
  total_amount: number;
  created_at: string;
  updated_at: string;
  version: number;
  approval_status?: string;
}

// ============================================
// LOGIN HISTORY
// ============================================

export interface LoginHistoryRecord {
  id: number;
  user_id: number;
  login_at: string;
  logout_at?: string;
  ip_address?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  login_method: 'email_otp' | 'sms_otp';
  status: 'active' | 'logged_out' | 'expired';
  created_at: string;
  user_name?: string;
  user_email?: string;
}

export interface LoginHistoryResponse {
  success: boolean;
  user?: {
    user_id: number;
    email: string;
    full_name: string;
  };
  login_history: LoginHistoryRecord[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  filter?: {
    days: number;
  };
}

// ============================================
// DASHBOARD ANALYTICS TYPES
// ============================================

export interface TrendDataPoint {
  date: string;
  count: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface RoleDistribution {
  role: string;
  role_id: number;
  count: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
}

export interface WorkTypeDistribution {
  work_type: string;
  count: number;
}

export interface TransactionMetrics {
  count: number;
  amount: number;
}

export interface PendingApproval {
  stage: string;
  count: number;
}

export interface DashboardAnalytics {
  success: boolean;
  period_days: number;
  generated_at: string;

  users: {
    total: number;
    active: number;
    inactive: number;
    new_in_period: number;
    role_distribution: RoleDistribution[];
    registration_trend: TrendDataPoint[];
  };

  projects: {
    total: number;
    active: number;
    completed: number;
    pending: number;
    on_hold: number;
    new_in_period: number;
    status_breakdown: StatusBreakdown[];
    work_type_distribution: WorkTypeDistribution[];
  };

  boqs: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    in_review: number;
    status_breakdown: StatusBreakdown[];
    creation_trend: TrendDataPoint[];
  };

  change_requests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
    purchase_completed: number;
    total_cost: number;
    avg_cost: number;
    status_breakdown: StatusBreakdown[];
    pending_approvals: PendingApproval[];
    creation_trend: TrendDataPoint[];
  };

  vendors: {
    total: number;
    active: number;
    inactive: number;
    new_in_period: number;
    category_distribution: CategoryDistribution[];
  };

  inventory: {
    total_materials: number;
    total_stock_value: number;
    total_stock_quantity: number;
    backup_stock_quantity: number;
    low_stock_alerts: number;
    transactions: {
      purchases: TransactionMetrics;
      withdrawals: TransactionMetrics;
    };
  };

  deliveries: {
    total_in_period: number;
    draft: number;
    issued: number;
    in_transit: number;
    delivered: number;
    status_breakdown: StatusBreakdown[];
  };

  material_requests: {
    total_in_period: number;
    pending: number;
    approved: number;
    dispatched: number;
    fulfilled: number;
    rejected: number;
    status_breakdown: StatusBreakdown[];
  };

  login_activity: {
    total_logins_in_period: number;
    login_trend: TrendDataPoint[];
    login_methods: Array<{ method: string; count: number }>;
  };

  system_health: {
    score: number;
    status: 'excellent' | 'good' | 'needs_attention';
    alerts: {
      low_stock_materials: number;
      pending_change_requests: number;
      inactive_users_percentage: number;
    };
  };
}

export interface TopPerformer {
  user_id: number;
  name: string;
  email: string;
  role?: string;
  project_count?: number;
  login_count?: number;
}

export interface TopPerformersResponse {
  success: boolean;
  period_days: number;
  top_project_managers: TopPerformer[];
  top_site_engineers: TopPerformer[];
  most_active_users: TopPerformer[];
}

export interface FinancialSummary {
  success: boolean;
  period_days: number;
  change_requests: {
    total_cost: number;
    average_cost: number;
    total_count: number;
    by_status: Array<{
      status: string;
      total_cost: number;
      count: number;
    }>;
  };
  inventory: {
    current_value: number;
    backup_value: number;
    total_value: number;
  };
  transactions: Record<string, { total: number; transport: number }>;
  transport_costs: number;
  daily_cost_trend: Array<{ date: string; cost: number }>;
}

// Add to adminApi object
export const adminApiExtended = {
  ...adminApi,

  // Get comprehensive dashboard analytics
  async getDashboardAnalytics(days?: number): Promise<DashboardAnalytics> {
    const response = await apiClient.get('/admin/dashboard/analytics', {
      params: { days }
    });
    return response.data;
  },

  // Get top performers
  async getTopPerformers(params?: { limit?: number; days?: number }): Promise<TopPerformersResponse> {
    const response = await apiClient.get('/admin/dashboard/top-performers', { params });
    return response.data;
  },

  // Get financial summary
  async getFinancialSummary(days?: number): Promise<FinancialSummary> {
    const response = await apiClient.get('/admin/dashboard/financial-summary', {
      params: { days }
    });
    return response.data;
  }
};

export default adminApi;
