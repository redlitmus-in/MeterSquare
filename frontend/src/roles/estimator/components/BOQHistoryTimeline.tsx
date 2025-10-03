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

interface HistoryAction {
  action_id: number;
  action_type: 'EMAIL_SENT' | 'STATUS_CHANGED' | 'CREATED' | 'UPDATED' | 'APPROVED' | 'REJECTED';
  action_by: string;
  action_at: string;
  sender_email?: string;
  receiver_email?: string;
  full_name?: string;
  comments?: string;
  status_at_time?: string;
  old_status?: string;
  new_status?: string;
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
        setHistory(result.data);
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
    switch (actionType) {
      case 'EMAIL_SENT':
        return <Mail className="w-5 h-5 text-purple-600" />;
      case 'STATUS_CHANGED':
        return <RefreshCw className="w-5 h-5 text-blue-600" />;
      case 'CREATED':
        return <FileText className="w-5 h-5 text-green-600" />;
      case 'UPDATED':
        return <Edit className="w-5 h-5 text-orange-600" />;
      case 'APPROVED':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'REJECTED':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'EMAIL_SENT':
        return 'from-purple-50 to-purple-100 border-purple-200';
      case 'STATUS_CHANGED':
        return 'from-blue-50 to-blue-100 border-blue-200';
      case 'CREATED':
        return 'from-green-50 to-green-100 border-green-200';
      case 'UPDATED':
        return 'from-orange-50 to-orange-100 border-orange-200';
      case 'APPROVED':
        return 'from-green-50 to-green-100 border-green-200';
      case 'REJECTED':
        return 'from-red-50 to-red-100 border-red-200';
      default:
        return 'from-gray-50 to-gray-100 border-gray-200';
    }
  };

  const getActionTitle = (action: HistoryAction) => {
    switch (action.action_type) {
      case 'EMAIL_SENT':
        return 'BOQ Sent via Email';
      case 'STATUS_CHANGED':
        return 'Status Changed';
      case 'CREATED':
        return 'BOQ Created';
      case 'UPDATED':
        return 'BOQ Updated';
      case 'APPROVED':
        return 'BOQ Approved';
      case 'REJECTED':
        return 'BOQ Rejected';
      default:
        return 'Action Performed';
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

                  {/* Email Details for EMAIL_SENT */}
                  {action.action_type === 'EMAIL_SENT' && (
                    <div className="bg-white/60 rounded p-2 space-y-1">
                      {action.sender_email && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">From:</span>
                          <span className="text-gray-600">{action.sender_email}</span>
                        </div>
                      )}
                      {action.receiver_email && (
                        <div className="flex items-center gap-2 text-xs">
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="font-medium text-gray-700">To:</span>
                          <span className="text-gray-600">
                            {action.full_name || action.receiver_email}
                          </span>
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
                  {action.status_at_time && action.action_type !== 'STATUS_CHANGED' && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Status:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(action.status_at_time)}`}>
                        {action.status_at_time}
                      </span>
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
