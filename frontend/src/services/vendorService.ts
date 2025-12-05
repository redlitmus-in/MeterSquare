import { apiClient } from '@/api/config';

export interface Vendor {
  vendor_id?: number;
  vendor_name: string;
  category?: string;
  contact_person_name?: string;
  email: string;
  phone_code?: string;
  phone?: string;
  street_address?: string;
  state?: string;
  city?: string;
  country?: string;
  pin_code?: string;
  gst_number?: string;
  status?: 'active' | 'inactive';
  is_deleted?: boolean;
  created_at?: string;
  created_by?: string;
  last_modified_at?: string;
  last_modified_by?: string;
}

export interface VendorStats {
  total_active: number;
  total_deleted: number;
  by_category: Array<{
    category: string;
    count: number;
  }>;
}

export interface VendorListResponse {
  status: string;
  page: number;
  per_page: number;
  total: number;
  pages: number;
  data: Vendor[];
}

export interface VendorResponse {
  status: string;
  message?: string;
  data?: Vendor;
}

class VendorService {
  // Create new vendor
  async createVendor(vendorData: Omit<Vendor, 'vendor_id'>): Promise<Vendor> {
    try {
      const response = await apiClient.post('/create_vendor', vendorData);
      if (response.data.status === 'success') {
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to create vendor');
    } catch (error: any) {
      console.error('Error creating vendor:', error);
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Vendor with this email already exists');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  // Get all vendors with pagination and filtering
  async getAllVendors(params?: {
    category?: string;
    is_active?: boolean;
    page?: number;
    per_page?: number;
  }): Promise<VendorListResponse> {
    try {
      const queryParams = {
        category: params?.category,
        is_active: params?.is_active !== undefined ? params.is_active : true,
        page: params?.page || 1,
        per_page: params?.per_page || 20
      };

      const response = await apiClient.get('/all_vendor', { params: queryParams });
      if (response.data.status === 'success') {
        return response.data;
      }
      throw new Error(response.data.message || 'Failed to fetch vendors');
    } catch (error: any) {
      console.error('Error fetching vendors:', error);
      if (!error.response) {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  // Get vendor by ID
  async getVendorById(vendorId: number): Promise<Vendor> {
    try {
      const response = await apiClient.get(`/vendor/${vendorId}`);
      if (response.data.status === 'success') {
        return response.data.data;
      }
      if (response.data.status === 'error' && response.data.data?.length === 0) {
        throw new Error('Vendor not found');
      }
      throw new Error(response.data.message || 'Failed to fetch vendor');
    } catch (error: any) {
      console.error('Error fetching vendor:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  // Update vendor
  async updateVendor(vendorId: number, vendorData: Partial<Vendor>): Promise<Vendor> {
    try {
      const response = await apiClient.put(`/update_vendor/${vendorId}`, vendorData);
      if (response.data.status === 'success') {
        return response.data.data;
      }
      throw new Error(response.data.message || 'Failed to update vendor');
    } catch (error: any) {
      console.error('Error updating vendor:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Email already exists for another vendor');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  // Delete vendor (soft delete)
  async deleteVendor(vendorId: number): Promise<void> {
    try {
      const response = await apiClient.delete(`/delete_vendor/${vendorId}`);
      if (response.data.status === 'success') {
        return;
      }
      throw new Error(response.data.message || 'Failed to delete vendor');
    } catch (error: any) {
      console.error('Error deleting vendor:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 400) {
        throw new Error('Vendor already deleted');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw error;
    }
  }

  // Get vendor categories (hardcoded for now, can be made dynamic later)
  getVendorCategories(): string[] {
    return [
      'Construction Materials',
      'Electrical Equipment',
      'Plumbing Supplies',
      'HVAC Equipment',
      'Safety Equipment',
      'Tools & Machinery',
      'Furniture',
      'IT Equipment',
      'Office Supplies',
      'Transportation',
      'Consulting Services',
      'Maintenance Services',
      'Other'
    ];
  }

  // Helper method to format vendor for display
  formatVendorDisplay(vendor: Vendor): string {
    return `${vendor.vendor_name} ${vendor.category ? `(${vendor.category})` : ''}`;
  }

  // Helper method to validate vendor data before submission
  validateVendorData(vendor: Partial<Vendor>): string[] {
    const errors: string[] = [];

    if (!vendor.vendor_name?.trim()) {
      errors.push('Vendor name is required');
    }

    if (!vendor.email?.trim()) {
      errors.push('Email is required');
    } else if (!this.isValidEmail(vendor.email)) {
      errors.push('Invalid email format');
    }

    if (vendor.phone && !this.isValidPhone(vendor.phone)) {
      errors.push('Invalid phone number format');
    }

    if (vendor.gst_number && !this.isValidGST(vendor.gst_number)) {
      errors.push('Invalid GST number format');
    }

    return errors;
  }

  // Email validation helper
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Phone validation helper
  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\d\s\-+()]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  // GST validation helper (Indian GST format)
  private isValidGST(gst: string): boolean {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gst);
  }
}

export const vendorService = new VendorService();