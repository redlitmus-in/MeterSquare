/**
 * Terms & Conditions Service
 * Handles all API interactions for Terms & Conditions templates management
 */

import { apiClient } from '@/api/config';

export interface TermsConditionsTemplate {
  term_id: number;
  template_name: string;
  terms_text: string;
  is_default: boolean;
  is_active: boolean;
  created_by?: number;
  client_id?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTermsRequest {
  template_name: string;
  terms_text: string;
  is_default?: boolean;
  client_id?: number;
}

export interface UpdateTermsRequest {
  template_name?: string;
  terms_text?: string;
  is_default?: boolean;
  is_active?: boolean;
  client_id?: number;
}

class TermsConditionsService {
  /**
   * Get all Terms & Conditions templates
   * @param includeInactive - Whether to include inactive templates (default: false)
   * @param clientId - Filter by client ID (optional)
   */
  async getAllTerms(includeInactive = false, clientId?: number): Promise<{
    success: boolean;
    data: TermsConditionsTemplate[];
    total: number;
    message?: string;
  }> {
    try {
      const params: any = { include_inactive: includeInactive };
      if (clientId) params.client_id = clientId;

      const response = await apiClient.get('/terms', { params });

      return {
        success: true,
        data: response.data.data || [],
        total: response.data.total || 0
      };
    } catch (error: any) {
      console.error('Error fetching terms:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        total: 0,
        message: error.response?.data?.message || 'Failed to fetch terms'
      };
    }
  }

  /**
   * Get the default Terms & Conditions template
   */
  async getDefaultTerms(): Promise<{
    success: boolean;
    data?: TermsConditionsTemplate;
    message?: string;
  }> {
    try {
      const response = await apiClient.get('/terms/default');

      return {
        success: true,
        data: response.data.data
      };
    } catch (error: any) {
      console.error('Error fetching default terms:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch default terms'
      };
    }
  }

  /**
   * Get a specific Terms & Conditions template by ID
   */
  async getTermById(termId: number): Promise<{
    success: boolean;
    data?: TermsConditionsTemplate;
    message?: string;
  }> {
    try {
      const response = await apiClient.get(`/terms/${termId}`);

      return {
        success: true,
        data: response.data.data
      };
    } catch (error: any) {
      console.error('Error fetching term:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch term'
      };
    }
  }

  /**
   * Create a new Terms & Conditions template
   */
  async createTerm(data: CreateTermsRequest): Promise<{
    success: boolean;
    term_id?: number;
    message?: string;
  }> {
    try {
      const response = await apiClient.post('/terms', data);

      return {
        success: true,
        term_id: response.data.term_id,
        message: response.data.message || 'Template created successfully'
      };
    } catch (error: any) {
      console.error('Error creating term:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to create template'
      };
    }
  }

  /**
   * Update an existing Terms & Conditions template
   */
  async updateTerm(termId: number, data: UpdateTermsRequest): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const response = await apiClient.put(`/terms/${termId}`, data);

      return {
        success: true,
        message: response.data.message || 'Template updated successfully'
      };
    } catch (error: any) {
      console.error('Error updating term:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to update template'
      };
    }
  }

  /**
   * Delete (deactivate) a Terms & Conditions template
   * @param termId - The ID of the template to delete
   * @param hardDelete - Whether to permanently delete (default: false, soft delete)
   */
  async deleteTerm(termId: number, hardDelete = false): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const params = hardDelete ? { hard: 'true' } : {};
      const response = await apiClient.delete(`/terms/${termId}`, { params });

      return {
        success: true,
        message: response.data.message || 'Template deleted successfully'
      };
    } catch (error: any) {
      console.error('Error deleting term:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to delete template'
      };
    }
  }
}

// Export singleton instance
export const termsConditionsService = new TermsConditionsService();
export default termsConditionsService;
