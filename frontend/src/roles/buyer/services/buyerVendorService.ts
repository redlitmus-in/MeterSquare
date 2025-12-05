import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export interface Vendor {
  vendor_id?: number;
  company_name: string;
  contact_person_name?: string;
  email: string;
  phone_code?: string;
  phone?: string;
  street_address?: string;
  city?: string;
  state?: string;
  country?: string;
  pin_code?: string;
  gst_number?: string;
  category?: string;
  status?: 'active' | 'inactive';
  is_deleted?: boolean;
  created_by?: number;
  created_at?: string;
  last_modified_at?: string;
  last_modified_by?: number;
  products?: VendorProduct[];
  products_count?: number;
}

export interface VendorProduct {
  product_id?: number;
  vendor_id: number;
  product_name: string;
  category?: string;
  description?: string;
  unit?: string;
  unit_price?: number;
  is_deleted?: boolean;
  created_at?: string;
  last_modified_at?: string;
}

export interface VendorListResponse {
  success: boolean;
  vendors: Vendor[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  statistics: {
    total_active: number;
    total_inactive: number;
    total_vendors: number;
  };
}

export interface VendorResponse {
  success: boolean;
  message?: string;
  vendor?: Vendor;
  error?: string;
}

export interface ProductResponse {
  success: boolean;
  message?: string;
  product?: VendorProduct;
  products?: VendorProduct[];
  count?: number;
  error?: string;
}

class BuyerVendorService {
  private getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  // Create new vendor
  async createVendor(vendorData: Omit<Vendor, 'vendor_id'>): Promise<Vendor> {
    try {
      const response = await axios.post<VendorResponse>(
        `${API_URL}/vendor/create`,
        vendorData,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success && response.data.vendor) {
        return response.data.vendor;
      }
      throw new Error(response.data.error || 'Failed to create vendor');
    } catch (error: any) {
      console.error('Error creating vendor:', error);
      if (error.response?.status === 409) {
        throw new Error(error.response.data.error || 'Vendor with this email already exists');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to create vendor');
    }
  }

  // Get all vendors with pagination and filtering
  async getAllVendors(params?: {
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<VendorListResponse> {
    try {
      const queryParams = new URLSearchParams();

      if (params?.category) queryParams.append('category', params.category);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.search) queryParams.append('search', params.search);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.per_page) queryParams.append('per_page', params.per_page.toString());

      const response = await axios.get<VendorListResponse>(
        `${API_URL}/vendor/all?${queryParams.toString()}`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error('Failed to fetch vendors');
    } catch (error: any) {
      console.error('Error fetching vendors:', error);
      if (!error.response) {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch vendors');
    }
  }

  // Get all vendors with their products in a single request - optimized
  async getAllVendorsWithProducts(params?: {
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<VendorListResponse> {
    try {
      const queryParams = new URLSearchParams();

      if (params?.category) queryParams.append('category', params.category);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.search) queryParams.append('search', params.search);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.per_page) queryParams.append('per_page', params.per_page.toString());

      const response = await axios.get<VendorListResponse>(
        `${API_URL}/vendor/all-with-products?${queryParams.toString()}`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data;
      }
      throw new Error('Failed to fetch vendors with products');
    } catch (error: any) {
      console.error('Error fetching vendors with products:', error);
      if (!error.response) {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch vendors with products');
    }
  }

  // Get vendor by ID
  async getVendorById(vendorId: number): Promise<Vendor> {
    try {
      const response = await axios.get<VendorResponse>(
        `${API_URL}/vendor/${vendorId}`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success && response.data.vendor) {
        return response.data.vendor;
      }
      throw new Error('Vendor not found');
    } catch (error: any) {
      console.error('Error fetching vendor:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch vendor');
    }
  }

  // Update vendor
  async updateVendor(vendorId: number, vendorData: Partial<Vendor>): Promise<Vendor> {
    try {
      const response = await axios.put<VendorResponse>(
        `${API_URL}/vendor/${vendorId}`,
        vendorData,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success && response.data.vendor) {
        return response.data.vendor;
      }
      throw new Error(response.data.error || 'Failed to update vendor');
    } catch (error: any) {
      console.error('Error updating vendor:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 409) {
        throw new Error(error.response.data.error || 'Email already exists for another vendor');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to update vendor');
    }
  }

  // Delete vendor (soft delete)
  async deleteVendor(vendorId: number): Promise<void> {
    try {
      const response = await axios.delete<VendorResponse>(
        `${API_URL}/vendor/${vendorId}`,
        { headers: this.getAuthHeaders() }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete vendor');
      }
    } catch (error: any) {
      console.error('Error deleting vendor:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to delete vendor');
    }
  }

  // Add product to vendor
  async addVendorProduct(vendorId: number, productData: Omit<VendorProduct, 'product_id' | 'vendor_id'>): Promise<VendorProduct> {
    try {
      const response = await axios.post<ProductResponse>(
        `${API_URL}/vendor/${vendorId}/products`,
        productData,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success && response.data.product) {
        return response.data.product;
      }
      throw new Error(response.data.error || 'Failed to add product');
    } catch (error: any) {
      console.error('Error adding product:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to add product');
    }
  }

  // Get vendor products
  async getVendorProducts(vendorId: number): Promise<VendorProduct[]> {
    try {
      const response = await axios.get<ProductResponse>(
        `${API_URL}/vendor/${vendorId}/products`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success && response.data.products) {
        return response.data.products;
      }
      return [];
    } catch (error: any) {
      console.error('Error fetching products:', error);
      if (error.response?.status === 404) {
        throw new Error('Vendor not found');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch products');
    }
  }

  // Update vendor product
  async updateVendorProduct(vendorId: number, productId: number, productData: Partial<VendorProduct>): Promise<VendorProduct> {
    try {
      const response = await axios.put<ProductResponse>(
        `${API_URL}/vendor/${vendorId}/products/${productId}`,
        productData,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success && response.data.product) {
        return response.data.product;
      }
      throw new Error(response.data.error || 'Failed to update product');
    } catch (error: any) {
      console.error('Error updating product:', error);
      if (error.response?.status === 404) {
        throw new Error('Product not found');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to update product');
    }
  }

  // Delete vendor product
  async deleteVendorProduct(vendorId: number, productId: number): Promise<void> {
    try {
      const response = await axios.delete<ProductResponse>(
        `${API_URL}/vendor/${vendorId}/products/${productId}`,
        { headers: this.getAuthHeaders() }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete product');
      }
    } catch (error: any) {
      console.error('Error deleting product:', error);
      if (error.response?.status === 404) {
        throw new Error('Product not found');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to delete product');
    }
  }

  // Get vendor categories
  async getVendorCategories(): Promise<string[]> {
    try {
      const response = await axios.get<{ success: boolean; categories: string[] }>(
        `${API_URL}/vendor/categories`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.success) {
        return response.data.categories;
      }
      return this.getDefaultCategories();
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      return this.getDefaultCategories();
    }
  }

  // Get default vendor categories (fallback)
  getDefaultCategories(): string[] {
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
    return `${vendor.company_name}${vendor.category ? ` (${vendor.category})` : ''}`;
  }

  // Helper method to validate vendor data before submission
  validateVendorData(vendor: Partial<Vendor>): string[] {
    const errors: string[] = [];

    if (!vendor.company_name?.trim()) {
      errors.push('Company name is required');
    }

    if (!vendor.email?.trim()) {
      errors.push('Email is required');
    } else if (!this.isValidEmail(vendor.email)) {
      errors.push('Invalid email format');
    }

    if (vendor.phone && !this.isValidPhone(vendor.phone)) {
      errors.push('Invalid phone number format');
    }

    if (vendor.gst_number && vendor.gst_number.trim() && !this.isValidTaxNumber(vendor.gst_number, vendor.country)) {
      errors.push('Invalid tax number format');
    }

    return errors;
  }

  // Email validation helper
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Phone validation helper - More flexible for international numbers
  private isValidPhone(phone: string): boolean {
    // Allow digits, spaces, hyphens, parentheses, and plus sign
    const phoneRegex = /^[\d\s\-+()]+$/;

    // Remove all non-digit characters to check minimum length
    const digitsOnly = phone.replace(/\D/g, '');

    // Minimum 7 digits (for some countries), maximum 15 (international standard)
    return phoneRegex.test(phone) && digitsOnly.length >= 7 && digitsOnly.length <= 15;
  }

  // Tax/VAT number validation helper - Flexible for different countries
  private isValidTaxNumber(taxNumber: string, country?: string): boolean {
    const trimmed = taxNumber.trim();

    // If no country specified or not a recognized format, just check basic format
    if (!country) {
      // Generic validation: alphanumeric, hyphens, spaces allowed, 5-20 characters
      return /^[A-Z0-9\s\-]{5,20}$/i.test(trimmed);
    }

    // Country-specific validation
    switch (country.toUpperCase()) {
      case 'INDIA':
        // Indian GST format: 15 characters (e.g., 22AAAAA0000A1Z5)
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(trimmed);

      case 'UAE':
      case 'SAUDI ARABIA':
      case 'BAHRAIN':
      case 'KUWAIT':
      case 'OMAN':
      case 'QATAR':
        // GCC VAT/TRN: typically 15 digits
        return /^[0-9]{15}$/.test(trimmed);

      case 'UK':
        // UK VAT: 9 or 12 digits, or GB prefix with 9 or 12 digits
        return /^(GB)?[0-9]{9}([0-9]{3})?$/.test(trimmed.replace(/\s/g, ''));

      case 'USA':
        // US EIN: XX-XXXXXXX format
        return /^[0-9]{2}-?[0-9]{7}$/.test(trimmed);

      case 'CANADA':
        // Canadian Business Number: 9 digits + 2 letter program identifier + 4 digit reference
        return /^[0-9]{9}(RC|RM|RP|RT)?[0-9]{4}?$/.test(trimmed);

      case 'AUSTRALIA':
        // Australian Business Number (ABN): 11 digits
        // Australian Company Number (ACN): 9 digits
        return /^[0-9]{9}$/.test(trimmed) || /^[0-9]{11}$/.test(trimmed);

      case 'GERMANY':
        // German VAT (USt-IdNr.): DE followed by 9 digits
        return /^DE[0-9]{9}$/.test(trimmed.replace(/\s/g, ''));

      case 'FRANCE':
        // French VAT: FR followed by 2 characters (letters or digits) and 9 digits
        return /^FR[A-Z0-9]{2}[0-9]{9}$/.test(trimmed.replace(/\s/g, ''));

      case 'SPAIN':
        // Spanish VAT (NIF/CIF): ES followed by alphanumeric 8-9 characters
        return /^ES[A-Z0-9]{8,9}$/.test(trimmed.replace(/\s/g, ''));

      case 'ITALY':
        // Italian VAT: IT followed by 11 digits
        return /^IT[0-9]{11}$/.test(trimmed.replace(/\s/g, ''));

      case 'NETHERLANDS':
        // Dutch VAT: NL followed by 9 digits, letter B, and 2 digits
        return /^NL[0-9]{9}B[0-9]{2}$/.test(trimmed.replace(/\s/g, ''));

      case 'SINGAPORE':
        // Singapore GST Registration Number: 8 or 9 digits followed by a letter, or starts with M/S
        return /^[0-9]{8,9}[A-Z]$/.test(trimmed) || /^[MS][0-9]{7}[A-Z]$/.test(trimmed);

      case 'MALAYSIA':
        // Malaysian SST/GST: Various formats, generally alphanumeric 12-17 characters
        return /^[A-Z0-9\-]{10,17}$/.test(trimmed);

      case 'CHINA':
        // Chinese Taxpayer Identification Number: 15, 17, 18, or 20 digits
        return /^[0-9]{15}$/.test(trimmed) || /^[0-9]{17,20}$/.test(trimmed);

      case 'JAPAN':
        // Japanese Corporate Number: 13 digits
        return /^[0-9]{13}$/.test(trimmed);

      case 'SOUTH KOREA':
        // Korean Business Registration Number: 10 digits (XXX-XX-XXXXX)
        return /^[0-9]{3}-?[0-9]{2}-?[0-9]{5}$/.test(trimmed);

      case 'BRAZIL':
        // Brazilian CNPJ: 14 digits (XX.XXX.XXX/XXXX-XX)
        return /^[0-9]{2}\.?[0-9]{3}\.?[0-9]{3}\/?[0-9]{4}-?[0-9]{2}$/.test(trimmed);

      case 'MEXICO':
        // Mexican RFC: 12-13 alphanumeric characters
        return /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(trimmed);

      case 'SOUTH AFRICA':
        // South African VAT Number: 10 digits
        return /^[0-9]{10}$/.test(trimmed);

      case 'NEW ZEALAND':
        // New Zealand GST Number: 8 or 9 digits
        return /^[0-9]{8,9}$/.test(trimmed);

      case 'SWITZERLAND':
        // Swiss VAT/UID: CHE followed by 9 digits and optional MVA/TVA/IVA
        return /^CHE[0-9]{9}(MWST|TVA|IVA)?$/.test(trimmed.replace(/[\s.-]/g, ''));

      case 'NORWAY':
      case 'SWEDEN':
      case 'DENMARK':
      case 'FINLAND':
        // Nordic countries: Generally 9-12 digits with optional country prefix
        return /^(NO|SE|DK|FI)?[0-9]{9,12}$/.test(trimmed.replace(/\s/g, ''));

      default:
        // Generic validation for other countries: alphanumeric, 5-20 characters
        return /^[A-Z0-9\s\-]{5,20}$/i.test(trimmed);
    }
  }
}

export const buyerVendorService = new BuyerVendorService();
