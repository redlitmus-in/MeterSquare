/**
 * Asset Requisition Approvals Page for Project Manager
 * Review and approve/reject asset requisitions from Site Engineers
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  XMarkIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showError, showSuccess } from '@/utils/toastHelper';
import { PAGINATION } from '@/lib/constants';
import {
  AssetRequisition,
  RequisitionStatus,
  getPMPendingRequisitions,
  pmApproveRequisition,
  pmRejectRequisition,
  getStatusLabel,
  getStatusColor,
  getUrgencyColor,
  URGENCY_LABELS,
} from '@/roles/site-engineer/services/assetRequisitionService';

type TabStatus = 'pending' | 'approved' | 'rejected';

const AssetRequisitionApprovals: React.FC = () => {
  // State - separate data for each tab
  const [pendingRequisitions, setPendingRequisitions] = useState<AssetRequisition[]>([]);
  const [approvedRequisitions, setApprovedRequisitions] = useState<AssetRequisition[]>([]);
  const [rejectedRequisitions, setRejectedRequisitions] = useState<AssetRequisition[]>([]);

  // Loading states for each tab
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [loadingRejected, setLoadingRejected] = useState(false);

  // Track which tabs have been loaded
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [approvedLoaded, setApprovedLoaded] = useState(false);
  const [rejectedLoaded, setRejectedLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<TabStatus>('pending');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  // Modal state
  const [showActionModal, setShowActionModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [selectedRequisition, setSelectedRequisition] = useState<AssetRequisition | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch pending requisitions
  const fetchPending = useCallback(async () => {
    try {
      setLoadingPending(true);
      const data = await getPMPendingRequisitions({ status: 'pending' });
      // Filter to only pending_pm status
      const pending = data.filter(r => r.status === 'pending_pm');
      setPendingRequisitions(pending);
      setPendingLoaded(true);
    } catch (err) {
      console.error('Error fetching pending requisitions:', err);
      showError('Failed to load pending requisitions');
    } finally {
      setLoadingPending(false);
    }
  }, []);

  // Fetch approved requisitions
  const fetchApproved = useCallback(async () => {
    try {
      setLoadingApproved(true);
      const data = await getPMPendingRequisitions({ status: 'all' });
      // Filter to approved statuses
      const approved = data.filter(r =>
        ['pm_approved', 'pending_prod_mgr', 'prod_mgr_approved', 'dispatched', 'completed'].includes(r.status)
      );
      setApprovedRequisitions(approved);
      setApprovedLoaded(true);
    } catch (err) {
      console.error('Error fetching approved requisitions:', err);
      showError('Failed to load approved requisitions');
    } finally {
      setLoadingApproved(false);
    }
  }, []);

  // Fetch rejected requisitions
  const fetchRejected = useCallback(async () => {
    try {
      setLoadingRejected(true);
      const data = await getPMPendingRequisitions({ status: 'all' });
      // Filter to rejected status
      const rejected = data.filter(r => r.status === 'pm_rejected');
      setRejectedRequisitions(rejected);
      setRejectedLoaded(true);
    } catch (err) {
      console.error('Error fetching rejected requisitions:', err);
      showError('Failed to load rejected requisitions');
    } finally {
      setLoadingRejected(false);
    }
  }, []);

  // Fetch pending on initial load
  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Fetch data when tab changes (lazy loading)
  useEffect(() => {
    if (activeTab === 'pending' && !pendingLoaded && !loadingPending) {
      fetchPending();
    } else if (activeTab === 'approved' && !approvedLoaded && !loadingApproved) {
      fetchApproved();
    } else if (activeTab === 'rejected' && !rejectedLoaded && !loadingRejected) {
      fetchRejected();
    }
  }, [activeTab, pendingLoaded, approvedLoaded, rejectedLoaded, loadingPending, loadingApproved, loadingRejected, fetchPending, fetchApproved, fetchRejected]);

  // Get current tab's requisitions
  const currentRequisitions = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return pendingRequisitions;
      case 'approved':
        return approvedRequisitions;
      case 'rejected':
        return rejectedRequisitions;
      default:
        return pendingRequisitions;
    }
  }, [activeTab, pendingRequisitions, approvedRequisitions, rejectedRequisitions]);

  // Get current loading state
  const isLoading = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return loadingPending;
      case 'approved':
        return loadingApproved;
      case 'rejected':
        return loadingRejected;
      default:
        return false;
    }
  }, [activeTab, loadingPending, loadingApproved, loadingRejected]);

  // Count by status
  const statusCounts = useMemo(() => {
    return {
      pending: pendingRequisitions.length,
      approved: approvedRequisitions.length,
      rejected: rejectedRequisitions.length,
    };
  }, [pendingRequisitions, approvedRequisitions, rejectedRequisitions]);

  // Pagination calculations
  const totalRecords = currentRequisitions.length;
  const totalPages = Math.ceil(totalRecords / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedRequisitions = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return currentRequisitions.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [currentRequisitions, currentPage]);

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Refresh current tab
  const refreshCurrentTab = useCallback(() => {
    if (activeTab === 'pending') {
      setPendingLoaded(false);
      fetchPending();
    } else if (activeTab === 'approved') {
      setApprovedLoaded(false);
      fetchApproved();
    } else if (activeTab === 'rejected') {
      setRejectedLoaded(false);
      fetchRejected();
    }
  }, [activeTab, fetchPending, fetchApproved, fetchRejected]);

  // Open action modal
  const openActionModal = (req: AssetRequisition, action: 'approve' | 'reject') => {
    setSelectedRequisition(req);
    setModalAction(action);
    setActionNotes('');
    setRejectionReason('');
    setShowActionModal(true);
  };

  // Handle approve/reject
  const handleAction = async () => {
    if (!selectedRequisition) return;

    if (modalAction === 'reject' && !rejectionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }

    setProcessing(selectedRequisition.requisition_id);
    try {
      if (modalAction === 'approve') {
        await pmApproveRequisition(selectedRequisition.requisition_id, {
          notes: actionNotes.trim() || undefined,
        });
        showSuccess('Requisition approved and sent to Production Manager');
      } else {
        await pmRejectRequisition(selectedRequisition.requisition_id, {
          rejection_reason: rejectionReason.trim(),
          notes: actionNotes.trim() || undefined,
        });
        showSuccess('Requisition rejected');
      }

      setShowActionModal(false);
      setSelectedRequisition(null);
      // After action, refresh pending and the target tab
      setPendingLoaded(false);
      if (modalAction === 'approve') {
        setApprovedLoaded(false);
      } else {
        setRejectedLoaded(false);
      }
      fetchPending();
    } catch (err: unknown) {
      const error = err as { message?: string };
      showError(error.message || `Failed to ${modalAction} requisition`);
    } finally {
      setProcessing(null);
    }
  };

  // Format date
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Initial loading state
  if (loadingPending && pendingRequisitions.length === 0 && !pendingLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <ModernLoadingSpinners size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Requisition Approvals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve asset requests from Site Engineers
          </p>
        </div>
        <button
          onClick={refreshCurrentTab}
          disabled={isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          title="Refresh"
        >
          <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected'] as TabStatus[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? tab === 'pending'
                  ? 'bg-yellow-100 text-yellow-700'
                  : tab === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({statusCounts[tab]})
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <ModernLoadingSpinners size="md" />
        </div>
      )}

      {/* Requisitions List */}
      {!isLoading && currentRequisitions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="text-gray-400 mb-4">
            <ClockIcon className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-gray-600">
            {activeTab === 'pending'
              ? 'No pending requisitions to review'
              : `No ${activeTab} requisitions`}
          </p>
        </div>
      ) : !isLoading && (
        <div className="space-y-4">
          {paginatedRequisitions.map((req) => (
            <div
              key={req.requisition_id}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                req.urgency === 'urgent' ? 'border-red-300' : ''
              }`}
            >
              {/* Header Row */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() =>
                  setExpandedId(expandedId === req.requisition_id ? null : req.requisition_id)
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {req.urgency === 'urgent' && (
                      <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{req.requisition_code}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(req.status)}`}>
                          {getStatusLabel(req.status)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyColor(req.urgency)}`}>
                          {URGENCY_LABELS[req.urgency]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {req.items && req.items.length > 0 ? (
                          <span>{req.total_items || req.items.length} item{(req.total_items || req.items.length) > 1 ? 's' : ''} ({req.total_quantity || req.items.reduce((s, i) => s + (i.quantity ?? 1), 0)} total qty)</span>
                        ) : (
                          <span>{req.quantity}x {req.category_name}</span>
                        )} • {req.project_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested by {req.requested_by_name} • {formatDate(req.requested_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {req.status === 'pending_pm' && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openActionModal(req, 'approve');
                          }}
                          className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
                        >
                          Approve
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openActionModal(req, 'reject');
                          }}
                          className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {expandedId === req.requisition_id ? (
                      <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === req.requisition_id && (
                <div className="border-t p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Purpose</span>
                        <p className="text-sm text-gray-900 mt-1">{req.purpose}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Required Date</span>
                        <p className="text-sm text-gray-900 mt-1">{formatDate(req.required_date)}</p>
                      </div>
                      {req.site_location && (
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Site Location</span>
                          <p className="text-sm text-gray-900 mt-1">{req.site_location}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Asset Details</span>
                        {req.items && req.items.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {req.items.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400">{idx + 1}.</span>
                                <span className="text-gray-900">{item.category_name || item.category_code}</span>
                                <span className="text-gray-500">×</span>
                                <span className="font-medium">{item.quantity}</span>
                              </div>
                            ))}
                            <div className="pt-2 border-t mt-2 text-xs text-gray-500">
                              Total: {req.total_quantity || req.items.reduce((s, i) => s + (i.quantity ?? 1), 0)} units
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-gray-900 mt-1">
                              {req.category_name} ({req.category_code})
                            </p>
                            {req.item_code && (
                              <p className="text-sm text-gray-600">
                                Item: {req.item_code} {req.serial_number && `(${req.serial_number})`}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      {!req.items?.length && (
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Tracking Mode</span>
                          <p className="text-sm text-gray-900 mt-1 capitalize">{req.tracking_mode}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PM Decision (if already decided) */}
                  {req.pm_decision && (
                    <div className={`mt-4 p-3 rounded-lg ${req.pm_decision === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-center gap-2">
                        {req.pm_decision === 'approved' ? (
                          <CheckCircleIcon className="w-4 h-4 text-green-500" />
                        ) : (
                          <XMarkIcon className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-sm font-medium">
                          {req.pm_decision === 'approved' ? 'You approved this request' : 'You rejected this request'}
                        </span>
                      </div>
                      {req.pm_notes && <p className="text-sm text-gray-600 mt-1">Notes: {req.pm_notes}</p>}
                      {req.pm_rejection_reason && (
                        <p className="text-sm text-red-600 mt-1">Reason: {req.pm_rejection_reason}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {totalRecords > 0 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border border-gray-200 rounded-lg shadow-sm mt-4">
              <div className="text-sm text-gray-700">
                Showing {(currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE + 1} to{' '}
                {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, totalRecords)} of{' '}
                {totalRecords} requisitions
                {totalPages > 1 && (
                  <span className="text-gray-500 ml-2">(Page {currentPage} of {totalPages})</span>
                )}
              </div>
              {totalPages > 1 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      const showPage =
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1);

                      if (!showPage) {
                        if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2 text-gray-500">...</span>;
                        }
                        return null;
                      }

                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            currentPage === page
                              ? 'bg-yellow-500 text-white font-medium'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && selectedRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className={`p-4 border-b flex justify-between items-center ${modalAction === 'approve' ? 'bg-green-50' : 'bg-red-50'}`}>
              <h3 className={`text-lg font-semibold ${modalAction === 'approve' ? 'text-green-800' : 'text-red-800'}`}>
                {modalAction === 'approve' ? 'Approve Requisition' : 'Reject Requisition'}
              </h3>
              <button
                onClick={() => {
                  setShowActionModal(false);
                  setSelectedRequisition(null);
                }}
                className={`p-1 rounded ${modalAction === 'approve' ? 'hover:bg-green-100' : 'hover:bg-red-100'}`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm font-medium">{selectedRequisition.requisition_code}</p>
                {selectedRequisition.items && selectedRequisition.items.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {selectedRequisition.items.map((item, idx) => (
                      <p key={idx} className="text-sm text-gray-600">
                        {item.quantity}x {item.category_name || item.category_code}
                      </p>
                    ))}
                    <p className="text-xs text-gray-500 pt-1 border-t">
                      Total: {selectedRequisition.total_quantity || selectedRequisition.items.reduce((s, i) => s + (i.quantity ?? 1), 0)} units
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    {selectedRequisition.quantity}x {selectedRequisition.category_name}
                  </p>
                )}
                <p className="text-sm text-gray-600">{selectedRequisition.project_name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  By {selectedRequisition.requested_by_name}
                </p>
              </div>

              {modalAction === 'reject' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why you are rejecting this request..."
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={2}
                  className={`w-full px-3 py-2 border rounded-lg resize-none focus:ring-2 ${
                    modalAction === 'approve' ? 'focus:ring-green-500' : 'focus:ring-red-500'
                  } focus:border-transparent`}
                />
              </div>

              {modalAction === 'approve' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-700">
                    After approval, this request will be sent to the Production Manager for final approval and dispatch.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    setSelectedRequisition(null);
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  disabled={processing === selectedRequisition.requisition_id}
                  className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
                    modalAction === 'approve'
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {processing === selectedRequisition.requisition_id ? (
                    <ModernLoadingSpinners size="sm" />
                  ) : modalAction === 'approve' ? (
                    <CheckCircleIcon className="w-4 h-4" />
                  ) : (
                    <XMarkIcon className="w-4 h-4" />
                  )}
                  {modalAction === 'approve' ? 'Approve & Forward' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetRequisitionApprovals;
