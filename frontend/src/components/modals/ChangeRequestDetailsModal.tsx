import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, DollarSign, TrendingUp, AlertCircle, CheckCircle, Clock, XCircle, Send, Edit } from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/utils/formatters';
import { isSiteEngineer, isProjectManager, isEstimator, isTechnicalDirector } from '@/utils/roleHelpers';
import EditChangeRequestModal from './EditChangeRequestModal';

interface ChangeRequestDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeRequest: ChangeRequestItem | null;
  onApprove?: () => void;
  onReject?: () => void;
  canApprove?: boolean;
  onEdit?: () => void;
}

const ChangeRequestDetailsModal: React.FC<ChangeRequestDetailsModalProps> = ({
  isOpen,
  onClose,
  changeRequest,
  onApprove,
  onReject,
  canApprove: canApproveFromParent,
  onEdit
}) => {
  const { user } = useAuthStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [sendingForReview, setSendingForReview] = useState(false);

  if (!isOpen || !changeRequest) return null;

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      under_review: 'bg-blue-100 text-blue-800 border-blue-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const getStatusIcon = (status: string) => {
    if (status === 'approved') return <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />;
    if (status === 'rejected') return <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />;
    if (status === 'under_review') return <Send className="w-4 h-4 sm:w-5 sm:h-5" />;
    return <Clock className="w-4 h-4 sm:w-5 sm:h-5" />;
  };

  const getStatusLabel = (status: string) => {
    if (!status) return 'UNKNOWN';
    const labels = {
      pending: 'PENDING',
      under_review: 'UNDER REVIEW',
      approved_by_pm: 'APPROVED BY PM',
      approved_by_td: 'APPROVED BY TD',
      approved: 'APPROVED & MERGED',
      rejected: 'REJECTED'
    };
    return labels[status as keyof typeof labels] || status.toUpperCase();
  };

  const isOverBudget = changeRequest.overhead_analysis?.balance_type === 'negative';
  const isHighValue = changeRequest.approval_required_from === 'technical_director';

  // Use role helper functions instead of hardcoded IDs
  const userIsSiteEngineer = isSiteEngineer(user);
  const userIsProjectManager = isProjectManager(user);
  const userIsEstimator = isEstimator(user);
  const userIsTechnicalDirector = isTechnicalDirector(user);

  // Final statuses where no actions should be allowed
  const isFinalStatus = ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer', 'purchase_completed', 'approved', 'rejected'].includes(changeRequest.status);

  // Check if the request has been approved by PM and is being sent to Estimator/TD
  const isApprovedAndSentForward = changeRequest.status === 'under_review' &&
                                    ['estimator', 'technical_director'].includes(changeRequest.approval_required_from || '');

  const canApproveReject = canApproveFromParent !== undefined
    ? canApproveFromParent
    : (userIsEstimator || userIsTechnicalDirector) &&
      changeRequest.status !== 'approved' &&
      changeRequest.status !== 'rejected' &&
      !isFinalStatus &&
      !isApprovedAndSentForward;

  // Can edit if:
  // 1. Status is pending AND user is requester or PM
  // 2. OR user is Estimator/TD reviewing the request (under_review or approved_by_pm)
  const canEdit = (
    // Case 1: Pending status - requester or PM can edit
    (changeRequest.status === 'pending' &&
     (changeRequest.requested_by_user_id === user?.user_id || userIsProjectManager)) ||
    // Case 2: Estimator/TD can edit when reviewing (approved_by_pm status)
    ((userIsEstimator || userIsTechnicalDirector) &&
     changeRequest.status === 'approved_by_pm')
  ) &&
  // Exclude truly final statuses
  !['approved', 'rejected', 'purchase_completed', 'assigned_to_buyer', 'approved_by_td'].includes(changeRequest.status);

  // Debug logging
  console.log('[ChangeRequestDetails] Edit Check:', {
    canEdit,
    status: changeRequest.status,
    userIsEstimator,
    userIsTechnicalDirector,
    userRole: user?.role
  });

  // Can send for review if the request is pending and user is the requester
  const canSendForReview = changeRequest.status === 'pending' &&
                           changeRequest.requested_by_user_id === user?.user_id;

  const handleSendForReview = async () => {
    if (!changeRequest) return;

    setSendingForReview(true);
    try {
      const response = await changeRequestService.sendForReview(changeRequest.cr_id);
      if (response.success) {
        toast.success('Request sent for review successfully');
        // Reload to update the status
        window.location.reload();
      } else {
        toast.error(response.message || 'Failed to send for review');
      }
    } catch (error) {
      toast.error('Failed to send request for review');
    } finally {
      setSendingForReview(false);
    }
  };

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 pointer-events-none overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-lg sm:rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden pointer-events-auto my-4 sm:my-0"
          >
            {/* Header - Responsive */}
            <div className={`px-4 sm:px-6 py-4 sm:py-5 border-b-2 ${isOverBudget ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-purple-500 to-purple-600'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg flex-shrink-0">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-2xl font-bold text-white truncate">
                      CR-{changeRequest.cr_id || 'N/A'}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/90 mt-0.5 sm:mt-1 truncate">
                      BOQ {changeRequest.boq_name ? `#${changeRequest.boq_name}` : (changeRequest.boq_id ? `#${changeRequest.boq_id}` : 'N/A')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </button>
              </div>
            </div>

            {/* Content - Responsive */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-160px)] sm:max-h-[calc(90vh-200px)]">
              {/* Status & Info - Responsive Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Status</p>
                  <div className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold border ${getStatusColor(changeRequest.status || 'pending')}`}>
                    {getStatusIcon(changeRequest.status || 'pending')}
                    {getStatusLabel(changeRequest.status || 'pending')}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Requested By</p>
                  <p className="text-sm sm:text-lg font-bold text-gray-900 truncate">{changeRequest.requested_by_name || 'N/A'}</p>
                  <p className="text-xs text-gray-500 capitalize">{changeRequest.requested_by_role?.replace('_', ' ').replace('siteEngineer', 'Site Engineer') || 'N/A'}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs text-gray-600 mb-1">Request Date</p>
                  <p className="text-sm sm:text-lg font-bold text-gray-900">
                    {changeRequest.created_at ? new Date(changeRequest.created_at).toLocaleDateString('en-US', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    }) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Justification */}
              <div className="mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">Justification</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                  <p className="text-sm sm:text-base text-gray-800 break-words">{changeRequest.justification}</p>
                </div>
              </div>

              {/* Approval Trail */}
              {(changeRequest.pm_approval_date || changeRequest.td_approval_date || changeRequest.approval_date || changeRequest.rejection_reason) && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3">Approval History</h3>
                  <div className="space-y-3">
                    {/* PM Approval */}
                    {changeRequest.pm_approval_date && (
                      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-green-900">Approved by Project Manager</p>
                          <p className="text-xs text-green-700">{changeRequest.pm_approved_by_name}</p>
                          <p className="text-xs text-green-600 mt-1">
                            {new Date(changeRequest.pm_approval_date).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* TD Approval */}
                    {changeRequest.td_approval_date && (
                      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-blue-900">Approved by Technical Director</p>
                          <p className="text-xs text-blue-700">{changeRequest.td_approved_by_name}</p>
                          <p className="text-xs text-blue-600 mt-1">
                            {new Date(changeRequest.td_approval_date).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Estimator Approval */}
                    {changeRequest.approval_date && changeRequest.status === 'approved' && (
                      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-emerald-900">Final Approval by Estimator</p>
                          <p className="text-xs text-emerald-700">{changeRequest.approved_by_name}</p>
                          <p className="text-xs text-emerald-600 mt-1">
                            {new Date(changeRequest.approval_date).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          <p className="text-xs text-emerald-700 mt-2 font-medium">✓ Materials merged to BOQ</p>
                        </div>
                      </div>
                    )}

                    {/* Rejection */}
                    {changeRequest.rejection_reason && (
                      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-red-900">Rejected</p>
                          {changeRequest.rejected_by_name && (
                            <p className="text-xs text-red-700">By: {changeRequest.rejected_by_name}</p>
                          )}
                          {changeRequest.rejected_at_stage && (
                            <p className="text-xs text-red-600 capitalize">At: {changeRequest.rejected_at_stage.replace('_', ' ')} stage</p>
                          )}
                          <p className="text-xs text-red-800 mt-2 italic">&quot;{changeRequest.rejection_reason}&quot;</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Materials Requested - Responsive Table */}
              <div className="mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">Materials Requested</h3>
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600">Material</th>
                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600">Sub-Item</th>
                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600">For Item</th>
                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-gray-600">Quantity</th>
                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-gray-600">Unit Price</th>
                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-gray-600">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(changeRequest.sub_items_data || changeRequest.materials_data)?.map((material: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900">
                            {material.material_name}
                          </td>
                          <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">
                            {material.sub_item_name && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                {material.sub_item_name}
                              </span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">
                            {changeRequest.item_name && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {changeRequest.item_name}
                              </span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600 text-right whitespace-nowrap">
                            {material.quantity} {material.unit}
                          </td>
                          <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600 text-right whitespace-nowrap">
                            {formatCurrency(material.unit_price)}
                          </td>
                          <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                            {formatCurrency(material.total_price)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-purple-50 font-bold">
                        <td colSpan={5} className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-purple-900 text-right">
                          Total Materials Cost:
                        </td>
                        <td className="px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-purple-900 text-right whitespace-nowrap">
                          {formatCurrency(changeRequest.materials_total_cost)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compact Budget Analysis & Cost Breakdown */}
              <div className="mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                  Budget & Cost Summary
                </h3>
                <div className={`rounded-lg p-3 border ${isOverBudget ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                  {/* Compact Budget Status */}
                  <div className={`flex items-center gap-2 mb-3 p-2 rounded ${isOverBudget ? 'bg-red-100' : 'bg-green-100'}`}>
                    {isOverBudget ? (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <p className="font-bold text-red-900 text-xs">⚠️ BUDGET EXCEEDED - Remaining: {formatCurrency(changeRequest.overhead_analysis?.remaining_after_approval || 0)}</p>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="font-bold text-green-900 text-xs">✓ WITHIN BUDGET - Remaining: {formatCurrency(changeRequest.overhead_analysis?.remaining_after_approval || 0)}</p>
                      </>
                    )}
                  </div>

                  {/* Compact Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-gray-600 mb-0.5">Materials Cost</p>
                      <p className="font-bold text-purple-900">{formatCurrency(changeRequest.materials_total_cost)}</p>
                    </div>
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-gray-600 mb-0.5">Budget Used</p>
                      <p className="font-bold text-orange-600">
                        {formatCurrency(changeRequest.overhead_analysis?.consumed_by_this_request || 0)}
                        {changeRequest.overhead_analysis?.original_allocated && (
                          <span className="text-[10px] text-gray-600 ml-1">
                            ({((changeRequest.materials_total_cost / changeRequest.overhead_analysis.original_allocated) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-gray-600 mb-0.5">Items Count</p>
                      <p className="font-bold text-gray-900">{changeRequest.materials_data?.length || 0} items</p>
                    </div>
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-gray-600 mb-0.5">Status</p>
                      <div className="flex items-center gap-1">
                        {changeRequest.overhead_analysis?.balance_type === 'negative' ? (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-600" />
                            <p className="font-bold text-red-600 text-[10px]">Over Budget</p>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-600" />
                            <p className="font-bold text-green-600 text-[10px]">Within Budget</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vendor Details - Only show if TD approved vendor */}
              {changeRequest.vendor_approved_by_td_id && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Package className="w-3 h-3 sm:w-4 sm:h-4" />
                    Vendor Details
                  </h3>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-300 rounded-lg p-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-white/70 rounded p-2">
                        <p className="text-xs text-blue-700 mb-1">Selected Vendor</p>
                        <p className="text-sm font-bold text-blue-900">{changeRequest.selected_vendor_name || 'N/A'}</p>
                      </div>
                      <div className="bg-white/70 rounded p-2">
                        <p className="text-xs text-blue-700 mb-1">Approved By TD</p>
                        <p className="text-sm font-bold text-blue-900">{changeRequest.vendor_approved_by_td_name || 'N/A'}</p>
                      </div>
                      <div className="bg-white/70 rounded p-2">
                        <p className="text-xs text-blue-700 mb-1">Approval Date</p>
                        <p className="text-sm font-bold text-blue-900">
                          {changeRequest.vendor_approval_date
                            ? new Date(changeRequest.vendor_approval_date).toLocaleDateString('en-US', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Approval Info */}
              {isHighValue && (
                <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-900 text-xs sm:text-sm">Technical Director Approval Required</p>
                      <p className="text-[10px] sm:text-xs text-blue-700 mt-1">
                        This request exceeds AED 50,000 and requires approval from the Technical Director
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Rejection Reason */}
              {changeRequest.status === 'rejected' && changeRequest.rejection_reason && (
                <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-red-50 border-l-4 border-red-500 rounded">
                  <p className="font-semibold text-red-900 text-xs sm:text-sm mb-1">Rejection Reason:</p>
                  <p className="text-xs sm:text-sm text-red-700 break-words">{changeRequest.rejection_reason}</p>
                  {changeRequest.approved_by_name && (
                    <p className="text-xs text-red-600 mt-2">- {changeRequest.approved_by_name}</p>
                  )}
                </div>
              )}

              {/* Approval Info */}
              {changeRequest.status === 'approved' && changeRequest.approved_by_name && (
                <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-green-50 border-l-4 border-green-500 rounded">
                  <p className="font-semibold text-green-900 text-xs sm:text-sm break-words">
                    Approved by {changeRequest.approved_by_name} on{' '}
                    {changeRequest.approval_date && new Date(changeRequest.approval_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            {/* Footer - Responsive Actions */}
            {/* Hide footer completely if in accepted/final state */}
            {!(isFinalStatus || isApprovedAndSentForward) && (
              <div className="border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
                {canSendForReview && (
                  <button
                    onClick={handleSendForReview}
                    disabled={sendingForReview}
                    className="w-full sm:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base disabled:bg-gray-400"
                  >
                    {sendingForReview ? (
                      <>
                        <ModernLoadingSpinners variant="dots" size="small" color="white" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send for Review
                      </>
                    )}
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => {
                      if (onEdit) {
                        onEdit();
                      } else {
                        setShowEditModal(true);
                      }
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Request
                  </button>
                )}
                {canApproveReject ? (
                  <>
                    <button
                      onClick={onReject}
                      className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm sm:text-base"
                    >
                      Reject
                    </button>
                    <button
                      onClick={onApprove}
                      className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve Request
                    </button>
                  </>
                ) : (
                  !canEdit && (
                    <button
                      onClick={onClose}
                      className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm sm:text-base"
                    >
                      Close
                    </button>
                  )
                )}
              </div>
            )}
          </motion.div>
        </div>

        {/* Edit Change Request Modal */}
        {showEditModal && (
          <EditChangeRequestModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            changeRequest={changeRequest}
            onSuccess={() => {
              setShowEditModal(false);
              // Optionally refresh the data
              window.location.reload();
            }}
          />
        )}
      </>
    </AnimatePresence>
  );
};

export default ChangeRequestDetailsModal;
