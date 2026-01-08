/**
 * Role Helper Utilities
 * Centralized role permission and checking logic
 */
import { ROLE_IDS, ROLE_NAMES } from '@/constants/roles';
import type { ChangeRequestItem } from '@/services/changeRequestService';

/**
 * Check if user is Site Engineer
 */
export const isSiteEngineer = (user: any): boolean => {
  return user?.role_id === ROLE_IDS.SITE_ENGINEER;
};

/**
 * Check if user is Project Manager
 */
export const isProjectManager = (user: any): boolean => {
  return user?.role_id === ROLE_IDS.PROJECT_MANAGER;
};

/**
 * Check if user is Estimator
 */
export const isEstimator = (user: any): boolean => {
  return user?.role_id === ROLE_IDS.ESTIMATOR;
};

/**
 * Check if user is Technical Director
 */
export const isTechnicalDirector = (user: any): boolean => {
  return user?.role_id === ROLE_IDS.TECHNICAL_DIRECTOR;
};

/**
 * Check if user is Admin
 */
export const isAdmin = (user: any): boolean => {
  return user?.role_id === ROLE_IDS.ADMIN;
};

/**
 * Check if user can send change requests for review
 */
export const canSendForReview = (user: any): boolean => {
  return isSiteEngineer(user) || isProjectManager(user);
};

/**
 * Check if user can approve a specific change request
 * @param user - Current user object
 * @param request - Change request to check
 * @returns true if user can approve
 */
export const canApproveChangeRequest = (user: any, request: ChangeRequestItem): boolean => {
  if (!user || !request) return false;

  const requiredApprover = request.approval_required_from;

  // Admin can approve anything
  if (isAdmin(user)) return true;

  // Check based on required approver
  if (requiredApprover === ROLE_NAMES.PROJECT_MANAGER) {
    return isProjectManager(user);
  }

  if (requiredApprover === ROLE_NAMES.ESTIMATOR) {
    return isEstimator(user);
  }

  if (requiredApprover === ROLE_NAMES.TECHNICAL_DIRECTOR) {
    return isTechnicalDirector(user);
  }

  return false;
};

/**
 * Check if user can reject a specific change request
 * Same logic as approve
 */
export const canRejectChangeRequest = (user: any, request: ChangeRequestItem): boolean => {
  return canApproveChangeRequest(user, request);
};

/**
 * Check if user can view a change request
 * @param user - Current user object
 * @param request - Change request to check
 * @returns true if user can view
 */
export const canViewChangeRequest = (user: any, request: ChangeRequestItem): boolean => {
  if (!user || !request) return false;

  // Admin and TD can see everything
  if (isAdmin(user) || isTechnicalDirector(user)) return true;

  // Owner can always see their own requests
  if (request.requested_by_user_id === user.user_id) return true;

  // Estimator can see requests routed to them
  if (isEstimator(user) && request.approval_required_from === ROLE_NAMES.ESTIMATOR) {
    return true;
  }

  // PM can see SE requests that need their approval
  if (isProjectManager(user) && request.approval_required_from === ROLE_NAMES.PROJECT_MANAGER) {
    return true;
  }

  return false;
};

/**
 * Get role display name from role ID
 */
export const getRoleDisplayName = (roleId: number): string => {
  const roleMap: Record<number, string> = {
    [ROLE_IDS.TECHNICAL_DIRECTOR]: 'Technical Director',
    [ROLE_IDS.ESTIMATOR]: 'Estimator',
    [ROLE_IDS.PROJECT_MANAGER]: 'Project Manager',
    [ROLE_IDS.SITE_ENGINEER]: 'Site Engineer',
    [ROLE_IDS.ADMIN]: 'Administrator'
  };
  return roleMap[roleId] || 'Unknown';
};

/**
 * Check if change request is pending user's action
 */
export const isPendingMyAction = (user: any, request: ChangeRequestItem): boolean => {
  if (!user || !request) return false;

  // Not pending if already approved or rejected
  if (request.status === 'approved' || request.status === 'rejected') {
    return false;
  }

  // Check if it's waiting for this user's role to approve
  return canApproveChangeRequest(user, request);
};
