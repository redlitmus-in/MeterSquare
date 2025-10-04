import { apiClient } from '@/api/config';

class TDService {
  async approveBOQ(boqId: number, notes?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post('/td_approval', {
        boq_id: boqId,
        technical_director_status: 'approved',
        rejection_reason: '',
        comments: notes || 'All documents verified, moving to next step.'
      });
      return {
        success: true,
        message: response.data.message || 'BOQ approved successfully'
      };
    } catch (error: any) {
      console.error('BOQ approval error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to approve BOQ'
      };
    }
  }

  async rejectBOQ(boqId: number, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!reason || !reason.trim()) {
        return {
          success: false,
          message: 'Rejection reason is required'
        };
      }

      const response = await apiClient.post('/td_approval', {
        boq_id: boqId,
        technical_director_status: 'rejected',
        rejection_reason: reason,
        comments: reason
      });
      return {
        success: true,
        message: response.data.message || 'BOQ rejected successfully'
      };
    } catch (error: any) {
      console.error('BOQ rejection error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to reject BOQ'
      };
    }
  }

  async getBOQHistory(boqId: number): Promise<{ success: boolean; data?: any[]; message?: string }> {
    try {
      const response = await apiClient.get(`/boq_history/${boqId}`);
      return {
        success: true,
        data: response.data.boq_history || []
      };
    } catch (error: any) {
      console.error('BOQ history error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to load BOQ history'
      };
    }
  }

  async sendBOQToClient(
    boqId: number,
    clientEmail: string,
    message?: string,
    formats?: string[] // ['excel', 'pdf'] or ['excel'] or ['pdf']
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post('/send_boq_to_client', {
        boq_id: boqId,
        client_email: clientEmail,
        message: message || 'Please review the attached BOQ for your project.',
        include_overhead_profit: false, // Always send client version without O&P
        formats: formats || ['excel', 'pdf'] // Default: send both formats
      });
      return {
        success: true,
        message: response.data.message || 'BOQ sent to client successfully'
      };
    } catch (error: any) {
      console.error('Send BOQ to client error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send BOQ to client'
      };
    }
  }
}

export const tdService = new TDService();
