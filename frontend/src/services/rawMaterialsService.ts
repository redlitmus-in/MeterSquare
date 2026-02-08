/**
 * Raw Materials Catalog Service
 *
 * Service for managing the master catalog of raw materials maintained by Procurement/Buyer team.
 * Estimators must select materials from this catalog when creating BOQs to ensure consistency.
 */

import { apiClient } from '@/api/config';

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export interface RawMaterial {
  id?: number;
  material_name: string;
  description?: string;
  brand?: string;
  size?: string;
  specification?: string;
  unit?: string;
  category?: string;
  unit_price?: number;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
  creator_name?: string;
}

export interface RawMaterialsListResponse {
  success: boolean;
  materials: RawMaterial[];
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface RawMaterialsSearchResponse {
  success: boolean;
  materials: RawMaterial[];
  total_count: number;
  search_query: string;
}

export interface RawMaterialResponse {
  success: boolean;
  message?: string;
  material?: RawMaterial;
  error?: string;
}

export interface CategoriesResponse {
  success: boolean;
  categories: string[];
  total_count: number;
}

export interface CreateRawMaterialData {
  material_name: string;
  description?: string;
  brand?: string;
  size?: string;
  specification?: string;
  unit?: string;
  category?: string;
  unit_price?: number;
}

export interface UpdateRawMaterialData extends Partial<CreateRawMaterialData> {
  is_active?: boolean;
}

// ============================================================================
// RAW MATERIALS SERVICE CLASS
// ============================================================================

class RawMaterialsService {
  private baseUrl = '/raw-materials';

  /**
   * Get all raw materials from the catalog
   *
   * @param params - Query parameters for filtering and pagination
   * @returns List of raw materials with pagination info
   */
  async getAllRawMaterials(params?: {
    category?: string;
    active_only?: boolean;
    page?: number;
    per_page?: number;
  }): Promise<RawMaterialsListResponse> {
    try {
      const queryParams: any = {
        category: params?.category,
        active_only: params?.active_only !== undefined ? params.active_only : true,
        page: params?.page || 1,
        per_page: params?.per_page || 50
      };

      // Remove undefined parameters
      Object.keys(queryParams).forEach(key => {
        if (queryParams[key] === undefined) {
          delete queryParams[key];
        }
      });

      const response = await apiClient.get(this.baseUrl, { params: queryParams });

      if (response.data.success) {
        return response.data;
      }

      throw new Error(response.data.message || 'Failed to fetch raw materials');
    } catch (error: any) {
      console.error('Error fetching raw materials:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  /**
   * Search raw materials by name, brand, or description
   *
   * @param searchQuery - Search term
   * @param activeOnly - Filter by active status (default: true)
   * @param limit - Maximum number of results (default: 20)
   * @returns List of matching raw materials
   */
  async searchRawMaterials(
    searchQuery: string,
    activeOnly: boolean = true,
    limit: number = 20
  ): Promise<RawMaterialsSearchResponse> {
    try {
      if (!searchQuery || searchQuery.trim() === '') {
        throw new Error('Search query is required');
      }

      const response = await apiClient.get(`${this.baseUrl}/search`, {
        params: {
          q: searchQuery.trim(),
          active_only: activeOnly,
          limit: limit
        }
      });

      if (response.data.success) {
        return response.data;
      }

      throw new Error(response.data.message || 'Failed to search raw materials');
    } catch (error: any) {
      console.error('Error searching raw materials:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  /**
   * Get all unique material categories
   *
   * @returns List of category names
   */
  async getCategories(): Promise<CategoriesResponse> {
    try {
      const response = await apiClient.get(`${this.baseUrl}/categories`);

      if (response.data.success) {
        return response.data;
      }

      throw new Error(response.data.message || 'Failed to fetch categories');
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  /**
   * Create a new raw material
   * Only accessible by Buyer and Admin roles
   *
   * @param materialData - Raw material data
   * @returns Created raw material
   */
  async createRawMaterial(materialData: CreateRawMaterialData): Promise<RawMaterial> {
    try {
      if (!materialData.material_name || materialData.material_name.trim() === '') {
        throw new Error('Material name is required');
      }

      const response = await apiClient.post(this.baseUrl, materialData);

      if (response.data.success) {
        return response.data.material;
      }

      throw new Error(response.data.message || 'Failed to create raw material');
    } catch (error: any) {
      console.error('Error creating raw material:', error);
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Validation error');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 403) {
        throw new Error('Only Buyer and Admin roles can create raw materials');
      }
      throw error;
    }
  }

  /**
   * Update an existing raw material
   * Only accessible by Buyer and Admin roles
   *
   * @param materialId - Material ID
   * @param materialData - Updated material data
   * @returns Updated raw material
   */
  async updateRawMaterial(
    materialId: number,
    materialData: UpdateRawMaterialData
  ): Promise<RawMaterial> {
    try {
      const response = await apiClient.put(`${this.baseUrl}/${materialId}`, materialData);

      if (response.data.success) {
        return response.data.material;
      }

      throw new Error(response.data.message || 'Failed to update raw material');
    } catch (error: any) {
      console.error('Error updating raw material:', error);
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Validation error');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 403) {
        throw new Error('Only Buyer and Admin roles can update raw materials');
      }
      if (error.response?.status === 404) {
        throw new Error('Raw material not found');
      }
      throw error;
    }
  }

  /**
   * Soft delete a raw material (sets is_active to false)
   * Only accessible by Buyer and Admin roles
   *
   * @param materialId - Material ID
   * @returns Success message
   */
  async deleteRawMaterial(materialId: number): Promise<string> {
    try {
      const response = await apiClient.delete(`${this.baseUrl}/${materialId}`);

      if (response.data.success) {
        return response.data.message || 'Raw material deleted successfully';
      }

      throw new Error(response.data.message || 'Failed to delete raw material');
    } catch (error: any) {
      console.error('Error deleting raw material:', error);
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      if (error.response?.status === 403) {
        throw new Error('Only Buyer and Admin roles can delete raw materials');
      }
      if (error.response?.status === 404) {
        throw new Error('Raw material not found');
      }
      throw error;
    }
  }

  /**
   * Get raw material by ID
   *
   * @param materialId - Material ID
   * @returns Raw material details
   */
  async getRawMaterialById(materialId: number): Promise<RawMaterial> {
    try {
      // Since backend doesn't have a specific endpoint, fetch all and filter
      // Alternative: Add a GET /raw-materials/:id endpoint to backend
      const response = await this.getAllRawMaterials({ active_only: false });
      const material = response.materials.find(m => m.id === materialId);

      if (!material) {
        throw new Error('Raw material not found');
      }

      return material;
    } catch (error: any) {
      console.error('Error fetching raw material by ID:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const rawMaterialsService = new RawMaterialsService();
export default rawMaterialsService;
