/**
 * Estimator Service
 * Handles all API interactions for BOQ management
 */

import { apiClient } from '@/api/config';
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
  async getAllBOQs(filter?: BOQFilter): Promise<{ success: boolean; data: any[]; count: number }> {
    try {
      const response = await apiClient.get<BOQListResponse>('/all_boq', { params: filter });

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
      console.error('Error fetching BOQs:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        count: 0
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

  async createBOQ(payload: BOQCreatePayload): Promise<{ success: boolean; boq_id?: number; message: string }> {
    try {
      console.log('Creating BOQ with payload:', payload);

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

      console.log('Processed BOQ payload with totals:', processedPayload);

      const response = await apiClient.post<BOQCreateResponse>('/create_boq', processedPayload);
      console.log('BOQ creation response:', response.data);

      return {
        success: true,
        boq_id: response.data.boq?.boq_id,
        message: response.data.message || 'BOQ created successfully'
      };
    } catch (error: any) {
      console.error('BOQ creation error:', error.response?.data || error.message);

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
      console.log('=== ORIGINAL PAYLOAD ===', JSON.stringify(updateData, null, 2));

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

      // Ensure total_price and total_cost are included in the payload
      const processedData = {
        ...updateData,
        items: updateData.items.map((item: any) => {
          console.log('Processing item:', item.item_name);
          return {
            ...item,
            materials: item.materials.map((mat: any) => {
              const total_price = mat.total_price || (mat.quantity * mat.unit_price);
              console.log(`Material ${mat.material_name}: qty=${mat.quantity}, price=${mat.unit_price}, total=${total_price}`);
              return {
                ...mat,
                total_price: total_price
              };
            }),
            labour: item.labour.map((lab: any) => {
              const total_cost = lab.total_cost || (lab.hours * lab.rate_per_hour);
              console.log(`Labour ${lab.labour_role}: hours=${lab.hours}, rate=${lab.rate_per_hour}, total=${total_cost}`);
              return {
                ...lab,
                total_cost: total_cost
              };
            })
          };
        })
      };

      console.log('=== PROCESSED PAYLOAD WITH TOTALS ===', JSON.stringify(processedData, null, 2));

      const response = await apiClient.put(`/update_boq/${boqId}`, processedData);
      console.log('BOQ update response:', response.data);

      return {
        success: true,
        message: response.data.message || 'BOQ updated successfully'
      };
    } catch (error: any) {
      console.error('BOQ update error:', error.response?.data || error.message);

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
      const response = await apiClient.put(`/update_boq/${boqId}`, { status });
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
      const response = await apiClient.put(`/update_boq/${boqId}`, {
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

      const response = await apiClient.put(`/update_boq/${boqId}`, {
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
      const response = await apiClient.put(`/update_boq/${boqId}`, {
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
        if (response.data && response.data.data) {
          return {
            success: true,
            data: response.data.data
          };
        }
      } catch (apiError) {
        console.log('Backend dashboard API not available, falling back to client-side calculation');
      }

      // Fallback: Fetch all BOQs and calculate metrics client-side
      const boqsResult = await this.getAllBOQs();

      if (!boqsResult.success || !boqsResult.data) {
        return {
          success: false
        };
      }

      const allBOQs = boqsResult.data;

      // Calculate status-based counts
      const totalBOQs = allBOQs.length;
      const pendingBOQs = allBOQs.filter(boq =>
        boq.status === 'Draft' || boq.status === 'pending' || boq.status === 'In_Review'
      ).length;
      const approvedBOQs = allBOQs.filter(boq =>
        boq.status === 'Approved' || boq.status === 'approved'
      ).length;
      const rejectedBOQs = allBOQs.filter(boq =>
        boq.status === 'Rejected' || boq.status === 'rejected'
      ).length;
      const sentForConfirmation = allBOQs.filter(boq =>
        boq.status === 'Sent_for_Confirmation' || boq.status === 'sent_for_confirmation'
      ).length;

      // Calculate total project value
      const totalProjectValue = allBOQs.reduce((sum, boq) => {
        const value = boq.total_cost || boq.selling_price || boq.estimatedSellingPrice || 0;
        return sum + value;
      }, 0);

      // Group BOQs by month for trend analysis
      const monthlyData: { [key: string]: { count: number; value: number } } = {};
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();

      // Initialize last 6 months
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentYear, currentDate.getMonth() - i, 1);
        const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        monthlyData[monthKey] = { count: 0, value: 0 };
      }

      // Fill in actual data
      allBOQs.forEach(boq => {
        if (boq.created_at) {
          const date = new Date(boq.created_at);
          const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;

          if (monthlyData[monthKey]) {
            monthlyData[monthKey].count++;
            monthlyData[monthKey].value += boq.total_cost || boq.selling_price || boq.estimatedSellingPrice || 0;
          }
        }
      });

      const monthlyTrend = Object.keys(monthlyData).map(month => ({
        month: month.split(' ')[0], // Just the month name for display
        count: monthlyData[month].count,
        value: monthlyData[month].value
      }));

      // Get top projects by value
      const topProjects = allBOQs
        .filter(boq => boq.project_name)
        .sort((a, b) => {
          const aValue = a.total_cost || a.selling_price || a.estimatedSellingPrice || 0;
          const bValue = b.total_cost || b.selling_price || b.estimatedSellingPrice || 0;
          return bValue - aValue;
        })
        .slice(0, 5)
        .map(boq => ({
          id: boq.boq_id,
          name: boq.project_name || `BOQ #${boq.boq_id}`,
          value: boq.total_cost || boq.selling_price || boq.estimatedSellingPrice || 0,
          status: boq.status,
          client: boq.client || 'Unknown Client'
        }));

      // Calculate average approval time (in days)
      const approvedBOQsWithTime = allBOQs.filter(boq =>
        (boq.status === 'Approved' || boq.status === 'approved') &&
        boq.created_at && boq.last_modified_at
      );

      let averageApprovalTime = 0;
      if (approvedBOQsWithTime.length > 0) {
        const totalTime = approvedBOQsWithTime.reduce((sum, boq) => {
          const created = new Date(boq.created_at).getTime();
          const modified = new Date(boq.last_modified_at).getTime();
          const days = (modified - created) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0);
        averageApprovalTime = totalTime / approvedBOQsWithTime.length;
      }

      // Get recent activities
      const recentActivities = allBOQs
        .filter(boq => boq.created_at || boq.last_modified_at)
        .sort((a, b) => {
          const aTime = new Date(a.last_modified_at || a.created_at).getTime();
          const bTime = new Date(b.last_modified_at || b.created_at).getTime();
          return bTime - aTime;
        })
        .slice(0, 10)
        .map(boq => {
          const isNew = !boq.last_modified_at || boq.created_at === boq.last_modified_at;
          return {
            id: boq.boq_id,
            type: isNew ? 'created' : 'updated',
            description: `${boq.boq_name || `BOQ #${boq.boq_id}`} ${isNew ? 'created' : 'updated'}`,
            timestamp: boq.last_modified_at || boq.created_at,
            project: boq.project_name || 'Unknown Project',
            status: boq.status
          };
        });

      return {
        success: true,
        data: {
          totalBOQs,
          pendingBOQs,
          approvedBOQs,
          rejectedBOQs,
          sentForConfirmation,
          totalProjectValue,
          averageApprovalTime: Math.round(averageApprovalTime * 10) / 10, // Round to 1 decimal
          monthlyTrend,
          topProjects,
          recentActivities
        }
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

  // Send BOQ to Client (after TD approval)
  async sendBOQToClient(
    boqId: number,
    params: { client_email?: string; message?: string; formats?: string[] }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post('/send_boq_to_client', {
        boq_id: boqId,
        client_email: params.client_email,
        message: params.message,
        formats: params.formats || ['excel', 'pdf']
      });
      return {
        success: response.data.success !== false,
        message: response.data.message || 'BOQ sent successfully to client'
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
      const response = await apiClient.get(`/item_material/${itemId}`);

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

}

export const estimatorService = new EstimatorService();