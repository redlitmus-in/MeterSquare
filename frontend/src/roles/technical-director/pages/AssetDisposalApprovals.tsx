import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  Package,
  AlertTriangle,
  Trash2,
  Eye,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Image as ImageIcon,
  Wrench,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  getAssetDisposalRequests,
  approveAssetDisposal,
  rejectAssetDisposal,
  getAssetDisposalDetail,
  type DisposalStatus
} from '@/roles/production-manager/services/assetDnService';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { PAGINATION } from '@/lib/constants';

interface AssetDisposal {
  disposal_id: number;
  return_item_id?: number;
  category_id?: number;
  asset_item_id?: number;
  quantity: number;
  disposal_reason: string;
  justification?: string;
  estimated_value: number;
  image_url?: string;
  image_filename?: string;
  requested_by: string;
  requested_by_id?: number;
  requested_at: string;
  status: DisposalStatus;
  reviewed_by?: string;
  reviewed_by_id?: number;
  reviewed_at?: string;
  review_notes?: string;
  source_type: string;
  source_ardn_id?: number;
  project_id?: number;
  category_name?: string;
  category_code?: string;
  item_name?: string;
  serial_number?: string;
  project_name?: string;
}

const AssetDisposalApprovals: React.FC = () => {
  const [disposalRequests, setDisposalRequests] = useState<AssetDisposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedDisposal, setSelectedDisposal] = useState<AssetDisposal | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectAction, setRejectAction] = useState<'return_to_stock' | 'send_to_repair' | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchDisposalRequests();
  }, []);

  const fetchDisposalRequests = async () => {
    setLoading(true);
    try {
      // Fetch all statuses
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        getAssetDisposalRequests('pending_review'),
        getAssetDisposalRequests('approved'),
        getAssetDisposalRequests('rejected')
      ]);

      const allDisposals = [
        ...(pendingRes || []),
        ...(approvedRes || []),
        ...(rejectedRes || [])
      ];

      setDisposalRequests(allDisposals);
    } catch (error) {
      console.error('Error fetching asset disposal requests:', error);
      showError('Failed to load asset disposal requests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests = useMemo(() => {
    let filtered = [...disposalRequests];

    // Status filter
    if (statusFilter === 'pending') {
      filtered = filtered.filter(req => req.status === 'pending_review');
    } else if (statusFilter === 'approved') {
      filtered = filtered.filter(req => req.status === 'approved');
    } else if (statusFilter === 'rejected') {
      filtered = filtered.filter(req => req.status === 'rejected');
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(req => {
        const categoryName = req.category_name || '';
        const categoryCode = req.category_code || '';
        const itemName = req.item_name || '';
        const requestedBy = req.requested_by || '';

        return (
          categoryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          categoryCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          requestedBy.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    return filtered;
  }, [searchTerm, statusFilter, disposalRequests]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm]);

  // Pagination calculations
  const totalRecords = filteredRequests.length;
  const totalPages = Math.ceil(totalRecords / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredRequests.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredRequests, currentPage]);

  const handleViewDetails = async (disposal: AssetDisposal) => {
    try {
      // Fetch full details - service returns the disposal object directly
      const detail = await getAssetDisposalDetail(disposal.disposal_id);
      setSelectedDisposal(detail || disposal);
      setReviewNotes('');
      setRejectAction(null);
      setShowDetailModal(true);
    } catch (error) {
      // Fall back to basic info
      setSelectedDisposal(disposal);
      setReviewNotes('');
      setRejectAction(null);
      setShowDetailModal(true);
    }
  };

  const handleApproveClick = () => {
    if (!selectedDisposal) return;
    setShowConfirmModal(true);
  };

  const handleConfirmApproval = async () => {
    if (!selectedDisposal) return;

    setShowConfirmModal(false);
    setSaving(true);
    try {
      await approveAssetDisposal(selectedDisposal.disposal_id, reviewNotes || undefined);

      setShowDetailModal(false);
      setSelectedDisposal(null);
      setReviewNotes('');
      await fetchDisposalRequests();

      showSuccess('Asset disposal approved successfully. Asset quantity has been reduced from inventory.');
    } catch (error) {
      console.error('Error approving disposal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to approve disposal request';
      showError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedDisposal) return;

    if (!rejectAction) {
      showError('Please select what should happen to the asset');
      return;
    }

    if (!reviewNotes.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }

    setSaving(true);
    try {
      await rejectAssetDisposal(selectedDisposal.disposal_id, reviewNotes, rejectAction);

      setShowDetailModal(false);
      setSelectedDisposal(null);
      setReviewNotes('');
      await fetchDisposalRequests();

      const actionText = rejectAction === 'return_to_stock'
        ? 'Asset has been returned to available stock.'
        : 'Asset has been sent to repair queue.';
      showSuccess(`Disposal request rejected. ${actionText}`);
    } catch (error) {
      console.error('Error rejecting disposal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to reject disposal request';
      showError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  const getDisposalReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      'damaged': 'Damaged',
      'unrepairable': 'Unrepairable',
      'obsolete': 'Obsolete',
      'lost': 'Lost',
      'expired': 'Expired',
      'other': 'Other'
    };
    return labels[reason] || reason.replace(/_/g, ' ').toUpperCase();
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      'repair': 'From Repair Queue',
      'catalog': 'From Catalog',
      'return': 'From Return'
    };
    return labels[source] || source;
  };

  const pendingCount = disposalRequests.filter(req => req.status === 'pending_review').length;
  const approvedCount = disposalRequests.filter(req => req.status === 'approved').length;
  const rejectedCount = disposalRequests.filter(req => req.status === 'rejected').length;
  const totalValue = disposalRequests
    .filter(req => req.status === 'pending_review')
    .reduce((sum, req) => sum + (req.estimated_value || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ModernLoadingSpinners size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading asset disposal requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-3 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                Asset Disposal Approvals
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Review and approve disposal requests for returnable assets (tools, equipment, etc.)
              </p>
            </div>
            <button
              onClick={fetchDisposalRequests}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <XCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Rejected</p>
                <p className="text-2xl font-bold text-yellow-600">{rejectedCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pending Value</p>
                <p className="text-2xl font-bold text-red-600">AED {totalValue.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Status Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === 'pending'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setStatusFilter('approved')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === 'approved'
                    ? 'bg-white text-green-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Approved ({approvedCount})
              </button>
              <button
                onClick={() => setStatusFilter('rejected')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === 'rejected'
                    ? 'bg-white text-yellow-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Rejected ({rejectedCount})
              </button>
            </div>

            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by asset name, code, or requester..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Disposal Requests Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Asset
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Est. Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Requested By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginatedRequests.length > 0 ? (
                  paginatedRequests.map((request) => (
                    <tr key={request.disposal_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {request.category_name || request.item_name || 'N/A'}
                          </p>
                          <p className="text-xs font-mono text-gray-500">
                            {request.category_code || request.serial_number || 'N/A'}
                          </p>
                          {request.image_url && (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 mt-1">
                              <ImageIcon className="w-3 h-3" />
                              Has Image
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-red-600">
                          {request.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          AED {request.estimated_value?.toLocaleString() || '0'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {getDisposalReasonLabel(request.disposal_reason)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {getSourceLabel(request.source_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{request.requested_by || 'Unknown'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          {request.requested_at ? new Date(request.requested_at).toLocaleDateString() : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(request.status)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleViewDetails(request)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                          title="View full details and take action"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-1">No disposal requests found</h3>
                      <p className="text-sm text-gray-500">
                        {searchTerm
                          ? 'Try adjusting your search'
                          : `No ${statusFilter} asset disposal requests found`}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalRecords > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} to {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, totalRecords)} of {totalRecords} asset disposal requests
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page
                            ? 'bg-red-600 text-white'
                            : 'border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  } else if (
                    page === currentPage - 2 ||
                    page === currentPage + 2
                  ) {
                    return <span key={page} className="px-1">...</span>;
                  }
                  return null;
                })}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedDisposal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Asset Disposal Request</h2>
                  <p className="text-sm text-gray-500 mt-1">Review details and approve/reject the disposal</p>
                </div>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedDisposal(null);
                    setReviewNotes('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Status Banner */}
                {selectedDisposal.status === 'pending_review' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h3 className="font-semibold text-orange-900">Pending Your Review</h3>
                        <p className="text-sm text-orange-700 mt-1">
                          This asset disposal request requires your approval before the asset quantity can be reduced from inventory.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Asset Details */}
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    Asset Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Asset Category</p>
                      <p className="text-base font-semibold text-gray-900 mt-1">
                        {selectedDisposal.category_name || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Category Code</p>
                      <p className="text-base font-mono text-gray-900 mt-1">
                        {selectedDisposal.category_code || 'N/A'}
                      </p>
                    </div>
                    {selectedDisposal.item_name && (
                      <div>
                        <p className="text-sm font-medium text-gray-600">Item Name</p>
                        <p className="text-base text-gray-900 mt-1">
                          {selectedDisposal.item_name}
                        </p>
                      </div>
                    )}
                    {selectedDisposal.serial_number && (
                      <div>
                        <p className="text-sm font-medium text-gray-600">Serial Number</p>
                        <p className="text-base font-mono text-gray-900 mt-1">
                          {selectedDisposal.serial_number}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Disposal Request Details */}
                <div className="bg-red-50 rounded-lg p-6 border border-red-200">
                  <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-600" />
                    Disposal Request Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm font-medium text-red-700">Quantity to Dispose</p>
                      <p className="text-xl font-bold text-red-900 mt-1">
                        {selectedDisposal.quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700">Estimated Value</p>
                      <p className="text-xl font-bold text-red-900 mt-1">
                        AED {selectedDisposal.estimated_value?.toLocaleString() || '0'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700">Source</p>
                      <p className="text-base text-red-900 mt-1">
                        {getSourceLabel(selectedDisposal.source_type)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700">Disposal Reason</p>
                      <p className="text-base text-red-900 mt-1">
                        {getDisposalReasonLabel(selectedDisposal.disposal_reason)}
                      </p>
                    </div>
                  </div>

                  {/* Justification */}
                  {selectedDisposal.justification && (
                    <div className="pt-4 border-t border-red-200">
                      <p className="text-sm font-medium text-red-700 mb-2">Justification</p>
                      <div className="bg-white rounded-lg p-4 border border-red-200">
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">
                          {selectedDisposal.justification}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Disposal Image */}
                  {selectedDisposal.image_url && (
                    <div className="pt-4 border-t border-red-200">
                      <p className="text-sm font-medium text-red-700 mb-2">Disposal Evidence Image</p>
                      <div className="bg-white rounded-lg p-2 border border-red-200">
                        <img
                          src={selectedDisposal.image_url}
                          alt="Disposal evidence"
                          className="max-h-48 w-auto mx-auto rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setShowImageModal(true)}
                        />
                        <p className="text-xs text-center text-gray-500 mt-2">
                          Click to view full size
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Requester Information */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">Request Information</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-blue-700">Requested By:</span>
                      <span className="ml-2 font-medium text-blue-900">{selectedDisposal.requested_by || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-blue-700">Request Date:</span>
                      <span className="ml-2 font-medium text-blue-900">
                        {selectedDisposal.requested_at ? new Date(selectedDisposal.requested_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-700">Reference:</span>
                      <span className="ml-2 font-mono text-blue-900">
                        ADISP-{selectedDisposal.disposal_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-700">Status:</span>
                      <span className="ml-2">{getStatusBadge(selectedDisposal.status)}</span>
                    </div>
                  </div>
                </div>

                {/* Review Notes - Only show if pending */}
                {selectedDisposal.status === 'pending_review' && (
                  <>
                    {/* Reject Action Selection */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-sm font-medium text-gray-700">
                        To Reject:
                      </label>
                      <select
                        value={rejectAction || ''}
                        onChange={(e) => setRejectAction(e.target.value === '' ? null : e.target.value as 'return_to_stock' | 'send_to_repair')}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">-- Select action --</option>
                        <option value="return_to_stock">Return to Stock</option>
                        <option value="send_to_repair">Send to Repair</option>
                      </select>
                      {rejectAction && (
                        <span className="text-xs text-yellow-600">
                          (Approve disabled)
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Your Review Notes {!reviewNotes.trim() && <span className="text-red-500">(Required for rejection)</span>}
                      </label>
                      <textarea
                        rows={4}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Add your review comments here... (optional for approval, required for rejection)"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-4 pt-6 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setShowDetailModal(false);
                          setSelectedDisposal(null);
                          setReviewNotes('');
                        }}
                        className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                      >
                        Cancel
                      </button>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleReject}
                          disabled={saving || !rejectAction}
                          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg transition-colors font-medium ${
                            saving || !rejectAction
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-yellow-600 text-white hover:bg-yellow-700'
                          }`}
                          title={!rejectAction ? 'Select rejection action first' : 'Reject this disposal request'}
                        >
                          {saving ? (
                            <>
                              <ModernLoadingSpinners size="xs" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <ThumbsDown className="w-5 h-5" />
                              Reject Disposal
                            </>
                          )}
                        </button>

                        <button
                          onClick={handleApproveClick}
                          disabled={saving || !!rejectAction}
                          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg transition-colors font-medium shadow-sm ${
                            saving || rejectAction
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                          title={rejectAction ? 'Clear rejection selection to enable approval' : 'Approve this disposal request'}
                        >
                          {saving ? (
                            <>
                              <ModernLoadingSpinners size="xs" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <ThumbsUp className="w-5 h-5" />
                              Approve Disposal
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Warning Note */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-yellow-800">
                          <p className="font-semibold">Important:</p>
                          <ul className="mt-2 ml-4 list-disc space-y-1">
                            <li><strong>Approve Disposal:</strong> The asset quantity will be permanently reduced from inventory stock.</li>
                            <li><strong>Reject (Return to Stock):</strong> The asset will be returned to available inventory.</li>
                            <li><strong>Reject (Send to Repair):</strong> The asset will be sent back to the repair queue for further assessment.</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Show review details if already reviewed */}
                {selectedDisposal.status !== 'pending_review' && selectedDisposal.reviewed_by && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Review Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Reviewed By:</span>
                        <span className="ml-2 font-medium text-gray-900">{selectedDisposal.reviewed_by}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Review Date:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {selectedDisposal.reviewed_at ? new Date(selectedDisposal.reviewed_at).toLocaleString() : 'N/A'}
                        </span>
                      </div>
                      {selectedDisposal.review_notes && (
                        <div className="col-span-2">
                          <span className="text-gray-600">Review Notes:</span>
                          <p className="mt-1 text-gray-900">{selectedDisposal.review_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && selectedDisposal?.image_url && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4"
          onClick={() => setShowImageModal(false)}
        >
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={selectedDisposal.image_url}
              alt="Disposal evidence"
              className="max-h-[80vh] w-auto mx-auto rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedDisposal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-red-50 px-6 py-4 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-red-900">Confirm Asset Disposal</h3>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-gray-700 mb-4">
                Are you sure you want to approve disposal of:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-lg font-bold text-gray-900">
                  {selectedDisposal.quantity} units
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedDisposal.category_name || selectedDisposal.item_name || 'Asset'}
                </p>
              </div>
              <div className="flex items-start gap-2 bg-red-50 rounded-lg p-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  This will <strong>permanently reduce</strong> inventory stock and <strong>cannot be undone</strong>.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApproval}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <ModernLoadingSpinners size="xs" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Yes, Approve Disposal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetDisposalApprovals;
