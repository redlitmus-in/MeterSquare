/**
 * Central Role Management System
 * Maps user roles to their permissions and dashboards
 */

import { estimatorPermissions } from './estimator/permissions';

export type UserRole =
  | 'admin'
  | 'estimator'
  | 'project_manager'
  | 'technical_director'
  | 'site_engineer';

/**
 * Get permissions for a specific role
 */
export const getRolePermissions = (role: string) => {
  // Handle multiple formats: "Project Manager", "projectManager", "project_manager"
  const normalizedRole = role.toLowerCase()
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/([a-z])([A-Z])/g, '$1_$2')  // Convert camelCase to snake_case
    .toLowerCase();  // Ensure all lowercase

  switch (normalizedRole) {
    case 'estimator':
      return {
        ...estimatorPermissions,
        projects: {
          create: true,
          view: true,
          edit: true,
          delete: false
        }
      };

    case 'project_manager':
    case 'projectmanager':
    case 'pm':
      return {
        purchaseRequests: {
          create: true,
          view: true,
          edit: true,
          delete: false,
          sendEmail: true,
          approve: true,
          handleCostRevision: true
        },
        vendorQuotations: {
          create: true,
          view: true,
          edit: true,
          delete: false,
          compare: true,
          negotiate: true
        },
        approvals: {
          canApprove: true,
          canReject: true,
          canEscalate: true
        },
        workflow: {
          canSendToProjectManager: false,
          canHandleCostFlag: true,
          canRequestRevision: true
        },
        projects: {
          create: true,
          view: true,
          edit: true,
          delete: true
        }
      };

    case 'technical_director':
    case 'technicaldirector':
    case 'td':
      return {
        purchaseRequests: {
          create: false,
          view: true,
          edit: false,
          delete: false,
          sendEmail: false,
          approve: true,
          handleCostRevision: false
        },
        vendorQuotations: {
          create: false,
          view: true,
          edit: false,
          delete: false,
          compare: true,
          negotiate: false
        },
        approvals: {
          canApprove: true,
          canReject: true,
          canEscalate: false
        },
        workflow: {
          canSendToProjectManager: false,
          canHandleCostFlag: false,
          canRequestRevision: false
        },
        projects: {
          create: false,
          view: true,
          edit: false,
          delete: false
        }
      };

    case 'site_engineer':
    case 'siteengineer':
      return {
        purchaseRequests: {
          create: true,
          view: true,
          edit: true,
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
          canEscalate: true
        },
        workflow: {
          canSendToProjectManager: true,
          canHandleCostFlag: false,
          canRequestRevision: false
        },
        projects: {
          create: false,
          view: true,
          edit: false,
          delete: false
        }
      };

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
        },
        projects: {
          create: true,
          view: true,
          edit: true,
          delete: true
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
        },
        projects: {
          create: false,
          view: false,
          edit: false,
          delete: false
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
    case 'estimator':
      return (await import('@/roles/estimator/pages/EstimatorDashboard')).default;

    case 'project_manager':
    case 'projectmanager':
    case 'pm':
      return (await import('@/roles/project-manager/pages/ProjectManagerHub')).default;

    case 'technical_director':
    case 'technicaldirector':
    case 'td':
      return (await import('@/roles/technical-director/pages/TechnicalDirectorHub')).default;

    case 'site_engineer':
    case 'siteengineer':
      return (await import('@/pages/dashboards/SiteEngineerDashboard')).default;

    case 'admin':
    case 'administrator':
      return (await import('@/pages/dashboards/AdminDashboard')).default;

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
    case 'estimator':
      return '/estimator/dashboard';

    case 'project_manager':
    case 'projectmanager':
    case 'pm':
      return '/project-manager/dashboard';

    case 'technical_director':
    case 'technicaldirector':
    case 'td':
      return '/technical-director/dashboard';

    case 'site_engineer':
    case 'siteengineer':
      return '/site-engineer/dashboard';

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
    'site_engineer',
    'project_manager',
    'technical_director'
  ],
  'vendor_quotations': [
    'project_manager',
    'technical_director'
  ],
  'material_dispatch_production': [
    'project_manager',
    'technical_director'
  ],
  'material_dispatch_site': [
    'site_engineer',
    'project_manager',
    'technical_director'
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