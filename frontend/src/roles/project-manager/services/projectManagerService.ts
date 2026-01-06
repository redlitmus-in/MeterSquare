import { apiClient } from '@/api/config';

export interface BOQItem {
  boq_id: number;
  boq_name: string;
  project_id: number;
  project_name?: string;
  project_code?: string;
  user_id?: number;
  user_name?: string;
  status?: string; // Legacy field
  boq_status?: string; // Actual field returned by backend
  created_at?: string;
  created_by?: string;
  last_modified_at?: string;
  last_modified_by?: string;
  email_sent?: boolean;
  history?: BOQHistory[];
  boq_details?: BOQDetails;
}

export interface BOQHistory {
  boq_history_id: number;
  boq_status: string;
}

export interface BOQDetails {
  boq_detail_id: number;
  boq_id: number;
  total_cost: number;
  total_items: number;
  total_materials: number;
  total_labour: number;
  file_name?: string;
  boq_details?: any;
  created_at?: string;
  created_by?: string;
}

export interface ProjectManager {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  role_id?: number;
  department?: string;
  is_active?: boolean;
  created_at?: string;
}

// Dashboard Stats Interface
export interface PMDashboardStats {
  success: boolean;
  stats: {
    total_boq_items: number;
    items_assigned: number;
    pending_assignment: number;
    total_project_value: number;
  };
  boq_status: {
    approved: number;
    pending: number;
    rejected: number;
    completed: number;
  };
  items_breakdown: {
    materials: number;
    labour: number;
  };
  recent_activities: Array<{
    boq_id: number;
    boq_name: string;
    project_name: string;
    status: string;
    last_modified: string;
  }>;
  projects?: Array<{
    project_id: number;
    project_name: string;
    status: string;
    progress: number;
  }>;
}

// API Functions
export const projectManagerService = {
  // Get PM Dashboard Statistics
  async getDashboardStats(): Promise<PMDashboardStats> {
    try {
      const response = await apiClient.get('/pm_dashboard');
      return response.data;
    } catch (error) {
      console.error('Error fetching PM dashboard stats:', error);
      throw error;
    }
  },

  // Get BOQs pending PM approval (For Approval tab)
  async getPMApprovalBOQs(page?: number, pageSize?: number): Promise<any> {
    try {
      const params: any = {};
      if (page) params.page = page;
      if (pageSize) params.page_size = pageSize;
      const response = await apiClient.get('/pm_approval_boq', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM approval BOQs:', error);
      throw error;
    }
  },

  // Get pending BOQs (Pending tab)
  async getPMPendingBOQs(page?: number, pageSize?: number): Promise<any> {
    try {
      const params: any = {};
      if (page) params.page = page;
      if (pageSize) params.page_size = pageSize;
      const response = await apiClient.get('/pm_pending_boq', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM pending BOQs:', error);
      throw error;
    }
  },

  // Get assigned projects (Assigned tab)
  async getPMAssignedProjects(page?: number, pageSize?: number): Promise<any> {
    try {
      const params: any = {};
      if (page) params.page = page;
      if (pageSize) params.page_size = pageSize;
      const response = await apiClient.get('/pm_assign_project', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM assigned projects:', error);
      throw error;
    }
  },

  // Get approved BOQs (Approved tab)
  async getPMApprovedBOQs(page?: number, pageSize?: number): Promise<any> {
    try {
      const params: any = {};
      if (page) params.page = page;
      if (pageSize) params.page_size = pageSize;
      const response = await apiClient.get('/pm_approve_boq', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM approved BOQs:', error);
      throw error;
    }
  },

  // Get rejected BOQs (Rejected tab)
  async getPMRejectedBOQs(page?: number, pageSize?: number): Promise<any> {
    try {
      const params: any = {};
      if (page) params.page = page;
      if (pageSize) params.page_size = pageSize;
      const response = await apiClient.get('/pm_rejected_boq', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM rejected BOQs:', error);
      throw error;
    }
  },

  // Get completed projects (Completed tab)
  async getPMCompletedProjects(page?: number, pageSize?: number): Promise<any> {
    try {
      const params: any = {};
      if (page) params.page = page;
      if (pageSize) params.page_size = pageSize;
      const response = await apiClient.get('/pm_completed_project', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM completed projects:', error);
      throw error;
    }
  },

  // Get ALL BOQs for Production Management (All tabs - filtered on frontend)
  async getPMProductionManagementBOQs(page?: number, pageSize?: number): Promise<any> {
    try {
      const params: any = {};
      if (page) params.page = page;
      if (pageSize) params.page_size = pageSize;
      const response = await apiClient.get('/pm_production_management', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM production management BOQs:', error);
      throw error;
    }
  },

  // Get all Project Managers
  async getAllPMs(): Promise<{ assigned_project_managers: any[]; unassigned_project_managers: any[] }> {
    try {
      const response = await apiClient.get('/all_pm');
      return response.data;
    } catch (error) {
      console.error('Error fetching all PMs:', error);
      throw error;
    }
  },

  // Get PM by ID with assigned projects
  async getPMById(userId: number): Promise<{ user_list: any[] }> {
    try {
      const response = await apiClient.get(`/get_pm/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching PM by ID:', error);
      throw error;
    }
  },

  // Update PM details and project assignments
  async updatePM(userId: number, data: {
    full_name?: string;
    email?: string;
    phone?: string;
    assigned_projects?: number[];
  }): Promise<any> {
    try {
      const response = await apiClient.put(`/update_pm/${userId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating PM:', error);
      throw error;
    }
  },

  // Delete PM (soft delete)
  async deletePM(userId: number): Promise<any> {
    try {
      const response = await apiClient.delete(`/delete_pm/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting PM:', error);
      throw error;
    }
  },

  // Assign projects to PM
  async assignProjects(userId: number, projectIds: number[]): Promise<any> {
    try {
      const response = await apiClient.post('/assign_projects', {
        user_id: userId,
        project_ids: projectIds
      });
      return response.data;
    } catch (error) {
      console.error('Error assigning projects:', error);
      throw error;
    }
  },

  // Create PM
  async createPM(data: {
    full_name: string;
    email: string;
    phone: string;
    password?: string;
  }): Promise<any> {
    try {
      const response = await apiClient.post('/craete_pm', data);
      return response.data;
    } catch (error) {
      console.error('Error creating PM:', error);
      throw error;
    }
  },

  // Get current PM's assigned projects by user ID
  async getMyProjects(userId: number): Promise<{ user_list: any[] }> {
    try {
      const response = await apiClient.get(`/get_pm/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching my projects:', error);
      throw error;
    }
  },

  // ===== Site Supervisor (Site Engineer) Management =====

  // Get all site supervisors (assigned and unassigned)
  async getAllSiteSupervisors(): Promise<{
    assigned_project_managers: any[];
    unassigned_project_managers: any[];
    assigned_count: number;
    unassigned_count: number;
  }> {
    try {
      const response = await apiClient.get('/all_sitesupervisor');
      return response.data;
    } catch (error) {
      console.error('Error fetching site supervisors:', error);
      throw error;
    }
  },

  // Get site supervisor by ID with assigned projects
  async getSiteSupervisorById(siteSupervisorId: number): Promise<{ user_list: any[] }> {
    try {
      const response = await apiClient.get(`/get_sitesupervisor/${siteSupervisorId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching site supervisor by ID:', error);
      throw error;
    }
  },

  // Create a new site supervisor
  async createSiteSupervisor(data: {
    full_name: string;
    email: string;
    phone: string;
    project_ids?: number[];
  }): Promise<any> {
    try {
      const response = await apiClient.post('/create_sitesupervisor', data);
      return response.data;
    } catch (error) {
      console.error('Error creating site supervisor:', error);
      throw error;
    }
  },

  // Update site supervisor details and assignments
  async updateSiteSupervisor(siteSupervisorId: number, data: {
    full_name?: string;
    email?: string;
    phone?: string;
    assigned_projects?: number[];
  }): Promise<any> {
    try {
      const response = await apiClient.put(`/update_sitesupervisor/${siteSupervisorId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating site supervisor:', error);
      throw error;
    }
  },

  // Delete site supervisor (soft delete)
  async deleteSiteSupervisor(siteSupervisorId: number): Promise<any> {
    try {
      const response = await apiClient.delete(`/delete_sitesupervisor/${siteSupervisorId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting site supervisor:', error);
      throw error;
    }
  },

  // Assign projects to site supervisor
  async assignProjectsToSiteSupervisor(data: {
    site_supervisor_id: number;
    project_ids: number[];
  }): Promise<any> {
    try {
      const response = await apiClient.post('/ss_assign', data);
      return response.data;
    } catch (error) {
      console.error('Error assigning projects to site supervisor:', error);
      throw error;
    }
  },

  // Get BOQ details by ID
  async getBOQById(boqId: number): Promise<any> {
    try {
      const response = await apiClient.get(`/boq/${boqId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching BOQ details:', error);
      throw error;
    }
  },

  // Get BOQ history by ID
  async getBOQHistory(boqId: number): Promise<any> {
    try {
      const response = await apiClient.get(`/boq_history/${boqId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching BOQ history:', error);
      throw error;
    }
  },

  // Update user status (online/offline)
  async updateUserStatus(userId: number, status: string): Promise<any> {
    try {
      const response = await apiClient.post('/user_status', {
        user_id: userId,
        status: status
      });
      return response.data;
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  },

  // Update project details
  async updateProject(projectId: number, data: { status?: string; [key: string]: any }): Promise<any> {
    try {
      const response = await apiClient.put(`/update_project/${projectId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  },

  // Send BOQ to estimator (approve or reject)
  async sendBOQToEstimator(data: {
    boq_id: number;
    boq_status: 'approved' | 'rejected';
    rejection_reason?: string;
    comments?: string;
  }): Promise<any> {
    const response = await apiClient.post('/boq/send_estimator', data);
    return response.data;
  },

  // Alias for deleteSiteSupervisor for backward compatibility
  async deleteSE(siteSupervisorId: number): Promise<any> {
    return this.deleteSiteSupervisor(siteSupervisorId);
  },

  // Alias for updateSiteSupervisor for backward compatibility
  async updateSE(siteSupervisorId: number, data: {
    full_name?: string;
    email?: string;
    phone?: string;
  }): Promise<any> {
    return this.updateSiteSupervisor(siteSupervisorId, data);
  },

  // Approve project completion (legacy - for backward compatibility)
  async approveProjectCompletion(projectId: number): Promise<any> {
    try {
      const response = await apiClient.put(`/projects/${projectId}`, {
        status: 'completed'
      });
      return response.data;
    } catch (error) {
      console.error('Error approving project completion:', error);
      throw error;
    }
  },

  // Get project completion details showing PM-SE pairs and confirmation status
  async getProjectCompletionDetails(projectId: number): Promise<any> {
    try {
      const response = await apiClient.get(`/projects/${projectId}/completion-details`);
      return response.data;
    } catch (error) {
      console.error('Error getting completion details:', error);
      throw error;
    }
  },

  // PM confirms SE completion (only for their assignments)
  async confirmSECompletion(projectId: number, seUserId: number): Promise<any> {
    try {
      const response = await apiClient.post('/confirm-se-completion', {
        project_id: projectId,
        se_user_id: seUserId
      });
      return response.data;
    } catch (error) {
      console.error('Error confirming SE completion:', error);
      throw error;
    }
  }
};
