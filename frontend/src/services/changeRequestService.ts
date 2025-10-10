import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface ChangeRequestItem {
  cr_id: number;
  boq_id: number;
  project_id: number;
  project_name?: string;
  boq_name?: string;
  requested_by_user_id: number;
  requested_by_name: string;
  requested_by_role: string;
  request_type: string;
  justification: string;
  status: 'pending' | 'under_review' | 'approved_by_pm' | 'approved_by_td' | 'approved' | 'rejected';
  current_approver_role?: string | null;
  materials_data: Array<{
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
    related_item?: string;
    master_material_id?: number;
  }>;
  materials_total_cost: number;
  overhead_analysis: {
    original_allocated: number;
    overhead_percentage: number;
    consumed_before_request: number;
    available_before_request: number;
    consumed_by_this_request: number;
    remaining_after_approval: number;
    is_within_budget: boolean;
    balance_type: 'positive' | 'negative';
    balance_amount: number;
  };
  budget_impact: {
    original_total: number;
    new_total_if_approved: number;
    increase_amount: number;
    increase_percentage: number;
  };
  approval_required_from?: 'project_manager' | 'estimator' | 'technical_director' | null;

  // PM Approval
  pm_approved_by_user_id?: number;
  pm_approved_by_name?: string;
  pm_approval_date?: string;

  // TD Approval
  td_approved_by_user_id?: number;
  td_approved_by_name?: string;
  td_approval_date?: string;

  // Final Approval (Estimator)
  approved_by_user_id?: number;
  approved_by_name?: string;
  approval_date?: string;

  // Rejection
  rejection_reason?: string;
  rejected_by_user_id?: number;
  rejected_by_name?: string;
  rejected_at_stage?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateChangeRequestData {
  boq_id: number;
  justification: string;
  materials: Array<{
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    related_item?: string;
    master_material_id?: number;
  }>;
}

class ChangeRequestService {
  private getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
  }

  /**
   * Create a new change request to add extra materials
   * POST /api/boq/change-request
   */
  async createChangeRequest(data: CreateChangeRequestData): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/boq/change-request`,
        data,
        this.getAuthHeaders()
      );

      return {
        success: true,
        data: response.data,
        message: response.data.message || 'Change request created successfully'
      };
    } catch (error: any) {
      console.error('Error creating change request:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create change request'
      };
    }
  }

  /**
   * Get all change requests (role-filtered by backend)
   * GET /api/change-requests
   */
  async getChangeRequests(): Promise<{ success: boolean; data: ChangeRequestItem[]; message?: string; count?: number }> {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/change-requests`,
        this.getAuthHeaders()
      );

      if (response.data.success) {
        return {
          success: true,
          data: response.data.data || [],
          count: response.data.count || 0
        };
      }

      return {
        success: false,
        data: [],
        message: 'Failed to fetch change requests'
      };
    } catch (error: any) {
      console.error('Error fetching change requests:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch change requests'
      };
    }
  }

  /**
   * Get detailed change request by ID
   * GET /api/change-request/{cr_id}
   */
  async getChangeRequestDetail(crId: number): Promise<{ success: boolean; data?: ChangeRequestItem; message?: string }> {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/change-request/${crId}`,
        this.getAuthHeaders()
      );

      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }

      return {
        success: false,
        message: 'Failed to fetch change request detail'
      };
    } catch (error: any) {
      console.error('Error fetching change request detail:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch change request detail'
      };
    }
  }

  /**
   * Approve change request
   * POST /api/change-request/{cr_id}/approve
   */
  async approve(crId: number, comments?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/change-request/${crId}/approve`,
        { comments: comments || 'Approved' },
        this.getAuthHeaders()
      );

      return {
        success: response.data.success,
        message: response.data.message || 'Change request approved successfully'
      };
    } catch (error: any) {
      console.error('Error approving change request:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to approve change request'
      };
    }
  }

  /**
   * Reject change request
   * POST /api/change-request/{cr_id}/reject
   */
  async reject(crId: number, rejection_reason: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/change-request/${crId}/reject`,
        { rejection_reason },
        this.getAuthHeaders()
      );

      return {
        success: response.data.success,
        message: response.data.message || 'Change request rejected'
      };
    } catch (error: any) {
      console.error('Error rejecting change request:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to reject change request'
      };
    }
  }

  /**
   * Get all change requests for a specific BOQ
   * GET /api/boq/{boq_id}/change-requests
   */
  async getBOQChangeRequests(boqId: number): Promise<{ success: boolean; data: ChangeRequestItem[]; count?: number; message?: string }> {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/boq/${boqId}/change-requests`,
        this.getAuthHeaders()
      );

      if (response.data.success) {
        return {
          success: true,
          data: response.data.data || [],
          count: response.data.count || 0
        };
      }

      return {
        success: false,
        data: [],
        message: 'Failed to fetch change requests for BOQ'
      };
    } catch (error: any) {
      console.error('Error fetching BOQ change requests:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch change requests'
      };
    }
  }

  /**
   * Get a single change request by ID
   * GET /api/change-requests/{cr_id}
   */
  async getChangeRequestById(crId: number): Promise<{ success: boolean; data?: ChangeRequestItem; message?: string }> {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/change-request/${crId}`,
        this.getAuthHeaders()
      );

      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }

      return {
        success: false,
        message: 'Failed to fetch change request'
      };
    } catch (error: any) {
      console.error('Error fetching change request:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch change request'
      };
    }
  }

  /**
   * Send change request for review
   * POST /api/change-request/{cr_id}/send-for-review
   */
  async sendForReview(crId: number): Promise<{ success: boolean; message?: string; next_approver?: string }> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/change-request/${crId}/send-for-review`,
        {},
        this.getAuthHeaders()
      );

      return {
        success: response.data.success,
        message: response.data.message || 'Sent for review successfully',
        next_approver: response.data.next_approver
      };
    } catch (error: any) {
      console.error('Error sending for review:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send for review'
      };
    }
  }

  // REMOVED: updateChangeRequestStatus - DEPRECATED
  // Use sendForReview() method instead
  // The backend endpoint /api/change-request/{cr_id}/status has been removed
}

export const changeRequestService = new ChangeRequestService();
