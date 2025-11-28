/**
 * Admin API Service
 * Handles all admin-related API calls
 */

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance with auth token
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token'); // Fixed: use 'access_token' not 'token'
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
};

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
    const response = await axios.get(`${API_URL}/admin/users`, {
      ...getAuthHeaders(),
      params
    });
    return response.data;
  },

  // Create new user
  async createUser(userData: CreateUserData): Promise<{ message: string; user: User }> {
    const response = await axios.post(`${API_URL}/admin/users`, userData, getAuthHeaders());
    return response.data;
  },

  // Update user
  async updateUser(userId: number, userData: UpdateUserData): Promise<{ message: string; user: User }> {
    const response = await axios.put(`${API_URL}/admin/users/${userId}`, userData, getAuthHeaders());
    return response.data;
  },

  // Delete user (soft delete)
  async deleteUser(userId: number): Promise<{ message: string; user_id: number }> {
    const response = await axios.delete(`${API_URL}/admin/users/${userId}`, getAuthHeaders());
    return response.data;
  },

  // Toggle user active status
  async toggleUserStatus(userId: number, isActive: boolean): Promise<{ message: string; user_id: number; is_active: boolean }> {
    const response = await axios.post(
      `${API_URL}/admin/users/${userId}/status`,
      { is_active: isActive },
      getAuthHeaders()
    );
    return response.data;
  },

  // ============================================
  // ROLE MANAGEMENT
  // ============================================

  async getRoles(): Promise<{ roles: Role[] }> {
    const response = await axios.get(`${API_URL}/admin/roles`, getAuthHeaders());
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
    const response = await axios.get(`${API_URL}/admin/projects`, {
      ...getAuthHeaders(),
      params
    });
    return response.data;
  },

  async assignProjectManager(projectId: number, userId: number): Promise<{ message: string; project_id: number; assigned_pm: any }> {
    const response = await axios.post(
      `${API_URL}/admin/projects/${projectId}/assign-pm`,
      { user_id: userId },
      getAuthHeaders()
    );
    return response.data;
  },

  // ============================================
  // SYSTEM STATISTICS & DASHBOARD
  // ============================================

  async getSystemStats(): Promise<SystemStats> {
    const response = await axios.get(`${API_URL}/admin/stats`, getAuthHeaders());
    return response.data;
  },

  async getRecentActivity(limit?: number): Promise<{ activities: Activity[] }> {
    const response = await axios.get(`${API_URL}/admin/activity`, {
      ...getAuthHeaders(),
      params: { limit }
    });
    return response.data;
  },

  // ============================================
  // SETTINGS MANAGEMENT
  // ============================================

  async getSettings(): Promise<{ settings: SystemSettings }> {
    const response = await axios.get(`${API_URL}/admin/settings`, getAuthHeaders());
    return response.data;
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<{ message: string; settings: SystemSettings }> {
    const response = await axios.put(`${API_URL}/admin/settings`, settings, getAuthHeaders());
    return response.data;
  },

  // Upload signature image (base64)
  async uploadSignature(signatureImage: string): Promise<{ success: boolean; message: string; signatureEnabled: boolean }> {
    const response = await axios.post(`${API_URL}/admin/settings/signature`, { signatureImage }, getAuthHeaders());
    return response.data;
  },

  // Delete signature image
  async deleteSignature(): Promise<{ success: boolean; message: string }> {
    const response = await axios.delete(`${API_URL}/admin/settings/signature`, getAuthHeaders());
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
    const response = await axios.get(`${API_URL}/admin/boqs`, {
      ...getAuthHeaders(),
      params
    });
    return response.data;
  },

  async approveBOQ(boqId: number, data: { approved: boolean; comments?: string }): Promise<{ message: string; boq_id: number; status: string }> {
    const response = await axios.post(`${API_URL}/admin/boqs/${boqId}/approve`, data, getAuthHeaders());
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

export interface SystemStats {
  users: {
    total: number;
    active: number;
    inactive: number;
    new_last_30d: number;
  };
  projects: {
    total: number;
    active: number;
    completed: number;
    pending: number;
    new_last_30d: number;
  };
  boq: {
    total: number;
    pending: number;
    approved: number;
  };
  role_distribution: Array<{
    role: string;
    count: number;
  }>;
  system_health: number;
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

export default adminApi;
