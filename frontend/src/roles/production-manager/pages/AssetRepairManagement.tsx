/**
 * Asset Repair Management Page
 * PM manages assets sent for repair from ARDNs
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wrench, RefreshCw, CheckCircle, Package,
  AlertTriangle, Trash2, Eye, X, Search, Clock, History, Upload, Image,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import {
  getAssetRepairItems,
  completeAssetRepair,
  createAssetDisposalRequest,
  uploadDisposalImage,
  AssetRepairItem,
  DisposalReason
} from '../services/assetDnService';
import { showSuccess, showError } from '@/utils/toastHelper';
import { PAGINATION } from '@/lib/inventoryConstants';

type TabType = 'pending' | 'history';

const CONDITION_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  good: 'bg-green-100 text-green-700',
  damaged: 'bg-red-100 text-red-700',
  needs_repair: 'bg-orange-100 text-orange-700',
  lost: 'bg-gray-100 text-gray-700'
};

const AssetRepairManagement: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pendingItems, setPendingItems] = useState<AssetRepairItem[]>([]);
  const [historyItems, setHistoryItems] = useState<AssetRepairItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<AssetRepairItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'repair' | 'dispose' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [disposeReason, setDisposeReason] = useState<DisposalReason>('unrepairable');
  const [disposeJustification, setDisposeJustification] = useState('');
  const [disposalImage, setDisposalImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pending, history] = await Promise.all([
        getAssetRepairItems('pending'),
        getAssetRepairItems('history')
      ]);
      setPendingItems(pending);
      setHistoryItems(history);
    } catch (error) {
      console.error('Error fetching repair items:', error);
      showError('Failed to load repair items');
    } finally {
      setLoading(false);
    }
  };

  const currentItems = activeTab === 'pending' ? pendingItems : historyItems;

  const filteredItems = useMemo(() => {
    if (!searchTerm) return currentItems;
    const term = searchTerm.toLowerCase();
    return currentItems.filter(item =>
      item.category_name?.toLowerCase().includes(term) ||
      item.category_code?.toLowerCase().includes(term) ||
      item.ardn_number?.toLowerCase().includes(term) ||
      item.serial_number?.toLowerCase().includes(term) ||
      item.project_name?.toLowerCase().includes(term)
    );
  }, [currentItems, searchTerm]);

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

  const handleViewDetails = (item: AssetRepairItem) => {
    setSelectedItem(item);
    setDisposeReason('unrepairable');  // Reset to default valid value
    setShowDetailModal(true);
  };

  const handleMarkRepaired = () => {
    if (!selectedItem) return;
    setConfirmAction('repair');
    setShowConfirmModal(true);
  };

  const handleRequestDisposal = () => {
    if (!selectedItem) return;
    setConfirmAction('dispose');
    setShowConfirmModal(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDisposalImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmAction = async () => {
    if (!selectedItem || !confirmAction) return;

    setProcessing(true);
    try {
      if (confirmAction === 'repair') {
        await completeAssetRepair(selectedItem.return_item_id);
        showSuccess('Asset repaired and returned to stock');
      } else {
        // Ensure disposal reason has a valid value
        const reason = disposeReason || 'unrepairable';

        // Create disposal request requiring TD approval
        const disposal = await createAssetDisposalRequest({
          category_id: selectedItem.category_id,
          return_item_id: selectedItem.return_item_id,
          quantity: selectedItem.quantity,
          disposal_reason: reason,
          justification: disposeJustification || `Cannot be repaired. From ARDN: ${selectedItem.ardn_number}`,
          source_type: 'repair',
          source_ardn_id: selectedItem.ardn_id,
          project_id: selectedItem.project_id
        });

        // Upload image if provided
        if (disposalImage && disposal.disposal_id) {
          try {
            await uploadDisposalImage(disposal.disposal_id, disposalImage);
          } catch (uploadError) {
            console.error('Image upload failed:', uploadError);
            // Don't fail the disposal request if image upload fails
          }
        }

        showSuccess('Disposal request sent to TD for approval');
      }

      setShowConfirmModal(false);
      setShowDetailModal(false);
      setSelectedItem(null);
      setConfirmAction(null);
      setDisposeReason('unrepairable');
      setDisposeJustification('');
      setDisposalImage(null);
      setImagePreview(null);
      await fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to process action';
      showError(message);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading && pendingItems.length === 0 && historyItems.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ModernLoadingSpinners size="sm" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/production-manager/returnable-assets')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Asset Repair Management</h1>
            <p className="text-gray-500">Manage assets sent for repair from return notes</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs and Search */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'pending'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Pending ({pendingItems.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'history'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              History ({historyItems.length})
            </button>
          </div>

          {/* Search */}
          <div className="flex-1 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by asset name, code, ARDN, or project..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b flex items-center gap-2">
          {activeTab === 'pending' ? (
            <Wrench className="w-5 h-5 text-orange-500" />
          ) : (
            <History className="w-5 h-5 text-blue-500" />
          )}
          <h2 className="font-semibold">
            {activeTab === 'pending' ? 'Items Pending Repair' : 'Repair History'}
          </h2>
          {filteredItems.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'pending'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {filteredItems.length}
            </span>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {activeTab === 'pending' ? (
              <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            ) : (
              <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            )}
            <p>
              {searchTerm
                ? 'No matching items found'
                : activeTab === 'pending'
                  ? 'No assets pending repair'
                  : 'No repair history found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Asset</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Condition</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Source ARDN</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                  {activeTab === 'history' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  )}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedItems.map(item => (
                  <tr key={item.return_item_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{item.category_name}</p>
                        <p className="text-xs text-gray-500">
                          {item.category_code}
                          {item.serial_number && <span className="ml-1">• SN: {item.serial_number}</span>}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold">{item.quantity}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${CONDITION_COLORS[item.verified_condition || item.reported_condition]}`}>
                        {item.verified_condition || item.reported_condition}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{item.ardn_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{item.project_name || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">{formatDate(item.processed_at)}</span>
                    </td>
                    {activeTab === 'history' && (
                      <td className="px-4 py-3">
                        {item.action_taken === 'return_to_stock' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" />
                            Repaired
                          </span>
                        ) : item.action_taken === 'dispose' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 text-red-700">
                            <Trash2 className="w-3 h-3" />
                            Disposed
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                            {item.action_taken}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleViewDetails(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
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
        )}

        {/* Pagination */}
        {filteredItems.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, filteredItems.length)} of {filteredItems.length} items
            </span>
            {totalPages > 1 && (
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
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-orange-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-full">
                  <Wrench className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Repair Details</h3>
                  <p className="text-sm text-gray-500">{selectedItem.ardn_number}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedItem(null);
                }}
                className="p-2 hover:bg-gray-200 rounded-full"
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
                  <div>
                    <p className="text-xs text-gray-500">Condition</p>
                    <span className={`px-2 py-1 rounded text-xs ${CONDITION_COLORS[selectedItem.verified_condition || selectedItem.reported_condition]}`}>
                      {selectedItem.verified_condition || selectedItem.reported_condition}
                    </span>
                  </div>
                  {selectedItem.serial_number && (
                    <div>
                      <p className="text-xs text-gray-500">Serial Number</p>
                      <p className="font-medium text-gray-900">{selectedItem.serial_number}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Damage Details */}
              {selectedItem.damage_description && (
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Damage Description
                  </h4>
                  <p className="text-sm text-red-700">{selectedItem.damage_description}</p>
                </div>
              )}

              {/* PM Notes */}
              {selectedItem.pm_notes && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">PM Notes</h4>
                  <p className="text-sm text-blue-700">{selectedItem.pm_notes}</p>
                </div>
              )}

              {/* Source Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-xs text-purple-600 mb-1">Source ARDN</p>
                  <p className="font-medium text-purple-900">{selectedItem.ardn_number}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-green-600 mb-1">Project</p>
                  <p className="font-medium text-green-900">{selectedItem.project_name || '-'}</p>
                </div>
              </div>
            </div>

            {/* Actions - Only show for pending items */}
            {activeTab === 'pending' ? (
              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
                <button
                  onClick={handleRequestDisposal}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Cannot Repair - Dispose
                </button>
                <button
                  onClick={handleMarkRepaired}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark as Repaired
                </button>
              </div>
            ) : (
              <div className={`px-6 py-4 border-t flex items-center gap-2 ${
                selectedItem.action_taken === 'return_to_stock'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {selectedItem.action_taken === 'return_to_stock' ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">This asset has been repaired and returned to stock</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    <span className="font-medium">This asset was disposed (could not be repaired)</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className={`px-6 py-4 border-b ${confirmAction === 'repair' ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${confirmAction === 'repair' ? 'bg-green-100' : 'bg-red-100'}`}>
                  {confirmAction === 'repair' ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <Trash2 className="w-6 h-6 text-red-600" />
                  )}
                </div>
                <h3 className={`text-lg font-semibold ${confirmAction === 'repair' ? 'text-green-900' : 'text-red-900'}`}>
                  {confirmAction === 'repair' ? 'Confirm Repair Complete' : 'Request Disposal (TD Approval)'}
                </h3>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-gray-700 mb-4">
                {confirmAction === 'repair'
                  ? 'This will return the asset to available stock:'
                  : 'This will send a disposal request to TD for approval:'}
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-lg font-bold text-gray-900">
                  {selectedItem.quantity} x {selectedItem.category_name}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedItem.category_code}
                  {selectedItem.serial_number && ` • SN: ${selectedItem.serial_number}`}
                </p>
              </div>

              {confirmAction === 'dispose' && (
                <div className="space-y-4">
                  {/* Disposal Reason Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Disposal Reason *
                    </label>
                    <select
                      value={disposeReason}
                      onChange={(e) => setDisposeReason(e.target.value as DisposalReason)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                    >
                      <option value="unrepairable">Unrepairable</option>
                      <option value="damaged">Damaged Beyond Repair</option>
                      <option value="obsolete">Obsolete</option>
                      <option value="lost">Lost</option>
                      <option value="expired">Expired/End of Life</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Justification */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Justification
                    </label>
                    <textarea
                      value={disposeJustification}
                      onChange={(e) => setDisposeJustification(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                      placeholder="Explain why this asset cannot be repaired..."
                    />
                  </div>

                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Photo Documentation (Optional)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                      {imagePreview ? (
                        <div className="relative">
                          <img
                            src={imagePreview}
                            alt="Disposal preview"
                            className="max-h-40 mx-auto rounded"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setDisposalImage(null);
                              setImagePreview(null);
                            }}
                            className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center gap-2">
                          <div className="p-3 bg-gray-100 rounded-full">
                            <Upload className="w-6 h-6 text-gray-400" />
                          </div>
                          <span className="text-sm text-gray-500">Click to upload image</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* TD Approval Notice */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <div className="flex gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                      <p className="text-sm text-orange-700">
                        This request requires <strong>Technical Director approval</strong> before the asset is removed from inventory.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmAction(null);
                }}
                disabled={processing}
                className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={processing}
                className={`px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50 inline-flex items-center gap-2 ${
                  confirmAction === 'repair'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : confirmAction === 'repair' ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm Repair
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Confirm Disposal
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

export default AssetRepairManagement;
