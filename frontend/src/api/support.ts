/**
 * Support Ticket API Service
 * Handles all support ticket related API calls
 */

import { apiClient } from './config';

// Types
export interface SupportTicket {
  ticket_id: number;
  ticket_number: string;
  reporter_user_id: number;
  reporter_name: string;
  reporter_email: string;
  reporter_role: string;
  ticket_type: 'bug' | 'issue' | 'implementation' | 'feature';
  title: string;
  description: string;
  current_concern?: string;
  proposed_changes?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'in_progress' | 'resolved' | 'closed';
  attachments: Attachment[];
  admin_response?: string;
  admin_user_id?: number;
  admin_name?: string;
  response_date?: string;
  approved_by_user_id?: number;
  approved_by_name?: string;
  approval_date?: string;
  rejection_reason?: string;
  rejected_by_user_id?: number;
  rejected_by_name?: string;
  rejection_date?: string;
  resolved_by_user_id?: number;
  resolved_by_name?: string;
  resolution_date?: string;
  resolution_notes?: string;
  comments?: Comment[];
  created_at: string;
  updated_at?: string;
  submitted_at?: string;
  is_deleted: boolean;
  is_editable: boolean;
  can_submit: boolean;
  can_approve: boolean;
  can_resolve: boolean;
}

export interface Comment {
  id: string;
  sender_type: 'client' | 'dev_team';
  sender_name: string;
  sender_email?: string;
  message: string;
  created_at: string;
}

export interface Attachment {
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

export interface CreateTicketData {
  ticket_type: 'bug' | 'issue' | 'implementation' | 'feature';
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface UpdateTicketData {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  ticket_type?: 'bug' | 'issue' | 'implementation' | 'feature';
}

export interface TicketListResponse {
  success: boolean;
  tickets: SupportTicket[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  statistics?: {
    total_submitted: number;
    total_in_review: number;
    total_approved: number;
    total_in_progress: number;
    total_resolved: number;
    total_rejected: number;
  };
}

export interface TicketResponse {
  success: boolean;
  ticket: SupportTicket;
  message?: string;
}

// API Functions
export const supportApi = {
  // Public functions (no auth required)

  /**
   * Create a ticket publicly (no login required)
   */
  async publicCreateTicket(data: {
    ticket_type: 'bug' | 'issue' | 'implementation' | 'feature';
    title: string;
    description: string;
    current_concern?: string;
    proposed_changes?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    reporter_name: string;
    reporter_email: string;
    reporter_role?: string;
  }, files?: File[], asDraft?: boolean): Promise<TicketResponse> {
    const formData = new FormData();
    formData.append('ticket_type', data.ticket_type);
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('reporter_name', data.reporter_name);
    formData.append('reporter_email', data.reporter_email);
    if (data.priority) formData.append('priority', data.priority);
    if (data.reporter_role) formData.append('reporter_role', data.reporter_role);
    if (data.current_concern) formData.append('current_concern', data.current_concern);
    if (data.proposed_changes) formData.append('proposed_changes', data.proposed_changes);
    if (asDraft) formData.append('as_draft', 'true');

    if (files && files.length > 0) {
      files.forEach(file => {
        formData.append('files', file);
      });
    }

    const response = await apiClient.post('/support/public/create', formData);
    return response.data;
  },

  /**
   * Get all tickets publicly (no login required)
   */
  async publicGetAllTickets(params?: {
    page?: number;
    per_page?: number;
    status?: string;
    ticket_type?: string;
  }): Promise<TicketListResponse> {
    const response = await apiClient.get('/support/public/all', { params });
    return response.data;
  },

  /**
   * Update a ticket publicly (no auth required)
   */
  async publicUpdateTicket(
    ticketId: number,
    data: {
      title?: string;
      description?: string;
      current_concern?: string;
      proposed_changes?: string;
      priority?: string;
      ticket_type?: string;
    },
    files?: File[]
  ): Promise<TicketResponse> {
    const formData = new FormData();
    if (data.title) formData.append('title', data.title);
    if (data.description) formData.append('description', data.description);
    if (data.current_concern) formData.append('current_concern', data.current_concern);
    if (data.proposed_changes) formData.append('proposed_changes', data.proposed_changes);
    if (data.priority) formData.append('priority', data.priority);
    if (data.ticket_type) formData.append('ticket_type', data.ticket_type);

    if (files && files.length > 0) {
      files.forEach(file => {
        formData.append('files', file);
      });
    }

    const response = await apiClient.put(`/support/public/${ticketId}`, formData);
    return response.data;
  },

  /**
   * Submit a draft ticket publicly (no auth required)
   */
  async publicSubmitTicket(ticketId: number): Promise<TicketResponse> {
    const response = await apiClient.post(`/support/public/${ticketId}/submit`);
    return response.data;
  },

  /**
   * Delete a ticket publicly (no auth required)
   */
  async publicDeleteTicket(ticketId: number): Promise<TicketResponse> {
    const response = await apiClient.delete(`/support/public/${ticketId}`);
    return response.data;
  },

  /**
   * Confirm resolution publicly (no auth required)
   */
  async publicConfirmResolution(ticketId: number): Promise<TicketResponse> {
    const response = await apiClient.post(`/support/public/${ticketId}/confirm`);
    return response.data;
  },

  // Admin functions (for dev team)

  /**
   * Get all tickets (admin/dev team)
   */
  async getAllTickets(params?: {
    page?: number;
    per_page?: number;
    status?: string;
    ticket_type?: string;
    priority?: string;
    search?: string;
  }): Promise<TicketListResponse> {
    const response = await apiClient.get('/support/admin/all', { params });
    return response.data;
  },

  /**
   * Approve a ticket (admin only)
   */
  async approveTicket(ticketId: number, adminName?: string, response?: string): Promise<TicketResponse> {
    const res = await apiClient.post(`/support/admin/${ticketId}/approve`, { admin_name: adminName, response });
    return res.data;
  },

  /**
   * Reject a ticket (admin only)
   */
  async rejectTicket(ticketId: number, reason: string, adminName?: string, response?: string): Promise<TicketResponse> {
    const res = await apiClient.post(`/support/admin/${ticketId}/reject`, { reason, admin_name: adminName, response });
    return res.data;
  },

  /**
   * Resolve a ticket (admin only)
   */
  async resolveTicket(ticketId: number, adminName?: string, notes?: string, files?: File[]): Promise<TicketResponse> {
    const formData = new FormData();
    if (notes) formData.append('notes', notes);
    if (adminName) formData.append('admin_name', adminName);

    if (files && files.length > 0) {
      files.forEach(file => {
        formData.append('files', file);
      });
    }

    const response = await apiClient.post(`/support/admin/${ticketId}/resolve`, formData);
    return response.data;
  },

  /**
   * Add files to a ticket (admin only)
   */
  async addFilesToTicket(ticketId: number, files: File[], adminName?: string, response?: string): Promise<TicketResponse> {
    const formData = new FormData();
    if (response) formData.append('response', response);
    if (adminName) formData.append('admin_name', adminName);

    files.forEach(file => {
      formData.append('files', file);
    });

    const res = await apiClient.post(`/support/admin/${ticketId}/files`, formData);
    return res.data;
  },

  /**
   * Update ticket status (admin only)
   */
  async updateTicketStatus(ticketId: number, status: string, adminName?: string, response?: string): Promise<TicketResponse> {
    const res = await apiClient.put(`/support/admin/${ticketId}/status`, { status, admin_name: adminName, response });
    return res.data;
  },

  /**
   * Close ticket directly (admin only - if client forgets to confirm)
   */
  async adminCloseTicket(ticketId: number, adminName?: string, notes?: string): Promise<TicketResponse> {
    const res = await apiClient.post(`/support/admin/${ticketId}/close`, { admin_name: adminName, notes });
    return res.data;
  },

  /**
   * Add a comment to a ticket (for both client and dev team)
   */
  async addComment(ticketId: number, data: {
    message: string;
    sender_type: 'client' | 'dev_team';
    sender_name: string;
    sender_email?: string;
  }): Promise<TicketResponse & { comment: any }> {
    const res = await apiClient.post(`/support/${ticketId}/comment`, data);
    return res.data;
  },
};
