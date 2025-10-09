/**
 * Technical Director Service
 * Handles all API interactions for Technical Director role
 */

import { apiClient } from '@/api/config';

interface TDBOQItem {
  boq_id: number;
  boq_name: string;
  project_id: number;
  project_name: string | null;
  client: string | null;
  location: string | null;
  status: string;
  items_count: number;
  material_count: number;
  labour_count: number;
  total_cost: number;
  selling_price: number;
  estimatedSellingPrice: number;
  total_material_cost?: number;
  total_labour_cost?: number;
  created_at: string;
  created_by: string;
  email_sent: boolean;
  history: any[];
}

interface TDBOQsResponse {
  message: string;
  count: number;
  data: TDBOQItem[];
}

class TechnicalDirectorService {
  /**
   * Get BOQs sent for Technical Director review
   * These are BOQs with email_sent = true and status pending
   */
  async getTDBOQs(page: number = 1, perPage: number = 10): Promise<{
    success: boolean;
    data?: TDBOQItem[];
    count?: number;
    message?: string;
  }> {
    try {
      const response = await apiClient.get<TDBOQsResponse>('/td_boqs', {
        params: {
          page,
          per_page: perPage
        }
      });

      if (response.data && response.data.data) {
        return {
          success: true,
          data: response.data.data,
          count: response.data.count
        };
      }

      return {
        success: true,
        data: [],
        count: 0
      };
    } catch (error: any) {
      console.error('Error fetching TD BOQs:', error.response?.data || error.message);

      if (error.response?.status === 403) {
        return {
          success: false,
          message: 'You do not have permission to access this resource'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch BOQs for review'
      };
    }
  }

  /**
   * Approve a BOQ
   */
  async approveBOQ(boqId: number, comments?: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await apiClient.put(`/update_boq/${boqId}`, {
        status: 'Approved',
        notes: comments
      });

      return {
        success: true,
        message: response.data.message || 'BOQ approved successfully'
      };
    } catch (error: any) {
      console.error('Error approving BOQ:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 403) {
        return {
          success: false,
          message: 'You do not have permission to approve this BOQ'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to approve BOQ'
      };
    }
  }

  /**
   * Reject a BOQ
   */
  async rejectBOQ(boqId: number, reason: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      if (!reason || !reason.trim()) {
        return {
          success: false,
          message: 'Rejection reason is required'
        };
      }

      const response = await apiClient.put(`/update_boq/${boqId}`, {
        status: 'Rejected',
        notes: reason
      });

      return {
        success: true,
        message: response.data.message || 'BOQ rejected successfully'
      };
    } catch (error: any) {
      console.error('Error rejecting BOQ:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 403) {
        return {
          success: false,
          message: 'You do not have permission to reject this BOQ'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to reject BOQ'
      };
    }
  }

  /**
   * Request changes to a BOQ
   */
  async requestChanges(boqId: number, changes: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      if (!changes || !changes.trim()) {
        return {
          success: false,
          message: 'Please specify the required changes'
        };
      }

      const response = await apiClient.put(`/update_boq/${boqId}`, {
        status: 'In_Review',
        notes: changes
      });

      return {
        success: true,
        message: response.data.message || 'Change request sent successfully'
      };
    } catch (error: any) {
      console.error('Error requesting changes:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 403) {
        return {
          success: false,
          message: 'You do not have permission to request changes'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to request changes'
      };
    }
  }

  /**
   * Get BOQ details by ID
   */
  async getBOQDetails(boqId: number): Promise<{
    success: boolean;
    data?: any;
    message?: string;
  }> {
    try {
      const response = await apiClient.get(`/boq/${boqId}`);

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error('Error fetching BOQ details:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 403) {
        return {
          success: false,
          message: 'You do not have permission to view this BOQ'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch BOQ details'
      };
    }
  }

  /**
   * Get BOQ history
   */
  async getBOQHistory(boqId: number): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
  }> {
    try {
      const response = await apiClient.get(`/boq_history/${boqId}`);

      if (response.data && response.data.boq_history) {
        return {
          success: true,
          data: response.data.boq_history
        };
      }

      return {
        success: true,
        data: []
      };
    } catch (error: any) {
      console.error('Error fetching BOQ history:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch BOQ history'
      };
    }
  }

  /**
   * Get BOQ details history (for revision history)
   */
  async getBOQDetailsHistory(boqId: number): Promise<{
    success: boolean;
    data?: any;
    message?: string;
  }> {
    try {
      const response = await apiClient.get(`/boq_details_history/${boqId}`);

      if (response.data) {
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: true,
        data: { history: [], current_version: null }
      };
    } catch (error: any) {
      console.error('Error fetching BOQ details history:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      }

      return {
        success: false,
        data: { history: [], current_version: null },
        message: error.response?.data?.error || 'Failed to fetch BOQ details history'
      };
    }
  }
}

export const technicalDirectorService = new TechnicalDirectorService();
export type { TDBOQItem, TDBOQsResponse };
