import { NotificationData } from '@/services/notificationService';
import { buildRolePath } from '@/utils/roleRouting';
import { mapNotificationToWorkflow } from '@/config/notificationWorkflows';

interface NotificationRedirectConfig {
  path: string;
  queryParams?: Record<string, string>;
  hash?: string;
}

/**
 * Enhanced notification redirect with workflow mapping
 */
export const getNotificationRedirectPath = (
  notification: NotificationData,
  userRole?: string
): NotificationRedirectConfig | null => {

  // Extract key information from notification
  const { type, category, metadata, title, message } = notification;
  const titleLower = title?.toLowerCase() || '';
  const messageLower = message?.toLowerCase() || '';

  // Build role-specific path
  const buildPath = (path: string) => {
    return userRole ? buildRolePath(userRole, path) : path;
  };

  // First, try to map to a workflow for precise redirect
  const workflow = mapNotificationToWorkflow(title, message, metadata);
  if (workflow) {
    console.log('[NotificationRedirect] Matched workflow:', workflow.id);
    return {
      path: buildPath(workflow.redirectPath),
      queryParams: {
        tab: workflow.redirectTab,
        ...(metadata?.boq_id && { boq_id: metadata.boq_id }),
        ...(metadata?.documentId && { boq_id: metadata.documentId }),
        ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
        ...(metadata?.vendor_id && { vendor_id: metadata.vendor_id }),
        ...(metadata?.po_id && { po_id: metadata.po_id }),
        ...(metadata?.material_id && { material_id: metadata.material_id }),
        ...(metadata?.project_id && { project_id: metadata.project_id }),
        ...(metadata?.task_id && { task_id: metadata.task_id }),
        ...(metadata?.extension_id && { extension_id: metadata.extension_id }),
        ...(metadata?.grn_id && { grn_id: metadata.grn_id }),
        ...(metadata?.dispatch_id && { dispatch_id: metadata.dispatch_id }),
      }
    };
  }

  // PRIORITY: Handle Materials Purchase (Change Request) notifications FIRST
  // These have category='change_request' or title contains 'materials purchase'
  // Must check BEFORE BOQ handling since they may have category='approval'
  if (titleLower.includes('materials purchase') || messageLower.includes('materials purchase') ||
      titleLower.includes('change request') || messageLower.includes('change request') ||
      category === 'change_request' || metadata?.cr_id) {

    console.log('[NotificationRedirect] Matched Materials Purchase/Change Request, request_type:', metadata?.request_type);

    // Determine correct route based on request_type from metadata
    // EXTRA_MATERIALS goes to /extra-material, others go to /change-requests
    const isExtraMaterial = metadata?.request_type === 'EXTRA_MATERIALS';
    const basePath = isExtraMaterial ? '/extra-material' : '/change-requests';

    // Materials Purchase Approved
    if (titleLower.includes('approved') || messageLower.includes('approved')) {
      return {
        path: buildPath(basePath),
        queryParams: {
          tab: isExtraMaterial ? 'accepted' : 'approved',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        },
      };
    }

    // Materials Purchase Rejected
    if (titleLower.includes('rejected') || messageLower.includes('rejected')) {
      return {
        path: buildPath(basePath),
        queryParams: {
          tab: 'rejected',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        },
      };
    }

    // New Materials Purchase Request - for PM/TD to review
    return {
      path: buildPath(basePath),
      queryParams: {
        tab: isExtraMaterial ? 'requested' : 'pending',
        ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
      },
    };
  }

  // Handle BOQ-related notifications (only if NOT materials purchase)
  if (titleLower.includes('boq') || messageLower.includes('boq') ||
      (category === 'approval' && (metadata?.boq_id || metadata?.documentId))) {

    // TD Approved BOQ - redirect to approved tab
    if (titleLower.includes('approved') || messageLower.includes('approved by td') ||
        messageLower.includes('technical director approved')) {
      return {
        path: buildPath('/projects'),
        queryParams: {
          tab: 'approved',
          boq_id: metadata?.boq_id || metadata?.documentId
        }
      };
    }

    // PM Approved BOQ
    if (messageLower.includes('approved by pm') || messageLower.includes('project manager approved')) {
      return {
        path: buildPath('/projects'),
        queryParams: {
          tab: 'pm_approved',
          boq_id: metadata?.boq_id || metadata?.documentId
        }
      };
    }

    // BOQ Pending Approval - for Technical Director, redirect to project-approvals
    if (titleLower.includes('pending') || messageLower.includes('pending approval') ||
        titleLower.includes('new boq') || messageLower.includes('requires your approval') ||
        messageLower.includes('awaiting your approval') || messageLower.includes('needs approval')) {
      // Check if user is Technical Director
      const isTD = userRole && (
        userRole.toString().toLowerCase().includes('technical') ||
        userRole.toString().toLowerCase().includes('director') ||
        userRole === '2' || // TD role_id
        userRole === 2
      );

      return {
        path: buildPath(isTD ? '/project-approvals' : '/projects'),
        queryParams: {
          tab: 'pending',
          boq_id: metadata?.boq_id || metadata?.documentId || metadata?.link?.match(/\d+/)?.[0]
        }
      };
    }

    // BOQ Rejected
    if (titleLower.includes('rejected') || messageLower.includes('rejected')) {
      return {
        path: buildPath('/projects'),
        queryParams: {
          tab: 'rejected',
          boq_id: metadata?.boq_id || metadata?.documentId
        }
      };
    }

    // BOQ Revision Required
    if (titleLower.includes('revision') || messageLower.includes('revision')) {
      return {
        path: buildPath('/projects'),
        queryParams: {
          tab: 'revisions',
          boq_id: metadata?.boq_id || metadata?.documentId
        }
      };
    }

    // Client Confirmed BOQ
    if (messageLower.includes('client confirmed') || messageLower.includes('client approved')) {
      return {
        path: buildPath('/projects'),
        queryParams: {
          tab: 'completed',
          boq_id: metadata?.boq_id || metadata?.documentId
        }
      };
    }

    // Default BOQ redirect - check for BOQ creation or general BOQ notifications
    if (metadata?.boq_id || metadata?.documentId) {
      // Check if user is Technical Director for proper routing
      const isTD = userRole && (
        userRole.toString().toLowerCase().includes('technical') ||
        userRole.toString().toLowerCase().includes('director') ||
        userRole === '2' || // TD role_id
        userRole === 2
      );

      // Default to pending tab for TD, since they usually need to approve
      return {
        path: buildPath(isTD ? '/project-approvals' : '/projects'),
        queryParams: {
          boq_id: metadata?.boq_id || metadata?.documentId,
          tab: isTD ? 'pending' : undefined
        }
      };
    }
  }

  // Handle Vendor notifications (including vendor selection for CR)
  if (titleLower.includes('vendor') || messageLower.includes('vendor') || category === 'vendor') {

    // Check if user is buyer
    const isBuyer = userRole && (
      userRole.toString().toLowerCase().includes('buyer') ||
      userRole.toString().toLowerCase().includes('procurement') ||
      userRole === '8' || userRole === 8
    );

    // Vendor Selection Approved/Rejected for CR (buyer receives these)
    if (titleLower.includes('selection') && titleLower.includes('approved')) {
      return {
        path: buildPath('/purchase-orders'),
        queryParams: {
          tab: 'approved',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
          ...(metadata?.po_child_id && { po_child_id: String(metadata.po_child_id) })
        },
      };
    }

    if (titleLower.includes('selection') && titleLower.includes('rejected')) {
      return {
        path: buildPath('/purchase-orders'),
        queryParams: {
          tab: 'rejected',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
          ...(metadata?.po_child_id && { po_child_id: String(metadata.po_child_id) })
        },
      };
    }

    // Vendor Selection Requires Approval (TD receives this)
    if (titleLower.includes('requires approval') || messageLower.includes('requires approval')) {
      return {
        path: buildPath('/vendor-approval'),
        queryParams: {
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        },
      };
    }

    // Vendor Approved (general vendor approval)
    if (titleLower.includes('approved')) {
      return {
        path: buildPath(isBuyer ? '/vendors' : '/vendors'),
        queryParams: {
          tab: 'approved',
          ...(metadata?.vendor_id && { vendor_id: metadata.vendor_id })
        },
      };
    }

    // Vendor Selected (goes to TD for approval)
    if (titleLower.includes('selected')) {
      return {
        path: buildPath('/vendor-approval'),
        queryParams: {
          ...(metadata?.vendor_id && { vendor_id: metadata.vendor_id }),
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        },
      };
    }

    // New Vendor Registration
    if (titleLower.includes('new vendor') || titleLower.includes('registration')) {
      return {
        path: buildPath('/vendors'),
        queryParams: { tab: 'pending' },
      };
    }

    // SE BOQ Vendor notifications
    if (titleLower.includes('se boq') || messageLower.includes('se boq')) {
      return {
        path: buildPath('/purchase-orders'),
        queryParams: {
          ...(metadata?.assignment_id && { assignment_id: String(metadata.assignment_id) }),
          ...(metadata?.boq_id && { boq_id: String(metadata.boq_id) })
        },
      };
    }
  }

  // Handle Purchase Request notifications (buyer receives these from PM/Estimator)
  if (titleLower.includes('purchase request') || titleLower.includes('new purchase request assigned')) {
    return {
      path: buildPath('/purchase-orders'),
      queryParams: {
        tab: 'pending',
        ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
      },
    };
  }

  // Handle Purchase Order notifications
  if (titleLower.includes('purchase order') || titleLower.includes('po ') || category === 'purchase' || category === 'procurement') {

    // PO Approved
    if (titleLower.includes('approved')) {
      return {
        path: buildPath('/purchase-orders'),
        queryParams: {
          tab: 'approved',
          ...(metadata?.po_id && { po_id: metadata.po_id }),
          ...(metadata?.po_child_id && { po_child_id: String(metadata.po_child_id) })
        },
      };
    }

    // PO Rejected
    if (titleLower.includes('rejected')) {
      return {
        path: buildPath('/purchase-orders'),
        queryParams: {
          tab: 'rejected',
          ...(metadata?.po_id && { po_id: metadata.po_id }),
          ...(metadata?.po_child_id && { po_child_id: String(metadata.po_child_id) })
        },
      };
    }

    // New PO Created
    if (titleLower.includes('new') || titleLower.includes('created')) {
      return {
        path: buildPath('/purchase-orders'),
        queryParams: {
          tab: 'pending',
          ...(metadata?.po_id && { po_id: metadata.po_id })
        },
      };
    }

    // Default PO redirect
    return {
      path: buildPath('/purchase-orders'),
      queryParams: {
        ...(metadata?.po_id && { po_id: metadata.po_id }),
        ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
      },
    };
  }

  // Handle Material/Inventory notifications
  if (titleLower.includes('material') || titleLower.includes('inventory') ||
      titleLower.includes('backup') || titleLower.includes('disposal') ||
      titleLower.includes('return') || category === 'material') {

    // Backup Stock notifications - redirect to Stock In > Backup tab
    if (titleLower.includes('backup') || messageLower.includes('backup stock') ||
        messageLower.includes('added to backup')) {
      return {
        path: buildPath('/stock-management'),
        queryParams: {
          tab: 'stock-in',
          subtab: 'backup',
          ...(metadata?.return_id && { return_id: String(metadata.return_id) }),
          ...(metadata?.material_id && { material_id: metadata.material_id })
        },
      };
    }

    // Disposal notifications - redirect to Stock In > Backup tab (disposal review)
    if (titleLower.includes('disposal') || messageLower.includes('disposal') ||
        messageLower.includes('disposed')) {
      return {
        path: buildPath('/stock-management'),
        queryParams: {
          tab: 'stock-in',
          subtab: 'backup',
          ...(metadata?.return_id && { return_id: String(metadata.return_id) }),
          ...(metadata?.material_id && { material_id: metadata.material_id })
        },
      };
    }

    // Return Approved notifications - for SE, redirect to Material Receipts > Return tab
    if ((titleLower.includes('return') && titleLower.includes('approved')) ||
        messageLower.includes('return approved') || messageLower.includes('return has been approved')) {
      return {
        path: buildPath('/material-receipts'),
        queryParams: {
          tab: 'return',
          ...(metadata?.return_id && { return_id: String(metadata.return_id) })
        },
      };
    }

    // Return Rejected notifications - for SE, redirect to Material Receipts > Return tab
    if ((titleLower.includes('return') && titleLower.includes('rejected')) ||
        messageLower.includes('return rejected') || messageLower.includes('return has been rejected')) {
      return {
        path: buildPath('/material-receipts'),
        queryParams: {
          tab: 'return',
          ...(metadata?.return_id && { return_id: String(metadata.return_id) })
        },
      };
    }

    // Damaged Material Return - needs PM review
    if (titleLower.includes('damaged') || messageLower.includes('damaged material') ||
        messageLower.includes('needs review')) {
      return {
        path: buildPath('/stock-management'),
        queryParams: {
          tab: 'stock-in',
          subtab: 'returns',
          ...(metadata?.return_id && { return_id: String(metadata.return_id) })
        },
      };
    }

    // Low Stock Alert
    if (titleLower.includes('low stock') || messageLower.includes('low stock')) {
      return {
        path: buildPath('/materials'),
        queryParams: {
          tab: 'low_stock',
          material_id: metadata?.material_id
        },
      };
    }

    // Material Request
    if (titleLower.includes('request')) {
      return {
        path: buildPath('/extra-material'),
        queryParams: {
          tab: 'pending',
          request_id: metadata?.request_id
        },
      };
    }

    // Material Dispatch - for SE, redirect to Material Receipts > Pending
    if (titleLower.includes('dispatch') || messageLower.includes('dispatched')) {
      // Check if user is Site Engineer
      const isSE = userRole && (
        userRole.toString().toLowerCase().includes('site') ||
        userRole.toString().toLowerCase().includes('engineer') ||
        userRole === '5' || // SE role_id
        userRole === 5
      );

      if (isSE) {
        return {
          path: buildPath('/material-receipts'),
          queryParams: {
            tab: 'pending',
            ...(metadata?.dispatch_id && { dispatch_id: metadata.dispatch_id })
          },
        };
      }

      return {
        path: buildPath('/m2-store/dispatch'),
        queryParams: {
          dispatch_id: metadata?.dispatch_id
        },
      };
    }

    // Delivery Confirmed - PM notification
    if (titleLower.includes('delivery confirmed') || messageLower.includes('delivery confirmed') ||
        messageLower.includes('confirmed receipt')) {
      return {
        path: buildPath('/stock-management'),
        queryParams: {
          tab: 'stock-out',
          ...(metadata?.delivery_note_id && { delivery_note_id: String(metadata.delivery_note_id) })
        },
      };
    }
  }

  // Handle Task notifications
  if (titleLower.includes('task') || category === 'task') {

    // Task Assigned
    if (titleLower.includes('assigned')) {
      return {
        path: buildPath('/tasks'),
        queryParams: {
          tab: 'assigned',
          task_id: metadata?.task_id
        },
      };
    }

    // Task Completed
    if (titleLower.includes('completed')) {
      return {
        path: buildPath('/tasks'),
        queryParams: {
          tab: 'completed',
          task_id: metadata?.task_id
        },
      };
    }

    // Task Overdue
    if (titleLower.includes('overdue') || messageLower.includes('overdue')) {
      return {
        path: buildPath('/tasks'),
        queryParams: {
          tab: 'overdue',
          task_id: metadata?.task_id
        },
      };
    }
  }

  // Handle Project notifications
  if (titleLower.includes('project') || category === 'project') {

    // Project Assigned
    if (titleLower.includes('assigned')) {
      return {
        path: buildPath('/my-projects'),
        queryParams: {
          project_id: metadata?.project_id
        },
      };
    }

    // Project Milestone
    if (titleLower.includes('milestone')) {
      return {
        path: buildPath('/projects'),
        queryParams: {
          project_id: metadata?.project_id,
          tab: 'milestones'
        },
      };
    }
  }

  // Handle Day Extension notifications
  if (titleLower.includes('day extension') || titleLower.includes('extension request')) {

    // Extension Approved
    if (titleLower.includes('approved')) {
      return {
        path: buildPath('/projects'),
        queryParams: {
          tab: 'extensions',
          status: 'approved',
          extension_id: metadata?.extension_id
        },
      };
    }

    // Extension Pending
    if (titleLower.includes('requested') || titleLower.includes('pending')) {
      return {
        path: buildPath('/project-approvals'),
        queryParams: {
          tab: 'extensions',
          extension_id: metadata?.extension_id
        },
      };
    }
  }

  // Handle Production/M2 Store notifications
  if (titleLower.includes('production') || titleLower.includes('m2 store') || category === 'production') {

    // Stock Received (GRN)
    if (titleLower.includes('received') || titleLower.includes('grn')) {
      return {
        path: buildPath('/m2-store/receive'),
        queryParams: {
          grn_id: metadata?.grn_id
        },
      };
    }

    // Stock Take Alert
    if (titleLower.includes('stock take')) {
      return {
        path: buildPath('/m2-store/stock-take'),
        queryParams: {
          alert_type: 'required'
        },
      };
    }
  }

  // Use metadata.link if provided as fallback
  if (metadata?.link) {
    // Check if the link contains /boq/ pattern and redirect to projects
    if (metadata.link.includes('/boq/')) {
      const boqId = metadata.link.split('/boq/').pop()?.split('?')[0];

      // Check if user is Technical Director for proper routing
      const isTD = userRole && (
        userRole.toString().toLowerCase().includes('technical') ||
        userRole.toString().toLowerCase().includes('director') ||
        userRole === '2' || // TD role_id
        userRole === 2
      );

      return {
        path: buildPath(isTD ? '/project-approvals' : '/projects'),
        queryParams: {
          boq_id: boqId,
          tab: 'pending' // Default to pending tab
        }
      };
    }

    // Parse the link to extract path and query params
    try {
      const url = new URL(metadata.link, window.location.origin);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      return {
        path: url.pathname,
        queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        hash: url.hash || undefined
      };
    } catch (error) {
      // If it's not a valid URL, check for common patterns
      const link = metadata.link;

      // Handle boq links
      if (link.includes('boq')) {
        const boqId = link.match(/\d+/)?.[0];

        // Check if user is Technical Director for proper routing
        const isTD = userRole && (
          userRole.toString().toLowerCase().includes('technical') ||
          userRole.toString().toLowerCase().includes('director') ||
          userRole === '2' || // TD role_id
          userRole === 2
        );

        return {
          path: buildPath(isTD ? '/project-approvals' : '/projects'),
          queryParams: {
            boq_id: boqId,
            tab: 'pending'
          }
        };
      }

      // Default: treat it as a path
      return {
        path: metadata.link.startsWith('/') ? metadata.link : `/${metadata.link}`,
      };
    }
  }

  // Default to dashboard if no specific redirect
  return null;
};

/**
 * Builds the full URL with query parameters and hash
 */
export const buildNotificationUrl = (config: NotificationRedirectConfig): string => {
  let url = config.path;

  // Add query parameters
  if (config.queryParams && Object.keys(config.queryParams).length > 0) {
    const params = new URLSearchParams(config.queryParams);
    url += `?${params.toString()}`;
  }

  // Add hash
  if (config.hash) {
    url += config.hash;
  }

  return url;
};