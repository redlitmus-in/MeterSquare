import { apiClient } from '@/api/config';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

// Note: apiClient already handles auth headers and error handling for 401 responses

class BOQTrackingService {
  private getHeaders() {
    const token = localStorage.getItem('access_token'); // Fixed: was 'token', should be 'access_token'
    if (!token) {
      showError('No authentication token found. Please log in.');
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
    let endpoint = `/pm_boq`; // Default to PM endpoint

    // Admin uses all_boq endpoint
    if (userRole === 'admin') {
      endpoint = `/all_boq`;
    }
    // Technical Director uses td_boqs endpoint
    else if (userRole === 'technical director' ||
             userRole === 'technical_director' ||
             userRole === 'technicaldirector') {
      endpoint = `/td_boqs?page=1&per_page=100`;
    }

    console.log('Fetching BOQs from:', endpoint, 'for role:', userRole);

    const response = await apiClient.get(
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
    const response = await apiClient.get(
      `/boq/${boq_id}`,
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
    const response = await apiClient.get(
      `/planned-vs-actual/${boq_id}`,
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
    const response = await apiClient.post(
      `/purchase/add`,
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
    const response = await apiClient.get(
      `/purchase/material-tracking/${boq_id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Get BOQ items with purchase tracking info
   * Uses existing API: /api/purchase/boq-items/<boq_id>
   */
  async getBOQItemsForPurchase(boq_id: number) {
    const response = await apiClient.get(
      `/purchase/boq-items/${boq_id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  /**
   * Send new purchase request (routes intelligently based on material type)
   * - Existing BOQ materials → Sent to Buyer directly
   * - New materials → Sent to Estimator for pricing
   * Uses API: /api/new_purchase/estimator/<boq_id>
   */
  async sendPurchaseRequest(boq_id: number) {
    const response = await apiClient.post(
      `/new_purchase/estimator/${boq_id}`,
      {},
      { headers: this.getHeaders() }
    );
    return response.data;
  }
}

export const boqTrackingService = new BOQTrackingService();
