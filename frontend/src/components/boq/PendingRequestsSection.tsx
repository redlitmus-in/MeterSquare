import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Package, Eye, Send, CheckCircle, XCircle } from 'lucide-react';
import { ChangeRequestItem, changeRequestService } from '@/services/changeRequestService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/utils/formatters';
import { isSiteEngineer, isProjectManager, canSendForReview } from '@/utils/roleHelpers';

interface PendingRequestsSectionProps {
  requests: ChangeRequestItem[];
  onViewDetails: (crId: number) => void;
  onStatusUpdate?: () => void;
}

const PendingRequestsSection: React.FC<PendingRequestsSectionProps> = ({
  requests,
  onViewDetails,
  onStatusUpdate
}) => {
  const { user } = useAuthStore();
  const [sendingCrId, setSendingCrId] = useState<number | null>(null);
  const [approvingCrId, setApprovingCrId] = useState<number | null>(null);
  const [rejectingCrId, setRejectingCrId] = useState<number | null>(null);

  if (requests.length === 0) return null;

  // Use role helpers instead of hardcoded checks
  const userIsSiteEngineer = isSiteEngineer(user);
  const userIsProjectManager = isProjectManager(user);
  const userCanSendForReview = canSendForReview(user);

  console.log('PendingRequestsSection - User:', {
    roleId: user?.role_id,
    isSiteEngineer: userIsSiteEngineer,
    isProjectManager: userIsProjectManager,
    canSendForReview: userCanSendForReview
  });

  // Separate requests based on requester role
  const myRequests = requests.filter(req => req.requested_by_user_id === user?.user_id);
  const seRequests = userIsProjectManager ? requests.filter(req =>
    req.requested_by_user_id !== user?.user_id &&
    req.approval_required_from === 'project_manager'
  ) : [];

  const handleSendForReview = async (crId: number) => {
    // Prevent double-clicks
    if (sendingCrId === crId) {
      return;
    }

    setSendingCrId(crId);
    try {
      const response = await changeRequestService.sendForReview(crId);

      if (response.success) {
        showSuccess(response.message || `PO sent for review`);
        onStatusUpdate?.();
      } else {
        showError(response.message || 'Failed to send request');
      }
    } catch (error) {
      console.error('Error sending request:', error);
      showError('Failed to send request for review');
    } finally {
      setSendingCrId(null);
    }
  };

  const handleApprove = async (crId: number) => {
    setApprovingCrId(crId);
    try {
      const response = await changeRequestService.approve(crId, 'Approved by Project Manager');
      if (response.success) {
        showSuccess('PO approved successfully');
        onStatusUpdate?.();
      } else {
        showError(response.message || 'Failed to approve request');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      showError('Failed to approve request');
    } finally {
      setApprovingCrId(null);
    }
  };

  const handleReject = async (crId: number) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      showError('Rejection reason is required');
      return;
    }

    setRejectingCrId(crId);
    try {
      const response = await changeRequestService.reject(crId, reason);
      if (response.success) {
        showSuccess('PO rejected');
        onStatusUpdate?.();
      } else {
        showError(response.message || 'Failed to reject request');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      showError('Failed to reject request');
    } finally {
      setRejectingCrId(null);
    }
  };

  const renderRequestCard = (request: ChangeRequestItem, showApproveButtons: boolean) => {
          const isSending = sendingCrId === request.cr_id;

          // Check if this is user's own request
          const isMyRequest = request.requested_by_user_id === user?.user_id;

          // Show send button if it's my request AND status is pending (not sent yet)
          const shouldShowSendButton = isMyRequest && request.status === 'pending' && !request.approval_required_from;

          return (
            <div
              key={request.cr_id}
              className="bg-white border-2 border-yellow-200 rounded-lg p-3 sm:p-4 shadow-sm"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 sm:mb-2 flex-wrap">
                    <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      AWAITING APPROVAL
                    </span>
                    <span className="text-xs sm:text-sm text-gray-500">CR-{request.cr_id}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 italic break-words">{request.justification}</p>
                </div>
              </div>

              {/* Materials Summary */}
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 mb-3">
                <h4 className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 sm:mb-2 flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  Materials Requested ({request.materials_data?.length || 0} items)
                </h4>
                <div className="space-y-1">
                  {request.materials_data?.slice(0, 3).map((material, idx) => (
                    <div key={idx} className="flex justify-between text-[10px] sm:text-xs gap-2">
                      <span className="text-gray-700 truncate flex-1">
                        {material.material_name} ({material.quantity} {material.unit})
                        {material.related_item && (
                          <span className="ml-1 sm:ml-2 text-blue-600">→ {material.related_item}</span>
                        )}
                      </span>
                      <span className="font-semibold text-gray-900 whitespace-nowrap">
                        {formatCurrency(material.total_price)}
                      </span>
                    </div>
                  ))}
                  {request.materials_data && request.materials_data.length > 3 && (
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                      +{request.materials_data.length - 3} more item(s)
                    </p>
                  )}
                </div>
              </div>

              {/* Total Cost */}
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                <span className="text-xs sm:text-sm font-semibold text-gray-700">Total Cost:</span>
                <span className="text-base sm:text-lg font-bold text-yellow-600">
                  {formatCurrency(request.materials_total_cost)}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                {showApproveButtons ? (
                  <>
                    {/* PM viewing SE requests - Show Approve/Reject */}
                    <button
                      onClick={() => handleApprove(request.cr_id)}
                      disabled={approvingCrId === request.cr_id || rejectingCrId === request.cr_id}
                      className="flex-1 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {approvingCrId === request.cr_id ? (
                        <>
                          <ModernLoadingSpinners size="xxs" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                          Approve
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleReject(request.cr_id)}
                      disabled={approvingCrId === request.cr_id || rejectingCrId === request.cr_id}
                      className="flex-1 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {rejectingCrId === request.cr_id ? (
                        <>
                          <ModernLoadingSpinners size="xxs" />
                          Rejecting...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                          Reject
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    {/* PM's own requests - Only show Send for Review button */}
                    {shouldShowSendButton && (
                      <button
                        onClick={() => handleSendForReview(request.cr_id)}
                        disabled={isSending}
                        className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSending ? (
                          <>
                            <ModernLoadingSpinners size="xxs" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3 sm:w-4 sm:h-4" />
                            Send for Review
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => onViewDetails(request.cr_id)}
                  className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                  View Details
                </button>
              </div>
            </div>
          );
  };

  return (
    <>
      {/* Section 1: SE Requests (PM needs to approve) */}
      {seRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6 sm:mb-8"
        >
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-t-lg px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
            <h3 className="text-sm sm:text-lg font-bold text-white flex items-center gap-1.5 sm:gap-2">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
              Requests from Site Engineers (Awaiting Your Approval)
            </h3>
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-white/20 rounded-full text-xs sm:text-sm font-medium text-white">
              {seRequests.length}
            </span>
          </div>

          <div className="border-2 border-purple-200 rounded-b-lg p-3 sm:p-4 bg-purple-50/30 space-y-3 sm:space-y-4">
            {seRequests.map((request) => renderRequestCard(request, true))}
          </div>
        </motion.div>
      )}

      {/* Section 2: My Requests (sent to Estimator/PM) */}
      {myRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 sm:mb-8"
        >
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-t-lg px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
            <h3 className="text-sm sm:text-lg font-bold text-white flex items-center gap-1.5 sm:gap-2">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
              My Pending Requests
            </h3>
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-white/20 rounded-full text-xs sm:text-sm font-medium text-white">
              {myRequests.length}
            </span>
          </div>

          <div className="border-2 border-yellow-200 rounded-b-lg p-3 sm:p-4 bg-yellow-50/30 space-y-3 sm:space-y-4">
            {myRequests.map((request) => renderRequestCard(request, false))}
          </div>
        </motion.div>
      )}
    </>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(PendingRequestsSection);
