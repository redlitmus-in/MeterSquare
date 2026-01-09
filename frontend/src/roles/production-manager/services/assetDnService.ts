/**
 * Asset Delivery Note (ADN) and Return Delivery Note (ARDN) Service
 * API service for the proper DN/RDN flow for returnable assets.
 */

import { apiClient } from '@/api/config';

// ============================================================================
// TYPES
// ============================================================================

export type AssetCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged';
export type ADNStatus = 'DRAFT' | 'ISSUED' | 'IN_TRANSIT' | 'DELIVERED' | 'PARTIAL' | 'CANCELLED';
export type ARDNStatus = 'DRAFT' | 'ISSUED' | 'IN_TRANSIT' | 'RECEIVED' | 'PROCESSED' | 'CANCELLED';
export type ReportedCondition = 'ok' | 'damaged' | 'lost' | 'needs_repair';
export type ActionTaken = 'return_to_stock' | 'send_to_repair' | 'dispose' | 'pending_disposal' | 'write_off';

export interface AssetCategory {
  category_id: number;
  category_code: string;
  category_name: string;
  description?: string;
  tracking_mode: 'individual' | 'quantity';
  total_quantity: number;
  available_quantity: number;
  unit_price: number;
  image_url?: string;
  is_active: boolean;
}

export interface AssetItem {
  item_id: number;
  category_id: number;
  item_code: string;
  serial_number?: string;
  current_condition: AssetCondition;
  current_status: 'available' | 'dispatched' | 'maintenance' | 'retired';
  current_project_id?: number;
  category_code?: string;
  category_name?: string;
}

export interface StockIn {
  stock_in_id: number;
  stock_in_number: string;
  category_id: number;
  quantity: number;
  purchase_date?: string;
  vendor_name?: string;
  vendor_id?: number;
  invoice_number?: string;
  unit_cost: number;
  total_cost: number;
  condition: string;
  notes?: string;
  document_url?: string;
  created_at: string;
  created_by: string;
  category_code?: string;
  category_name?: string;
  tracking_mode?: string;
  items?: StockInItem[];
}

export interface StockInItem {
  stock_in_item_id: number;
  stock_in_id: number;
  asset_item_id?: number;
  serial_number?: string;
  condition: string;
  notes?: string;
  item_code?: string;
}

export interface ADNItem {
  item_id: number;
  adn_id: number;
  category_id: number;
  asset_item_id?: number;
  quantity: number;
  condition_at_dispatch: AssetCondition;
  notes?: string;
  quantity_returned: number;
  status: 'dispatched' | 'partial_return' | 'fully_returned';
  category_code?: string;
  category_name?: string;
  tracking_mode?: string;
  item_code?: string;
  serial_number?: string;
  // Item-level receipt tracking
  is_received?: boolean;
  received_at?: string;
  received_by?: string;
  received_by_id?: number;
}

export interface AssetDeliveryNote {
  adn_id: number;
  adn_number: string;
  project_id: number;
  project_name?: string;
  site_location?: string;
  delivery_date: string;
  attention_to?: string;
  attention_to_id?: number;
  delivery_from: string;
  prepared_by: string;
  prepared_by_id?: number;
  checked_by?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  status: ADNStatus;
  notes?: string;
  requisition_id?: number;
  requisition_code?: string;
  received_by?: string;
  received_by_id?: number;
  received_at?: string;
  receiver_notes?: string;
  created_at: string;
  created_by: string;
  dispatched_at?: string;
  dispatched_by?: string;
  items: ADNItem[];
  total_items: number;
}

export interface ARDNItem {
  return_item_id: number;
  ardn_id: number;
  category_id: number;
  asset_item_id?: number;
  original_adn_item_id?: number;
  quantity: number;
  reported_condition: ReportedCondition;
  damage_description?: string;
  photo_url?: string;
  return_notes?: string;
  verified_condition?: ReportedCondition;
  pm_notes?: string;
  action_taken?: ActionTaken;
  quantity_accepted?: number;
  acceptance_status?: string;
  maintenance_id?: number;
  category_code?: string;
  category_name?: string;
  tracking_mode?: string;
  item_code?: string;
  serial_number?: string;
}

export interface AssetReturnDeliveryNote {
  ardn_id: number;
  ardn_number: string;
  project_id: number;
  project_name?: string;
  site_location?: string;
  return_date: string;
  original_adn_id?: number;
  original_adn_number?: string;
  returned_by: string;
  returned_by_id?: number;
  return_to: string;
  prepared_by: string;
  prepared_by_id?: number;
  checked_by?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  status: ARDNStatus;
  return_reason?: string;
  notes?: string;
  accepted_by?: string;
  accepted_by_id?: number;
  accepted_at?: string;
  acceptance_notes?: string;
  processed_by?: string;
  processed_by_id?: number;
  processed_at?: string;
  created_at: string;
  created_by: string;
  dispatched_at?: string;
  dispatched_by?: string;
  items: ARDNItem[];
  total_items: number;
}

export interface DNDashboard {
  delivery_notes: {
    total: number;
    draft: number;
    in_transit: number;
    delivered: number;
  };
  return_notes: {
    total: number;
    pending: number;
    processed: number;
  };
  inventory: {
    total_available: number;
    total_dispatched: number;
    categories_count: number;
  };
  stock_ins: {
    total: number;
  };
}

export interface AvailableForDispatch {
  quantity_based: AssetCategory[];
  individual_items: AssetItem[];
}

export interface DispatchedItem extends ADNItem {
  adn_number: string;
  adn_id: number;
  delivery_date?: string;
  remaining_quantity: number;
}

// ============================================================================
// API FUNCTIONS - Using apiClient for consistent auth handling
// ============================================================================

// Stock In API
export const createStockIn = async (data: {
  category_id: number;
  quantity: number;
  purchase_date?: string;
  vendor_name?: string;
  vendor_id?: number;
  invoice_number?: string;
  unit_cost?: number;
  condition?: string;
  notes?: string;
  items?: Array<{ serial_number?: string; condition?: string; notes?: string }>;
}): Promise<StockIn> => {
  const response = await apiClient.post('/assets/stock-in', data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const getStockInList = async (params?: {
  page?: number;
  per_page?: number;
  category_id?: number;
}): Promise<{ data: StockIn[]; pagination: { page: number; per_page: number; total: number; pages: number } }> => {
  const response = await apiClient.get('/assets/stock-in', { params });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data;
};

// Delivery Note (ADN) API
export const createDeliveryNote = async (data: {
  project_id: number;
  site_location?: string;
  delivery_date?: string;
  attention_to?: string;
  attention_to_id?: number;
  delivery_from?: string;
  checked_by?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  notes?: string;
  requisition_id?: number; // Link to asset requisition
  items: Array<{
    category_id: number;
    asset_item_id?: number;
    quantity?: number;
    condition?: AssetCondition;
    notes?: string;
  }>;
}): Promise<AssetDeliveryNote> => {
  const response = await apiClient.post('/assets/delivery-notes', data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const getDeliveryNotes = async (params?: {
  page?: number;
  per_page?: number;
  status?: ADNStatus;
  project_id?: number;
}): Promise<{ data: AssetDeliveryNote[]; pagination: { page: number; per_page: number; total: number; pages: number } }> => {
  const response = await apiClient.get('/assets/delivery-notes', { params });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data;
};

export const getDeliveryNote = async (adnId: number): Promise<AssetDeliveryNote> => {
  const response = await apiClient.get(`/assets/delivery-notes/${adnId}`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const dispatchDeliveryNote = async (adnId: number): Promise<AssetDeliveryNote> => {
  const response = await apiClient.put(`/assets/delivery-notes/${adnId}/dispatch`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const receiveDeliveryNote = async (adnId: number, data?: {
  received_by?: string;
  notes?: string;
}): Promise<AssetDeliveryNote> => {
  const response = await apiClient.put(`/assets/delivery-notes/${adnId}/receive`, data || {});
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// Return Delivery Note (ARDN) API
export const createReturnNote = async (data: {
  project_id: number;
  site_location?: string;
  return_date?: string;
  original_adn_id?: number;
  returned_by?: string;
  return_to?: string;
  checked_by?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  return_reason?: string;
  notes?: string;
  items: Array<{
    category_id: number;
    asset_item_id?: number;
    original_adn_item_id?: number;
    quantity?: number;
    reported_condition: ReportedCondition;
    damage_description?: string;
    photo_url?: string;
    notes?: string;
  }>;
}): Promise<AssetReturnDeliveryNote> => {
  const response = await apiClient.post('/assets/return-notes', data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const getReturnNotes = async (params?: {
  page?: number;
  per_page?: number;
  status?: ARDNStatus;
  project_id?: number;
}): Promise<{ data: AssetReturnDeliveryNote[]; pagination: { page: number; per_page: number; total: number; pages: number } }> => {
  const response = await apiClient.get('/assets/return-notes', { params });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data;
};

export const getReturnNote = async (ardnId: number): Promise<AssetReturnDeliveryNote> => {
  const response = await apiClient.get(`/assets/return-notes/${ardnId}`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const issueReturnNote = async (ardnId: number): Promise<AssetReturnDeliveryNote> => {
  const response = await apiClient.put(`/assets/return-notes/${ardnId}/issue`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const updateReturnNote = async (ardnId: number, data: {
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  site_location?: string;
  return_reason?: string;
  notes?: string;
}): Promise<AssetReturnDeliveryNote> => {
  const response = await apiClient.put(`/assets/return-notes/${ardnId}/update`, data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const dispatchReturnNote = async (ardnId: number, data?: {
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
}): Promise<AssetReturnDeliveryNote> => {
  const response = await apiClient.put(`/assets/return-notes/${ardnId}/dispatch`, data || {});
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const receiveReturnNote = async (ardnId: number, data?: {
  accepted_by?: string;
  notes?: string;
}): Promise<AssetReturnDeliveryNote> => {
  const response = await apiClient.put(`/assets/return-notes/${ardnId}/receive`, data || {});
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const processReturnNote = async (ardnId: number, data: {
  items: Array<{
    return_item_id: number;
    verified_condition?: ReportedCondition;
    pm_notes?: string;
    action_taken: ActionTaken;
    quantity_accepted?: number;
  }>;
}): Promise<AssetReturnDeliveryNote> => {
  const response = await apiClient.put(`/assets/return-notes/${ardnId}/process`, data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// Dashboard & Utility API
export const getDNDashboard = async (): Promise<DNDashboard> => {
  const response = await apiClient.get('/assets/dn-dashboard');
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const getAvailableForDispatch = async (): Promise<AvailableForDispatch> => {
  const response = await apiClient.get('/assets/available-for-dispatch');
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const getProjectDispatchedAssets = async (projectId: number): Promise<DispatchedItem[]> => {
  const response = await apiClient.get(`/assets/project/${projectId}/dispatched`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// Stock In Document Upload API
export const uploadStockInDocument = async (stockInId: number, file: File): Promise<{
  stock_in_id: number;
  stock_in_number: string;
  document_url: string;
  filename: string;
  file_size: number;
}> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post(`/assets/stock-in/${stockInId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const getStockInDocument = async (stockInId: number): Promise<{
  stock_in_id: number;
  stock_in_number: string;
  document_url: string | null;
  has_document: boolean;
}> => {
  const response = await apiClient.get(`/assets/stock-in/${stockInId}/document`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const deleteStockInDocument = async (stockInId: number): Promise<void> => {
  const response = await apiClient.delete(`/assets/stock-in/${stockInId}/document`);
  if (!response.data.success) throw new Error(response.data.error);
};

// ============================================================================
// ASSET REPAIR MANAGEMENT
// ============================================================================

export interface AssetRepairItem {
  return_item_id: number;
  ardn_id: number;
  ardn_number: string;
  category_id: number;
  category_name: string;
  category_code: string;
  item_code?: string;
  serial_number?: string;
  quantity: number;
  reported_condition: ReportedCondition;
  verified_condition?: ReportedCondition;
  damage_description?: string;
  pm_notes?: string;
  action_taken: ActionTaken;
  project_id: number;
  project_name?: string;
  return_date?: string;
  processed_at?: string;
  maintenance_id?: number;
  repair_status: 'pending' | 'completed';
}

export type RepairFilterStatus = 'pending' | 'completed' | 'disposed' | 'history' | 'all';

export const getAssetRepairItems = async (status: RepairFilterStatus = 'pending'): Promise<AssetRepairItem[]> => {
  const response = await apiClient.get(`/assets/repairs?status=${status}`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const completeAssetRepair = async (returnItemId: number): Promise<void> => {
  const response = await apiClient.put(`/assets/repairs/${returnItemId}/complete`, {});
  if (!response.data.success) throw new Error(response.data.error);
};

export const disposeUnrepairableAsset = async (returnItemId: number, reason: string): Promise<void> => {
  const response = await apiClient.put(`/assets/repairs/${returnItemId}/dispose`, { reason });
  if (!response.data.success) throw new Error(response.data.error);
};

// ============================================================================
// ASSET DISPOSAL (TD APPROVAL WORKFLOW)
// ============================================================================

export type DisposalReason = 'damaged' | 'unrepairable' | 'obsolete' | 'lost' | 'expired' | 'other';
export type DisposalStatus = 'pending_review' | 'approved' | 'rejected';
export type DisposalSourceType = 'repair' | 'catalog' | 'return';

export interface AssetDisposalRequest {
  disposal_id: number;
  return_item_id?: number;
  category_id: number;
  asset_item_id?: number;
  quantity: number;
  disposal_reason: DisposalReason;
  justification?: string;
  estimated_value: number;
  image_url?: string;
  image_filename?: string;
  requested_by: string;
  requested_by_id?: number;
  requested_at: string;
  status: DisposalStatus;
  reviewed_by?: string;
  reviewed_by_id?: number;
  reviewed_at?: string;
  review_notes?: string;
  source_type: DisposalSourceType;
  source_ardn_id?: number;
  project_id?: number;
  created_at: string;
  updated_at?: string;
  // Related data
  category_code?: string;
  category_name?: string;
  item_code?: string;
  serial_number?: string;
  ardn_number?: string;
  project_name?: string;
  unit_price?: number;
  // From return item if linked
  reported_condition?: string;
  verified_condition?: string;
  damage_description?: string;
}

// Get disposal requests
export const getAssetDisposalRequests = async (status: DisposalStatus | 'all' = 'pending_review'): Promise<AssetDisposalRequest[]> => {
  const response = await apiClient.get(`/assets/disposal?status=${status}`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// Create disposal request (from repair page or catalog)
export const createAssetDisposalRequest = async (data: {
  category_id: number;
  asset_item_id?: number;
  return_item_id?: number;
  quantity?: number;
  disposal_reason: DisposalReason;
  justification?: string;
  source_type?: DisposalSourceType;
  source_ardn_id?: number;
  project_id?: number;
}): Promise<AssetDisposalRequest> => {
  const response = await apiClient.post('/assets/disposal', data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// Upload disposal image
export const uploadDisposalImage = async (disposalId: number, file: File): Promise<{
  disposal_id: number;
  image_url: string;
  filename: string;
}> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post(`/assets/disposal/${disposalId}/upload-image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// TD Approval functions
export const approveAssetDisposal = async (disposalId: number, notes?: string): Promise<AssetDisposalRequest> => {
  const response = await apiClient.put(`/assets/disposal/${disposalId}/approve`, { notes });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

export const rejectAssetDisposal = async (disposalId: number, notes: string, action: 'return_to_stock' | 'send_to_repair' = 'return_to_stock'): Promise<AssetDisposalRequest> => {
  const response = await apiClient.put(`/assets/disposal/${disposalId}/reject`, { notes, action });
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// Get single disposal detail
export const getAssetDisposalDetail = async (disposalId: number): Promise<AssetDisposalRequest> => {
  const response = await apiClient.get(`/assets/disposal/${disposalId}`);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};

// Catalog disposal (direct from asset catalog)
export const requestCatalogDisposal = async (categoryId: number, data: {
  quantity: number;
  disposal_reason: DisposalReason;
  justification?: string;
  asset_item_id?: number;
}): Promise<AssetDisposalRequest> => {
  const response = await apiClient.post(`/assets/catalog/${categoryId}/dispose`, data);
  if (!response.data.success) throw new Error(response.data.error);
  return response.data.data;
};
