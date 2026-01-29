import { apiClient } from '@/api/config';

// Using apiClient for proper auth and cache handling

export interface ChangeRequestItem {
  cr_id: number;
  boq_id: number;
  project_id: number;
  project_name?: string;
  project_code?: string;
  project_location?: string;
  project_client?: string;
  area?: string;
  boq_name?: string;
  boq_status?: string;
  pm_assigned?: boolean; // Whether PM is assigned to this project
  item_id?: string | null;
  item_name?: string | null;
  requested_by_user_id: number;
  requested_by_name: string;
  requested_by_role: string;
  request_type: string;
  justification: string;
  reason?: string; // Alias for justification (backward compatibility)
  status: 'pending' | 'under_review' | 'approved_by_pm' | 'approved_by_td' | 'approved' | 'rejected' | 'assigned_to_buyer' | 'purchase_completed';
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
  negotiable_margin_analysis?: {
    original_allocated: number;
    discount_applied: number;
    already_consumed: number;
    this_request: number;
    remaining_after: number;
    consumption_percentage: number;
    exceeds_60_percent: boolean;
    is_over_budget: boolean;
  };
  // Deprecated - kept for backward compatibility
  overhead_analysis?: {
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
  budget_impact?: {
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

  // Additional fields from API
  sub_items_data?: Array<{
    is_new: boolean;
    name?: string;
    sub_item_name?: string;
    quantity?: number;
    qty?: number;
    unit?: string;
    unit_price?: number;
    total_price?: number;
    reason?: string | null;
    new_reason?: string | null;
    sub_item_id?: string;
  }> | null;

  has_new_sub_items?: boolean;
  new_sub_item_reason?: string | null;
  item_overhead?: {
    allocated: number;
    available: number;
    consumed_before: number;
  };
  percentage_of_item_overhead?: number;

  // Recommended routing (calculated by backend)
  recommended_next_approver?: 'technical_director' | 'estimator';
  routing_percentage?: number;

  // Vendor Selection Fields
  selected_vendor_id?: number | null;
  selected_vendor_name?: string | null;
  vendor_selected_by_buyer_id?: number | null;
  vendor_selected_by_buyer_name?: string | null;
  vendor_selection_date?: string | null;
  vendor_selection_status?: 'pending_td_approval' | 'approved' | 'rejected' | null;
  vendor_approved_by_td_id?: number | null;
  vendor_approved_by_td_name?: string | null;
  vendor_approval_date?: string | null;
  vendor_rejection_reason?: string | null;

  // Vendor Detail Fields (for displaying full vendor information in modals)
  vendor_email?: string | null;
  vendor_phone?: string | null;
  vendor_phone_code?: string | null;
  vendor_contact_person?: string | null;
  vendor_category?: string | null;
  vendor_street_address?: string | null;
  vendor_city?: string | null;
  vendor_state?: string | null;
  vendor_country?: string | null;
  vendor_pin_code?: string | null;
  vendor_gst_number?: string | null;
  vendor_details?: any;  // Vendor details object from API

  // Per-Material Vendor Selection (with vendor prices)
  material_vendor_selections?: Record<string, {
    vendor_id?: number;
    vendor_name?: string;
    negotiated_price?: number;
    status?: string;
  }>;

  // Buyer Assignment
  assigned_to_buyer_user_id?: number | null;
  assigned_to_buyer_name?: string | null;
  assigned_to_buyer_date?: string | null;

  // PO Child Support (for separate vendor submissions)
  submission_group_id?: string | null;
  formatted_cr_id?: string;  // "CR-100"

  // POChildren data (for split purchases)
  has_po_children?: boolean;
  po_children_count?: number;
  po_children?: Array<{
    id: number;
    formatted_id: string;
    suffix: string;
    vendor_id: number | null;
    vendor_name: string | null;
    status: 'pending_td_approval' | 'vendor_approved' | 'purchase_completed' | 'rejected';
    vendor_selection_status: 'pending_td_approval' | 'approved' | 'rejected';
    materials_count: number;
    materials_total_cost: number;
    vendor_email_sent: boolean;
    purchase_completion_date: string | null;
  }>;
}

export interface CreateChangeRequestData {
  boq_id: number;
  item_id?: string;
  item_name?: string;
  justification: string;
  materials: Array<{
    material_name: string;
    sub_item_id?: string;
    sub_item_name?: string;
    quantity: number;
    unit: string;
    unit_price: number;
    related_item?: string;
    master_material_id?: number;
  }>;
}

class ChangeRequestService {
  // Note: apiClient already handles auth headers and admin viewing context


  /**
   * Create a new change request to add extra materials
   * POST /api/boq/change-request
   */
  async createChangeRequest(data: CreateChangeRequestData): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const response = await apiClient.post('/boq/change-request', data);

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
  // ✅ PERFORMANCE: Added pagination parameters and status filter
  async getChangeRequests(page?: number, pageSize: number = 50, status?: string): Promise<{
    success: boolean;
    data: ChangeRequestItem[];
    message?: string;
    count?: number;
    pagination?: {
      page: number;
      page_size: number;
      total_count: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
    status_counts?: {
      pending: number;
      approved: number;
      completed: number;
      rejected: number;
      total: number;
    };
  }> {
    try {
      const params: any = {};
      if (page !== undefined) {
        params.page = page;
        params.page_size = pageSize;
      }
      if (status) {
        params.status = status;
      }

      const response = await apiClient.get('/change-requests', { params });

      if (response.data.success) {
        return {
          success: true,
          data: response.data.data || [],
          count: response.data.count || 0,
          pagination: response.data.pagination,
          status_counts: response.data.status_counts
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
      const response = await apiClient.get(`/change-request/${crId}`);

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
   * Get all buyers (for Estimator/TD to select when approving)
   * GET /api/buyers
   */
  async getAllBuyers(): Promise<{ success: boolean; buyers: Array<{user_id: number, full_name: string, email: string, username: string}>; message?: string }> {
    try {
      const response = await apiClient.get('/buyers');

      return {
        success: response.data.success,
        buyers: response.data.buyers || []
      };
    } catch (error: any) {
      console.error('Error fetching buyers:', error);
      return {
        success: false,
        buyers: [],
        message: error.response?.data?.error || 'Failed to fetch buyers'
      };
    }
  }

  /**
   * Approve change request
   * POST /api/change-request/{cr_id}/approve
   * @param buyerId - Optional: Estimator/TD can specify which buyer to assign
   * @param updatedMaterials - Optional: Estimator can provide updated materials with pricing
   */
  async approve(crId: number, comments?: string, buyerId?: number, updatedMaterials?: any[]): Promise<{ success: boolean; message: string }> {
    try {
      const payload: any = { comments: comments || 'Approved' };
      if (buyerId) {
        payload.buyer_id = buyerId;
      }
      if (updatedMaterials && updatedMaterials.length > 0) {
        payload.materials_data = updatedMaterials;
      }

      const response = await apiClient.post(`/change-request/${crId}/approve`, payload);

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
      const response = await apiClient.post(`/change-request/${crId}/reject`, { rejection_reason });

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
      const response = await apiClient.get(`/boq/${boqId}/change-requests`);

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
      const response = await apiClient.get(`/change-request/${crId}`);

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
   * @param routeTo - For PM: 'technical_director', 'estimator', or 'buyer' (optional - will auto-route if not provided)
   * @param buyerId - Optional: Specific buyer ID to assign when routing to buyer
   */
  async sendForReview(crId: number, routeTo?: 'technical_director' | 'estimator' | 'buyer', buyerId?: number): Promise<{ success: boolean; message?: string; next_approver?: string }> {
    try {
      const payload: any = {};
      if (routeTo) {
        payload.route_to = routeTo;
      }
      if (buyerId) {
        payload.buyer_id = buyerId;
      }

      const response = await apiClient.post(`/change-request/${crId}/send-for-review`, payload);

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

  /**
   * Update change request
   * PUT /api/change-request/{cr_id}
   */
  async updateChangeRequest(crId: number, data: {
    justification: string;
    materials: Array<{
      material_name: string;
      quantity: number;
      unit: string;
      unit_price: number;
      master_material_id?: number;
      sub_item_id?: string;
      sub_item_name?: string;
      justification?: string;
      reason?: string;
    }>;
  }): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const response = await apiClient.put(`/change-request/${crId}`, data);

      return {
        success: true,
        message: response.data.message || 'Change request updated successfully',
        data: response.data
      };
    } catch (error: any) {
      console.error('Error updating change request:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update change request'
      };
    }
  }

  /**
   * Get all buyers
   * GET /api/buyers
   */
  async getBuyers(): Promise<{ success: boolean; message?: string; data?: Array<{ user_id: number; full_name: string; username: string }> }> {
    try {
      const response = await apiClient.get('/buyers');

      return {
        success: true,
        data: response.data.buyers || []
      };
    } catch (error: any) {
      console.error('Error fetching buyers:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch buyers'
      };
    }
  }

  // REMOVED: updateChangeRequestStatus - DEPRECATED
  // Use sendForReview() method instead
  // The backend endpoint /api/change-request/{cr_id}/status has been removed
}

export const changeRequestService = new ChangeRequestService();
