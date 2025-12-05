import axios, { AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Store item interface
export interface StoreItem {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  unit: string;
  available_quantity: number;
  supplier_name: string;
  supplier_location: string;
  delivery_time_days: number;
  rating: number;
  image_url?: string;
  specifications?: Record<string, any>;
  images?: string[];
  certifications?: string[];
  created_at?: string;
  updated_at?: string;
}

// Store category interface
export interface StoreCategory {
  id: number;
  name: string;
  items_count: number;
}

class StoreService {
  /**
   * Get all available store items from inventory
   */
  async getStoreItems(): Promise<StoreItem[]> {
    try {
      const response = await axios.get(`${API_URL}/buyer/store/items`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Error fetching store items:', axiosError);
      throw new Error(
        (axiosError.response?.data as any)?.error ||
        'Failed to fetch store items'
      );
    }
  }

  /**
   * Get details of a specific store item
   */
  async getStoreItemDetails(itemId: number): Promise<StoreItem> {
    try {
      const response = await axios.get(`${API_URL}/buyer/store/items/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Error fetching store item details:', axiosError);
      throw new Error(
        (axiosError.response?.data as any)?.error ||
        'Failed to fetch item details'
      );
    }
  }

  /**
   * Get all store categories from inventory
   */
  async getStoreCategories(): Promise<StoreCategory[]> {
    try {
      const response = await axios.get(`${API_URL}/buyer/store/categories`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Error fetching store categories:', axiosError);
      throw new Error(
        (axiosError.response?.data as any)?.error ||
        'Failed to fetch categories'
      );
    }
  }
}

export const storeService = new StoreService();
