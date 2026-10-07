import { apiClient } from './config';

export type RoleAccessType = 'fresh' | 'existing';
export type RoleGrantStatus = 'active' | 'scheduled' | 'expired' | 'revoked';

export interface RoleGrant {
  grant_id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  user_primary_role: string | null;
  role_id: number;
  role: string | null;
  access_type: RoleAccessType;
  source_user_id: number | null;
  source_user_name: string | null;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: RoleGrantStatus;
  days_left: number | null;
  granted_by_name: string | null;
  revoked_by_name: string | null;
  revoked_at: string | null;
  created_at: string | null;
  projects_still_assigned: number | null;
  open_work: { projects: number; change_requests: number; item_assignments: number; total: number } | null;
  open_work_text: string | null;
}

export interface RoleGrantCounts {
  active: number;
  ending_soon: number;
  scheduled: number;
  expired: number;
  revoked: number;
  all: number;
}

export interface GrantableUser {
  user_id: number;
  full_name: string;
  email: string;
  role_id: number;
  role: string | null;
}

export interface RoleOption {
  role_id: number;
  role: string;
}

export interface RoleHolder {
  user_id: number;
  full_name: string;
  email: string;
  project_count: number | null;
}

export interface AvailableGrant {
  grant_id: number;
  role: string;
  role_id: number;
  access_type: RoleAccessType;
  source_user_name: string | null;
  start_date: string;
  end_date: string;
}

export interface RoleAccessInfo {
  primary_role: string;
  primary_role_id: number;
  active_grant_id: number | null;
  active_access_type: RoleAccessType | null;
  active_source_user_name: string | null;
  active_end_date: string | null;
  available_grants: AvailableGrant[];
  current_role?: string;
  active_grant_ended?: boolean;
}

export interface CreateGrantPayload {
  user_id: number;
  role_id: number;
  access_type: RoleAccessType;
  source_user_id?: number | null;
  start_date: string;
  end_date: string;
  notes?: string;
}

export interface SwitchRoleResponse {
  success: boolean;
  access_token: string;
  expires_at: string;
  user: any;
}

const BASE = '/role-access';

export const roleAccessApi = {
  async getGrants(status: string = 'all'): Promise<{ grants: RoleGrant[]; counts: RoleGrantCounts; today: string }> {
    const response = await apiClient.get(`${BASE}/grants`, { params: { status }, headers: { 'X-Skip-Cache': 'true' } });
    return response.data;
  },

  async createGrant(payload: CreateGrantPayload): Promise<{ grant: RoleGrant; message: string }> {
    const response = await apiClient.post(`${BASE}/grants`, payload);
    return response.data;
  },

  async revokeGrant(grantId: number): Promise<{ message: string }> {
    const response = await apiClient.post(`${BASE}/grants/${grantId}/revoke`);
    return response.data;
  },

  async getUsers(search?: string): Promise<{ users: GrantableUser[] }> {
    const response = await apiClient.get(`${BASE}/users`, { params: search ? { search } : {} });
    return response.data;
  },

  async getRoles(): Promise<{ roles: RoleOption[] }> {
    const response = await apiClient.get(`${BASE}/roles`);
    return response.data;
  },

  async getRoleHolders(roleId: number, excludeUserId?: number): Promise<{ users: RoleHolder[] }> {
    const response = await apiClient.get(`${BASE}/roles/${roleId}/users`, {
      params: excludeUserId ? { exclude_user_id: excludeUserId } : {},
      headers: { 'X-Skip-Cache': 'true' },
    });
    return response.data;
  },

  async getMyRoles(): Promise<RoleAccessInfo> {
    const response = await apiClient.get(`${BASE}/my-roles`, { headers: { 'X-Skip-Cache': 'true' } });
    return response.data;
  },

  /** grantId null = back to the user's own role */
  async switchRole(grantId: number | null): Promise<SwitchRoleResponse> {
    const response = await apiClient.post(`${BASE}/switch`, { grant_id: grantId });
    return response.data;
  },
};

export default roleAccessApi;
