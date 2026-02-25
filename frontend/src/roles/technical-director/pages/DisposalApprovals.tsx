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
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { inventoryService } from '@/roles/production-manager/services/inventoryService';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { PAGINATION } from '@/lib/constants';

interface MaterialReturn {
  return_id: number;
  inventory_material_id: number;
  project_id: number;
  quantity: number;
  condition: string;
  return_reason: string;
  notes: string;
  disposal_status: string;
  disposal_value: number;
  created_at: string;
  created_by: string;
  reference_number?: string;
  material_name?: string;
  material_code?: string;
  unit?: string;
  material_details?: {
    material_name: string;
    material_code: string;
    brand?: string;
    unit: string;
    current_stock: number;
  };
  project_details?: {
    project_id: number;
    project_name: string;
    project_code: string;
  };
}

const DisposalApprovals: React.FC = () => {
  const [disposalRequests, setDisposalRequests] = useState<MaterialReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedDisposal, setSelectedDisposal] = useState<MaterialReturn | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchDisposalRequests();
  }, []);

  const fetchDisposalRequests = async () => {
    setLoading(true);
    try {
      const response = await inventoryService.getAllMaterialReturns();
      const returns = response?.returns || [];

      // Filter disposal requests:
      // 1. Catalog disposals (project_id = 0 or return_reason contains CATALOG_DISPOSAL)
      // 2. RDN disposals with disposal-related statuses
      const disposals = returns.filter((ret: MaterialReturn) =>
        ret.return_reason?.includes('CATALOG_DISPOSAL') ||
        ret.project_id === 0 ||
        ret.disposal_status === 'pending_review' ||
        ret.disposal_status === 'approved_disposal' ||
        ret.disposal_status === 'disposed' ||
        ret.disposal_status === 'rejected' ||
        ret.disposal_status === 'backup_added'
      );

      setDisposalRequests(disposals);
    } catch (error) {
      console.error('Error fetching disposal requests:', error);
      showError('Failed to load disposal requests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Use useMemo for better performance instead of useEffect
  const filteredRequests = useMemo(() => {
    let filtered = [...disposalRequests];

    // Status filter
    if (statusFilter === 'pending') {
      filtered = filtered.filter(req => req.disposal_status === 'pending_review');
    } else if (statusFilter === 'approved') {
      filtered = filtered.filter(req => req.disposal_status === 'approved_disposal' || req.disposal_status === 'disposed');
    } else if (statusFilter === 'rejected') {
      filtered = filtered.filter(req => req.disposal_status === 'rejected' || req.disposal_status === 'repaired' || req.disposal_status === 'backup_added');
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(req => {
        const materialName = req.material_name || req.material_details?.material_name || '';
        const materialCode = req.material_code || req.material_details?.material_code || '';
        const createdBy = req.created_by || '';

        return (
          materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          materialCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          createdBy.toLowerCase().includes(searchTerm.toLowerCase())
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

  const handleViewDetails = (disposal: MaterialReturn) => {
    setSelectedDisposal(disposal);
    setReviewNotes('');
    setShowDetailModal(true);
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
      await inventoryService.reviewDisposal(selectedDisposal.return_id, {
        action: 'approve',
        notes: reviewNotes || undefined
      });

      setShowDetailModal(false);
      setSelectedDisposal(null);
      setReviewNotes('');
      await fetchDisposalRequests();

      showSuccess('Disposal request approved successfully. Material quantity has been reduced from inventory.');
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

    if (!reviewNotes.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }

    setSaving(true);
    try {
      await inventoryService.reviewDisposal(selectedDisposal.return_id, {
        action: 'backup',
        usable_quantity: selectedDisposal.quantity, // Add full quantity to backup
        notes: reviewNotes
      });

      setShowDetailModal(false);
      setSelectedDisposal(null);
      setReviewNotes('');
      await fetchDisposalRequests();

      showSuccess('Disposal request rejected. Material has been added to backup stock.');
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
      case 'approved_disposal':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        );
      case 'disposed':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <Trash2 className="w-3 h-3" />
            Disposed
          </span>
        );
      case 'rejected':
      case 'repaired':
      case 'backup_added':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <XCircle className="w-3 h-3" />
            {status === 'backup_added' ? 'Backup Added' : 'Rejected'}
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  const pendingCount = disposalRequests.filter(req => req.disposal_status === 'pending_review').length;
  const approvedCount = disposalRequests.filter(req =>
    req.disposal_status === 'approved_disposal' || req.disposal_status === 'disposed'
  ).length;
  const rejectedCount = disposalRequests.filter(req =>
    req.disposal_status === 'rejected' || req.disposal_status === 'repaired' || req.disposal_status === 'backup_added'
  ).length;
  const totalValue = disposalRequests
    .filter(req => req.disposal_status === 'pending_review')
    .reduce((sum, req) => sum + (req.disposal_value || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ModernLoadingSpinners size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading disposal requests...</p>
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
                Material Disposal Approvals
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Review and approve disposal requests for damaged, expired, or wasted materials
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
                  placeholder="Search by material name, code, or requester..."
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
                    Material
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Estimated Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Reason
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
                    <tr key={request.return_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {request.material_name || request.material_details?.material_name || 'N/A'}
                          </p>
                          <p className="text-xs font-mono text-gray-500">
                            {request.material_code || request.material_details?.material_code || 'N/A'}
                          </p>
                          {request.material_details?.brand && (
                            <p className="text-xs text-gray-500 mt-0.5">{request.material_details.brand}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-red-600">
                          {request.quantity} {request.unit || request.material_details?.unit || ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          AED {request.disposal_value?.toLocaleString() || '0.00'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {request.return_reason?.replace('CATALOG_DISPOSAL: ', '').replace(/_/g, ' ').toUpperCase() || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{request.created_by || 'Unknown'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          {request.created_at ? new Date(request.created_at).toLocaleDateString() : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(request.disposal_status)}
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
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-1">No disposal requests found</h3>
                      <p className="text-sm text-gray-500">
                        {searchTerm
                          ? 'Try adjusting your search'
                          : `No ${statusFilter} disposal requests found`}
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
              Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} to {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, totalRecords)} of {totalRecords} disposal requests
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
                  <h2 className="text-2xl font-bold text-gray-900">Material Disposal Request</h2>
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
                {selectedDisposal.disposal_status === 'pending_review' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h3 className="font-semibold text-orange-900">Pending Your Review</h3>
                        <p className="text-sm text-orange-700 mt-1">
                          This disposal request requires your approval before the material quantity can be reduced from inventory.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Material Details */}
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    Material Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Material Name</p>
                      <p className="text-base font-semibold text-gray-900 mt-1">
                        {selectedDisposal.material_name || selectedDisposal.material_details?.material_name || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Material Code</p>
                      <p className="text-base font-mono text-gray-900 mt-1">
                        {selectedDisposal.material_code || selectedDisposal.material_details?.material_code || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Brand</p>
                      <p className="text-base text-gray-900 mt-1">
                        {selectedDisposal.material_details?.brand || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Current Stock</p>
                      <p className="text-base font-semibold text-blue-600 mt-1">
                        {selectedDisposal.material_details?.current_stock?.toFixed(2) || '0'} {selectedDisposal.unit || selectedDisposal.material_details?.unit || ''}
                      </p>
                    </div>
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
                        {selectedDisposal.quantity} {selectedDisposal.unit || selectedDisposal.material_details?.unit || ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700">Estimated Value</p>
                      <p className="text-xl font-bold text-red-900 mt-1">
                        AED {selectedDisposal.disposal_value?.toLocaleString() || '0.00'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700">Source</p>
                      <p className="text-base text-red-900 mt-1">
                        {selectedDisposal.project_details?.project_name || 'Materials Catalog'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700">Disposal Reason</p>
                      <p className="text-base text-red-900 mt-1">
                        {selectedDisposal.return_reason?.replace('CATALOG_DISPOSAL: ', '').replace(/_/g, ' ').toUpperCase() || 'Damaged'}
                      </p>
                    </div>
                  </div>

                  {/* Justification */}
                  <div className="pt-4 border-t border-red-200">
                    <p className="text-sm font-medium text-red-700 mb-2">Justification / Notes</p>
                    <div className="bg-white rounded-lg p-4 border border-red-200">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {selectedDisposal.notes || selectedDisposal.return_reason || 'No additional notes provided'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Requester Information */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">Request Information</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-blue-700">Requested By:</span>
                      <span className="ml-2 font-medium text-blue-900">{selectedDisposal.created_by || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-blue-700">Request Date:</span>
                      <span className="ml-2 font-medium text-blue-900">
                        {selectedDisposal.created_at ? new Date(selectedDisposal.created_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-700">Reference:</span>
                      <span className="ml-2 font-mono text-blue-900">
                        {selectedDisposal.reference_number || `RET-${selectedDisposal.return_id}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-700">Status:</span>
                      <span className="ml-2">{getStatusBadge(selectedDisposal.disposal_status)}</span>
                    </div>
                  </div>
                </div>

                {/* Review Notes - Only show if pending */}
                {selectedDisposal.disposal_status === 'pending_review' && (
                  <>
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
                          disabled={saving}
                          className="inline-flex items-center gap-2 px-6 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {saving ? (
                            <>
                              <ModernLoadingSpinners size="xs" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <ThumbsDown className="w-5 h-5" />
                              Reject & Add to Backup
                            </>
                          )}
                        </button>

                        <button
                          onClick={handleApproveClick}
                          disabled={saving}
                          className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
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
                            <li><strong>Approve Disposal:</strong> The material quantity will be permanently reduced from inventory stock.</li>
                            <li><strong>Reject & Add to Backup:</strong> The material will be marked for repair/reuse and added to backup stock.</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
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
                <h3 className="text-lg font-semibold text-red-900">Confirm Disposal</h3>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-gray-700 mb-4">
                Are you sure you want to approve disposal of:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-lg font-bold text-gray-900">
                  {selectedDisposal.quantity} {selectedDisposal.unit || selectedDisposal.material_details?.unit || 'units'}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedDisposal.material_name || selectedDisposal.material_details?.material_name || 'Material'}
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

export default DisposalApprovals;
