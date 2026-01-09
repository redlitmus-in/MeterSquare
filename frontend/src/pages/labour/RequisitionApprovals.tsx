/**
 * Requisition Approvals Page
 * Project Manager: Approve or reject labour requisitions (Step 3)
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { labourService, LabourRequisition } from '@/services/labourService';
import { showSuccess, showError } from '@/utils/toastHelper';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
  EyeIcon,
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

// Tab configuration
type TabType = 'pending' | 'approved' | 'rejected';

interface TabConfig {
  key: TabType;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { key: 'pending', label: 'Pending', color: 'text-yellow-700', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500', icon: ClockIcon },
  { key: 'approved', label: 'Approved', color: 'text-green-700', bgColor: 'bg-green-100', borderColor: 'border-green-500', icon: CheckCircleIcon },
  { key: 'rejected', label: 'Rejected', color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-500', icon: XCircleIcon },
];

const RequisitionApprovals: React.FC = () => {
  const [requisitions, setRequisitions] = useState<LabourRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<LabourRequisition | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const perPage = 15;

  // Tab counts state
  const [tabCounts, setTabCounts] = useState<Record<TabType, number>>({
    pending: 0,
    approved: 0,
    rejected: 0
  });

  // Fetch counts for all tabs
  const fetchTabCounts = async () => {
    try {
      const results = await Promise.all([
        labourService.getPendingRequisitions('pending'),
        labourService.getPendingRequisitions('approved'),
        labourService.getPendingRequisitions('rejected')
      ]);

      setTabCounts({
        pending: results[0].success ? results[0].data.length : 0,
        approved: results[1].success ? results[1].data.length : 0,
        rejected: results[2].success ? results[2].data.length : 0
      });
    } catch (error) {
      console.error('Failed to fetch tab counts:', error);
    }
  };

  const fetchRequisitions = async () => {
    setLoading(true);
    try {
      const result = await labourService.getPendingRequisitions(activeTab, undefined, currentPage, perPage);
      if (result.success) {
        setRequisitions(result.data);
        setPagination(result.pagination);
      } else {
        showError(result.message || 'Failed to fetch requisitions');
      }
    } catch {
      showError('Failed to fetch requisitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when changing tabs
  }, [activeTab]);

  useEffect(() => {
    fetchRequisitions();
    fetchTabCounts();
  }, [activeTab, currentPage]);

  const handleApprove = async (requisitionId: number) => {
    setProcessing(requisitionId);
    const result = await labourService.approveRequisition(requisitionId);
    if (result.success) {
      showSuccess('Requisition approved successfully');
      fetchRequisitions();
      fetchTabCounts(); // Refresh counts
    } else {
      showError(result.message || 'Failed to approve requisition');
    }
    setProcessing(null);
  };

  const handleReject = async () => {
    if (!rejectingId || !rejectionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }

    setProcessing(rejectingId);
    const result = await labourService.rejectRequisition(rejectingId, rejectionReason);
    if (result.success) {
      showSuccess('Requisition rejected');
      setShowRejectModal(false);
      setRejectingId(null);
      setRejectionReason('');
      fetchRequisitions();
      fetchTabCounts(); // Refresh counts
    } else {
      showError(result.message || 'Failed to reject requisition');
    }
    setProcessing(null);
  };

  const openRejectModal = (requisitionId: number) => {
    setRejectingId(requisitionId);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleViewDetails = (req: LabourRequisition) => {
    setSelectedRequisition(req);
    setShowDetailsModal(true);
  };

  const getStatusBadge = (status: string, assignmentStatus?: string) => {
    if (status === 'approved' && assignmentStatus === 'assigned') {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
          <UsersIcon className="w-3 h-3" /> Assigned
        </span>
      );
    }
    switch (status) {
      case 'pending':
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
            <ClockIcon className="w-3 h-3" /> Pending Review
          </span>
        );
      case 'approved':
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 flex items-center gap-1">
            <XCircleIcon className="w-3 h-3" /> Rejected
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Requisition Approvals</h1>
        <p className="text-gray-600">Review and approve labour requisitions from Site Engineers</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                isActive
                  ? `${tab.bgColor} ${tab.color} border-b-2 ${tab.borderColor}`
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                  isActive ? 'bg-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Requisitions List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : requisitions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No {activeTab} requisitions</h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'pending'
              ? 'All requisitions have been reviewed.'
              : `No requisitions with ${activeTab} status.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requisitions.map((req) => (
            <motion.div
              key={req.requisition_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg border border-gray-200 px-6 py-6 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-semibold text-gray-900 text-sm">{req.requisition_code}</span>
                  {getStatusBadge(req.status, req.assignment_status)}
                  <span className="text-xs text-gray-400 hidden sm:inline">|</span>
                  {req.labour_items && req.labour_items.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {Array.from(new Set(req.labour_items.map((item: any) => item.skill_required))).map((skill: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">{req.skill_required}</span>
                  )}
                  <span className="text-xs text-gray-600"><UsersIcon className="w-3 h-3 inline mr-0.5" />{req.workers_count || req.total_workers_count}</span>
                  <span className="text-xs text-gray-500 hidden md:inline">
                    <CalendarIcon className="w-3 h-3 inline mr-0.5" />
                    {new Date(req.required_date).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-gray-400 truncate hidden lg:inline">{req.project_name || `#${req.project_id}`}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleViewDetails(req)}
                    className="flex items-center justify-center gap-1 px-2 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    <EyeIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">View</span>
                  </button>
                  {activeTab === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(req.requisition_id)}
                        disabled={processing === req.requisition_id}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {processing === req.requisition_id ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        ) : (
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">Approve</span>
                      </button>
                      <button
                        onClick={() => openRejectModal(req.requisition_id)}
                        disabled={processing === req.requisition_id}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <XCircleIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Reject</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-between bg-white px-4 py-3 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Showing <span className="font-medium">{(currentPage - 1) * perPage + 1}</span> to{' '}
              <span className="font-medium">{Math.min(currentPage * perPage, pagination.total)}</span> of{' '}
              <span className="font-medium">{pagination.total}</span> results
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => {
                // Show first page, last page, current page, and pages around current
                const showPage =
                  page === 1 ||
                  page === pagination.pages ||
                  (page >= currentPage - 1 && page <= currentPage + 1);

                if (!showPage) {
                  // Show ellipsis
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
                        ? 'bg-teal-600 text-white font-medium'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
              disabled={currentPage === pagination.pages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showDetailsModal && selectedRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedRequisition.requisition_code}</h2>
                <p className="text-sm text-gray-500">Requisition Details</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Status Row */}
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                <span className="text-sm text-gray-500">Status:</span>
                <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                  {selectedRequisition.status === 'pending' && 'Pending Approval'}
                  {selectedRequisition.status === 'approved' && 'Approved'}
                  {selectedRequisition.status === 'rejected' && 'Rejected'}
                </span>
                {selectedRequisition.assignment_status === 'assigned' && (
                  <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                    Workers Assigned
                  </span>
                )}
              </div>

              {selectedRequisition.rejection_reason && (
                <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Rejection Reason:</span> {selectedRequisition.rejection_reason}
                  </p>
                </div>
              )}

              {/* Details Grid */}
              <div className="space-y-6">
                {/* Work Description Section */}
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Work Description</h3>
                  <p className="text-sm text-gray-900">{selectedRequisition.work_description}</p>
                </div>

                {/* Labour Items Section - Only show if multiple items exist */}
                {selectedRequisition.labour_items && selectedRequisition.labour_items.length > 0 && (() => {
                  // Distribute assigned workers across labour items based on workers_count
                  let workerIndex = 0;
                  return (
                    <div className="border-b border-gray-100 pb-6">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Labour Items</h3>
                      <div className="space-y-3">
                        {selectedRequisition.labour_items.map((item: any, idx: number) => {
                          // Get the workers for this specific item based on workers_count
                          const itemWorkers = selectedRequisition.assigned_workers
                            ? selectedRequisition.assigned_workers.slice(workerIndex, workerIndex + item.workers_count)
                            : [];
                          workerIndex += item.workers_count;

                          return (
                            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4">
                              <div className="flex items-start justify-between mb-2">
                                <p className="text-sm font-medium text-gray-900">{item.work_description}</p>
                                <span className="ml-3 px-3 py-1 bg-blue-50 text-blue-600 text-sm font-semibold rounded-md whitespace-nowrap">
                                  {item.workers_count} worker{item.workers_count !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">
                                <span className="font-medium">Skill:</span> {item.skill_required}
                              </p>

                              {/* Show assigned workers for this specific item */}
                              {selectedRequisition.assignment_status === 'assigned' && itemWorkers.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                                    Assigned Workers ({itemWorkers.length})
                                  </p>
                                  <div className="space-y-1.5">
                                    {itemWorkers.map((worker: any, widx: number) => (
                                      <div key={widx} className="flex items-center justify-between bg-green-50 px-3 py-2 rounded-md">
                                        <span className="text-sm text-gray-900">{worker.full_name}</span>
                                        <span className="text-xs font-medium text-green-700">{worker.worker_code}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Project</h3>
                    <p className="text-gray-900">{selectedRequisition.project_name || `#${selectedRequisition.project_id}`}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Site</h3>
                    <p className="text-gray-900">{selectedRequisition.site_name}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total Workers</h3>
                    <p className="text-gray-900 font-medium">{selectedRequisition.total_workers_count || selectedRequisition.workers_count} worker(s)</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Required Date</h3>
                    <p className="text-gray-900">{new Date(selectedRequisition.required_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Request Date</h3>
                    <p className="text-gray-900">{new Date(selectedRequisition.request_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Requested By</h3>
                    <p className="text-gray-900">{selectedRequisition.requested_by_name}</p>
                  </div>
                  {selectedRequisition.status !== 'pending' && selectedRequisition.approved_by_name && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        {selectedRequisition.status === 'approved' ? 'Approved By' : 'Rejected By'}
                      </h3>
                      <p className="text-gray-900">{selectedRequisition.approved_by_name}</p>
                      {selectedRequisition.approval_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(selectedRequisition.approval_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedRequisition.assignment_status === 'assigned' && selectedRequisition.assignment_date && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Assignment Date</h3>
                      <p className="text-gray-900">{new Date(selectedRequisition.assignment_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 p-4 border-t border-gray-200 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Close
              </button>
              {selectedRequisition.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      handleApprove(selectedRequisition.requisition_id);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      openRejectModal(selectedRequisition.requisition_id);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-md w-full"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-red-600">Reject Requisition</h2>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                placeholder="Please provide a reason for rejection..."
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectionReason.trim() || processing !== null}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Reject Requisition
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default RequisitionApprovals;
