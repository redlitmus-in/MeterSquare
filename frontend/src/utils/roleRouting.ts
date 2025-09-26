import { UserRole } from '@/types';

/**
 * Role-based routing configuration
 * Maps user roles to their specific dashboard paths
 */

/**
 * Map numeric role IDs to role names (based on database)
 * Database structure:
 * 2: siteSupervisor
 * 3: mepSupervisor
 * 4: procurement
 * 5: projectManager
 * 6: design
 * 7: estimation
 * 8: accounts
 * 9: technicalDirector
 */
export const ROLE_ID_TO_NAME: Record<number, string> = {
  2: UserRole.SITE_SUPERVISOR,
  3: UserRole.MEP_SUPERVISOR,
  4: UserRole.PROCUREMENT,
  5: UserRole.PROJECT_MANAGER,
  6: UserRole.DESIGN,
  7: UserRole.ESTIMATION,
  8: UserRole.ACCOUNTS,
  9: UserRole.TECHNICAL_DIRECTOR,
  10: 'estimator' // New estimator role
};

/**
 * Convert camelCase role to URL-friendly slug
 */
export const ROLE_URL_SLUGS: Record<string, string> = {
  [UserRole.SITE_SUPERVISOR]: 'site-supervisor',
  [UserRole.MEP_SUPERVISOR]: 'mep-supervisor',
  [UserRole.PROCUREMENT]: 'procurement',
  [UserRole.PROJECT_MANAGER]: 'project-manager',
  [UserRole.DESIGN]: 'design',
  [UserRole.ESTIMATION]: 'estimation',
  [UserRole.ACCOUNTS]: 'accounts',
  [UserRole.TECHNICAL_DIRECTOR]: 'technical-director',
  'estimator': 'estimator' // New estimator role
};

/**
 * Reverse mapping: URL slug to role
 */
export const URL_SLUG_TO_ROLE: Record<string, UserRole> = Object.entries(ROLE_URL_SLUGS).reduce(
  (acc, [role, slug]) => ({ ...acc, [slug]: role as UserRole }),
  {}
);

export const ROLE_DASHBOARD_PATHS: Record<string, string> = {
  [UserRole.SITE_SUPERVISOR]: '/site-supervisor/dashboard',
  [UserRole.MEP_SUPERVISOR]: '/mep-supervisor/dashboard',
  [UserRole.PROCUREMENT]: '/procurement/dashboard',
  [UserRole.PROJECT_MANAGER]: '/project-manager/dashboard',
  [UserRole.DESIGN]: '/design/dashboard',
  [UserRole.ESTIMATION]: '/estimation/dashboard',
  [UserRole.ACCOUNTS]: '/accounts/dashboard',
  [UserRole.TECHNICAL_DIRECTOR]: '/technical-director/dashboard',
  'estimator': '/estimator/dashboard' // New estimator role
};

/**
 * Get role name from numeric ID or string
 * @param roleId - Numeric role ID or string role name
 * @returns Role name string
 */
export const getRoleName = (roleId: string | number | UserRole): string => {
  // If it's a number, map it to role name
  if (typeof roleId === 'number') {
    return ROLE_ID_TO_NAME[roleId] || UserRole.SITE_SUPERVISOR;
  }
  // If it's already a valid role string, return it
  if (Object.values(UserRole).includes(roleId as UserRole)) {
    return roleId as string;
  }
  // Try to parse as number if it's a string number
  const numId = parseInt(roleId as string);
  if (!isNaN(numId)) {
    return ROLE_ID_TO_NAME[numId] || UserRole.SITE_SUPERVISOR;
  }
  return roleId as string;
};

/**
 * Get role slug for URL
 * @param role - User role (camelCase format, or numeric ID)
 * @returns URL-friendly role slug
 */
export const getRoleSlug = (role: string | number | UserRole): string => {
  const roleName = getRoleName(role);
  return ROLE_URL_SLUGS[roleName as UserRole] || 'user';
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
 * @param role - User role (camelCase format or numeric ID)
 * @returns Dashboard path for the role
 */
export const getRoleDashboardPath = (role: string | number | UserRole): string => {
  const slug = getRoleSlug(role);
  return `/${slug}/dashboard`;
};

/**
 * Get role display name
 * @param role - User role (camelCase format or numeric ID)
 * @returns Human-readable role name
 */
export const getRoleDisplayName = (role: string | number | UserRole): string => {
  const roleName = getRoleName(role);
  const roleNames: Record<string, string> = {
    [UserRole.SITE_SUPERVISOR]: 'Site Supervisor',
    [UserRole.MEP_SUPERVISOR]: 'MEP Supervisor',
    [UserRole.PROCUREMENT]: 'Procurement',
    [UserRole.PROJECT_MANAGER]: 'Project Manager',
    [UserRole.DESIGN]: 'Design',
    [UserRole.ESTIMATION]: 'Estimation',
    [UserRole.ACCOUNTS]: 'Accounts',
    [UserRole.TECHNICAL_DIRECTOR]: 'Technical Director',
    'estimator': 'Estimator' // New estimator role
  };

  return roleNames[roleName as UserRole] || roleNames[roleName] || 'User';
};

/**
 * Get role-specific theme color
 * @param role - User role
 * @returns Tailwind color class for the role
 */
export const getRoleThemeColor = (role: string | UserRole): string => {
  const roleColors: Record<string, string> = {
    [UserRole.SITE_SUPERVISOR]: 'orange',
    [UserRole.MEP_SUPERVISOR]: 'cyan',
    [UserRole.PROCUREMENT]: 'red',
    [UserRole.PROJECT_MANAGER]: 'green',
    [UserRole.DESIGN]: 'purple',
    [UserRole.ESTIMATION]: 'amber',
    [UserRole.ACCOUNTS]: 'emerald',
    [UserRole.TECHNICAL_DIRECTOR]: 'blue',
    'estimator': 'indigo' // New estimator role
  };

  return roleColors[role as UserRole] || roleColors[role] || 'gray';
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
    [UserRole.SITE_SUPERVISOR]: ['/workflows/material-dispatch-site'],
    [UserRole.MEP_SUPERVISOR]: ['/workflows/material-dispatch-site'],
    [UserRole.PROCUREMENT]: ['/procurement', '/vendor'],
    [UserRole.PROJECT_MANAGER]: ['/procurement', '/workflows'],
    [UserRole.DESIGN]: ['/projects', '/workflows'],
    [UserRole.ESTIMATION]: ['/procurement/quotations'],
    [UserRole.ACCOUNTS]: ['/procurement/approvals'],
    'estimator': ['/boq-management', '/cost-analysis', '/projects'] // New estimator role
  };
  
  const allowedRoutes = roleAccess[userRole as UserRole] || [];
  return allowedRoutes.some(route => basePath.startsWith(route));
};