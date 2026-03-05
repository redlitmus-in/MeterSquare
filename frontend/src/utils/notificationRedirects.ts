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
        return { path: buildPath('/returnable-assets/dispatch'), queryParams: reqParam };
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
        return { path: buildPath('/returnable-assets/dispatch'), queryParams: reqParam };
      }
      return { path: buildPath('/site-assets'), queryParams: reqParam };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // RETURNABLE ASSETS (dispatch, receive, return, maintenance)
  // ═══════════════════════════════════════════════════════════

  // ─── ADN Dispatched (PM sent assets to site) → SE goes to site-assets ───
  {
    id: 'adn_dispatched',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'adn_dispatched' ||
      has(titleLower, 'assets dispatched to site'),
    resolve: ({ buildPath, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/site-assets'), queryParams: { tab: 'assets' } };
      }
      return { path: buildPath('/returnable-assets/dispatch'), queryParams: {} };
    }
  },

  // ─── ARDN Created (SE created a return note) → PM goes to receive-returns ───
  {
    id: 'ardn_created',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'ardn_created' ||
      has(titleLower, 'asset return note created'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/returnable-assets/receive-returns'), queryParams: {} };
      }
      return { path: buildPath('/site-assets'), queryParams: { tab: 'returns' } };
    }
  },

  // ─── ARDN Issued (SE issued a return note, pending dispatch) → PM goes to receive-returns ───
  {
    id: 'ardn_issued',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'ardn_issued' ||
      has(titleLower, 'asset return note issued'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/returnable-assets/receive-returns'), queryParams: {} };
      }
      return { path: buildPath('/site-assets'), queryParams: { tab: 'returns' } };
    }
  },

  // ─── ARDN Dispatched (SE sent assets back to store) → PM goes to receive-returns ───
  // Must be before generic asset_return / asset_dispatched rules
  {
    id: 'ardn_dispatched',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'ardn_dispatched' ||
      has(titleLower, 'asset return in transit'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/returnable-assets/receive-returns'), queryParams: {} };
      }
      return { path: buildPath('/site-assets'), queryParams: { tab: 'history' } };
    }
  },

  // ─── Asset Returned (good condition) → PM goes to stock-in ───
  // Must be before generic asset_return rule
  {
    id: 'asset_returned_good',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'asset_returned_good' ||
      (has(titleLower, 'asset') && has(titleLower, 'returned', 'return') && has(titleLower, 'good', 'received')),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/returnable-assets/stock-in'), queryParams: { tab: 'returns' } };
      }
      return { path: buildPath('/site-assets'), queryParams: { tab: 'history' } };
    }
  },
  {
    id: 'asset_dispatched',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'dispatched'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets/stock-in')
    })
  },
  {
    id: 'asset_received',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'received'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets/stock-in')
    })
  },
  {
    id: 'asset_return',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'return'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets/stock-in')
    })
  },
  {
    id: 'asset_maintenance',
    match: ({ titleLower, category }) =>
      category === 'assets' && has(titleLower, 'maintenance', 'repair', 'write off', 'write_off', 'written off'),
    resolve: ({ buildPath, role }) => ({
      path: buildPath(role === 'site-engineer' || role === 'site-supervisor' ? '/site-assets' : '/returnable-assets/repairs')
    })
  },

  // ─── Asset Disposal (request, approved, rejected) ───
  {
    id: 'asset_disposal_request',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'asset_disposal_request' ||
      has(titleLower, 'asset disposal request'),
    resolve: ({ buildPath, role }) => {
      if (role === 'technical-director') {
        return { path: buildPath('/asset-disposal-approvals'), queryParams: {} };
      }
      return { path: buildPath('/returnable-assets'), queryParams: {} };
    }
  },
  {
    id: 'asset_disposal_approved',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'asset_disposal_approved' ||
      has(titleLower, 'asset disposal approved'),
    resolve: ({ buildPath }) => ({
      path: buildPath('/returnable-assets'), queryParams: {}
    })
  },
  {
    id: 'asset_disposal_rejected',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'asset_disposal_rejected' ||
      has(titleLower, 'asset disposal rejected'),
    resolve: ({ buildPath }) => ({
      path: buildPath('/returnable-assets'), queryParams: {}
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
          ...(metadata?.boq_id && { boq_id: String(metadata.boq_id) }),
          ...(metadata?.view_extension && { view_extension: 'true' })
        }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // STORE MATERIAL REQUEST REJECTED (Buyer receives rejection from PM)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'store_material_request_rejected',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'store') && has(titleLower, 'material') && has(titleLower, 'request') && has(titleLower, 'rejected')) ||
      has(messageLower, 'store request', 'rejected store'),
    resolve: ({ buildPath, metadata, role }) => {
      const isBuyer = role === 'buyer' || role === 'procurement';

      if (isBuyer) {
        // Buyer goes to Rejected tab to see the rejected store request
        return {
          path: buildPath('/purchase-orders'),
          queryParams: {
            tab: 'rejected',
            ...(metadata?.request_id && { request_id: String(metadata.request_id) }),
            ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
          }
        };
      }

      // Production Manager goes to store stock rejected tab
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-out'), queryParams: { tab: 'rejected' } };
      }

      return { path: buildPath('/projects') };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // VENDOR RETURN REQUESTS (must come before generic return/vendor/cr rules)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'vendor_return_delivery_partial',
    match: ({ titleLower, metadata }) =>
      has(titleLower, 'delivery partially approved') ||
      metadata?.workflow === 'vendor_inspection',
    resolve: ({ buildPath, role }) => {
      const isBuyer = role === 'buyer' || role === 'procurement';
      if (isBuyer) {
        return { path: buildPath('/rejected-deliveries') };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'vendor_return_new_vendor_approved',
    match: ({ titleLower, metadata }) =>
      has(titleLower, 'new vendor approved') ||
      (metadata?.workflow === 'vendor_return_new_vendor' && has(titleLower, 'approved')),
    resolve: ({ buildPath, metadata, role }) => {
      const isBuyer = role === 'buyer' || role === 'procurement';
      if (isBuyer) {
        return {
          path: buildPath('/return-requests'),
          queryParams: {
            tab: 'in_progress',
            ...(metadata?.return_request_id && { vrr_id: String(metadata.return_request_id) })
          }
        };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'vendor_return_request_approved',
    match: ({ titleLower, metadata }) =>
      has(titleLower, 'return request approved') ||
      (metadata?.workflow === 'vendor_return' && has(titleLower, 'return') && has(titleLower, 'approved')),
    resolve: ({ buildPath, metadata, role }) => {
      const isBuyer = role === 'buyer' || role === 'procurement';
      if (isBuyer) {
        return {
          path: buildPath('/return-requests'),
          queryParams: {
            tab: 'td_approved',
            ...(metadata?.return_request_id && { vrr_id: String(metadata.return_request_id) })
          }
        };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'vendor_return_request_rejected',
    match: ({ titleLower, metadata }) =>
      has(titleLower, 'return request rejected') ||
      (metadata?.workflow === 'vendor_return' && has(titleLower, 'return') && has(titleLower, 'rejected')),
    resolve: ({ buildPath, metadata, role }) => {
      const isBuyer = role === 'buyer' || role === 'procurement';
      if (isBuyer) {
        return {
          path: buildPath('/return-requests'),
          queryParams: {
            tab: 'rejected',
            ...(metadata?.return_request_id && { vrr_id: String(metadata.return_request_id) })
          }
        };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'vendor_return_pending_approval',
    match: ({ titleLower, metadata }) =>
      has(titleLower, 'return request pending approval') ||
      (metadata?.workflow === 'vendor_return' && has(titleLower, 'return') && has(titleLower, 'pending')),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'technical-director') {
        return {
          path: buildPath('/return-approvals'),
          queryParams: {
            tab: 'pending',
            ...(metadata?.return_request_id && { vrr_id: String(metadata.return_request_id) })
          }
        };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'vendor_return_new_vendor_approval_required',
    match: ({ titleLower, metadata }) =>
      has(titleLower, 'new vendor approval required') ||
      (metadata?.workflow === 'vendor_return_new_vendor' && has(titleLower, 'approval required', 'requires approval')),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'technical-director') {
        return {
          path: buildPath('/return-approvals'),
          queryParams: {
            tab: 'new_vendor',
            ...(metadata?.return_request_id && { vrr_id: String(metadata.return_request_id) })
          }
        };
      }
      return { path: buildPath('/projects') };
    }
  },
  {
    id: 'vendor_return_materials_returned',
    match: ({ titleLower }) =>
      has(titleLower, 'materials being returned to vendor') ||
      has(titleLower, 'being returned to vendor'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'production-manager') {
        return {
          path: buildPath('/m2-store/stock-in'),
          queryParams: {
            view: 'vendor_deliveries',
            ...(metadata?.return_request_id && { vrr_id: String(metadata.return_request_id) })
          }
        };
      }
      if (role === 'technical-director') {
        return {
          path: buildPath('/return-approvals'),
          queryParams: {
            tab: 'history',
            subtab: 'return_in_progress',
            ...(metadata?.return_request_id && { vrr_id: String(metadata.return_request_id) })
          }
        };
      }
      return { path: buildPath('/projects') };
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
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'delivery_confirmed' ||
      has(titleLower, 'delivery confirmed', 'materials delivered to site', 'delivered to site') ||
      has(messageLower, 'delivery confirmed', 'confirmed receipt', 'confirmed received'),
    resolve: ({ buildPath, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/material-receipts'), queryParams: { tab: 'history', subtab: 'received' } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-out'), queryParams: { tab: 'delivered_dn' } };
      }
      if (role === 'buyer') {
        return { path: buildPath('/purchase-orders'), queryParams: { tab: 'completed' } };
      }
      return { path: buildPath('/projects') };
    }
  },
  // ─── IMR Approved (PM approved buyer's material request) ───
  {
    id: 'imr_approved',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'imr_approval' ||
      has(titleLower, 'material request approved') ||
      has(messageLower, 'approved material request', 'being prepared for dispatch'),
    resolve: ({ buildPath, role }) => {
      if (role === 'buyer') {
        return { path: buildPath('/purchase-orders'), queryParams: { tab: 'ongoing', subtab: 'store_approved' } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-out'), queryParams: { tab: 'approved' } };
      }
      return { path: buildPath('/projects') };
    }
  },
  // ─── Return Received at Store (PM confirmed return) ───
  {
    id: 'return_received_at_store',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'return_confirmed' ||
      has(titleLower, 'return received at m2 store', 'return received at store') ||
      has(messageLower, 'confirmed receipt of return', 'return note', 'received at m2 store'),
    resolve: ({ buildPath, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return { path: buildPath('/material-receipts'), queryParams: { tab: 'history' } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-in') };
      }
      return { path: buildPath('/projects') };
    }
  },
  // ─── Buyer Store Request (buyer sent materials from store inventory) ───
  {
    id: 'store_routing',
    match: ({ titleLower, metadata }) =>
      metadata?.workflow === 'store_routing' ||
      has(titleLower, 'store request'),
    resolve: ({ buildPath }) => ({
      path: buildPath('/m2-store/stock-out'),
      queryParams: { tab: 'store_requests' }
    })
  },
  // ─── Incoming Vendor Delivery (buyer routed to store) ───
  {
    id: 'vendor_delivery_incoming',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.type === 'vendor_delivery_incoming' ||
      has(titleLower, 'incoming vendor delivery') ||
      has(messageLower, 'routed', 'to m2 store'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-in'), queryParams: { view: 'vendor_deliveries' } };
      }
      return { path: buildPath('/projects') };
    }
  },
  // ─── CR Routed to Store (notifies CR creator / project manager) ───
  {
    id: 'cr_routed_to_store',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.type === 'cr_routed_to_store' ||
      has(titleLower, 'purchase routed to m2 store', 'routed to store') ||
      has(messageLower, 'routed materials to m2 store', 'completed the purchase and routed'),
    resolve: ({ buildPath, role }) => {
      if (role === 'project-manager') {
        return { path: buildPath('/change-requests'), queryParams: { tab: 'completed' } };
      }
      if (role === 'site-engineer') {
        return { path: buildPath('/change-requests'), queryParams: { tab: 'completed' } };
      }
      return { path: buildPath('/projects') };
    }
  },
  // ═══════════════════════════════════════════════════════════
  // RETURN DELIVERY NOTES (RDN) — site returning materials to store
  // ═══════════════════════════════════════════════════════════

  // ─── RDN Created (SE raised return, PM needs to receive it) ───
  {
    id: 'rdn_created',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'rdn_created' ||
      has(titleLower, 'return incoming', 'return delivery note', 'return note created', 'materials to be returned') ||
      has(messageLower, 'return delivery note', 'materials return'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/receive-returns'), queryParams: { tab: 'pending' } };
      }
      // SE who created it — show their return history
      return { path: buildPath('/material-receipts'), queryParams: { tab: 'returns' } };
    }
  },
  // ─── RDN Dispatched (driver en-route back to store) ───
  {
    id: 'rdn_dispatched',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'rdn_dispatched' ||
      has(titleLower, 'return in transit') ||
      (has(titleLower, 'return') && has(titleLower, 'dispatched', 'in transit', 'on the way')) ||
      has(messageLower, 'return delivery note', 'dispatched back to store'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/receive-returns'), queryParams: { tab: 'pending' } };
      }
      return { path: buildPath('/material-receipts'), queryParams: { tab: 'returns' } };
    }
  },

  // ─── RDN Issued (SE finalized return, ready for dispatch) ───
  {
    id: 'rdn_issued',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'rdn_issued' ||
      (has(titleLower, 'return note issued') && !has(titleLower, 'asset')),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/receive-returns'), queryParams: { tab: 'issued' } };
      }
      return { path: buildPath('/material-receipts'), queryParams: { tab: 'returns' } };
    }
  },

  // ─── IMR Sent for Approval (SE sent material request to PM) ───
  {
    id: 'imr_sent_for_approval',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'imr_sent_for_approval' ||
      (has(titleLower, 'material request') && has(messageLower, 'awaiting your approval', 'sent material request')),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/internal-requests'), queryParams: { tab: 'pending' } };
      }
      return { path: buildPath('/material-receipts') };
    }
  },

  // ─── Material Issued from Inventory (PM fulfilled request) ───
  {
    id: 'material_issued_from_inventory',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'material_issued_from_inventory' ||
      (has(titleLower, 'material issued') && has(messageLower, 'issued', 'request #')),
    resolve: ({ buildPath, role }) => {
      if (role === 'site-engineer') {
        return { path: buildPath('/material-receipts'), queryParams: { tab: 'fulfilled' } };
      }
      if (role === 'buyer' || role === 'procurement') {
        return { path: buildPath('/purchase-orders'), queryParams: { tab: 'ongoing' } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/internal-requests'), queryParams: { tab: 'fulfilled' } };
      }
      return { path: buildPath('/projects') };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // DELIVERY NOTE ISSUED — notifies buyer their materials left the store
  // ═══════════════════════════════════════════════════════════
  {
    id: 'delivery_note_issued',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'delivery_note_issued' ||
      has(titleLower, 'delivery note issued', 'materials issued', 'dn issued') ||
      has(messageLower, 'delivery note has been issued', 'materials have been issued from'),
    resolve: ({ buildPath, role }) => {
      if (role === 'buyer' || role === 'procurement') {
        return { path: buildPath('/purchase-orders'), queryParams: { tab: 'ongoing' } };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-out'), queryParams: { tab: 'issued_dn' } };
      }
      return { path: buildPath('/projects') };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // MATERIAL REPAIRED / DISPOSED — inventory maintenance outcomes
  // ═══════════════════════════════════════════════════════════

  // ─── Material Repaired (added back to usable stock) ───
  {
    id: 'material_repaired',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'material_repaired' ||
      has(titleLower, 'material repaired', 'repaired and restocked', 'item repaired') ||
      has(messageLower, 'has been repaired', 'repaired and added to stock'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-in'), queryParams: { tab: 'repaired' } };
      }
      // SE who raised the return — show their receipt history
      return { path: buildPath('/material-receipts'), queryParams: { tab: 'history' } };
    }
  },
  // ─── Material Disposed (damaged/defective, removed from inventory) ───
  {
    id: 'material_disposed',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'material_disposed' ||
      has(titleLower, 'material disposed', 'item disposed', 'disposed of') ||
      has(messageLower, 'has been disposed', 'marked for disposal', 'disposal completed'),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/disposal'), queryParams: { tab: 'completed' } };
      }
      // SE or other roles — show history
      return { path: buildPath('/material-receipts'), queryParams: { tab: 'history' } };
    }
  },

  // ─── Material Disposal Request (PM requests TD approval) ───
  {
    id: 'material_disposal_request',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'material_disposal_request' ||
      (has(titleLower, 'material disposal request') && has(messageLower, 'requests disposal')),
    resolve: ({ buildPath, role }) => {
      if (role === 'technical-director') {
        return { path: buildPath('/disposal-approvals'), queryParams: { tab: 'pending' } };
      }
      return { path: buildPath('/m2-store/disposal') };
    }
  },

  // ─── Material Disposal Reviewed (TD approved/rejected/backup → notify PM) ───
  {
    id: 'material_disposal_reviewed',
    match: ({ titleLower, messageLower, metadata }) =>
      metadata?.workflow === 'material_disposal_reviewed' ||
      (has(titleLower, 'disposal approved', 'disposal rejected', 'sent to backup') && has(messageLower, 'disposal', 'backup stock')),
    resolve: ({ buildPath, role }) => {
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/disposal') };
      }
      return { path: buildPath('/projects') };
    }
  },

  {
    id: 'material_dispatched',
    match: ({ titleLower, messageLower, category, metadata }) =>
      category !== 'assets' && category !== 'asset_requisition' && category !== 'labour' && category !== 'support' &&
      (metadata?.workflow === 'delivery_note_dispatched' ||
       has(titleLower, 'materials dispatched', 'in transit', 'dispatched to site', 'dispatched to your site') ||
       has(messageLower, 'in transit', 'dispatched to')),
    resolve: ({ buildPath, role }) => {
      if (role === 'site-engineer' || role === 'site-supervisor') {
        return {
          path: buildPath('/material-receipts'),
          queryParams: { tab: 'pending' }
        };
      }
      if (role === 'production-manager') {
        return { path: buildPath('/m2-store/stock-out'), queryParams: { tab: 'issued_dn' } };
      }
      if (role === 'buyer') {
        return { path: buildPath('/purchase-orders'), queryParams: { tab: 'ongoing', subtab: 'store_approved' } };
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
  // VENDOR SELECTION FOR CR (must come before generic CR rules)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'vendor_selection_approved',
    match: ({ titleLower }) =>
      has(titleLower, 'vendor') && has(titleLower, 'selection') && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isEstimator = role === 'estimator';
      const isProductionManager = role === 'production-manager';
      const isProjectManager = role === 'project-manager';
      const isBuyer = role === 'buyer' || role === 'procurement';

      // Site Engineers use /extra-material, PM/Estimator/Production Manager use /change-requests, Buyer uses /purchase-orders
      const basePath = isSiteEngineer ? '/extra-material' : (isEstimator || isProductionManager || isProjectManager ? '/change-requests' : '/purchase-orders');

      // Buyer/Procurement should go to ongoing tab with vendor_approved subtab
      if (isBuyer) {
        return {
          path: buildPath(basePath),
          queryParams: {
            tab: 'ongoing',
            subtab: 'vendor_approved',
            ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
            ...(metadata?.po_child_id && { po_child_id: String(metadata.po_child_id) })
          }
        };
      }

      // For other roles, keep existing behavior
      return {
        path: buildPath(basePath),
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
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isEstimator = role === 'estimator';
      const isProductionManager = role === 'production-manager';
      const isProjectManager = role === 'project-manager';
      // Site Engineers use /extra-material, PM/Estimator/Production Manager use /change-requests, Buyer uses /purchase-orders
      const basePath = isSiteEngineer ? '/extra-material' : (isEstimator || isProductionManager || isProjectManager ? '/change-requests' : '/purchase-orders');
      return {
        path: buildPath(basePath),
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
    resolve: ({ buildPath, metadata, role }) => {
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      // Site Engineers use /extra-material, others use /change-requests
      const basePath = isSiteEngineer ? '/extra-material' : '/change-requests';
      return {
        path: buildPath(basePath),
        queryParams: {
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }),
          ...(metadata?.vendor_id && { vendor_id: String(metadata.vendor_id) })
        }
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
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isExtraMaterial = metadata?.request_type === 'EXTRA_MATERIALS';
      // Site Engineers always use /extra-material, others check request_type
      const basePath = isEstimator ? '/change-requests' : (isSiteEngineer || isExtraMaterial ? '/extra-material' : '/change-requests');
      return {
        path: buildPath(basePath),
        queryParams: {
          tab: 'approved',
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
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isExtraMaterial = metadata?.request_type === 'EXTRA_MATERIALS';
      // Site Engineers always use /extra-material, others check request_type
      const basePath = isEstimator ? '/change-requests' : (isSiteEngineer || isExtraMaterial ? '/extra-material' : '/change-requests');
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
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isEstimator = role === 'estimator';
      const isProductionManager = role === 'production-manager';
      const isProjectManager = role === 'project-manager';
      // Site Engineers use /extra-material, PM/Estimator/Production Manager use /change-requests, Buyer uses /purchase-orders
      const basePath = isSiteEngineer ? '/extra-material' : (isEstimator || isProductionManager || isProjectManager ? '/change-requests' : '/purchase-orders');
      return {
        path: buildPath(basePath),
        queryParams: { tab: isSiteEngineer ? 'complete' : 'completed', ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) }) }
      };
    }
  },
  {
    id: 'cr_new',
    match: ({ titleLower, messageLower, category, metadata }) =>
      // ✅ Exclude only "purchase request assigned" to let the more specific rule handle it
      // Allow "materials purchase request" to match here
      !has(titleLower, 'purchase request assigned') &&
      (category === 'change_request' || has(titleLower, 'materials purchase', 'change request') ||
      (!!metadata?.cr_id && !has(titleLower, 'vendor'))),
    resolve: ({ buildPath, metadata, role, titleLower }) => {
      const isEstimator = role === 'estimator';
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isProjectManager = role === 'project-manager';
      const isProductionManager = role === 'production-manager';
      const isExtraMaterial = metadata?.request_type === 'EXTRA_MATERIALS';

      // Route based on request_type:
      // - EXTRA_MATERIALS → /extra-material (for SE/PM/Production Manager)
      // - Other types → /change-requests
      // - Estimators always use /change-requests regardless of type
      const basePath = isEstimator
                       ? '/change-requests'
                       : (isSiteEngineer || isExtraMaterial)
                         ? '/extra-material'
                         : '/change-requests';

      // Tab logic:
      // - Site Engineers: 'request' tab (their pending requests)
      // - Project Manager on extra-material: 'requested' tab (SE requests needing approval)
      // - Everyone else: 'pending' tab
      let tab = 'pending';
      if (isSiteEngineer && basePath === '/extra-material') {
        tab = 'request';
      } else if (isProjectManager && basePath === '/extra-material') {
        tab = 'requested'; // SE Requested tab - shows requests from SEs awaiting PM approval
      }

      return {
        path: buildPath(basePath),
        queryParams: {
          tab,
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        }
      };
    }
  },
  {
    id: 'vendor_approved',
    match: ({ titleLower, category }) =>
      (category === 'vendor' || has(titleLower, 'vendor')) && has(titleLower, 'approved'),
    resolve: ({ buildPath, metadata, role }) => {
      const isBuyer = role === 'buyer' || role === 'procurement';
      const noVendors = role === 'site-engineer' || role === 'site-supervisor' || role === 'estimator' || role === 'production-manager';

      // Buyer/Procurement goes to Purchase Orders page with vendor_approved subtab
      if (isBuyer) {
        return {
          path: buildPath('/purchase-orders'),
          queryParams: {
            tab: 'ongoing',
            subtab: 'vendor_approved',
            ...(metadata?.vendor_id && { vendor_id: String(metadata.vendor_id) }),
            ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
          }
        };
      }

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
  // PURCHASE ORDER READY FOR APPROVAL (TD approves new vendor in VRR context)
  // Must come BEFORE cr_new / po_generic to avoid wrong routing for TD
  // ═══════════════════════════════════════════════════════════
  {
    id: 'po_ready_for_td_approval',
    match: ({ titleLower }) =>
      has(titleLower, 'purchase order ready for approval') ||
      has(titleLower, 'vendor selections need approval'),
    resolve: ({ buildPath, metadata, role }) => {
      if (role === 'technical-director') {
        return {
          path: buildPath('/return-approvals'),
          queryParams: {
            tab: 'new_vendor',
            ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
          }
        };
      }
      // For other roles fall through to generic rules
      return {
        path: buildPath('/change-requests'),
        queryParams: {
          tab: 'pending',
          ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
        }
      };
    }
  },

  // ═══════════════════════════════════════════════════════════
  // PURCHASE REQUEST ASSIGNED TO BUYER
  // ═══════════════════════════════════════════════════════════
  {
    id: 'purchase_request_assigned',
    match: ({ titleLower }) =>
      has(titleLower, 'purchase request assigned') || has(titleLower, 'new purchase request assigned'),
    resolve: ({ buildPath, metadata, role }) => {
      const isBuyer = role === 'buyer' || role === 'procurement';
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isEstimator = role === 'estimator';
      const isProductionManager = role === 'production-manager';
      const isProjectManager = role === 'project-manager';

      // Determine base path based on role
      let basePath = '/purchase-orders'; // Default for buyer/procurement
      if (isSiteEngineer) {
        basePath = '/extra-material';
      } else if (isEstimator || isProductionManager || isProjectManager) {
        basePath = '/change-requests';
      } else if (isBuyer) {
        basePath = '/purchase-orders';
      }

      // Buyer/Procurement should go to ongoing tab with pending_purchase subtab
      if (isBuyer) {
        return {
          path: buildPath(basePath),
          queryParams: {
            tab: 'ongoing',
            subtab: 'pending_purchase',
            ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
          }
        };
      }

      // For other roles, use pending tab
      return {
        path: buildPath(basePath),
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
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isEstimator = role === 'estimator';
      const isProductionManager = role === 'production-manager';
      const isProjectManager = role === 'project-manager';
      // Site Engineers use /extra-material, PM/Estimator/Production Manager use /change-requests, Buyer uses /purchase-orders
      const basePath = isSiteEngineer ? '/extra-material' : (isEstimator || isProductionManager || isProjectManager ? '/change-requests' : '/purchase-orders');
      return {
        path: buildPath(basePath),
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
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isEstimator = role === 'estimator';
      const isProductionManager = role === 'production-manager';
      const isProjectManager = role === 'project-manager';
      // Site Engineers use /extra-material, PM/Estimator/Production Manager use /change-requests, Buyer uses /purchase-orders
      const basePath = isSiteEngineer ? '/extra-material' : (isEstimator || isProductionManager || isProjectManager ? '/change-requests' : '/purchase-orders');
      return {
        path: buildPath(basePath),
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
      const isSiteEngineer = role === 'site-engineer' || role === 'site-supervisor';
      const isEstimator = role === 'estimator';
      const isProductionManager = role === 'production-manager';
      const isProjectManager = role === 'project-manager';
      // Site Engineers use /extra-material, PM/Estimator/Production Manager use /change-requests, Buyer uses /purchase-orders
      const basePath = isSiteEngineer ? '/extra-material' : (isEstimator || isProductionManager || isProjectManager ? '/change-requests' : '/purchase-orders');
      return {
        path: buildPath(basePath),
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
      (has(messageLower, 'client confirmed', 'client approved', 'approved by client') || has(titleLower, 'approved by client')),
    resolve: ({ buildPath, metadata, role }) => {
      // TD goes to project-approvals, PM goes to my-projects, others to projects
      const targetPath = role === 'technical-director' ? '/project-approvals' : projectsPath(role);
      return {
        path: buildPath(targetPath),
        queryParams: { tab: 'client_response', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
      };
    }
  },
  {
    id: 'boq_client_rejected',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) &&
      (has(messageLower, 'client rejected') || has(titleLower, 'rejected by client')),
    resolve: ({ buildPath, metadata, role }) => {
      // TD goes to project-approvals, PM goes to my-projects, others to projects
      const targetPath = role === 'technical-director' ? '/project-approvals' : projectsPath(role);
      return {
        path: buildPath(targetPath),
        queryParams: { tab: 'client_response', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
      };
    }
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
  // ── Rejected revisions (MUST come BEFORE generic rejected rule) ──
  {
    id: 'boq_internal_revision_rejected',
    match: ({ titleLower }) =>
      has(titleLower, 'internal revision') && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      const boqParam = metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {};
      return {
        path: buildPath(role === 'technical-director' ? '/project-approvals' : projectsPath(role)),
        queryParams: { tab: 'revisions', subtab: 'internal', ...boqParam }
      };
    }
  },
  {
    id: 'boq_client_revision_rejected',
    match: ({ titleLower }) =>
      has(titleLower, 'client revision') && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => {
      const boqParam = metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {};
      return {
        path: buildPath(role === 'technical-director' ? '/project-approvals' : projectsPath(role)),
        queryParams: { tab: 'revisions', subtab: 'client', ...boqParam }
      };
    }
  },
  // ── Generic rejected rule (comes AFTER specific revision rejected rules) ──
  {
    id: 'boq_rejected',
    match: ({ titleLower, messageLower }) =>
      (has(titleLower, 'boq') || has(messageLower, 'boq')) && has(titleLower, 'rejected'),
    resolve: ({ buildPath, metadata, role }) => ({
      path: buildPath(projectsPath(role)),
      queryParams: { tab: 'rejected', ...(metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {}) }
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
        queryParams: { tab: 'revisions', subtab: 'internal', ...boqParam }
      };
    }
  },
  {
    id: 'boq_client_revision',
    match: ({ titleLower }) =>
      has(titleLower, 'client revision'),
    resolve: ({ buildPath, metadata, role }) => {
      const boqParam = metadata?.boq_id || metadata?.documentId ? { boq_id: String(metadata?.boq_id || metadata?.documentId) } : {};
      if (role === 'technical-director') {
        return {
          path: buildPath('/project-approvals'),
          queryParams: { tab: 'revisions', subtab: 'client', ...boqParam }
        };
      }
      return {
        path: buildPath(projectsPath(role)),
        queryParams: { tab: 'revisions', subtab: 'client', ...boqParam }
      };
    }
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
  // ═══════════════════════════════════════════════════════════
  // PROJECT DEADLINE ALERTS (must come BEFORE task_overdue)
  // Matches the scheduler titles: "Project Deadline in X Days",
  // "Project Deadline Is Today", "Project Overdue by X days"
  // ═══════════════════════════════════════════════════════════
  {
    id: 'project_deadline_alert',
    match: ({ titleLower, messageLower, category, metadata }) =>
      category === 'project' && (
        has(titleLower, 'project deadline', 'project overdue') ||
        has(messageLower, 'deadline is in', 'deadline is today', 'days overdue') ||
        metadata?.deadline_level != null
      ),
    resolve: ({ buildPath, role, metadata }) => {
      const projectId = metadata?.project_id;
      // TD → project-approvals assigned tab
      if (role === 'technical-director' || role === 'technicaldirector') {
        return {
          path: buildPath('/project-approvals'),
          queryParams: {
            tab: 'assigned',
            ...(projectId && { projectId: String(projectId) })
          }
        };
      }
      // PM → my-projects
      if (role === 'project-manager' || role === 'productionmanager') {
        return {
          path: buildPath('/my-projects'),
          queryParams: projectId ? { projectId: String(projectId) } : {}
        };
      }
      // SE / others → projects
      return {
        path: buildPath('/projects'),
        queryParams: projectId ? { projectId: String(projectId) } : {}
      };
    }
  },
  {
    id: 'task_overdue',
    match: ({ titleLower, messageLower, category }) =>
      category !== 'project' && (has(titleLower, 'overdue') || has(messageLower, 'overdue')),
    resolve: ({ buildPath, metadata }) => ({
      path: buildPath('/tasks'),
      queryParams: { tab: 'overdue', ...(metadata?.task_id && { task_id: String(metadata.task_id) }) }
    })
  },

  // ═══════════════════════════════════════════════════════════
  // CR BUYER ASSIGNMENT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'cr_buyer_assignment',
    match: ({ titleLower, metadata }: MatchContext) =>
      has(titleLower, 'cr assigned to you', 'change request assigned to you') ||
      metadata?.workflow === 'cr_buyer_assignment',
    resolve: ({ buildPath, metadata }: MatchContext) => ({
      path: buildPath('/change-requests'),
      queryParams: {
        tab: 'assigned',
        ...(metadata?.cr_id && { cr_id: String(metadata.cr_id) })
      }
    })
  },

  // ═══════════════════════════════════════════════════════════
  // TD INVENTORY ESCALATION (DISPOSAL APPROVAL)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'td_inventory_escalation',
    match: ({ titleLower, metadata }: MatchContext) =>
      has(titleLower, 'disposal approval required') ||
      metadata?.workflow === 'td_inventory_escalation',
    resolve: ({ buildPath, metadata, role }: MatchContext) => {
      if (role === 'technical-director' || role === 'technicaldirector') {
        return {
          path: buildPath('/disposal-approvals'),
          queryParams: {
            ...(metadata?.return_id && { return_id: String(metadata.return_id) })
          }
        };
      }
      if (role === 'production-manager' || role === 'productionmanager') {
        return {
          path: buildPath('/m2-store/disposal'),
          queryParams: {}
        };
      }
      return { path: buildPath('/projects') };
    }
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
      console.log(`[NotificationRedirect] Matched rule: ${rule.id}`, {
        title: ctx.title,
        category: ctx.category,
        role: ctx.role,
        metadata: ctx.metadata
      });
      const config = rule.resolve(ctx);
      console.log(`[NotificationRedirect] Resolved config:`, config);
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
  console.log('[NotificationRedirect] No rule matched, checking metadata.link', {
    title: ctx.title,
    category: ctx.category,
    role: ctx.role,
    metadata: ctx.metadata,
    hasLink: !!metadata?.link
  });

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

  console.log('[NotificationRedirect] No redirect config found, returning null');
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
