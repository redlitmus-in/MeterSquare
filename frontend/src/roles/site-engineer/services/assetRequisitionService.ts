/**
 * Asset Requisition Service
 * API functions for SE asset requests with PM and Production Manager approval workflow
 */

import { apiClient } from '@/api/config';

// ==================== TYPES ====================

export type RequisitionStatus =
  | 'draft'
  | 'pending_pm'
  | 'pm_approved'
  | 'pm_rejected'
  | 'pending_prod_mgr'
  | 'prod_mgr_approved'
  | 'prod_mgr_rejected'
  | 'dispatched'
  | 'completed'
  | 'cancelled';

export type Urgency = 'urgent' | 'high' | 'normal' | 'low';

// Item in a requisition (for multi-item support)
export interface RequisitionItemData {
  category_id: number;
  category_code?: string;
  category_name?: string;
  quantity: number;
  asset_item_id?: number;
  item_code?: string;
  serial_number?: string;
}

export interface AssetRequisition {
  requisition_id: number;
  requisition_code: string;
  project_id: number;
  project_name?: string;
  project_code?: string;
  // Multi-item support
  items?: RequisitionItemData[];
  total_items?: number;
  total_quantity?: number;
  // Legacy single-item fields (backward compatibility)
  category_id?: number;
  category_code?: string;
  category_name?: string;
  tracking_mode?: 'individual' | 'quantity';
  asset_item_id?: number;
  item_code?: string;
  serial_number?: string;
  quantity?: number;
  required_date: string;
  urgency: Urgency;
  purpose: string;
  site_location?: string;
  status: RequisitionStatus;
  approval_required_from?: string;
  // Requester info
  requested_by_user_id: number;
  requested_by_name: string;
  requested_at: string;
  // PM approval
  pm_reviewed_by_user_id?: number;
  pm_reviewed_by_name?: string;
  pm_reviewed_at?: string;
  pm_notes?: string;
  pm_decision?: string;
  pm_rejection_reason?: string;
  // Production Manager approval
  prod_mgr_reviewed_by_user_id?: number;
  prod_mgr_reviewed_by_name?: string;
  prod_mgr_reviewed_at?: string;
  prod_mgr_notes?: string;
  prod_mgr_decision?: string;
  prod_mgr_rejection_reason?: string;
  // Dispatch info
  dispatched_by_user_id?: number;
  dispatched_by_name?: string;
  dispatched_at?: string;
  dispatch_notes?: string;
  adn_id?: number;
  adn_number?: string;
  // Receipt info
  received_by_user_id?: number;
  received_by_name?: string;
  received_at?: string;
  receipt_notes?: string;
  // Audit
  created_at: string;
  created_by: string;
  last_modified_at?: string;
  last_modified_by?: string;
}

// Item payload for creating multi-item requisition
export interface CreateRequisitionItemPayload {
  category_id: number;
  quantity: number;
  asset_item_id?: number;
}

export interface CreateRequisitionPayload {
  project_id: number;
  // Multi-item support: array of items
  items?: CreateRequisitionItemPayload[];
  // Legacy single-item support (backward compatible)
  category_id?: number;
  asset_item_id?: number;
  quantity?: number;
  required_date: string; // YYYY-MM-DD format
  urgency?: Urgency;
  purpose: string;
  site_location?: string;
}

export interface ApprovalPayload {
  notes?: string;
}

export interface RejectionPayload {
  rejection_reason: string;
  notes?: string;
}

export interface DispatchPayload {
  notes?: string;
  adn_id?: number;
}

export interface ReceiptPayload {
  notes?: string;
}

// ==================== SE FUNCTIONS ====================

/**
 * SE: Create a new asset requisition
 */
export const createAssetRequisition = async (
  data: CreateRequisitionPayload
): Promise<AssetRequisition> => {
  const response = await apiClient.post('/assets/requisitions', data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * SE: Get my requisitions with optional filters
 */
export const getMyRequisitions = async (params?: {
  status?: RequisitionStatus | 'all';
  project_id?: number;
}): Promise<AssetRequisition[]> => {
  const response = await apiClient.get('/assets/requisitions/my-requests', { params });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * SE: Confirm receipt of dispatched asset
 */
export const confirmRequisitionReceipt = async (
  reqId: number,
  payload?: ReceiptPayload
): Promise<AssetRequisition> => {
  const response = await apiClient.put(
    `/assets/requisitions/${reqId}/confirm-receipt`,
    payload || {}
  );
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * SE: Cancel a requisition (before dispatch)
 */
export const cancelRequisition = async (reqId: number): Promise<AssetRequisition> => {
  const response = await apiClient.put(`/assets/requisitions/${reqId}/cancel`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * SE: Send draft or rejected requisition to PM for approval
 */
export const sendToPM = async (reqId: number): Promise<AssetRequisition> => {
  const response = await apiClient.put(`/assets/requisitions/${reqId}/send-to-pm`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * SE: Update a draft or rejected requisition
 */
export const updateRequisition = async (
  reqId: number,
  data: Partial<CreateRequisitionPayload>
): Promise<AssetRequisition> => {
  const response = await apiClient.put(`/assets/requisitions/${reqId}`, data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// ==================== PM FUNCTIONS ====================

/**
 * PM: Get pending requisitions for approval
 */
export const getPMPendingRequisitions = async (params?: {
  status?: 'pending' | 'all';
}): Promise<AssetRequisition[]> => {
  const response = await apiClient.get('/assets/requisitions/pm/pending', { params });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * PM: Approve a requisition (routes to Production Manager)
 */
export const pmApproveRequisition = async (
  reqId: number,
  payload?: ApprovalPayload
): Promise<AssetRequisition> => {
  const response = await apiClient.put(
    `/assets/requisitions/${reqId}/pm/approve`,
    payload || {}
  );
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * PM: Reject a requisition
 */
export const pmRejectRequisition = async (
  reqId: number,
  payload: RejectionPayload
): Promise<AssetRequisition> => {
  const response = await apiClient.put(`/assets/requisitions/${reqId}/pm/reject`, payload);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// ==================== PRODUCTION MANAGER FUNCTIONS ====================

/**
 * Production Manager: Get pending requisitions for approval
 */
export const getProdMgrPendingRequisitions = async (params?: {
  status?: 'pending' | 'ready_dispatch' | 'all';
}): Promise<AssetRequisition[]> => {
  const response = await apiClient.get('/assets/requisitions/prod-mgr/pending', { params });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * Production Manager: Approve a requisition (ready for dispatch)
 */
export const prodMgrApproveRequisition = async (
  reqId: number,
  payload?: ApprovalPayload
): Promise<AssetRequisition> => {
  const response = await apiClient.put(
    `/assets/requisitions/${reqId}/prod-mgr/approve`,
    payload || {}
  );
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * Production Manager: Reject a requisition
 */
export const prodMgrRejectRequisition = async (
  reqId: number,
  payload: RejectionPayload
): Promise<AssetRequisition> => {
  const response = await apiClient.put(`/assets/requisitions/${reqId}/prod-mgr/reject`, payload);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * Production Manager: Get requisitions ready for dispatch
 */
export const getReadyForDispatch = async (): Promise<AssetRequisition[]> => {
  const response = await apiClient.get('/assets/requisitions/ready-dispatch');
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * Production Manager: Dispatch an approved requisition
 */
export const dispatchRequisition = async (
  reqId: number,
  payload?: DispatchPayload
): Promise<AssetRequisition> => {
  const response = await apiClient.put(`/assets/requisitions/${reqId}/dispatch`, payload || {});
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// ==================== GENERAL FUNCTIONS ====================

/**
 * Get a single requisition by ID
 */
export const getRequisitionById = async (reqId: number): Promise<AssetRequisition> => {
  const response = await apiClient.get(`/assets/requisitions/${reqId}`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

/**
 * Get all requisitions with filters (admin/dashboard view)
 */
export const getAllRequisitions = async (params?: {
  status?: RequisitionStatus | 'all';
  project_id?: number;
  category_id?: number;
  urgency?: Urgency | 'all';
  page?: number;
  per_page?: number;
}): Promise<{
  data: AssetRequisition[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}> => {
  const response = await apiClient.get('/assets/requisitions', { params });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data;
};

// ==================== HELPER FUNCTIONS ====================

export const STATUS_LABELS: Record<RequisitionStatus, string> = {
  draft: 'Draft',
  pending_pm: 'Pending PM Approval',
  pm_approved: 'PM Approved',
  pm_rejected: 'PM Rejected',
  pending_prod_mgr: 'Pending Store Approval',
  prod_mgr_approved: 'Ready for Dispatch',
  prod_mgr_rejected: 'Store Rejected',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

export const STATUS_COLORS: Record<RequisitionStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_pm: 'bg-yellow-100 text-yellow-700',
  pm_approved: 'bg-blue-100 text-blue-700',
  pm_rejected: 'bg-red-100 text-red-700',
  pending_prod_mgr: 'bg-orange-100 text-orange-700',
  prod_mgr_approved: 'bg-green-100 text-green-700',
  prod_mgr_rejected: 'bg-red-100 text-red-700',
  dispatched: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-700'
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low'
};

export const URGENCY_COLORS: Record<Urgency, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-700'
};

/**
 * Get display-friendly status label
 */
export const getStatusLabel = (status: RequisitionStatus): string => {
  return STATUS_LABELS[status] || status;
};

/**
 * Get total quantity from requisition (handles both multi-item and legacy single-item)
 */
export const getTotalQuantity = (req: AssetRequisition): number => {
  if (req.total_quantity) return req.total_quantity;
  if (req.items && req.items.length > 0) {
    return req.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  }
  return req.quantity ?? 0;
};

/**
 * Get total items count from requisition (handles both multi-item and legacy single-item)
 */
export const getTotalItems = (req: AssetRequisition): number => {
  if (req.total_items) return req.total_items;
  if (req.items && req.items.length > 0) return req.items.length;
  return req.category_id ? 1 : 0;
};

/**
 * Get status badge color classes
 */
export const getStatusColor = (status: RequisitionStatus): string => {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-700';
};

/**
 * Get urgency badge color classes
 */
export const getUrgencyColor = (urgency: Urgency): string => {
  return URGENCY_COLORS[urgency] || 'bg-gray-100 text-gray-700';
};

/**
 * Check if a requisition can be cancelled
 */
export const canCancelRequisition = (
  requisition: AssetRequisition,
  currentUserId: number
): boolean => {
  const cancelableStatuses: RequisitionStatus[] = [
    'draft',
    'pending_pm',
    'pm_approved',
    'pending_prod_mgr',
    'prod_mgr_approved'
  ];
  return (
    requisition.requested_by_user_id === currentUserId &&
    cancelableStatuses.includes(requisition.status)
  );
};

/**
 * Check if a requisition can have receipt confirmed
 */
export const canConfirmReceipt = (
  requisition: AssetRequisition,
  currentUserId: number
): boolean => {
  return (
    requisition.status === 'dispatched' &&
    requisition.requested_by_user_id === currentUserId
  );
};

/**
 * Check if a requisition can be sent to PM
 */
export const canSendToPM = (
  requisition: AssetRequisition,
  currentUserId: number
): boolean => {
  const sendableStatuses: RequisitionStatus[] = ['draft', 'pm_rejected'];
  return (
    requisition.requested_by_user_id === currentUserId &&
    sendableStatuses.includes(requisition.status)
  );
};

/**
 * Check if a requisition can be edited
 */
export const canEditRequisition = (
  requisition: AssetRequisition,
  currentUserId: number
): boolean => {
  const editableStatuses: RequisitionStatus[] = ['draft', 'pm_rejected'];
  return (
    requisition.requested_by_user_id === currentUserId &&
    editableStatuses.includes(requisition.status)
  );
};
