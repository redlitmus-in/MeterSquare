import { NotificationData } from '@/services/notificationService';
import { buildRolePath } from '@/utils/roleRouting';
import { normalizeRole } from '@/utils/roleNormalization';

export interface NotificationRedirectConfig {
  path: string;
  queryParams?: Record<string, string | undefined>;
  hash?: string;
}

// ─────────────────────────────────────────────────────────────
// Redirect Rule Definition
// Each rule has a matcher (checks title/message/category/metadata)
// and a resolver (returns the correct path + tab for the user's role)
// ─────────────────────────────────────────────────────────────

interface RedirectRule {
  id: string;
  match: (ctx: MatchContext) => boolean;
  resolve: (ctx: MatchContext) => NotificationRedirectConfig;
}

interface MatchContext {
  title: string;
  message: string;
  titleLower: string;
  messageLower: string;
  category?: string;
  type?: string;
  metadata?: Record<string, any>;
  role: string; // normalized role slug (e.g., 'buyer', 'estimator', 'technical-director')
  buildPath: (path: string) => string;
}

// ─────────────────────────────────────────────────────────────
// Helper: check if text contains any of the given keywords
// ─────────────────────────────────────────────────────────────
const has = (text: string, ...keywords: string[]) =>
  keywords.some(k => text.includes(k));

// ─────────────────────────────────────────────────────────────
// Helper: PM uses /my-projects, others use /projects
// ─────────────────────────────────────────────────────────────
const projectsPath = (role: string): string =>
  role === 'project-manager' ? '/my-projects' : '/projects';

// ─────────────────────────────────────────────────────────────
// All redirect rules – ordered by specificity (most specific first)
// ─────────────────────────────────────────────────────────────
const REDIRECT_RULES: RedirectRule[] = [

  // ═══════════════════════════════════════════════════════════
  // ASSET REQUISITION (check before generic "asset" rules)
  // ═══════════════════════════════════════════════════════════
  // IMPORTANT: Specific asset_requisition rules MUST come before the generic catch-all
  {
    id: 'asset_requisition_approved',
    match: ({ titleLower, category }) =>
      category === 'asset_requisition' && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const reqParam = metadata?.requisition_id ? { requisition_id: String(metadata.requisition_id) } : {};
      if (role === 'project-manager') {
        return { path: buildPath('/asset-requisition-approvals'), queryParams: { tab: 'approved', ...reqParam } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/returnable-assets'), queryParams: reqParam };
      }
      return { path: buildPath('/site-assets'), queryParams: { status: 'approved', ...reqParam } };
    }
  },
  {
    id: 'asset_requisition_rejected',
    match: ({ titleLower, category }) =>
      category === 'asset_requisition' && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      const reqParam = metadata?.requisition_id ? { requisition_id: String(metadata.requisition_id) } : {};
      if (role === 'project-manager') {
        return { path: buildPath('/asset-requisition-approvals'), queryParams: { tab: 'rejected', ...reqParam } };
      }
      return { path: buildPath('/site-assets'), queryParams: { status: 'rejected', ...reqParam } };
    }
  },
  {
    id: 'asset_requisition_dispatched',
    match: ({ titleLower, category }) =>
      category === 'asset_requisition' && has(titleLower, 'dispatched'),
    resolve: ({ buildPath, metadata, role }) => {
      const reqParam = metadata?.requisition_id ? { requisition_id: String(metadata.requisition_id) } : {};
      if (role === 'production-manager') {
        return { path: buildPath('/returnable-assets/dispatch'), queryParams: reqParam };
      }
      return { path: buildPath('/site-assets'), queryParams: { status: 'dispatched', ...reqParam } };
    }
  },
  {
    // Generic catch-all for any asset_requisition notification (created, new, etc.)
    // MUST be AFTER specific approved/rejected/dispatched rules
    id: 'asset_requisition_created',
    match: ({ titleLower, category }) =>
      category === 'asset_requisition' ||
      (has(titleLower, 'asset requisition') && has(titleLower, 'created', 'new', 'submitted')),
    resolve: ({ buildPath, metadata, role }) => {
      const reqParam = metadata?.requisition_id ? { requisition_id: String(metadata.requisition_id) } : {};
      if (role === 'project-manager') {
        return { path: buildPath('/asset-requisition-approvals'), queryParams: { tab: 'pending', ...reqParam } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/returnable-assets'), queryParams: reqParam };
      }
      return { path: buildPath('/site-assets'), queryParams: reqParam };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // RETURNABLE ASSETS (dispatch, receive, return, maintenance)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'asset_dispatched',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'dispatched'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets')
    })
  },
  {
    id: 'asset_received',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'received'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets')
    })
  },
  {
    id: 'asset_return',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'return'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets')
    })
  },
  {
    id: 'asset_maintenance',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'maintenance', 'repair', 'write off', 'write_off', 'written off'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets')
    })
  },

  // ═══════════════════════════════════════════════════════════
  // SUPPORT TICKETS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'support_ticket',
    match: ({ titleLower, category }) =>
      category === 'support' || has(titleLower, 'support ticket', 'ticket'),
    resolve: ({ buildPath, metadata, role }) => {
      const ticketParam = metadata?.ticket_id ? { ticket_id: String(metadata.ticket_id) } : {};
      if (role === 'admin' || has(role, 'support')) {
        return { path: '/support-management', queryParams: ticketParam };
      }
      return { path: buildPath('/support'), queryParams: ticketParam };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // DAY EXTENSION
  // TD receives "Extension Request" → project-approvals?tab=assigned&boq_id=X
  // PM receives "Extension Approved/Rejected" → my-projects?boq_id=X
  // ═══════════════════════════════════════════════════════════
  {
    id: 'extension_approved',
    match: ({ titleLower }) =>
      has(titleLower, 'extension') && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const hasMy = role === 'project-manager' || role === 'technical-director' || role === 'admin';
      return {
        path: buildPath(hasMy ? '/my-projects' : '/projects'),
        queryParams: { ...(metadata?.boq_id && { boq_id: String(metadata.boq_id) }) }
      };
    }
  },
  {
    id: 'extension_rejected',
    match: ({ titleLower }) =>
      has(titleLower, 'extension') && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      const hasMy = role === 'project-manager' || role === 'technical-director' || role === 'admin';
      return {
        path: buildPath(hasMy ? '/my-projects' : '/projects'),
        queryParams: { ...(metadata?.boq_id && { boq_id: String(metadata.boq_id) }) }
      };
    }
  },
  {
    id: 'extension_requested',
    match: ({ titleLower }) =>
      has(titleLower, 'extension') && has(titleLower, 'request', 'pending'),
    resolve: ({ buildPath, metadata, role }) => {
      const hasMy = role === 'project-manager' || role === 'technical-director' || role === 'admin';
      return {
        path: buildPath(role === 'technical-director' ? '/project-approvals' : (hasMy ? '/my-projects' : '/projects')),
        queryParams: {
          ...(role === 'technical-director' && { tab: 'assigned' }),
          ...(metadata?.boq_id && { boq_id: String(metadata.boq_id) })
        }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // INVENTORY: BACKUP / DISPOSAL / DAMAGED RETURNS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'material_backup_stock',
    match: ({ titleLower, messageLower }) =>
      has(titleLower, 'backup') || has(messageLower, 'backup stock', 'added to backup'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/material-receipts'), queryParams: { tab: 'return', ...(metadata?.return_id && { return_id: String(metadata.return_id) }) } };
      }
      if (role === 'production-manager') {
        return {
          path: buildPath('/m2-store/stock-in'),
          queryParams: { ...(metadata?.return_id && { return_id: String(metadata.return_id) }), ...(metadata?.material_id && { material_id: String(metadata.material_id) }) }
        };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'material_disposal',
    match: ({ titleLower, messageLower }) =>
      has(titleLower, 'disposal') || has(messageLower, 'disposal', 'disposed'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/material-receipts'), queryParams: { tab: 'return', ...(metadata?.return_id && { return_id: String(metadata.return_id) }) } };
      }
      if (role === 'technical-director') {
        return { path: buildPath('/disposal-approvals'), queryParams: { ...(metadata?.material_id && { material_id: String(metadata.material_id) }) } };
      }
      if (role === 'production-manager') {
        return {
          path: buildPath('/m2-store/disposal'),
          queryParams: { ...(metadata?.return_id && { return_id: String(metadata.return_id) }), ...(metadata?.material_id && { material_id: String(metadata.material_id) }) }
        };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'material_damaged_return',
    match: ({ titleLower, messageLower }) =>
      has(titleLower, 'damaged') || has(messageLower, 'damaged material', 'needs review'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/material-receipts'), queryParams: { tab: 'return', ...(metadata?.return_id && { return_id: String(metadata.return_id) }) } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/receive-returns'), queryParams: { ...(metadata?.return_id && { return_id: String(metadata.return_id) }) } };
      }
      return { path: buildPath('/projects') };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // INVENTORY: RETURN APPROVED / REJECTED (SE receives)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'material_return_approved',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'return') && has(titleLower, 'approved')) ||
      has(messageLower, 'return approved', 'return has been approved'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/receive-returns'), queryParams: { ...(metadata?.return_id && { return_id: String(metadata.return_id) }) } };
      }
      return {
        path: buildPath('/material-receipts'),
        queryParams: { tab: 'return', ...(metadata?.return_id && { return_id: String(metadata.return_id) }) }
      };
    }
  },
  {
    id: 'material_return_rejected',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'return') && has(titleLower, 'rejected')) ||
      has(messageLower, 'return rejected', 'return has been rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/receive-returns'), queryParams: { ...(metadata?.return_id && { return_id: String(metadata.return_id) }) } };
      }
      return {
        path: buildPath('/material-receipts'),
        queryParams: { tab: 'return', ...(metadata?.return_id && { return_id: String(metadata.return_id) }) }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // DELIVERY NOTES (dispatch / confirmed)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'delivery_confirmed',
    match: ({ titleLower, messageLower }) =>
      has(titleLower, 'delivery confirmed') || has(messageLower, 'delivery confirmed', 'confirmed receipt'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/material-receipts'), queryParams: { ...(metadata?.delivery_note_id && { delivery_note_id: String(metadata.delivery_note_id) }) } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-out'), queryParams: { ...(metadata?.delivery_note_id && { delivery_note_id: String(metadata.delivery_note_id) }) } };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'material_dispatched',
    match: ({ titleLower, messageLower, category }) =>
      category !== 'assets' && category !== 'asset_requisition' && category !== 'labour' && category !== 'support' &&
      (has(titleLower, 'dispatch', 'dispatched') || has(messageLower, 'dispatched')),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return {
          path: buildPath('/material-receipts'),
          queryParams: { tab: 'pending', ...(metadata?.dispatch_id && { dispatch_id: String(metadata.dispatch_id) }) }
        };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/dispatch'), queryParams: { ...(metadata?.dispatch_id && { dispatch_id: String(metadata.dispatch_id) }) } };
      }
      return { path: buildPath('/projects') };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // LOW STOCK ALERT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'low_stock',
    match: ({ titleLower, messageLower }) =>
      has(titleLower, 'low stock') || has(messageLower, 'low stock'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/change-requests') };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/materials-catalog'), queryParams: { ...(metadata?.material_id && { material_id: String(metadata.material_id) }) } };
      }
      if (role === 'estimator') {
        return { path: buildPath('/projects') };
      }
      return {
        path: buildPath('/materials'),
        queryParams: { tab: 'low_stock', ...(metadata?.material_id && { material_id: String(metadata.material_id) }) }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CHANGE REQUEST / MATERIALS PURCHASE (must come before BOQ)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'cr_approved',
    match: ({ titleLower, messageLower, category, metadata }) =>
      (category === 'change_request' || has(titleLower, 'materials purchase', 'change request') || !!metadata?.cr_id) &&
      has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const isEstimator = role === 'estimator';
      const isExtraMaterial = metadata?.request_type === 'EXTRA_MATERIALS';
      const basePath = isEstimator ? '/change-requests' : (isExtraMaterial ? '/extra-material' : '/change-requests');
      return {
        path: buildPath(basePath),
        queryParams: {
          tab: isExtraMaterial && !isEstimator ? 'accepted' : 'approved',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        }
      };
    }
  },
  {
    id: 'cr_rejected',
    match: ({ titleLower, messageLower, category, metadata }) =>
      (category === 'change_request' || has(titleLower, 'materials purchase', 'change request') || !!metadata?.cr_id) &&
      has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      const isEstimator = role === 'estimator';
      const isExtraMaterial = metadata?.request_type === 'EXTRA_MATERIALS';
      const basePath = isEstimator ? '/change-requests' : (isExtraMaterial ? '/extra-material' : '/change-requests');
      return {
        path: buildPath(basePath),
        queryParams: { tab: 'rejected', ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }) }
      };
    }
  },
  {
    id: 'cr_purchase_completed',
    match: ({ titleLower, messageLower, category, metadata }) =>
      (category === 'change_request' || !!metadata?.cr_id) &&
      has(titleLower, 'purchase completed', 'purchase complete'),
    resolve: ({ buildPath, metadata, role }) => {
      const noPO = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      return {
        path: buildPath(noPO ? '/change-requests' : '/purchase-orders'),
        queryParams: { tab: 'completed', ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }) }
      };
    }
  },
  {
    id: 'cr_new',
    match: ({ titleLower, messageLower, category, metadata }) =>
      category === 'change_request' || has(titleLower, 'materials purchase', 'change request') ||
      (!!metadata?.cr_id && !has(titleLower, 'vendor')),
    resolve: ({ buildPath, metadata, role }) => {
      const isEstimator = role === 'estimator';
      const isExtraMaterial = metadata?.request_type === 'EXTRA_MATERIALS';
      const basePath = isEstimator ? '/change-requests' : (isExtraMaterial ? '/extra-material' : '/change-requests');
      return {
        path: buildPath(basePath),
        queryParams: {
          tab: isExtraMaterial && !isEstimator ? 'requested' : 'pending',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // VENDOR SELECTION FOR CR
  // ═══════════════════════════════════════════════════════════
  {
    id: 'vendor_selection_approved',
    match: ({ titleLower }) =>
      has(titleLower, 'vendor') && has(titleLower, 'selection') && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const noPO = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      return {
        path: buildPath(noPO ? '/change-requests' : '/purchase-orders'),
        queryParams: {
          tab: 'approved',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
          ...(metadata?.po_child_id && { po_child_id: String(metadata.po_child_id) })
        }
      };
    }
  },
  {
    id: 'vendor_selection_rejected',
    match: ({ titleLower }) =>
      has(titleLower, 'vendor') && has(titleLower, 'selection') && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      const noPO = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      return {
        path: buildPath(noPO ? '/change-requests' : '/purchase-orders'),
        queryParams: {
          tab: 'rejected',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
          ...(metadata?.po_child_id && { po_child_id: String(metadata.po_child_id) })
        }
      };
    }
  },
  {
    id: 'vendor_selection_requires_approval',
    match: ({ titleLower, messageLower }) =>
      has(titleLower, 'vendor') && (
        has(titleLower, 'requires approval', 'need approval', 'needs approval') ||
        has(messageLower, 'requires approval', 'need approval', 'needs approval') ||
        has(titleLower, 'selected', 'selections')
      ),
    resolve: ({ buildPath, metadata }) => ({
      path: buildPath('/change-requests'),
      queryParams: {
        ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
        ...(metadata?.vendor_id && { vendor_id: String(metadata.vendor_id) })
      }
    })
  },
  {
    id: 'vendor_approved',
    match: ({ titleLower, category }) =>
      (category === 'vendor' || has(titleLower, 'vendor')) && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const noVendors = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      if (noVendors) {
        return { path: buildPath('/projects') };
      }
      return {
        path: buildPath('/vendors'),
        queryParams: { tab: 'approved', ...(metadata?.vendor_id && { vendor_id: String(metadata.vendor_id) }) }
      };
    }
  },
  {
    id: 'vendor_registration',
    match: ({ titleLower }) =>
      has(titleLower, 'new vendor', 'vendor registration'),
    resolve: ({ buildPath, role }) => {
      const noVendors = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      if (noVendors) {
        return { path: buildPath('/projects') };
      }
      return {
        path: buildPath('/vendors'),
        queryParams: { tab: 'pending' }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // PURCHASE REQUEST ASSIGNED TO BUYER
  // ═══════════════════════════════════════════════════════════
  {
    id: 'purchase_request_assigned',
    match: ({ titleLower }) =>
      has(titleLower, 'purchase request') || has(titleLower, 'new purchase request assigned'),
    resolve: ({ buildPath, metadata, role }) => {
      const noPO = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      return {
        path: buildPath(noPO ? '/change-requests' : '/purchase-orders'),
        queryParams: { tab: 'pending', ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }) }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // PURCHASE ORDER
  // ═══════════════════════════════════════════════════════════
  {
    id: 'po_approved',
    match: ({ titleLower, category }) =>
      (has(titleLower, 'purchase order') || category === 'purchase' || category === 'procurement') &&
      has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const noPO = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      return {
        path: buildPath(noPO ? '/change-requests' : '/purchase-orders'),
        queryParams: {
          tab: 'approved',
          ...(metadata?.po_id && { po_id: String(metadata.po_id) }),
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        }
      };
    }
  },
  {
    id: 'po_rejected',
    match: ({ titleLower, category }) =>
      (has(titleLower, 'purchase order') || category === 'purchase' || category === 'procurement') &&
      has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      const noPO = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      return {
        path: buildPath(noPO ? '/change-requests' : '/purchase-orders'),
        queryParams: {
          tab: 'rejected',
          ...(metadata?.po_id && { po_id: String(metadata.po_id) }),
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        }
      };
    }
  },
  {
    id: 'po_generic',
    match: ({ titleLower, category }) =>
      has(titleLower, 'purchase order') || category === 'purchase' || category === 'procurement',
    resolve: ({ buildPath, metadata, role }) => {
      const noPO = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';
      return {
        path: buildPath(noPO ? '/change-requests' : '/purchase-orders'),
        queryParams: {
          tab: has(metadata?.documentType?.toLowerCase() || '', 'new', 'created') ? 'pending' : undefined,
          ...(metadata?.po_id && { po_id: String(metadata.po_id) }),
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // BOQ WORKFLOW
  // ═══════════════════════════════════════════════════════════
  {
    id: 'boq_client_confirmed',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) &&
      (has(messageLower, 'client confirmed', 'client approved') || has(titleLower, 'approved by client')),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'client_response', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_client_rejected',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) &&
      (has(messageLower, 'client rejected') || has(titleLower, 'rejected by client')),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'client_response', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_sent_to_client',
    match: ({ titleLower }) =>
      has(titleLower, 'sent to client'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'sent_to_client', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_td_approved',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) &&
      (has(titleLower, 'approved by td', 'approved by technical director') ||
       has(messageLower, 'technical director approved', 'approved by td')),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'approved', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_pm_approved',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) &&
      (has(messageLower, 'approved by pm', 'project manager approved')),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'pm_approved', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_approved_generic',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'approved', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_rejected',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'rejected', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  // ── Approved revisions must come BEFORE generic revision rules ──
  {
    id: 'boq_internal_revision_approved',
    match: ({ titleLower }) =>
      has(titleLower, 'internal revision') && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(role === 'technical-director' ? '/project-approvals' : projectsPath(role)),
      queryParams: { tab: 'approved', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_client_revision_approved',
    match: ({ titleLower }) =>
      has(titleLower, 'client revision') && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(role === 'technical-director' ? '/project-approvals' : projectsPath(role)),
      queryParams: { tab: 'approved', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_revision',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) && has(titleLower, 'revision'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'revisions', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },
  {
    id: 'boq_internal_revision',
    match: ({ titleLower }) =>
      has(titleLower, 'internal revision'),
    resolve: ({ buildPath, metadata, role }) => {
      const boqParam = metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {};
      if (role === 'technical-director') {
        return {
          path: buildPath('/project-approvals'),
          queryParams: { tab: 'revisions', subtab: 'internal', ...boqParam }
        };
      }
      return {
        path: buildPath(projectsPath(role)),
        queryParams: { tab: 'revisions', ...boqParam }
      };
    }
  },
  {
    id: 'boq_pending',
    match: ({ titleLower, messageLower, category, metadata }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq') ||
       (category === 'approval' && (metadata?.boq_id || metadata?.documentId))) &&
      (has(titleLower, 'pending', 'new boq', 'created') ||
       has(messageLower, 'requires your approval', 'awaiting your approval', 'needs approval')),
    resolve: ({ buildPath, metadata, role, messageLower }) => {
      // PM has "For Approval" tab for BOQs needing their approval, "Pending" for others
      const isPMApproval = role === 'project-manager' &&
        has(messageLower, 'requires your approval', 'awaiting your approval', 'needs approval');
      const tab = role === 'technical-director' ? 'pending' : (isPMApproval ? 'for_approval' : 'pending');
      return {
        path: buildPath(role === 'technical-director' ? '/project-approvals' : projectsPath(role)),
        queryParams: { tab, ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
      };
    }
  },
  {
    id: 'boq_generic',
    match: ({ titleLower, messageLower, category, metadata }) =>
      has(titleLower, 'boq') || has(messageLower, 'boq') ||
      (category === 'approval' && (metadata?.boq_id || metadata?.documentId)),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(role === 'technical-director' ? '/project-approvals' : projectsPath(role)),
      queryParams: { ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
    })
  },

  // ═══════════════════════════════════════════════════════════
  // PROJECT ASSIGNMENT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'project_assigned',
    match: ({ titleLower, category }) =>
      (category === 'project' || has(titleLower, 'project')) && has(titleLower, 'assigned'),
    resolve: ({ buildPath, metadata, role }) => {
      const hasMy = role === 'project-manager' || role === 'technical-director' || role === 'admin';
      return {
        path: buildPath(hasMy ? '/my-projects' : '/projects'),
        queryParams: { ...(metadata?.project_id && { project_id: String(metadata.project_id) }) }
      };
    }
  },
  {
    id: 'se_items_assigned',
    match: ({ titleLower, category }) =>
      category === 'assignment' || has(titleLower, 'items assigned', 'se assigned', 'se boq'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { ...(metadata?.boq_id && { boq_id: String(metadata.boq_id) }) }
    })
  },
  {
    id: 'completion_request',
    match: ({ titleLower }) =>
      has(titleLower, 'completion') && has(titleLower, 'request', 'confirmation'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { ...(metadata?.boq_id && { boq_id: String(metadata.boq_id) }) }
    })
  },

  // ═══════════════════════════════════════════════════════════
  // MATERIAL REQUEST (extra material)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'extra_material',
    match: ({ titleLower }) =>
      has(titleLower, 'extra material') || has(titleLower, 'material request'),
    resolve: ({ buildPath, metadata }) => ({
      path: buildPath('/extra-material'),
      queryParams: {
        tab: has(metadata?.title?.toLowerCase() || '', 'approved') ? 'approved' : 'pending',
        ...(metadata?.request_id && { request_id: String(metadata.request_id) })
      }
    })
  },

  // ═══════════════════════════════════════════════════════════
  // PRODUCTION / GRN
  // ═══════════════════════════════════════════════════════════
  {
    id: 'stock_received',
    match: ({ titleLower }) =>
      has(titleLower, 'stock received', 'grn'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/material-receipts') };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/receive'), queryParams: { ...(metadata?.grn_id && { grn_id: String(metadata.grn_id) }) } };
      }
      return { path: buildPath('/projects') };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // LABOUR WORKFLOW
  // SE→PM requisition, PM approve/reject, PM→Production, Production→SE+PM
  // ═══════════════════════════════════════════════════════════
  {
    id: 'labour_workers_assigned',
    match: ({ titleLower, category }) =>
      category === 'labour' && has(titleLower, 'workers assigned'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/labour/arrivals' : '/labour/approvals'),
      queryParams: { ...(metadata?.requisition_id && { requisition_id: String(metadata.requisition_id) }) }
    })
  },
  {
    id: 'labour_assignment_pending',
    match: ({ titleLower, category }) =>
      category === 'labour' && has(titleLower, 'assignment pending'),
    resolve: ({ buildPath, metadata, role }) => {
      const isSE = role === 'site-engineer' || role === 'site-supervisor';
      const isProdMgr = role === 'production-manager';
      const path = isSE ? '/labour/requisitions' : isProdMgr ? '/labour/assignments' : '/labour/approvals';
      return {
        path: buildPath(path),
        queryParams: { ...(metadata?.requisition_id && { requisition_id: String(metadata.requisition_id) }) }
      };
    }
  },
  {
    id: 'labour_requisition_approved',
    match: ({ titleLower, category }) =>
      category === 'labour' && has(titleLower, 'requisition') && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(role === 'project-manager' ? '/labour/approvals' : '/labour/requisitions'),
      queryParams: { ...(metadata?.requisition_id && { requisition_id: String(metadata.requisition_id) }) }
    })
  },
  {
    id: 'labour_requisition_rejected',
    match: ({ titleLower, category }) =>
      category === 'labour' && has(titleLower, 'requisition') && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(role === 'project-manager' ? '/labour/approvals' : '/labour/requisitions'),
      queryParams: { ...(metadata?.requisition_id && { requisition_id: String(metadata.requisition_id) }) }
    })
  },
  {
    // IMPORTANT: Must come AFTER approved/rejected rules since those titles also contain "requisition"
    id: 'labour_requisition_received',
    match: ({ titleLower, category }) =>
      category === 'labour' && has(titleLower, 'requisition received'),
    resolve: ({ buildPath, metadata, role }) => {
      const isSE = role === 'site-engineer' || role === 'site-supervisor';
      return {
        path: buildPath(isSE ? '/labour/requisitions' : '/labour/approvals'),
        queryParams: { ...(metadata?.requisition_id && { requisition_id: String(metadata.requisition_id) }) }
      };
    }
  },
  {
    id: 'labour_attendance_locked',
    match: ({ titleLower, category }) =>
      category === 'labour' && has(titleLower, 'attendance locked', 'locked for payroll'),
    resolve: ({ buildPath, metadata, role }) => {
      const isSE = role === 'site-engineer' || role === 'site-supervisor';
      const isPM = role === 'project-manager';
      const path = isSE ? '/labour/attendance' : isPM ? '/labour/attendance-lock' : '/labour/payroll';
      return {
        path: buildPath(path),
        queryParams: { ...(metadata?.project_id && { project_id: String(metadata.project_id) }) }
      };
    }
  },
  {
    id: 'labour_generic',
    match: ({ category }) => category === 'labour',
    resolve: ({ buildPath, role, metadata }) => {
      const labourPath =
        role === 'admin' ? '/labour/payroll' :
        role === 'production-manager' ? '/labour/assignments' :
        role === 'site-engineer' || role === 'site-supervisor' ? '/labour/requisitions' :
        role === 'project-manager' ? '/labour/approvals' :
        '/projects';
      return {
        path: buildPath(labourPath),
        queryParams: { ...(metadata?.requisition_id && { requisition_id: String(metadata.requisition_id) }) }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // TASK
  // ═══════════════════════════════════════════════════════════
  {
    id: 'task_assigned',
    match: ({ titleLower, category }) =>
      (category === 'task' || has(titleLower, 'task')) && has(titleLower, 'assigned'),
    resolve: ({ buildPath, metadata }) => ({
      path: buildPath('/tasks'),
      queryParams: { tab: 'assigned', ...(metadata?.task_id && { task_id: String(metadata.task_id) }) }
    })
  },
  {
    id: 'task_completed',
    match: ({ titleLower, category }) =>
      (category === 'task' || has(titleLower, 'task')) && has(titleLower, 'completed'),
    resolve: ({ buildPath, metadata }) => ({
      path: buildPath('/tasks'),
      queryParams: { tab: 'completed', ...(metadata?.task_id && { task_id: String(metadata.task_id) }) }
    })
  },
  {
    id: 'task_overdue',
    match: ({ titleLower, messageLower }) =>
      has(titleLower, 'overdue') || has(messageLower, 'overdue'),
    resolve: ({ buildPath, metadata }) => ({
      path: buildPath('/tasks'),
      queryParams: { tab: 'overdue', ...(metadata?.task_id && { task_id: String(metadata.task_id) }) }
    })
  },
];

// ─────────────────────────────────────────────────────────────
// Main entry: resolve a notification to its redirect config
// ─────────────────────────────────────────────────────────────
export const getNotificationRedirectPath = (
  notification: NotificationData,
  userRole?: string
): NotificationRedirectConfig | null => {
  const { type, category, metadata, title, message } = notification;
  const titleLower = title?.toLowerCase() || '';
  const messageLower = message?.toLowerCase() || '';

  const roleSlug = userRole ? normalizeRole(userRole) : '';
  const buildPath = (path: string) => userRole ? buildRolePath(userRole, path) : path;

  const ctx: MatchContext = {
    title: title || '',
    message: message || '',
    titleLower,
    messageLower,
    category,
    type,
    metadata,
    role: roleSlug,
    buildPath,
  };

  // Find first matching rule
  for (const rule of REDIRECT_RULES) {
    if (rule.match(ctx)) {
      const config = rule.resolve(ctx);
      // Clean undefined values from queryParams
      if (config.queryParams) {
        const cleaned: Record<string, string> = {};
        for (const [k, v] of Object.entries(config.queryParams)) {
          if (v !== undefined && v !== null && v !== 'undefined') {
            cleaned[k] = v;
          }
        }
        config.queryParams = Object.keys(cleaned).length > 0 ? cleaned : undefined;
      }
      return config;
    }
  }

  // ─── Fallback: Use metadata.link ────────────────────────────
  if (metadata?.link) {
    if (metadata.link.includes('/boq/')) {
      const boqId = metadata.link.split('/boq/').pop()?.split('?')[0];
      return {
        path: buildPath(roleSlug === 'technical-director' ? '/project-approvals' : projectsPath(roleSlug)),
        queryParams: { boq_id: boqId || '', tab: 'pending' }
      };
    }
    try {
      const url = new URL(metadata.link, window.location.origin);
      const qp: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { qp[k] = v; });
      return { path: url.pathname, queryParams: Object.keys(qp).length > 0 ? qp : undefined, hash: url.hash || undefined };
    } catch {
      return { path: metadata.link.startsWith('/') ? metadata.link : `/${metadata.link}` };
    }
  }

  return null;
};

// ─────────────────────────────────────────────────────────────
// Build the full URL string from a redirect config
// ─────────────────────────────────────────────────────────────
export const buildNotificationUrl = (config: NotificationRedirectConfig): string => {
  let url = config.path;
  if (config.queryParams && Object.keys(config.queryParams).length > 0) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(config.queryParams)) {
      if (v !== undefined && v !== null) params.set(k, v);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  if (config.hash) url += config.hash;
  return url;
};
