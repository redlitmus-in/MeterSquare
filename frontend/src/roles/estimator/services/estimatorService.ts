/**
 * Estimator Service
 * Handles all API interactions for BOQ management
 */

import { apiClient } from '@/api/config';
import { BOQ, BOQFilter, BOQDashboardMetrics, BOQStatus, BOQUploadResponse } from '../types';

class EstimatorService {
  // BOQ CRUD Operations
  async getAllBOQs(filter?: BOQFilter): Promise<{ success: boolean; data: BOQ[]; count: number }> {
    try {
      const response = await apiClient.get('/all_boq');

      // Transform backend data to match our BOQ interface
      const boqs = response.data.data || [];
      let filteredBOQs = boqs.map((boq: any) => this.transformBOQFromBackend(boq));

      // Apply client-side filtering if needed
      if (filter) {
        if (filter.status && filter.status.length > 0) {
          filteredBOQs = filteredBOQs.filter(boq => filter.status?.includes(boq.status));
        }
        if (filter.project) {
          filteredBOQs = filteredBOQs.filter(boq =>
            boq.project.name.toLowerCase().includes(filter.project!.toLowerCase())
          );
        }
        if (filter.client) {
          filteredBOQs = filteredBOQs.filter(boq =>
            boq.project.client.toLowerCase().includes(filter.client!.toLowerCase())
          );
        }
        if (filter.searchTerm) {
          filteredBOQs = filteredBOQs.filter(boq =>
            boq.title?.toLowerCase().includes(filter.searchTerm!.toLowerCase()) ||
            boq.project.name.toLowerCase().includes(filter.searchTerm!.toLowerCase()) ||
            boq.project.client.toLowerCase().includes(filter.searchTerm!.toLowerCase())
          );
        }
      }

      return {
        success: true,
        data: filteredBOQs,
        count: response.data.count || filteredBOQs.length
      };
    } catch (error: any) {
      console.error('Error fetching BOQs:', error);
      return { success: false, data: [], count: 0 };
    }
  }

  async getBOQById(boqId: number): Promise<{ success: boolean; data?: BOQ }> {
    try {
      const response = await apiClient.get(`/boq/${boqId}`);
      return {
        success: true,
        data: this.transformBOQFromBackend(response.data.data)
      };
    } catch (error: any) {
      console.error('Error fetching BOQ:', error);
      return { success: false };
    }
  }

  async createBOQ(boq: Partial<BOQ>): Promise<{ success: boolean; boq_id?: number; message: string }> {
    try {
      // Transform BOQ data to backend format
      const backendBOQ = this.transformBOQToBackend(boq);
      const response = await apiClient.post('/boq_create', backendBOQ);
      return {
        success: true,
        boq_id: response.data.boq_id,
        message: response.data.message || 'BOQ created successfully'
      };
    } catch (error: any) {
      console.error('Error creating BOQ:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create BOQ'
      };
    }
  }

  async updateBOQ(boqId: number, boq: Partial<BOQ>): Promise<{ success: boolean; message: string }> {
    try {
      const backendBOQ = this.transformBOQToBackend(boq);
      const response = await apiClient.put(`/update_boq/${boqId}`, backendBOQ);
      return {
        success: true,
        message: response.data.message || 'BOQ updated successfully'
      };
    } catch (error: any) {
      console.error('Error updating BOQ:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update BOQ'
      };
    }
  }

  async deleteBOQ(boqId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.get(`/delete_boq/${boqId}`);
      return {
        success: true,
        message: response.data.message || 'BOQ deleted successfully'
      };
    } catch (error: any) {
      console.error('Error deleting BOQ:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to delete BOQ'
      };
    }
  }

  // BOQ Status Management
  async updateBOQStatus(boqId: number, status: BOQStatus): Promise<{ success: boolean; message: string }> {
    try {
      // Update status through the update endpoint
      const response = await apiClient.put(`/update_boq/${boqId}`, { status });
      return {
        success: true,
        message: response.data.message || 'BOQ status updated successfully'
      };
    } catch (error: any) {
      console.error('Error updating BOQ status:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update BOQ status'
      };
    }
  }

  async approveBOQ(boqId: number, notes?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Update status to approved
      const response = await apiClient.put(`/update_boq/${boqId}`, {
        status: 'approved',
        notes: notes
      });
      return {
        success: true,
        message: response.data.message || 'BOQ approved successfully'
      };
    } catch (error: any) {
      console.error('Error approving BOQ:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to approve BOQ'
      };
    }
  }

  async rejectBOQ(boqId: number, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      // Update status to rejected
      const response = await apiClient.put(`/update_boq/${boqId}`, {
        status: 'rejected',
        notes: reason
      });
      return {
        success: true,
        message: response.data.message || 'BOQ rejected successfully'
      };
    } catch (error: any) {
      console.error('Error rejecting BOQ:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to reject BOQ'
      };
    }
  }

  async sendBOQForConfirmation(boqId: number): Promise<{ success: boolean; message: string }> {
    try {
      // Update status to sent_for_confirmation
      const response = await apiClient.put(`/update_boq/${boqId}`, {
        status: 'sent_for_confirmation'
      });
      return {
        success: true,
        message: response.data.message || 'BOQ sent for confirmation successfully'
      };
    } catch (error: any) {
      console.error('Error sending BOQ for confirmation:', error);
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
      console.error('Error uploading PDF:', error);
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
      console.error('Error confirming BOQ:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to confirm BOQ'
      };
    }
  }

  // Dashboard Metrics
  async getDashboardMetrics(): Promise<{ success: boolean; data?: BOQDashboardMetrics }> {
    try {
      // Get dashboard data from estimator endpoint
      const response = await apiClient.get('/estimator/dashboard');

      if (response.data) {
        // Transform backend response to frontend format
        const data = response.data;
        return {
          success: true,
          data: {
            totalBOQs: data.metrics?.total_boqs || 0,
            pendingBOQs: data.metrics?.pending_boqs || 0,
            approvedBOQs: data.metrics?.approved_boqs || 0,
            totalProjectValue: data.metrics?.total_value || 0,
            averageApprovalTime: 3.5, // Calculate from actual data if available
            monthlyTrend: data.trend_data || [],
            topProjects: data.recent_boqs?.slice(0, 3).map((boq: any) => ({
              name: boq.title || 'Unknown Project',
              value: boq.total_amount || 0,
              status: boq.status || 'pending'
            })) || [],
            recentActivities: data.recent_boqs?.map((boq: any) => ({
              id: boq.boq_id?.toString() || '',
              action: boq.status === 'approved' ? 'Approved' : boq.status === 'pending' ? 'Created' : 'Updated',
              boq: boq.title || 'Unknown BOQ',
              user: data.user_info?.name || 'System',
              timestamp: boq.created_at ? new Date(boq.created_at).toLocaleString() : 'Recently'
            })) || []
          }
        };
      }

      return { success: false };
    } catch (error: any) {
      console.error('Error fetching dashboard metrics:', error);
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
      console.error('Error sending BOQ email:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send email'
      };
    }
  }

  // Dropdown Data Fetching
  async getProjects(): Promise<{ id: string; name: string; client: string }[]> {
    try {
      const response = await apiClient.get('/estimator/dropdown-data');

      if (response.data?.projects) {
        return response.data.projects.map((p: any) => ({
          id: p.id?.toString() || '',
          name: p.name || 'Unknown Project',
          client: p.client || 'Unknown Client'
        }));
      }

      return [];
    } catch (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
  }

  async getClients(): Promise<{ id: string; name: string; contact?: string }[]> {
    try {
      const response = await apiClient.get('/estimator/dropdown-data');

      if (response.data?.clients) {
        return response.data.clients.map((c: any) => ({
          id: c.id?.toString() || '',
          name: c.name || 'Unknown Client',
          contact: c.type || ''
        }));
      }

      return [];
    } catch (error) {
      console.error('Error fetching clients:', error);
      return [];
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const response = await apiClient.get('/estimator/dropdown-data');

      if (response.data?.categories) {
        return response.data.categories;
      }

      return [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  async getUnits(): Promise<string[]> {
    try {
      const response = await apiClient.get('/estimator/dropdown-data');

      if (response.data?.units) {
        return response.data.units;
      }

      return [];
    } catch (error) {
      console.error('Error fetching units:', error);
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