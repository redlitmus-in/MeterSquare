/**
 * Return Delivery Note Service
 * Handles all RDN-related API calls for Site Engineers
 */

import { apiClient } from '@/api/config';

export interface CreateRDNData {
  project_id: number;
  return_date: string;
  returned_by?: string;
  return_to?: string;
  original_delivery_note_id?: number;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  notes?: string;
}

export interface AddRDNItemData {
  inventory_material_id: number;
  original_delivery_note_item_id?: number;
  quantity: number;
  condition: 'Good' | 'Damaged' | 'Defective';
  return_reason?: string;
  notes?: string;
}

export interface ReturnDeliveryNote {
  return_note_id: number;
  return_note_number: string;
  project_id: number;
  return_date: string;
  returned_by: string;
  return_to: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  status: 'DRAFT' | 'ISSUED' | 'IN_TRANSIT' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
  notes?: string;
  prepared_by: string;
  created_at: string;
  created_by: string;
  items?: any[];
}

class RDNService {
  private getAuthHeader() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Create a new return delivery note
   */
  async createRDN(data: CreateRDNData): Promise<ReturnDeliveryNote> {
    try {
      const response = await apiClient.post(
        `/return_delivery_notes`,
        data,
        { headers: this.getAuthHeader() }
      );
      return response.data.return_delivery_note;
    } catch (error: any) {
      console.error('Error creating RDN:', error);
      throw new Error(
        error.response?.data?.error || 'Failed to create return delivery note'
      );
    }
  }

  /**
   * Add an item to a return delivery note
   */
  async addRDNItem(rdnId: number, data: AddRDNItemData): Promise<any> {
    try {
      const response = await apiClient.post(
        `/return_delivery_note/${rdnId}/items`,
        data,
        { headers: this.getAuthHeader() }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error adding item to RDN:', error);
      throw new Error(
        error.response?.data?.error || 'Failed to add item to return delivery note'
      );
    }
  }

  /**
   * Get all RDNs for the Site Engineer's projects
   */
  async getMyRDNs(): Promise<{ return_delivery_notes: ReturnDeliveryNote[]; total: number }> {
    try {
      const response = await apiClient.get(
        `/my-return-delivery-notes`,
        { headers: this.getAuthHeader() }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error fetching RDNs:', error);
      throw new Error(
        error.response?.data?.error || 'Failed to fetch return delivery notes'
      );
    }
  }

  /**
   * Issue a return delivery note (finalize it)
   */
  async issueRDN(rdnId: number): Promise<ReturnDeliveryNote> {
    try {
      const response = await apiClient.post(
        `/return_delivery_note/${rdnId}/issue`,
        {},
        { headers: this.getAuthHeader() }
      );
      return response.data.return_delivery_note;
    } catch (error: any) {
      console.error('Error issuing RDN:', error);
      throw new Error(
        error.response?.data?.error || 'Failed to issue return delivery note'
      );
    }
  }
}

export const rdnService = new RDNService();
