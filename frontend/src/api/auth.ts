import { apiClient, API_ENDPOINTS } from './config';

interface LoginRequest {
  email: string;
  role?: string;
}

interface LoginResponse {
  message: string;
  email: string;
  otp_expiry: string;
  otp?: string; // Only in development
}

interface VerifyOTPRequest {
  email: string;
  otp: string;
}

interface VerifyOTPResponse {
  message: string;
  access_token: string;
  expires_at: string;
  user: {
    user_id: number;
    email: string;
    full_name: string;
    phone: string;
    role: string;
    role_id: number;
    department: string;
    permissions: string[];
  };
}

interface UserResponse {
  user: {
    user_id: number;
    email: string;
    full_name: string;
    phone: string;
    role: string;
    department: string;
    is_active: boolean;
  };
}

export const authApi = {
  /**
   * Send OTP to user's email
   */
  sendOTP: async (email: string, role?: string): Promise<LoginResponse> => {
    try {
      const payload: LoginRequest = { email };
      if (role) {
        payload.role = role;
      }
      const response = await apiClient.post<LoginResponse>('/login', payload);
      return response.data;
    } catch (error: any) {
      console.error('Send OTP error:', error);
      
      // Handle specific error cases
      if (error.response?.status === 404) {
        throw new Error('No user found with this email address');
      } else if (error.response?.status === 403) {
        throw new Error('Invalid role for this user');
      } else if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      } else if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else {
        throw new Error('Failed to send OTP. Please try again.');
      }
    }
  },

  /**
   * Verify OTP and complete login
   */
  verifyOTP: async (email: string, otp: string): Promise<VerifyOTPResponse> => {
    try {
      const response = await apiClient.post<VerifyOTPResponse>('/verification_otp', {
        email,
        otp
      });
      
      // Store token and user data
      if (response.data.access_token) {
        localStorage.setItem('access_token', response.data.access_token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      throw new Error(error.response?.data?.error || 'Invalid OTP');
    }
  },

  /**
   * Get current logged-in user
   */
  getCurrentUser: async (): Promise<UserResponse> => {
    try {
      const response = await apiClient.get<UserResponse>('/self');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get user');
    }
  },

  /**
   * Logout user
   */
  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/logout');
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    } catch (error) {
      // Clear local storage even if API call fails
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('access_token');
  },

  /**
   * Get user role from local storage
   */
  getUserRole: (): string | null => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user.role;
      } catch {
        return null;
      }
    }
    return null;
  },

  /**
   * Get user permissions from local storage
   */
  getUserPermissions: (): string[] => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user.permissions || [];
      } catch {
        return [];
      }
    }
    return [];
  },

  /**
   * Check if user has specific permission
   */
  hasPermission: (permission: string): boolean => {
    const permissions = authApi.getUserPermissions();
    return permissions.includes(permission);
  },

  /**
   * Check if user has any of the specified roles
   */
  hasRole: (roles: string | string[]): boolean => {
    const userRole = authApi.getUserRole();
    if (!userRole) return false;
    
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(userRole);
  }
};

export default authApi;