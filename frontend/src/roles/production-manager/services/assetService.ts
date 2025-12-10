import { apiClient } from '@/api/config';
import { AxiosError } from 'axios';

// ==================== INTERFACES ====================

export type TrackingMode = 'individual' | 'quantity';
export type AssetCondition = 'good' | 'fair' | 'poor' | 'damaged';
export type AssetStatus = 'available' | 'dispatched' | 'maintenance' | 'retired';
export type MaintenanceStatus = 'pending' | 'in_progress' | 'completed' | 'written_off';

export interface AssetCategory {
  category_id?: number;
  category_code: string;
  category_name: string;
  description?: string;
  tracking_mode: TrackingMode;
  total_quantity: number;
  available_quantity: number;
  dispatched_quantity?: number;
  unit_price: number;
  image_url?: string;
  is_active?: boolean;
  created_at?: string;
  created_by?: string;
  last_modified_at?: string;
  last_modified_by?: string;
  items_count?: number;
  items?: AssetItem[];
  recent_movements?: AssetMovement[];
}

export interface AssetItem {
  item_id?: number;
  category_id: number;
  item_code: string;
  serial_number?: string;
  purchase_date?: string;
  purchase_price?: number;
  current_condition: AssetCondition;
  current_status: AssetStatus;
  current_project_id?: number;
  notes?: string;
  is_active?: boolean;
  created_at?: string;
  created_by?: string;
  last_modified_at?: string;
  last_modified_by?: string;
  // Enriched fields
  category_code?: string;
  category_name?: string;
  project_details?: ProjectDetails;
  movement_history?: AssetMovement[];
  maintenance_history?: AssetMaintenance[];
}

export interface AssetMovement {
  movement_id?: number;
  category_id: number;
  item_id?: number;
  movement_type: 'DISPATCH' | 'RETURN';
  project_id: number;
  quantity: number;
  condition_before?: AssetCondition;
  condition_after?: AssetCondition;
  dispatched_by?: string;
  dispatched_at?: string;
  returned_by?: string;
  returned_at?: string;
  reference_number?: string;
  notes?: string;
  created_at?: string;
  created_by?: string;
  // Enriched fields
  category_code?: string;
  category_name?: string;
  item_code?: string;
  project_details?: ProjectDetails;
}

export interface AssetMaintenance {
  maintenance_id?: number;
  category_id: number;
  item_id?: number;
  quantity: number;
  issue_description: string;
  reported_by?: string;
  reported_at?: string;
  status: MaintenanceStatus;
  repair_notes?: string;
  repair_cost?: number;
  repaired_by?: string;
  repaired_at?: string;
  returned_to_stock?: boolean;
  created_at?: string;
  created_by?: string;
  // Enriched fields
  category_code?: string;
  category_name?: string;
  item_code?: string;
  category?: AssetCategory;
}

export interface ProjectDetails {
  project_id: number;
  project_name: string;
  project_code: string;
  location?: string;
}

export interface DispatchedByProject {
  project: ProjectDetails;
  items: AssetItem[];
  quantity_assets: {
    category_id: number;
    category_code: string;
    category_name: string;
    quantity_dispatched: number;
    dispatched_at?: string;
    dispatched_by?: string;
    received_at?: string;
    received_by?: string;
    is_received?: boolean;
  }[];
}

export interface AssetDashboard {
  summary: {
    total_categories: number;
    total_asset_value: number;
    total_available: number;
    total_dispatched: number;
    pending_maintenance: number;
  };
  category_breakdown: {
    category_id: number;
    category_code: string;
    category_name: string;
    tracking_mode: TrackingMode;
    total: number;
    available: number;
    dispatched: number;
    value: number;
  }[];
  recent_movements: AssetMovement[];
}

// ==================== REQUEST/RESPONSE INTERFACES ====================

export interface CreateCategoryData {
  category_code?: string;
  category_name: string;
  description?: string;
  tracking_mode: TrackingMode;
  total_quantity?: number;
  unit_price?: number;
  image_url?: string;
}

export interface CreateItemData {
  category_id: number;
  item_code?: string;
  serial_number?: string;
  purchase_date?: string;
  purchase_price?: number;
  current_condition?: AssetCondition;
  notes?: string;
}

export interface DispatchAssetData {
  category_id: number;
  project_id: number;
  item_ids?: number[]; // For individual tracking
  quantity?: number;   // For quantity tracking
  condition?: AssetCondition;
  reference_number?: string;
  notes?: string;
}

export interface ReturnAssetData {
  category_id: number;
  project_id: number;
  item_ids?: number[];  // For individual tracking
  quantity?: number;    // For quantity tracking
  condition?: AssetCondition;
  damaged_quantity?: number;  // For quantity tracking
  damage_description?: string;
  reference_number?: string;
  notes?: string;
}

export interface UpdateMaintenanceData {
  action: 'repair' | 'write_off' | 'in_progress';
  repair_notes?: string;
  repair_cost?: number;
  condition_after?: AssetCondition;
  write_off_reason?: string;
}

// ==================== API ERROR HANDLING ====================

const handleApiError = (error: unknown): never => {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.error || error.message;
    throw new Error(message);
  }
  throw error;
};

// ==================== CATEGORY APIs ====================

export const assetService = {
  // Categories
  async createCategory(data: CreateCategoryData): Promise<AssetCategory> {
    try {
      const response = await apiClient.post('/assets/categories', data);
      return response.data.category;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async getAllCategories(params?: {
    active_only?: boolean;
    tracking_mode?: TrackingMode;
    search?: string;
  }): Promise<{ categories: AssetCategory[]; total: number }> {
    try {
      const response = await apiClient.get('/assets/categories', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async getCategoryById(categoryId: number): Promise<AssetCategory> {
    try {
      const response = await apiClient.get(`/assets/categories/${categoryId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async updateCategory(categoryId: number, data: Partial<AssetCategory>): Promise<AssetCategory> {
    try {
      const response = await apiClient.put(`/assets/categories/${categoryId}`, data);
      return response.data.category;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async deleteCategory(categoryId: number): Promise<void> {
    try {
      await apiClient.delete(`/assets/categories/${categoryId}`);
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // Items (Individual Tracking)
  async createItem(data: CreateItemData): Promise<AssetItem> {
    try {
      const response = await apiClient.post('/assets/items', data);
      return response.data.item;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async getAllItems(params?: {
    category_id?: number;
    status?: AssetStatus;
    condition?: AssetCondition;
    project_id?: number;
    active_only?: boolean;
  }): Promise<{ items: AssetItem[]; total: number }> {
    try {
      const response = await apiClient.get('/assets/items', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async getItemById(itemId: number): Promise<AssetItem> {
    try {
      const response = await apiClient.get(`/assets/items/${itemId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async updateItem(itemId: number, data: Partial<AssetItem>): Promise<AssetItem> {
    try {
      const response = await apiClient.put(`/assets/items/${itemId}`, data);
      return response.data.item;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // Dispatch
  async dispatchAsset(data: DispatchAssetData): Promise<{
    movements: AssetMovement[];
    category: AssetCategory;
  }> {
    try {
      const response = await apiClient.post('/assets/dispatch', data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async getDispatchedAssets(): Promise<{
    dispatched_by_project: DispatchedByProject[];
    total_projects: number;
  }> {
    try {
      const response = await apiClient.get('/assets/dispatched');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async getAssetsAtProject(projectId: number): Promise<{
    project: ProjectDetails;
    individual_items: AssetItem[];
    quantity_assets: {
      category_id: number;
      category_code: string;
      category_name: string;
      quantity_at_site: number;
    }[];
  }> {
    try {
      const response = await apiClient.get(`/assets/project/${projectId}/assets`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // Return
  async returnAsset(data: ReturnAssetData): Promise<{
    movements: AssetMovement[];
    maintenance_records: AssetMaintenance[];
    category: AssetCategory;
  }> {
    try {
      const response = await apiClient.post('/assets/return', data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // Maintenance
  async getPendingMaintenance(): Promise<{
    maintenance_records: AssetMaintenance[];
    total: number;
  }> {
    try {
      const response = await apiClient.get('/assets/maintenance');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async updateMaintenance(maintenanceId: number, data: UpdateMaintenanceData): Promise<AssetMaintenance> {
    try {
      const response = await apiClient.put(`/assets/maintenance/${maintenanceId}`, data);
      return response.data.maintenance;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // Dashboard
  async getDashboard(): Promise<AssetDashboard> {
    try {
      const response = await apiClient.get('/assets/dashboard');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async getMovements(params?: {
    category_id?: number;
    project_id?: number;
    type?: 'DISPATCH' | 'RETURN';
    from_date?: string;
    to_date?: string;
  }): Promise<{ movements: AssetMovement[]; total: number }> {
    try {
      const response = await apiClient.get('/assets/movements', { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

export default assetService;
