/**
 * Material Disposal Page
 * Shows materials sent for disposal awaiting TD approval
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  Search,
  RefreshCw,
  Clock,
  X,
  Eye,
  AlertTriangle,
  Package,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { inventoryService, MaterialReturn } from '../services/inventoryService';
import { showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { PAGINATION } from '@/lib/inventoryConstants';

const MaterialDisposalPage: React.FC = () => {
  const [disposalItems, setDisposalItems] = useState<MaterialReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<MaterialReturn | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchDisposalItems();
  }, []);

  const fetchDisposalItems = async () => {
    setLoading(true);
    try {
      const response = await inventoryService.getAllMaterialReturns();
      const returns = response?.returns || [];

      // Filter items with pending_review or approved_disposal status
      const disposals = returns.filter((ret: MaterialReturn) =>
        ret.disposal_status === 'pending_review' || ret.disposal_status === 'approved_disposal'
      );

      setDisposalItems(disposals);
    } catch (error) {
      console.error('Error fetching disposal items:', error);
      showError('Failed to load disposal items. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter by tab and search
  const filteredItems = useMemo(() => {
    // First filter by tab
    let items = disposalItems.filter(item => {
      if (activeTab === 'pending') {
        return item.disposal_status === 'pending_review';
      } else {
        return item.disposal_status === 'approved_disposal';
      }
    });

    // Then filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(item => {
        const materialName = item.material_name || '';
        const materialCode = item.material_code || '';
        const refNumber = item.reference_number || '';
        return (
          materialName.toLowerCase().includes(term) ||
          materialCode.toLowerCase().includes(term) ||
          refNumber.toLowerCase().includes(term)
        );
      });
    }

    return items;
  }, [disposalItems, searchTerm, activeTab]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredItems.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredItems.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredItems, currentPage]);

  // Reset page when tab or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  // Clamp page when total pages decreases
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Count items by status
  const pendingCount = disposalItems.filter(item => item.disposal_status === 'pending_review').length;
  const approvedCount = disposalItems.filter(item => item.disposal_status === 'approved_disposal').length;

  const handleViewDetails = (item: MaterialReturn) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const getConditionBadge = (condition: string) => {
    const styles: Record<string, string> = {
      'Damaged': 'bg-orange-100 text-orange-800 border-orange-200',
      'Defective': 'bg-red-100 text-red-800 border-red-200',
      'Good': 'bg-green-100 text-green-800 border-green-200'
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[condition] || 'bg-gray-100 text-gray-800'}`}>
        {condition}
      </span>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Trash2 className="w-8 h-8 text-red-600" />
                Material Disposal
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Materials awaiting Technical Director approval for disposal
              </p>
            </div>
            <button
              onClick={fetchDisposalItems}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'pending'
                  ? 'bg-amber-50 text-amber-700 border-b-2 border-amber-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Pending TD Approval</span>
                {pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                    {pendingCount}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`px-4 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${
                activeTab === 'approved'
                  ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                <span>TD Approved - Ready for Disposal</span>
                {approvedCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                    {approvedCount}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-center">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by material name, code, or RDN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <ModernLoadingSpinners size="sm" className="mx-auto mb-4" />
              <p className="text-gray-500">Loading disposal items...</p>
            </div>
          ) : paginatedItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-red-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Material
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Condition
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Source RDN
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Requested
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedItems.map((item) => (
                    <tr key={item.return_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">
                          {item.material_name || 'Unknown Material'}
                        </p>
                        <p className="text-xs text-gray-500">{item.material_code}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-semibold text-gray-900">
                          {item.quantity} {item.unit}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {getConditionBadge(item.condition)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {item.reference_number || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {item.project_details?.project_name || item.project_details?.project_code || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500">
                          {formatDate(item.created_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.disposal_status === 'pending_review' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" />
                            Awaiting TD
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Trash2 className="w-3 h-3" />
                            TD Approved
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleViewDetails(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No disposal requests</h3>
              <p className="text-sm text-gray-500">
                {searchTerm
                  ? 'Try adjusting your search'
                  : activeTab === 'pending'
                  ? 'No materials pending TD disposal approval'
                  : 'No TD-approved materials awaiting disposal'}
              </p>
            </div>
          )}

          {/* Pagination */}
          {filteredItems.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, filteredItems.length)} of {filteredItems.length} disposal requests
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-red-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Disposal Request Details</h3>
                  <p className="text-sm text-gray-500">{selectedItem.reference_number}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedItem(null);
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Material Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Material Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Material Name</p>
                    <p className="font-medium text-gray-900">{selectedItem.material_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Material Code</p>
                    <p className="font-medium text-gray-900">{selectedItem.material_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Quantity</p>
                    <p className="font-medium text-gray-900">{selectedItem.quantity} {selectedItem.unit}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Condition</p>
                    {getConditionBadge(selectedItem.condition)}
                  </div>
                </div>
              </div>

              {/* Disposal Reason */}
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <h4 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Disposal Details
                </h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-red-700">Return Reason</p>
                    <p className="text-sm text-red-900">{selectedItem.return_reason || 'No reason provided'}</p>
                  </div>
                  {selectedItem.disposal_notes && (
                    <div>
                      <p className="text-xs text-red-700">Disposal Notes</p>
                      <p className="text-sm text-red-900">{selectedItem.disposal_notes}</p>
                    </div>
                  )}
                  {selectedItem.notes && (
                    <div>
                      <p className="text-xs text-red-700">Additional Notes</p>
                      <p className="text-sm text-red-900">{selectedItem.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Source Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 mb-1">Source RDN</p>
                  <p className="font-medium text-blue-900">{selectedItem.reference_number || '-'}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-xs text-purple-600 mb-1">Project</p>
                  <p className="font-medium text-purple-900">
                    {selectedItem.project_details?.project_name || selectedItem.project_details?.project_code || '-'}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Timeline</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>Disposal Requested: {formatDate(selectedItem.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Footer */}
            <div className={`px-6 py-4 border-t rounded-b-xl ${
              selectedItem.disposal_status === 'pending_review'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <div className={`flex items-center gap-2 ${
                selectedItem.disposal_status === 'pending_review'
                  ? 'text-amber-700'
                  : 'text-green-700'
              }`}>
                {selectedItem.disposal_status === 'pending_review' ? (
                  <>
                    <Clock className="w-5 h-5" />
                    <span className="font-medium">Awaiting Technical Director approval for disposal</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    <span className="font-medium">TD Approved - Ready for physical disposal</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(MaterialDisposalPage);
