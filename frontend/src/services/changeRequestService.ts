import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export interface ChangeRequestItem {
  cr_id: number;
  boq_id: number;
  project_id: number;
  project_name: string;
  requested_by: number;
  requested_by_name: string;
  request_date: string;
  status: 'pending' | 'approved_estimator' | 'approved_td' | 'rejected';
  additional_cost: number;
  cost_increase_percentage: number;
  new_items_count: number;
  approval_type: 'estimator' | 'td';
  original_total: number;
  new_total: number;
  requires_client_approval: boolean;
}

export interface ChangeRequestDetail extends ChangeRequestItem {
  existing_items: any[];
  new_items: any[];
  existing_summary: any;
  new_summary: any;
  combined_summary: any;
  notes?: string;
  client_notified?: boolean;
  approved_by?: number;
  approved_by_name?: string;
  approved_date?: string;
  rejection_reason?: string;
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
   * Get all change requests (BOQs with new_purchase items)
   * Returns only BOQs that have new_purchase items added
   */
  async getChangeRequests(role?: 'estimator' | 'td'): Promise<{ success: boolean; data: ChangeRequestItem[]; message?: string }> {
    try {
      // Fetch all BOQs
      const response = await axios.get(`${API_BASE_URL}/all_boq`, this.getAuthHeaders());


      // Handle response - could be array directly or wrapped in {success, data}
      let boqs = [];
      if (Array.isArray(response.data)) {
        boqs = response.data;
      } else if (response.data.success && response.data.data) {
        boqs = response.data.data;
      } else if (response.data.data) {
        boqs = response.data.data;
      }


      // Filter BOQs that have new_purchase items
      const changeRequests: ChangeRequestItem[] = [];

        for (const boq of boqs) {

          // Only show BOQs with new_purchase_request status (PM has sent request to Estimator)
          if (boq.status !== 'new_purchase_request') {
            continue;
          }

          // Fetch detailed BOQ data to check for new_purchase
          try {
            const detailResponse = await axios.get(
              `${API_BASE_URL}/boq/${boq.boq_id}`,
              this.getAuthHeaders()
            );


            // Check different response structures
            let boqDetail = null;
            if (detailResponse.data.success && detailResponse.data.data) {
              boqDetail = detailResponse.data.data;
            } else if (detailResponse.data && !detailResponse.data.success) {
              boqDetail = detailResponse.data;
            }

            if (boqDetail && boqDetail.new_purchase) {
              const newPurchase = boqDetail.new_purchase;

              // Check if user can view new_purchase items
              if (!newPurchase.access_info?.can_view) {
                continue;
              }

              // Check if there are actual new items
              if (!newPurchase.items || newPurchase.items.length === 0) {
                continue;
              }

              const existingPurchase = boqDetail.existing_purchase || {};

              // Calculate totals
              const originalTotal = existingPurchase.summary?.selling_price || 0;
              const newItemsTotal = newPurchase.summary?.selling_price || 0;
              const newTotal = boqDetail.combined_summary?.selling_price || (originalTotal + newItemsTotal);
              const additionalCost = newItemsTotal; // Additional cost is just the new items cost
              const costIncreasePercentage = originalTotal > 0 ? (additionalCost / originalTotal) * 100 : 0;

              // Determine approval type based on cost
              const approvalType = additionalCost > 50000 ? 'td' : 'estimator';

              // Determine status based on BOQ status
              let status: 'pending' | 'approved_estimator' | 'approved_td' | 'rejected' = 'pending';
              if (boq.status === 'approved') {
                status = approvalType === 'td' ? 'approved_td' : 'approved_estimator';
              } else if (boq.status === 'rejected') {
                status = 'rejected';
              }

              // Filter by role if specified
              if (role === 'estimator' && approvalType === 'td' && status === 'pending') {
                // Estimator shouldn't see high-value pending requests (they go to TD)
                continue;
              }

              changeRequests.push({
                cr_id: boq.boq_id, // Using boq_id as cr_id for now
                boq_id: boq.boq_id,
                project_id: boq.project?.project_id || 0,
                project_name: boq.project?.project_name || boq.boq_name,
                requested_by: boq.created_by || 0,
                requested_by_name: 'Project Manager', // TODO: Get from user table
                request_date: boq.created_at || new Date().toISOString(),
                status,
                additional_cost: additionalCost,
                cost_increase_percentage: costIncreasePercentage,
                new_items_count: newPurchase.items?.length || 0,
                approval_type: approvalType,
                original_total: originalTotal,
                new_total: newTotal,
                requires_client_approval: costIncreasePercentage > 15 // Flag if increase > 15%
              });
            }
          } catch (error) {
            console.error(`Error fetching BOQ ${boq.boq_id}:`, error);
            continue;
          }
        }


        return {
          success: true,
          data: changeRequests
        };
    } catch (error: any) {
      console.error('Error fetching change requests:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.message || 'Failed to fetch change requests'
      };
    }
  }

  /**
   * Get detailed change request including existing and new items
   */
  async getChangeRequestDetail(boqId: number): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/boq/${boqId}`,
        this.getAuthHeaders()
      );

      console.log('Raw BOQ Detail Response:', response.data);

      // Handle different response structures
      let boqDetail = null;

      // Check if response is wrapped in {success, data}
      if (response.data.success && response.data.data) {
        boqDetail = response.data.data;
      }
      // Check if data is directly in response.data
      else if (response.data && response.data.boq_id) {
        boqDetail = response.data;
      }
      // Check if it's just the data without wrapper
      else if (response.data && !response.data.success) {
        boqDetail = response.data;
      }

      console.log('Extracted BOQ Detail:', boqDetail);

      // Check if BOQ has new_purchase items
      if (boqDetail && boqDetail.new_purchase) {
        const newPurchase = boqDetail.new_purchase;
        const existingPurchase = boqDetail.existing_purchase || {};

        const originalTotal = existingPurchase.summary?.selling_price || existingPurchase.summary?.total_cost || 0;
        const newItemsTotal = newPurchase.summary?.selling_price || newPurchase.summary?.total_cost || 0;
        const combinedTotal = boqDetail.combined_summary?.selling_price || boqDetail.combined_summary?.total_cost || 0;
        const newTotal = combinedTotal || (originalTotal + newItemsTotal);
        const additionalCost = newItemsTotal;
        const costIncreasePercentage = originalTotal > 0 ? (additionalCost / originalTotal) * 100 : 0;
        const approvalType = costIncreasePercentage > 15 ? 'td' : 'estimator';

        // Return the BOQ data directly - the page will transform it
        return {
          success: true,
          data: boqDetail
        };
      }

      return {
        success: false,
        message: 'No change request found for this BOQ'
      };
    } catch (error: any) {
      console.error('Error fetching change request detail:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch change request detail'
      };
    }
  }

  /**
   * Approve change request (Estimator)
   */
  async approveByEstimator(boqId: number, notes?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Update BOQ status to approved
      const response = await axios.put(
        `${API_BASE_URL}/boq/${boqId}`,
        {
          status: 'approved',
          notes: notes || 'Approved by Estimator'
        },
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
        message: error.response?.data?.message || 'Failed to approve change request'
      };
    }
  }

  /**
   * Approve change request (Technical Director)
   */
  async approveByTD(boqId: number, notes?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/boq/${boqId}`,
        {
          status: 'approved',
          notes: notes || 'Approved by Technical Director'
        },
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
        message: error.response?.data?.message || 'Failed to approve change request'
      };
    }
  }

  /**
   * Reject change request
   */
  async reject(boqId: number, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/boq/${boqId}`,
        {
          status: 'rejected',
          rejection_reason: reason
        },
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
        message: error.response?.data?.message || 'Failed to reject change request'
      };
    }
  }
}

export const changeRequestService = new ChangeRequestService();
