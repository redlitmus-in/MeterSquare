/**
 * Desktop Notification Helper
 * Handles browser desktop notifications with click-to-navigate functionality
 * Also stores notifications for later viewing in notification panel
 */

// ============================================
// STORED NOTIFICATIONS (for notification panel)
// ============================================

export interface StoredNotification {
  id: string;
  title: string;
  body: string;
  type: 'status_change' | 'new_ticket' | 'new_comment' | 'admin_response';
  ticketNumber?: string;
  ticketId?: number;
  timestamp: string;
  isRead: boolean;
  url?: string;
}

const NOTIFICATIONS_STORAGE_KEY = 'support_stored_notifications';
const MAX_STORED_NOTIFICATIONS = 50;

// Get stored notifications from localStorage
export const getStoredNotifications = (): StoredNotification[] => {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading stored notifications:', e);
  }
  return [];
};

// Save notifications to localStorage
const saveStoredNotifications = (notifications: StoredNotification[]): void => {
  try {
    // Keep only the latest MAX_STORED_NOTIFICATIONS
    const trimmed = notifications.slice(0, MAX_STORED_NOTIFICATIONS);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Error saving stored notifications:', e);
  }
};

// Add a new notification to storage
export const addStoredNotification = (notification: Omit<StoredNotification, 'id' | 'timestamp' | 'isRead'>): StoredNotification => {
  const newNotification: StoredNotification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    isRead: false,
  };

  const notifications = getStoredNotifications();
  notifications.unshift(newNotification); // Add to beginning
  saveStoredNotifications(notifications);

  return newNotification;
};

// Mark notification as read
export const markNotificationAsRead = (notificationId: string): void => {
  const notifications = getStoredNotifications();
  const index = notifications.findIndex(n => n.id === notificationId);
  if (index !== -1) {
    notifications[index].isRead = true;
    saveStoredNotifications(notifications);
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = (): void => {
  const notifications = getStoredNotifications();
  notifications.forEach(n => n.isRead = true);
  saveStoredNotifications(notifications);
};

// Get unread notification count
export const getUnreadNotificationCount = (): number => {
  return getStoredNotifications().filter(n => !n.isRead).length;
};

// Clear all notifications
export const clearAllNotifications = (): void => {
  localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
};

// Delete a single notification
export const deleteNotification = (notificationId: string): void => {
  const notifications = getStoredNotifications();
  const filtered = notifications.filter(n => n.id !== notificationId);
  saveStoredNotifications(filtered);
};

// ============================================
// DESKTOP NOTIFICATION TYPES
// ============================================

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: {
    url?: string;
    ticketId?: number;
    ticketNumber?: string;
  };
}

// Check if desktop notifications are supported
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window;
};

// Get current notification permission status
export const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

// Request notification permission from user
export const requestNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (!isNotificationSupported()) {
    console.warn('Desktop notifications are not supported in this browser');
    return 'unsupported';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    console.warn('Notification permission was previously denied');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
};

// Show a desktop notification
export const showDesktopNotification = (options: NotificationOptions): Notification | null => {
  if (!isNotificationSupported()) {
    console.warn('Desktop notifications are not supported');
    return null;
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted');
    return null;
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/assets/structo-logo.png',
      tag: options.tag,
      requireInteraction: options.requireInteraction ?? false,
      data: options.data,
    });

    // Handle notification click - navigate to the related page
    notification.onclick = (event) => {
      event.preventDefault();

      // Focus the window
      window.focus();

      // Navigate to the URL if provided
      if (options.data?.url) {
        window.location.href = options.data.url;
      }

      // Close the notification
      notification.close();
    };

    // Auto-close after 10 seconds if not requiring interaction
    if (!options.requireInteraction) {
      setTimeout(() => {
        notification.close();
      }, 10000);
    }

    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
};

// Notification templates for different ticket events
export const notifyTicketStatusChange = (
  ticketNumber: string,
  ticketTitle: string,
  newStatus: string,
  targetPage: 'support' | 'admin' = 'support',
  ticketId?: number
): Notification | null => {
  const statusMessages: Record<string, string> = {
    submitted: 'has been submitted',
    in_review: 'is now being reviewed',
    approved: 'has been approved',
    rejected: 'has been rejected',
    in_progress: 'is now in progress',
    resolved: 'has been resolved - please verify',
    closed: 'has been closed',
  };

  const message = statusMessages[newStatus] || `status changed to ${newStatus}`;

  // Get proper URL based on current context
  const currentPath = window.location.pathname;
  const roleMatch = currentPath.match(/^\/([^/]+)\//);
  const role = roleMatch ? roleMatch[1] : 'estimator';
  const url = targetPage === 'admin' ? '/support-management' : `/${role}/support`;

  // Store notification for panel
  addStoredNotification({
    title: `Ticket ${ticketNumber}`,
    body: `"${ticketTitle}" ${message}`,
    type: 'status_change',
    ticketNumber,
    ticketId,
    url,
  });

  return showDesktopNotification({
    title: `Ticket ${ticketNumber}`,
    body: `"${ticketTitle}" ${message}`,
    tag: `ticket-${ticketNumber}`,
    requireInteraction: newStatus === 'resolved',
    data: {
      url,
      ticketNumber,
    },
  });
};

// Notify when a new ticket is submitted (for admin page)
export const notifyNewTicket = (
  ticketNumber: string,
  ticketTitle: string,
  reporterName: string,
  ticketId?: number
): Notification | null => {
  const url = '/support-management';

  // Store notification for panel
  addStoredNotification({
    title: 'New Support Ticket',
    body: `${reporterName} submitted: "${ticketTitle}"`,
    type: 'new_ticket',
    ticketNumber,
    ticketId,
    url,
  });

  return showDesktopNotification({
    title: 'New Support Ticket',
    body: `${reporterName} submitted: "${ticketTitle}"`,
    tag: `new-ticket-${ticketNumber}`,
    requireInteraction: false,
    data: {
      url,
      ticketNumber,
    },
  });
};

// Notify when admin responds to a ticket (for public page)
export const notifyAdminResponse = (
  ticketNumber: string,
  ticketTitle: string,
  responseType: 'approved' | 'rejected' | 'resolved' | 'response',
  ticketId?: number
): Notification | null => {
  const messages: Record<string, string> = {
    approved: 'Your ticket has been approved',
    rejected: 'Your ticket has been rejected',
    resolved: 'Your ticket has been resolved - please verify',
    response: 'Development team responded to your ticket',
  };

  // Get current path to determine the role for navigation
  const currentPath = window.location.pathname;
  const roleMatch = currentPath.match(/^\/([^/]+)\//);
  const role = roleMatch ? roleMatch[1] : 'estimator';
  const url = `/${role}/support`;

  // Store notification for panel
  addStoredNotification({
    title: `Ticket ${ticketNumber} Update`,
    body: messages[responseType] || `Update on "${ticketTitle}"`,
    type: 'admin_response',
    ticketNumber,
    ticketId,
    url,
  });

  return showDesktopNotification({
    title: `Ticket ${ticketNumber} Update`,
    body: messages[responseType] || `Update on "${ticketTitle}"`,
    tag: `ticket-update-${ticketNumber}`,
    requireInteraction: responseType === 'resolved',
    data: {
      url,
      ticketNumber,
    },
  });
};

// Notify when a new comment is added
export const notifyNewComment = (
  ticketNumber: string,
  ticketTitle: string,
  senderName: string,
  senderType: 'client' | 'dev_team',
  targetPage: 'support' | 'admin' = 'support',
  ticketId?: number
): Notification | null => {
  // Get proper URL based on current context
  const currentPath = window.location.pathname;
  const roleMatch = currentPath.match(/^\/([^/]+)\//);
  const role = roleMatch ? roleMatch[1] : 'estimator';
  const url = targetPage === 'admin' ? '/support-management' : `/${role}/support`;

  const title = senderType === 'client' ? 'New Comment from Client' : 'New Comment from Dev Team';
  const body = `${senderName} commented on "${ticketTitle}"`;

  // Store notification for panel
  addStoredNotification({
    title,
    body,
    type: 'new_comment',
    ticketNumber,
    ticketId,
    url,
  });

  return showDesktopNotification({
    title,
    body,
    tag: `comment-${ticketNumber}-${Date.now()}`,
    requireInteraction: false,
    data: {
      url,
      ticketNumber,
    },
  });
};

// Store for tracking ticket states (used for change detection)
// Uses sessionStorage to persist across page refreshes within the same session
const STORAGE_KEY = 'support_ticket_states';
const NOTIFIED_KEY = 'support_notified_changes';

// Get ticket states from sessionStorage
const getTicketStates = (): Map<number, string> => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return new Map(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Error reading ticket states:', e);
  }
  return new Map();
};

// Save ticket states to sessionStorage
const saveTicketStates = (states: Map<number, string>): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(states.entries())));
  } catch (e) {
    console.error('Error saving ticket states:', e);
  }
};

// Get notified changes to prevent duplicates
const getNotifiedChanges = (): Set<string> => {
  try {
    const stored = sessionStorage.getItem(NOTIFIED_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Error reading notified changes:', e);
  }
  return new Set();
};

// Save notified change
const saveNotifiedChange = (key: string): void => {
  try {
    const notified = getNotifiedChanges();
    notified.add(key);
    // Keep only last 100 entries to prevent storage bloat
    const entries = Array.from(notified);
    if (entries.length > 100) {
      entries.splice(0, entries.length - 100);
    }
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('Error saving notified change:', e);
  }
};

// Check if already notified for this specific change
const wasAlreadyNotified = (ticketId: number, status: string): boolean => {
  const key = `${ticketId}-${status}`;
  return getNotifiedChanges().has(key);
};

// Update ticket state in store
export const updateTicketState = (ticketId: number, status: string): void => {
  const states = getTicketStates();
  states.set(ticketId, status);
  saveTicketStates(states);
};

// Check if ticket status has changed
export const hasTicketStatusChanged = (ticketId: number, currentStatus: string): boolean => {
  const states = getTicketStates();
  const previousStatus = states.get(ticketId);

  if (previousStatus === undefined) {
    // First time seeing this ticket, save state but don't trigger notification
    states.set(ticketId, currentStatus);
    saveTicketStates(states);
    return false;
  }

  if (previousStatus !== currentStatus) {
    // Check if we already notified about this change
    if (wasAlreadyNotified(ticketId, currentStatus)) {
      // Update state but don't trigger notification again
      states.set(ticketId, currentStatus);
      saveTicketStates(states);
      return false;
    }

    // New change - update state and mark as notified
    states.set(ticketId, currentStatus);
    saveTicketStates(states);
    saveNotifiedChange(`${ticketId}-${currentStatus}`);
    return true;
  }

  return false;
};

// Clear ticket state store
export const clearTicketStateStore = (): void => {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(NOTIFIED_KEY);
};

// Initialize stored tickets (call on page load)
export const initializeTicketStates = (tickets: Array<{ ticket_id: number; status: string }>): void => {
  const states = getTicketStates();
  tickets.forEach(ticket => {
    // Only set if not already tracked (preserve existing states)
    if (!states.has(ticket.ticket_id)) {
      states.set(ticket.ticket_id, ticket.status);
    }
  });
  saveTicketStates(states);
};

// ============================================
// ADMIN/MANAGEMENT PAGE HELPERS
// ============================================

const ADMIN_KNOWN_TICKETS_KEY = 'support_admin_known_tickets';
const ADMIN_NOTIFIED_KEY = 'support_admin_notified_tickets';

// Get known ticket IDs from sessionStorage (for admin page)
const getKnownTicketIds = (): Set<number> => {
  try {
    const stored = sessionStorage.getItem(ADMIN_KNOWN_TICKETS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Error reading known tickets:', e);
  }
  return new Set();
};

// Save known ticket IDs
const saveKnownTicketIds = (ids: Set<number>): void => {
  try {
    sessionStorage.setItem(ADMIN_KNOWN_TICKETS_KEY, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.error('Error saving known tickets:', e);
  }
};

// Get notified new tickets (prevents duplicate "new ticket" notifications)
const getAdminNotifiedTickets = (): Set<number> => {
  try {
    const stored = sessionStorage.getItem(ADMIN_NOTIFIED_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Error reading admin notified tickets:', e);
  }
  return new Set();
};

// Save admin notified ticket
const saveAdminNotifiedTicket = (ticketId: number): void => {
  try {
    const notified = getAdminNotifiedTickets();
    notified.add(ticketId);
    // Keep only last 100 entries
    const entries = Array.from(notified);
    if (entries.length > 100) {
      entries.splice(0, entries.length - 100);
    }
    sessionStorage.setItem(ADMIN_NOTIFIED_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('Error saving admin notified ticket:', e);
  }
};

// Initialize known tickets for admin page
export const initializeKnownTickets = (ticketIds: number[]): void => {
  const known = getKnownTicketIds();
  ticketIds.forEach(id => known.add(id));
  saveKnownTicketIds(known);
};

// Check if a ticket is new (not seen before) and should trigger notification
export const isNewTicketForAdmin = (ticketId: number): boolean => {
  const known = getKnownTicketIds();
  const notified = getAdminNotifiedTickets();

  if (!known.has(ticketId)) {
    // New ticket - add to known
    known.add(ticketId);
    saveKnownTicketIds(known);

    // Check if already notified (e.g., after page refresh)
    if (notified.has(ticketId)) {
      return false; // Already notified, don't notify again
    }

    // Mark as notified
    saveAdminNotifiedTicket(ticketId);
    return true;
  }

  return false;
};

// Clear admin notification state
export const clearAdminNotificationState = (): void => {
  sessionStorage.removeItem(ADMIN_KNOWN_TICKETS_KEY);
  sessionStorage.removeItem(ADMIN_NOTIFIED_KEY);
};
