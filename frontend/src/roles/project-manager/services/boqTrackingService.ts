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
   * Get all BOQs - Role-based Production Management
   *
   * PM: /api/pm_production_management
   *   - Regular PM: Shows only BOQs assigned to that PM
   *   - Admin: Shows ALL BOQs
   *
   * MEP: /api/mep_approve_boq
   *   - Shows only BOQs for projects assigned to that MEP
   *
   * TD: /api/td_production_management
   *   - Shows ALL project BOQs (regardless of TD user)
   *
   * Admin viewing as another role will use that role's endpoint
   */
  async getAllBOQs() {
    // Get user role from localStorage to determine which endpoint to use
    const userStr = localStorage.getItem('auth-storage');
    const adminViewStr = localStorage.getItem('admin-view-storage');
    let userRole = '';
    let viewingAsRole = '';

    if (userStr) {
      try {
        const authData = JSON.parse(userStr);
        userRole = (authData?.state?.user?.role || '').toLowerCase();
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }

    // Check if admin is viewing as another role
    if (adminViewStr) {
      try {
        const adminViewData = JSON.parse(adminViewStr);
        viewingAsRole = (adminViewData?.state?.viewingAsRole || '').toLowerCase();
      } catch (e) {
        console.error('Error parsing admin view data:', e);
      }
    }

    // Use viewingAsRole if admin is impersonating, otherwise use actual role
    const effectiveRole = viewingAsRole || userRole;

    // Determine endpoint based on effective role
    let endpoint = `/pm_production_management`; // Default to PM production endpoint

    // Technical Director uses NEW td_production_management endpoint (shows ALL BOQs)
    if (effectiveRole === 'technical director' ||
        effectiveRole === 'technical_director' ||
        effectiveRole === 'technicaldirector' ||
        effectiveRole === 'td') {
      endpoint = `/td_production_management`;
    }
    // MEP uses mep_approve_boq endpoint (shows only MEP's assigned BOQs)
    else if (effectiveRole === 'mep' ||
             effectiveRole === 'mep manager' ||
             effectiveRole === 'mep_manager' ||
             effectiveRole === 'mepmanager') {
      endpoint = `/mep_approve_boq`;
    }
    // Project Manager uses NEW pm_production_management endpoint (shows ALL BOQs)
    else if (effectiveRole === 'projectmanager' ||
             effectiveRole === 'project_manager' ||
             effectiveRole === 'project manager' ||
             effectiveRole === 'pm') {
      endpoint = `/pm_production_management`;
    }
    // Admin (without viewing as) uses pm_production_management by default
    else if (effectiveRole === 'admin') {
      endpoint = `/pm_production_management`;
    }

    console.log('Fetching BOQs from:', endpoint, 'for effective role:', effectiveRole, '(actual role:', userRole, ')');

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
