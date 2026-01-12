import { apiClient } from '@/api/config';

// Dashboard Stats Interface for MEP Supervisor
export interface MEPDashboardStats {
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

// API Functions for MEP Supervisor
export const mepService = {
  // Get MEP Dashboard Statistics
  async getDashboardStats(): Promise<MEPDashboardStats> {
    try {
      const response = await apiClient.get('/mep_dashboard');
      return response.data;
    } catch (error) {
      console.error('Error fetching MEP dashboard stats:', error);
      throw error;
    }
  },

  // Get MEP Approval BOQs (For Approval tab)
  async getMEPApprovalBOQs(): Promise<any> {
    try {
      const response = await apiClient.get('/mep_approval');
      return response.data;
    } catch (error) {
      console.error('Error fetching MEP approval BOQs:', error);
      throw error;
    }
  },

  // Get MEP Pending BOQs (Pending tab)
  async getMEPPendingBOQs(): Promise<any> {
    try {
      const response = await apiClient.get('/mep_pending_boq');
      return response.data;
    } catch (error) {
      console.error('Error fetching MEP pending BOQs:', error);
      throw error;
    }
  },

  // Get MEP Assigned Projects (Assigned tab)
  async getMEPAssignedProjects(): Promise<any> {
    try {
      const response = await apiClient.get('/mep_assign_project');
      return response.data;
    } catch (error) {
      console.error('Error fetching MEP assigned projects:', error);
      throw error;
    }
  },

  // Get MEP Approved BOQs (Approved tab)
  async getMEPApprovedBOQs(): Promise<any> {
    try {
      const response = await apiClient.get('/mep_approve_boq');
      return response.data;
    } catch (error) {
      console.error('Error fetching MEP approved BOQs:', error);
      throw error;
    }
  },

  // Get MEP Rejected BOQs (Rejected tab)
  async getMEPRejectedBOQs(): Promise<any> {
    try {
      const response = await apiClient.get('/mep_rejected_boq');
      return response.data;
    } catch (error) {
      console.error('Error fetching MEP rejected BOQs:', error);
      throw error;
    }
  },

  // Get MEP Completed Projects (Completed tab)
  async getMEPCompletedProjects(): Promise<any> {
    try {
      const response = await apiClient.get('/mep_completed_project');
      return response.data;
    } catch (error) {
      console.error('Error fetching MEP completed projects:', error);
      throw error;
    }
  },
};
