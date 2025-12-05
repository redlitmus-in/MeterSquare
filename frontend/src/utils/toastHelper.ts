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

import { toast, ExternalToast } from 'sonner';

// Toast options type
type ToastOptions = string | ExternalToast;

// ============================================
// ACTION FEEDBACK TOASTS (For your own actions)
// ============================================

/**
 * Show success toast - Use after successful API call
 * @example showSuccess('BOQ approved successfully')
 * @example showSuccess('BOQ approved', 'Sent to estimator')
 * @example showSuccess('BOQ approved', { description: 'Sent to estimator', duration: 5000 })
 */
export const showSuccess = (message: string, options?: ToastOptions) => {
  if (typeof options === 'string') {
    toast.success(message, { description: options });
  } else {
    toast.success(message, options);
  }
};

/**
 * Show error toast - Use when API call fails
 * @example showError('Failed to approve BOQ')
 * @example showError('Failed', 'Please try again')
 * @example showError('Failed', { description: 'Please try again', duration: 5000 })
 */
export const showError = (message: string, options?: ToastOptions) => {
  if (typeof options === 'string') {
    toast.error(message, { description: options });
  } else {
    toast.error(message, options);
  }
};

/**
 * Show warning toast - Use for validation warnings
 * @example showWarning('Please fill all required fields')
 * @example showWarning('Warning', 'Some fields are missing')
 */
export const showWarning = (message: string, options?: ToastOptions) => {
  if (typeof options === 'string') {
    toast.warning(message, { description: options });
  } else {
    toast.warning(message, options);
  }
};

/**
 * Show info toast - Use for general information
 * @example showInfo('No projects assigned yet')
 * @example showInfo('Info', 'You have no new notifications')
 */
export const showInfo = (message: string, options?: ToastOptions) => {
  if (typeof options === 'string') {
    toast.info(message, { description: options });
  } else {
    toast.info(message, options);
  }
};

// ============================================
// SPECIALIZED TOASTS
// ============================================

/**
 * Show loading toast with promise - Returns when promise resolves
 * @example showLoadingPromise(fetchData(), { loading: 'Loading...', success: 'Done!', error: 'Failed!' })
 */
export const showLoadingPromise = <T>(
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
 * Show loading toast with ID (for manual dismiss)
 * @example showLoading('Saving...', 'save-id')
 * @example showLoading('Saving...', { id: 'save-id' })
 */
export const showLoading = (message: string, options?: string | { id?: string }) => {
  if (typeof options === 'string') {
    return toast.loading(message, { id: options });
  }
  return toast.loading(message, options);
};

/**
 * Dismiss a toast by ID
 * @example dismissToast('save-id')
 */
export const dismissToast = (id: string) => {
  toast.dismiss(id);
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
