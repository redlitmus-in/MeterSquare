/**
 * Public Support Page - Bug Register
 * Public page with all features: draft, submit, edit, delete, confirm resolution
 * No login required - uses email to identify ticket owner
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug,
  AlertCircle,
  Lightbulb,
  Wrench,
  Plus,
  Upload,
  X,
  Send,
  Save,
  Edit3,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  FileText,
  Image,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
  Mail,
  Search,
  Bell,
  BellOff,
  MessageCircle
} from 'lucide-react';
import { supportApi, SupportTicket } from '@/api/support';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { API_BASE_URL } from '@/api/config';
import { useAuthStore } from '@/store/authStore';
import {
  requestNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
  notifyAdminResponse,
  initializeTicketStates,
  hasTicketStatusChanged,
  notifyNewComment
} from '@/utils/supportNotificationHelper';
import NotificationPanel from '@/components/support/NotificationPanel';

// Ticket type configuration
const ticketTypes = [
  { value: 'bug', label: 'Bug', icon: Bug, color: 'text-red-500', bgColor: 'bg-red-100' },
  { value: 'issue', label: 'Issue', icon: AlertCircle, color: 'text-orange-500', bgColor: 'bg-orange-100' },
  { value: 'implementation', label: 'Implementation', icon: Wrench, color: 'text-blue-500', bgColor: 'bg-blue-100' },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'text-green-500', bgColor: 'bg-green-100' }
];

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'text-gray-500', bgColor: 'bg-gray-100' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  { value: 'high', label: 'High', color: 'text-orange-500', bgColor: 'bg-orange-100' },
  { value: 'critical', label: 'Critical', color: 'text-red-500', bgColor: 'bg-red-100' }
];

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: Edit3 },
  submitted: { label: 'Submitted', color: 'text-blue-500', bgColor: 'bg-blue-100', icon: Send },
  in_review: { label: 'In Review', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Eye },
  approved: { label: 'Approved', color: 'text-green-500', bgColor: 'bg-green-100', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-500', bgColor: 'bg-red-100', icon: XCircle },
  in_progress: { label: 'In Progress', color: 'text-purple-500', bgColor: 'bg-purple-100', icon: RefreshCw },
  resolved: { label: 'Resolved', color: 'text-emerald-500', bgColor: 'bg-emerald-100', icon: CheckCircle },
  closed: { label: 'Closed', color: 'text-gray-600', bgColor: 'bg-gray-200', icon: XCircle }
};

interface PublicTicketFormData {
  ticket_type: 'bug' | 'issue' | 'implementation' | 'feature';
  title: string;
  description: string;
  current_concern: string;
  proposed_changes: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  reporter_name: string;
  reporter_email: string;
  reporter_role: string;
}

// Polling interval for checking ticket updates (10 seconds for faster updates)
const POLLING_INTERVAL = 10000;

const PublicSupportPage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const implementationFileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auth store for auto-filling logged-in user info
  const { user, isAuthenticated } = useAuthStore();

  // State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState<SupportTicket | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 5;

  // Notification state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isPolling] = useState(true); // Polling is always on, could add toggle later

  // Comment state
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [isSendingComment, setIsSendingComment] = useState<Record<number, boolean>>({});


  // Form state - Initialize with user data if authenticated
  const [formData, setFormData] = useState<PublicTicketFormData>(() => ({
    ticket_type: 'bug',
    title: '',
    description: '',
    current_concern: '',
    proposed_changes: '',
    priority: 'medium',
    reporter_name: user?.full_name || localStorage.getItem('support_user_name') || '',
    reporter_email: user?.email || localStorage.getItem('support_user_email') || '',
    reporter_role: user?.role || user?.role_name || localStorage.getItem('support_user_role') || ''
  }));
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [implementationFiles, setImplementationFiles] = useState<File[]>([]);

  // Check for ticket status changes and send notifications
  const checkForStatusChanges = useCallback((newTickets: SupportTicket[]) => {
    // Initialize ticket states (uses sessionStorage, preserves existing states)
    initializeTicketStates(newTickets.map(t => ({ ticket_id: t.ticket_id, status: t.status })));

    // Check each ticket for status changes (deduplication handled in helper via sessionStorage)
    newTickets.forEach(ticket => {
      if (hasTicketStatusChanged(ticket.ticket_id, ticket.status)) {
        // Determine notification type based on status
        let responseType: 'approved' | 'rejected' | 'resolved' | 'response' = 'response';
        if (ticket.status === 'approved') responseType = 'approved';
        else if (ticket.status === 'rejected') responseType = 'rejected';
        else if (ticket.status === 'resolved') responseType = 'resolved';

        // Send desktop notification
        notifyAdminResponse(
          ticket.ticket_number,
          ticket.title,
          responseType
        );

        // Also show toast notification
        const statusMessages: Record<string, string> = {
          approved: `Ticket ${ticket.ticket_number} has been approved!`,
          rejected: `Ticket ${ticket.ticket_number} has been rejected`,
          resolved: `Ticket ${ticket.ticket_number} has been resolved - please verify`,
          in_review: `Ticket ${ticket.ticket_number} is now being reviewed`,
          in_progress: `Ticket ${ticket.ticket_number} is now in progress`,
        };
        const message = statusMessages[ticket.status];
        if (message) {
          if (ticket.status === 'rejected') {
            showWarning(message);
          } else {
            showInfo(message);
          }
        }
      }
    });
  }, []);

  const loadTickets = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      const response = await supportApi.publicGetAllTickets({ per_page: 100 });
      if (response.success) {
        // Check for status changes before updating state
        checkForStatusChanges(response.tickets);
        setTickets(response.tickets);
      }
    } catch (error: any) {
      if (showLoader) {
        showError('Failed to load tickets');
      }
      console.error('Error loading tickets:', error);
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [checkForStatusChanges]);

  // Initialize notification permission on mount
  useEffect(() => {
    const initNotifications = async () => {
      if (isNotificationSupported()) {
        const permission = getNotificationPermission();
        setNotificationPermission(permission);
      } else {
        setNotificationPermission('unsupported');
      }
    };
    initNotifications();
  }, []);

  // Auto-fill user info when logged in (but keep page public)
  useEffect(() => {
    if (isAuthenticated && user) {
      setFormData(prev => ({
        ...prev,
        reporter_name: user.full_name || prev.reporter_name,
        reporter_email: user.email || prev.reporter_email,
        reporter_role: user.role || user.role_name || prev.reporter_role
      }));
    }
  }, [isAuthenticated, user, showCreateForm]);

  // Load tickets on mount and set up polling
  useEffect(() => {
    loadTickets();

    // Set up polling interval
    if (isPolling) {
      pollingIntervalRef.current = setInterval(() => {
        loadTickets(false); // Silent load (no loader)
      }, POLLING_INTERVAL);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [loadTickets, isPolling]);

  // Handle notification permission request
  const handleRequestNotificationPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      showSuccess('Desktop notifications enabled! You will be notified of ticket updates.');
    } else if (permission === 'denied') {
      showWarning('Notification permission denied. You can enable it in browser settings.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isValid = file.size <= 10 * 1024 * 1024; // 10MB
      if (!isValid) {
        showWarning(`File ${file.name} is too large (max 10MB)`);
      }
      return isValid;
    });
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleImplementationFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isValid = file.size <= 10 * 1024 * 1024; // 10MB
      if (!isValid) {
        showWarning(`File ${file.name} is too large (max 10MB)`);
      }
      return isValid;
    });
    setImplementationFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeImplementationFile = (index: number) => {
    setImplementationFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Save user info to localStorage
  const saveUserInfo = () => {
    localStorage.setItem('support_user_name', formData.reporter_name);
    localStorage.setItem('support_user_email', formData.reporter_email);
    localStorage.setItem('support_user_role', formData.reporter_role);
  };

  const handleCreateTicket = async (asDraft: boolean = false) => {
    // Basic validation
    if (!formData.reporter_name.trim()) {
      showWarning('Please enter your name');
      return;
    }
    if (!formData.reporter_email.trim()) {
      showWarning('Please enter your email');
      return;
    }

    // For submit, need all required fields
    if (!asDraft) {
      if (!formData.reporter_role.trim()) {
        showWarning('Please enter your role');
        return;
      }
      if (!formData.title.trim()) {
        showWarning('Please enter a title');
        return;
      }
      if (!formData.current_concern.trim()) {
        showWarning('Please enter the current concern');
        return;
      }
      if (selectedFiles.length === 0) {
        showWarning('Please upload at least one screenshot or file');
        return;
      }
    } else {
      // For draft, at least need a title
      if (!formData.title.trim()) {
        showWarning('Please enter a title for the draft');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      saveUserInfo();

      // Combine both file sets for upload
      const allFiles = [...selectedFiles, ...implementationFiles];

      const response = await supportApi.publicCreateTicket({
        ticket_type: formData.ticket_type,
        title: formData.title,
        description: formData.description,
        current_concern: formData.current_concern,
        proposed_changes: formData.proposed_changes,
        priority: formData.priority,
        reporter_name: formData.reporter_name,
        reporter_email: formData.reporter_email,
        reporter_role: formData.reporter_role || 'Public User'
      }, allFiles, asDraft);

      if (response.success) {
        showSuccess(asDraft ? 'Ticket saved as draft!' : 'Ticket submitted successfully!');
        resetForm();
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to create ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTicket = async () => {
    if (!editingTicket) return;

    try {
      setIsSubmitting(true);
      saveUserInfo();

      const allFiles = [...selectedFiles, ...implementationFiles];

      const response = await supportApi.publicUpdateTicket(
        editingTicket.ticket_id,
        {
          title: formData.title,
          description: formData.description,
          current_concern: formData.current_concern,
          proposed_changes: formData.proposed_changes,
          priority: formData.priority,
          ticket_type: formData.ticket_type
        },
        allFiles
      );

      if (response.success) {
        showSuccess('Ticket updated successfully');
        resetForm();
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to update ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitDraft = async (ticketId: number) => {
    try {
      setIsSubmitting(true);
      const response = await supportApi.publicSubmitTicket(ticketId);
      if (response.success) {
        showSuccess('Ticket submitted successfully');
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to submit ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTicket = async (ticketId: number) => {
    if (!confirm('Are you sure you want to delete this ticket?')) return;

    try {
      const response = await supportApi.publicDeleteTicket(ticketId);
      if (response.success) {
        showSuccess('Ticket deleted successfully');
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to delete ticket');
    }
  };

  const handleConfirmResolution = async (ticketId: number) => {
    try {
      setIsSubmitting(true);
      const response = await supportApi.publicConfirmResolution(ticketId);
      if (response.success) {
        showSuccess('Thank you! Ticket closed.');
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to confirm resolution');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendComment = async (ticketId: number) => {
    const message = commentText[ticketId]?.trim();
    if (!message) {
      showWarning('Please enter a comment');
      return;
    }

    // Get sender info from form or localStorage
    const senderName = formData.reporter_name || localStorage.getItem('support_user_name') || 'Anonymous';
    const senderEmail = formData.reporter_email || localStorage.getItem('support_user_email') || '';

    try {
      setIsSendingComment(prev => ({ ...prev, [ticketId]: true }));
      const response = await supportApi.addComment(ticketId, {
        message,
        sender_type: 'client',
        sender_name: senderName,
        sender_email: senderEmail
      });

      if (response.success) {
        showSuccess('Comment sent successfully');
        setCommentText(prev => ({ ...prev, [ticketId]: '' }));
        loadTickets(false); // Reload to get updated comments
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to send comment');
    } finally {
      setIsSendingComment(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  const startEditing = (ticket: SupportTicket) => {
    setEditingTicket(ticket);
    setFormData({
      ticket_type: ticket.ticket_type,
      title: ticket.title,
      description: ticket.description,
      current_concern: ticket.current_concern || '',
      proposed_changes: ticket.proposed_changes || '',
      priority: ticket.priority,
      reporter_name: ticket.reporter_name,
      reporter_email: ticket.reporter_email,
      reporter_role: ticket.reporter_role || ''
    });
    setSelectedFiles([]);
    setImplementationFiles([]);
    setShowCreateForm(true);
  };

  const resetForm = () => {
    setEditingTicket(null);
    setFormData({
      ticket_type: 'bug',
      title: '',
      description: '',
      current_concern: '',
      proposed_changes: '',
      priority: 'medium',
      reporter_name: localStorage.getItem('support_user_name') || '',
      reporter_email: localStorage.getItem('support_user_email') || '',
      reporter_role: localStorage.getItem('support_user_role') || ''
    });
    setSelectedFiles([]);
    setImplementationFiles([]);
    setShowCreateForm(false);
  };


  // Filter tickets
  const filteredTickets = tickets.filter(ticket => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        ticket.title.toLowerCase().includes(query) ||
        ticket.ticket_number.toLowerCase().includes(query) ||
        ticket.reporter_name.toLowerCase().includes(query) ||
        ticket.reporter_email.toLowerCase().includes(query) ||
        ticket.description?.toLowerCase().includes(query) ||
        ticket.current_concern?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    if (filterStatus !== 'all' && ticket.status !== filterStatus) return false;
    if (filterType !== 'all' && ticket.ticket_type !== filterType) return false;
    if (filterPriority !== 'all' && ticket.priority !== filterPriority) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredTickets.length / ticketsPerPage);
  const startIndex = (currentPage - 1) * ticketsPerPage;
  const paginatedTickets = filteredTickets.slice(startIndex, startIndex + ticketsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterType, filterPriority]);

  const getTypeConfig = (type: string) => ticketTypes.find(t => t.value === type) || ticketTypes[0];
  const getPriorityConfig = (priority: string) => priorityOptions.find(p => p.value === priority) || priorityOptions[1];
  const getStatusConfig = (status: string) => statusConfig[status] || statusConfig.submitted;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <ModernLoadingSpinners type="ring" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Structo Logo */}
              <img
                src="/assets/structo-logo.png"
                alt="Structo"
                className="h-14 w-auto"
              />
              <div className="h-8 w-px bg-gray-300 mx-2" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Bug className="w-6 h-6 text-red-500" />
                  Bug Register
                </h1>
                <p className="text-gray-500 text-sm">
                  Report bugs, issues, and request new implementations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Notification Permission Button */}
              {notificationPermission !== 'unsupported' && (
                <button
                  onClick={handleRequestNotificationPermission}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    notificationPermission === 'granted'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={
                    notificationPermission === 'granted'
                      ? 'Desktop notifications enabled'
                      : 'Enable desktop notifications'
                  }
                >
                  {notificationPermission === 'granted' ? (
                    <Bell className="w-5 h-5" />
                  ) : (
                    <BellOff className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline text-sm">
                    {notificationPermission === 'granted' ? 'Notifications On' : 'Enable Notifications'}
                  </span>
                </button>
              )}

              {/* Notification Panel */}
              <NotificationPanel className="ml-2" />

              <button
                onClick={() => {
                  resetForm();
                  setShowCreateForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                New Ticket
              </button>
            </div>
          </div>
        </div>

        {/* Create/Edit Form */}
        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingTicket ? 'Edit Ticket' : 'Create New Ticket'}
                </h2>
                <button
                  onClick={resetForm}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Reporter Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <User className="w-4 h-4 inline mr-1" />
                    Your Name *
                  </label>
                  <input
                    type="text"
                    value={formData.reporter_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, reporter_name: e.target.value }))}
                    placeholder="Enter your name"
                    disabled={isAuthenticated}
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isAuthenticated ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Your Email *
                  </label>
                  <input
                    type="email"
                    value={formData.reporter_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, reporter_email: e.target.value }))}
                    placeholder="Enter your email"
                    disabled={isAuthenticated}
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isAuthenticated ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role *
                  </label>
                  <input
                    type="text"
                    value={formData.reporter_role}
                    onChange={(e) => setFormData(prev => ({ ...prev, reporter_role: e.target.value }))}
                    placeholder="e.g., Project Manager, Site Engineer, etc."
                    disabled={isAuthenticated}
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isAuthenticated ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              {/* Type and Priority */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ticket Type *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ticketTypes.map(type => {
                      const Icon = type.icon;
                      const isSelected = formData.ticket_type === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, ticket_type: type.value as any }))}
                          className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                            isSelected
                              ? `border-blue-500 ${type.bgColor}`
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${type.color}`} />
                          <span className="font-medium">{type.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {priorityOptions.map(priority => {
                      const isSelected = formData.priority === priority.value;
                      return (
                        <button
                          key={priority.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, priority: priority.value as any }))}
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                            isSelected
                              ? `border-blue-500 ${priority.bgColor}`
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className={`font-medium ${priority.color}`}>{priority.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief summary of the issue"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Current Concern */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Current Concern *
                </label>
                <textarea
                  value={formData.current_concern}
                  onChange={(e) => setFormData(prev => ({ ...prev, current_concern: e.target.value }))}
                  placeholder="What is the current issue or concern you are facing?"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* File Upload */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Screenshots & Files *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-gray-600" />
                    <span className="text-gray-700">Upload Files</span>
                  </button>
                  <p className="text-sm text-gray-500 mt-2">
                    Max 10MB per file. Supports images, PDF, Word, Excel, and text files.
                  </p>
                </div>

                {/* Selected Files */}
                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {file.type.startsWith('image/') ? (
                            <Image className="w-5 h-5 text-blue-500" />
                          ) : (
                            <FileText className="w-5 h-5 text-gray-500" />
                          )}
                          <span className="text-sm text-gray-700">{file.name}</span>
                          <span className="text-xs text-gray-400">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="p-1 text-red-500 hover:bg-red-100 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Concern Implementation */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Concern Implementation (Optional)
                </label>
                <textarea
                  value={formData.proposed_changes}
                  onChange={(e) => setFormData(prev => ({ ...prev, proposed_changes: e.target.value }))}
                  placeholder="What changes do you suggest? How should the flow or function be modified?"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />

                {/* Implementation File Upload */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Implementation Files (Optional)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-purple-400 transition-colors">
                    <input
                      ref={implementationFileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls"
                      onChange={handleImplementationFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => implementationFileInputRef.current?.click()}
                      className="flex items-center gap-2 mx-auto px-4 py-2 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                    >
                      <Upload className="w-5 h-5 text-purple-600" />
                      <span className="text-purple-700">Upload Implementation Files</span>
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                      Attach mockups, diagrams, or reference files for proposed changes
                    </p>
                  </div>

                  {/* Implementation Files List */}
                  {implementationFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {implementationFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-purple-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            {file.type.startsWith('image/') ? (
                              <Image className="w-5 h-5 text-purple-500" />
                            ) : (
                              <FileText className="w-5 h-5 text-purple-500" />
                            )}
                            <span className="text-sm text-gray-700">{file.name}</span>
                            <span className="text-xs text-gray-400">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeImplementationFile(index)}
                            className="p-1 text-red-500 hover:bg-red-100 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Any additional details about the issue, steps to reproduce, expected behavior, etc."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                {editingTicket ? (
                  <button
                    type="button"
                    onClick={handleUpdateTicket}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Save Changes
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCreateTicket(true)}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      Save as Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateTicket(false)}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                      Submit Ticket
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tickets by title, number, name, email..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              {Object.entries(statusConfig).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {ticketTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Priority</option>
              {priorityOptions.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={() => loadTickets()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tickets List */}
        <div className="space-y-4">
          {filteredTickets.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-12 text-center">
              <Bug className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No tickets found</h3>
              <p className="text-gray-500">
                {filterStatus !== 'all' || filterType !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Click "New Ticket" to create your first support ticket'}
              </p>
            </div>
          ) : (
            paginatedTickets.map(ticket => {
              const typeConfig = getTypeConfig(ticket.ticket_type);
              const priorityConfig = getPriorityConfig(ticket.priority);
              const statusCfg = getStatusConfig(ticket.status);
              const TypeIcon = typeConfig.icon;
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedTicketId === ticket.ticket_id;

              return (
                <motion.div
                  key={ticket.ticket_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden"
                >
                  {/* Ticket Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedTicketId(isExpanded ? null : ticket.ticket_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
                          <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-gray-500">{ticket.ticket_number}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityConfig.bgColor} ${priorityConfig.color}`}>
                              {priorityConfig.label}
                            </span>
                          </div>
                          <h3 className="font-semibold text-gray-900">{ticket.title}</h3>
                          <p className="text-sm text-gray-500">by {ticket.reporter_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${statusCfg.bgColor}`}>
                          <StatusIcon className={`w-4 h-4 ${statusCfg.color}`} />
                          <span className={`text-sm font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="w-4 h-4" />
                          {new Date(ticket.created_at + 'Z').toLocaleDateString()}
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-gray-200"
                      >
                        <div className="p-6">
                          {/* Description */}
                          {ticket.description && (
                            <div className="mb-6">
                              <h4 className="text-sm font-medium text-gray-500 mb-2">Description</h4>
                              <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                            </div>
                          )}

                          {/* Current Concern */}
                          {ticket.current_concern && (
                            <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                              <h4 className="text-sm font-medium text-orange-700 mb-2">Current Concern</h4>
                              <p className="text-orange-900 whitespace-pre-wrap">{ticket.current_concern}</p>
                            </div>
                          )}

                          {/* Concern Implementation */}
                          {ticket.proposed_changes && (
                            <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                              <h4 className="text-sm font-medium text-purple-700 mb-2">Concern Implementation</h4>
                              <p className="text-purple-900 whitespace-pre-wrap">{ticket.proposed_changes}</p>
                            </div>
                          )}

                          {/* Attachments */}
                          {ticket.attachments && ticket.attachments.length > 0 && (
                            <div className="mb-6">
                              <h4 className="text-sm font-medium text-gray-500 mb-2">Attachments</h4>
                              <div className="flex flex-wrap gap-3">
                                {ticket.attachments.map((attachment, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border"
                                  >
                                    {attachment.file_type?.startsWith('image/') ? (
                                      <Image className="w-5 h-5 text-blue-500" />
                                    ) : (
                                      <FileText className="w-5 h-5 text-gray-500" />
                                    )}
                                    <a
                                      href={attachment.file_path?.startsWith('http') ? attachment.file_path : `${API_BASE_URL}${attachment.file_path}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:underline"
                                    >
                                      {attachment.file_name}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Development Team Response */}
                          {ticket.admin_response && (
                            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                              <h4 className="text-sm font-medium text-blue-700 mb-2">Development Team Response</h4>
                              <p className="text-blue-900">{ticket.admin_response}</p>
                              {ticket.admin_name && (
                                <p className="text-sm text-blue-600 mt-2">
                                  - {ticket.admin_name}, {ticket.response_date && new Date(ticket.response_date + 'Z').toLocaleString()}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Rejection Reason */}
                          {ticket.rejection_reason && (
                            <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                              <h4 className="text-sm font-medium text-red-700 mb-2">Rejection Reason</h4>
                              <p className="text-red-900">{ticket.rejection_reason}</p>
                              {ticket.rejected_by_name && (
                                <p className="text-sm text-red-600 mt-2">
                                  - {ticket.rejected_by_name}, {ticket.rejection_date && new Date(ticket.rejection_date + 'Z').toLocaleString()}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Development Team Resolution */}
                          {ticket.resolution_notes && (
                            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                              <h4 className="text-sm font-medium text-green-700 mb-2">Development Team Resolution</h4>
                              <p className="text-green-900">{ticket.resolution_notes}</p>
                              {ticket.resolved_by_name && (
                                <p className="text-sm text-green-600 mt-2">
                                  - {ticket.resolved_by_name}, {ticket.resolution_date && new Date(ticket.resolution_date + 'Z').toLocaleString()}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Comments/Communication Section - Show for active tickets */}
                          {['approved', 'in_progress', 'resolved'].includes(ticket.status) && (
                            <div className="mb-6">
                              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                <MessageCircle className="w-4 h-4" />
                                Comments & Follow-ups
                              </h4>

                              {/* Existing Comments */}
                              {ticket.comments && ticket.comments.length > 0 && (
                                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                                  {ticket.comments.map((comment, index) => (
                                    <div
                                      key={comment.id || index}
                                      className={`p-3 rounded-lg ${
                                        comment.sender_type === 'client'
                                          ? 'bg-blue-50 border border-blue-200 ml-4'
                                          : 'bg-gray-50 border border-gray-200 mr-4'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <span className={`text-sm font-medium ${
                                          comment.sender_type === 'client' ? 'text-blue-700' : 'text-gray-700'
                                        }`}>
                                          {comment.sender_name}
                                          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                            comment.sender_type === 'client'
                                              ? 'bg-blue-100 text-blue-600'
                                              : 'bg-purple-100 text-purple-600'
                                          }`}>
                                            {comment.sender_type === 'client' ? 'You' : 'Dev Team'}
                                          </span>
                                        </span>
                                        <span className="text-xs text-gray-500">
                                          {new Date(comment.created_at + 'Z').toLocaleString()}
                                        </span>
                                      </div>
                                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.message}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add New Comment */}
                              <div className="flex gap-2">
                                <textarea
                                  value={commentText[ticket.ticket_id] || ''}
                                  onChange={(e) => setCommentText(prev => ({ ...prev, [ticket.ticket_id]: e.target.value }))}
                                  placeholder="Add a comment or follow-up question..."
                                  rows={2}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendComment(ticket.ticket_id);
                                  }}
                                  disabled={isSendingComment[ticket.ticket_id] || !commentText[ticket.ticket_id]?.trim()}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
                                >
                                  {isSendingComment[ticket.ticket_id] ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Send className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Actions for Draft */}
                          {ticket.status === 'draft' && (
                            <div className="flex items-center gap-3 pt-4 border-t">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(ticket);
                                }}
                                className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSubmitDraft(ticket.ticket_id);
                                }}
                                disabled={isSubmitting}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                <Send className="w-4 h-4" />
                                Submit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTicket(ticket.ticket_id);
                                }}
                                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </div>
                          )}

                          {/* Actions for Resolved */}
                          {ticket.status === 'resolved' && (
                            <div className="flex items-center gap-3 pt-4 border-t">
                              <div className="flex-1">
                                <p className="text-sm text-gray-600">
                                  The issue has been resolved. Please verify and confirm if it works.
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConfirmResolution(ticket.ticket_id);
                                }}
                                disabled={isSubmitting}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Confirm & Close
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {filteredTickets.length > ticketsPerPage && (
          <div className="flex items-center justify-between mt-6 bg-white rounded-xl shadow border border-gray-200 p-4">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1} to {Math.min(startIndex + ticketsPerPage, filteredTickets.length)} of {filteredTickets.length} tickets
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                      currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicSupportPage;
