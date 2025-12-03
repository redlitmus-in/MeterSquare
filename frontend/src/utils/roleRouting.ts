import { UserRole } from '@/types';

/**
 * Role-based routing configuration
 * Maps user roles to their specific dashboard paths
 *
 * NOTE: This file uses ROLE NAMES (strings) from the backend, not role IDs.
 * The backend returns the role name directly in the login response (e.g., 'admin', 'estimator').
 * No need to map role IDs to names - the backend handles that.
 */

/**
 * Convert camelCase role to URL-friendly slug
 */
export const ROLE_URL_SLUGS: Record<string, string> = {
  'admin': 'admin',
  'siteEngineer': 'site-engineer',
  'buyer': 'buyer',
  [UserRole.SITE_SUPERVISOR]: 'site-supervisor',
  [UserRole.MEP_SUPERVISOR]: 'mep-supervisor',
  [UserRole.MEP]: 'mep',  // Management level MEP (shares PM functionality)
  [UserRole.PROCUREMENT]: 'procurement',
  [UserRole.PROJECT_MANAGER]: 'project-manager',
  [UserRole.PRODUCTION_MANAGER]: 'production-manager',
  [UserRole.DESIGN]: 'design',
  [UserRole.ESTIMATION]: 'estimator', // Map estimation to estimator URL
  [UserRole.ESTIMATOR]: 'estimator',
  [UserRole.ACCOUNTS]: 'accounts',
  [UserRole.TECHNICAL_DIRECTOR]: 'technical-director',
};

/**
 * Reverse mapping: URL slug to role
 */
export const URL_SLUG_TO_ROLE: Record<string, UserRole> = Object.entries(ROLE_URL_SLUGS).reduce(
  (acc, [role, slug]) => ({ ...acc, [slug]: role as UserRole }),
  {}
);

export const ROLE_DASHBOARD_PATHS: Record<string, string> = {
  'admin': '/admin/dashboard',
  'siteEngineer': '/site-engineer/dashboard',
  'buyer': '/buyer/dashboard',
  [UserRole.SITE_SUPERVISOR]: '/site-supervisor/dashboard',
  [UserRole.MEP_SUPERVISOR]: '/mep-supervisor/dashboard',
  [UserRole.MEP]: '/mep/dashboard',  // Management level MEP dashboard
  [UserRole.PROCUREMENT]: '/procurement/dashboard',
  [UserRole.PROJECT_MANAGER]: '/project-manager/dashboard',
  [UserRole.PRODUCTION_MANAGER]: '/production-manager/dashboard',
  [UserRole.DESIGN]: '/design/dashboard',
  [UserRole.ESTIMATION]: '/estimator/dashboard', // Map estimation to estimator dashboard
  [UserRole.ESTIMATOR]: '/estimator/dashboard',
  [UserRole.ACCOUNTS]: '/accounts/dashboard',
  [UserRole.TECHNICAL_DIRECTOR]: '/technical-director/dashboard',
};

/**
 * Get role name from string role
 * The backend returns role names directly (e.g., 'admin', 'estimator')
 * @param role - String role name from backend
 * @returns Role name string
 */
export const getRoleName = (role: string | UserRole): string => {
  if (typeof role === 'string' && role.length > 0) {
    // Check if it's a valid UserRole enum value
    if (Object.values(UserRole).includes(role as UserRole)) {
      return role;
    }
    // Check if it's in ROLE_URL_SLUGS keys (covers 'admin', 'siteEngineer', 'buyer', etc.)
    if (role in ROLE_URL_SLUGS) {
      return role;
    }
    // Return as-is (backend sends role name directly)
    return role;
  }
  // Fallback to site supervisor
  return UserRole.SITE_SUPERVISOR;
};

/**
 * Get role slug for URL
 * @param role - User role (camelCase format)
 * @returns URL-friendly role slug
 */
export const getRoleSlug = (role: string | UserRole): string => {
  const roleName = getRoleName(role);
  return ROLE_URL_SLUGS[roleName] || ROLE_URL_SLUGS[roleName as UserRole] || 'user';
};

/**
 * Get role from URL slug
 * @param slug - URL slug
 * @returns User role or null if invalid
 */
export const getRoleFromSlug = (slug: string): UserRole | null => {
  return URL_SLUG_TO_ROLE[slug] || null;
};

/**
 * Get dashboard path for a specific role
 * @param role - User role (camelCase format)
 * @returns Dashboard path for the role
 */
export const getRoleDashboardPath = (role: string | UserRole): string => {
  const slug = getRoleSlug(role);
  return `/${slug}/dashboard`;
};

/**
 * Get role display name
 * @param role - User role (camelCase format)
 * @returns Human-readable role name
 */
export const getRoleDisplayName = (role: string | UserRole): string => {
  const roleName = getRoleName(role);
  const roleNames: Record<string, string> = {
    'admin': 'Admin',
    'siteEngineer': 'Site Engineer',
    'buyer': 'Buyer',
    [UserRole.SITE_SUPERVISOR]: 'Site Supervisor',
    [UserRole.MEP_SUPERVISOR]: 'MEP Supervisor',
    [UserRole.MEP]: 'MEP Supervisor',  // Display as "MEP Supervisor" in UI
    [UserRole.PROCUREMENT]: 'Procurement',
    [UserRole.PROJECT_MANAGER]: 'Project Manager',
    [UserRole.PRODUCTION_MANAGER]: 'Production Manager',
    [UserRole.DESIGN]: 'Design',
    [UserRole.ESTIMATION]: 'Estimator', // Map to Estimator display name
    [UserRole.ESTIMATOR]: 'Estimator',
    [UserRole.ACCOUNTS]: 'Accounts',
    [UserRole.TECHNICAL_DIRECTOR]: 'Technical Director',
  };

  return roleNames[roleName as UserRole] || roleNames[roleName] || 'User';
};

/**
 * Get role-specific theme color
 * @param role - User role
 * @returns Tailwind color class for the role
 */
export const getRoleThemeColor = (role: string | UserRole): string => {
  const roleName = getRoleName(role);

  const roleColors: Record<string, string> = {
    'admin': 'purple',
    'siteEngineer': 'orange',
    'buyer': 'orange',
    [UserRole.SITE_SUPERVISOR]: 'orange',
    [UserRole.MEP_SUPERVISOR]: 'cyan',
    [UserRole.MEP]: 'cyan',  // Cyan for MEP (management level) - distinct from PM green
    [UserRole.PROCUREMENT]: 'red',
    [UserRole.PROJECT_MANAGER]: 'green',
    [UserRole.PRODUCTION_MANAGER]: 'amber',
    [UserRole.DESIGN]: 'purple',
    [UserRole.ESTIMATION]: 'indigo', // Map to indigo (same as estimator)
    [UserRole.ESTIMATOR]: 'indigo',
    [UserRole.ACCOUNTS]: 'emerald',
    [UserRole.TECHNICAL_DIRECTOR]: 'blue',
  };

  return roleColors[roleName as UserRole] || roleColors[roleName] || 'gray';
};

/**
 * Build a role-prefixed path
 * @param role - User role
 * @param path - Base path without role prefix
 * @returns Full path with role prefix
 */
export const buildRolePath = (role: string | UserRole, path: string): string => {
  const slug = getRoleSlug(role);
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/${slug}${normalizedPath}`;
};

/**
 * Extract base path from role-prefixed URL
 * @param fullPath - Full path with role prefix
 * @returns Base path without role prefix
 */
export const extractBasePath = (fullPath: string): string => {
  // Remove role prefix from path
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length > 0 && URL_SLUG_TO_ROLE[parts[0]]) {
    // First part is a role slug, remove it
    return '/' + parts.slice(1).join('/');
  }
  return fullPath;
};

/**
 * Check if user has access to a specific route
 * @param userRole - Current user's role
 * @param routePath - Route path to check (with or without role prefix)
 * @returns Boolean indicating access permission
 */
export const hasRouteAccess = (userRole: string | UserRole, routePath: string): boolean => {
  // Extract base path (remove role prefix if present)
  const basePath = extractBasePath(routePath);
  
  // Technical Director has access to all routes
  if (userRole === UserRole.TECHNICAL_DIRECTOR) {
    return true;
  }
  
  // Common routes accessible to all roles
  const commonRoutes = ['/dashboard', '/profile', '/tasks', '/projects', '/analytics', '/workflow-status', '/process-flow'];
  if (commonRoutes.some(route => basePath.startsWith(route))) {
    return true;
  }
  
  // Role-specific access rules
  const roleAccess: Record<string, string[]> = {
    'admin': ['/'], // Admin has access to all routes
    'siteEngineer': ['/projects', '/materials', '/tasks', '/reports'],
    'buyer': ['/materials', '/projects', '/purchase-orders', '/store'], // Buyer access
    [UserRole.SITE_SUPERVISOR]: ['/workflows/material-dispatch-site'],
    [UserRole.MEP_SUPERVISOR]: ['/workflows/material-dispatch-site'],
    [UserRole.MEP]: ['/procurement', '/workflows', '/projects', '/team', '/boq'],  // Same access as PM
    [UserRole.PROCUREMENT]: ['/procurement', '/vendor'],
    [UserRole.PROJECT_MANAGER]: ['/procurement', '/workflows', '/projects', '/team'],
    [UserRole.PRODUCTION_MANAGER]: ['/production', '/materials', '/projects', '/workflows', '/m2-store'],
    [UserRole.DESIGN]: ['/projects', '/workflows'],
    [UserRole.ESTIMATION]: ['/boq', '/estimation', '/projects', '/cost-analysis'], // Map to estimator access
    [UserRole.ESTIMATOR]: ['/boq', '/estimation', '/projects', '/cost-analysis'],
    [UserRole.ACCOUNTS]: ['/procurement/approvals'],
    [UserRole.TECHNICAL_DIRECTOR]: ['/'], // Technical Director has access to all routes
  };
  
  const allowedRoutes = roleAccess[userRole as UserRole] || [];
  return allowedRoutes.some(route => basePath.startsWith(route));
};