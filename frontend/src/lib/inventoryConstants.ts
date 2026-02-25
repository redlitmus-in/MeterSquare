// Inventory Management Constants
// Centralized constants to avoid hardcoding values across components

// Re-export PAGINATION from main constants for backward compatibility
export { PAGINATION } from './constants';

export const INVENTORY_DEFAULTS = {
  CURRENCY: 'AED',
  DELIVERY_NOTE_PREFIX: 'MDN',
  MIN_STOCK_THRESHOLD: 0.5 // 50% of min stock level triggers critical status
} as const;

export const THEME_COLORS = {
  CONFIRM: 'purple',
  DELETE: 'red',
  APPROVE: 'green',
  WARNING: 'yellow',
  INFO: 'blue'
} as const;

export const STOCK_STATUS_COLORS = {
  HEALTHY: 'bg-green-100 text-green-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  CRITICAL: 'bg-orange-100 text-orange-800',
  OUT_OF_STOCK: 'bg-red-100 text-red-800'
} as const;

export const CONDITION_COLORS = {
  GOOD: 'bg-green-100 text-green-800',
  DAMAGED: 'bg-yellow-100 text-yellow-800',
  DEFECTIVE: 'bg-red-100 text-red-800'
} as const;

export const REQUEST_STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  DN_PENDING: 'bg-indigo-100 text-indigo-800',
  DISPATCHED: 'bg-purple-100 text-purple-800',
  FULFILLED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800'
} as const;

export const RETURN_ACTIONS = {
  ADD_TO_STOCK: 'add_to_stock',
  SEND_FOR_REPAIR: 'repair',
  MARK_FOR_DISPOSAL: 'disposal'
} as const;

export const RETURN_ACTION_LABELS = {
  [RETURN_ACTIONS.ADD_TO_STOCK]: {
    label: 'Add to Stock',
    description: 'Material is in good condition, add to inventory',
    color: 'text-green-600'
  },
  [RETURN_ACTIONS.SEND_FOR_REPAIR]: {
    label: 'Send for Repair',
    description: 'Material needs repair before use',
    color: 'text-orange-600'
  },
  [RETURN_ACTIONS.MARK_FOR_DISPOSAL]: {
    label: 'Mark for Disposal',
    description: 'Material is beyond repair, send to TD for approval',
    color: 'text-red-600'
  }
} as const;

export const RDN_STATUS_BADGES = {
  DRAFT: { class: 'bg-gray-100 text-gray-700', text: 'Draft' },
  ISSUED: { class: 'bg-blue-100 text-blue-700', text: 'Issued' },
  IN_TRANSIT: { class: 'bg-yellow-100 text-yellow-700', text: 'In Transit' },
  RECEIVED: { class: 'bg-purple-100 text-purple-700', text: 'Received' },
  PARTIAL: { class: 'bg-orange-100 text-orange-700', text: 'Partial' },
  APPROVED: { class: 'bg-green-100 text-green-700', text: 'Approved' },
  REJECTED: { class: 'bg-red-100 text-red-700', text: 'Rejected' }
} as const;
