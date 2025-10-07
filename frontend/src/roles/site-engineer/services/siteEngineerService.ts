import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Get auth token from localStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

export const siteEngineerService = {
  // Get all BOQs (changed from sitesupervisor_boq to all_boq)
  getMyProjects: async () => {
    const response = await axios.get(`${API_URL}/all_boq`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get BOQ details by ID (changed from sitesupervisor_boq/{id} to boq/{id})
  getProjectDetails: async (boqId: number) => {
    const response = await axios.get(`${API_URL}/boq/${boqId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get all projects
  getAllProjects: async () => {
    const response = await axios.get(`${API_URL}/all_project`, {
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
