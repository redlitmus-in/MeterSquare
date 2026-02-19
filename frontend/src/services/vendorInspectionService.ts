import { apiClient } from '@/api/config';
import { AxiosError } from 'axios';

// ============================================================================
// Interfaces
// ============================================================================

export interface MaterialInspectionItem {
  material_name: string;
  brand?: string;
  size?: string;
  unit: string;
  ordered_qty: number;
  unit_price?: number;
  accepted_qty: number;
  rejected_qty: number;
  rejection_category?: string;
  rejection_notes?: string;
  photo_urls?: string[];
}

export interface EvidenceFile {
  url: string;
  file_name: string;
  file_type: string;
  uploaded_at?: string;
}

export interface VendorDeliveryInspection {
  id: number;
  cr_id: number;
  po_child_id?: number;
  imr_id?: number;
  vendor_id?: number;
  inspection_status: 'pending' | 'fully_approved' | 'partially_approved' | 'fully_rejected';
  inspected_by_user_id: number;
  inspected_by_name: string;
  inspected_at?: string;
  materials_inspection: MaterialInspectionItem[];
  overall_notes?: string;
  overall_rejection_category?: string;
  evidence_urls?: EvidenceFile[];
  iteration_number: number;
  parent_inspection_id?: number;
  created_at?: string;
  vendor_name?: string;
  formatted_cr_id?: string;
  project_id?: number;
  formatted_po_id?: string;
  stock_in_completed?: boolean;
  stock_in_completed_at?: string;
  stock_in_completed_by?: number;
  accepted_materials?: AcceptedMaterialForStockIn[];
  has_return_request?: boolean;
  return_request_id?: number;
  return_request_status?: string;
}

export interface VendorReturnRequest {
  id: number;
  inspection_id: number;
  cr_id: number;
  po_child_id?: number;
  vendor_id: number;
  vendor_name: string;
  return_request_number: string;
  resolution_type: 'refund' | 'replacement' | 'new_vendor';
  status: string;
  rejected_materials: MaterialInspectionItem[];
  total_rejected_value: number;
  sla_deadline?: string;
  sla_notes?: string;
  created_by_buyer_id: number;
  created_by_buyer_name?: string;
  buyer_notes?: string;
  td_approved_by_id?: number;
  td_approved_by_name?: string;
  td_approval_date?: string;
  td_rejection_reason?: string;
  return_initiated_at?: string;
  return_confirmed_at?: string;
  vendor_return_reference?: string;
  credit_note_number?: string;
  credit_note_amount?: number;
  credit_note_date?: string;
  lpo_adjustment_amount?: number;
  refund_evidence?: Array<{ url: string; file_name: string; file_type: string }>;
  new_vendor_id?: number;
  new_vendor_name?: string;
  new_vendor_status?: string;
  new_vendor_details?: {
    vendor_id: number;
    company_name: string;
    contact_person_name?: string;
    email?: string;
    phone_code?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
    category?: string;
    gst_number?: string;
    status?: string;
  };
  new_lpo_id?: number;
  replacement_expected_date?: string;
  replacement_inspection_id?: number;
  replacement_imr_id?: number;
  created_at?: string;
  has_return_request?: boolean;
  return_request_id?: number;
  return_request_status?: string;
  inspection_evidence?: EvidenceFile[];
  inspection_notes?: string;
  inspection_category?: string;
}

export interface StockInDetails {
  actual_unit_prices?: Record<string, number>;  // material_name → actual purchase price
  driver_name?: string;
  vehicle_number?: string;
  per_unit_transport_fee?: number;
  driver_contact?: string;
  reference_number?: string;
  delivery_note_url?: string;
  delivery_batch_ref?: string;
}

export interface SubmitInspectionData {
  decision: 'fully_approved' | 'partially_approved' | 'fully_rejected';
  materials_inspection: MaterialInspectionItem[];
  overall_notes?: string;
  overall_rejection_category?: string;
  evidence_urls?: EvidenceFile[];
  stock_in_details?: StockInDetails;
}

export interface AcceptedMaterialForStockIn {
  material_name: string;
  brand?: string;
  size?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  driver_name?: string;
  vehicle_number?: string;
  reference_number?: string;
  per_unit_transport_fee?: number;
}

export interface SubmitInspectionResponse {
  success: boolean;
  message?: string;
  data?: {
    inspection_id: number;
    inspection_status: string;
    accepted_materials_count: number;
    rejected_materials_count: number;
    accepted_materials: AcceptedMaterialForStockIn[];
  };
}

export interface RejectedMaterialItem {
  material_name: string;
  brand?: string;
  size?: string;
  unit?: string;
  rejected_qty: number;
  unit_price?: number;
  rejection_category?: string;
}

export interface CreateReturnRequestData {
  inspection_id: number;
  resolution_type: 'refund' | 'replacement' | 'new_vendor';
  rejected_materials: RejectedMaterialItem[];
  sla_deadline?: string;
  sla_notes?: string;
  buyer_notes?: string;
  new_vendor_id?: number;
}

export interface InspectionTimelineEvent {
  type: 'inspection' | 'return_request' | 'return_request_td' | 'return_initiated' | 'return_completed' | 'iteration';
  id: number;
  status: string;
  timestamp: string;
  actor?: string;
  details: string;
  data: VendorDeliveryInspection | VendorReturnRequest | Record<string, unknown>;
}

export interface HeldMaterialItem {
  inspection_id: number;
  cr_id: number;
  vendor_name?: string;
  material_name: string;
  brand?: string;
  size?: string;
  unit?: string;
  rejected_qty: number;
  rejection_category?: string;
  rejection_notes?: string;
  inspected_at?: string;
  has_return_request: boolean;
  return_status?: string;
}

export interface InspectionTimelineResponse {
  success: boolean;
  data: {
    cr_id: number;
    formatted_cr_id: string | null;
    inspection_status: string | null;
    timeline: InspectionTimelineEvent[];
    summary: {
      total_inspections: number;
      total_return_requests: number;
      total_iterations: number;
    };
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ============================================================================
// Helper: extract a user-friendly error message from AxiosError
// ============================================================================

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const serverMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.response?.data?.msg;
    if (serverMessage) return serverMessage;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

// ============================================================================
// Service
// ============================================================================

class VendorInspectionService {
  // --------------------------------------------------------------------------
  // PM Endpoints
  // --------------------------------------------------------------------------

  /**
   * Get deliveries pending inspection by the Production Manager.
   * GET /api/inventory/pending-inspections
   */
  async getPendingInspections(
    page?: number,
    perPage?: number,
    search?: string,
  ): Promise<PaginatedResponse<VendorDeliveryInspection>> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;
      if (search) params.search = search;

      const response = await apiClient.get('/inventory/pending-inspections', { params });
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch pending inspections'));
    }
  }

  /**
   * Get inspection details for a specific IMR.
   * GET /api/inventory/inspection/:imrId
   */
  async getInspectionDetails(imrId: number): Promise<VendorDeliveryInspection> {
    try {
      const response = await apiClient.get(`/inventory/inspection/${imrId}`);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch inspection details'));
    }
  }

  /**
   * Submit an inspection decision for a delivery.
   * POST /api/inventory/inspection/:imrId/submit
   */
  async submitInspection(
    imrId: number,
    data: SubmitInspectionData,
  ): Promise<SubmitInspectionResponse> {
    try {
      const response = await apiClient.post(`/inventory/inspection/${imrId}/submit`, data);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to submit inspection'));
    }
  }

  /**
   * Get historical inspections with optional filters.
   * GET /api/inventory/inspections/history
   */
  async getInspectionHistory(
    page?: number,
    perPage?: number,
    status?: string,
    search?: string,
  ): Promise<PaginatedResponse<VendorDeliveryInspection>> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;
      if (status) params.status = status;
      if (search) params.search = search;

      const response = await apiClient.get('/inventory/inspections/history', { params });
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch inspection history'));
    }
  }

  /**
   * Get a single inspection record by its ID.
   * GET /api/inventory/inspections/:inspectionId
   */
  async getInspectionById(inspectionId: number): Promise<VendorDeliveryInspection> {
    try {
      const response = await apiClient.get(`/inventory/inspections/${inspectionId}`);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch inspection'));
    }
  }

  /**
   * Upload photographic evidence for an inspection.
   * POST /api/inventory/inspection/upload-evidence (multipart/form-data)
   */
  async uploadInspectionEvidence(
    file: File,
    crId: number,
  ): Promise<{ success: boolean; url: string; file_name: string; file_type: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('cr_id', String(crId));

      const response = await apiClient.post(
        '/inventory/inspection/upload-evidence',
        formData,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to upload inspection evidence'));
    }
  }

  /**
   * Get materials currently held (partially rejected, pending return resolution).
   * GET /api/inventory/held-materials
   */
  async getHeldMaterials(
    page?: number,
    perPage?: number,
  ): Promise<{ success: boolean; data: HeldMaterialItem[]; total_inspections: number; materials_on_page: number; page: number; per_page: number }> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;

      const response = await apiClient.get('/inventory/held-materials', { params });
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch held materials'));
    }
  }

  /**
   * Get inspections that are approved but PM hasn't completed stock-in yet.
   * GET /api/inventory/inspections/pending-stockin
   */
  async getPendingStockInInspections(
    page?: number,
    perPage?: number,
  ): Promise<PaginatedResponse<VendorDeliveryInspection>> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;

      const response = await apiClient.get('/inventory/inspections/pending-stockin', { params });
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch pending stock-in inspections'));
    }
  }

  /**
   * Mark an inspection's stock-in as completed.
   * POST /api/inventory/inspection/:inspectionId/complete-stockin
   */
  async completeInspectionStockIn(
    inspectionId: number,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(`/inventory/inspection/${inspectionId}/complete-stockin`);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to complete inspection stock-in'));
    }
  }

  // --------------------------------------------------------------------------
  // Buyer Endpoints
  // --------------------------------------------------------------------------

  /**
   * Get deliveries rejected during inspection that need buyer action.
   * GET /api/buyer/rejected-deliveries
   */
  async getRejectedDeliveries(
    page?: number,
    perPage?: number,
  ): Promise<PaginatedResponse<VendorDeliveryInspection>> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;

      const response = await apiClient.get('/buyer/rejected-deliveries', { params });
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch rejected deliveries'));
    }
  }

  /**
   * Create a return request for rejected materials.
   * POST /api/buyer/return-request
   */
  async createReturnRequest(
    data: CreateReturnRequestData,
  ): Promise<{ success: boolean; data?: VendorReturnRequest; message?: string }> {
    try {
      const response = await apiClient.post('/buyer/return-request', data);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to create return request'));
    }
  }

  /**
   * Get all return requests for the current buyer.
   * GET /api/buyer/return-requests
   */
  async getReturnRequests(
    page?: number,
    perPage?: number,
    status?: string,
  ): Promise<PaginatedResponse<VendorReturnRequest>> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;
      if (status) params.status = status;

      const response = await apiClient.get('/buyer/return-requests', { params });
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch return requests'));
    }
  }

  /**
   * Get a single return request by ID.
   * GET /api/buyer/return-request/:id
   */
  async getReturnRequestById(id: number): Promise<{ success: boolean; data: VendorReturnRequest }> {
    try {
      const response = await apiClient.get(`/buyer/return-request/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch return request'));
    }
  }

  /**
   * Update an existing return request (before TD approval).
   * PUT /api/buyer/return-request/:id
   */
  async updateReturnRequest(
    id: number,
    data: Partial<CreateReturnRequestData>,
  ): Promise<{ success: boolean; data?: VendorReturnRequest; message?: string }> {
    try {
      const response = await apiClient.put(`/buyer/return-request/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to update return request'));
    }
  }

  /**
   * Initiate the physical return of rejected materials to the vendor.
   * POST /api/buyer/return-request/:id/initiate-return
   */
  async initiateVendorReturn(
    id: number,
    data?: { vendor_return_reference?: string },
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(
        `/buyer/return-request/${id}/initiate-return`,
        data ?? {},
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to initiate vendor return'));
    }
  }

  /**
   * Upload proof document for return request (credit note, receipt, photo).
   * POST /api/buyer/return-request/upload-evidence (multipart/form-data)
   */
  async uploadReturnEvidence(
    file: File,
    returnRequestId: number,
  ): Promise<{ success: boolean; data?: { url: string; file_name: string; file_type: string } }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('return_request_id', String(returnRequestId));

      const response = await apiClient.post(
        '/buyer/return-request/upload-evidence',
        formData,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to upload evidence'));
    }
  }

  /**
   * Confirm that a refund / credit note has been received from the vendor.
   * POST /api/buyer/return-request/:id/confirm-refund
   */
  async confirmRefundReceived(
    id: number,
    data: {
      credit_note_number?: string;
      credit_note_amount?: number;
      refund_evidence?: Array<{ url: string; file_name: string; file_type: string }>;
    },
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(
        `/buyer/return-request/${id}/confirm-refund`,
        data,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to confirm refund'));
    }
  }

  /**
   * Confirm that replacement materials have been received from the vendor.
   * POST /api/buyer/return-request/:id/confirm-replacement
   */
  async confirmReplacementReceived(
    id: number,
    data: {
      vendor_return_reference?: string;
      replacement_evidence?: Array<{ url: string; file_name: string; file_type: string }>;
    },
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(
        `/buyer/return-request/${id}/confirm-replacement`,
        data,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to confirm replacement'));
    }
  }

  /**
   * Select a new vendor for replacement (when resolution_type is 'new_vendor').
   * POST /api/buyer/return-request/:id/select-new-vendor
   */
  async selectNewVendor(
    id: number,
    vendorId: number,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(
        `/buyer/return-request/${id}/select-new-vendor`,
        { vendor_id: vendorId },
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to select new vendor'));
    }
  }

  // --------------------------------------------------------------------------
  // TD (Technical Director) Endpoints
  // --------------------------------------------------------------------------

  /**
   * Get return requests pending TD approval.
   * GET /api/technical-director/pending-return-approvals
   */
  async getPendingReturnApprovals(
    page?: number,
    perPage?: number,
  ): Promise<PaginatedResponse<VendorReturnRequest>> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;

      const response = await apiClient.get(
        '/technical-director/pending-return-approvals',
        { params },
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch pending return approvals'));
    }
  }

  /**
   * Get ALL return requests for TD (all statuses) — for history/overview.
   * GET /api/technical-director/all-return-requests
   */
  async getAllTdReturnRequests(
    page?: number,
    perPage?: number,
    status?: string,
  ): Promise<PaginatedResponse<VendorReturnRequest>> {
    try {
      const params: Record<string, string | number> = {};
      if (page !== undefined) params.page = page;
      if (perPage !== undefined) params.per_page = perPage;
      if (status) params.status = status;

      const response = await apiClient.get(
        '/technical-director/all-return-requests',
        { params },
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch return requests'));
    }
  }

  /**
   * TD approves a return request.
   * POST /api/technical-director/return-request/:id/approve
   */
  async tdApproveReturn(
    id: number,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(
        `/technical-director/return-request/${id}/approve`,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to approve return request'));
    }
  }

  /**
   * TD rejects a return request.
   * POST /api/technical-director/return-request/:id/reject
   */
  async tdRejectReturn(
    id: number,
    reason: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(
        `/technical-director/return-request/${id}/reject`,
        { reason },
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to reject return request'));
    }
  }

  /**
   * TD approves a new vendor selected by the buyer for replacement.
   * POST /api/technical-director/return-request/:id/approve-new-vendor
   */
  async tdApproveNewVendor(
    id: number,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(
        `/technical-director/return-request/${id}/approve-new-vendor`,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to approve new vendor'));
    }
  }

  // --------------------------------------------------------------------------
  // Timeline
  // --------------------------------------------------------------------------

  /**
   * Get the full inspection/return timeline for a change request.
   * GET /api/inventory/inspection-timeline/:crId
   */
  async getInspectionTimeline(
    crId: number,
  ): Promise<InspectionTimelineResponse> {
    try {
      const response = await apiClient.get(`/inventory/inspection-timeline/${crId}`);
      return response.data;
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Failed to fetch inspection timeline'));
    }
  }
}

export const vendorInspectionService = new VendorInspectionService();
