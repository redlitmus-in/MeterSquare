import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  Package,
  Search,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  Clock,
  ArrowRight,
  Trash2,
  Eye
} from 'lucide-react';
import { inventoryService, MaterialReturn } from '../services/inventoryService';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

type TabType = 'pending' | 'completed';

const RepairManagement: React.FC = () => {
  const [repairItems, setRepairItems] = useState<MaterialReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [selectedItem, setSelectedItem] = useState<MaterialReturn | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'repair' | 'disposal' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [repairNotes, setRepairNotes] = useState('');

  useEffect(() => {
    fetchRepairItems();
  }, []);

  const fetchRepairItems = async () => {
    setLoading(true);
    try {
      const response = await inventoryService.getAllMaterialReturns();
      const returns = response?.returns || [];

      // Filter items that are in the repair workflow:
      // - sent_for_repair: In backup stock, waiting for repair
      // - repaired: Repair complete, moved to main stock
      const repairs = returns.filter((ret: MaterialReturn) =>
        ret.disposal_status === 'sent_for_repair' ||
        ret.disposal_status === 'repaired'
      );

      setRepairItems(repairs);
    } catch (error) {
      console.error('Error fetching repair items:', error);
      showError('Failed to load repair items. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter by tab and search
  const filteredItems = useMemo(() => {
    let filtered = [...repairItems];

    // Tab filter based on disposal_status:
    // - pending: items with sent_for_repair status (in backup stock, awaiting repair)
    // - completed: items with repaired status (repair done, moved to main stock)
    if (activeTab === 'pending') {
      filtered = filtered.filter(item => item.disposal_status === 'sent_for_repair');
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(item => item.disposal_status === 'repaired');
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item => {
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

    return filtered;
  }, [repairItems, activeTab, searchTerm]);

  // Counts based on disposal_status
  const pendingCount = repairItems.filter(item => item.disposal_status === 'sent_for_repair').length;
  const completedCount = repairItems.filter(item => item.disposal_status === 'repaired').length;

  const handleViewDetails = (item: MaterialReturn) => {
    setSelectedItem(item);
    setRepairNotes('');
    setShowDetailModal(true);
  };

  const handleMarkRepaired = () => {
    if (!selectedItem) return;
    setConfirmAction('repair');
    setShowConfirmModal(true);
  };

  const handleRequestDisposal = () => {
    if (!selectedItem) return;
    setConfirmAction('disposal');
    setShowConfirmModal(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedItem || !confirmAction) return;

    setProcessing(true);
    try {
      if (confirmAction === 'repair') {
        // Mark as repaired and move from backup stock to main stock
        await inventoryService.addRepairedToStock(selectedItem.return_id!, repairNotes);
        showSuccess('Material marked as repaired and added to main stock');
      } else {
        // Request disposal - send to TD for approval
        await inventoryService.requestDisposalFromRepair(
          selectedItem.return_id!,
          repairNotes || `Material from RDN ${selectedItem.reference_number} cannot be repaired`
        );
        showSuccess('Disposal request sent to Technical Director');
      }

      setShowConfirmModal(false);
      setShowDetailModal(false);
      setSelectedItem(null);
      setConfirmAction(null);
      setRepairNotes('');
      await fetchRepairItems();
    } catch (error: any) {
      console.error('Error processing action:', error);
      showError(error.message || 'Failed to process action');
    } finally {
      setProcessing(false);
    }
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
              <h1 className="text-3xl font-bold text-gray-900">Repair Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage materials sent for repair from Return Delivery Notes
              </p>
            </div>
            <button
              onClick={fetchRepairItems}
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
        {/* Tabs and Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
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
                Pending Repair ({pendingCount})
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'completed'
                    ? 'bg-white text-green-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Completed ({completedCount})
              </button>
            </div>

            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by material name, code, or RDN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              <p className="text-gray-500">Loading repair items...</p>
            </div>
          ) : filteredItems.length > 0 ? (
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
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Condition
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Source RDN
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredItems.map((item) => (
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
                      <td className="px-6 py-4">
                        {item.disposal_status === 'sent_for_repair' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            Pending Repair
                          </span>
                        )}
                        {item.disposal_status === 'repaired' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Repaired
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
              <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No items found</h3>
              <p className="text-sm text-gray-500">
                {searchTerm
                  ? 'Try adjusting your search'
                  : activeTab === 'pending'
                    ? 'No materials pending repair'
                    : 'No completed repairs yet'}
              </p>
            </div>
          )}
        </div>

        {/* Results count */}
        {filteredItems.length > 0 && (
          <p className="mt-4 text-sm text-gray-600 text-center">
            Showing {filteredItems.length} of {repairItems.length} items
          </p>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-full">
                  <Wrench className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Repair Details</h3>
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

              {/* Damage Details */}
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <h4 className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Damage Details
                </h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-orange-700">Return Reason</p>
                    <p className="text-sm text-orange-900">{selectedItem.return_reason || 'No reason provided'}</p>
                  </div>
                  {selectedItem.notes && (
                    <div>
                      <p className="text-xs text-orange-700">Additional Notes</p>
                      <p className="text-sm text-orange-900">{selectedItem.notes}</p>
                    </div>
                  )}
                  {selectedItem.disposal_notes && (
                    <div>
                      <p className="text-xs text-orange-700">Processing Notes</p>
                      <p className="text-sm text-orange-900">{selectedItem.disposal_notes}</p>
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
                    <span>Received: {formatDate(selectedItem.created_at)}</span>
                  </div>
                  {selectedItem.disposal_reviewed_at && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>Processed: {formatDate(selectedItem.disposal_reviewed_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions - Show only for items pending repair */}
            {selectedItem.disposal_status === 'sent_for_repair' && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-xl">
                <button
                  onClick={handleRequestDisposal}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Cannot Repair - Request Disposal
                </button>
                <button
                  onClick={handleMarkRepaired}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark as Repaired
                  <ArrowRight className="w-4 h-4" />
                  Add to Stock
                </button>
              </div>
            )}

            {/* Completed badge - Show for repaired items */}
            {selectedItem.disposal_status === 'repaired' && (
              <div className="px-6 py-4 bg-green-50 border-t border-green-200 rounded-b-xl">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">This item has been repaired and added to main stock</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className={`px-6 py-4 border-b ${
              confirmAction === 'repair' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${
                  confirmAction === 'repair' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {confirmAction === 'repair' ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <Trash2 className="w-6 h-6 text-red-600" />
                  )}
                </div>
                <h3 className={`text-lg font-semibold ${
                  confirmAction === 'repair' ? 'text-green-900' : 'text-red-900'
                }`}>
                  {confirmAction === 'repair' ? 'Confirm Repair Complete' : 'Request Disposal'}
                </h3>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-gray-700 mb-4">
                {confirmAction === 'repair'
                  ? 'This will move the material from backup stock to main stock:'
                  : 'This will send a disposal request to the Technical Director:'}
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-lg font-bold text-gray-900">
                  {selectedItem.quantity} {selectedItem.unit}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedItem.material_name}
                </p>
              </div>

              {confirmAction === 'disposal' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for disposal (optional)
                  </label>
                  <textarea
                    value={repairNotes}
                    onChange={(e) => setRepairNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Explain why this material cannot be repaired..."
                  />
                </div>
              )}

              <div className={`flex items-start gap-2 rounded-lg p-3 ${
                confirmAction === 'repair' ? 'bg-green-50' : 'bg-red-50'
              }`}>
                {confirmAction === 'repair' ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <p className={`text-sm ${confirmAction === 'repair' ? 'text-green-700' : 'text-red-700'}`}>
                  {confirmAction === 'repair'
                    ? 'Material will be available for dispatch after this action.'
                    : 'TD approval will be required before disposal.'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmAction(null);
                }}
                disabled={processing}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={processing}
                className={`px-4 py-2 text-white rounded-lg transition-colors font-medium disabled:opacity-50 inline-flex items-center gap-2 ${
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
                    Request Disposal
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

export default React.memo(RepairManagement);
