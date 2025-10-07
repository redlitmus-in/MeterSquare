import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Get auth token from localStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

export const siteEngineerService = {
  // Get assigned projects
  getMyProjects: async () => {
    const response = await axios.get(`${API_URL}/sitesupervisor_boq`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get project details
  getProjectDetails: async (projectId: number) => {
    const response = await axios.get(`${API_URL}/sitesupervisor_boq/${projectId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await axios.get(`${API_URL}/sitesupervisor_boq/dashboard`, {
      headers: getAuthHeaders()
    });
    return response.data;
  }
};
