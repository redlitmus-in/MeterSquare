import { apiClient } from '@/api/config';

export interface CcRecipient {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  created_at?: string;
}

export interface UserSearchResult {
  user_id: number;
  name: string;
  email: string;
  role: string;
}

class EmailCcService {
  /** Get admin-managed default CC recipients */
  async getCcDefaults(): Promise<CcRecipient[]> {
    const response = await apiClient.get('/email/cc-defaults');
    return response.data?.data || [];
  }

  /** Get buyer's custom CC recipients */
  async getBuyerCcRecipients(): Promise<CcRecipient[]> {
    const response = await apiClient.get('/buyer/cc-recipients');
    return response.data?.data || [];
  }

  /** Add a custom CC recipient for the current buyer */
  async addBuyerCcRecipient(email: string, name: string): Promise<CcRecipient> {
    const response = await apiClient.post('/buyer/cc-recipients', { email, name });
    return response.data?.data;
  }

  /** Remove a custom CC recipient */
  async removeBuyerCcRecipient(recipientId: number): Promise<void> {
    await apiClient.delete(`/buyer/cc-recipients/${recipientId}`);
  }

  /** Admin: Add a default CC recipient */
  async addCcDefault(email: string, name: string): Promise<CcRecipient> {
    const response = await apiClient.post('/admin/email/cc-defaults', { email, name });
    return response.data?.data;
  }

  /** Admin: Remove a default CC recipient */
  async removeCcDefault(defaultId: number): Promise<void> {
    await apiClient.delete(`/admin/email/cc-defaults/${defaultId}`);
  }

  /** Search system users by name or email (for typeahead) */
  async searchUsers(query: string): Promise<UserSearchResult[]> {
    if (query.length < 2) return [];
    const response = await apiClient.get('/users/search', { params: { q: query } });
    return response.data?.data || [];
  }
}

export const emailCcService = new EmailCcService();
