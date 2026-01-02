/**
 * Desktop Notification Helper
 * Handles browser desktop notifications with click-to-navigate functionality
 * Also stores notifications for later viewing in notification panel
 * Supports role-based notification filtering
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
  // Role-based targeting
  targetRole?: string; // Only show to this role ('all' for everyone)
  targetEmail?: string; // Only show to this specific email (ticket reporter)
  reporterRole?: string; // The role of the ticket reporter
  reporterEmail?: string; // The email of the ticket reporter
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
export const addStoredNotification = (
  notification: Omit<StoredNotification, 'id' | 'timestamp' | 'isRead'>
): StoredNotification => {
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

// ============================================
// NOTIFICATION TEMPLATES WITH ROLE TARGETING
// ============================================

// Helper to build support page URL based on role
const buildSupportPageUrl = (reporterRole: string): string => {
  // Map role names to URL paths
  const rolePathMap: Record<string, string> = {
    'estimator': '/estimator/support',
    'project-manager': '/project-manager/support',
    'project_manager': '/project-manager/support',
    'site-engineer': '/site-engineer/support',
    'site_engineer': '/site-engineer/support',
    'buyer': '/buyer/support',
    'technical-director': '/technical-director/support',
    'technical_director': '/technical-director/support',
    'admin': '/admin/support',
    'site-supervisor': '/site-supervisor/support',
    'site_supervisor': '/site-supervisor/support',
    'mep-supervisor': '/mep-supervisor/support',
    'mep_supervisor': '/mep-supervisor/support',
    'accounts': '/accounts/support',
    'production-manager': '/production-manager/support',
    'production_manager': '/production-manager/support',
  };

  const normalizedRole = reporterRole.toLowerCase().replace(/\s+/g, '-');
  return rolePathMap[normalizedRole] || `/${normalizedRole}/support`;
};

// Notification for status changes - targets the ticket reporter only
export const notifyTicketStatusChange = (
  ticketNumber: string,
  ticketTitle: string,
  newStatus: string,
  reporterRole: string,
  reporterEmail: string,
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

  // URL for the reporter's support page
  const url = buildSupportPageUrl(reporterRole);

  // Store notification - targeted to the reporter only
  addStoredNotification({
    title: `Ticket ${ticketNumber}`,
    body: `"${ticketTitle}" ${message}`,
    type: 'status_change',
    ticketNumber,
    ticketId,
    url,
    targetRole: reporterRole,
    targetEmail: reporterEmail,
    reporterRole,
    reporterEmail,
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

// Notify when a new ticket is submitted (for admin/support-management page only)
export const notifyNewTicket = (
  ticketNumber: string,
  ticketTitle: string,
  reporterName: string,
  reporterRole: string,
  reporterEmail: string,
  ticketId?: number
): Notification | null => {
  const url = '/support-management';

  // Store notification - targeted to admin/support-management only
  addStoredNotification({
    title: 'New Support Ticket',
    body: `${reporterName} (${reporterRole}) submitted: "${ticketTitle}"`,
    type: 'new_ticket',
    ticketNumber,
    ticketId,
    url,
    targetRole: 'admin', // Only for admin page
    reporterRole,
    reporterEmail,
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

// Notify when admin responds to a ticket (for the ticket reporter only)
// NOTE: This function only stores the notification for the client's notification panel.
// Desktop notifications are NOT shown here because:
// 1. This function is called from SupportManagement (dev team page)
// 2. Showing desktop notification here would show it to the dev team, not the client
// 3. The backend sends real-time notifications to clients via Socket.IO
export const notifyAdminResponse = (
  ticketNumber: string,
  ticketTitle: string,
  responseType: 'approved' | 'rejected' | 'resolved' | 'response' | 'in_progress' | 'comment',
  reporterRole: string,
  reporterEmail: string,
  ticketId?: number
): void => {
  const messages: Record<string, string> = {
    approved: 'Your ticket has been approved',
    rejected: 'Your ticket has been rejected',
    resolved: 'Your ticket has been resolved - please verify',
    response: 'Development team responded to your ticket',
    in_progress: 'Your ticket is now in progress',
    comment: 'Development team added a comment',
  };

  // URL for the reporter's support page
  const url = buildSupportPageUrl(reporterRole);

  // Store notification - targeted to the reporter only
  // Desktop notification is handled by the backend via Socket.IO to the client
  addStoredNotification({
    title: `Ticket ${ticketNumber} Update`,
    body: messages[responseType] || `Update on "${ticketTitle}"`,
    type: 'admin_response',
    ticketNumber,
    ticketId,
    url,
    targetRole: reporterRole,
    targetEmail: reporterEmail,
    reporterRole,
    reporterEmail,
  });
};

// Notify when a new comment is added
// Desktop notification logic:
// - If client sends comment: Show desktop notification (client is on their page, admin gets notified)
// - If dev_team sends comment: Do NOT show desktop notification (would show to dev team, not client)
//   The backend handles notifying the client via Socket.IO
export const notifyNewComment = (
  ticketNumber: string,
  ticketTitle: string,
  senderName: string,
  senderType: 'client' | 'dev_team',
  reporterRole: string,
  reporterEmail: string,
  ticketId?: number
): Notification | null => {
  // If client sends comment, notify admin
  // If dev_team sends comment, notify the ticket reporter
  const isFromClient = senderType === 'client';

  const title = isFromClient ? 'New Comment from Client' : 'New Comment from Dev Team';
  const body = `${senderName} commented on "${ticketTitle}"`;

  if (isFromClient) {
    // Client sent comment - backend handles notification to dev team via database
    // Don't store in localStorage (would show to client themselves)
    // Don't show desktop notification (client knows they commented)
    // The SupportDBNotificationPanel on support-management page will show DB notifications
    return null;
  } else {
    // Dev team sent comment - store notification for the ticket reporter
    // Do NOT show desktop notification here - it would show to dev team member
    // The backend sends real-time notification to client via Socket.IO
    const url = buildSupportPageUrl(reporterRole);

    addStoredNotification({
      title,
      body,
      type: 'new_comment',
      ticketNumber,
      ticketId,
      url,
      targetRole: reporterRole,
      targetEmail: reporterEmail,
      reporterRole,
      reporterEmail,
    });

    return null; // No desktop notification for dev team actions
  }
};

// ============================================
// TICKET STATE TRACKING (for change detection)
// ============================================

const STORAGE_KEY = 'support_ticket_states';
const NOTIFIED_KEY = 'support_notified_changes';
const COMMENT_COUNT_KEY = 'support_comment_counts';

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

// Get comment counts for tickets
const getCommentCounts = (): Map<number, number> => {
  try {
    const stored = sessionStorage.getItem(COMMENT_COUNT_KEY);
    if (stored) {
      return new Map(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Error reading comment counts:', e);
  }
  return new Map();
};

// Save comment counts
const saveCommentCounts = (counts: Map<number, number>): void => {
  try {
    sessionStorage.setItem(COMMENT_COUNT_KEY, JSON.stringify(Array.from(counts.entries())));
  } catch (e) {
    console.error('Error saving comment counts:', e);
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

// Check if ticket has new comments
export const hasNewComments = (ticketId: number, currentCommentCount: number): boolean => {
  const counts = getCommentCounts();
  const previousCount = counts.get(ticketId);

  if (previousCount === undefined) {
    // First time seeing this ticket, save count but don't trigger notification
    counts.set(ticketId, currentCommentCount);
    saveCommentCounts(counts);
    return false;
  }

  if (currentCommentCount > previousCount) {
    // New comments added
    counts.set(ticketId, currentCommentCount);
    saveCommentCounts(counts);
    return true;
  }

  return false;
};

// Clear ticket state store
export const clearTicketStateStore = (): void => {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(NOTIFIED_KEY);
  sessionStorage.removeItem(COMMENT_COUNT_KEY);
};

// Initialize stored tickets (call on page load)
export const initializeTicketStates = (tickets: Array<{ ticket_id: number; status: string; comments?: any[] }>): void => {
  const states = getTicketStates();
  const counts = getCommentCounts();

  tickets.forEach(ticket => {
    // Only set if not already tracked (preserve existing states)
    if (!states.has(ticket.ticket_id)) {
      states.set(ticket.ticket_id, ticket.status);
    }
    // Track comment counts
    if (!counts.has(ticket.ticket_id)) {
      counts.set(ticket.ticket_id, ticket.comments?.length || 0);
    }
  });

  saveTicketStates(states);
  saveCommentCounts(counts);
};

// ============================================
// ADMIN/MANAGEMENT PAGE HELPERS
// ============================================

const ADMIN_KNOWN_TICKETS_KEY = 'support_admin_known_tickets';
const ADMIN_NOTIFIED_KEY = 'support_admin_notified_tickets';
const ADMIN_COMMENT_COUNTS_KEY = 'support_admin_comment_counts';

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

// Get admin comment counts
const getAdminCommentCounts = (): Map<number, number> => {
  try {
    const stored = sessionStorage.getItem(ADMIN_COMMENT_COUNTS_KEY);
    if (stored) {
      return new Map(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Error reading admin comment counts:', e);
  }
  return new Map();
};

// Save admin comment counts
const saveAdminCommentCounts = (counts: Map<number, number>): void => {
  try {
    sessionStorage.setItem(ADMIN_COMMENT_COUNTS_KEY, JSON.stringify(Array.from(counts.entries())));
  } catch (e) {
    console.error('Error saving admin comment counts:', e);
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
export const initializeKnownTickets = (tickets: Array<{ ticket_id: number; comments?: any[] }>): void => {
  const known = getKnownTicketIds();
  const counts = getAdminCommentCounts();

  tickets.forEach(ticket => {
    known.add(ticket.ticket_id);
    if (!counts.has(ticket.ticket_id)) {
      counts.set(ticket.ticket_id, ticket.comments?.length || 0);
    }
  });

  saveKnownTicketIds(known);
  saveAdminCommentCounts(counts);
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

// Check if ticket has new comments for admin
export const hasNewCommentsForAdmin = (ticketId: number, currentCommentCount: number): boolean => {
  const counts = getAdminCommentCounts();
  const previousCount = counts.get(ticketId);

  if (previousCount === undefined) {
    // First time seeing this ticket, save count but don't trigger notification
    counts.set(ticketId, currentCommentCount);
    saveAdminCommentCounts(counts);
    return false;
  }

  if (currentCommentCount > previousCount) {
    // New comments added
    counts.set(ticketId, currentCommentCount);
    saveAdminCommentCounts(counts);
    return true;
  }

  return false;
};

// Clear admin notification state
export const clearAdminNotificationState = (): void => {
  sessionStorage.removeItem(ADMIN_KNOWN_TICKETS_KEY);
  sessionStorage.removeItem(ADMIN_NOTIFIED_KEY);
  sessionStorage.removeItem(ADMIN_COMMENT_COUNTS_KEY);
};
