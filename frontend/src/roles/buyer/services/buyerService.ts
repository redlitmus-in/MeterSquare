import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export interface PurchaseMaterial {
  material_name: string;
  sub_item_name?: string;  // Sub-item/scope name like "Protection"
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

export interface Purchase {
  cr_id: number;
  project_id: number;
  project_name: string;
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

  // Mark purchase as complete
  async completePurchase(data: CompletePurchaseRequest): Promise<CompletePurchaseResponse> {
    try {
      const response = await axios.post<CompletePurchaseResponse>(
        `${API_URL}/buyer/complete-purchase`,
        data,
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
}

export const buyerService = new BuyerService();
