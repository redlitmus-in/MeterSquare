/**
 * Estimator Role Permissions
 * Defines all permissions for the Estimator role
 */

export const estimatorPermissions = {
  // BOQ Management
  boq: {
    create: true,
    view: true,
    edit: true,
    delete: true,
    approve: true,
    sendForConfirmation: true,
    uploadPDF: true,
    extractData: true,
    preview: true,
    export: true
  },

  // Sections Management
  sections: {
    create: true,
    view: true,
    edit: true,
    delete: true,
    reorder: true
  },

  // Items Management
  items: {
    create: true,
    view: true,
    edit: true,
    delete: true,
    updateRates: true,
    updateQuantities: true,
    bulkEdit: true
  },

  // Cost Analysis
  costAnalysis: {
    viewCosts: true,
    compareCosts: true,
    generateReports: true,
    viewTrends: true,
    exportAnalysis: true
  },

  // Project Access
  projects: {
    view: true,
    createBOQ: true,
    viewBOQHistory: true,
    compareVersions: true
  },

  // Workflow
  workflow: {
    canSubmitBOQ: true,
    canApproveBOQ: true,
    canRejectBOQ: true,
    canRequestRevision: true,
    canSendToProcurement: true,
    canSendToProjectManager: true
  },

  // Reports
  reports: {
    viewReports: true,
    generateReports: true,
    exportReports: true,
    scheduleReports: true
  },

  // Notifications
  notifications: {
    receiveBOQUpdates: true,
    receiveCostAlerts: true,
    receiveApprovalRequests: true
  },

  // Dashboard
  dashboard: {
    viewMetrics: true,
    viewPendingBOQs: true,
    viewApprovedBOQs: true,
    viewProjectSummary: true,
    viewCostTrends: true
  }
};

/**
 * Check if estimator has a specific permission
 */
export const hasEstimatorPermission = (
  category: keyof typeof estimatorPermissions,
  permission: string
): boolean => {
  return (estimatorPermissions as any)?.[category]?.[permission] || false;
};