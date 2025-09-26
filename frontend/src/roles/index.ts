/**
 * Central Role Management System
 * Maps user roles to their permissions and dashboards
 */

import { procurementPermissions } from './procurement/permissions';
import { siteSupervisorPermissions } from './site-supervisor/permissions';
import { mepSupervisorPermissions } from './mep-supervisor/permissions';
import { projectManagerPermissions } from './project-manager/permissions';
import { estimationPermissions } from './estimation/permissions';
import { estimatorPermissions } from './estimator/permissions';
import { technicalDirectorPermissions } from './technical-director/permissions';
import { accountsPermissions } from './accounts/permissions';
import { designPermissions } from './design/permissions';

export type UserRole =
  | 'procurement'
  | 'site_supervisor'
  | 'mep_supervisor'
  | 'project_manager'
  | 'estimation'
  | 'estimator'
  | 'technical_director'
  | 'accounts'
  | 'design'
  | 'admin';

/**
 * Get permissions for a specific role
 */
export const getRolePermissions = (role: string) => {
  // Handle multiple formats: "Site Supervisor", "siteSupervisor", "site_supervisor"
  const normalizedRole = role.toLowerCase()
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/([a-z])([A-Z])/g, '$1_$2')  // Convert camelCase to snake_case
    .toLowerCase();  // Ensure all lowercase
  
  switch (normalizedRole) {
    case 'procurement':
    case 'procurement_manager':
      return procurementPermissions;
      
    case 'site_supervisor':
    case 'sitesupervisor':
    case 'site':
      return siteSupervisorPermissions;
      
    case 'mep_supervisor':
    case 'mep':
      return mepSupervisorPermissions;
      
    case 'project_manager':
    case 'pm':
      return projectManagerPermissions;
      
    case 'estimation':
      return estimationPermissions;

    case 'estimator':
      return estimatorPermissions;
      
    case 'technical_director':
    case 'td':
      return technicalDirectorPermissions;
      
    case 'accounts':
    case 'accountant':
      return accountsPermissions;
      
    case 'design':
    case 'designer':
      return designPermissions;
      
    case 'admin':
    case 'administrator':
      // Admin has all permissions
      return {
        purchaseRequests: {
          create: true,
          view: true,
          edit: true,
          delete: true,
          sendEmail: true,
          approve: true,
          handleCostRevision: true
        },
        vendorQuotations: {
          create: true,
          view: true,
          edit: true,
          delete: true,
          compare: true,
          negotiate: true
        },
        approvals: {
          canApprove: true,
          canReject: true,
          canEscalate: true
        },
        workflow: {
          canSendToProjectManager: true,
          canHandleCostFlag: true,
          canRequestRevision: true
        }
      };
      
    default:
      // Default to most restrictive permissions
      return {
        purchaseRequests: {
          create: false,
          view: true,
          edit: false,
          delete: false,
          sendEmail: false,
          approve: false,
          handleCostRevision: false
        },
        vendorQuotations: {
          create: false,
          view: false,
          edit: false,
          delete: false,
          compare: false,
          negotiate: false
        },
        approvals: {
          canApprove: false,
          canReject: false,
          canEscalate: false
        },
        workflow: {
          canSendToProjectManager: false,
          canHandleCostFlag: false,
          canRequestRevision: false
        }
      };
  }
};

/**
 * Check if a user has a specific permission
 */
export const hasPermission = (
  role: string,
  category: string,
  permission: string
): boolean => {
  const permissions = getRolePermissions(role);
  return (permissions as any)?.[category]?.[permission] || false;
};

/**
 * Get the dashboard component for a role
 * Dashboards are imported from pages/dashboards folder
 */
export const getRoleDashboard = async (role: string) => {
  const normalizedRole = role.toLowerCase().replace(/\s+/g, '_');
  
  switch (normalizedRole) {
    case 'procurement':
    case 'procurement_manager':
      return (await import('@/pages/dashboards/ProcurementDashboard')).default;
      
    case 'site_supervisor':
    case 'site':
      return (await import('@/pages/dashboards/SiteSupervisorDashboard')).default;
      
    case 'mep_supervisor':
    case 'mep':
      return (await import('@/pages/dashboards/MEPSupervisorDashboard')).default;
      
    case 'project_manager':
    case 'pm':
      return (await import('@/pages/dashboards/ProjectManagerDashboard')).default;
      
    case 'estimation':
      return (await import('@/pages/dashboards/EstimationDashboard')).default;

    case 'estimator':
      return (await import('@/pages/dashboards/EstimatorDashboard')).default;
      
    case 'technical_director':
    case 'td':
      return (await import('@/pages/dashboards/TechnicalDirectorDashboard')).default;
      
    case 'accounts':
    case 'accountant':
      return (await import('@/pages/dashboards/AccountsDashboard')).default;
      
    case 'design':
    case 'designer':
      return (await import('@/pages/dashboards/DesignDashboard')).default;
      
    case 'admin':
    case 'administrator':
      return (await import('@/pages/ModernDashboard')).default;
      
    default:
      return (await import('@/pages/ModernDashboard')).default;
  }
};

/**
 * Get the dashboard route path for a role
 */
export const getRoleDashboardPath = (role: string): string => {
  const normalizedRole = role.toLowerCase().replace(/\s+/g, '_');
  
  switch (normalizedRole) {
    case 'procurement':
    case 'procurement_manager':
      return '/procurement/dashboard';
      
    case 'site_supervisor':
    case 'site':
      return '/site-supervisor/dashboard';
      
    case 'mep_supervisor':
    case 'mep':
      return '/mep-supervisor/dashboard';
      
    case 'project_manager':
    case 'pm':
      return '/project-manager/dashboard';
      
    case 'estimation':
      return '/estimation/dashboard';

    case 'estimator':
      return '/estimator/dashboard';
      
    case 'technical_director':
    case 'td':
      return '/technical-director/dashboard';
      
    case 'accounts':
    case 'accountant':
      return '/accounts/dashboard';
      
    case 'design':
    case 'designer':
      return '/design/dashboard';
      
    case 'admin':
    case 'administrator':
      return '/admin/dashboard';
      
    default:
      return '/dashboard';
  }
};

/**
 * Workflow role hierarchy for approval chains
 */
export const workflowHierarchy: Record<string, string[]> = {
  'material_purchases': [
    'site_supervisor',
    'mep_supervisor',
    'procurement',
    'project_manager',
    'estimation',
    'technical_director',
    'accounts',
    'design'
  ],
  'vendor_quotations': [
    'procurement',
    'project_manager',
    'estimation',
    'technical_director',
    'accounts'
  ],
  'material_dispatch_production': [
    'procurement',
    'project_manager',
    'estimation',
    'technical_director',
    'design'
  ],
  'material_dispatch_site': [
    'site_supervisor',
    'mep_supervisor',
    'procurement',
    'project_manager',
    'technical_director',
    'design'
  ]
};

/**
 * Get the next approver in the workflow
 */
export const getNextApprover = (
  currentRole: string,
  workflowType: string
): string | null => {
  const hierarchy = workflowHierarchy[workflowType];
  if (!hierarchy) return null;
  
  const normalizedRole = currentRole.toLowerCase().replace(/\s+/g, '_');
  const currentIndex = hierarchy.indexOf(normalizedRole);
  
  if (currentIndex === -1 || currentIndex === hierarchy.length - 1) {
    return null;
  }
  
  return hierarchy[currentIndex + 1];
};