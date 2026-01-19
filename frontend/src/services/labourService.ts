/**
 * Labour Management Service
 * API client for 8-step Labour/Attendance workflow:
 * 1. Production Manager: Add Labour to Registry
 * 2. Site Engineer: Raise Site Requisition
 * 3. Project Manager: Approve/Reject Requisition
 * 4. Production Manager: Allocate & Assign Personnel + WhatsApp Notify
 * 5. Site Engineer: Confirm Site Arrival
 * 6. Site Engineer: Daily Attendance Logs (IN/OUT)
 * 7. Project Manager: Review & Lock Data
 * 8. Admin (HR): Payroll Processing
 */
import { apiClient } from '@/api/config';
import { useAdminViewStore } from '@/store/adminViewStore';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Worker {
  worker_id: number;
  worker_code: string;
  full_name: string;
  phone?: string;
  email?: string;
  hourly_rate: number;
  skills: string[];
  worker_type: string;
  emergency_contact?: string;
  emergency_phone?: string;
  id_number?: string;
  photo_url?: string;
  status: 'active' | 'inactive' | 'on_leave';
  notes?: string;
  is_deleted: boolean;
  created_at: string;
  created_by: string;
  is_assigned?: boolean;
  assignment?: {
    available_from?: string;
  };
}

export interface CreateWorkerData {
  full_name: string;
  phone?: string;
  email?: string;
  hourly_rate: number;
  skills?: string[];
  worker_type?: string;
  status?: 'active' | 'inactive' | 'on_leave';
  emergency_contact?: string;
  emergency_phone?: string;
  id_number?: string;
  photo_url?: string;
  notes?: string;
}

export interface LabourItem {
  work_description: string;
  skill_required: string;
  workers_count: number;
  boq_id?: number;
  item_id?: string;
  labour_id?: string;
}

export interface LabourRequisition {
  requisition_id: number;
  requisition_code: string;
  project_id: number;
  project_name?: string;
  site_name: string;
  required_date: string;
  labour_items: LabourItem[];
  total_workers_count: number;
  // Backward compatibility fields (deprecated)
  work_description?: string;
  skill_required?: string;
  workers_count?: number;
  boq_id?: number;
  item_id?: string;
  labour_id?: string;
  work_status?: 'pending_assignment' | 'assigned' | 'in_progress' | 'completed';
  requested_by_user_id: number;
  requested_by_name: string;
  requester_role?: 'SE' | 'PM';  // Who created the requisition
  request_date: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by_user_id?: number;
  approved_by_name?: string;
  approval_date?: string;
  rejection_reason?: string;
  assignment_status: 'unassigned' | 'assigned';
  assigned_worker_ids?: number[];
  assigned_workers?: Array<{
    worker_id: number;
    full_name: string;
    worker_code: string;
  }>;
  assigned_by_user_id?: number;
  assigned_by_name?: string;
  assignment_date?: string;
  whatsapp_notified: boolean;
  is_deleted: boolean;
  created_at: string;
  created_by: string;
}

export interface CreateRequisitionData {
  project_id: number;
  site_name: string;
  required_date: string;
  labour_items: LabourItem[];
  // Backward compatibility (deprecated, use labour_items array)
  work_description?: string;
  skill_required?: string;
  workers_count?: number;
  boq_id?: number;
  item_id?: string;
  labour_id?: string;
}

export interface LabourArrival {
  arrival_id: number;
  requisition_id: number;
  worker_id: number;
  worker_name?: string;
  worker_code?: string;
  project_id: number;
  project_name?: string;
  arrival_date: string;
  arrival_status: 'assigned' | 'confirmed' | 'no_show' | 'departed';
  arrival_time?: string;
  departure_time?: string;
  departed_at?: string;
  confirmed_at?: string;
  confirmed_by_user_id?: number;
  is_deleted: boolean;
  created_at: string;
  worker?: {
    worker_id: number;
    worker_code: string;
    full_name: string;
    phone?: string;
    skills: string[];
    hourly_rate: number;
  };
  requisition?: {
    requisition_id: number;
    requisition_code: string;
    work_description: string;
    skill_required: string;
    workers_count: number;
    site_name: string;
  };
}

export interface DailyAttendance {
  attendance_id: number;
  worker_id: number;
  worker_name?: string;
  worker_code?: string;
  project_id: number;
  project_name?: string;
  assignment_id?: number;
  attendance_date: string;
  labour_role?: string;  // Links to BOQ labour item for cost tracking
  clock_in_time?: string;
  clock_out_time?: string;
  total_hours?: number;
  break_duration_minutes: number;
  regular_hours?: number;
  overtime_hours?: number;
  hourly_rate: number;
  overtime_rate_multiplier: number;
  total_cost?: number;
  attendance_status: 'present' | 'absent' | 'half_day' | 'late';
  is_absent: boolean;
  absent_reason?: string;
  entered_by_user_id: number;
  entered_by_role: string;
  approval_status: 'pending' | 'locked';
  approved_by_user_id?: number;
  approved_by_name?: string;
  approval_date?: string;
  rejection_reason?: string;
  original_clock_in?: string;
  original_clock_out?: string;
  correction_reason?: string;
  is_deleted: boolean;
  created_at: string;
}

export interface ClockInData {
  worker_id: number;
  project_id: number;
  assignment_id?: number;
  attendance_date: string;
  clock_in_time: string;
  hourly_rate: number;
  labour_role?: string;  // Links to BOQ labour item for cost tracking
}

export interface PayrollSummary {
  worker_id: number;
  worker_name: string;
  worker_code: string;
  total_days: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_hours: number;
  total_cost: number;
  average_hourly_rate: number;
}

// Grouped structure for collapsible payroll view
export interface PayrollWorkerGroup {
  worker_id: number;
  worker_code: string;
  worker_name: string;
  average_hourly_rate: number;
  total_days: number;
  total_hours: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_cost: number;
}

export interface PayrollRequisitionGroup {
  requisition_id: number | null;
  requisition_code: string;
  work_description: string;
  skill_required: string;
  site_name: string | null;
  workers_count: number | null;
  total_hours: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_cost: number;
  total_days: number;
  workers: PayrollWorkerGroup[];
}

export interface PayrollProjectGroup {
  project_id: number;
  project_name: string;
  project_code: string;
  total_hours: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_cost: number;
  total_days: number;
  worker_count: number;
  requisitions: PayrollRequisitionGroup[];
}

export interface DashboardStats {
  total_workers: number;
  active_workers: number;
  pending_requisitions: number;
  approved_requisitions: number;
  todays_attendance: number;
  pending_lock: number;
  total_labour_cost_today: number;
  recent_requisitions: LabourRequisition[];
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class LabourService {
  // ==========================================================================
  // STEP 1: Worker Registry (Production Manager)
  // ==========================================================================

  /**
   * Get all workers with optional filtering
   */
  async getWorkers(params?: {
    status?: string;
    skill?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ success: boolean; data: Worker[]; total?: number; message?: string }> {
    try {
      const response = await apiClient.get('/labour/workers', { params });

      // Validate response structure
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format');
      }

      const workers = Array.isArray(response.data.workers) ? response.data.workers : [];
      const total = response.data.pagination?.total ?? response.data.total ?? 0;

      return {
        success: true,
        data: workers,
        total: typeof total === 'number' ? total : 0
      };
    } catch (error: any) {
      console.error('Error fetching workers:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || error.message || 'Failed to fetch workers'
      };
    }
  }

  /**
   * Get single worker by ID
   */
  async getWorkerById(workerId: number): Promise<{ success: boolean; data?: Worker; message?: string }> {
    try {
      const response = await apiClient.get(`/labour/workers/${workerId}`);
      return {
        success: true,
        data: response.data.worker
      };
    } catch (error: any) {
      console.error('Error fetching worker:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch worker'
      };
    }
  }

  /**
   * Create new worker
   */
  async createWorker(data: CreateWorkerData): Promise<{ success: boolean; data?: Worker; message?: string }> {
    try {
      const response = await apiClient.post('/labour/workers', data);
      return {
        success: true,
        data: response.data.worker,
        message: response.data.message || 'Worker created successfully'
      };
    } catch (error: any) {
      console.error('Error creating worker:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create worker'
      };
    }
  }

  /**
   * Update worker
   */
  async updateWorker(workerId: number, data: Partial<CreateWorkerData>): Promise<{ success: boolean; data?: Worker; message?: string }> {
    try {
      const response = await apiClient.put(`/labour/workers/${workerId}`, data);
      return {
        success: true,
        data: response.data.worker,
        message: response.data.message || 'Worker updated successfully'
      };
    } catch (error: any) {
      console.error('Error updating worker:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update worker'
      };
    }
  }

  /**
   * Delete worker (soft delete)
   */
  async deleteWorker(workerId: number): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.delete(`/labour/workers/${workerId}`);
      return {
        success: true,
        message: response.data.message || 'Worker deleted successfully'
      };
    } catch (error: any) {
      console.error('Error deleting worker:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to delete worker'
      };
    }
  }

  /**
   * Get workers by skill
   */
  async getWorkersBySkill(skill: string): Promise<{ success: boolean; data: Worker[]; message?: string }> {
    try {
      const response = await apiClient.get(`/labour/workers/by-skill/${encodeURIComponent(skill)}`);
      return {
        success: true,
        data: response.data.workers || []
      };
    } catch (error: any) {
      console.error('Error fetching workers by skill:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch workers'
      };
    }
  }

  // ==========================================================================
  // STEP 2: Requisitions (Site Engineer)
  // ==========================================================================

  /**
   * Create labour requisition
   */
  async createRequisition(data: CreateRequisitionData): Promise<{ success: boolean; data?: LabourRequisition; message?: string }> {
    try {
      const response = await apiClient.post('/labour/requisitions', data);
      return {
        success: true,
        data: response.data.requisition,
        message: response.data.message || 'Requisition created successfully'
      };
    } catch (error: any) {
      console.error('Error creating requisition:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to create requisition'
      };
    }
  }

  /**
   * Get my requisitions (Site Engineer's own requests)
   * @param status - Filter by status
   * @param page - Page number (default: 1)
   * @param perPage - Items per page (default: 15)
   */
  async getMyRequisitions(status?: string, page: number = 1, perPage: number = 15): Promise<{ success: boolean; data: LabourRequisition[]; pagination?: any; message?: string }> {
    try {
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (status) params.status = status;
      const response = await apiClient.get('/labour/requisitions/my-requests', { params });
      return {
        success: true,
        data: response.data.requisitions || [],
        pagination: response.data.pagination
      };
    } catch (error: any) {
      console.error('Error fetching my requisitions:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch requisitions'
      };
    }
  }

  /**
   * Get requisition by ID
   */
  async getRequisitionById(requisitionId: number): Promise<{ success: boolean; data?: LabourRequisition; message?: string }> {
    try {
      const response = await apiClient.get(`/labour/requisitions/${requisitionId}`);
      return {
        success: true,
        data: response.data.requisition
      };
    } catch (error: any) {
      console.error('Error fetching requisition:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch requisition'
      };
    }
  }

  /**
   * Get requisitions by project (for labour item status tracking)
   */
  async getRequisitionsByProject(projectId: number): Promise<{
    success: boolean;
    data: LabourRequisition[];
    labourStatusMap?: Record<string, {
      requisition_id: number;
      requisition_code: string;
      status: string;
      work_status: string;
      assignment_status: string;
    }>;
    message?: string;
  }> {
    try {
      const response = await apiClient.get(`/labour/requisitions/by-project/${projectId}`);
      return {
        success: true,
        data: response.data.requisitions || [],
        labourStatusMap: response.data.labour_status_map || {}
      };
    } catch (error: any) {
      console.error('Error fetching requisitions by project:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch requisitions'
      };
    }
  }

  /**
   * Update requisition (only when pending)
   */
  async updateRequisition(requisitionId: number, data: Partial<CreateRequisitionData>): Promise<{ success: boolean; data?: LabourRequisition; message?: string }> {
    try {
      const response = await apiClient.put(`/labour/requisitions/${requisitionId}`, data);
      return {
        success: true,
        data: response.data.requisition,
        message: response.data.message || 'Requisition updated successfully'
      };
    } catch (error: any) {
      console.error('Error updating requisition:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update requisition'
      };
    }
  }

  /**
   * Resubmit rejected requisition with optional edits
   */
  async resubmitRequisition(requisitionId: number, data: Partial<{
    site_name: string;
    work_description: string;
    skill_required: string;
    workers_count: number;
    required_date: string;
  }>): Promise<{ success: boolean; data?: LabourRequisition; message?: string }> {
    try {
      const response = await apiClient.post(`/labour/requisitions/${requisitionId}/resubmit`, data);
      return {
        success: true,
        data: response.data.requisition,
        message: response.data.message || 'Requisition resubmitted successfully'
      };
    } catch (error: any) {
      console.error('Error resubmitting requisition:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to resubmit requisition'
      };
    }
  }

  // ==========================================================================
  // STEP 3: Approve Requisitions (Project Manager)
  // ==========================================================================

  /**
   * Get requisitions for approval with optional status filter
   * @param status - Filter by status: 'pending' | 'approved' | 'rejected'
   * @param projectId - Optional project ID filter
   * @param page - Page number (default: 1)
   * @param perPage - Items per page (default: 15)
   */
  async getPendingRequisitions(status?: string, projectId?: number, page: number = 1, perPage: number = 15): Promise<{ success: boolean; data: LabourRequisition[]; pagination?: any; message?: string }> {
    try {
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (status) params.status = status;
      if (projectId) params.project_id = projectId;

      // If admin is viewing as another role, pass that info to backend
      const { viewingAsRole } = useAdminViewStore.getState();
      if (viewingAsRole && viewingAsRole !== 'admin') {
        params.view_as_role = viewingAsRole;
      }

      const response = await apiClient.get('/labour/requisitions/pending', { params });
      return {
        success: true,
        data: response.data.requisitions || [],
        pagination: response.data.pagination
      };
    } catch (error: any) {
      console.error('Error fetching requisitions:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch requisitions'
      };
    }
  }

  /**
   * Approve requisition
   */
  async approveRequisition(requisitionId: number): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(`/labour/requisitions/${requisitionId}/approve`);
      return {
        success: true,
        message: response.data.message || 'Requisition approved successfully'
      };
    } catch (error: any) {
      console.error('Error approving requisition:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to approve requisition'
      };
    }
  }

  /**
   * Reject requisition
   */
  async rejectRequisition(requisitionId: number, reason: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(`/labour/requisitions/${requisitionId}/reject`, { reason });
      return {
        success: true,
        message: response.data.message || 'Requisition rejected'
      };
    } catch (error: any) {
      console.error('Error rejecting requisition:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to reject requisition'
      };
    }
  }

  /**
   * Send PM's pending requisition to production (PM only)
   */
  async sendToProduction(requisitionId: number): Promise<{ success: boolean; data?: LabourRequisition; message?: string }> {
    try {
      const response = await apiClient.post(`/labour/requisitions/${requisitionId}/send-to-production`);
      return {
        success: true,
        data: response.data.requisition,
        message: response.data.message || 'Requisition sent to production successfully'
      };
    } catch (error: any) {
      console.error('Error sending requisition to production:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to send requisition to production'
      };
    }
  }

  // ==========================================================================
  // STEP 4: Assign Personnel (Production Manager)
  // ==========================================================================

  /**
   * Get approved requisitions with optional assignment status filter
   * @param assignmentStatus - Filter by assignment status: 'unassigned' | 'assigned'
   */
  async getApprovedRequisitions(assignmentStatus?: string): Promise<{ success: boolean; data: LabourRequisition[]; message?: string }> {
    try {
      const params: Record<string, string> = {};
      if (assignmentStatus) params.assignment_status = assignmentStatus;
      const response = await apiClient.get('/labour/requisitions/approved', { params });
      return {
        success: true,
        data: response.data.requisitions || []
      };
    } catch (error: any) {
      console.error('Error fetching approved requisitions:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch approved requisitions'
      };
    }
  }

  /**
   * Get available workers for skill and date
   */
  async getAvailableWorkers(skill: string, date: string): Promise<{ success: boolean; data: Worker[]; message?: string }> {
    try {
      const response = await apiClient.get('/labour/workers/available', {
        params: { skill, date }
      });
      return {
        success: true,
        data: response.data.workers || []
      };
    } catch (error: any) {
      console.error('Error fetching available workers:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch available workers'
      };
    }
  }

  /**
   * Assign workers to requisition
   */
  async assignWorkersToRequisition(requisitionId: number, workerIds: number[]): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(`/labour/requisitions/${requisitionId}/assign`, {
        worker_ids: workerIds
      });
      return {
        success: true,
        message: response.data.message || 'Workers assigned successfully'
      };
    } catch (error: any) {
      console.error('Error assigning workers:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to assign workers'
      };
    }
  }

  // ==========================================================================
  // STEP 5: Arrival Confirmation (Site Engineer)
  // ==========================================================================

  /**
   * Get arrivals for a project on a specific date
   */
  async getArrivalsForDate(projectId: number, date: string): Promise<{ success: boolean; data: LabourArrival[]; message?: string }> {
    try {
      const response = await apiClient.get(`/labour/arrivals/${projectId}/${date}`);
      return {
        success: true,
        data: response.data.arrivals || []
      };
    } catch (error: any) {
      console.error('Error fetching arrivals:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch arrivals'
      };
    }
  }

  /**
   * Confirm worker arrival
   */
  async confirmArrival(arrivalId: number, arrivalTime?: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post('/labour/arrivals/confirm', {
        arrival_id: arrivalId,
        arrival_time: arrivalTime
      });
      return {
        success: true,
        message: response.data.message || 'Arrival confirmed'
      };
    } catch (error: any) {
      console.error('Error confirming arrival:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to confirm arrival'
      };
    }
  }

  /**
   * Mark worker as no-show
   */
  async markNoShow(arrivalId: number): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post('/labour/arrivals/no-show', {
        arrival_id: arrivalId
      });
      return {
        success: true,
        message: response.data.message || 'Marked as no-show'
      };
    } catch (error: any) {
      console.error('Error marking no-show:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to mark no-show'
      };
    }
  }

  /**
   * Mark worker departure (clock out)
   */
  async markDeparture(arrivalId: number, departureTime: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post('/labour/arrivals/departure', {
        arrival_id: arrivalId,
        departure_time: departureTime
      });
      return {
        success: true,
        message: response.data.message || 'Worker clocked out'
      };
    } catch (error: any) {
      console.error('Error marking departure:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to mark departure'
      };
    }
  }

  // ==========================================================================
  // STEP 6: Attendance Logs (Site Engineer)
  // ==========================================================================

  /**
   * Clock in worker
   */
  async clockIn(data: ClockInData): Promise<{ success: boolean; data?: DailyAttendance; message?: string }> {
    try {
      const response = await apiClient.post('/labour/attendance/clock-in', data);
      return {
        success: true,
        data: response.data.attendance,
        message: response.data.message || 'Clocked in successfully'
      };
    } catch (error: any) {
      console.error('Error clocking in:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to clock in'
      };
    }
  }

  /**
   * Clock out worker
   */
  async clockOut(attendanceId: number, clockOutTime: string, breakMinutes?: number): Promise<{ success: boolean; data?: DailyAttendance; message?: string }> {
    try {
      const response = await apiClient.post('/labour/attendance/clock-out', {
        attendance_id: attendanceId,
        clock_out_time: clockOutTime,
        break_duration_minutes: breakMinutes || 0
      });
      return {
        success: true,
        data: response.data.attendance,
        message: response.data.message || 'Clocked out successfully'
      };
    } catch (error: any) {
      console.error('Error clocking out:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to clock out'
      };
    }
  }

  /**
   * Get daily attendance for project
   */
  async getDailyAttendance(projectId: number, date: string): Promise<{ success: boolean; data: DailyAttendance[]; summary?: any; message?: string }> {
    try {
      const response = await apiClient.get(`/labour/attendance/${projectId}/${date}`);
      return {
        success: true,
        data: response.data.attendance || [],
        summary: response.data.summary
      };
    } catch (error: any) {
      console.error('Error fetching attendance:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch attendance'
      };
    }
  }

  /**
   * Update attendance record
   */
  async updateAttendance(attendanceId: number, data: {
    clock_in_time?: string;
    clock_out_time?: string;
    break_duration_minutes?: number;
    correction_reason?: string;
  }): Promise<{ success: boolean; data?: DailyAttendance; message?: string }> {
    try {
      const response = await apiClient.put(`/labour/attendance/${attendanceId}`, data);
      return {
        success: true,
        data: response.data.attendance,
        message: response.data.message || 'Attendance updated'
      };
    } catch (error: any) {
      console.error('Error updating attendance:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to update attendance'
      };
    }
  }

  // ==========================================================================
  // STEP 7: Review & Lock (Project Manager)
  // ==========================================================================

  /**
   * Get attendance records with optional status filter
   * @param projectId - Optional project ID filter
   * @param date - Optional date filter
   * @param status - Filter by status: 'pending' | 'locked'
   */
  async getAttendanceToLock(projectId?: number, date?: string, status?: string): Promise<{ success: boolean; data: DailyAttendance[]; message?: string }> {
    try {
      const params: Record<string, string | number> = {};
      if (projectId) params.project_id = projectId;
      if (date) params.date = date;
      if (status) params.approval_status = status;

      // If admin is viewing as another role, pass that info to backend
      const { viewingAsRole } = useAdminViewStore.getState();
      if (viewingAsRole && viewingAsRole !== 'admin') {
        params.view_as_role = viewingAsRole;
      }

      const response = await apiClient.get('/labour/attendance/to-lock', { params });
      return {
        success: true,
        data: response.data.attendance || []
      };
    } catch (error: any) {
      console.error('Error fetching attendance:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch attendance'
      };
    }
  }

  /**
   * Lock single attendance record
   */
  async lockAttendance(attendanceId: number, comments?: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(`/labour/attendance/${attendanceId}/lock`, { comments });
      return {
        success: true,
        message: response.data.message || 'Attendance locked'
      };
    } catch (error: any) {
      console.error('Error locking attendance:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to lock attendance'
      };
    }
  }

  /**
   * Lock all attendance for a project/date
   */
  async lockDayAttendance(projectId: number, date: string, comments?: string): Promise<{ success: boolean; locked_count?: number; message?: string }> {
    try {
      const response = await apiClient.post('/labour/attendance/lock-day', {
        project_id: projectId,
        date,
        comments
      });
      return {
        success: true,
        locked_count: response.data.locked_count,
        message: response.data.message || 'Day attendance locked'
      };
    } catch (error: any) {
      console.error('Error locking day attendance:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to lock day attendance'
      };
    }
  }

  // ==========================================================================
  // STEP 8: Payroll (Admin/HR)
  // ==========================================================================

  /**
   * Get locked attendance records for payroll
   */
  async getLockedForPayroll(params?: {
    start_date?: string;
    end_date?: string;
    worker_id?: number;
    project_id?: number;
  }): Promise<{ success: boolean; data: DailyAttendance[]; message?: string }> {
    try {
      const response = await apiClient.get('/labour/payroll/locked', { params });
      return {
        success: true,
        data: response.data.attendance || []
      };
    } catch (error: any) {
      console.error('Error fetching locked attendance:', error);
      return {
        success: false,
        data: [],
        message: error.response?.data?.error || 'Failed to fetch payroll data'
      };
    }
  }

  /**
   * Get payroll summary grouped by worker (flat) and by project (nested)
   */
  async getPayrollSummary(params?: {
    start_date?: string;
    end_date?: string;
    project_id?: number;
  }): Promise<{
    success: boolean;
    data: PayrollSummary[];
    grouped_by_project?: PayrollProjectGroup[];
    total_cost?: number;
    total_hours?: number;
    total_workers?: number;
    total_projects?: number;
    message?: string;
  }> {
    try {
      const response = await apiClient.get('/labour/payroll/summary', { params });
      return {
        success: true,
        data: response.data.payroll_summary || [],
        grouped_by_project: response.data.grouped_by_project || [],
        total_cost: response.data.grand_total,
        total_hours: response.data.total_hours,
        total_workers: response.data.total_workers,
        total_projects: response.data.total_projects
      };
    } catch (error: any) {
      console.error('Error fetching payroll summary:', error);
      return {
        success: false,
        data: [],
        grouped_by_project: [],
        message: error.response?.data?.error || 'Failed to fetch payroll summary'
      };
    }
  }

  // ==========================================================================
  // Dashboard & Reports
  // ==========================================================================

  /**
   * Get labour dashboard statistics
   */
  async getDashboard(projectId?: number): Promise<{ success: boolean; data?: DashboardStats; message?: string }> {
    try {
      const params = projectId ? { project_id: projectId } : {};
      const response = await apiClient.get('/labour/dashboard', { params });
      return {
        success: true,
        data: response.data.dashboard
      };
    } catch (error: any) {
      console.error('Error fetching dashboard:', error);
      return {
        success: false,
        message: error.response?.data?.error || 'Failed to fetch dashboard'
      };
    }
  }
}

export const labourService = new LabourService();
