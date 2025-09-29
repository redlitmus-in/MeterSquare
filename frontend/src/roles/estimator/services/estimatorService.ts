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

      const response = await apiClient.post<BOQCreateResponse>('/create_boq', payload);
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
      console.log('Updating BOQ with payload:', updateData);

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

      // Ensure all materials and labour have calculated totals
      const processedData = {
        ...updateData,
        items: updateData.items.map((item: any) => ({
          ...item,
          materials: item.materials.map((mat: any) => ({
            ...mat,
            total_price: mat.quantity * mat.unit_price
          })),
          labour: item.labour.map((lab: any) => ({
            ...lab,
            total_cost: lab.hours * lab.rate_per_hour
          }))
        }))
      };

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

      // Upload PDF to estimator endpoint
      const response = await apiClient.post('/estimator/upload-pdf', formData, {
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
      // Since /estimator/dashboard doesn't exist yet, return mock data
      // TODO: Implement this endpoint in the backend
      console.log('getDashboardMetrics called - using mock data');

      return {
        success: true,
        data: {
          totalBOQs: 0,
          pendingBOQs: 0,
          approvedBOQs: 0,
          totalProjectValue: 0,
          averageApprovalTime: 3.5,
          monthlyTrend: [
            { month: 'Jan', count: 0, value: 0 },
            { month: 'Feb', count: 0, value: 0 },
            { month: 'Mar', count: 0, value: 0 }
          ],
          topProjects: [],
          recentActivities: []
        }
      };
    } catch (error: any) {
      console.error('Error in getDashboardMetrics:', error);
      return { success: false };
    }
  }

  // Send BOQ Email
  async sendBOQEmail(boqId: number, emailType: 'created' | 'updated' = 'created'): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.get(`/send_boq_email/${boqId}?email_type=${emailType}`);
      return {
        success: response.data.success !== false,
        message: response.data.message || 'Email sent successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send email'
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

}

export const estimatorService = new EstimatorService();