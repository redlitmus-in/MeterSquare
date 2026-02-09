/**
 * Estimator Service
 * Handles all API interactions for BOQ management
 */

import { apiClient, deduplicatedGet } from '@/api/config';
import {
  BOQ,
  BOQFilter,
  BOQDashboardMetrics,
  BOQStatus,
  BOQUploadResponse,
  BOQCreatePayload,
  BOQCreateResponse,
  BOQGetResponse,
  BOQListResponse,
  BOQItemDetailed
} from '../types';

class EstimatorService {
  // BOQ CRUD Operations

  // REMOVED: getAllBOQs() - Use specific status endpoints instead (getPendingBOQs, getApprovedBOQs, etc.)
  // async getAllBOQs(filter?: BOQFilter): Promise<{ success: boolean; data: any[]; count: number }> {
  //   try {
  //     const response = await apiClient.get<BOQListResponse>('/all_boq', { params: filter });
  //
  //     if (response.data && response.data.data) {
  //       return {
  //         success: true,
  //         data: response.data.data,
  //         count: response.data.count
  //       };
  //     }
  //
  //     return {
  //       success: true,
  //       data: [],
  //       count: 0
  //     };
  //   } catch (error: any) {
  //     console.error('Error fetching BOQs:', error.response?.data || error.message);
  //     return {
  //       success: false,
  //       data: [],
  //       count: 0
  //     };
  //   }
  // }

  // Get BOQs by status - specific API endpoints
  async getPendingBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/pending_boq');
      return {
        success: true,
        data: response.data?.data || response.data || [],
        count: response.data?.count || 0
      };
    } catch (error: any) {
      console.error('Error fetching pending BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  async getApprovedBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/approved_boq');
      return {
        success: true,
        data: response.data?.data || response.data || [],
        count: response.data?.count || 0
      };
    } catch (error: any) {
      console.error('Error fetching approved BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  async getRejectedBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/rejected_boq');
      return {
        success: true,
        data: response.data?.data || response.data || [],
        count: response.data?.count || 0
      };
    } catch (error: any) {
      console.error('Error fetching rejected BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  async getCompletedBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/completed_boq');
      return {
        success: true,
        data: response.data?.data || response.data || [],
        count: response.data?.count || 0
      };
    } catch (error: any) {
      console.error('Error fetching completed BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  async getCancelledBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/cancelled_boq');
      return {
        success: true,
        data: response.data?.data || response.data || [],
        count: response.data?.count || 0
      };
    } catch (error: any) {
      console.error('Error fetching cancelled BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  async getSentBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/all_send_boq');
      return {
        success: true,
        data: response.data?.data || response.data || [],
        count: response.data?.count || 0
      };
    } catch (error: any) {
      console.error('Error fetching sent BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  // Get BOQs sent to client (Client Pending) - same as getSentBOQs but with clearer naming
  async getClientPendingBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    return this.getSentBOQs();
  }

  // Get BOQs rejected by client
  async getClientRejectedBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/rejected_boq');
      // Filter only client-rejected BOQs (status: Client_Rejected or client_rejected)
      const clientRejected = (response.data?.data || response.data || []).filter((boq: any) =>
        boq.status === 'Client_Rejected' || boq.status === 'client_rejected'
      );
      return {
        success: true,
        data: clientRejected,
        count: clientRejected.length
      };
    } catch (error: any) {
      console.error('Error fetching client rejected BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  async getRevisionsBOQs(): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await deduplicatedGet('/revisions_boq');
      return {
        success: true,
        data: response.data?.data || response.data || [],
        count: response.data?.count || 0
      };
    } catch (error: any) {
      console.error('Error fetching revision BOQs:', error.response?.data || error.message);
      return { success: false, data: [], count: 0 };
    }
  }

  // Lightweight API to get only tab counts (single SQL query - much faster)
  async getTabCounts(): Promise<{
    success: boolean;
    counts: {
      pending: number;
      sent: number;
      approved: number;
      rejected: number;
      completed: number;
      cancelled: number;
      revisions: number;
    };
  }> {
    try {
      const response = await deduplicatedGet('/estimator_tab_counts');
      return {
        success: true,
        counts: response.data?.counts || {
          pending: 0,
          sent: 0,
          approved: 0,
          rejected: 0,
          completed: 0,
          cancelled: 0,
          revisions: 0
        }
      };
    } catch (error: any) {
      console.error('Error fetching tab counts:', error.response?.data || error.message);
      return {
        success: false,
        counts: {
          pending: 0,
          sent: 0,
          approved: 0,
          rejected: 0,
          completed: 0,
          cancelled: 0,
          revisions: 0
        }
      };
    }
  }

  async getBOQById(boqId: number): Promise<{ success: boolean; data?: BOQGetResponse; message?: string }> {
    try {
      const response = await apiClient.get<BOQGetResponse>(`/boq/${boqId}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error('BOQ fetch error:', error.response?.data || error.message);

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

  async createBOQ(payload: BOQCreatePayload): Promise<{ success: boolean; boq_id?: number; message: string; data?: any }> {
    try {
      // Validate required fields
      if (!payload.project_id) {
        return {
          success: false,
          message: 'Project ID is required'
        };
      }

      if (!payload.boq_name || !payload.boq_name.trim()) {
        return {
          success: false,
          message: 'BOQ name is required'
        };
      }

      if (!payload.items || payload.items.length === 0) {
        return {
          success: false,
          message: 'At least one BOQ item is required'
        };
      }

      // Calculate total_price and total_cost before sending
      const processedPayload = {
        ...payload,
        items: payload.items.map((item) => ({
          ...item,
          materials: item.materials.map((mat) => ({
            ...mat,
            total_price: mat.quantity * mat.unit_price
          })),
          labour: item.labour.map((lab) => ({
            ...lab,
            total_cost: lab.hours * lab.rate_per_hour
          }))
        }))
      };

      const response = await apiClient.post<BOQCreateResponse>('/create_boq', processedPayload);

      return {
        success: true,
        boq_id: response.data.boq?.boq_id,
        message: response.data.message || 'BOQ created successfully',
        data: response.data // Return full response data including items with sub_item_ids
      };
    } catch (error: any) {

      if (error.response?.status === 400) {
        return {
          success: false,
          message: error.response?.data?.error || 'Invalid BOQ data provided'
        };
      } else if (error.response?.status === 404) {
        return {
          success: false,
          message: error.response?.data?.error || 'Project not found'
        };
      } else if (error.response?.status === 500) {
        return {
          success: false,
          message: 'Server error occurred while creating BOQ. Please try again.'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create BOQ'
      };
    }
  }

  async updateBOQ(boqId: number, updateData: any): Promise<{ success: boolean; message: string }> {
    try {
      // Validate required fields
      if (!updateData.boq_name || !updateData.boq_name.trim()) {
        return {
          success: false,
          message: 'BOQ name is required'
        };
      }

      if (!updateData.items || updateData.items.length === 0) {
        return {
          success: false,
          message: 'At least one BOQ item is required'
        };
      }

      // Process items to ensure sub_items have proper materials and labour with calculated totals
      const processedData = {
        ...updateData,
        items: updateData.items.map((item: any) => {
          // Process sub_items if they exist
          const processedSubItems = item.sub_items?.map((subItem: any) => ({
            ...subItem,
            materials: subItem.materials?.map((mat: any) => ({
              ...mat,
              total_price: mat.total_price || (mat.quantity * mat.unit_price)
            })) || [],
            labour: subItem.labour?.map((lab: any) => ({
              ...lab,
              total_cost: lab.total_cost || (lab.hours * lab.rate_per_hour)
            })) || []
          })) || [];

          // Process item-level materials and labour (for items without sub_items)
          const processedMaterials = item.materials?.map((mat: any) => ({
            ...mat,
            total_price: mat.total_price || (mat.quantity * mat.unit_price)
          })) || [];

          const processedLabour = item.labour?.map((lab: any) => ({
            ...lab,
            total_cost: lab.total_cost || (lab.hours * lab.rate_per_hour)
          })) || [];

          return {
            ...item,
            sub_items: processedSubItems,
            materials: processedMaterials,
            labour: processedLabour
          };
        })
      };

      const response = await apiClient.put(`/boq/update_boq/${boqId}`, processedData);

      return {
        success: true,
        message: response.data.message || 'BOQ updated successfully'
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 400) {
        return {
          success: false,
          message: error.response?.data?.error || 'Invalid BOQ data provided'
        };
      } else if (error.response?.status === 500) {
        return {
          success: false,
          message: 'Server error occurred while updating BOQ. Please try again.'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update BOQ'
      };
    }
  }

  async revisionBOQ(boqId: number, updateData: any): Promise<{ success: boolean; message: string }> {
    try {
      // Validate required fields
      if (!updateData.boq_name || !updateData.boq_name.trim()) {
        return {
          success: false,
          message: 'BOQ name is required'
        };
      }

      if (!updateData.items || updateData.items.length === 0) {
        return {
          success: false,
          message: 'At least one BOQ item is required'
        };
      }

      // Process data similar to updateBOQ
      const processedData = {
        ...updateData,
        is_revision: true, // Flag to indicate this is a revision
        items: updateData.items.map((item: any) => ({
          ...item,
          // Process sub_items if they exist
          sub_items: item.sub_items?.map((subItem: any) => ({
            ...subItem,
            materials: subItem.materials?.map((mat: any) => ({
              ...mat,
              total_price: mat.total_price || (mat.quantity * mat.unit_price)
            })) || [],
            labour: subItem.labour?.map((lab: any) => ({
              ...lab,
              total_cost: lab.total_cost || (lab.hours * lab.rate_per_hour)
            })) || []
          })) || [],
          // Process item-level materials and labour (for items without sub_items)
          materials: item.materials?.map((mat: any) => ({
            ...mat,
            total_price: mat.total_price || (mat.quantity * mat.unit_price)
          })) || [],
          labour: item.labour?.map((lab: any) => ({
            ...lab,
            total_cost: lab.total_cost || (lab.hours * lab.rate_per_hour)
          })) || []
        }))
      };

      const response = await apiClient.put(`/revision_boq/${boqId}`, processedData);

      return {
        success: true,
        message: response.data.message || 'BOQ revision created successfully'
      };
    } catch (error: any) {

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 400) {
        return {
          success: false,
          message: error.response?.data?.error || 'Invalid BOQ data provided'
        };
      } else if (error.response?.status === 500) {
        return {
          success: false,
          message: 'Server error occurred while creating revision. Please try again.'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create BOQ revision'
      };
    }
  }

  async updateInternalRevisionBOQ(boqId: number, updateData: any): Promise<{ success: boolean; message: string }> {
    try {
      // Validate required fields
      if (!updateData.boq_name || !updateData.boq_name.trim()) {
        return {
          success: false,
          message: 'BOQ name is required'
        };
      }

      if (!updateData.items || updateData.items.length === 0) {
        return {
          success: false,
          message: 'At least one BOQ item is required'
        };
      }

      // Process data similar to revisionBOQ
      const processedData = {
        ...updateData,
        items: updateData.items.map((item: any) => ({
          ...item,
          // Process sub_items if they exist
          sub_items: item.sub_items?.map((subItem: any) => ({
            ...subItem,
            materials: subItem.materials?.map((mat: any) => ({
              ...mat,
              total_price: mat.total_price || (mat.quantity * mat.unit_price)
            })) || [],
            labour: subItem.labour?.map((lab: any) => ({
              ...lab,
              total_cost: lab.total_cost || (lab.hours * lab.rate_per_hour)
            })) || []
          })) || [],
          // Process item-level materials and labour (for items without sub_items)
          materials: item.materials?.map((mat: any) => ({
            ...mat,
            total_price: mat.total_price || (mat.quantity * mat.unit_price)
          })) || [],
          labour: item.labour?.map((lab: any) => ({
            ...lab,
            total_cost: lab.total_cost || (lab.hours * lab.rate_per_hour)
          })) || []
        }))
      };

      // Call internal revision API endpoint
      const response = await apiClient.put(`/update_internal_boq/${boqId}`, processedData);

      return {
        success: true,
        message: response.data.message || 'BOQ internal revision created successfully'
      };
    } catch (error: any) {

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 400) {
        return {
          success: false,
          message: error.response?.data?.error || 'Invalid BOQ data provided'
        };
      } else if (error.response?.status === 500) {
        return {
          success: false,
          message: 'Server error while creating internal revision'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create BOQ internal revision'
      };
    }
  }

  async deleteBOQ(boqId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.delete(`/delete_boq/${boqId}`);
      return {
        success: true,
        message: response.data.message || 'BOQ deleted successfully'
      };
    } catch (error: any) {
      console.error('BOQ delete error:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ delete endpoint not found or BOQ does not exist'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to delete BOQ'
      };
    }
  }

  // BOQ Status Management
  async updateBOQStatus(boqId: number, status: BOQStatus): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(`/boq/update_boq/${boqId}`, { status });
      return {
        success: true,
        message: response.data.message || 'BOQ status updated successfully'
      };
    } catch (error: any) {
      console.error('BOQ status update error:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 400) {
        return {
          success: false,
          message: 'Invalid status value provided'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update BOQ status'
      };
    }
  }

  async approveBOQ(boqId: number, notes?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(`/boq/update_boq/${boqId}`, {
        status: 'Approved',
        notes: notes
      });
      return {
        success: true,
        message: response.data.message || 'BOQ approved successfully'
      };
    } catch (error: any) {
      console.error('BOQ approval error:', error.response?.data || error.message);

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

  async rejectBOQ(boqId: number, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!reason || !reason.trim()) {
        return {
          success: false,
          message: 'Rejection reason is required'
        };
      }

      const response = await apiClient.put(`/boq/update_internal_boq/${boqId}`, {
        status: 'Rejected',
        notes: reason
      });
      return {
        success: true,
        message: response.data.message || 'BOQ rejected successfully'
      };
    } catch (error: any) {
      console.error('BOQ rejection error:', error.response?.data || error.message);

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

  async sendBOQForConfirmation(boqId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(`/boq/update_boq/${boqId}`, {
        status: 'Sent_for_Confirmation'
      });
      return {
        success: true,
        message: response.data.message || 'BOQ sent for confirmation successfully'
      };
    } catch (error: any) {
      console.error('BOQ send for confirmation error:', error.response?.data || error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'BOQ not found'
        };
      } else if (error.response?.status === 403) {
        return {
          success: false,
          message: 'You do not have permission to send this BOQ for confirmation'
        };
      } else if (error.response?.status === 400) {
        return {
          success: false,
          message: 'BOQ is not in a valid state to be sent for confirmation'
        };
      }

      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send BOQ for confirmation'
      };
    }
  }

  // PDF Upload and Processing
  async uploadBOQPDF(file: File): Promise<BOQUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Upload PDF to BOQ upload endpoint
      const response = await apiClient.post('/boq/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success && response.data.data) {
        return {
          success: true,
          message: response.data.message || 'PDF uploaded and processed successfully',
          data: {
            extracted: this.transformExtractedData(response.data.data),
            confidence: 95,
            warnings: []
          }
        };
      }

      return {
        success: false,
        message: response.data?.error || 'Failed to process PDF'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to upload and process PDF'
      };
    }
  }

  // Bulk BOQ Upload from Excel
  async bulkUploadBOQ(
    file: File,
    projectId: number,
    boqName: string
  ): Promise<{ success: boolean; message: string; boq_id?: number; warnings?: string[] }> {
    try {
      console.log('Starting bulk BOQ upload:', { fileName: file.name, projectId, boqName });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId.toString());
      formData.append('boq_name', boqName);

      // Don't set Content-Type - let browser set it with multipart boundary
      const response = await apiClient.post('/boq/bulk_upload', formData);

      console.log('Bulk upload response:', response.data);

      if (response.data.success) {
        return {
          success: true,
          message: response.data.message || 'BOQ created successfully from bulk upload',
          boq_id: response.data.boq_id,
          warnings: response.data.warnings || []
        };
      }

      return {
        success: false,
        message: response.data.error || 'Failed to process bulk upload'
      };
    } catch (error: any) {
      console.error('Bulk BOQ upload error:', error.response?.data || error.message);

      // Check for validation errors
      if (error.response?.status === 400 && error.response?.data?.errors) {
        const errors = error.response.data.errors;
        return {
          success: false,
          message: `Validation errors:\n${errors.join('\n')}`
        };
      }

      // Handle general errors
      const errorMessage = error.response?.data?.error ||
                          error.response?.data?.message ||
                          'Failed to upload BOQ from Excel';

      return {
        success: false,
        message: errorMessage
      };
    }
  }

  // Confirm extracted BOQ data
  async confirmExtractedBOQ(boqData: any): Promise<{ success: boolean; message: string; boq_id?: number }> {
    try {
      const response = await apiClient.post('/estimator/confirm-boq', boqData);

      if (response.data.success) {
        return {
          success: true,
          message: response.data.message || 'BOQ saved successfully',
          boq_id: response.data.boq_id
        };
      }

      return {
        success: false,
        message: response.data?.error || 'Failed to confirm BOQ'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to confirm BOQ'
      };
    }
  }

  // Dashboard Metrics
  async getDashboardMetrics(): Promise<{ success: boolean; data?: BOQDashboardMetrics }> {
    try {
      // Try to fetch from backend API first
      try {
        const response = await apiClient.get('/estimator_dashboard');
        if (response.data) {
          // Map backend response (snake_case) to frontend format (camelCase)
          const backendData = response.data;
          return {
            success: true,
            data: {
              totalBOQs: backendData.total_boqs || 0,
              pendingBOQs: backendData.pending_boqs || 0,
              approvedBOQs: backendData.approved_boqs || 0,
              rejectedBOQs: backendData.rejected_boqs || 0,
              sentForConfirmation: backendData.sent_for_confirmation_boqs || 0,
              totalProjectValue: backendData.total_selling_amount || 0,
              totalValue: backendData.total_selling_amount || 0,
              averageApprovalTime: backendData.average_approval_time || 0,
              monthlyTrend: backendData.monthly_trend || [],
              topProjects: backendData.top_projects || [],
              recentActivities: backendData.recent_activities || []
            }
          };
        }
      } catch (apiError) {
        console.error('Backend dashboard API not available:', apiError);
        return {
          success: false
        };
      }

      // No fallback - backend API is required
      return {
        success: false
      };
    } catch (error: any) {
      console.error('Error calculating dashboard metrics:', error);
      return { success: false };
    }
  }

  // Send BOQ Email to Technical Director
  async sendBOQEmail(
    boqId: number,
    params?: { td_email?: string; full_name?: string; comments?: string }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.get(`/boq_email/${boqId}`, {
        params: params || {}
      });
      return {
        success: response.data.success !== false,
        message: response.data.message || 'Email sent successfully to Technical Director'
      };
    } catch (error: any) {
      console.error('Email sending error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || error.response?.data?.message || 'Failed to send email'
      };
    }
  }
// Send Client Revision BOQ to Technical Director (status will be Client_Pending_Revision)
async sendClientRevisionToTD(
  boqId: number,
  params?: { td_email?: string; full_name?: string; comments?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await apiClient.get(`/send_client_revision/${boqId}`, {
      params: params || {}
    });
    return {
      success: response.data.success !== false,
      message: response.data.message || 'Client revision sent successfully to Technical Director'
    };
  } catch (error: any) {
    console.error('Client revision sending error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.error || error.response?.data?.message || 'Failed to send client revision'
    };
  }
}
  // Send BOQ to Client (after TD approval)
  async sendBOQToClient(
    boqId: number,
    params: { client_email?: string; message?: string; formats?: string[]; custom_email_body?: string; terms_text?: string; cover_page?: any; include_signature?: boolean }
  ): Promise<{ success: boolean; message: string; total_sent?: number; total_failed?: number }> {
    try {
      // Extended timeout for image processing (2 minutes to allow backend to fetch images)
      const response = await apiClient.post('/send_boq_to_client', {
        boq_id: boqId,
        client_email: params.client_email,
        message: params.message,
        formats: params.formats || ['excel', 'pdf'],
        custom_email_body: params.custom_email_body,
        terms_text: params.terms_text,
        cover_page: params.cover_page,  // Include cover page data for PDF
        include_signature: params.include_signature || false  // Include signature from admin settings
      }, {
        timeout: 120000  // 2 minutes (120 seconds) timeout for email with images
      });
      return {
        success: response.data.success !== false,
        message: response.data.message || 'BOQ sent successfully to client',
        total_sent: response.data.total_sent,
        total_failed: response.data.total_failed
      };
    } catch (error: any) {
      console.error('Error sending BOQ to client:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || error.response?.data?.message || 'Failed to send BOQ to client'
      };
    }
  }

  // Confirm Client Approval (after client approves the BOQ)
  async confirmClientApproval(boqId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(`/confirm_client_approval/${boqId}`);
      return {
        success: response.data.success !== false,
        message: response.data.message || 'Client approval confirmed successfully'
      };
    } catch (error: any) {
      console.error('Error confirming client approval:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || error.response?.data?.message || 'Failed to confirm client approval'
      };
    }
  }

  // Reject Client Approval (after client rejects the BOQ)
  async rejectClientApproval(boqId: number, rejectionReason: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(`/reject_client_approval/${boqId}`, {
        rejection_reason: rejectionReason
      });
      return {
        success: response.data.success !== false,
        message: response.data.message || 'Client rejection recorded successfully'
      };
    } catch (error: any) {
      console.error('Error rejecting client approval:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || error.response?.data?.message || 'Failed to record client rejection'
      };
    }
  }

  // Cancel BOQ (client doesn't want to proceed with business)
  async cancelBOQ(boqId: number, cancellationReason: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(`/cancel_boq/${boqId}`, {
        cancellation_reason: cancellationReason
      });
      return {
        success: response.data.success !== false,
        message: response.data.message || 'BOQ cancelled successfully'
      };
    } catch (error: any) {
      console.error('Error cancelling BOQ:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || error.response?.data?.message || 'Failed to cancel BOQ'
      };
    }
  }

  // Get BOQ History
  async getBOQHistory(boqId: number): Promise<{
    success: boolean;
    data?: any[];
    message?: string
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

  // Get BOQ Details History (for revision history)
  async getBOQDetailsHistory(boqId: number): Promise<{
    success: boolean;
    data?: any;
    message?: string
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

  // Get Revision Tabs (Dynamic)
  async getRevisionTabs(): Promise<{
    success: boolean;
    data?: Array<{
      revision_number: number;
      project_count: number;
      alert_level: 'normal' | 'warning' | 'critical';
    }>;
    message?: string;
  }> {
    try {
      const response = await deduplicatedGet('/boq/revision-tabs');

      if (response.data) {
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: true,
        data: []
      };
    } catch (error: any) {
      console.error('Error fetching revision tabs:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch revision tabs'
      };
    }
  }

  // Get Projects by Revision Number
  async getProjectsByRevision(revisionNumber: number | 'all'): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
  }> {
    try {
      const response = await apiClient.get(`/boq/revisions/${revisionNumber}`);

      if (response.data) {
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: true,
        data: []
      };
    } catch (error: any) {
      console.error('Error fetching projects by revision:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch projects'
      };
    }
  }

  // Get Revision Statistics
  async getRevisionStatistics(): Promise<{
    success: boolean;
    data?: {
      total_in_revision: number;
      by_level: Record<string, number>;
      critical_count: number;
    };
    message?: string;
  }> {
    try {
      const response = await apiClient.get('/boq/revision-statistics');

      if (response.data) {
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: false,
        message: 'No data received'
      };
    } catch (error: any) {
      console.error('Error fetching revision statistics:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch statistics'
      };
    }
  }

  // Dropdown Data Fetching
  async getProjects(): Promise<{ id: string; name: string; client: string; location?: string }[]> {
    try {
      const response = await apiClient.get('/all_project');

      if (response.data?.projects) {
        return response.data.projects.map((p: any) => ({
          id: p.project_id?.toString() || '',
          name: p.project_name || 'Unknown Project',
          client: p.client || 'Unknown Client',
          location: p.location || ''
        }));
      }

      return [];
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return [];
    }
  }

  // Get all items from master table
  async getAllItems(): Promise<{
    item_id: number;
    item_name: string;
    default_overhead_percentage?: number;
    default_profit_percentage?: number;
    description?: string;
  }[]> {
    try {
      const response = await apiClient.get('/all_item');

      if (response.data?.item_list) {
        return response.data.item_list.map((item: any) => ({
          item_id: item.item_id,
          item_name: item.item_name || '',
          default_overhead_percentage: item.default_overhead_percentage,
          default_profit_percentage: item.default_profit_percentage,
          description: item.description
        }));
      }

      return [];
    } catch (error) {
      console.error('Failed to fetch items:', error);
      return [];
    }
  }

  // Get all unique sub-item names for autocomplete suggestions
  async getAllSubItemNames(): Promise<string[]> {
    try {
      const response = await apiClient.get('/all_sub_item_names');

      if (response.data?.success && response.data?.sub_item_names) {
        return response.data.sub_item_names;
      }

      return [];
    } catch (error) {
      console.error('Failed to fetch sub-item names:', error);
      return [];
    }
  }

  // Get sub-item details by name (with materials and labour)
  async getSubItemByName(subItemName: string): Promise<{
    success: boolean;
    sub_item: {
      sub_item_id: number;
      item_id: number;
      sub_item_name: string;
      scope: string;
      description: string;
      size: string;
      location: string;
      brand: string;
      unit: string;
      quantity: number;
      rate: number;
      misc_percentage: number;
      overhead_profit_percentage: number;
      transport_percentage: number;
      materials: Array<{
        material_id: number;
        material_name: string;
        description: string;
        size: string;
        specification: string;
        quantity: number;
        brand: string;
        unit: string;
        unit_price: number;
      }>;
      labour: Array<{
        labour_id: number;
        labour_role: string;
        work_type: string;
        hours: number;
        rate_per_hour: number;
        amount: number;
      }>;
    } | null;
  }> {
    try {
      const response = await apiClient.get(`/sub_item_by_name/${encodeURIComponent(subItemName)}`);

      if (response.data?.success && response.data?.sub_item) {
        return {
          success: true,
          sub_item: response.data.sub_item
        };
      }

      return { success: false, sub_item: null };
    } catch (error) {
      console.error(`Failed to fetch sub-item by name "${subItemName}":`, error);
      return { success: false, sub_item: null };
    }
  }

  // Get materials for a specific item
  async getItemMaterials(itemId: number): Promise<{
    material_id: number;
    item_id: number;
    item_name: string;
    material_name: string;
    current_market_price: number;
    default_unit: string;
  }[]> {
    try {
      const response = await apiClient.get(`/sub_item/${itemId}`);

      if (response.data?.materials) {
        return response.data.materials.map((mat: any) => ({
          material_id: mat.material_id,
          item_id: mat.item_id,
          item_name: mat.item_name || '',
          material_name: mat.material_name || '',
          current_market_price: mat.current_market_price || 0,
          default_unit: mat.default_unit || 'nos'
        }));
      }

      return [];
    } catch (error) {
      console.error(`Failed to fetch materials for item ${itemId}:`, error);
      return [];
    }
  }

  // Search all materials globally for autocomplete
  async searchMaterials(query: string, limit: number = 20): Promise<{
    material_id: number;
    material_name: string;
    brand: string;
    size: string;
    specification: string;
    description: string;
    default_unit: string;
    current_market_price: number;
  }[]> {
    try {
      const response = await apiClient.get('/materials/search', {
        params: { q: query, limit }
      });
      if (response.data?.success && response.data?.materials) {
        return response.data.materials;
      }
      return [];
    } catch (error) {
      console.error(`Failed to search materials for "${query}":`, error);
      return [];
    }
  }

  // Search all labours globally for autocomplete
  async searchLabours(query: string, limit: number = 20): Promise<{
    labour_id: number;
    labour_role: string;
    work_type: string;
    hours: number;
    rate_per_hour: number;
    amount: number;
  }[]> {
    try {
      const response = await apiClient.get('/labours/search', {
        params: { q: query, limit }
      });
      if (response.data?.success && response.data?.labours) {
        return response.data.labours;
      }
      return [];
    } catch (error) {
      console.error(`Failed to search labours for "${query}":`, error);
      return [];
    }
  }

  // Get sub-items for a specific item with materials and labour
  async getItemSubItems(itemId: number): Promise<{
    sub_items: Array<{
      sub_item_id: number;
      item_id: number;
      sub_item_name: string;
      description?: string;
      location?: string;
      brand?: string;
      unit: string;
      quantity: number;
      per_unit_cost: number;
      sub_item_total_cost: number;
      materials: Array<{
        material_id: number;
        material_name: string;
        unit: string;
        current_market_price: number;
        is_active: boolean;
      }>;
      labour: Array<{
        labour_id: number;
        labour_role: string;
        work_type: string;
        hours: number;
        rate_per_hour: number;
        amount: number;
        is_active: boolean;
      }>;
      total_materials_cost: number;
      total_labour_cost: number;
      total_cost: number;
    }>;
  }> {
    try {
      const response = await apiClient.get(`/sub_item/${itemId}`);

      if (response.data?.sub_items) {
        return {
          sub_items: response.data.sub_items
        };
      }

      return { sub_items: [] };
    } catch (error) {
      console.error(`Failed to fetch sub-items for item ${itemId}:`, error);
      return { sub_items: [] };
    }
  }

  // Get labour for a specific item
  async getItemLabours(itemId: number): Promise<{
    labour_id: number;
    item_id: number;
    item_name: string;
    labour_role: string;
    amount: number;
    work_type: string;
  }[]> {
    try {
      const response = await apiClient.get(`/item_labour/${itemId}`);

      if (response.data?.labours) {
        return response.data.labours.map((labour: any) => ({
          labour_id: labour.labour_id,
          item_id: labour.item_id,
          item_name: labour.item_name || '',
          labour_role: labour.labour_role || '',
          amount: labour.amount || 0,
          work_type: labour.work_type || 'contract'
        }));
      }

      return [];
    } catch (error) {
      console.error(`Failed to fetch labour for item ${itemId}:`, error);
      return [];
    }
  }



  // Helper method to transform extracted data from backend
  private transformExtractedData(data: any): BOQ {
    // Transform sections if needed
    const sections = (data.sections || []).map((section: any) => ({
      section_name: section.name || section.section_name,
      section_code: section.code || section.section_code,
      category: section.category,
      items: (section.items || []).map((item: any) => ({
        item_no: item.item_no,
        description: item.description,
        quantity: item.quantity || 0,
        unit: item.unit || 'Nos',
        rate: item.rate || 0,
        amount: item.amount || (item.quantity * item.rate) || 0,
        scope: item.scope,
        location: item.location,
        brand: item.brand
      })),
      subtotal: section.subtotal || 0
    }));

    // Calculate total from sections if not provided
    const calculatedTotal = sections.reduce((sum: number, section: any) => {
      const sectionTotal = section.items.reduce((itemSum: number, item: any) =>
        itemSum + (item.amount || 0), 0);
      return sum + sectionTotal;
    }, 0);

    return {
      project: {
        name: data.client || data.project?.name || '',
        client: data.client || data.project?.client || '',
        location: data.location || data.project?.location || '',
        area: data.area || data.project?.area || '',
        workType: data.workType || data.project?.workType || 'Contract'
      },
      title: data.title || 'Extracted BOQ',
      status: 'draft',
      sections: sections,
      summary: {
        total: data.summary?.sub_total || data.summary?.total || calculatedTotal,
        discount: data.summary?.discount || 0,
        discountPercentage: data.summary?.discount_percentage || 0,
        grandTotal: data.summary?.total || data.summary?.sub_total || calculatedTotal
      },
      terms: {
        validity: data.terms?.validity || '30 Days',
        paymentTerms: Array.isArray(data.terms) ? data.terms : (data.terms?.paymentTerms || []),
        conditions: data.terms?.conditions || [],
        exclusions: data.terms?.exclusions || []
      }
    };
  }

  // Helper method to transform BOQ from backend format to frontend format
  private transformBOQFromBackend(backendBOQ: any): BOQ {
    if (!backendBOQ) {
      return {
        project: {},
        title: 'Unknown BOQ',
        status: 'draft',
        sections: [],
        summary: { total: 0, grandTotal: 0 },
        terms: {}
      } as BOQ;
    }

    return {
      boq_id: backendBOQ.boq_id,
      project: {
        project_id: backendBOQ.project_id,
        name: backendBOQ.project_name || `Project ${backendBOQ.project_id}`,
        client: backendBOQ.client_name || 'Unknown Client',
        location: backendBOQ.location || 'Unknown Location',
        area: backendBOQ.area,
        workType: backendBOQ.work_type
      },
      title: backendBOQ.title || 'Untitled BOQ',
      raised_by: backendBOQ.raised_by,
      status: backendBOQ.status || 'draft',
      sections: this.transformSections(backendBOQ.items || []),
      summary: {
        total: backendBOQ.total_amount || backendBOQ.sub_total || 0,
        discount: backendBOQ.discount || 0,
        discountPercentage: backendBOQ.discount_percentage,
        grandTotal: backendBOQ.total_amount || 0
      },
      terms: {
        validity: backendBOQ.validity,
        paymentTerms: backendBOQ.payment_terms || [],
        conditions: backendBOQ.conditions || [],
        exclusions: backendBOQ.exclusions || []
      },
      created_at: backendBOQ.created_at,
      created_by: backendBOQ.created_by,
      last_modified_at: backendBOQ.last_modified_at,
      last_modified_by: backendBOQ.last_modified_by
    };
  }

  // Helper method to transform BOQ from frontend format to backend format
  private transformBOQToBackend(boq: Partial<BOQ>): any {
    const backendBOQ: any = {
      project_id: boq.project?.project_id,
      title: boq.title,
      status: boq.status || 'draft',
      items: []
    };

    // Transform sections and items
    if (boq.sections) {
      boq.sections.forEach(section => {
        section.items.forEach(item => {
          backendBOQ.items.push({
            category: section.section_name,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            amount: item.amount,
            scope: item.scope,
            location: item.location,
            brand: item.brand
          });
        });
      });
    }

    // Add terms if present
    if (boq.terms) {
      backendBOQ.terms = boq.terms.paymentTerms || [];
    }

    return backendBOQ;
  }

  // Transform backend items into sections
  private transformSections(items: any[]): BOQSection[] {
    const sectionsMap = new Map<string, BOQSection>();

    items.forEach(item => {
      const sectionName = item.section_details?.section_name || item.category || 'General';

      if (!sectionsMap.has(sectionName)) {
        sectionsMap.set(sectionName, {
          section_code: item.section_details?.section_code,
          section_name: sectionName,
          description: item.section_details?.description,
          items: [],
          subtotal: 0
        });
      }

      const section = sectionsMap.get(sectionName)!;
      section.items.push({
        item_id: item.item_id,
        item_no: item.item_no,
        description: item.description,
        scope: item.scope,
        location: item.location,
        quantity: item.quantity || 0,
        unit: item.unit || 'Nos',
        rate: item.rate || 0,
        amount: item.amount || 0,
        size: item.size,
        brand: item.brand,
        category: item.category
      });
      section.subtotal += item.amount || 0;
    });

    return Array.from(sectionsMap.values());
  }

  // Project Management Methods
  async getProjectsPaginated(page: number = 1, perPage: number = 10): Promise<{
    success: boolean;
    projects: any[];
    total: number;
    pagination?: any;
  }> {
    try {
      const response = await apiClient.get('/all_project', {
        params: { page, per_page: perPage }
      });

      return {
        success: true,
        projects: response.data.projects || [],
        total: response.data.pagination?.total || 0,
        pagination: response.data.pagination
      };
    } catch (error) {
      console.error('Failed to fetch paginated projects:', error);
      return {
        success: false,
        projects: [],
        total: 0
      };
    }
  }

  async createProject(projectData: any): Promise<{ success: boolean; message: string; project?: any }> {
    try {
      const response = await apiClient.post('/create_project', projectData);
      return {
        success: true,
        message: response.data.message || 'Project created successfully',
        project: response.data.project
      };
    } catch (error: any) {
      console.error('Failed to create project:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create project'
      };
    }
  }

  async updateProject(projectId: number | string, projectData: any): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(`/update_project/${projectId}`, projectData);
      return {
        success: true,
        message: response.data.message || 'Project updated successfully'
      };
    } catch (error: any) {
      console.error('Failed to update project:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update project'
      };
    }
  }

  async deleteProject(projectId: number | string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.delete(`/delete_project/${projectId}`);
      return {
        success: true,
        message: response.data.message || 'Project deleted successfully'
      };
    } catch (error: any) {
      console.error('Failed to delete project:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to delete project'
      };
    }
  }

  // Send BOQ to Project Manager
  async sendBOQToProjectManager(boqId: number, projectManagerId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await apiClient.post('/boq/send_to_pm', {
        boq_id: boqId,
        project_manager_id: projectManagerId
      });

      return {
        success: true,
        message: response.data.message || 'BOQ sent to Project Manager successfully'
      };
    } catch (error: any) {
      console.error('Failed to send BOQ to PM:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send BOQ to Project Manager'
      };
    }
  }

  // Send BOQ to Technical Director (after PM approval)
  async sendBOQToTechnicalDirector(boqId: number, technicalDirectorId?: number): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await apiClient.post('/boq/send_to_td', {
        boq_id: boqId,
        technical_director_id: technicalDirectorId
      });

      // Track internal revision - Sent to TD
      try {
        await apiClient.post(`/boq/${boqId}/track_internal_revision`, {
          action_type: 'SENT_TO_TD',
          changes_summary: {
            message: 'BOQ sent to Technical Director for approval',
            technical_director_id: technicalDirectorId
          }
        });
      } catch (trackError) {
        console.warn('Failed to track internal revision:', trackError);
        // Don't fail the main operation if tracking fails
      }

      return {
        success: true,
        message: response.data.message || 'BOQ sent to Technical Director successfully'
      };
    } catch (error: any) {
      console.error('Failed to send BOQ to TD:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send BOQ to Technical Director'
      };
    }
  }

  // Get all Project Managers (both assigned and unassigned)
  async getAllProjectManagers(): Promise<{
    success: boolean;
    data: Array<{
      user_id: number;
      full_name: string;
      email: string;
      phone?: string;
      department?: string;
    }>;
    message?: string;
  }> {
    try {
      const response = await apiClient.get('/all_pm');

      // Get both assigned and unassigned PMs
      const assignedPMs = response.data.assigned_project_managers || [];
      const unassignedPMs = response.data.unassigned_project_managers || [];

      // Get unique PMs from assigned list (since one PM can have multiple projects)
      const uniqueAssignedPMs = assignedPMs.reduce((acc: any[], pm: any) => {
        const exists = acc.find((p: any) => p.user_id === pm.user_id);
        if (!exists) {
          acc.push({
            user_id: pm.user_id,
            full_name: pm.pm_name,
            email: pm.email,
            phone: pm.phone,
            department: 'Project Management'
          });
        }
        return acc;
      }, []);

      // Map unassigned PMs to our format
      const formattedUnassignedPMs = unassignedPMs.map((pm: any) => ({
        user_id: pm.user_id,
        full_name: pm.pm_name || pm.full_name,
        email: pm.email,
        phone: pm.phone,
        department: 'Project Management'
      }));

      // Combine both lists (unassigned first, then assigned)
      const allPMs = [...formattedUnassignedPMs, ...uniqueAssignedPMs];

      return {
        success: true,
        data: allPMs
      };
    } catch (error: any) {
      console.error('Failed to fetch project managers:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch project managers'
      };
    }
  }

  /**
   * Get all preliminary master items (for creating new BOQ)
   * Returns the complete list of available preliminaries
   */
  async getAllPreliminaryMasters(): Promise<{ success: boolean; data?: any[]; message?: string; count?: number }> {
    try {
      const response = await apiClient.get('/preliminary-masters');

      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || [],
          count: response.data.count || 0
        };
      }

      return {
        success: false,
        message: 'No preliminary data found',
        data: []
      };
    } catch (error: any) {
      console.error('Failed to fetch preliminary masters:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch preliminary masters',
        data: []
      };
    }
  }

  /**
   * Create a new preliminary master item
   * @param preliminaryData - The preliminary item to create
   * @returns Response with created preliminary data
   */
  async createPreliminaryMaster(preliminaryData: {
    description: string;
    unit?: string;
    rate?: number
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const response = await apiClient.post('/preliminary-masters', preliminaryData);

      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data,
          message: response.data.message || 'Preliminary master created successfully'
        };
      }

      return {
        success: false,
        message: response.data?.error || 'Failed to create preliminary master'
      };
    } catch (error: any) {
      console.error('Failed to create preliminary master:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create preliminary master'
      };
    }
  }

  /**
   * Get all preliminaries with selection status for a BOQ
   * Used when editing BOQ - returns all items with is_checked status
   */
  async getBOQPreliminarySelections(boqId: number): Promise<{ success: boolean; data?: any[]; message?: string }> {
    try {
      const response = await apiClient.get(`/boq/${boqId}/preliminaries`);

      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || []
        };
      }

      return {
        success: false,
        message: 'No preliminary data found',
        data: []
      };
    } catch (error: any) {
      console.error('Failed to fetch BOQ preliminary selections:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch BOQ preliminaries',
        data: []
      };
    }
  }

  /**
   * Save preliminary selections for a BOQ
   */
  async saveBOQPreliminarySelections(boqId: number, selections: any[]): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post(`/boq/${boqId}/preliminaries`, {
        selections: selections
      });

      return {
        success: true,
        message: response.data.message || 'Preliminary selections saved successfully'
      };
    } catch (error: any) {
      console.error('Failed to save preliminary selections:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to save preliminary selections'
      };
    }
  }

  // ==================== Image Upload Methods ====================

  /**
   * Upload images for a sub-item
   * @param subItemId - The sub-item ID
   * @param images - Array of image files
   * @returns Upload response with image URLs
   */
  async uploadSubItemImages(subItemId: number, images: File[]): Promise<any> {
    try {
      const formData = new FormData();

      // Append all images with the key "file"
      images.forEach(image => {
        formData.append('file', image);
      });

      const response = await apiClient.post(`/upload_image/${subItemId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error(`Error uploading images for sub-item ${subItemId}:`, error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to upload images'
      };
    }
  }

  /**
   * Get images for a sub-item
   * @param subItemId - The sub-item ID
   * @returns Array of image objects with URLs
   */
  async getSubItemImages(subItemId: number): Promise<any> {
    try {
      const response = await apiClient.get(`/images/${subItemId}`);

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error(`Error fetching images for sub-item ${subItemId}:`, error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch images'
      };
    }
  }

  /**
   * Delete a single image for a sub-item
   * @param subItemId - The sub-item ID
   * @param filename - Image filename to delete
   * @returns Deletion response
   */
  async deleteSubItemImage(subItemId: number, filename: string): Promise<any> {
    try {
      const response = await apiClient.delete(`/images/${subItemId}`, {
        data: { filename: filename }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error(`Error deleting image for sub-item ${subItemId}:`, error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to delete image'
      };
    }
  }

  /**
   * Delete specific images for a sub-item
   * @param subItemId - The sub-item ID
   * @param imagesToDelete - Array of image filenames to delete
   * @returns Deletion response
   */
  async deleteSubItemImages(subItemId: number, imagesToDelete: string[]): Promise<any> {
    try {
      const response = await apiClient.delete(`/images/${subItemId}`, {
        data: { images_to_delete: imagesToDelete }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error(`Error deleting images for sub-item ${subItemId}:`, error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to delete images'
      };
    }
  }

  // Custom Units Management
  async getCustomUnits(): Promise<{ success: boolean; data: any[] }> {
    try {
      const response = await apiClient.get('/boq/custom-units');
      return {
        success: true,
        data: response.data.custom_units || []
      };
    } catch (error: any) {
      console.error('Error fetching custom units:', error);
      return {
        success: false,
        data: []
      };
    }
  }

  async createCustomUnit(unitValue: string, unitLabel: string): Promise<{ success: boolean; unit?: any; message?: string }> {
    try {
      const response = await apiClient.post('/boq/custom-units', {
        unit_value: unitValue,
        unit_label: unitLabel
      });
      return {
        success: true,
        unit: response.data.unit,
        message: response.data.message
      };
    } catch (error: any) {
      console.error('Error creating custom unit:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create custom unit'
      };
    }
  }

  // ===== TERMS & CONDITIONS API METHODS =====

  /**
   * Get all active terms & conditions master list
   * For dropdown/selection in BOQ creation
   */
  async getAllTermsMasters() {
    try {
      const response = await apiClient.get('/terms-master');
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch terms masters:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch terms',
        data: []
      };
    }
  }

  /**
   * Get all terms with selection status for a specific BOQ
   * Returns all active terms with their checked status
   */
  async getBOQTerms(boqId: number) {
    try {
      const response = await apiClient.get(`/boq/${boqId}/terms`);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch terms for BOQ ${boqId}:`, error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch BOQ terms',
        data: []
      };
    }
  }

  /**
   * Get only selected terms for a BOQ (for display/PDF)
   */
  async getBOQSelectedTerms(boqId: number) {
    try {
      const response = await apiClient.get(`/boq/${boqId}/terms/selected`);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch selected terms for BOQ ${boqId}:`, error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch selected terms',
        data: []
      };
    }
  }

  /**
   * Save term selections for a BOQ
   * @param boqId BOQ ID
   * @param selections Array of {term_id, is_checked}
   */
  async saveBOQTerms(boqId: number, selections: { term_id: number; is_checked: boolean }[]) {
    try {
      const response = await apiClient.post(`/boq/${boqId}/terms`, {
        selections: selections
      });

      return {
        success: true,
        message: response.data.message || 'Terms selections saved successfully'
      };
    } catch (error: any) {
      console.error('Failed to save terms selections:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to save terms selections'
      };
    }
  }

  /**
   * Create a new term master
   * Used when user adds a custom term
   */
  async createTermMaster(data: { terms_text: string }) {
    try {
      const response = await apiClient.post('/terms-master', data);
      return response.data;
    } catch (error: any) {
      console.error('Failed to create term:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to create term'
      };
    }
  }

  /**
   * Update a term master
   */
  async updateTermMaster(termId: number, data: { terms_text: string }) {
    try {
      const response = await apiClient.put(`/terms-master/${termId}`, data);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to update term ${termId}:`, error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to update term'
      };
    }
  }

  /**
   * Delete a term master (soft delete)
   */
  async deleteTermMaster(termId: number) {
    try {
      const response = await apiClient.delete(`/terms-master/${termId}`);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to delete term ${termId}:`, error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to delete term'
      };
    }
  }

}

export const estimatorService = new EstimatorService();