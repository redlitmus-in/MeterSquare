import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RevisionCardProps {
  project: any;
  onViewComparison?: (project: any) => void;
  onEdit?: (project: any) => void;
  onSendToTD?: (project: any) => void;
  onSendToClient?: (project: any) => void;
  onApprove?: (project: any) => void;
  onReject?: (project: any) => void;
  showActions?: boolean;
  compact?: boolean;
}

const RevisionCard: React.FC<RevisionCardProps> = ({
  project,
  onViewComparison,
  onEdit,
  onSendToTD,
  onSendToClient,
  onApprove,
  onReject,
  showActions = true,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getRevisionBadgeColor = (revisionNumber: number) => {
    if (revisionNumber >= 7) return 'bg-red-100 text-red-800 border-red-300';
    if (revisionNumber >= 4) return 'bg-orange-100 text-orange-800 border-orange-300';
    if (revisionNumber > 0) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  const getRevisionIcon = (revisionNumber: number) => {
    if (revisionNumber >= 7) return '🚨';
    if (revisionNumber >= 4) return '⚠️';
    if (revisionNumber > 0) return '📝';
    return '📋';
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get display revision number
  // Original = 0, First Revision = 1, Second Revision = 2, etc.
  const getDisplayRevisionNumber = () => {
    return project.revision_number || 0;
  };

  const getRevisionLabel = () => {
    const revNum = project.revision_number || 0;
    return revNum === 0 ? 'Original' : `R${revNum}`;
  };

  const revisionNumber = getDisplayRevisionNumber();
  const totalCost = project.total_cost || project.selling_price || 0;

  console.log(`📊 [RevisionCard] BOQ ${project.boq_id} - Raw values:`, {
    boq_name: project.boq_name || project.project_name,
    total_cost: project.total_cost,
    selling_price: project.selling_price,
    revision_number: project.revision_number
  });
  console.log(`💰 [RevisionCard] BOQ ${project.boq_id} - Final totalCost to display: ${totalCost}`);

  return (
    <div
      className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all border border-gray-200 overflow-hidden"
    >
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-bold text-gray-900">{project.project_name || project.boq_name}</h3>
              <Badge className={`${getRevisionBadgeColor(revisionNumber)} border font-semibold`}>
                {getRevisionIcon(revisionNumber)} {getRevisionLabel()}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <div>
                <span className="font-medium">Client:</span> {project.client || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Location:</span> {project.location || 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revision Timeline Section */}
      <div className="p-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg hover:from-purple-100 hover:to-blue-100 transition-all"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="w-5 h-5 text-purple-600" /> : <ChevronRight className="w-5 h-5 text-purple-600" />}
            <span className="font-semibold text-gray-900">Revision Timeline</span>
            {revisionNumber > 0 && (
              <Badge variant="outline" className="ml-2">
                {revisionNumber} {revisionNumber === 1 ? 'revision' : 'revisions'}
              </Badge>
            )}
          </div>
          <div className="text-sm text-gray-600">
            Last modified: {formatDate(project.last_modified_at)}
          </div>
        </button>

        {/* Expanded Revision Details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 space-y-2"
            >
              {revisionNumber === 0 ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <div className="text-blue-600 font-medium">📋 Original Version</div>
                  <div className="text-sm text-blue-500 mt-1">No revisions yet</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Current Revision */}
                  <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📌</span>
                        <div>
                          <div className="font-semibold text-green-900">Current {getRevisionLabel()}</div>
                          <div className="text-xs text-green-700">{formatDate(project.last_modified_at)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-900">{formatCurrency(totalCost)}</div>
                        <div className="text-xs text-green-700">{project.item_count || 0} items</div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  {revisionNumber > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="text-xs text-gray-600">Status</div>
                          <Badge className="mt-1" variant="outline">
                            {project.status?.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Created By</div>
                          <div className="text-sm font-medium text-gray-900 mt-1">{project.created_by || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Email Sent</div>
                          <div className="text-sm font-medium text-gray-900 mt-1">
                            {project.email_sent ? '✅' : '❌'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Alert Message for High Revisions */}
                  {revisionNumber >= 4 && (
                    <div className={`${revisionNumber >= 7 ? 'bg-red-50 border-red-300 text-red-800' : 'bg-orange-50 border-orange-300 text-orange-800'} border rounded-lg p-3 flex items-center gap-2`}>
                      <AlertTriangle className="w-5 h-5" />
                      <div className="text-sm font-medium">
                        {revisionNumber >= 7
                          ? '🚨 Critical: This project has undergone multiple revisions. Requires immediate attention!'
                          : '⚠️ Warning: Multiple revisions detected. Consider reviewing project scope.'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex gap-2">
            {onViewComparison && (
              <button
                onClick={() => onViewComparison(project)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium text-sm"
              >
                View Comparison
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(project)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium text-sm"
              >
                Edit
              </button>
            )}
          </div>

          {(onSendToTD || onSendToClient) && (
            <div className="flex gap-2">
              {onSendToTD && (
                <button
                  onClick={() => onSendToTD(project)}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-medium text-sm"
                >
                  Send to TD
                </button>
              )}
              {onSendToClient && (
                <button
                  onClick={() => onSendToClient(project)}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium text-sm"
                >
                  Send to Client
                </button>
              )}
            </div>
          )}

          {(onApprove || onReject) && (
            <div className="flex gap-2">
              {onApprove && (
                <button
                  onClick={() => onApprove(project)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium text-sm"
                >
                  Approve
                </button>
              )}
              {onReject && (
                <button
                  onClick={() => onReject(project)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-medium text-sm"
                >
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(RevisionCard);
