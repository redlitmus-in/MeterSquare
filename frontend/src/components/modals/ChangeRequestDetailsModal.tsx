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
  const [expandedJustifications, setExpandedJustifications] = useState<Set<number>>(new Set());

  // State to track edited materials with updated prices
  const [editedMaterials, setEditedMaterials] = useState<any[]>([]);

  // Toggle justification expansion
  const toggleJustification = (idx: number) => {
    setExpandedJustifications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

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
    const labels: Record<string, string> = {
      pending: 'PENDING',
      under_review: 'UNDER REVIEW',
      approved_by_pm: 'APPROVED BY PM',
      approved_by_td: 'APPROVED BY TD',
      approved: 'APPROVED & MERGED',
      rejected: 'REJECTED',
      assigned_to_buyer: 'ASSIGNED TO BUYER',
      purchase_completed: 'PURCHASE COMPLETED',
      pending_td_approval: 'PENDING TD APPROVAL',
      vendor_approved: 'VENDOR APPROVED',
      split_to_po_children: 'SPLIT TO VENDORS'
    };
    return labels[status] || status.toUpperCase().replace(/_/g, ' ');
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
  const isFinalStatus = ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer', 'send_to_buyer', 'purchase_completed', 'approved', 'rejected', 'pending_td_approval', 'vendor_approved'].includes(changeRequest.status);

  // Check if vendor selection is pending TD approval (no edits allowed)
  const isVendorPendingApproval = changeRequest.vendor_selection_status === 'pending_td_approval';

  // Estimator/TD can approve if request needs their approval
  const canApproveReject = canApproveFromParent !== undefined
    ? canApproveFromParent
    : (userIsEstimator || userIsTechnicalDirector) &&
      changeRequest.status === 'under_review' &&
      !isFinalStatus;

  // Determine if estimator can edit prices (estimator viewing under_review status)
  // DISABLED once sent to TD for vendor approval
  const canEditPrices = userIsEstimator &&
                        changeRequest.status === 'under_review' &&
                        changeRequest.approval_required_from === 'estimator' &&
                        !isVendorPendingApproval &&
                        !isFinalStatus;

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
        {/* Full Page View */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-gray-100"
        >
          <div className="h-full flex flex-col">
            {/* Header - Fixed at top */}
            <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 shadow-lg flex-shrink-0">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">
                      Change Request CR-{changeRequest.cr_id || 'N/A'}
                    </h1>
                    <p className="text-sm text-white/80 mt-1">
                      BOQ: {changeRequest.boq_name || `#${changeRequest.boq_id}` || 'N/A'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <X className="w-5 h-5" />
                  <span className="font-medium">Close</span>
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-7xl mx-auto">
                {/* Info Cards Row */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">Status:</span>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${getStatusColor(changeRequest.status || 'pending')}`}>
                        {getStatusIcon(changeRequest.status || 'pending')}
                        {getStatusLabel(changeRequest.status || 'pending')}
                      </span>
                    </div>
                    <div className="h-6 w-px bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Requested By:</span>
                      <span className="text-sm font-semibold text-gray-900">{changeRequest.requested_by_name || 'N/A'}</span>
                      <span className="text-sm text-gray-400">({changeRequest.requested_by_role?.replace('_', ' ').replace('siteEngineer', 'Site Engineer') || 'N/A'})</span>
                    </div>
                    <div className="h-6 w-px bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Date:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {changeRequest.created_at ? new Date(changeRequest.created_at).toLocaleDateString('en-US', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>


                {/* Approval Trail */}
                {(changeRequest.pm_approval_date || changeRequest.td_approval_date || changeRequest.approval_date || changeRequest.rejection_reason) && (
                  <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Approval History</h3>
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

                {/* Materials Requested - Full Width Table */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800">Materials Requested</h3>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <thead className="bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-[15%]">Material</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-[10%]">Brand</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-[10%]">Size/Spec</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-[10%]">Sub-Item</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-[8%]">Qty</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-[27%]">Justification</th>
                        {shouldShowPricing && (
                          <>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider w-[10%]">Unit Price</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider w-[10%]">Total</th>
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
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            {/* Material Name */}
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate" title={material.material_name}>{material.material_name}</span>
                                {isNewMaterial && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300 flex-shrink-0">
                                    NEW
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* Brand */}
                            <td className="px-4 py-3 text-sm text-gray-600 truncate" title={material.brand || ''}>
                              {material.brand || <span className="text-gray-400">-</span>}
                            </td>
                            {/* Size/Spec */}
                            <td className="px-4 py-3 text-sm text-gray-600 truncate" title={material.size || material.specification || ''}>
                              {material.size || material.specification || <span className="text-gray-400">-</span>}
                            </td>
                            {/* Sub-Item */}
                            <td className="px-4 py-3 text-sm">
                              {material.sub_item_name ? (
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 truncate max-w-full" title={material.sub_item_name}>
                                  {material.sub_item_name}
                                </span>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Quantity */}
                            <td className="px-4 py-3 text-sm text-gray-900 text-center whitespace-nowrap font-medium">
                              {material.quantity} <span className="text-gray-500 font-normal">{material.unit}</span>
                            </td>
                            {/* Justification */}
                            <td className="px-4 py-3 text-sm" style={{ maxWidth: '280px', minWidth: '200px' }}>
                              {material.justification ? (
                                <div className="w-full">
                                  {material.justification.length > 100 ? (
                                    <div>
                                      {expandedJustifications.has(idx) ? (
                                        <>
                                          <p className="text-sm text-gray-700 leading-relaxed break-words whitespace-pre-wrap">
                                            {material.justification}
                                          </p>
                                          <button
                                            onClick={() => toggleJustification(idx)}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-2 hover:underline inline-flex items-center gap-1"
                                          >
                                            ↑ Show less
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-sm text-gray-700 leading-relaxed break-words">
                                            {material.justification.substring(0, 100)}...
                                          </p>
                                          <button
                                            onClick={() => toggleJustification(idx)}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1 hover:underline inline-flex items-center gap-1"
                                          >
                                            See more ↓
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-700 leading-relaxed break-words">
                                      {material.justification}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">No justification</span>
                              )}
                            </td>
                            {shouldShowPricing && (
                              <>
                                {/* Unit Price */}
                                <td className="px-4 py-3 text-sm text-gray-600 text-right whitespace-nowrap">
                                  {canEditPrices && isNewMaterial ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={material.unit_price || 0}
                                      onChange={(e) => handlePriceChange(idx, e.target.value)}
                                      className="w-24 px-2 py-1 text-sm text-right border border-purple-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-purple-50 text-gray-900 font-medium"
                                      placeholder="0.00"
                                    />
                                  ) : (
                                    formatCurrency(material.unit_price || 0)
                                  )}
                                </td>
                                {/* Total */}
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                                  {formatCurrency(material.total_price || (material.quantity * material.unit_price) || 0)}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                      {shouldShowPricing && (
                        <tr className="bg-gray-100 border-t-2 border-gray-300">
                          <td colSpan={6} className="px-4 py-3 text-sm font-bold text-gray-700 text-right">
                            Total Cost:
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right"></td>
                          <td className="px-4 py-3 text-base font-bold text-purple-700 text-right whitespace-nowrap">
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
                    <div className={`bg-white rounded-lg shadow-sm p-4 mb-6 ${hasInvalidBudget ? 'border-l-4 border-red-500' : 'border-l-4 border-purple-500'}`}>
                      {/* Warning Banner for Invalid Budget */}
                      {hasInvalidBudget && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-red-900">
                                No Negotiable Margin Budget Available
                              </p>
                              <p className="text-sm text-red-700 mt-1">
                                Current Allocation: {formatCurrency(changeRequest.negotiable_margin_analysis.original_allocated)}
                              </p>
                              <p className="text-sm text-red-600 mt-1">
                                This budget shows invalid or insufficient allocation for change requests.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <h3 className={`text-sm font-semibold mb-4 ${hasInvalidBudget ? 'text-red-900' : 'text-purple-900'}`}>
                        Negotiable Margin Summary
                      </h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <span className={`text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            Original Allocated:
                          </span>
                          <p className={`font-bold text-sm ${hasInvalidBudget ? 'text-red-900' : 'text-purple-900'}`}>
                            {formatCurrency(changeRequest.negotiable_margin_analysis.original_allocated || 0)}
                          </p>
                          {changeRequest.negotiable_margin_analysis.discount_applied > 0 && (
                            <p className={`text-xs ${hasInvalidBudget ? 'text-red-500' : 'text-purple-500'}`}>
                              (Discount: {formatCurrency(changeRequest.negotiable_margin_analysis.discount_applied)})
                            </p>
                          )}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <span className={`text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            Already Consumed:
                          </span>
                          <p className="font-bold text-sm text-orange-600">
                            {formatCurrency(changeRequest.negotiable_margin_analysis.already_consumed || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <span className={`text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            This Request:
                          </span>
                          <p className="font-bold text-sm text-blue-600">
                            {formatCurrency(changeRequest.negotiable_margin_analysis.this_request || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <span className={`text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            Remaining After:
                          </span>
                          <p className={`font-bold text-sm ${
                            changeRequest.negotiable_margin_analysis.remaining_after < 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}>
                            {formatCurrency(changeRequest.negotiable_margin_analysis.remaining_after)}
                          </p>
                        </div>
                      </div>

                      <div className={`mt-4 pt-4 border-t ${hasInvalidBudget ? 'border-red-200' : 'border-purple-200'}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-sm ${hasInvalidBudget ? 'text-red-700' : 'text-purple-700'}`}>
                            Total Consumption:
                          </span>
                          <span className={`text-xl font-bold ${
                            changeRequest.negotiable_margin_analysis.exceeds_60_percent
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}>
                            {changeRequest.negotiable_margin_analysis.consumption_percentage.toFixed(1)}%
                          </span>
                        </div>
                        {changeRequest.negotiable_margin_analysis.exceeds_60_percent && (
                          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            <span>Warning: Consumption exceeds 60% threshold</span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Vendor Details - Show if vendor has been selected (pending, approved, or rejected) */}
                {(changeRequest.selected_vendor_name || changeRequest.vendor_selection_status) && (
                  <div className={`bg-white rounded-lg shadow-sm p-4 mb-6 border-l-4 ${
                    changeRequest.vendor_selection_status === 'approved' ? 'border-green-500' :
                    changeRequest.vendor_selection_status === 'rejected' ? 'border-red-500' :
                    'border-amber-500'
                  }`}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Vendor Details
                      {changeRequest.vendor_selection_status === 'pending_td_approval' && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded">
                          Pending TD Approval
                        </span>
                      )}
                      {changeRequest.vendor_selection_status === 'approved' && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-green-100 text-green-800 rounded">
                          Approved
                        </span>
                      )}
                      {changeRequest.vendor_selection_status === 'rejected' && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-800 rounded">
                          Rejected
                        </span>
                      )}
                    </h3>
                    <div className={`grid grid-cols-1 gap-4 ${
                      changeRequest.vendor_selection_status === 'approved' ? 'md:grid-cols-4' : 'md:grid-cols-3'
                    }`}>
                      {/* Selected Vendor */}
                      <div className={`rounded-lg p-3 ${
                        changeRequest.vendor_selection_status === 'approved' ? 'bg-green-50' :
                        changeRequest.vendor_selection_status === 'rejected' ? 'bg-red-50' :
                        'bg-amber-50'
                      }`}>
                        <p className={`text-xs mb-1 ${
                          changeRequest.vendor_selection_status === 'approved' ? 'text-green-600' :
                          changeRequest.vendor_selection_status === 'rejected' ? 'text-red-600' :
                          'text-amber-600'
                        }`}>Selected Vendor</p>
                        <p className="text-sm font-bold text-gray-900">{changeRequest.selected_vendor_name || 'N/A'}</p>
                      </div>
                      {/* Selected By (Buyer) */}
                      <div className={`rounded-lg p-3 ${
                        changeRequest.vendor_selection_status === 'approved' ? 'bg-green-50' :
                        changeRequest.vendor_selection_status === 'rejected' ? 'bg-red-50' :
                        'bg-amber-50'
                      }`}>
                        <p className={`text-xs mb-1 ${
                          changeRequest.vendor_selection_status === 'approved' ? 'text-green-600' :
                          changeRequest.vendor_selection_status === 'rejected' ? 'text-red-600' :
                          'text-amber-600'
                        }`}>Selected By (Buyer)</p>
                        <p className="text-sm font-bold text-gray-900">{changeRequest.vendor_selected_by_buyer_name || 'N/A'}</p>
                      </div>
                      {/* Approved By TD - Show for approved status */}
                      {changeRequest.vendor_selection_status === 'approved' && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-xs text-green-600 mb-1">Approved By TD</p>
                          <p className="text-sm font-bold text-gray-900">{changeRequest.vendor_approved_by_td_name || 'N/A'}</p>
                        </div>
                      )}
                      {/* Approval Date - Show for approved status */}
                      {changeRequest.vendor_selection_status === 'approved' && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-xs text-green-600 mb-1">Approval Date</p>
                          <p className="text-sm font-bold text-gray-900">
                            {changeRequest.vendor_approval_date ? new Date(changeRequest.vendor_approval_date).toLocaleDateString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            }) : 'N/A'}
                          </p>
                        </div>
                      )}
                      {/* Selection Date - Show for pending status */}
                      {changeRequest.vendor_selection_status === 'pending_td_approval' && (
                        <div className="bg-amber-50 rounded-lg p-3">
                          <p className="text-xs text-amber-600 mb-1">Selection Date</p>
                          <p className="text-sm font-bold text-gray-900">
                            {changeRequest.vendor_selection_date ? new Date(changeRequest.vendor_selection_date).toLocaleDateString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            }) : 'N/A'}
                          </p>
                        </div>
                      )}
                      {/* Rejection Reason - Show for rejected status */}
                      {changeRequest.vendor_selection_status === 'rejected' && changeRequest.vendor_rejection_reason && (
                        <div className="bg-red-50 rounded-lg p-3 md:col-span-3">
                          <p className="text-xs text-red-600 mb-1">Rejection Reason</p>
                          <p className="text-sm font-bold text-red-900">{changeRequest.vendor_rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TD Approval Required Info - Only show if high value AND vendor not already approved */}
                {isHighValue && changeRequest.vendor_selection_status !== 'approved' && (
                  <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border-l-4 border-blue-500">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-blue-900 text-sm">Technical Director Approval Required</p>
                        <p className="text-sm text-blue-700 mt-1">
                          This request exceeds AED 50,000 and requires approval from the Technical Director
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rejection Reason */}
                {changeRequest.status === 'rejected' && changeRequest.rejection_reason && (
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500 mb-6">
                    <p className="font-semibold text-red-900 text-sm mb-2">Rejection Reason:</p>
                    <p className="text-sm text-red-700 break-words">{changeRequest.rejection_reason}</p>
                    {changeRequest.approved_by_name && (
                      <p className="text-xs text-red-600 mt-2">- {changeRequest.approved_by_name}</p>
                    )}
                  </div>
                )}

                {/* Approval Info */}
                {changeRequest.status === 'approved' && changeRequest.approved_by_name && (
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
                    <p className="font-semibold text-green-900 text-sm">
                      Approved by {changeRequest.approved_by_name} on{' '}
                      {changeRequest.approval_date && new Date(changeRequest.approval_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer - Only show if can approve/reject */}
            {!isFinalStatus && canApproveReject && (
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex-shrink-0">
                <div className="max-w-7xl mx-auto flex items-center justify-end gap-4">
                  <button
                    onClick={onReject}
                    className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleApproveWithUpdatedPrices}
                    className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Approve Request
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

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
