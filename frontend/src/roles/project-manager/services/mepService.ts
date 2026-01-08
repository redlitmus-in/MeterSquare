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

  // Add more MEP-specific methods here as needed
};
