import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  Clock,
  User,
  CheckCircle,
  XCircle,
  FileText,
  Edit,
  MessageSquare,
  RefreshCw,
  ArrowRight,
  Calendar,
  Filter,
  ShoppingCart,
  Package,
  Store,
  TruckIcon
} from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { toast } from 'sonner';
import DayExtensionApprovalModal from '@/roles/technical-director/components/DayExtensionApprovalModal';

interface BOQHistoryTimelineProps {
  boqId: number;
  onDataChange?: () => void; // Callback to notify parent when data changes (e.g., after approval)
}

interface BackendHistoryAction {
  role?: string;
  type?: string;
  sender?: string;
  receiver?: string;
  status?: string;
  boq_name?: string;
  comments?: string;
  timestamp?: string;
  sender_name?: string;
  sender_user_id?: number;
  total_value?: number;
  item_count?: number;
  project_name?: string;
  recipient_email?: string;
  recipient_name?: string;
  attachments?: string[];
  rejection_reason?: string;
  justification?: string;
  cr_id?: number;
  item_name?: string;
  materials_count?: number;
  total_cost?: number;
  vendor_id?: number;
  vendor_name?: string;
  purchase_notes?: string;
  vendor_selection_status?: string;
  // Day Extension fields
  original_duration?: number;
  requested_days?: number;
  approved_days?: number;
  new_duration?: number;
  original_end_date?: string;
  new_end_date?: string;
  extension_reason?: string;
  extension_status?: string;
}

interface BackendHistoryRecord {
  boq_history_id: number;
  boq_id: number;
  action: BackendHistoryAction[];  // Array of actions
  action_by: string;
  boq_status?: string;
  sender?: string;
  receiver?: string;
  comments?: string;
  sender_role?: string;
  receiver_role?: string;
  action_date: string;
  created_at?: string;
  created_by?: string;
}

interface HistoryAction {
  action_id: number;
  action_type: string;
  action_by: string;
  sender_role?: string;
  receiver_role?: string;
  action_at: string;
  sender_email?: string;
  receiver_email?: string;
  recipient_name?: string;
  comments?: string;
  status?: string;
  old_status?: string;
  new_status?: string;
  project_name?: string;
  total_value?: number;
  item_count?: number;
  attachments?: string[];
  rejection_reason?: string;
  justification?: string;
  cr_id?: number;
  item_name?: string;
  materials_count?: number;
  vendor_name?: string;
  purchase_notes?: string;
  // Day Extension fields
  original_duration?: number;
  requested_days?: number;
  approved_days?: number;
  new_duration?: number;
  original_end_date?: string;
  new_end_date?: string;
  extension_reason?: string;
  extension_status?: string;
}

const BOQHistoryTimeline: React.FC<BOQHistoryTimelineProps> = ({ boqId, onDataChange }) => {
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<any>(null);

  // Get current user role from localStorage
  const userStr = localStorage.getItem('user');
  const userRole = userStr ? String(JSON.parse(userStr)?.role_id || '').toLowerCase() : '';
  const isTD = userRole === 'technical_director' || userRole === 'technical director' || userRole === 'technicaldir' || userRole === 'td';

  useEffect(() => {
    loadHistory();
  }, [boqId]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQHistory(boqId);
      if (result.success && result.data) {
        // Transform backend data to frontend format
        const transformedHistory: HistoryAction[] = [];

        result.data.forEach((record: BackendHistoryRecord) => {
          // If action is an array, process each action
          if (Array.isArray(record.action)) {
            record.action.forEach((actionItem: any, index) => {
              // Get the correct action_by name based on action type
              let actionByName = record.action_by;
              if (actionItem.type === 'revision_sent' || actionItem.type === 'email_sent') {
                actionByName = actionItem.decided_by || actionItem.sender || record.action_by;
              } else if (actionItem.type === 'boq_updated') {
                actionByName = actionItem.updated_by || actionItem.user_name || record.action_by;
              }

              transformedHistory.push({
                action_id: record.boq_history_id * 1000 + index, // Generate unique ID
                action_type: actionItem.type?.toUpperCase().replace(/_/g, '_') || 'UNKNOWN',
                action_by: actionByName,
                sender_role: record.sender_role,
                receiver_role: record.receiver_role,
                action_at: actionItem.timestamp || record.action_date,
                sender_email: record.sender_role === 'estimator' ? record.sender : undefined,
                receiver_email: actionItem.recipient_email || record.receiver,
                recipient_name: actionItem.recipient_name || record.receiver,
                comments: actionItem.comments || actionItem.rejection_reason || record.comments,
                status: actionItem.status || record.boq_status,
                project_name: actionItem.project_name,
                total_value: actionItem.total_value || actionItem.total_cost,
                item_count: actionItem.item_count || actionItem.total_items,
                attachments: actionItem.attachments,
                rejection_reason: actionItem.rejection_reason,
                justification: actionItem.justification,
                cr_id: actionItem.cr_id,
                item_name: actionItem.item_name,
                materials_count: actionItem.materials_count,
                vendor_name: actionItem.vendor_name,
                purchase_notes: actionItem.purchase_notes,
                // Day Extension fields
                original_duration: actionItem.original_duration,
                requested_days: actionItem.requested_days,
                approved_days: actionItem.approved_days,
                new_duration: actionItem.new_duration,
                original_end_date: actionItem.original_end_date,
                new_end_date: actionItem.new_end_date,
                extension_reason: actionItem.extension_reason,
                extension_status: actionItem.extension_status
              });
            });
          } else {
            // Handle non-array action (legacy format or single action)
            transformedHistory.push({
              action_id: record.boq_history_id,
              action_type: 'ACTION',
              action_by: record.action_by,
              sender_role: record.sender_role,
              receiver_role: record.receiver_role,
              action_at: record.action_date,
              comments: record.comments,
              status: record.boq_status
            });
          }
        });

        setHistory(transformedHistory);
      } else {
        toast.error(result.message || 'Failed to load BOQ history');
      }
    } catch (error) {
      console.error('Error loading BOQ history:', error);
      toast.error('Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    const normalizedType = actionType?.toUpperCase();
    switch (normalizedType) {
      case 'SENT_TO_TD':
      case 'EMAIL_SENT':
        return <Mail className="w-5 h-5 text-purple-600" />;
      case 'SENT_TO_CLIENT':
        return <Mail className="w-5 h-5 text-blue-600" />;
      case 'STATUS_CHANGED':
        return <RefreshCw className="w-5 h-5 text-blue-600" />;
      case 'CREATED':
      case 'BOQ_CREATED':
        return <FileText className="w-5 h-5 text-green-600" />;
      case 'UPDATED':
      case 'BOQ_UPDATED':
        return <Edit className="w-5 h-5 text-orange-600" />;
      case 'APPROVED':
      case 'TD_APPROVED':
      case 'CLIENT_APPROVED':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'REJECTED':
      case 'TD_REJECTED':
      case 'CLIENT_REJECTED':
        return <XCircle className="w-5 h-5 text-red-600" />;
      // Change Request Actions
      case 'CHANGE_REQUEST_CREATED':
        return <ShoppingCart className="w-5 h-5 text-blue-600" />;
      case 'CHANGE_REQUEST_SENT_FOR_REVIEW':
        return <Mail className="w-5 h-5 text-indigo-600" />;
      case 'CHANGE_REQUEST_APPROVED_BY_PM':
      case 'CHANGE_REQUEST_APPROVED_BY_TD':
      case 'CHANGE_REQUEST_APPROVED_BY_ESTIMATOR':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'CHANGE_REQUEST_REJECTED':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'CHANGE_REQUEST_VENDOR_SELECTED':
        return <Store className="w-5 h-5 text-purple-600" />;
      case 'CHANGE_REQUEST_VENDOR_APPROVED_BY_TD':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'CHANGE_REQUEST_PURCHASE_COMPLETED':
        return <Package className="w-5 h-5 text-blue-600" />;
      // Day Extension Actions
      case 'DAY_EXTENSION_REQUESTED':
        return <Calendar className="w-5 h-5 text-blue-600" />;
      case 'DAY_EXTENSION_APPROVED':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'DAY_EXTENSION_REJECTED':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getActionColor = (actionType: string) => {
    const normalizedType = actionType?.toUpperCase();
    switch (normalizedType) {
      case 'SENT_TO_TD':
      case 'EMAIL_SENT':
        return 'from-purple-50 to-purple-100/30 border-purple-200';
      case 'REVISION_SENT':
        return 'from-purple-50 to-purple-100/30 border-purple-200';
      case 'REVISION_APPROVED':
        return 'from-green-50 to-green-100/30 border-green-200';
      case 'SENT_TO_CLIENT':
        return 'from-blue-50 to-blue-100/30 border-blue-200';
      case 'STATUS_CHANGED':
        return 'from-green-50 to-green-100/30 border-green-200';
      case 'CREATED':
      case 'BOQ_CREATED':
        return 'from-green-50 to-green-100/30 border-green-200';
      case 'UPDATED':
      case 'BOQ_UPDATED':
        return 'from-orange-50 to-orange-100/30 border-orange-200';
      case 'APPROVED':
      case 'TD_APPROVED':
      case 'CLIENT_APPROVED':
        return 'from-green-50 to-green-100/30 border-green-200';
      case 'REJECTED':
      case 'TD_REJECTED':
      case 'CLIENT_REJECTED':
        return 'from-red-50 to-red-100/30 border-red-200';
      // Change Request Actions
      case 'CHANGE_REQUEST_CREATED':
        return 'from-blue-50 to-blue-100/30 border-blue-200';
      case 'CHANGE_REQUEST_SENT_FOR_REVIEW':
        return 'from-indigo-50 to-indigo-100/30 border-indigo-200';
      case 'CHANGE_REQUEST_APPROVED_BY_PM':
      case 'CHANGE_REQUEST_APPROVED_BY_TD':
      case 'CHANGE_REQUEST_APPROVED_BY_ESTIMATOR':
      case 'CHANGE_REQUEST_VENDOR_APPROVED_BY_TD':
        return 'from-green-50 to-green-100/30 border-green-200';
      case 'CHANGE_REQUEST_REJECTED':
        return 'from-red-50 to-red-100/30 border-red-200';
      case 'CHANGE_REQUEST_VENDOR_SELECTED':
        return 'from-purple-50 to-purple-100/30 border-purple-200';
      case 'CHANGE_REQUEST_PURCHASE_COMPLETED':
        return 'from-cyan-50 to-cyan-100/30 border-cyan-200';
      // Day Extension Actions
      case 'DAY_EXTENSION_REQUESTED':
        return 'from-blue-50 to-blue-100/30 border-blue-200';
      case 'DAY_EXTENSION_APPROVED':
        return 'from-green-50 to-green-100/30 border-green-200';
      case 'DAY_EXTENSION_REJECTED':
        return 'from-red-50 to-red-100/30 border-red-200';
      default:
        return 'from-gray-50 to-gray-100/30 border-gray-200';
    }
  };

  const getActionTitle = (action: HistoryAction) => {
    const normalizedType = action.action_type?.toUpperCase();
    switch (normalizedType) {
      case 'SENT_TO_TD':
        return 'BOQ Sent to Technical Director';
      case 'SENT_TO_CLIENT':
        return 'BOQ Sent to Client';
      case 'EMAIL_SENT':
        return 'BOQ Sent via Email';
      case 'STATUS_CHANGED':
        return 'Status Changed';
      case 'CREATED':
      case 'BOQ_CREATED':
        return 'BOQ Created';
      case 'UPDATED':
      case 'BOQ_UPDATED':
        return 'BOQ Updated';
      case 'APPROVED':
        return 'BOQ Approved';
      case 'TD_APPROVED':
        return 'BOQ Approved by Technical Director';
      case 'CLIENT_APPROVED':
        return 'BOQ Approved by Client';
      case 'REJECTED':
        return 'BOQ Rejected';
      case 'TD_REJECTED':
        return 'BOQ Rejected by Technical Director';
      case 'CLIENT_REJECTED':
        return 'BOQ Rejected by Client';
      // Change Request Actions
      case 'CHANGE_REQUEST_CREATED':
        return 'Change Request Created';
      case 'CHANGE_REQUEST_SENT_FOR_REVIEW':
        return 'Change Request Sent for Review';
      case 'CHANGE_REQUEST_APPROVED_BY_PM':
        return 'Change Request Approved by Project Manager';
      case 'CHANGE_REQUEST_APPROVED_BY_TD':
        return 'Change Request Approved by Technical Director';
      case 'CHANGE_REQUEST_APPROVED_BY_ESTIMATOR':
        return 'Change Request Approved by Estimator';
      case 'CHANGE_REQUEST_REJECTED':
        return 'Change Request Rejected';
      case 'CHANGE_REQUEST_VENDOR_SELECTED':
        return 'Vendor Selected for Purchase';
      case 'CHANGE_REQUEST_VENDOR_APPROVED_BY_TD':
        return 'Vendor Approved by Technical Director';
      case 'CHANGE_REQUEST_PURCHASE_COMPLETED':
        return 'Purchase Completed & Materials Merged';
      // Day Extension Actions
      case 'DAY_EXTENSION_REQUESTED':
        return 'Day Extension Requested';
      case 'DAY_EXTENSION_APPROVED':
        return 'Day Extension Approved';
      case 'DAY_EXTENSION_REJECTED':
        return 'Day Extension Rejected';
      default:
        return action.action_type?.replace(/_/g, ' ') || 'Action Performed';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadgeColor = (status?: string) => {
    if (!status) return 'bg-gray-100 text-gray-700';
    const normalizedStatus = status.toLowerCase().replace('_', '');
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      inreview: 'bg-yellow-100 text-yellow-700',
      pending: 'bg-orange-100 text-orange-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      sentforconfirmation: 'bg-blue-100 text-blue-700'
    };
    return colors[normalizedStatus] || 'bg-gray-100 text-gray-700';
  };

  const filteredHistory = filterType === 'all'
    ? history
    : history.filter(h => h.action_type === filterType);

  const uniqueActionTypes = Array.from(new Set(history.map(h => h.action_type)));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-3 text-gray-600 text-sm">Loading history...</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600">No history available for this BOQ</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Section */}
      {uniqueActionTypes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-gray-200">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 text-xs rounded-full transition-all ${
              filterType === 'all'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {uniqueActionTypes.map(type => {
            const isActive = filterType === type;
            let activeColor = 'from-blue-500 to-blue-600';

            if (type.includes('REVISION')) {
              activeColor = 'from-purple-500 to-purple-600';
            } else if (type.includes('STATUS') || type.includes('APPROVED')) {
              activeColor = 'from-green-500 to-green-600';
            } else if (type.includes('REJECTED') || type.includes('CANCELLED')) {
              activeColor = 'from-red-500 to-red-600';
            }

            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  isActive
                    ? `bg-gradient-to-r ${activeColor} text-white shadow-md`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.replace('_', ' ')}
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 to-gray-200"></div>

        <div className="space-y-4">
          {filteredHistory.map((action, index) => (
            <motion.div
              key={action.action_id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative pl-16"
            >
              {/* Icon Circle */}
              <div className="absolute left-3 top-3 w-6 h-6 bg-white rounded-full border-2 border-blue-400 flex items-center justify-center shadow-sm z-10">
                {getActionIcon(action.action_type)}
              </div>

              {/* Content Card */}
              <div className={`bg-gradient-to-br ${getActionColor(action.action_type)} border rounded-lg p-4 shadow-sm`}>
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    {getActionTitle(action)}
                  </h4>
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <Calendar className="w-3 h-3" />
                    {formatDate(action.action_at)}
                  </div>
                </div>

                {/* Action Details */}
                <div className="space-y-2 text-sm">
                  {/* Performer */}
                  <div className="flex items-center gap-2 text-gray-700">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="flex items-center gap-2">
                      <strong>By:</strong> {action.action_by}
                      {action.sender_role?.toLowerCase() === 'admin' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white border border-white/20 shadow-sm">
                          Admin
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Email/Send Details */}
                  {(action.action_type?.toUpperCase() === 'SENT_TO_TD' ||
                    action.action_type?.toUpperCase() === 'SENT_TO_CLIENT' ||
                    action.action_type?.toUpperCase() === 'EMAIL_SENT') && (
                    <div className="bg-white/60 rounded p-2 space-y-1">
                      {action.sender_email && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">From:</span>
                          <span className="text-gray-600">{action.sender_email}</span>
                        </div>
                      )}
                      {(action.receiver_email || action.recipient_name) && (
                        <div className="flex items-center gap-2 text-xs">
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="font-medium text-gray-700">To:</span>
                          <span className="text-gray-600">
                            {action.recipient_name || action.receiver_email}
                          </span>
                        </div>
                      )}
                      {action.project_name && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">Project:</span>
                          <span className="text-gray-600">{action.project_name}</span>
                        </div>
                      )}
                      {action.total_value && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">Total Value:</span>
                          <span className="text-gray-600">AED {action.total_value.toLocaleString()}</span>
                        </div>
                      )}
                      {action.attachments && action.attachments.length > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">Attachments:</span>
                          <span className="text-gray-600">{action.attachments.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status Change Details */}
                  {action.action_type === 'STATUS_CHANGED' && (action.old_status || action.new_status) && (
                    <div className="bg-white/60 rounded p-2 flex items-center gap-2">
                      {action.old_status && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(action.old_status)}`}>
                          {action.old_status}
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      {action.new_status && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(action.new_status)}`}>
                          {action.new_status}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status at Time */}
                  {action.status && action.action_type?.toUpperCase() !== 'STATUS_CHANGED' && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Status:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(action.status)}`}>
                        {action.status}
                      </span>
                    </div>
                  )}

                  {/* Rejection Reason */}
                  {action.rejection_reason && (action.action_type?.toUpperCase() === 'CLIENT_REJECTED' || action.action_type?.toUpperCase() === 'TD_REJECTED') && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-red-700 mb-1">Rejection Reason:</p>
                          <p className="text-xs text-red-600">{action.rejection_reason}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  {action.comments && (
                    <div className="bg-white/60 rounded p-2 mt-2">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-1">Comments:</p>
                          <p className="text-xs text-gray-600">{action.comments}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Change Request Details */}
                  {action.action_type?.toUpperCase().includes('CHANGE_REQUEST') && (
                    <div className="bg-blue-50/60 rounded p-2 mt-2 space-y-1">
                      {action.cr_id && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-blue-700">CR ID:</span>
                          <span className="text-blue-600">#{action.cr_id}</span>
                        </div>
                      )}
                      {action.item_name && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-blue-700">Item:</span>
                          <span className="text-blue-600">{action.item_name}</span>
                        </div>
                      )}
                      {action.materials_count !== undefined && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-blue-700">Materials:</span>
                          <span className="text-blue-600">{action.materials_count} item(s)</span>
                        </div>
                      )}
                      {action.total_value && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-blue-700">Total Cost:</span>
                          <span className="text-blue-600">AED {action.total_value.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Justification/Reason for Change Request */}
                  {action.justification && action.action_type?.toUpperCase().includes('CHANGE_REQUEST') && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-amber-700 mb-1">Justification:</p>
                          <p className="text-xs text-amber-600">{action.justification}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Vendor Information */}
                  {action.vendor_name && (action.action_type?.toUpperCase().includes('VENDOR') || action.action_type?.toUpperCase().includes('PURCHASE')) && (
                    <div className="bg-purple-50 border border-purple-200 rounded p-2 mt-2">
                      <div className="flex items-start gap-2">
                        <Store className="w-4 h-4 text-purple-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-purple-700 mb-1">Vendor:</p>
                          <p className="text-xs text-purple-600">{action.vendor_name}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Purchase Notes */}
                  {action.purchase_notes && action.action_type?.toUpperCase().includes('PURCHASE') && (
                    <div className="bg-green-50 border border-green-200 rounded p-2 mt-2">
                      <div className="flex items-start gap-2">
                        <Package className="w-4 h-4 text-green-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-green-700 mb-1">Purchase Notes:</p>
                          <p className="text-xs text-green-600">{action.purchase_notes}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Day Extension Details */}
                  {action.action_type?.toUpperCase().includes('DAY_EXTENSION') && (
                    <div className={`border rounded-lg p-3 mt-2 ${
                      action.action_type === 'DAY_EXTENSION_REQUESTED' ? 'bg-orange-50 border-orange-200' :
                      action.action_type === 'DAY_EXTENSION_APPROVED' ? 'bg-green-50 border-green-200' :
                      'bg-red-50 border-red-200'
                    }`}>
                      <div className="space-y-2">
                        {/* Extension Reason */}
                        {action.extension_reason && (
                          <div className="bg-white/60 rounded p-2">
                            <p className="text-xs font-semibold text-gray-700 mb-1">Reason:</p>
                            <p className="text-xs text-gray-600 whitespace-pre-wrap">{action.extension_reason}</p>
                          </div>
                        )}

                        {/* Timeline Details */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {action.original_duration !== undefined && (
                            <div className="bg-white/60 rounded p-2">
                              <p className="text-gray-600 mb-0.5">Original Duration</p>
                              <p className="font-bold text-gray-900">{action.original_duration} days</p>
                            </div>
                          )}
                          {action.requested_days !== undefined && (
                            <div className="bg-white/60 rounded p-2">
                              <p className="text-gray-600 mb-0.5">
                                {action.action_type === 'DAY_EXTENSION_APPROVED' && action.approved_days ? 'Approved Days' : 'Requested Days'}
                              </p>
                              <p className="font-bold text-orange-700">
                                +{action.action_type === 'DAY_EXTENSION_APPROVED' && action.approved_days ? action.approved_days : action.requested_days} days
                              </p>
                            </div>
                          )}
                          {action.original_end_date && (
                            <div className="bg-white/60 rounded p-2">
                              <p className="text-gray-600 mb-0.5">Original End Date</p>
                              <p className="font-semibold text-gray-900 text-xs">
                                {new Date(action.original_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          )}
                          {action.new_end_date && (
                            <div className="bg-white/60 rounded p-2">
                              <p className="text-gray-600 mb-0.5">New End Date</p>
                              <p className="font-semibold text-green-700 text-xs">
                                {new Date(action.new_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Status Badge and Action Buttons */}
                        <div className="flex items-center justify-between">
                          {action.extension_status && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              action.extension_status === 'pending_td_approval' ? 'bg-orange-100 text-orange-700' :
                              action.extension_status === 'approved' ? 'bg-green-100 text-green-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {action.extension_status.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          )}

                          {/* Approve Button for TD - Only show for pending requests */}
                          {isTD && action.action_type === 'DAY_EXTENSION_REQUESTED' && action.extension_status === 'pending_td_approval' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExtension({
                                  boq_id: boqId,
                                  history_id: action.action_id,
                                  project_name: action.project_name || 'Project',
                                  requested_by: action.action_by,
                                  original_duration: action.original_duration || 0,
                                  requested_days: action.requested_days || 0,
                                  new_duration: action.new_duration || 0,
                                  original_end_date: action.original_end_date || '',
                                  new_end_date: action.new_end_date || '',
                                  reason: action.extension_reason || '',
                                  request_date: action.action_at
                                });
                                setShowExtensionModal(true);
                              }}
                              className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold transition-all shadow-sm flex items-center gap-1.5 text-xs"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Review Request
                            </button>
                          )}
                        </div>

                        {/* Rejection Reason */}
                        {action.action_type === 'DAY_EXTENSION_REJECTED' && action.rejection_reason && (
                          <div className="bg-white/60 rounded p-2">
                            <p className="text-xs font-semibold text-red-700 mb-1">Rejection Reason:</p>
                            <p className="text-xs text-red-600">{action.rejection_reason}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {filteredHistory.length === 0 && filterType !== 'all' && (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No {filterType.replace('_', ' ').toLowerCase()} actions found</p>
        </div>
      )}

      {/* Day Extension Approval Modal */}
      {selectedExtension && (
        <DayExtensionApprovalModal
          isOpen={showExtensionModal}
          onClose={() => {
            setShowExtensionModal(false);
            setSelectedExtension(null);
          }}
          onSuccess={() => {
            loadHistory(); // Reload history after approval/rejection
            if (onDataChange) {
              onDataChange(); // Notify parent to refresh BOQ details
            }
          }}
          extensionRequest={selectedExtension}
        />
      )}
    </div>
  );
};

export default BOQHistoryTimeline;
