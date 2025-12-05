/**
 * Comprehensive Notification Workflows Configuration
 * Maps all role interactions and their corresponding notifications
 */

export interface NotificationWorkflow {
  id: string;
  name: string;
  triggerEvent: string;
  senderRole: string;
  recipientRole: string;
  notificationType: string;
  redirectPath: string;
  redirectTab: string;
  metadata: Record<string, any>;
}

export const NOTIFICATION_WORKFLOWS: NotificationWorkflow[] = [
  // ============= ESTIMATOR WORKFLOWS =============

  // 1. Estimator creates BOQ and sends to TD for approval
  {
    id: 'est_create_boq',
    name: 'BOQ Created for Approval',
    triggerEvent: 'boq.created',
    senderRole: 'estimator',
    recipientRole: 'technical-director',
    notificationType: 'approval',
    redirectPath: '/project-approvals',
    redirectTab: 'pending',
    metadata: { priority: 'high', category: 'approval' }
  },

  // 2. TD approves BOQ → Notifies Estimator
  {
    id: 'td_approve_boq',
    name: 'BOQ Approved by TD',
    triggerEvent: 'boq.td_approved',
    senderRole: 'technical-director',
    recipientRole: 'estimator',
    notificationType: 'success',
    redirectPath: '/projects',
    redirectTab: 'approved',
    metadata: { priority: 'medium', category: 'approval' }
  },

  // 3. TD rejects BOQ → Notifies Estimator
  {
    id: 'td_reject_boq',
    name: 'BOQ Rejected by TD',
    triggerEvent: 'boq.td_rejected',
    senderRole: 'technical-director',
    recipientRole: 'estimator',
    notificationType: 'error',
    redirectPath: '/projects',
    redirectTab: 'rejected',
    metadata: { priority: 'high', category: 'approval' }
  },

  // 4. TD requests revision → Notifies Estimator
  {
    id: 'td_revision_boq',
    name: 'BOQ Revision Required',
    triggerEvent: 'boq.revision_required',
    senderRole: 'technical-director',
    recipientRole: 'estimator',
    notificationType: 'alert',
    redirectPath: '/projects',
    redirectTab: 'revisions',
    metadata: { priority: 'high', category: 'approval' }
  },

  // 5. Estimator sends BOQ to client (after TD approval)
  {
    id: 'est_send_client',
    name: 'BOQ Sent to Client',
    triggerEvent: 'boq.sent_to_client',
    senderRole: 'estimator',
    recipientRole: 'technical-director',
    notificationType: 'info',
    redirectPath: '/projects',
    redirectTab: 'sent_to_client',
    metadata: { priority: 'medium', category: 'project' }
  },

  // 6. Client approves BOQ → Notifies TD (shows in client response tab)
  {
    id: 'client_approve_boq',
    name: 'BOQ Approved by Client',
    triggerEvent: 'boq.client_approved',
    senderRole: 'estimator',
    recipientRole: 'technical-director',
    notificationType: 'success',
    redirectPath: '/projects',
    redirectTab: 'client_response',
    metadata: { priority: 'high', category: 'approval' }
  },

  // 7. Client rejects BOQ → Notifies TD and Estimator
  {
    id: 'client_reject_boq',
    name: 'BOQ Rejected by Client',
    triggerEvent: 'boq.client_rejected',
    senderRole: 'estimator',
    recipientRole: 'technical-director',
    notificationType: 'error',
    redirectPath: '/projects',
    redirectTab: 'client_response',
    metadata: { priority: 'urgent', category: 'approval' }
  },

  // ============= PROJECT MANAGER WORKFLOWS =============

  // 8. TD assigns project to PM
  {
    id: 'td_assign_pm',
    name: 'Project Assigned to PM',
    triggerEvent: 'project.pm_assigned',
    senderRole: 'technical-director',
    recipientRole: 'project-manager',
    notificationType: 'info',
    redirectPath: '/my-projects',
    redirectTab: 'assigned',
    metadata: { priority: 'high', category: 'project' }
  },

  // 9. PM approves BOQ → Notifies TD
  {
    id: 'pm_approve_boq',
    name: 'BOQ Approved by PM',
    triggerEvent: 'boq.pm_approved',
    senderRole: 'project-manager',
    recipientRole: 'technical-director',
    notificationType: 'success',
    redirectPath: '/projects',
    redirectTab: 'pm_approved',
    metadata: { priority: 'medium', category: 'approval' }
  },

  // 10. PM confirms project completion
  {
    id: 'pm_complete_project',
    name: 'Project Marked Complete',
    triggerEvent: 'project.completed',
    senderRole: 'project-manager',
    recipientRole: 'technical-director',
    notificationType: 'success',
    redirectPath: '/projects',
    redirectTab: 'completed',
    metadata: { priority: 'medium', category: 'project' }
  },

  // ============= SITE ENGINEER WORKFLOWS =============

  // 11. TD assigns Site Engineer to project
  {
    id: 'td_assign_se',
    name: 'Assigned to Project as SE',
    triggerEvent: 'project.se_assigned',
    senderRole: 'technical-director',
    recipientRole: 'site-engineer',
    notificationType: 'info',
    redirectPath: '/my-projects',
    redirectTab: 'active',
    metadata: { priority: 'high', category: 'project' }
  },

  // 12. Site Engineer completes task
  {
    id: 'se_complete_task',
    name: 'Task Completed by SE',
    triggerEvent: 'task.completed',
    senderRole: 'site-engineer',
    recipientRole: 'project-manager',
    notificationType: 'success',
    redirectPath: '/tasks',
    redirectTab: 'completed',
    metadata: { priority: 'medium', category: 'task' }
  },

  // 13. Site Engineer reports issue
  {
    id: 'se_report_issue',
    name: 'Issue Reported on Site',
    triggerEvent: 'issue.reported',
    senderRole: 'site-engineer',
    recipientRole: 'project-manager',
    notificationType: 'alert',
    redirectPath: '/projects',
    redirectTab: 'issues',
    metadata: { priority: 'urgent', category: 'project' }
  },

  // ============= CHANGE REQUEST WORKFLOWS =============

  // 14. PM creates change request
  {
    id: 'pm_create_cr',
    name: 'New Change Request',
    triggerEvent: 'cr.created',
    senderRole: 'project-manager',
    recipientRole: 'technical-director',
    notificationType: 'approval',
    redirectPath: '/change-requests',
    redirectTab: 'pending',
    metadata: { priority: 'high', category: 'change_request' }
  },

  // 15. TD approves change request
  {
    id: 'td_approve_cr',
    name: 'Change Request Approved',
    triggerEvent: 'cr.approved',
    senderRole: 'technical-director',
    recipientRole: 'project-manager',
    notificationType: 'success',
    redirectPath: '/change-requests',
    redirectTab: 'approved',
    metadata: { priority: 'medium', category: 'change_request' }
  },

  // 16. TD rejects change request
  {
    id: 'td_reject_cr',
    name: 'Change Request Rejected',
    triggerEvent: 'cr.rejected',
    senderRole: 'technical-director',
    recipientRole: 'project-manager',
    notificationType: 'error',
    redirectPath: '/change-requests',
    redirectTab: 'rejected',
    metadata: { priority: 'high', category: 'change_request' }
  },

  // ============= BUYER WORKFLOWS =============

  // 17. Buyer creates vendor
  {
    id: 'buyer_create_vendor',
    name: 'New Vendor Registration',
    triggerEvent: 'vendor.created',
    senderRole: 'buyer',
    recipientRole: 'technical-director',
    notificationType: 'approval',
    redirectPath: '/vendors',
    redirectTab: 'pending',
    metadata: { priority: 'medium', category: 'vendor' }
  },

  // 18. TD approves vendor
  {
    id: 'td_approve_vendor',
    name: 'Vendor Approved',
    triggerEvent: 'vendor.approved',
    senderRole: 'technical-director',
    recipientRole: 'buyer',
    notificationType: 'success',
    redirectPath: '/vendors',
    redirectTab: 'approved',
    metadata: { priority: 'medium', category: 'vendor' }
  },

  // 19. Buyer selects vendor for CR
  {
    id: 'buyer_select_vendor',
    name: 'Vendor Selected for CR',
    triggerEvent: 'vendor.selected',
    senderRole: 'buyer',
    recipientRole: 'project-manager',
    notificationType: 'info',
    redirectPath: '/change-requests',
    redirectTab: 'vendor_selected',
    metadata: { priority: 'medium', category: 'vendor' }
  },

  // 20. Purchase order created
  {
    id: 'buyer_create_po',
    name: 'Purchase Order Created',
    triggerEvent: 'po.created',
    senderRole: 'buyer',
    recipientRole: 'technical-director',
    notificationType: 'approval',
    redirectPath: '/purchase-orders',
    redirectTab: 'pending',
    metadata: { priority: 'high', category: 'procurement' }
  },

  // 21. TD approves purchase order
  {
    id: 'td_approve_po',
    name: 'Purchase Order Approved',
    triggerEvent: 'po.approved',
    senderRole: 'technical-director',
    recipientRole: 'buyer',
    notificationType: 'success',
    redirectPath: '/purchase-orders',
    redirectTab: 'approved',
    metadata: { priority: 'medium', category: 'procurement' }
  },

  // 22. Purchase completed
  {
    id: 'buyer_complete_purchase',
    name: 'Purchase Completed',
    triggerEvent: 'purchase.completed',
    senderRole: 'buyer',
    recipientRole: 'project-manager',
    notificationType: 'success',
    redirectPath: '/purchase-orders',
    redirectTab: 'completed',
    metadata: { priority: 'medium', category: 'procurement' }
  },

  // ============= MATERIAL REQUEST WORKFLOWS =============

  // 23. PM/SE requests extra material
  {
    id: 'pm_request_material',
    name: 'Extra Material Request',
    triggerEvent: 'material.requested',
    senderRole: 'project-manager',
    recipientRole: 'technical-director',
    notificationType: 'approval',
    redirectPath: '/extra-material',
    redirectTab: 'pending',
    metadata: { priority: 'high', category: 'material' }
  },

  // 24. TD approves extra material
  {
    id: 'td_approve_material',
    name: 'Extra Material Approved',
    triggerEvent: 'material.approved',
    senderRole: 'technical-director',
    recipientRole: 'project-manager',
    notificationType: 'success',
    redirectPath: '/extra-material',
    redirectTab: 'approved',
    metadata: { priority: 'medium', category: 'material' }
  },

  // ============= PRODUCTION MANAGER WORKFLOWS =============

  // 25. Material received at M2 store
  {
    id: 'prod_receive_stock',
    name: 'Stock Received (GRN)',
    triggerEvent: 'stock.received',
    senderRole: 'production-manager',
    recipientRole: 'buyer',
    notificationType: 'info',
    redirectPath: '/m2-store/receive',
    redirectTab: 'recent',
    metadata: { priority: 'low', category: 'production' }
  },

  // 26. Material dispatched from M2 store
  {
    id: 'prod_dispatch_material',
    name: 'Material Dispatched',
    triggerEvent: 'material.dispatched',
    senderRole: 'production-manager',
    recipientRole: 'project-manager',
    notificationType: 'info',
    redirectPath: '/m2-store/dispatch',
    redirectTab: 'recent',
    metadata: { priority: 'medium', category: 'production' }
  },

  // 27. Low stock alert
  {
    id: 'prod_low_stock',
    name: 'Low Stock Alert',
    triggerEvent: 'stock.low',
    senderRole: 'system',
    recipientRole: 'production-manager',
    notificationType: 'alert',
    redirectPath: '/m2-store/materials',
    redirectTab: 'low_stock',
    metadata: { priority: 'urgent', category: 'production' }
  },

  // ============= DAY EXTENSION WORKFLOWS =============

  // 28. PM requests day extension
  {
    id: 'pm_request_extension',
    name: 'Day Extension Request',
    triggerEvent: 'extension.requested',
    senderRole: 'project-manager',
    recipientRole: 'technical-director',
    notificationType: 'approval',
    redirectPath: '/project-approvals',
    redirectTab: 'extensions',
    metadata: { priority: 'high', category: 'project' }
  },

  // 29. TD approves day extension
  {
    id: 'td_approve_extension',
    name: 'Day Extension Approved',
    triggerEvent: 'extension.approved',
    senderRole: 'technical-director',
    recipientRole: 'project-manager',
    notificationType: 'success',
    redirectPath: '/my-projects',
    redirectTab: 'extensions',
    metadata: { priority: 'medium', category: 'project' }
  },

  // 30. TD rejects day extension
  {
    id: 'td_reject_extension',
    name: 'Day Extension Rejected',
    triggerEvent: 'extension.rejected',
    senderRole: 'technical-director',
    recipientRole: 'project-manager',
    notificationType: 'error',
    redirectPath: '/my-projects',
    redirectTab: 'extensions',
    metadata: { priority: 'high', category: 'project' }
  }
];

// Helper function to get workflow by trigger event
export function getWorkflowByTrigger(triggerEvent: string): NotificationWorkflow | undefined {
  return NOTIFICATION_WORKFLOWS.find(w => w.triggerEvent === triggerEvent);
}

// Helper function to get workflows for a specific role
export function getWorkflowsForRole(role: string): NotificationWorkflow[] {
  const roleLower = role.toLowerCase();
  return NOTIFICATION_WORKFLOWS.filter(w =>
    w.recipientRole.toLowerCase() === roleLower ||
    w.senderRole.toLowerCase() === roleLower
  );
}

// Map notification content to workflow
export function mapNotificationToWorkflow(
  title: string,
  message: string,
  metadata?: any
): NotificationWorkflow | undefined {
  const titleLower = title.toLowerCase();
  const messageLower = message.toLowerCase();

  // Check for BOQ workflows
  if (titleLower.includes('boq') || messageLower.includes('boq')) {
    if (titleLower.includes('approved by client') || messageLower.includes('client approved')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'client_approve_boq');
    }
    if (titleLower.includes('rejected by client') || messageLower.includes('client rejected')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'client_reject_boq');
    }
    if (titleLower.includes('sent to client')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'est_send_client');
    }
    if (titleLower.includes('approved by td') || messageLower.includes('technical director approved')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_approve_boq');
    }
    if (titleLower.includes('rejected')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_reject_boq');
    }
    if (titleLower.includes('revision')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_revision_boq');
    }
    // Match "New BOQ for Approval", "BOQ Pending", "BOQ Created"
    if (titleLower.includes('new boq') || titleLower.includes('pending') || titleLower.includes('created') ||
        messageLower.includes('requires your approval') || messageLower.includes('awaiting your approval')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'est_create_boq');
    }
  }

  // Check for Change Request workflows
  if (titleLower.includes('change request') || messageLower.includes('change request')) {
    if (titleLower.includes('approved')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_approve_cr');
    }
    if (titleLower.includes('rejected')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_reject_cr');
    }
    if (titleLower.includes('new') || titleLower.includes('created')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'pm_create_cr');
    }
  }

  // Check for Vendor workflows
  if (titleLower.includes('vendor')) {
    if (titleLower.includes('approved')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_approve_vendor');
    }
    if (titleLower.includes('selected')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'buyer_select_vendor');
    }
    if (titleLower.includes('registration') || titleLower.includes('new vendor')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'buyer_create_vendor');
    }
  }

  // Check for Purchase Order workflows
  if (titleLower.includes('purchase order') || titleLower.includes(' po ')) {
    if (titleLower.includes('approved')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_approve_po');
    }
    if (titleLower.includes('created')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'buyer_create_po');
    }
    if (titleLower.includes('completed')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'buyer_complete_purchase');
    }
  }

  // Check for Project Assignment
  if (titleLower.includes('assigned') || messageLower.includes('assigned')) {
    if (messageLower.includes('project manager') || messageLower.includes('pm')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_assign_pm');
    }
    if (messageLower.includes('site engineer') || messageLower.includes('se')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_assign_se');
    }
  }

  // Check for Extension workflows
  if (titleLower.includes('extension') || messageLower.includes('extension')) {
    if (titleLower.includes('approved')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_approve_extension');
    }
    if (titleLower.includes('rejected')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_reject_extension');
    }
    if (titleLower.includes('request')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'pm_request_extension');
    }
  }

  // Check for Material workflows
  if (titleLower.includes('material')) {
    if (titleLower.includes('extra') && titleLower.includes('approved')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'td_approve_material');
    }
    if (titleLower.includes('extra') && titleLower.includes('request')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'pm_request_material');
    }
    if (titleLower.includes('dispatched')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'prod_dispatch_material');
    }
  }

  // Check for Stock/Production workflows
  if (titleLower.includes('stock') || titleLower.includes('grn')) {
    if (titleLower.includes('received')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'prod_receive_stock');
    }
    if (titleLower.includes('low stock')) {
      return NOTIFICATION_WORKFLOWS.find(w => w.id === 'prod_low_stock');
    }
  }

  return undefined;
}