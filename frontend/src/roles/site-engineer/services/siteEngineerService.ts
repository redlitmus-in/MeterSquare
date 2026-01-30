import { apiClient } from '@/api/config';

// ============================================
// TYPE DEFINITIONS FOR SE ANALYTICS
// ============================================

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface TrendDataPoint {
  date: string;
  count: number;
}

export interface DeadlineBreakdown {
  overdue: number;
  due_this_week: number;
  due_this_month: number;
  on_track: number;
}

export interface SEProjectStats {
  total: number;
  active: number;
  in_progress: number;
  completed: number;
  on_hold: number;
  new_in_period: number;
  status_breakdown: StatusBreakdown[];
  deadline_breakdown: DeadlineBreakdown;
}

export interface SEItemStats {
  total_assigned: number;
  pending: number;
  in_progress: number;
  completed: number;
  unique_boqs: number;
  status_breakdown: StatusBreakdown[];
  completion_rate: number;
}

export interface SEChangeRequestStats {
  total: number;
  pending_pm_approval: number;
  pending_td_approval: number;
  approved: number;
  rejected: number;
  vendor_approved: number;
  purchase_completed: number;
  new_in_period: number;
  status_breakdown: StatusBreakdown[];
  total_cost: number;
  avg_cost: number;
}

export interface SEDeliveryStats {
  total: number;
  draft: number;
  issued: number;
  in_transit: number;
  delivered: number;
  received_in_period: number;
  pending_receipt: number;
  status_breakdown: StatusBreakdown[];
}

export interface SEPerformanceMetrics {
  project_completion_rate: number;
  item_completion_rate: number;
  cr_approval_rate: number;
  avg_cr_processing_days: number;
  efficiency_score: number;
}

export interface SEWorkload {
  pending_items: number;
  pending_crs: number;
  overdue_projects: number;
  urgent_items: number;
  pending_labour: number;
  pending_asset_returns: number;
  status: 'normal' | 'moderate' | 'high';
}

export interface SELabourStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  assigned: number;
  total_workers_requested: number;
  status_breakdown: StatusBreakdown[];
  arrivals: {
    total: number;
    confirmed: number;
    no_show: number;
    departed: number;
  };
}

export interface SEAssetDeliveryNotes {
  total: number;
  draft: number;
  issued: number;
  in_transit: number;
  delivered: number;
}

export interface SEAssetReturnNotes {
  total: number;
  draft: number;
  issued: number;
  in_transit: number;
  received: number;
}

export interface SEAssetStats {
  total_dispatched: number;
  total_returned: number;
  pending_returns: number;
  at_site: number;
  delivery_notes: SEAssetDeliveryNotes;
  return_notes: SEAssetReturnNotes;
}

export interface SEDashboardAnalytics {
  success: boolean;
  period_days: number;
  generated_at: string;
  projects: SEProjectStats;
  boq_items: SEItemStats;
  change_requests: SEChangeRequestStats;
  deliveries: SEDeliveryStats;
  labour: SELabourStats;
  assets: SEAssetStats;
  trends: {
    cr_creation: TrendDataPoint[];
  };
  performance: SEPerformanceMetrics;
  workload: SEWorkload;
}

export interface SEActivity {
  id: string;
  type: string;
  action: string;
  details: string;
  timestamp: string;
  status: string;
  project_id: number;
}

export interface SEActivityResponse {
  success: boolean;
  activities: SEActivity[];
}

export const siteEngineerService = {
  // Get all BOQs for Site Engineer
  getMyProjects: async () => {
    const response = await apiClient.get(`/sitesupervisor_boq`);
    return response.data;
  },

  // Get BOQ details by ID (changed from sitesupervisor_boq/{id} to boq/{id})
  getProjectDetails: async (boqId: number) => {
    const response = await apiClient.get(`/boq/${boqId}`);
    return response.data;
  },

  // Get all projects
  getAllProjects: async () => {
    const response = await apiClient.get(`/all_project`);
    return response.data;
  },

  // Update user status (online/offline)
  updateUserStatus: async (userId: number, status: string) => {
    const response = await apiClient.post(`/user_status`, {
      user_id: userId,
      status: status
    });
    return response.data;
  },

  // Validate if completion can be requested (read-only check, no side effects)
  validateCompletionRequest: async (projectId: number) => {
    const response = await apiClient.get(`/validate_completion/${projectId}`);
    return response.data;
  },

  // Request project completion (actually submits the request)
  requestProjectCompletion: async (projectId: number) => {
    const response = await apiClient.post(`/request_completion/${projectId}`, {});
    return response.data;
  },

  // Get all assets at my assigned projects
  getMySiteAssets: async () => {
    const response = await apiClient.get('/assets/my-site-assets');
    return response.data;
  },

  // Get ongoing projects (status != completed)
  getOngoingProjects: async (page?: number, pageSize?: number) => {
    const params: any = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    const response = await apiClient.get('/se_ongoing_projects', { params });
    return response.data;
  },

  // Get completed projects (status = completed)
  getCompletedProjects: async (page?: number, pageSize?: number) => {
    const params: any = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    const response = await apiClient.get('/se_completed_projects', { params });
    return response.data;
  },

  // ============================================
  // COMPREHENSIVE DASHBOARD ANALYTICS
  // ============================================

  // Get comprehensive dashboard analytics
  getDashboardAnalytics: async (days?: number): Promise<SEDashboardAnalytics> => {
    const response = await apiClient.get('/sitesupervisor/dashboard/analytics', {
      params: { days }
    });
    return response.data;
  },

  // Get recent activity
  getRecentActivity: async (limit?: number): Promise<SEActivityResponse> => {
    const response = await apiClient.get('/sitesupervisor/dashboard/activity', {
      params: { limit }
    });
    return response.data;
  }
};
