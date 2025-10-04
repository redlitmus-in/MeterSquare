import { apiClient, API_ENDPOINTS } from '@/api/config';

// Types
export interface Project {
  project_id: number;
  project_name: string;
  client?: string;
  location?: string;
  status?: string;
  user_id?: number;
  created_at?: string;
  last_modified_at?: string;
}

export interface BOQItem {
  boq_id: number;
  boq_name: string;
  project_id: number;
  project_name?: string;
  user_id?: number;
  user_name?: string;
  status: string;
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

export interface Purchase {
  id: number;
  project_id?: number;
  boq_id?: number;
  status: string;
  amount?: number;
  vendor?: string;
  created_at?: string;
  updated_at?: string;
}

// API Functions
export const projectManagerService = {
  // Get all BOQs for the current PM's assigned projects
  async getMyBOQs(page: number = 1, perPage: number = 10): Promise<{ boqs: BOQItem[]; pagination: any }> {
    try {
      const response = await apiClient.get('/pm_boq', {
        params: { page, per_page: perPage }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching PM BOQs:', error);
      throw error;
    }
  },

  // Get all Project Managers
  async getAllPMs(): Promise<{ assigned_project_managers: any[]; unassigned_project_managers: any[] }> {
    try {
      const response = await apiClient.get('/api/all_pm');
      return response.data;
    } catch (error) {
      console.error('Error fetching all PMs:', error);
      throw error;
    }
  },

  // Get PM by ID with assigned projects
  async getPMById(userId: number): Promise<{ user_list: any[] }> {
    try {
      const response = await apiClient.get(`/api/get_pm/${userId}`);
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
      const response = await apiClient.put(`/api/update_pm/${userId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating PM:', error);
      throw error;
    }
  },

  // Delete PM (soft delete)
  async deletePM(userId: number): Promise<any> {
    try {
      const response = await apiClient.delete(`/api/delete_pm/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting PM:', error);
      throw error;
    }
  },

  // Assign projects to PM
  async assignProjects(userId: number, projectIds: number[]): Promise<any> {
    try {
      const response = await apiClient.post('/api/assign_projects', {
        user_id: userId,
        project_ids: projectIds
      });
      return response.data;
    } catch (error) {
      console.error('Error assigning projects:', error);
      throw error;
    }
  },

  // Get all projects
  async getAllProjects(): Promise<Project[]> {
    try {
      const response = await apiClient.get('/api/all_project');
      return response.data.projects || response.data || [];
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  },

  // Get project by ID
  async getProjectById(projectId: number): Promise<Project> {
    try {
      const response = await apiClient.get(`/api/project/${projectId}`);
      return response.data.project || response.data;
    } catch (error) {
      console.error('Error fetching project:', error);
      throw error;
    }
  },

  // Get PM purchases/approvals
  async getPMPurchases(): Promise<Purchase[]> {
    try {
      const response = await apiClient.get(API_ENDPOINTS.PROJECT_MANAGER.GET_PURCHASES);
      return response.data.purchases || response.data || [];
    } catch (error) {
      console.error('Error fetching PM purchases:', error);
      throw error;
    }
  },

  // Approve purchase
  async approvePurchase(purchaseId: number, data: any): Promise<any> {
    try {
      const response = await apiClient.post(API_ENDPOINTS.PROJECT_MANAGER.APPROVE_PURCHASE, {
        purchase_id: purchaseId,
        ...data
      });
      return response.data;
    } catch (error) {
      console.error('Error approving purchase:', error);
      throw error;
    }
  }
};
