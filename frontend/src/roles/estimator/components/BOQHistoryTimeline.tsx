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
  Filter
} from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { toast } from 'sonner';

interface BOQHistoryTimelineProps {
  boqId: number;
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
}

const BOQHistoryTimeline: React.FC<BOQHistoryTimelineProps> = ({ boqId }) => {
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

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
            record.action.forEach((actionItem, index) => {
              transformedHistory.push({
                action_id: record.boq_history_id * 1000 + index, // Generate unique ID
                action_type: actionItem.type?.toUpperCase().replace(/_/g, '_') || 'UNKNOWN',
                action_by: actionItem.sender_name || record.action_by,
                action_at: actionItem.timestamp || record.action_date,
                sender_email: record.sender_role === 'estimator' ? record.sender : undefined,
                receiver_email: actionItem.recipient_email || record.receiver,
                recipient_name: actionItem.recipient_name || record.receiver,
                comments: actionItem.comments || actionItem.rejection_reason || record.comments,
                status: actionItem.status || record.boq_status,
                project_name: actionItem.project_name,
                total_value: actionItem.total_value,
                item_count: actionItem.item_count,
                attachments: actionItem.attachments,
                rejection_reason: actionItem.rejection_reason
              });
            });
          } else {
            // Handle non-array action (legacy format or single action)
            transformedHistory.push({
              action_id: record.boq_history_id,
              action_type: 'ACTION',
              action_by: record.action_by,
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
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getActionColor = (actionType: string) => {
    const normalizedType = actionType?.toUpperCase();
    switch (normalizedType) {
      case 'SENT_TO_TD':
      case 'EMAIL_SENT':
        return 'from-purple-50 to-purple-100 border-purple-200';
      case 'SENT_TO_CLIENT':
        return 'from-blue-50 to-blue-100 border-blue-200';
      case 'STATUS_CHANGED':
        return 'from-blue-50 to-blue-100 border-blue-200';
      case 'CREATED':
      case 'BOQ_CREATED':
        return 'from-green-50 to-green-100 border-green-200';
      case 'UPDATED':
      case 'BOQ_UPDATED':
        return 'from-orange-50 to-orange-100 border-orange-200';
      case 'APPROVED':
      case 'TD_APPROVED':
      case 'CLIENT_APPROVED':
        return 'from-green-50 to-green-100 border-green-200';
      case 'REJECTED':
      case 'TD_REJECTED':
      case 'CLIENT_REJECTED':
        return 'from-red-50 to-red-100 border-red-200';
      default:
        return 'from-gray-50 to-gray-100 border-gray-200';
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
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {uniqueActionTypes.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 text-xs rounded-full transition-all ${
                filterType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
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
                    <span>
                      <strong>By:</strong> {action.action_by}
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
    </div>
  );
};

export default BOQHistoryTimeline;
