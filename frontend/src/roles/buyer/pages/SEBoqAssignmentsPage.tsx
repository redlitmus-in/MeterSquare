import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BuildingOfficeIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  TruckIcon,
  CurrencyDollarIcon,
  EyeIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { BOQAssignment, getSEBoqAssignments, selectVendorForSEBoq, completeSEBoqPurchase } from '@/services/boqAssignmentService';

const SEBoqAssignmentsPage: React.FC = () => {
  const [assignments, setAssignments] = useState<BOQAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<BOQAssignment | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'completed'>('all');

  useEffect(() => {
    fetchAssignments(true);
  }, []);

  const fetchAssignments = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      const data = await getSEBoqAssignments();
      setAssignments(data);
    } catch (error) {
      showError('Failed to load SE BOQ assignments');
      console.error(error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleVendorSelect = async (vendorId: number) => {
    if (!selectedAssignment) return;

    try {
      await selectVendorForSEBoq(selectedAssignment.assignment_id, vendorId);
      showSuccess('Vendor selected. Awaiting TD approval.');
      setSelectedAssignment(null);
      // Silent refresh without loading spinner
      fetchAssignments(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to select vendor';
      showError(errorMessage);
      console.error(error);
    }
  };

  const handleCompletePurchase = async (assignmentId: number) => {
    try {
      await completeSEBoqPurchase(assignmentId);
      showSuccess('Purchase completed successfully');
      // Silent refresh without loading spinner
      fetchAssignments(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to complete purchase';
      showError(errorMessage);
      console.error(error);
    }
  };

  const getStatusBadge = (assignment: BOQAssignment) => {
    if (assignment.status === 'purchase_completed') {
      return (
        <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center gap-1">
          <CheckCircleIcon className="w-4 h-4" />
          Completed
        </span>
      );
    }

    if (assignment.vendor_selection_status === 'approved') {
      return (
        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full flex items-center gap-1">
          <CheckCircleIcon className="w-4 h-4" />
          Vendor Approved
        </span>
      );
    }

    if (assignment.vendor_selection_status === 'pending_td_approval') {
      return (
        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full flex items-center gap-1">
          <ClockIcon className="w-4 h-4" />
          Pending TD Approval
        </span>
      );
    }

    if (assignment.vendor_selection_status === 'rejected') {
      return (
        <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full flex items-center gap-1">
          <XCircleIcon className="w-4 h-4" />
          Vendor Rejected
        </span>
      );
    }

    return (
      <span className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full flex items-center gap-1">
        <ClockIcon className="w-4 h-4" />
        Pending Vendor Selection
      </span>
    );
  };

  const filteredAssignments = useMemo(() => {
    return assignments.filter(assignment => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'pending') return !assignment.selected_vendor_id;
      if (filterStatus === 'approved') return assignment.vendor_selection_status === 'approved';
      if (filterStatus === 'completed') return assignment.status === 'purchase_completed';
      return true;
    });
  }, [assignments, filterStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ModernLoadingSpinners variant="pulse-wave" size="large" color="primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">SE BOQ Assignments</h1>
          <p className="text-gray-600">Manage BOQ materials assigned by Site Engineers</p>
        </div>
        {isRefreshing && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm font-medium">Updating...</span>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 mb-6 inline-flex gap-1">
        {[
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending Vendor' },
          { key: 'approved', label: 'Approved' },
          { key: 'completed', label: 'Completed' }
        ].map((filter) => (
          <button
            key={filter.key}
            onClick={() => setFilterStatus(filter.key as any)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              filterStatus === filter.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Assignments Grid */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No BOQ assignments in this category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredAssignments.map((assignment, index) => (
            <motion.div
              key={`assignment-${assignment.assignment_id}`}
              initial={loading ? { opacity: 0, y: 20 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={loading ? { delay: index * 0.05 } : { duration: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                      {assignment.boq?.boq_name || `BOQ-${assignment.boq_id}`}
                    </h3>
                    <p className="text-sm text-gray-600">{assignment.project?.project_name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Assigned by: {assignment.assigned_by_name}
                    </p>
                  </div>
                  {getStatusBadge(assignment)}
                </div>

                {/* Project Info */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-700 mb-1">Client</p>
                    <p className="text-sm font-bold text-blue-900 truncate">
                      {assignment.project?.client || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs text-green-700 mb-1">Location</p>
                    <p className="text-sm font-bold text-green-900 truncate">
                      {assignment.project?.location || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Items & Sub-Items Preview */}
                {assignment.materials && assignment.materials.length > 0 && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <DocumentTextIcon className="w-5 h-5 text-indigo-700" />
                        <p className="text-xs text-indigo-700 font-semibold">BOQ Items</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        // Get unique items with their sub-items
                        const itemsMap = new Map<string, Set<string>>();
                        assignment.materials.forEach(material => {
                          const itemName = material.item_name || 'Unknown Item';
                          const subItemName = material.sub_item_name || 'Unknown Sub-Item';
                          if (!itemsMap.has(itemName)) {
                            itemsMap.set(itemName, new Set());
                          }
                          itemsMap.get(itemName)!.add(subItemName);
                        });

                        // Show first 2 items
                        const itemEntries = Array.from(itemsMap.entries()).slice(0, 2);
                        return itemEntries.map(([itemName, subItems], idx) => (
                          <div key={idx} className="text-xs">
                            <p className="font-bold text-indigo-900">{itemName}</p>
                            <p className="text-indigo-700 ml-3">
                              └ {Array.from(subItems).slice(0, 2).join(', ')}
                              {subItems.size > 2 && ` +${subItems.size - 2} more`}
                            </p>
                          </div>
                        ));
                      })()}
                      {assignment.materials.length > 4 && (
                        <p className="text-xs text-indigo-600 italic mt-2">
                          +{assignment.materials.length - 4} more materials...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Materials Summary */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-purple-700 mb-1">Materials</p>
                      <p className="text-lg font-bold text-purple-900">
                        {assignment.materials?.length || 0} items
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-purple-700 mb-1">Total Cost</p>
                      <p className="text-lg font-bold text-purple-900">
                        AED {assignment.total_cost?.toLocaleString() || '0'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Overhead/Miscellaneous Summary */}
                {(assignment.overhead_allocated !== undefined && assignment.overhead_allocated > 0) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-amber-700 mb-1">Base Total</p>
                        <p className="text-sm font-bold text-amber-900">
                          AED {assignment.base_total?.toLocaleString() || '0'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-amber-700 mb-1">Overhead ({assignment.overhead_percentage || 0}%)</p>
                        <p className="text-sm font-bold text-amber-900">
                          AED {assignment.overhead_allocated?.toLocaleString() || '0'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Vendor Info */}
                {assignment.vendor && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                    <p className="text-xs text-gray-700 mb-2 font-medium">Selected Vendor</p>
                    <p className="text-sm font-bold text-gray-900">{assignment.vendor.company_name}</p>
                    <p className="text-xs text-gray-600">{assignment.vendor.email}</p>
                    {assignment.vendor_rejection_reason && (
                      <p className="text-xs text-red-600 mt-2">
                        Rejection reason: {assignment.vendor_rejection_reason}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-3">
                  {/* View Details Button - Always Visible */}
                  <button
                    onClick={() => {
                      setSelectedAssignment(assignment);
                      setShowDetailsModal(true);
                    }}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-lg transition-all font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                  >
                    <EyeIcon className="w-5 h-5" />
                    View Details
                  </button>

                  {/* Action Buttons Row */}
                  <div className="flex items-center gap-3">

                    {assignment.vendor_selection_status === 'approved' && assignment.status !== 'purchase_completed' && (
                      <button
                        onClick={() => handleCompletePurchase(assignment.assignment_id)}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                        Complete Purchase
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* BOQ Details Modal */}
      <AnimatePresence>
        {showDetailsModal && selectedAssignment && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {selectedAssignment.boq?.boq_name || `BOQ-${selectedAssignment.boq_id}`}
                  </h3>
                  <p className="text-blue-100 text-sm">{selectedAssignment.project?.project_name}</p>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedAssignment(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-white" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-xs text-purple-700 mb-1">Total Materials</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {selectedAssignment.materials?.length || 0}
                    </p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-xs text-green-700 mb-1">Total Cost</p>
                    <p className="text-2xl font-bold text-green-900">
                      AED {selectedAssignment.total_cost?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs text-blue-700 mb-1">Status</p>
                    <div className="mt-1">
                      {getStatusBadge(selectedAssignment)}
                    </div>
                  </div>
                </div>

                {/* Materials Table */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                    <h4 className="font-bold text-gray-900 flex items-center gap-2">
                      <DocumentTextIcon className="w-5 h-5" />
                      Materials Details
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Item</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Sub-Item</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Material</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Qty</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Unit Price</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedAssignment.materials?.map((material, index) => (
                          <tr key={index} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                              {material.item_name || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {material.sub_item_name || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {material.material_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right">
                              {material.quantity} {material.unit}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right">
                              AED {material.unit_price?.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                              AED {material.total_price?.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                            Grand Total:
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                            AED {selectedAssignment.total_cost?.toLocaleString() || '0'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (501 lines)
export default React.memo(SEBoqAssignmentsPage);
