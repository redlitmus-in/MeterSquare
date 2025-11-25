/**
 * Unified Toast Helper
 *
 * Use these functions for showing toast notifications:
 * - showSuccess/showError = YOUR OWN actions (API responses)
 * - showIncomingNotification = Handled by realtimeNotificationHub (DO NOT call directly)
 *
 * RULES:
 * 1. Toast = Feedback for YOUR actions (green success, red error)
 * 2. Incoming notifications from others = Different style (handled by realtimeNotificationHub)
 */

import { toast } from 'sonner';

// ============================================
// ACTION FEEDBACK TOASTS (For your own actions)
// ============================================

/**
 * Show success toast - Use after successful API call
 * @example showSuccess('BOQ approved successfully')
 */
export const showSuccess = (message: string, description?: string) => {
  toast.success(message, { description });
};

/**
 * Show error toast - Use when API call fails
 * @example showError('Failed to approve BOQ')
 */
export const showError = (message: string, description?: string) => {
  toast.error(message, { description });
};

/**
 * Show warning toast - Use for validation warnings
 * @example showWarning('Please fill all required fields')
 */
export const showWarning = (message: string, description?: string) => {
  toast.warning(message, { description });
};

/**
 * Show info toast - Use for general information
 * @example showInfo('No projects assigned yet')
 */
export const showInfo = (message: string, description?: string) => {
  toast.info(message, { description });
};

// ============================================
// SPECIALIZED TOASTS
// ============================================

/**
 * Show loading toast - Returns a promise that resolves when complete
 * @example
 * showLoading(
 *   fetchData(),
 *   { loading: 'Loading...', success: 'Done!', error: 'Failed!' }
 * )
 */
export const showLoading = <T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string;
    error: string;
  }
) => {
  return toast.promise(promise, messages);
};

/**
 * Show action toast with button
 * @example
 * showWithAction('Item deleted', 'Undo', () => undoDelete())
 */
export const showWithAction = (
  message: string,
  actionLabel: string,
  onAction: () => void,
  type: 'success' | 'error' | 'info' = 'info'
) => {
  const toastMethod = type === 'success' ? toast.success :
                      type === 'error' ? toast.error : toast.info;

  toastMethod(message, {
    action: {
      label: actionLabel,
      onClick: onAction
    }
  });
};

// ============================================
// DO NOT USE DIRECTLY - For internal use only
// ============================================

/**
 * Show incoming notification popup (Different style from action toasts)
 * INTERNAL USE ONLY - Called by realtimeNotificationHub
 * DO NOT call this directly from components!
 */
export const _showIncomingNotification = (
  title: string,
  message: string,
  options?: {
    icon?: string;
    senderName?: string;
    actionUrl?: string;
    duration?: number;
  }
) => {
  const icon = options?.icon || '🔔';
  const senderInfo = options?.senderName ? `\nFrom: ${options.senderName}` : '';

  toast.message(`${icon} ${title}`, {
    description: `${message}${senderInfo}`,
    duration: options?.duration || 5000,
    action: options?.actionUrl ? {
      label: 'View',
      onClick: () => {
        window.location.href = options.actionUrl!;
      }
    } : undefined
  });
};

// ============================================
// TYPE DEFINITIONS
// ============================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

// Default export for easy importing
export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  loading: showLoading,
  withAction: showWithAction
};
