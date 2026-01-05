/**
 * Asset Disposal Page
 * Shows assets sent for disposal awaiting TD approval
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
  Package
} from 'lucide-react';
import {
  getAssetDisposalRequests,
  AssetDisposalRequest
} from '../services/assetDnService';
import { showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const AssetDisposalPage: React.FC = () => {
  const [disposalItems, setDisposalItems] = useState<AssetDisposalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<AssetDisposalRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchDisposalItems();
  }, []);

  const fetchDisposalItems = async () => {
    setLoading(true);
    try {
      // Fetch pending disposal requests
      const disposals = await getAssetDisposalRequests('pending_review');
      setDisposalItems(disposals || []);
    } catch (error) {
      console.error('Error fetching disposal items:', error);
      showError('Failed to load disposal items. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter by search
  const filteredItems = useMemo(() => {
    if (!searchTerm) return disposalItems;

    const term = searchTerm.toLowerCase();
    return disposalItems.filter(item => {
      const categoryName = item.category_name || '';
      const categoryCode = item.category_code || '';
      const serialNumber = item.serial_number || '';
      return (
        categoryName.toLowerCase().includes(term) ||
        categoryCode.toLowerCase().includes(term) ||
        serialNumber.toLowerCase().includes(term)
      );
    });
  }, [disposalItems, searchTerm]);

  const handleViewDetails = (item: AssetDisposalRequest) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      'unrepairable': 'Unrepairable',
      'damaged': 'Damaged Beyond Repair',
      'obsolete': 'Obsolete',
      'lost': 'Lost',
      'expired': 'Expired/End of Life',
      'other': 'Other'
    };
    return labels[reason] || reason;
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
                Asset Disposal
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Assets awaiting Technical Director approval for disposal
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
        {/* Search and Stats */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Stats */}
            <div className="flex items-center gap-2">
              <div className="px-4 py-2 bg-red-50 rounded-lg border border-red-200">
                <span className="text-2xl font-bold text-red-600">{disposalItems.length}</span>
                <span className="text-sm text-red-600 ml-2">Pending TD Approval</span>
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by asset name, code, or serial..."
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
          ) : filteredItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-red-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Asset
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Requested By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Date
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
                  {filteredItems.map((item) => (
                    <tr key={item.disposal_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">
                          {item.category_name || 'Unknown Asset'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.category_code}
                          {item.serial_number && <span className="ml-1">• SN: {item.serial_number}</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-semibold text-gray-900">{item.quantity}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700">
                          {getReasonLabel(item.disposal_reason)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {item.requested_by || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500">
                          {formatDate(item.requested_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <Clock className="w-3 h-3" />
                          Awaiting TD
                        </span>
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
                  : 'No assets pending TD disposal approval'}
              </p>
            </div>
          )}
        </div>

        {/* Results count */}
        {filteredItems.length > 0 && (
          <p className="mt-4 text-sm text-gray-600 text-center">
            Showing {filteredItems.length} disposal request{filteredItems.length !== 1 ? 's' : ''}
          </p>
        )}
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
                  <p className="text-sm text-gray-500">{selectedItem.category_code}</p>
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
              {/* Asset Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Asset Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Asset Name</p>
                    <p className="font-medium text-gray-900">{selectedItem.category_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Asset Code</p>
                    <p className="font-medium text-gray-900">{selectedItem.category_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Quantity</p>
                    <p className="font-medium text-gray-900">{selectedItem.quantity}</p>
                  </div>
                  {selectedItem.serial_number && (
                    <div>
                      <p className="text-xs text-gray-500">Serial Number</p>
                      <p className="font-medium text-gray-900">{selectedItem.serial_number}</p>
                    </div>
                  )}
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
                    <p className="text-xs text-red-700">Disposal Reason</p>
                    <p className="text-sm text-red-900 font-medium">{getReasonLabel(selectedItem.disposal_reason)}</p>
                  </div>
                  {selectedItem.justification && (
                    <div>
                      <p className="text-xs text-red-700">Justification</p>
                      <p className="text-sm text-red-900">{selectedItem.justification}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Image Preview */}
              {selectedItem.image_url && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Photo Documentation</h4>
                  <img
                    src={selectedItem.image_url}
                    alt="Disposal documentation"
                    className="max-h-60 rounded-lg border border-gray-200"
                  />
                </div>
              )}

              {/* Request Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 mb-1">Requested By</p>
                  <p className="font-medium text-blue-900">{selectedItem.requested_by || '-'}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-xs text-purple-600 mb-1">Source ARDN</p>
                  <p className="font-medium text-purple-900">{selectedItem.ardn_number || '-'}</p>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Timeline</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>Disposal Requested: {formatDate(selectedItem.requested_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Footer */}
            <div className="px-6 py-4 bg-amber-50 border-t border-amber-200 rounded-b-xl">
              <div className="flex items-center gap-2 text-amber-700">
                <Clock className="w-5 h-5" />
                <span className="font-medium">Awaiting Technical Director approval for disposal</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AssetDisposalPage);
