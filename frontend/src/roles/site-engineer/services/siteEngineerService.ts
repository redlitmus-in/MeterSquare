import { apiClient } from '@/api/config';

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

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await apiClient.get(`/sitesupervisor_boq/dashboard`);
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
  }
};
