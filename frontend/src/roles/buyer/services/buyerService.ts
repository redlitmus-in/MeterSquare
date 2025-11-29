import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export interface MaterialVendorSelection {
  vendor_id: number;
  vendor_name: string;
  vendor_email?: string;
  vendor_phone?: string;
  vendor_phone_code?: string;
  vendor_contact_person?: string;
  selected_by_user_id: number;
  selected_by_name: string;
  selection_date: string;
  selection_status: 'pending_td_approval' | 'approved' | 'rejected';
  approved_by_td_id?: number | null;
  approved_by_td_name?: string | null;
  approval_date?: string | null;
  rejection_reason?: string | null;
  negotiated_price?: number | null;
  save_price_for_future?: boolean;
}

export interface PurchaseMaterial {
  material_name: string;
  sub_item_name?: string;  // Sub-item/scope name like "Protection"
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  master_material_id?: number | null;  // Null for NEW materials, number for existing BOQ materials
}

// POChild type for tracking vendor-specific purchase order splits
export interface POChild {
  id: number;
  parent_cr_id: number;
  formatted_id: string;  // "PO-100.1", "PO-100.2", etc.
  suffix: string;  // ".1", ".2", etc.
  boq_id?: number | null;
  project_id?: number | null;
  item_id?: string | null;
  item_name?: string | null;
  submission_group_id?: string | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
  vendor_selection_status?: 'pending_td_approval' | 'approved' | 'rejected' | null;
  vendor_selected_by_buyer_id?: number | null;
  vendor_selected_by_buyer_name?: string | null;
  vendor_selection_date?: string | null;
  vendor_approved_by_td_id?: number | null;
  vendor_approved_by_td_name?: string | null;
  vendor_approval_date?: string | null;
  vendor_email_sent?: boolean;
  vendor_email_sent_date?: string | null;
  status: 'pending_td_approval' | 'vendor_approved' | 'purchase_completed' | 'rejected';
  rejection_reason?: string | null;
  purchase_completed_by_user_id?: number | null;
  purchase_completed_by_name?: string | null;
  purchase_completion_date?: string | null;
  materials: Array<{
    material_name: string;
    sub_item_name?: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
    master_material_id?: number | null;
  }>;
  materials_count?: number;
  materials_total_cost?: number;
  created_at?: string;
  updated_at?: string;
  // Extra fields from API with project info
  project_name?: string;
  project_code?: string;
  client?: string;
  location?: string;
  boq_name?: string;
}

export interface Purchase {
  cr_id: number;
  formatted_cr_id?: string;  // "CR-100"
  submission_group_id?: string | null;  // UUID grouping related PO children
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
  vendor_phone_code?: string | null;
  vendor_contact_person?: string | null;
  vendor_email?: string | null;
  vendor_category?: string | null;
  vendor_street_address?: string | null;
  vendor_city?: string | null;
  vendor_state?: string | null;
  vendor_country?: string | null;
  vendor_gst_number?: string | null;
  vendor_selection_pending_td_approval?: boolean;
  vendor_selection_status?: 'pending_td_approval' | 'approved' | 'rejected' | null;
  vendor_selected_by_name?: string | null;
  vendor_email_sent?: boolean;
  po_child_id?: number;  // If this is a POChild record, this is its ID
  use_per_material_vendors?: boolean;
  material_vendor_selections?: Record<string, MaterialVendorSelection>;
  has_store_requests?: boolean;
  store_request_count?: number;
  all_store_requests_approved?: boolean;
  any_store_request_rejected?: boolean;
  store_requests_pending?: boolean;
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
  // POChild records for vendor splits
  po_children?: POChild[];
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
  // For TD vendor selection when multiple vendors are selected
  split_result?: {
    original_cr: string;
    po_children: Array<{
      id: number;
      formatted_id: string;
      vendor_id: number;
      vendor_name: string;
      materials_count: number;
      total_cost: number;
    }>;
  };
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
  include_lpo_pdf?: boolean;
  lpo_data?: LPOData;
  cc_emails?: Array<{ email: string; name: string }>;
}

// LPO PDF Data Types
export interface LPOVendorData {
  company_name: string;
  contact_person: string;
  phone: string;
  fax: string;
  email: string;
  trn: string;
  project: string;
  subject: string;
}

export interface LPOCompanyData {
  name: string;
  contact_person: string;
  division: string;
  phone: string;
  fax: string;
  email: string;
  trn: string;
}

export interface LPOInfo {
  lpo_number: string;
  lpo_date: string;
  quotation_ref: string;
  custom_message?: string;  // Customizable thank you message for PDF
}

export interface LPOItem {
  sl_no: number;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface LPOTotals {
  subtotal: number;
  vat_percent: number;
  vat_amount: number;
  grand_total: number;
}

export interface LPOTerms {
  payment_terms: string;
  completion_terms: string;
  general_terms?: string[];  // Array of general terms and conditions
  payment_terms_list?: string[];  // Array of payment terms like "50% Advance", "40% On Delivery"
}

export interface LPOSignatures {
  md_name: string;
  md_signature: string | null;
  td_name: string;
  td_signature: string | null;
  stamp_image: string | null;
  is_system_signature?: boolean;  // Flag to show "System Generated" text on PDF
}

export interface LPOData {
  vendor: LPOVendorData;
  company: LPOCompanyData;
  lpo_info: LPOInfo;
  items: LPOItem[];
  totals: LPOTotals;
  terms: LPOTerms;
  signatures: LPOSignatures;
  header_image?: string | null;
}

export interface LPOSettings {
  company_name: string;
  company_email: string;
  company_phone: string;
  company_fax: string;
  company_trn: string;
  company_address: string;
  md_name: string;
  md_signature_image: string | null;
  td_name: string;
  td_signature_image: string | null;
  company_stamp_image: string | null;
  default_payment_terms: string;
  lpo_header_image: string | null;
}

export interface LPOSettingsResponse {
  success: boolean;
  settings: LPOSettings;
  error?: string;
}

export interface LPOPreviewResponse {
  success: boolean;
  lpo_data: LPOData;
  cr_id: number;
  error?: string;
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
  // New separated fields
  ongoing_purchases?: Purchase[];
  ongoing_purchases_count?: number;
  ongoing_total_cost?: number;
  pending_approval_purchases?: Purchase[];
  pending_approval_count?: number;
  pending_approval_total_cost?: number;
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

  async getRejectedPurchases(): Promise<PurchaseListResponse> {
    try {
      const response = await axios.get<PurchaseListResponse>(
        `${API_URL}/buyer/rejected-purchases`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error('Failed to fetch rejected purchases');
    } catch (error: any) {
      console.error('Error fetching rejected purchases:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch rejected purchases');
    }
  }

  // Resend rejected change request
  async resendChangeRequest(crId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.put<{ success: boolean; message: string; error?: string }>(
        `${API_URL}/change-request/${crId}/resend`,
        {},
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to resend change request');
    } catch (error: any) {
      console.error('Error resending change request:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Change request not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to resend change request');
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

  // Select vendor for purchase (requires TD approval) - Legacy: single vendor for all materials
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

  // Select vendor for specific material(s) in purchase (NEW - per-material vendor selection)
  async selectVendorForMaterial(
    cr_id: number,
    materialSelections: Array<{ material_name: string; vendor_id: number }>
  ): Promise<SelectVendorResponse> {
    try {
      const response = await axios.post<SelectVendorResponse>(
        `${API_URL}/buyer/purchase/${cr_id}/select-vendor-for-material`,
        { material_selections: materialSelections },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to select vendor for material');
    } catch (error: any) {
      console.error('Error selecting vendor for material:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to select vendor for material');
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

  // Preview vendor email for POChild (vendor-split purchases)
  async previewPOChildVendorEmail(poChildId: number): Promise<PreviewVendorEmailResponse> {
    try {
      const response = await axios.get<PreviewVendorEmailResponse>(
        `${API_URL}/buyer/po-child/${poChildId}/preview-vendor-email`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to preview vendor email');
    } catch (error: any) {
      console.error('Error previewing POChild vendor email:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase order child not found');
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
      // LPO PDF options
      if (data.include_lpo_pdf) {
        payload.include_lpo_pdf = data.include_lpo_pdf;
      }
      if (data.lpo_data) {
        payload.lpo_data = data.lpo_data;
      }
      // CC emails
      if (data.cc_emails && data.cc_emails.length > 0) {
        payload.cc_emails = data.cc_emails;
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

  // Get LPO settings (signatures, company info) for PDF generation
  async getLPOSettings(): Promise<LPOSettingsResponse> {
    try {
      const response = await axios.get<LPOSettingsResponse>(
        `${API_URL}/buyer/lpo-settings`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to get LPO settings');
    } catch (error: any) {
      console.error('Error getting LPO settings:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to get LPO settings');
    }
  }

  // Preview LPO PDF data (get editable data before generation)
  async previewLPOPdf(crId: number): Promise<LPOPreviewResponse> {
    try {
      const response = await axios.post<LPOPreviewResponse>(
        `${API_URL}/buyer/purchase/${crId}/preview-lpo-pdf`,
        {},
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to preview LPO PDF');
    } catch (error: any) {
      console.error('Error previewing LPO PDF:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to preview LPO PDF');
    }
  }

  // Generate LPO PDF (returns blob for download)
  async generateLPOPdf(crId: number, lpoData: LPOData): Promise<Blob> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/purchase/${crId}/generate-lpo-pdf`,
        { lpo_data: lpoData },
        {
          headers: this.getAuthHeaders(),
          responseType: 'blob'
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error generating LPO PDF:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to generate LPO PDF');
    }
  }

  // Save LPO customizations to database for persistence
  async saveLPOCustomization(crId: number, lpoData: LPOData, includeSignatures: boolean = true): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/purchase/${crId}/save-lpo-customization`,
        {
          lpo_info: lpoData.lpo_info,
          terms: lpoData.terms,
          vendor: lpoData.vendor,
          include_signatures: includeSignatures
        },
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error saving LPO customization:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to save LPO customization');
    }
  }

  // Save current LPO customizations as default template (for use in future projects)
  async saveLPODefaultTemplate(lpoData: LPOData, includeSignatures: boolean = true): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/lpo-default-template`,
        {
          lpo_info: lpoData.lpo_info,
          terms: lpoData.terms,
          vendor: lpoData.vendor,
          include_signatures: includeSignatures
        },
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error saving LPO default template:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to save default template');
    }
  }

  // Get user's default LPO template
  async getLPODefaultTemplate(): Promise<{
    success: boolean;
    template: {
      quotation_ref: string;
      custom_message: string;
      subject: string;
      payment_terms: string;
      completion_terms: string;
      general_terms: string[];
      payment_terms_list: string[];
      include_signatures: boolean;
    } | null;
  }> {
    try {
      const response = await axios.get(
        `${API_URL}/buyer/lpo-default-template`,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error getting LPO default template:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      return { success: false, template: null };
    }
  }

  // Send email to vendor for POChild (vendor-split purchases)
  async sendPOChildVendorEmail(poChildId: number, data: SendVendorEmailRequest): Promise<SendVendorEmailResponse> {
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
      // CC emails
      if (data.cc_emails && data.cc_emails.length > 0) {
        payload.cc_emails = data.cc_emails;
      }

      const response = await axios.post<SendVendorEmailResponse>(
        `${API_URL}/buyer/po-child/${poChildId}/send-vendor-email`,
        payload,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || response.data.message || 'Failed to send email to vendor');
    } catch (error: any) {
      console.error('Error sending POChild vendor email:', error);
      console.error('Response data:', error.response?.data);

      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase order child not found');
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

  // Send WhatsApp message to vendor
  async sendVendorWhatsApp(crId: number, vendorPhone: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post<{ success: boolean; message: string }>(
        `${API_URL}/buyer/purchase/${crId}/send-vendor-whatsapp`,
        { vendor_phone: vendorPhone },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.message || 'Failed to send WhatsApp to vendor');
    } catch (error: any) {
      console.error('Error sending vendor WhatsApp:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      if (error.response?.status === 403) {
        throw new Error('You do not have permission to send WhatsApp');
      }
      if (error.response?.status === 400) {
        throw new Error(error.response?.data?.error || 'Invalid request - phone number required');
      }
      throw new Error(error.response?.data?.error || error.response?.data?.message || 'Failed to send WhatsApp to vendor');
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

  // Check store availability for a purchase
  async checkStoreAvailability(crId: number): Promise<StoreAvailabilityResponse> {
    try {
      const response = await axios.get<StoreAvailabilityResponse>(
        `${API_URL}/buyer/purchase/${crId}/check-store-availability`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to check store availability');
    } catch (error: any) {
      console.error('Error checking store availability:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to check store availability');
    }
  }

  // Complete purchase from M2 Store
  async completeFromStore(crId: number, notes?: string): Promise<CompleteFromStoreResponse> {
    try {
      const response = await axios.post<CompleteFromStoreResponse>(
        `${API_URL}/buyer/purchase/${crId}/complete-from-store`,
        { notes: notes || '' },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to complete from store');
    } catch (error: any) {
      console.error('Error completing from store:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      if (error.response?.status === 400) {
        throw new Error(error.response?.data?.error || 'Some materials are not available in store');
      }
      throw new Error(error.response?.data?.error || 'Failed to complete from store');
    }
  }

  // Get optimized vendor selection data (78% smaller payload)
  async getVendorSelectionData(crId: number): Promise<{
    success: boolean;
    cr_id: number;
    boq_id: number;
    project_id: number;
    status: string;
    project_name: string | null;
    boq_name: string | null;
    item_name: string | null;
    item_id: string | null;
    materials: PurchaseMaterial[];
    materials_count: number;
    total_cost: number;
    vendor: {
      selected_vendor_id: number | null;
      selected_vendor_name: string | null;
      vendor_selection_status: string | null;
      vendor_selected_by_buyer_id: number | null;
      vendor_selected_by_buyer_name: string | null;
      vendor_selection_date: string | null;
      vendor_approved_by_td_id: number | null;
      vendor_approved_by_td_name: string | null;
      vendor_approval_date: string | null;
      vendor_rejection_reason: string | null;
      use_per_material_vendors: boolean;
      material_vendor_selections: Record<string, MaterialVendorSelection>;
    };
    overhead_warning: {
      original_allocated: number;
      consumed_before_request: number;
      remaining_after_approval: number;
      percentage_consumed: number;
      is_critical: boolean;
      is_warning: boolean;
    } | null;
    created_at: string;
  }> {
    try {
      const response = await axios.get(
        `${API_URL}/buyer/purchase/${crId}/vendor-selection`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error('Failed to fetch vendor selection data');
    } catch (error: any) {
      console.error('Error fetching vendor selection data:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch vendor selection data');
    }
  }

  // Update vendor product price (for immediate price negotiation)
  async updateVendorPrice(
    vendorId: number,
    materialName: string,
    newPrice: number,
    saveForFuture: boolean,
    crId?: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/vendor/${vendorId}/update-price`,
        {
          material_name: materialName,
          new_price: newPrice,
          save_for_future: saveForFuture,
          cr_id: crId  // Include cr_id to save negotiated price to the purchase
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to update vendor price');
    } catch (error: any) {
      console.error('Error updating vendor price:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Vendor or product not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to update vendor price');
    }
  }

  // Create POChild records for each vendor group
  async createPOChildren(
    crId: number,
    vendorGroups: Array<{
      vendor_id: number;
      vendor_name: string;
      materials: Array<{
        material_name: string;
        quantity: number;
        unit: string;
        negotiated_price?: number | null;
        save_price_for_future?: boolean;
      }>;
    }>,
    submissionGroupId: string
  ): Promise<{
    success: boolean;
    message: string;
    parent_cr_id: number;
    submission_group_id: string;
    po_children: Array<{
      id: number;
      formatted_id: string;
      vendor_id: number;
      vendor_name: string;
      materials_count: number;
      total_cost: number;
    }>;
  }> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/purchase/${crId}/create-po-children`,
        {
          vendor_groups: vendorGroups,
          submission_group_id: submissionGroupId
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to create PO children');
    } catch (error: any) {
      console.error('Error creating PO children:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('Purchase not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to create separate purchase orders');
    }
  }

  // Get pending POChild records (for TD approval)
  async getPendingPOChildren(): Promise<{
    success: boolean;
    pending_count: number;
    po_children: POChild[];
  }> {
    try {
      const response = await axios.get(
        `${API_URL}/buyer/po-children/pending`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to fetch pending PO children');
    } catch (error: any) {
      console.error('Error fetching pending PO children:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch pending PO children');
    }
  }

  // Get buyer's POChild records pending TD approval
  async getBuyerPendingPOChildren(): Promise<{
    success: boolean;
    pending_count: number;
    po_children: POChild[];
  }> {
    try {
      const response = await axios.get(
        `${API_URL}/buyer/po-children/buyer-pending`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to fetch pending PO children');
    } catch (error: any) {
      console.error('Error fetching buyer pending PO children:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch pending PO children');
    }
  }

  // Get approved POChild records (for buyer to complete purchase)
  async getApprovedPOChildren(): Promise<{
    success: boolean;
    approved_count: number;
    po_children: POChild[];
  }> {
    try {
      const response = await axios.get(
        `${API_URL}/buyer/po-children/approved`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to fetch approved PO children');
    } catch (error: any) {
      console.error('Error fetching approved PO children:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch approved PO children');
    }
  }

  // TD approves POChild vendor selection
  async tdApprovePOChild(poChildId: number): Promise<{
    success: boolean;
    message: string;
    po_child: POChild;
  }> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/po-child/${poChildId}/td-approve`,
        {},
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to approve vendor selection');
    } catch (error: any) {
      console.error('Error approving PO child vendor:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('PO child not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to approve vendor selection');
    }
  }

  // TD rejects POChild vendor selection
  async tdRejectPOChild(poChildId: number, reason: string): Promise<{
    success: boolean;
    message: string;
    po_child: POChild;
  }> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/po-child/${poChildId}/td-reject`,
        { reason },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to reject vendor selection');
    } catch (error: any) {
      console.error('Error rejecting PO child vendor:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('PO child not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to reject vendor selection');
    }
  }

  // Complete POChild purchase
  async completePOChildPurchase(poChildId: number, notes?: string): Promise<{
    success: boolean;
    message: string;
    po_child: POChild;
    all_po_children_completed: boolean;
  }> {
    try {
      const response = await axios.post(
        `${API_URL}/buyer/po-child/${poChildId}/complete`,
        { notes: notes || '' },
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error(response.data.error || 'Failed to complete purchase');
    } catch (error: any) {
      console.error('Error completing PO child purchase:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 404) {
        throw new Error('PO child not found');
      }
      throw new Error(error.response?.data?.error || 'Failed to complete purchase');
    }
  }
}

export interface StoreAvailabilityMaterial {
  material_name: string;
  required_quantity: number;
  available_quantity: number;
  is_available: boolean;
  inventory_material_id?: number;
}

export interface StoreAvailabilityResponse {
  success: boolean;
  cr_id: number;
  all_available_in_store: boolean;
  can_complete_from_store: boolean;
  available_materials: StoreAvailabilityMaterial[];
  unavailable_materials: StoreAvailabilityMaterial[];
  error?: string;
}

export interface CompleteFromStoreResponse {
  success: boolean;
  message: string;
  cr_id?: number;
  requests_created?: number;
  error?: string;
}

export const buyerService = new BuyerService();
