import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, CheckCircle, XCircle, Edit, Send, Clock, User } from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface InternalRevision {
  id: number;
  internal_revision_number: number;
  action_type: string;
  actor_role: string;
  actor_name: string;
  status_before: string;
  status_after: string;
  rejection_reason?: string;
  approval_comments?: string;
  changes_summary?: any;
  created_at: string;
}

interface BOQWithInternalRevisions {
  boq_id: number;
  boq_name: string;
  title: string;
  status: string;
  internal_revision_number: number;
  revision_number: number;
  total_cost: number;
  project: {
    name: string;
    client: string;
    location: string;
  };
}

const InternalRevisionTimeline: React.FC = () => {
  const [boqs, setBOQs] = useState<BOQWithInternalRevisions[]>([]);
  const [selectedBoq, setSelectedBoq] = useState<BOQWithInternalRevisions | null>(null);
  const [internalRevisions, setInternalRevisions] = useState<InternalRevision[]>([]);
  const [isLoadingBOQs, setIsLoadingBOQs] = useState(false);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadBOQsWithInternalRevisions();
  }, []);

  useEffect(() => {
    if (selectedBoq) {
      loadInternalRevisions(selectedBoq.boq_id);
    }
  }, [selectedBoq]);

  const loadBOQsWithInternalRevisions = async () => {
    setIsLoadingBOQs(true);
    try {
      const response = await fetch('/api/boqs/internal_revisions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setBOQs(data.data);
        if (data.data.length > 0 && !selectedBoq) {
          setSelectedBoq(data.data[0]);
        }
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      toast.error('Failed to load BOQs with internal revisions');
    } finally {
      setIsLoadingBOQs(false);
    }
  };

  const loadInternalRevisions = async (boqId: number) => {
    setIsLoadingRevisions(true);
    try {
      const response = await fetch(`/api/boq/${boqId}/internal_revisions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setInternalRevisions(data.data.internal_revisions);
      }
    } catch (error) {
      console.error('Error loading internal revisions:', error);
      toast.error('Failed to load internal revision history');
    } finally {
      setIsLoadingRevisions(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'TD_APPROVED':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'TD_REJECTED':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'PM_EDITED':
        return <Edit className="h-5 w-5 text-blue-600" />;
      case 'SENT_TO_TD':
      case 'SENT_TO_PM':
        return <Send className="h-5 w-5 text-purple-600" />;
      case 'ESTIMATOR_RESUBMIT':
        return <Send className="h-5 w-5 text-orange-600" />;
      case 'CREATED':
        return <User className="h-5 w-5 text-gray-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      'CREATED': 'BOQ Created',
      'PM_EDITED': 'PM Edited',
      'SENT_TO_PM': 'Sent to PM',
      'SENT_TO_TD': 'Sent to TD',
      'TD_REJECTED': 'TD Rejected',
      'TD_APPROVED': 'TD Approved',
      'ESTIMATOR_RESUBMIT': 'Estimator Resubmitted'
    };
    return labels[actionType] || actionType;
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'TD_APPROVED':
        return 'bg-green-50 border-green-200';
      case 'TD_REJECTED':
        return 'bg-red-50 border-red-200';
      case 'PM_EDITED':
        return 'bg-blue-50 border-blue-200';
      case 'SENT_TO_TD':
      case 'SENT_TO_PM':
        return 'bg-purple-50 border-purple-200';
      case 'ESTIMATOR_RESUBMIT':
        return 'bg-orange-50 border-orange-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
  };

  const filteredBOQs = boqs.filter(boq =>
    boq.boq_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    boq.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    boq.project?.client?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header with BOQ Selection */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Internal Revisions History</h3>
        <p className="text-sm text-gray-600 mb-4">
          View all internal approval cycles (PM edits, TD rejections) before sending to client
        </p>

        {/* Search BOQs */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search BOQs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* BOQ Dropdown */}
        {isLoadingBOQs ? (
          <div className="flex justify-center py-8">
            <ModernLoadingSpinners size="sm" />
          </div>
        ) : filteredBOQs.length > 0 ? (
          <select
            value={selectedBoq?.boq_id || ''}
            onChange={(e) => {
              const boq = boqs.find(b => b.boq_id === parseInt(e.target.value));
              setSelectedBoq(boq || null);
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {filteredBOQs.map((boq) => (
              <option key={boq.boq_id} value={boq.boq_id}>
                {boq.boq_name} - {boq.project?.name} - Internal Rev: {boq.internal_revision_number}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="font-medium">No BOQs with internal revisions found</p>
            <p className="text-sm mt-1">Internal revisions are tracked before sending to client</p>
          </div>
        )}

        {/* Selected BOQ Info */}
        {selectedBoq && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-blue-900">{selectedBoq.boq_name}</h4>
                <p className="text-sm text-blue-700">
                  {selectedBoq.project?.name} • {selectedBoq.project?.client}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-blue-900">
                  Internal Rev: {selectedBoq.internal_revision_number}
                </div>
                <div className="text-sm text-blue-700">{formatCurrency(selectedBoq.total_cost)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      {selectedBoq && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 border-b border-purple-200">
            <h3 className="text-lg font-bold text-purple-900">📜 Internal Revision Timeline</h3>
            <p className="text-sm text-purple-700">
              Complete history of internal approval cycles
            </p>
          </div>

          <div className="p-6">
            {isLoadingRevisions ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ModernLoadingSpinners size="md" />
                <p className="mt-4 text-gray-600">Loading timeline...</p>
              </div>
            ) : internalRevisions.length > 0 ? (
              <div className="space-y-4">
                {internalRevisions.map((revision, index) => (
                  <motion.div
                    key={revision.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`border rounded-lg p-4 ${getActionColor(revision.action_type)}`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-1">
                        {getActionIcon(revision.action_type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-bold text-gray-900">
                              Internal Rev {revision.internal_revision_number}
                            </span>
                            <span className="mx-2 text-gray-400">•</span>
                            <span className="font-semibold text-gray-700">
                              {getActionLabel(revision.action_type)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(revision.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>

                        <div className="text-sm text-gray-600 mb-2">
                          <span className="font-medium">By:</span> {revision.actor_name} ({revision.actor_role})
                        </div>

                        {/* Rejection Reason */}
                        {revision.rejection_reason && (
                          <div className="mt-2 p-3 bg-red-100 border border-red-200 rounded-lg">
                            <p className="text-sm font-semibold text-red-900 mb-1">Rejection Reason:</p>
                            <p className="text-sm text-red-800">{revision.rejection_reason}</p>
                          </div>
                        )}

                        {/* Approval Comments */}
                        {revision.approval_comments && (
                          <div className="mt-2 p-3 bg-green-100 border border-green-200 rounded-lg">
                            <p className="text-sm font-semibold text-green-900 mb-1">Approval Comments:</p>
                            <p className="text-sm text-green-800">{revision.approval_comments}</p>
                          </div>
                        )}

                        {/* Changes Summary */}
                        {revision.changes_summary && Object.keys(revision.changes_summary).length > 0 && (
                          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm font-semibold text-blue-900 mb-1">Changes Made:</p>
                            <pre className="text-xs text-blue-800 overflow-auto">
                              {JSON.stringify(revision.changes_summary, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Status Flow */}
                        {revision.status_before && revision.status_after && (
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="font-medium">Status:</span>{' '}
                            <span className="px-2 py-1 bg-gray-200 rounded">{revision.status_before}</span>
                            <span className="mx-2">→</span>
                            <span className="px-2 py-1 bg-gray-200 rounded">{revision.status_after}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="font-medium">No internal revision history</p>
                <p className="text-sm mt-1">Internal changes will appear here</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InternalRevisionTimeline;
