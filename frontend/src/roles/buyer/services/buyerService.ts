import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export interface PurchaseMaterial {
  material_name: string;
  sub_item_name?: string;  // Sub-item/scope name like "Protection"
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  master_material_id?: number | null;  // Null for NEW materials, number for existing BOQ materials
}

export interface Purchase {
  cr_id: number;
  project_id: number;
  project_name: string;
  project_code?: string;
  client: string;
  location: string;
  boq_id: number;
  boq_name: string;
  item_name: string;
  sub_item_name: string;
  request_type: string;
  reason: string;
  materials: PurchaseMaterial[];
  materials_count: number;
  total_cost: number;
  approved_by: number;
  approved_at: string | null;
  created_at: string;
  status: 'pending' | 'completed';
  purchase_completed_by_user_id?: number;
  purchase_completed_by_name?: string;
  purchase_completion_date?: string;
  purchase_notes?: string;
  vendor_id?: number | null;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  vendor_contact_person?: string | null;
  vendor_selection_pending_td_approval?: boolean;
  vendor_email_sent?: boolean;
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
}

export interface SelectVendorRequest {
  cr_id: number;
  vendor_id: number;
}

export interface SelectVendorResponse {
  success: boolean;
  message: string;
  purchase?: Purchase;
  error?: string;
}

export interface UpdatePurchaseNotesRequest {
  cr_id: number;
  notes: string;
}

export interface UpdatePurchaseNotesResponse {
  success: boolean;
  message: string;
  purchase?: Purchase;
  error?: string;
}

export interface UpdatePurchaseOrderRequest {
  cr_id: number;
  materials: PurchaseMaterial[];
  total_cost: number;
}

export interface UpdatePurchaseOrderResponse {
  success: boolean;
  message: string;
  purchase?: Purchase;
  error?: string;
}

export interface PreviewVendorEmailResponse {
  success: boolean;
  email_preview: string;
  vendor_email: string;
  vendor_name: string;
  vendor_contact_person?: string;
  vendor_phone?: string;
  error?: string;
}

export interface SendVendorEmailRequest {
  vendor_email: string;
  custom_email_body?: string;
  vendor_company_name?: string;
  vendor_contact_person?: string;
  vendor_phone?: string;
}

export interface SendVendorEmailResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface PurchaseListResponse {
  success: boolean;
  pending_purchases_count?: number;
  completed_purchases_count?: number;
  total_cost: number;
  projects_count?: number;
  pending_purchases?: Purchase[];
  completed_purchases?: Purchase[];
}

export interface CompletePurchaseRequest {
  cr_id: number;
  notes?: string;
}

export interface CompletePurchaseResponse {
  success: boolean;
  message: string;
  purchase?: Purchase;
  error?: string;
}

class BuyerService {
  private getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  // Get pending purchases (assigned to buyer)
  async getPendingPurchases(): Promise<PurchaseListResponse> {
    try {
      const response = await axios.get<PurchaseListResponse>(
        `${API_URL}/buyer/new-purchases`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error('Failed to fetch pending purchases');
    } catch (error: any) {
      console.error('Error fetching pending purchases:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch pending purchases');
    }
  }

  // Get completed purchases
  async getCompletedPurchases(): Promise<PurchaseListResponse> {
    try {
      const response = await axios.get<PurchaseListResponse>(
        `${API_URL}/buyer/completed-purchases`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error('Failed to fetch completed purchases');
    } catch (error: any) {
      console.error('Error fetching completed purchases:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch completed purchases');
    }
  }

  // Mark purchase as complete and merge to BOQ
  async completePurchase(data: CompletePurchaseRequest): Promise<CompletePurchaseResponse> {
    try {
      // Use the change-request endpoint that properly merges materials to BOQ
      // This endpoint:
      // 1. Changes status to 'purchase_completed'
      // 2. Merges materials to BOQ with 'planned_quantity: 0' marker
      // 3. Preserves original BOQ totals
      // 4. Creates MaterialPurchaseTracking entries
      const response = await axios.post<CompletePurchaseResponse>(
        `${API_URL}/change-request/${data.cr_id}/complete-purchase`,
        { purchase_notes: data.notes || '' },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to complete purchase');
    } catch (error: any) {
      console.error('Error completing purchase:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to complete purchase');
    }
  }

  // Get purchase by ID (for details view)
  async getPurchaseById(crId: number): Promise<Purchase> {
    try {
      const response = await axios.get<{ success: boolean; purchase: Purchase; error?: string }>(
        `${API_URL}/buyer/purchase/${crId}`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success && response.data.purchase) {
        return response.data.purchase;
      }
      throw new Error('Purchase not found');
    } catch (error: any) {
      console.error('Error fetching purchase details:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch purchase details');
    }
  }

  // Select vendor for purchase (requires TD approval)
  // Note: Backend endpoint needs to be implemented at /api/buyer/purchase/{cr_id}/select-vendor
  async selectVendor(data: SelectVendorRequest): Promise<SelectVendorResponse> {
    try {
      const response = await axios.post<SelectVendorResponse>(
        `${API_URL}/buyer/purchase/${data.cr_id}/select-vendor`,
        { vendor_id: data.vendor_id },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to select vendor');
    } catch (error: any) {
      console.error('Error selecting vendor:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Backend endpoint not implemented yet. Please contact the development team.');
      }
      throw new Error(error.response?.data?.error || 'This feature requires backend implementation. Please contact support.');
    }
  }

  // Update purchase notes
  async updatePurchaseNotes(data: UpdatePurchaseNotesRequest): Promise<UpdatePurchaseNotesResponse> {
    try {
      const response = await axios.put<UpdatePurchaseNotesResponse>(
        `${API_URL}/buyer/purchase/${data.cr_id}/notes`,
        { notes: data.notes },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to update notes');
    } catch (error: any) {
      console.error('Error updating purchase notes:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to update notes');
    }
  }

  // Update purchase order (materials and total cost)
  // Note: Backend endpoint needs to be implemented at /api/buyer/purchase/{cr_id}/update
  async updatePurchaseOrder(data: UpdatePurchaseOrderRequest): Promise<UpdatePurchaseOrderResponse> {
    try {
      const response = await axios.put<UpdatePurchaseOrderResponse>(
        `${API_URL}/buyer/purchase/${data.cr_id}/update`,
        {
          materials: data.materials,
          total_cost: data.total_cost
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to update purchase order');
    } catch (error: any) {
      console.error('Error updating purchase order:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Backend endpoint not implemented yet. Please contact the development team.');
      }
      if (error.response?.status === 403) {
        throw new Error('You do not have permission to edit this purchase order');
      }
      throw new Error(error.response?.data?.error || 'This feature requires backend implementation. Please contact support.');
    }
  }

  // Preview vendor email
  async previewVendorEmail(crId: number): Promise<PreviewVendorEmailResponse> {
    try {
      const response = await axios.get<PreviewVendorEmailResponse>(
        `${API_URL}/buyer/purchase/${crId}/preview-vendor-email`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to preview vendor email');
    } catch (error: any) {
      console.error('Error previewing vendor email:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to preview vendor email');
    }
  }

  // Send email to vendor
  async sendVendorEmail(crId: number, data: SendVendorEmailRequest): Promise<SendVendorEmailResponse> {
    try {
      const payload: any = { vendor_email: data.vendor_email };
      if (data.custom_email_body) {
        payload.custom_email_body = data.custom_email_body;
      }
      if (data.vendor_company_name) {
        payload.vendor_company_name = data.vendor_company_name;
      }
      if (data.vendor_contact_person) {
        payload.vendor_contact_person = data.vendor_contact_person;
      }
      if (data.vendor_phone) {
        payload.vendor_phone = data.vendor_phone;
      }

      const response = await axios.post<SendVendorEmailResponse>(
        `${API_URL}/buyer/purchase/${crId}/send-vendor-email`,
        payload,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || response.data.message || 'Failed to send email to vendor');
    } catch (error: any) {
      console.error('Error sending vendor email:', error);
      console.error('Response data:', error.response?.data);

      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      if (error.response?.status === 403) {
        throw new Error('You do not have permission to send this email');
      }
      if (error.response?.status === 400) {
        throw new Error(error.response?.data?.error || error.response?.data?.message || 'Invalid request');
      }
      if (error.response?.status === 500) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Server error while sending email. Check backend logs.';
        throw new Error(errorMsg);
      }
      throw new Error(error.response?.data?.error || error.response?.data?.message || 'Failed to send email to vendor');
    }
  }

  // Send email to vendor for SE BOQ assignment
  async sendSeBoqVendorEmail(assignmentId: number, vendorEmail: string): Promise<SendVendorEmailResponse> {
    try {
      const response = await axios.post<SendVendorEmailResponse>(
        `${API_URL}/buyer/se-boq/${assignmentId}/send-vendor-email`,
        { vendor_email: vendorEmail },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to send email to vendor');
    } catch (error: any) {
      console.error('Error sending SE BOQ vendor email:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Assignment not found');
      }
      if (error.response?.status === 403) {
        throw new Error('You do not have permission to send this email');
      }
      throw new Error(error.response?.data?.error || 'Failed to send email to vendor');
    }
  }

  // Upload files for a purchase order
  async uploadFiles(crId: number, files: File[]): Promise<{ success: boolean; uploaded_files: any[]; errors: any[] }> {
    try {
      const formData = new FormData();

      // Append all files to FormData
      files.forEach(file => {
        formData.append('file', file);
      });

      const token = localStorage.getItem('access_token');

      const response = await axios.post(
        `${API_URL}/buyer/upload/${crId}`,
        formData,
        {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            // Don't set Content-Type - axios will set it automatically with boundary
          }
        }
      );

      if (response.data.success !== false) {
        return {
          success: true,
          uploaded_files: response.data.uploaded_files || [],
          errors: response.data.errors || []
        };
      }
      throw new Error(response.data.message || 'Failed to upload files');
    } catch (error: any) {
      console.error('Error uploading files:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || error.response?.data?.message || 'Failed to upload files');
    }
  }
}

export const buyerService = new BuyerService();
