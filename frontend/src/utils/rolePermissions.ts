/**
 * Role Permission Utilities
 * Helper functions to check if a user has permission to perform actions
 * Admin has ALL permissions by default
 */

interface User {
  role?: string;
  role_id?: number | string;
}

/**
 * Check if user is admin
 */
export const isAdmin = (user: User | null): boolean => {
  if (!user) return false;

  const userRole = user.role?.toLowerCase();
  const roleId = user.role_id;

  return (
    userRole === 'admin' ||
    roleId === 'admin' ||
    roleId === 5 || // Admin role_id in database
    roleId === 1    // Some systems use 1 for admin
  );
};

/**
 * Check if user is Project Manager (or Admin)
 */
export const isProjectManager = (user: User | null): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const userRole = user.role?.toLowerCase();
  const roleId = user.role_id;

  return (
    userRole === 'projectmanager' ||
    userRole === 'project manager' ||
    userRole === 'project_manager' ||
    roleId === 'projectManager' ||
    roleId === 5
  );
};

/**
 * Check if user is Technical Director (or Admin)
 */
export const isTechnicalDirector = (user: User | null): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const userRole = user.role?.toLowerCase();
  const roleId = user.role_id;

  return (
    userRole === 'technicaldirector' ||
    userRole === 'technical director' ||
    userRole === 'technical_director' ||
    roleId === 'technicalDirector' ||
    roleId === 7
  );
};

/**
 * Check if user is Estimator (or Admin)
 */
export const isEstimator = (user: User | null): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const userRole = user.role?.toLowerCase();
  const roleId = user.role_id;

  return (
    userRole === 'estimator' ||
    userRole === 'estimation' ||
    roleId === 'estimator' ||
    roleId === 4
  );
};

/**
 * Check if user is Site Engineer/Supervisor (or Admin)
 */
export const isSiteEngineer = (user: User | null): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const userRole = user.role?.toLowerCase();
  const roleId = user.role_id;

  return (
    userRole === 'siteengineer' ||
    userRole === 'site engineer' ||
    userRole === 'site_engineer' ||
    userRole === 'sitesupervisor' ||
    userRole === 'site supervisor' ||
    userRole === 'site_supervisor' ||
    roleId === 'siteEngineer' ||
    roleId === 2
  );
};

/**
 * Check if user is Buyer (or Admin)
 */
export const isBuyer = (user: User | null): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const userRole = user.role?.toLowerCase();
  const roleId = user.role_id;

  return (
    userRole === 'buyer' ||
    roleId === 'buyer' ||
    roleId === 8
  );
};

/**
 * Permission checks for specific actions
 */
export const permissions = {
  // BOQ Permissions
  canCreateBOQ: (user: User | null): boolean => {
    return isAdmin(user) || isEstimator(user);
  },

  canEditBOQ: (user: User | null): boolean => {
    return isAdmin(user) || isEstimator(user);
  },

  canDeleteBOQ: (user: User | null): boolean => {
    return isAdmin(user) || isEstimator(user);
  },

  canApproveBOQ: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user) || isTechnicalDirector(user);
  },

  canRejectBOQ: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user) || isTechnicalDirector(user);
  },

  canSendBOQToClient: (user: User | null): boolean => {
    return isAdmin(user) || isEstimator(user);
  },

  // User Management Permissions
  canCreateUser: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user) || isTechnicalDirector(user);
  },

  canEditUser: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user) || isTechnicalDirector(user);
  },

  canDeleteUser: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user) || isTechnicalDirector(user);
  },

  // Project Manager Permissions
  canCreateSiteEngineer: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user);
  },

  canCreateBuyer: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user);
  },

  canAssignProjects: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user) || isTechnicalDirector(user);
  },

  // Technical Director Permissions
  canCreateProjectManager: (user: User | null): boolean => {
    return isAdmin(user) || isTechnicalDirector(user);
  },

  canApproveVendor: (user: User | null): boolean => {
    return isAdmin(user) || isTechnicalDirector(user);
  },

  // Change Request Permissions
  canCreateChangeRequest: (user: User | null): boolean => {
    return isAdmin(user) || isProjectManager(user) || isSiteEngineer(user);
  },

  canApproveChangeRequest: (user: User | null): boolean => {
    return isAdmin(user) || isEstimator(user) || isTechnicalDirector(user);
  },

  canRejectChangeRequest: (user: User | null): boolean => {
    return isAdmin(user) || isEstimator(user) || isTechnicalDirector(user);
  },

  // Vendor Permissions
  canManageVendors: (user: User | null): boolean => {
    return isAdmin(user) || isBuyer(user) || isTechnicalDirector(user);
  },

  canSelectVendor: (user: User | null): boolean => {
    return isAdmin(user) || isBuyer(user);
  },

  // Purchase Permissions
  canCompletePurchase: (user: User | null): boolean => {
    return isAdmin(user) || isBuyer(user);
  },

  // Project Completion
  canRequestCompletion: (user: User | null): boolean => {
    return isAdmin(user) || isSiteEngineer(user);
  },

  // View all data (admin only)
  canViewAllData: (user: User | null): boolean => {
    return isAdmin(user);
  }
};
