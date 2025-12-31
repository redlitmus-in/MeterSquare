/**
 * Admin Support Management Page
 * For developers/company team to review and resolve user-reported bugs and issues
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug,
  AlertCircle,
  Lightbulb,
  Wrench,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Send,
  FileText,
  Image,
  Download,
  User,
  Mail,
  Shield,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Play,
  Check,
  X,
  Paperclip,
  Maximize2,
  Minimize2,
  Bell,
  BellOff,
  MessageCircle,
  Lock,
  Rocket
} from 'lucide-react';
// Socket.IO removed - using DB API polling for notifications instead
import { supportApi, SupportTicket } from '@/api/support';
import { showSuccess, showError, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { API_BASE_URL } from '@/api/config';
import {
  requestNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
  notifyNewTicket,
  initializeKnownTickets,
  isNewTicketForAdmin,
  notifyNewComment,
  notifyAdminResponse
} from '@/utils/supportNotificationHelper';
import SupportDBNotificationPanel from '@/components/support/SupportDBNotificationPanel';

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
  { value: 'critical', label: 'Critical', color: 'text-red-600', bgColor: 'bg-red-100' }
];

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  submitted: { label: 'New', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Send },
  in_review: { label: 'In Review', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Eye },
  approved: { label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-500', bgColor: 'bg-red-100', icon: XCircle },
  in_progress: { label: 'In Progress', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: Play },
  pending_deployment: { label: 'Pending Deployment', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: Rocket },
  resolved: { label: 'Resolved', color: 'text-emerald-600', bgColor: 'bg-emerald-100', icon: Check },
  closed: { label: 'Closed', color: 'text-gray-600', bgColor: 'bg-gray-200', icon: XCircle }
};

// Polling interval for checking new tickets (60 seconds to avoid rate limiting)
// ✅ PERFORMANCE: Removed polling - using real-time subscriptions instead
// const POLLING_INTERVAL = 60000; // DEPRECATED - replaced with real-time updates

const SupportManagement: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ticketsPerPage = 5;

  // Notification state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  // Using DB API polling for notifications (every 5 seconds via SupportDBNotificationPanel)
  const [isPolling] = useState(false);

  // Modal state
  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject' | 'resolve' | 'status' | null;
    ticket: SupportTicket | null;
  }>({ type: null, ticket: null });
  const [actionResponse, setActionResponse] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isModalExpanded, setIsModalExpanded] = useState(false);

  // Comment state
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [isSendingComment, setIsSendingComment] = useState<Record<number, boolean>>({});

  // Close ticket state
  const [closeTicketModal, setCloseTicketModal] = useState<{ ticket: SupportTicket | null }>({ ticket: null });
  const [closeTicketNotes, setCloseTicketNotes] = useState('');

  // File handling functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isValid = file.size <= 10 * 1024 * 1024; // 10MB
      if (!isValid) {
        showError(`File ${file.name} is too large (max 10MB)`);
      }
      return isValid;
    });
    setSelectedFiles(prev => [...prev, ...validFiles]);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearModalState = () => {
    setActionModal({ type: null, ticket: null });
    setActionResponse('');
    setRejectionReason('');
    setResolutionNotes('');
    setNewStatus('');
    setSelectedFiles([]);
    setIsModalExpanded(false);
  };

  // Check for new tickets and send notifications
  const checkForNewTickets = useCallback((newTickets: SupportTicket[]) => {
    // Initialize known tickets (uses sessionStorage, preserves existing)
    // Pass full ticket objects with ticket_id and comments for proper initialization
    initializeKnownTickets(newTickets.map(t => ({ ticket_id: t.ticket_id, comments: t.comments })));

    // Check for new tickets (submitted status only - new tickets)
    newTickets.forEach(ticket => {
      if (ticket.status === 'submitted' && isNewTicketForAdmin(ticket.ticket_id)) {
        // New ticket found - send notification
        notifyNewTicket(
          ticket.ticket_number,
          ticket.title,
          ticket.reporter_name,
          ticket.reporter_role || 'estimator',
          ticket.reporter_email || '',
          ticket.ticket_id
        );

        // Also show toast notification
        showInfo(`New ticket from ${ticket.reporter_name}: "${ticket.title}"`);
      }
    });
  }, []);

  const loadTickets = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      const params: any = { per_page: 100 };
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterType !== 'all') params.ticket_type = filterType;
      if (filterPriority !== 'all') params.priority = filterPriority;
      if (searchQuery) params.search = searchQuery;

      const response = await supportApi.getAllTickets(params);
      if (response.success) {
        // Check for new tickets before updating state
        checkForNewTickets(response.tickets);
        setTickets(response.tickets);
        setStats(response.statistics);
      }
    } catch (error: any) {
      if (showLoader) {
        showError('Failed to load tickets');
      }
      console.error('Error loading tickets:', error);
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [filterStatus, filterType, filterPriority, searchQuery, checkForNewTickets]);

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

  // Store loadTickets in a ref to avoid dependency issues
  const loadTicketsRef = useRef(loadTickets);
  loadTicketsRef.current = loadTickets;

  // Load tickets on mount and when filters change
  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Set up polling separately (only depends on isPolling)
  useEffect(() => {
    if (isPolling) {
      pollingIntervalRef.current = setInterval(() => {
        loadTicketsRef.current(false); // Silent load (no loader)
      }, POLLING_INTERVAL);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [isPolling]);

  // Real-time updates handled by SupportDBNotificationPanel (polling every 5 seconds)

  // Handle notification permission request
  const handleRequestNotificationPermission = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      showSuccess('Desktop notifications enabled! You will be notified of new tickets.');
    } else if (permission === 'denied') {
      showError('Notification permission denied. You can enable it in browser settings.');
    }
  };

  const handleSearch = () => {
    loadTickets();
  };

  const handleApprove = async () => {
    if (!actionModal.ticket) return;
    const ticket = actionModal.ticket;
    try {
      setIsProcessing(true);
      const response = await supportApi.approveTicket(ticket.ticket_id, 'Development Team', actionResponse);
      if (response.success) {
        showSuccess('Ticket approved successfully');
        // Notify the ticket reporter
        notifyAdminResponse(
          ticket.ticket_number,
          ticket.title,
          'approved',
          ticket.reporter_role || 'estimator',
          ticket.reporter_email || '',
          ticket.ticket_id
        );
        clearModalState();
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to approve ticket');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!actionModal.ticket || !rejectionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }
    const ticket = actionModal.ticket;
    try {
      setIsProcessing(true);
      const response = await supportApi.rejectTicket(
        ticket.ticket_id,
        rejectionReason,
        'Development Team',  // adminName
        actionResponse       // response text
      );
      if (response.success) {
        showSuccess('Ticket rejected');
        // Notify the ticket reporter
        notifyAdminResponse(
          ticket.ticket_number,
          ticket.title,
          'rejected',
          ticket.reporter_role || 'estimator',
          ticket.reporter_email || '',
          ticket.ticket_id
        );
        clearModalState();
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to reject ticket');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolve = async () => {
    if (!actionModal.ticket) return;
    const ticket = actionModal.ticket;

    // Validate resolution notes (mandatory)
    if (!resolutionNotes.trim()) {
      showError('Please provide resolution notes describing how the issue was resolved');
      return;
    }

    try {
      setIsProcessing(true);
      const response = await supportApi.resolveTicket(ticket.ticket_id, 'Dev Team', resolutionNotes, selectedFiles);
      if (response.success) {
        showSuccess('Ticket marked as resolved');
        // Notify the ticket reporter
        notifyAdminResponse(
          ticket.ticket_number,
          ticket.title,
          'resolved',
          ticket.reporter_role || 'estimator',
          ticket.reporter_email || '',
          ticket.ticket_id
        );
        clearModalState();
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to resolve ticket');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusChange = async () => {
    if (!actionModal.ticket || !newStatus) return;
    const ticket = actionModal.ticket;
    try {
      setIsProcessing(true);
      const response = await supportApi.updateTicketStatus(
        ticket.ticket_id,
        newStatus,
        'Development Team',  // adminName
        actionResponse       // response text
      );
      if (response.success) {
        showSuccess('Ticket status updated');
        // Notify the ticket reporter about status change
        const responseType = newStatus === 'in_progress' ? 'in_progress' : 'response';
        notifyAdminResponse(
          ticket.ticket_number,
          ticket.title,
          responseType,
          ticket.reporter_role || 'estimator',
          ticket.reporter_email || '',
          ticket.ticket_id
        );
        clearModalState();
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to update status');
    } finally {
      setIsProcessing(false);
    }
  };

  // Send comment as dev team
  const handleSendComment = async (ticketId: number) => {
    const message = commentText[ticketId]?.trim();
    if (!message) {
      showError('Please enter a comment');
      return;
    }

    // Find the ticket to get reporter info for notification
    const ticket = tickets.find(t => t.ticket_id === ticketId);

    try {
      setIsSendingComment(prev => ({ ...prev, [ticketId]: true }));
      const response = await supportApi.addComment(ticketId, {
        message,
        sender_type: 'dev_team',
        sender_name: 'Dev Team'
      });

      if (response.success) {
        showSuccess('Comment sent successfully');
        setCommentText(prev => ({ ...prev, [ticketId]: '' }));

        // Send notification to the ticket reporter (dev team sent comment)
        if (ticket) {
          notifyNewComment(
            ticket.ticket_number,
            ticket.title,
            'Dev Team',
            'dev_team',
            ticket.reporter_role || 'estimator',
            ticket.reporter_email || '',
            ticketId
          );
        }

        loadTickets(false); // Reload to get updated comments
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to send comment');
    } finally {
      setIsSendingComment(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  // Close ticket directly (if client forgets)
  const handleCloseTicket = async () => {
    if (!closeTicketModal.ticket) return;
    const ticket = closeTicketModal.ticket;

    try {
      setIsProcessing(true);
      const response = await supportApi.adminCloseTicket(
        ticket.ticket_id,
        'Dev Team',
        closeTicketNotes
      );
      if (response.success) {
        showSuccess('Ticket closed successfully');
        // Notify the ticket reporter that ticket was closed
        notifyAdminResponse(
          ticket.ticket_number,
          ticket.title,
          'response', // Use 'response' for closed status notification
          ticket.reporter_role || 'estimator',
          ticket.reporter_email || '',
          ticket.ticket_id
        );
        setCloseTicketModal({ ticket: null });
        setCloseTicketNotes('');
        loadTickets();
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to close ticket');
    } finally {
      setIsProcessing(false);
    }
  };


  const getTypeConfig = (type: string) => ticketTypes.find(t => t.value === type) || ticketTypes[0];
  const getPriorityConfig = (priority: string) => priorityOptions.find(p => p.value === priority) || priorityOptions[1];
  const getStatusConfig = (status: string) => statusConfig[status] || statusConfig.submitted;

  // Pagination
  const totalPages = Math.ceil(tickets.length / ticketsPerPage);
  const startIndex = (currentPage - 1) * ticketsPerPage;
  const paginatedTickets = tickets.slice(startIndex, startIndex + ticketsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterType, filterPriority, searchQuery]);

  if (isLoading && tickets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ModernLoadingSpinners type="ring" size="lg" />
      </div>
    );
  }

  return (
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
                <Shield className="w-6 h-6 text-blue-600" />
                Support Management
              </h1>
              <p className="text-gray-500 text-sm">
                Review and resolve user-reported bugs, issues, and feature requests
              </p>
            </div>
          </div>

          {/* Notification Panel - fetches from database API for support-management page */}
          <SupportDBNotificationPanel />
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.total_submitted}</div>
            <div className="text-sm text-blue-700">New</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.total_in_review}</div>
            <div className="text-sm text-yellow-700">In Review</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-600">{stats.total_approved}</div>
            <div className="text-sm text-green-700">Approved</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.total_in_progress}</div>
            <div className="text-sm text-purple-700">In Progress</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.total_resolved}</div>
            <div className="text-sm text-emerald-700">Resolved</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-red-600">{stats.total_rejected}</div>
            <div className="text-sm text-red-700">Rejected</div>
          </div>
        </div>
      )}

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
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search tickets..."
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
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {tickets.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No tickets to review</h3>
            <p className="text-gray-500">All caught up! No pending tickets match your filters.</p>
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
                layout
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm text-gray-500">{ticket.ticket_number}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityConfig.bgColor} ${priorityConfig.color}`}>
                            {priorityConfig.label}
                          </span>
                          <span className="text-sm text-gray-500">by {ticket.reporter_name}</span>
                        </div>
                        <h3 className="font-semibold text-gray-900 mt-1">{ticket.title}</h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${statusCfg.bgColor}`}>
                        <StatusIcon className={`w-4 h-4 ${statusCfg.color}`} />
                        <span className={`text-sm font-medium ${statusCfg.color}`}>
                          {ticket.status === 'closed' && ticket.closed_by
                            ? `Closed by ${ticket.closed_by === 'client' ? 'Client' : 'Dev Team'}`
                            : statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        {new Date((ticket.submitted_at || ticket.created_at) + 'Z').toLocaleDateString()}
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
                        {/* Reporter Info */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-500 mb-3">Reporter Information</h4>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-900">{ticket.reporter_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-900">{ticket.reporter_email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-900">{ticket.reporter_role}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-900">
                                {new Date((ticket.submitted_at || ticket.created_at) + 'Z').toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        {ticket.description && (
                          <div className="mb-6">
                            <h4 className="text-sm font-medium text-gray-500 mb-2">Description</h4>
                            <div className="p-4 bg-white border border-gray-200 rounded-lg">
                              <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                            </div>
                          </div>
                        )}

                        {/* Current Concern */}
                        {(ticket.current_concern || ticket.attachments?.some((a: any) => a.section === 'current_concern' || (!a.section && a.uploaded_by_role !== 'admin'))) && (
                          <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                            <h4 className="text-sm font-medium text-orange-700 mb-2">Current Concern</h4>
                            {ticket.current_concern && (
                              <p className="text-orange-900 whitespace-pre-wrap mb-3">{ticket.current_concern}</p>
                            )}
                            {/* Current Concern Attachments */}
                            {ticket.attachments?.filter((a: any) => a.section === 'current_concern' || (!a.section && a.uploaded_by_role !== 'admin')).length > 0 && (
                              <div className="mt-3 pt-3 border-t border-orange-200">
                                <h5 className="text-sm font-medium text-orange-600 mb-2">Attachments</h5>
                                <div className="flex flex-wrap gap-2">
                                  {ticket.attachments
                                    .filter((a: any) => a.section === 'current_concern' || (!a.section && a.uploaded_by_role !== 'admin'))
                                    .map((attachment: any, index: number) => {
                                      const fileUrl = attachment.file_path?.startsWith('http')
                                        ? attachment.file_path
                                        : `${API_BASE_URL}${attachment.file_path}`;
                                      return (
                                        <a
                                          key={index}
                                          href={fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 p-2 bg-orange-100 rounded-lg border border-orange-300 hover:bg-orange-200 transition-colors text-sm"
                                        >
                                          {attachment.file_type?.startsWith('image/') ? (
                                            <Image className="w-4 h-4 text-orange-600" />
                                          ) : (
                                            <FileText className="w-4 h-4 text-orange-600" />
                                          )}
                                          <span className="text-orange-800">{attachment.file_name}</span>
                                          <Download className="w-3 h-3 text-orange-500" />
                                        </a>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Concern Implementation */}
                        {(ticket.proposed_changes || ticket.attachments?.some((a: any) => a.section === 'implementation')) && (
                          <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                            <h4 className="text-sm font-medium text-purple-700 mb-2">Concern Implementation</h4>
                            {ticket.proposed_changes && (
                              <p className="text-purple-900 whitespace-pre-wrap mb-3">{ticket.proposed_changes}</p>
                            )}
                            {/* Implementation Attachments */}
                            {ticket.attachments?.filter((a: any) => a.section === 'implementation').length > 0 && (
                              <div className="mt-3 pt-3 border-t border-purple-200">
                                <h5 className="text-sm font-medium text-purple-600 mb-2">Attachments</h5>
                                <div className="flex flex-wrap gap-2">
                                  {ticket.attachments
                                    .filter((a: any) => a.section === 'implementation')
                                    .map((attachment: any, index: number) => {
                                      const fileUrl = attachment.file_path?.startsWith('http')
                                        ? attachment.file_path
                                        : `${API_BASE_URL}${attachment.file_path}`;
                                      return (
                                        <a
                                          key={index}
                                          href={fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 p-2 bg-purple-100 rounded-lg border border-purple-300 hover:bg-purple-200 transition-colors text-sm"
                                        >
                                          {attachment.file_type?.startsWith('image/') ? (
                                            <Image className="w-4 h-4 text-purple-600" />
                                          ) : (
                                            <FileText className="w-4 h-4 text-purple-600" />
                                          )}
                                          <span className="text-purple-800">{attachment.file_name}</span>
                                          <Download className="w-3 h-3 text-purple-500" />
                                        </a>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Development Team Response History */}
                        {ticket.response_history && ticket.response_history.filter((e: any) => e.type !== 'resolution' && e.type !== 'closed').length > 0 && (
                          <div className="mb-6">
                            <h4 className="text-sm font-medium text-gray-700 mb-3">Development Team Response History</h4>
                            <div className="space-y-3">
                              {[...ticket.response_history]
                                .filter((entry: any) => entry.type !== 'resolution' && entry.type !== 'closed') // Resolution and Closed shown separately below
                                .sort((a: any, b: any) =>
                                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                              ).map((entry: any, index: number) => {
                                // Determine colors based on response type
                                const typeConfig = {
                                  approval: { bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-700', text: 'text-green-900', badge: 'bg-green-100 text-green-700', label: 'Approved' },
                                  status_change: { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-700', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-700', label: 'Status Changed' },
                                  rejection: { bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-700', text: 'text-red-900', badge: 'bg-red-100 text-red-700', label: 'Rejected' },
                                  resolution: { bg: 'bg-emerald-50', border: 'border-emerald-200', title: 'text-emerald-700', text: 'text-emerald-900', badge: 'bg-emerald-100 text-emerald-700', label: 'Resolved' },
                                  closed: { bg: 'bg-gray-50', border: 'border-gray-300', title: 'text-gray-700', text: 'text-gray-900', badge: 'bg-gray-200 text-gray-700', label: 'Closed' }
                                };
                                const config = typeConfig[entry.type as keyof typeof typeConfig] || typeConfig.status_change;

                                // Custom label for closed type showing who closed it
                                const displayLabel = entry.type === 'closed'
                                  ? `Closed by ${entry.closed_by === 'client' ? 'Client' : 'Dev Team'}`
                                  : config.label;

                                return (
                                  <div key={index} className={`p-4 rounded-lg border ${config.bg} ${config.border}`}>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${config.badge}`}>
                                        {displayLabel}
                                        {entry.type === 'status_change' && entry.new_status && (
                                          <span className="ml-1">→ {entry.new_status.replace('_', ' ')}</span>
                                        )}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {new Date(entry.created_at + 'Z').toLocaleString()}
                                      </span>
                                    </div>
                                    {entry.response && (
                                      <p className={`${config.text} whitespace-pre-wrap`}>{entry.response}</p>
                                    )}
                                    {entry.reason && (
                                      <p className={`${config.text} whitespace-pre-wrap mt-1`}>
                                        <strong>Reason:</strong> {entry.reason}
                                      </p>
                                    )}
                                    <p className={`text-sm ${config.title} mt-2`}>
                                      — {entry.admin_name}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Legacy: Show admin_response if no response_history (for older tickets) */}
                        {(!ticket.response_history || ticket.response_history.length === 0) && ticket.admin_response && (
                          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="text-sm font-medium text-blue-700 mb-2">Development Team Response</h4>
                            <p className="text-blue-900">{ticket.admin_response}</p>
                            {ticket.admin_name && (
                              <p className="text-sm text-blue-600 mt-2">
                                — {ticket.admin_name}, {ticket.response_date && new Date(ticket.response_date + 'Z').toLocaleString()}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Development Team Resolution */}
                        {(ticket.resolution_notes || ticket.attachments?.some((a: any) => a.uploaded_by_role === 'admin' || a.section === 'admin')) && (
                          <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                            <h4 className="text-sm font-medium text-green-700 mb-2">Development Team Resolution</h4>
                            {ticket.resolution_notes && (
                              <p className="text-green-900 whitespace-pre-wrap">{ticket.resolution_notes}</p>
                            )}
                            {ticket.resolved_by_name && (
                              <p className="text-sm text-green-600 mt-2">
                                — {ticket.resolved_by_name}, {ticket.resolution_date && new Date(ticket.resolution_date + 'Z').toLocaleString()}
                              </p>
                            )}
                            {/* Resolution Attachments */}
                            {ticket.attachments?.filter((a: any) => a.uploaded_by_role === 'admin' || a.section === 'admin').length > 0 && (
                              <div className="mt-4 pt-3 border-t border-green-200">
                                <h5 className="text-sm font-medium text-green-700 mb-2">Resolution Files</h5>
                                <div className="flex flex-wrap gap-2">
                                  {ticket.attachments
                                    .filter((a: any) => a.uploaded_by_role === 'admin' || a.section === 'admin')
                                    .map((attachment: any, index: number) => {
                                      const fileUrl = attachment.file_path?.startsWith('http')
                                        ? attachment.file_path
                                        : `${API_BASE_URL}${attachment.file_path}`;
                                      return (
                                        <a
                                          key={index}
                                          href={fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 p-2 bg-green-100 rounded-lg border border-green-300 hover:bg-green-200 transition-colors text-sm"
                                        >
                                          {attachment.file_type?.startsWith('image/') ? (
                                            <Image className="w-4 h-4 text-green-600" />
                                          ) : (
                                            <FileText className="w-4 h-4 text-green-600" />
                                          )}
                                          <span className="text-green-800">{attachment.file_name}</span>
                                          <Download className="w-3 h-3 text-green-500" />
                                        </a>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Ticket Closed Section - Show after Resolution */}
                        {ticket.response_history?.filter((e: any) => e.type === 'closed').length > 0 && (
                          <div className="mb-6">
                            {ticket.response_history
                              .filter((entry: any) => entry.type === 'closed')
                              .map((entry: any, index: number) => (
                                <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-300">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
                                      {entry.closed_by === 'client' ? 'Closed by Client' : 'Closed by Dev Team'}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {new Date(entry.created_at + 'Z').toLocaleString()}
                                    </span>
                                  </div>
                                  {entry.response && (
                                    <p className="text-gray-900 whitespace-pre-wrap">{entry.response}</p>
                                  )}
                                  <p className="text-sm text-gray-600 mt-2">
                                    — {entry.admin_name}
                                  </p>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Comments/Communication Section - Show for active and closed tickets, and in_review if previously approved */}
                        {(['approved', 'in_progress', 'pending_deployment', 'resolved', 'closed'].includes(ticket.status) || (ticket.status === 'in_review' && ticket.approval_date)) && (
                          <div className="mb-6">
                            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                              <MessageCircle className="w-4 h-4" />
                              Comments & Communication
                            </h4>

                            {/* Existing Comments */}
                            {ticket.comments && ticket.comments.length > 0 && (
                              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                                {ticket.comments.map((comment, index) => (
                                  <div
                                    key={comment.id || index}
                                    className={`p-3 rounded-lg ${
                                      comment.sender_type === 'dev_team'
                                        ? 'bg-purple-50 border border-purple-200 ml-4'
                                        : 'bg-gray-50 border border-gray-200 mr-4'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <span className={`text-sm font-medium ${
                                        comment.sender_type === 'dev_team' ? 'text-purple-700' : 'text-gray-700'
                                      }`}>
                                        {comment.sender_name}
                                        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                          comment.sender_type === 'dev_team'
                                            ? 'bg-purple-100 text-purple-600'
                                            : 'bg-blue-100 text-blue-600'
                                        }`}>
                                          {comment.sender_type === 'dev_team' ? 'Dev Team' : 'Client'}
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

                            {/* Add New Comment - only for non-closed tickets */}
                            {ticket.status !== 'closed' ? (
                              <div className="flex gap-2">
                                <textarea
                                  value={commentText[ticket.ticket_id] || ''}
                                  onChange={(e) => setCommentText(prev => ({ ...prev, [ticket.ticket_id]: e.target.value }))}
                                  placeholder="Add a comment or update for the client..."
                                  rows={2}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendComment(ticket.ticket_id);
                                  }}
                                  disabled={isSendingComment[ticket.ticket_id] || !commentText[ticket.ticket_id]?.trim()}
                                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
                                >
                                  {isSendingComment[ticket.ticket_id] ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Send className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">
                                This ticket is closed. Comments are read-only.
                              </p>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-4 border-t flex-wrap">
                          {/* Approve/Reject - only for submitted/in_review tickets that have NOT been approved before */}
                          {(ticket.status === 'submitted' || ticket.status === 'in_review') && !ticket.approval_date && (
                            <>
                              <button
                                onClick={() => setActionModal({ type: 'approve', ticket })}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                              >
                                <ThumbsUp className="w-4 h-4" />
                                Approve
                              </button>
                              <button
                                onClick={() => setActionModal({ type: 'reject', ticket })}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                              >
                                <ThumbsDown className="w-4 h-4" />
                                Reject
                              </button>
                            </>
                          )}

                          {/* Resolve for approved/in_progress/pending_deployment tickets OR in_review with prior approval */}
                          {(ticket.status === 'approved' || ticket.status === 'in_progress' || ticket.status === 'pending_deployment' || (ticket.status === 'in_review' && ticket.approval_date)) && (
                            <button
                              onClick={() => setActionModal({ type: 'resolve', ticket })}
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                              Mark Resolved
                            </button>
                          )}

                          {/* Change Status - Show after approved or for in_review with prior approval */}
                          {(['approved', 'in_progress', 'pending_deployment'].includes(ticket.status) || (ticket.status === 'in_review' && ticket.approval_date)) && (
                            <button
                              onClick={() => setActionModal({ type: 'status', ticket })}
                              className="flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Change Status
                            </button>
                          )}

                          {/* Close Ticket - For resolved tickets if client forgets */}
                          {ticket.status === 'resolved' && (
                            <button
                              onClick={() => setCloseTicketModal({ ticket })}
                              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                              <Lock className="w-4 h-4" />
                              Close Ticket
                            </button>
                          )}
                        </div>
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
      {tickets.length > ticketsPerPage && (
        <div className="flex items-center justify-between mt-6 bg-white rounded-xl shadow border border-gray-200 p-4">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(startIndex + ticketsPerPage, tickets.length)} of {tickets.length} tickets
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

      {/* Action Modal */}
      <AnimatePresence>
        {actionModal.type && actionModal.ticket && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => clearModalState()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`bg-white rounded-xl shadow-xl p-6 transition-all duration-300 relative ${
                isModalExpanded
                  ? 'max-w-4xl w-full max-h-[90vh] overflow-y-auto'
                  : 'max-w-lg w-full'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Expand/Collapse Button */}
              <button
                onClick={() => setIsModalExpanded(!isModalExpanded)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
                title={isModalExpanded ? 'Collapse' : 'Expand'}
              >
                {isModalExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
              {/* Approve Modal */}
              {actionModal.type === 'approve' && (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2 pr-10">
                    <ThumbsUp className="w-6 h-6 text-green-600" />
                    Approve Ticket
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Approving ticket <strong>{actionModal.ticket.ticket_number}</strong>
                  </p>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Response (Optional)
                    </label>
                    <textarea
                      value={actionResponse}
                      onChange={(e) => setActionResponse(e.target.value)}
                      placeholder="Add a response message..."
                      rows={isModalExpanded ? 10 : 4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 resize-y"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={clearModalState}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                      Approve
                    </button>
                  </div>
                </>
              )}

              {/* Reject Modal */}
              {actionModal.type === 'reject' && (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2 pr-10">
                    <ThumbsDown className="w-6 h-6 text-red-600" />
                    Reject Ticket
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Rejecting ticket <strong>{actionModal.ticket.ticket_number}</strong>
                  </p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rejection Reason *
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Explain why this ticket is being rejected..."
                      rows={isModalExpanded ? 8 : 3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 resize-y"
                    />
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Response (Optional)
                    </label>
                    <textarea
                      value={actionResponse}
                      onChange={(e) => setActionResponse(e.target.value)}
                      placeholder="Any additional message for the user..."
                      rows={isModalExpanded ? 6 : 2}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 resize-y"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={clearModalState}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={isProcessing || !rejectionReason.trim()}
                      className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                      Reject
                    </button>
                  </div>
                </>
              )}

              {/* Resolve Modal */}
              {actionModal.type === 'resolve' && (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2 pr-10">
                    <Check className="w-6 h-6 text-emerald-600" />
                    Mark as Resolved
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Resolving ticket <strong>{actionModal.ticket.ticket_number}</strong>
                  </p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Resolution Notes <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Describe how the issue was resolved... (Required)"
                      rows={isModalExpanded ? 12 : 4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 resize-y"
                      required
                    />
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls,.zip,.rar"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* File Upload Area */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Attach Files (Optional)
                    </label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                    >
                      <Paperclip className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                      <p className="text-sm text-gray-600">Click to attach files</p>
                    </div>
                  </div>

                  {/* Selected Files List */}
                  {selectedFiles.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            {file.type.startsWith('image/') ? (
                              <Image className="w-4 h-4 text-blue-500" />
                            ) : (
                              <FileText className="w-4 h-4 text-gray-500" />
                            )}
                            <span className="text-sm text-gray-700">{file.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="p-1 text-red-500 hover:bg-red-100 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={clearModalState}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResolve}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Mark Resolved
                    </button>
                  </div>
                </>
              )}

              {/* Status Change Modal */}
              {actionModal.type === 'status' && (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2 pr-10">
                    <RefreshCw className="w-6 h-6 text-blue-600" />
                    Change Status
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Update status for ticket <strong>{actionModal.ticket.ticket_number}</strong>
                  </p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select status...</option>
                      <option value="in_review">In Review</option>
                      <option value="in_progress">In Progress</option>
                      <option value="pending_deployment">Pending Deployment</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status Update Note (Optional)
                    </label>
                    <textarea
                      value={actionResponse}
                      onChange={(e) => setActionResponse(e.target.value)}
                      placeholder="Add a note about this status change (this will be visible to the client)..."
                      rows={isModalExpanded ? 10 : 4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This note will appear in the "Development Team Response" section of the ticket.
                    </p>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={clearModalState}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleStatusChange}
                      disabled={isProcessing || !newStatus}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Update Status
                    </button>
                  </div>
                </>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close Ticket Modal */}
      <AnimatePresence>
        {closeTicketModal.ticket && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setCloseTicketModal({ ticket: null });
              setCloseTicketNotes('');
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Lock className="w-6 h-6 text-gray-600" />
                Close Ticket
              </h3>
              <p className="text-gray-600 mb-4">
                Close ticket <strong>{closeTicketModal.ticket.ticket_number}</strong> if the client has not confirmed resolution.
              </p>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Closing Notes (Optional)
                </label>
                <textarea
                  value={closeTicketNotes}
                  onChange={(e) => setCloseTicketNotes(e.target.value)}
                  placeholder="Add any notes about closing this ticket..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 resize-y"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setCloseTicketModal({ ticket: null });
                    setCloseTicketNotes('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCloseTicket}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Close Ticket
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SupportManagement;
