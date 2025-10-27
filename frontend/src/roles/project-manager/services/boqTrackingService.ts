import axios from 'axios';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Add axios interceptor to handle authentication errors
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const errorMessage = error.response?.data?.message || 'Session expired';

      // Check if it's an invalid/expired token
      if (errorMessage.includes('token') || errorMessage.includes('Token')) {
        toast.error('Session expired. Please log in again.');

        // Clear localStorage and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Redirect to login page after a short delay
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      }
    }
    return Promise.reject(error);
  }
);

class BOQTrackingService {
  private getHeaders() {
    const token = localStorage.getItem('access_token'); // Fixed: was 'token', should be 'access_token'
    if (!token) {
      toast.error('No authentication token found. Please log in.');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
      throw new Error('No authentication token');
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Get all BOQs
   * Uses existing API: /api/pm_boq for Project Manager
   * Uses existing API: /api/td_boqs for Technical Director
   * Uses existing API: /api/all_boq for Admin
   */
  async getAllBOQs() {
    // Get user role from localStorage to determine which endpoint to use
    const userStr = localStorage.getItem('auth-storage');
    let userRole = '';

    if (userStr) {
      try {
        const authData = JSON.parse(userStr);
        userRole = (authData?.state?.user?.role || '').toLowerCase();
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }

    // Determine endpoint based on role
    let endpoint = `${API_URL}/pm_boq`; // Default to PM endpoint

    // Admin uses all_boq endpoint
    if (userRole === 'admin') {
      endpoint = `${API_URL}/all_boq`;
    }
    // Technical Director uses td_boqs endpoint
    else if (userRole === 'technical director' ||
             userRole === 'technical_director' ||
             userRole === 'technicaldirector') {
      endpoint = `${API_URL}/td_boqs?page=1&per_page=100`;
    }

    console.log('Fetching BOQs from:', endpoint, 'for role:', userRole);

    const response = await axios.get(
      endpoint,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Get specific BOQ details with items, materials, and labour
   * Uses existing API: /api/boq/<boq_id>
   */
  async getBOQDetails(boq_id: number) {
    const response = await axios.get(
      `${API_URL}/boq/${boq_id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Get BOQ planned vs actual comparison
   * Uses BOQ tracking API: /api/boq-tracking/planned-vs-actual/<boq_id>
   * This compares planned data from boq_details with actual data from MaterialPurchaseTracking and LabourTracking
   */
  async getPlannedVsActual(boq_id: number) {
    const response = await axios.get(
      `${API_URL}/planned-vs-actual/${boq_id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Add new material purchase to BOQ
   * Uses existing API: /api/purchase/add
   */
  async addMaterialPurchase(data: {
    boq_id: number;
    purchases: Array<{
      master_item_id: number;
      materials: Array<{
        master_material_id?: number;
        material_name: string;
        quantity: number;
        unit: string;
        unit_price: number;
      }>;
    }>;
  }) {
    const response = await axios.post(
      `${API_URL}/purchase/add`,
      data,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Get material purchase tracking for a BOQ
   * Uses existing API: /api/purchase/material-tracking/<boq_id>
   */
  async getMaterialTracking(boq_id: number) {
    const response = await axios.get(
      `${API_URL}/purchase/material-tracking/${boq_id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Get BOQ items with purchase tracking info
   * Uses existing API: /api/purchase/boq-items/<boq_id>
   */
  async getBOQItemsForPurchase(boq_id: number) {
    const response = await axios.get(
      `${API_URL}/purchase/boq-items/${boq_id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }
}

export const boqTrackingService = new BOQTrackingService();
