/**
 * Security API Service
 * Handles security dashboard API calls (Admin only)
 */

import { apiClient } from '@/api/config';

// ============================================
// TYPES
// ============================================

export interface SecuritySummary {
  total_events_24h: number;
  failed_logins_24h: number;
  rate_limit_hits_24h: number;
  blocked_ips_24h: number;
  critical_events_24h: number;
  blocked_ips_count: number;
  suspicious_ips_count: number;
}

export interface AuditLog {
  timestamp: string;
  event_type: string;
  severity: string;
  user_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  path: string | null;
  method: string | null;
  details: Record<string, any>;
}

export interface SecuritySummaryResponse {
  success: boolean;
  data: SecuritySummary;
}

export interface AuditLogsResponse {
  success: boolean;
  data: AuditLog[];
  count: number;
}

export interface BlockedIPsResponse {
  success: boolean;
  data: string[];
}

// ============================================
// API FUNCTIONS
// ============================================

export const securityApi = {
  /**
   * Get security summary (blocked IPs, failed logins, etc.)
   */
  async getSummary(): Promise<SecuritySummaryResponse> {
    const response = await apiClient.get('/security/summary');
    return response.data;
  },

  /**
   * Get audit logs with optional filtering
   */
  async getAuditLogs(params?: {
    event_type?: string;
    severity?: string;
    limit?: number;
  }): Promise<AuditLogsResponse> {
    const response = await apiClient.get('/security/audit-logs', { params });
    return response.data;
  },

  /**
   * Get list of blocked IPs
   */
  async getBlockedIPs(): Promise<BlockedIPsResponse> {
    const response = await apiClient.get('/security/blocked-ips');
    return response.data;
  },

  /**
   * Unblock an IP address
   */
  async unblockIP(ip: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/security/unblock-ip', { ip });
    return response.data;
  }
};
