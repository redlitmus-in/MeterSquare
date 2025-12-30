/**
 * Asset Repair Management Page
 * PM manages assets sent for repair from ARDNs
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wrench, RefreshCw, CheckCircle, Package,
  AlertTriangle, Trash2, Eye, X, Search
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import {
  getAssetRepairItems,
  completeAssetRepair,
  disposeUnrepairableAsset,
  AssetRepairItem
} from '../services/assetDnService';
import { showSuccess, showError } from '@/utils/toastHelper';

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
  const [repairItems, setRepairItems] = useState<AssetRepairItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<AssetRepairItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'repair' | 'dispose' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [disposeReason, setDisposeReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const items = await getAssetRepairItems();
      setRepairItems(items);
    } catch (error) {
      console.error('Error fetching repair items:', error);
      showError('Failed to load repair items');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = repairItems.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.category_name?.toLowerCase().includes(term) ||
      item.category_code?.toLowerCase().includes(term) ||
      item.ardn_number?.toLowerCase().includes(term) ||
      item.serial_number?.toLowerCase().includes(term) ||
      item.project_name?.toLowerCase().includes(term)
    );
  });

  const handleViewDetails = (item: AssetRepairItem) => {
    setSelectedItem(item);
    setDisposeReason('');
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

  const handleConfirmAction = async () => {
    if (!selectedItem || !confirmAction) return;

    setProcessing(true);
    try {
      if (confirmAction === 'repair') {
        await completeAssetRepair(selectedItem.return_item_id);
        showSuccess('Asset repaired and returned to stock');
      } else {
        await disposeUnrepairableAsset(selectedItem.return_item_id, disposeReason || 'Cannot be repaired');
        showSuccess('Asset marked for disposal');
      }

      setShowConfirmModal(false);
      setShowDetailModal(false);
      setSelectedItem(null);
      setConfirmAction(null);
      setDisposeReason('');
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

  if (loading && repairItems.length === 0) {
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
            onClick={() => navigate('/pm/returnable-assets')}
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

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
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

      {/* Items List */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b flex items-center gap-2">
          <Wrench className="w-5 h-5 text-orange-500" />
          <h2 className="font-semibold">Items Pending Repair</h2>
          {filteredItems.length > 0 && (
            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">
              {filteredItems.length}
            </span>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>{searchTerm ? 'No matching items found' : 'No assets pending repair'}</p>
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
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map(item => (
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

            {/* Actions */}
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
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
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
                  {confirmAction === 'repair' ? 'Confirm Repair Complete' : 'Confirm Disposal'}
                </h3>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-gray-700 mb-4">
                {confirmAction === 'repair'
                  ? 'This will return the asset to available stock:'
                  : 'This will mark the asset for disposal:'}
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
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for disposal
                  </label>
                  <textarea
                    value={disposeReason}
                    onChange={(e) => setDisposeReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                    placeholder="Explain why this asset cannot be repaired..."
                  />
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
