import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, AlertCircle, CheckCircle, Clock, XCircle, Send } from 'lucide-react';
import { ChangeRequestItem } from '@/services/changeRequestService';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/utils/formatters';
import { isEstimator, isTechnicalDirector, isSiteEngineer } from '@/utils/roleHelpers';
import EditChangeRequestModal from './EditChangeRequestModal';

interface ChangeRequestDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeRequest: ChangeRequestItem | null;
  onApprove?: () => void;
  onReject?: () => void;
  canApprove?: boolean;
}

const ChangeRequestDetailsModal: React.FC<ChangeRequestDetailsModalProps> = ({
  isOpen,
  onClose,
  changeRequest,
  onApprove,
  onReject,
  canApprove: canApproveFromParent
}) => {
  const { user } = useAuthStore();
  const [showEditModal, setShowEditModal] = useState(false);

  // State to track edited materials with updated prices
  const [editedMaterials, setEditedMaterials] = useState<any[]>([]);

  // Initialize edited materials when modal opens or changeRequest changes
  // Use isOpen and changeRequest as dependencies to ensure fresh data on every open
  React.useEffect(() => {
    if (isOpen && changeRequest) {
      const materials = changeRequest.sub_items_data || changeRequest.materials_data || [];
      setEditedMaterials(JSON.parse(JSON.stringify(materials))); // Deep copy
    }
  }, [isOpen, changeRequest]);

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

  // Handler for updating unit price
  const handlePriceChange = (index: number, newUnitPrice: string) => {
    const price = parseFloat(newUnitPrice) || 0;
    const updatedMaterials = [...editedMaterials];
    updatedMaterials[index] = {
      ...updatedMaterials[index],
      unit_price: price,
      total_price: updatedMaterials[index].quantity * price
    };
    setEditedMaterials(updatedMaterials);
  };

  // Calculate costs: Use editedMaterials for real-time calculations
  const materialsData = editedMaterials.length > 0 ? editedMaterials : (changeRequest.sub_items_data || changeRequest.materials_data || []);

  // Total cost of ALL materials (for display) - uses editedMaterials
  const totalMaterialsCost = materialsData.reduce((sum: number, mat: any) =>
    sum + (mat.total_price || (mat.quantity * mat.unit_price) || 0), 0
  );

  const isHighValue = changeRequest.approval_required_from === 'technical_director';

  // Use role helper functions instead of hardcoded IDs
  const userIsEstimator = isEstimator(user);
  const userIsTechnicalDirector = isTechnicalDirector(user);
  const userIsSiteEngineer = isSiteEngineer(user);
  const userIsBuyer = user?.role?.toLowerCase() === 'buyer' || user?.role_name?.toLowerCase() === 'buyer';

  // Final statuses where no actions should be allowed
  const isFinalStatus = ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer', 'purchase_completed', 'approved', 'rejected'].includes(changeRequest.status);

  // Estimator/TD can approve if request needs their approval
  const canApproveReject = canApproveFromParent !== undefined
    ? canApproveFromParent
    : (userIsEstimator || userIsTechnicalDirector) &&
      changeRequest.status === 'under_review' &&
      !isFinalStatus;

  // Determine if estimator can edit prices (estimator viewing under_review status)
  const canEditPrices = userIsEstimator &&
                        changeRequest.status === 'under_review' &&
                        changeRequest.approval_required_from === 'estimator';

  // Check if there are any new materials (determines if pricing columns should be shown)
  const hasNewMaterials = materialsData.some((mat: any) => mat.master_material_id === null || mat.master_material_id === undefined);

  // Determine if user is PM
  const userIsProjectManager = user?.role?.toLowerCase() === 'project_manager' || user?.role_name?.toLowerCase() === 'project_manager';

  // Buyers and PM should always see pricing columns for both existing and new materials
  const shouldShowPricing = userIsBuyer || userIsProjectManager || (!userIsSiteEngineer && hasNewMaterials);

  // Handler for approval with updated materials
  const handleApproveWithUpdatedPrices = () => {
    if (onApprove) {
      // Store edited materials in changeRequest for parent to access
      (changeRequest as any)._editedMaterials = editedMaterials;
      onApprove();
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
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b-2 bg-gradient-to-r from-purple-500 to-purple-600">
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
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full table-fixed">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-1.5 py-1.5 text-left text-[11px] font-semibold text-gray-600 w-[18%]">Material</th>
                        <th className="px-1.5 py-1.5 text-left text-[11px] font-semibold text-gray-600 w-[12%]">Brand</th>
                        <th className="px-1.5 py-1.5 text-left text-[11px] font-semibold text-gray-600 w-[14%]">Size/Spec</th>
                        <th className="px-1.5 py-1.5 text-left text-[11px] font-semibold text-gray-600 w-[16%]">Sub-Item</th>
                        <th className="px-1.5 py-1.5 text-left text-[11px] font-semibold text-gray-600 w-[14%]">For Item</th>
                        <th className="px-1.5 py-1.5 text-right text-[11px] font-semibold text-gray-600 w-[12%]">Quantity</th>
                        {shouldShowPricing && (
                          <>
                            <th className="px-1.5 py-1.5 text-right text-[11px] font-semibold text-gray-600 w-[14%]">Unit Price</th>
                            <th className="px-1.5 py-1.5 text-right text-[11px] font-semibold text-gray-600 w-[14%]">Total</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {materialsData?.map((material: any, idx: number) => {
                        // A material is NEW if master_material_id is null/undefined OR has invalid format
                        // Valid format should start with "mat_" (e.g., mat_666_1_1_1)
                        const hasValidMaterialId = material.master_material_id &&
                                                   (typeof material.master_material_id === 'string') &&
                                                   material.master_material_id.startsWith('mat_');
                        const isNewMaterial = !hasValidMaterialId;
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-1.5 py-1.5 text-[11px] font-medium text-gray-900 truncate">
                              <div className="flex items-center gap-1">
                                <span className="truncate">{material.material_name}</span>
                                {isNewMaterial && (
                                  <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-800 border border-green-300 flex-shrink-0">
                                    NEW
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-1.5 py-1.5 text-[11px] text-gray-600 truncate">
                              {material.brand || '-'}
                            </td>
                            <td className="px-1.5 py-1.5 text-[11px] text-gray-600 truncate">
                              {material.size || material.specification || '-'}
                            </td>
                          <td className="px-1.5 py-1.5 text-[11px] text-gray-600 truncate">
                            {material.sub_item_name ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 truncate">
                                {material.sub_item_name}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-1.5 py-1.5 text-[11px] text-gray-600 truncate">
                            {changeRequest.item_name ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 truncate">
                                {changeRequest.item_name}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-1.5 py-1.5 text-[11px] text-gray-600 text-right whitespace-nowrap">
                            {material.quantity} {material.unit}
                          </td>
                          {shouldShowPricing && (
                            <>
                              <td className="px-1.5 py-1.5 text-[11px] text-gray-600 text-right whitespace-nowrap">
                                {canEditPrices && isNewMaterial ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={material.unit_price || 0}
                                    onChange={(e) => handlePriceChange(idx, e.target.value)}
                                    className="w-20 px-1.5 py-1 text-[11px] text-right border border-purple-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-purple-50 text-gray-900 font-medium"
                                    placeholder="0.00"
                                  />
                                ) : (
                                  formatCurrency(material.unit_price || 0)
                                )}
                              </td>
                              <td className="px-1.5 py-1.5 text-[11px] font-semibold text-gray-900 text-right whitespace-nowrap">
                                {formatCurrency(material.total_price || (material.quantity * material.unit_price) || 0)}
                              </td>
                            </>
                          )}
                        </tr>
                        );
                      })}
                      {shouldShowPricing && (
                        <tr className="bg-purple-50 font-bold">
                          <td colSpan={6} className="px-1.5 py-1.5 text-[11px] text-purple-900 text-right">
                            Total Cost:
                          </td>
                          <td className="px-1.5 py-1.5 text-xs font-bold text-purple-900 text-right whitespace-nowrap">
                            {formatCurrency(totalMaterialsCost)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Negotiable Margin Summary - Only show for NEW materials and hide from Site Engineers */}
              {!userIsSiteEngineer && changeRequest.negotiable_margin_analysis && materialsData.some((mat: any) => mat.master_material_id === null || mat.master_material_id === undefined) && (() => {
                // Check if budget is invalid (zero or negative allocation)
                const hasInvalidBudget = changeRequest.negotiable_margin_analysis.original_allocated <= 0;

                return (
                  <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg border ${
                    hasInvalidBudget
                      ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-300'
                      : 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'
                  }`}>
                    {/* Warning Banner for Invalid Budget */}
                    {hasInvalidBudget && (
                      <div className="mb-3 p-2 sm:p-3 bg-red-100 border border-red-300 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs sm:text-sm font-bold text-red-900">
                              No Negotiable Margin Budget Available
                            </p>
                            <p className="text-[10px] sm:text-xs text-red-700 mt-1">
                              Current Allocation: {formatCurrency(changeRequest.negotiable_margin_analysis.original_allocated)}
                            </p>
                            <p className="text-[10px] sm:text-xs text-red-600 mt-1">
                              This budget shows invalid or insufficient allocation for change requests.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <h3 className={`text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${
                      hasInvalidBudget ? 'text-red-900' : 'text-purple-900'
                    }`}>
                      Negotiable Margin Summary
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                      <div>
                        <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-700' : 'text-purple-700'}`}>
                          Original Allocated:
                        </span>
                        <p className={`font-bold text-xs sm:text-sm ${
                          hasInvalidBudget ? 'text-red-900' : 'text-purple-900'
                        }`}>
                          {formatCurrency(changeRequest.negotiable_margin_analysis.original_allocated || 0)}
                        </p>
                        {changeRequest.negotiable_margin_analysis.discount_applied > 0 && (
                          <p className={`text-[9px] sm:text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            (Discount: {formatCurrency(changeRequest.negotiable_margin_analysis.discount_applied)})
                          </p>
                        )}
                      </div>
                      <div>
                        <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-700' : 'text-purple-700'}`}>
                          Already Consumed:
                        </span>
                        <p className="font-bold text-orange-600 text-xs sm:text-sm">
                          {formatCurrency(changeRequest.negotiable_margin_analysis.already_consumed || 0)}
                        </p>
                      </div>
                      <div>
                        <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-700' : 'text-purple-700'}`}>
                          This Request:
                        </span>
                        <p className="font-bold text-blue-600 text-xs sm:text-sm">
                          {formatCurrency(changeRequest.negotiable_margin_analysis.this_request || 0)}
                        </p>
                      </div>
                      <div>
                        <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-700' : 'text-purple-700'}`}>
                          Remaining After:
                        </span>
                        <p className={`font-bold text-xs sm:text-sm ${
                          changeRequest.negotiable_margin_analysis.remaining_after < 0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}>
                          {formatCurrency(changeRequest.negotiable_margin_analysis.remaining_after)}
                        </p>
                      </div>
                    </div>

                    <div className={`mt-2 sm:mt-3 pt-2 sm:pt-3 border-t ${
                      hasInvalidBudget ? 'border-red-300' : 'border-purple-300'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs sm:text-sm ${hasInvalidBudget ? 'text-red-700' : 'text-purple-700'}`}>
                          Total Consumption:
                        </span>
                        <span className={`text-base sm:text-lg font-bold ${
                          changeRequest.negotiable_margin_analysis.exceeds_60_percent
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}>
                          {changeRequest.negotiable_margin_analysis.consumption_percentage.toFixed(1)}%
                        </span>
                      </div>
                      {changeRequest.negotiable_margin_analysis.exceeds_60_percent && (
                        <p className="text-[10px] sm:text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Warning: Consumption exceeds 60% threshold</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

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
            {/* Hide footer completely if in final state */}
            {!isFinalStatus && (
              <div className="border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
                {canApproveReject ? (
                  <>
                    <button
                      onClick={onReject}
                      className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm sm:text-base"
                    >
                      Reject
                    </button>
                    <button
                      onClick={handleApproveWithUpdatedPrices}
                      className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve Request
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onClose}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm sm:text-base"
                  >
                    Close
                  </button>
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

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (582 lines)
export default React.memo(ChangeRequestDetailsModal);
