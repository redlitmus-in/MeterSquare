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

  // Client Revision approval/rejection methods (separate from regular approval)
  async approveClientRevision(boqId: number, notes?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post('/client_td_approval', {
        boq_id: boqId,
        technical_director_status: 'approved',
        rejection_reason: '',
        comments: notes || 'Client revision approved.'
      });
      return {
        success: true,
        message: response.data.message || 'Client revision approved successfully'
      };
    } catch (error: any) {
      console.error('Client revision approval error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to approve client revision'
      };
    }
  }

  async rejectClientRevision(boqId: number, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!reason || !reason.trim()) {
        return {
          success: false,
          message: 'Rejection reason is required'
        };
      }

      const response = await apiClient.post('/client_td_approval', {
        boq_id: boqId,
        technical_director_status: 'rejected',
        rejection_reason: reason,
        comments: reason
      });
      return {
        success: true,
        message: response.data.message || 'Client revision rejected successfully'
      };
    } catch (error: any) {
      console.error('Client revision rejection error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to reject client revision'
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

  async getBOQDetailsHistory(boqId: number): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const response = await apiClient.get(`/boq_details_history/${boqId}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error('BOQ details history error:', error.response?.data || error.message);
      return {
        success: false,
        data: { history: [], current_version: null },
        message: error.response?.data?.error || 'Failed to load BOQ details history'
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

  async getAllPMs(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    try {
      const response = await apiClient.get('/all_pm');
      // Return ALL PMs (both assigned and unassigned) since a PM can handle multiple projects
      const assignedPMs = response.data.assigned_project_managers || [];
      const unassignedPMs = response.data.unassigned_project_managers || [];

      // Get unique PMs from assigned list
      const uniqueAssignedPMs = assignedPMs.reduce((acc: any[], pm: any) => {
        const exists = acc.find(p => p.email === pm.email);
        if (!exists) {
          acc.push({
            user_id: pm.user_id,
            pm_name: pm.pm_name,
            full_name: pm.pm_name,
            email: pm.email,
            phone: pm.phone
          });
        }
        return acc;
      }, []);

      // Combine both lists
      const allPMs = [...unassignedPMs, ...uniqueAssignedPMs];

      return {
        success: true,
        data: allPMs
      };
    } catch (error: any) {
      console.error('Get all PMs error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to load Project Managers'
      };
    }
  }

  async getPMsWithWorkload(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    try {
      const response = await apiClient.get('/all_pm');
      const assignedPMs = response.data.assigned_project_managers || [];
      const unassignedPMs = response.data.unassigned_project_managers || [];

      // Group assigned PMs by user_id to get their workload
      const pmWorkloadMap = new Map();

      assignedPMs.forEach((pm: any) => {
        if (!pmWorkloadMap.has(pm.user_id)) {
          pmWorkloadMap.set(pm.user_id, {
            user_id: pm.user_id,
            pm_name: pm.pm_name,
            full_name: pm.pm_name,
            email: pm.email,
            phone: pm.phone,
            is_active: pm.is_active === true, // Strict comparison - only true if explicitly true
            projects: [],
            projectCount: 0
          });
        }
        const pmData = pmWorkloadMap.get(pm.user_id);
        pmData.projects.push({
          project_id: pm.project_id,
          project_name: pm.project_name
        });
        pmData.projectCount = pmData.projects.length;
      });

      // Add unassigned PMs with 0 projects
      unassignedPMs.forEach((pm: any) => {
        pmWorkloadMap.set(pm.user_id, {
          user_id: pm.user_id,
          pm_name: pm.pm_name || pm.full_name,
          full_name: pm.full_name,
          email: pm.email,
          phone: pm.phone,
          is_active: pm.is_active === true, // Strict comparison - only true if explicitly true
          projects: [],
          projectCount: 0
        });
      });

      // Convert map to array and sort: unassigned first, then by project count
      const pmsWithWorkload = Array.from(pmWorkloadMap.values()).sort((a, b) => {
        if (a.projectCount === 0 && b.projectCount > 0) return -1;
        if (a.projectCount > 0 && b.projectCount === 0) return 1;
        return a.projectCount - b.projectCount;
      });

      return {
        success: true,
        data: pmsWithWorkload
      };
    } catch (error: any) {
      console.error('Get PMs with workload error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to load Project Managers with workload'
      };
    }
  }

  async createPM(pmData: { full_name: string; email: string; phone: string; project_ids: number[] }): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      const response = await apiClient.post('/craete_pm', pmData);
      return {
        success: true,
        data: response.data,
        message: response.data.message || 'Project Manager created successfully'
      };
    } catch (error: any) {
      console.error('Create PM error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create Project Manager'
      };
    }
  }

  async assignProjectsToPM(userId: number, projectIds: number[]): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post('/assign_projects', {
        user_id: userId,
        project_ids: projectIds
      });
      return {
        success: true,
        message: response.data.message || 'Projects assigned successfully'
      };
    } catch (error: any) {
      console.error('Assign projects error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to assign projects'
      };
    }
  }

  async deletePM(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.delete(`/delete_pm/${userId}`);
      return {
        success: true,
        message: response.data.message || 'Project Manager deleted successfully'
      };
    } catch (error: any) {
      console.error('Delete PM error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to delete Project Manager'
      };
    }
  }

  async getAllTDBOQs(page: number = 1, perPage: number = 100): Promise<{ success: boolean; data?: any[]; count?: number; message?: string }> {
    try {
      const response = await apiClient.get('/td_boqs', {
        params: {
          page,
          per_page: perPage
        }
      });
      return {
        success: true,
        data: response.data.boqs || [],
        count: response.data.pagination?.total || 0
      };
    } catch (error: any) {
      console.error('Get TD BOQs error:', error.response?.data || error.message);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to load BOQs'
      };
    }
  }

  // Get Revision Tabs (Dynamic)
  async getRevisionTabs(): Promise<{
    success: boolean;
    data?: Array<{
      revision_number: number;
      project_count: number;
      alert_level: 'normal' | 'warning' | 'critical';
    }>;
    message?: string;
  }> {
    try {
      const response = await apiClient.get('/boq/revision-tabs');

      if (response.data) {
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: true,
        data: []
      };
    } catch (error: any) {
      console.error('Error fetching revision tabs:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch revision tabs'
      };
    }
  }

  // Get Projects by Revision Number
  async getProjectsByRevision(revisionNumber: number | 'all'): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
  }> {
    try {
      const response = await apiClient.get(`/boq/revisions/${revisionNumber}`);

      if (response.data) {
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: true,
        data: []
      };
    } catch (error: any) {
      console.error('Error fetching projects by revision:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch projects'
      };
    }
  }
}

export const tdService = new TDService();
