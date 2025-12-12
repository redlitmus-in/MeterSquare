import React, { useState, useEffect, useCallback } from 'react';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  TruckIcon,
  BuildingOfficeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showError, showSuccess, showInfo } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';

interface RDNItem {
  item_id: number;
  inventory_material_id: number;
  material_name: string;
  material_code: string;
  unit: string;
  quantity: number;
  quantity_accepted?: number;
  condition: 'Good' | 'Damaged' | 'Defective';
  return_reason: string;
  acceptance_status?: string;
  material_return_id?: number;
  notes?: string;
}

interface ReturnDeliveryNote {
  return_note_id: number;
  return_note_number: string;
  project_id: number;
  project_name: string;
  project_code: string;
  project_location: string;
  status: 'DRAFT' | 'ISSUED' | 'IN_TRANSIT' | 'RECEIVED' | 'PARTIAL' | 'APPROVED' | 'REJECTED';
  return_date: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  issued_at?: string;
  issued_by?: string;
  dispatched_at?: string;
  dispatched_by?: string;
  accepted_at?: string;
  accepted_by?: string;
  acceptance_notes?: string;
  items: RDNItem[];
  total_items: number;
}

const ReceiveReturns: React.FC = () => {
  const [returnDeliveryNotes, setReturnDeliveryNotes] = useState<ReturnDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRDNs, setExpandedRDNs] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'pending' | 'received' | 'all'>('pending');

  // Confirm Receipt Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedRDN, setSelectedRDN] = useState<ReturnDeliveryNote | null>(null);
  const [acceptanceNotes, setAcceptanceNotes] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Process Item Modal
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RDNItem | null>(null);
  const [processAction, setProcessAction] = useState<'add_to_stock' | 'disposal' | 'repair'>('add_to_stock');
  const [disposalNotes, setDisposalNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchReturnDeliveryNotes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/pm-return-delivery-notes');
      setReturnDeliveryNotes(response.data.return_delivery_notes || []);
    } catch (err) {
      console.error('Error fetching return delivery notes:', err);
      showError('Failed to load return delivery notes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReturnDeliveryNotes();
  }, [fetchReturnDeliveryNotes]);

  const toggleRDNExpand = (rdnId: number) => {
    const newExpanded = new Set(expandedRDNs);
    if (newExpanded.has(rdnId)) {
      newExpanded.delete(rdnId);
    } else {
      newExpanded.add(rdnId);
    }
    setExpandedRDNs(newExpanded);
  };

  const getRDNStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT': return { class: 'bg-gray-100 text-gray-700', text: 'Draft' };
      case 'ISSUED': return { class: 'bg-blue-100 text-blue-700', text: 'Issued' };
      case 'IN_TRANSIT': return { class: 'bg-yellow-100 text-yellow-700', text: 'In Transit' };
      case 'RECEIVED': return { class: 'bg-purple-100 text-purple-700', text: 'Received' };
      case 'PARTIAL': return { class: 'bg-orange-100 text-orange-700', text: 'Partial' };
      case 'APPROVED': return { class: 'bg-green-100 text-green-700', text: 'Approved' };
      case 'REJECTED': return { class: 'bg-red-100 text-red-700', text: 'Rejected' };
      default: return { class: 'bg-gray-100 text-gray-700', text: status };
    }
  };

  const getConditionBadgeClass = (condition: string) => {
    switch (condition) {
      case 'Good': return 'bg-green-100 text-green-700';
      case 'Damaged': return 'bg-orange-100 text-orange-700';
      case 'Defective': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleConfirmReceipt = async () => {
    if (!selectedRDN) return;

    setConfirming(true);
    try {
      await apiClient.post(`/return_delivery_note/${selectedRDN.return_note_id}/confirm`, {
        acceptance_notes: acceptanceNotes,
      });
      showSuccess('Return delivery confirmed successfully!');
      setShowConfirmModal(false);
      setSelectedRDN(null);
      setAcceptanceNotes('');
      fetchReturnDeliveryNotes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to confirm receipt');
    } finally {
      setConfirming(false);
    }
  };

  const handleProcessItem = async () => {
    if (!selectedRDN || !selectedItem) return;

    setProcessing(true);
    try {
      await apiClient.post(
        `/return_delivery_note/${selectedRDN.return_note_id}/items/${selectedItem.item_id}/process`,
        {
          action: processAction,
          disposal_notes: disposalNotes,
        }
      );
      showSuccess('Item processed successfully!');
      setShowProcessModal(false);
      setSelectedItem(null);
      setProcessAction('add_to_stock');
      setDisposalNotes('');
      fetchReturnDeliveryNotes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to process item');
    } finally {
      setProcessing(false);
    }
  };

  // Filter RDNs by tab
  const filteredRDNs = returnDeliveryNotes.filter((rdn) => {
    if (activeTab === 'pending') {
      return rdn.status === 'IN_TRANSIT';
    } else if (activeTab === 'received') {
      return ['RECEIVED', 'PARTIAL'].includes(rdn.status);
    }
    return true; // 'all' tab
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Receive Returns</h1>
              <p className="text-sm text-gray-500 mt-1">Manage returned materials from project sites</p>
            </div>
            <button
              onClick={fetchReturnDeliveryNotes}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Tab Buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <TruckIcon className="w-4 h-4" />
            In Transit ({returnDeliveryNotes.filter((r) => r.status === 'IN_TRANSIT').length})
          </button>
          <button
            onClick={() => setActiveTab('received')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'received'
                ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <CheckCircleIcon className="w-4 h-4" />
            Received (
            {returnDeliveryNotes.filter((r) => ['RECEIVED', 'PARTIAL'].includes(r.status)).length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-gray-100 text-gray-700 border-2 border-gray-300'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <DocumentTextIcon className="w-4 h-4" />
            All ({returnDeliveryNotes.length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <ModernLoadingSpinners size="md" />
          </div>
        ) : filteredRDNs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No return delivery notes in this category.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRDNs.map((rdn) => {
              const statusBadge = getRDNStatusBadge(rdn.status);
              const isExpanded = expandedRDNs.has(rdn.return_note_id);

              return (
                <motion.div
                  key={rdn.return_note_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                >
                  {/* RDN Header */}
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleRDNExpand(rdn.return_note_id)}
                        className="flex items-center gap-3 flex-1 text-left hover:bg-gray-50 -m-2 p-2 rounded transition-colors"
                      >
                        <div className="p-2 bg-orange-100 rounded-lg">
                          <DocumentTextIcon className="w-5 h-5 text-orange-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-gray-900">{rdn.return_note_number}</p>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.class}`}>
                              {statusBadge.text}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <BuildingOfficeIcon className="w-4 h-4 text-gray-400" />
                            <p className="text-sm text-gray-500">
                              {rdn.project_name} • {rdn.total_items} item(s) •{' '}
                              {new Date(rdn.return_date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 ml-4">
                        {rdn.status === 'IN_TRANSIT' && (
                          <button
                            onClick={() => {
                              setSelectedRDN(rdn);
                              setShowConfirmModal(true);
                            }}
                            className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors font-medium"
                          >
                            Confirm Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RDN Items (Expanded) */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-gray-200 bg-gray-50 px-4 py-3"
                      >
                        {/* Transport Details */}
                        {rdn.vehicle_number && (
                          <div className="mb-3 pb-3 border-b border-gray-200">
                            <p className="text-xs text-gray-500 mb-2 font-medium">Transport Details:</p>
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div>
                                <span className="text-gray-500">Vehicle:</span>
                                <span className="ml-1 text-gray-900 font-medium">{rdn.vehicle_number}</span>
                              </div>
                              {rdn.driver_name && (
                                <div>
                                  <span className="text-gray-500">Driver:</span>
                                  <span className="ml-1 text-gray-900 font-medium">{rdn.driver_name}</span>
                                </div>
                              )}
                              {rdn.driver_contact && (
                                <div>
                                  <span className="text-gray-500">Contact:</span>
                                  <span className="ml-1 text-gray-900 font-medium">{rdn.driver_contact}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Timeline */}
                        {(rdn.issued_at || rdn.dispatched_at || rdn.accepted_at) && (
                          <div className="mb-3 pb-3 border-b border-gray-200">
                            <p className="text-xs text-gray-500 mb-2 font-medium">Timeline:</p>
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              {rdn.issued_at && (
                                <div>
                                  <span className="text-gray-500">Issued:</span>
                                  <span className="ml-1 text-gray-900 font-medium">
                                    {new Date(rdn.issued_at).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {rdn.dispatched_at && (
                                <div>
                                  <span className="text-gray-500">Dispatched:</span>
                                  <span className="ml-1 text-gray-900 font-medium">
                                    {new Date(rdn.dispatched_at).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {rdn.accepted_at && (
                                <div>
                                  <span className="text-gray-500">Received:</span>
                                  <span className="ml-1 text-gray-900 font-medium">
                                    {new Date(rdn.accepted_at).toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Items Table */}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 border-b border-gray-200">
                              <th className="pb-2 font-medium">Material</th>
                              <th className="pb-2 font-medium text-right">Quantity</th>
                              <th className="pb-2 font-medium">Condition</th>
                              <th className="pb-2 font-medium">Reason</th>
                              {['RECEIVED', 'PARTIAL'].includes(rdn.status) && (
                                <th className="pb-2 font-medium text-center">Action</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {rdn.items.map((item) => (
                              <tr key={item.item_id} className="hover:bg-white">
                                <td className="py-2">
                                  <p className="font-medium text-gray-900">{item.material_name}</p>
                                  <p className="text-xs text-gray-500">{item.material_code}</p>
                                </td>
                                <td className="py-2 text-right font-medium text-gray-900">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="py-2">
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${getConditionBadgeClass(
                                      item.condition
                                    )}`}
                                  >
                                    {item.condition}
                                  </span>
                                </td>
                                <td className="py-2 text-gray-600 text-xs">{item.return_reason || '-'}</td>
                                {['RECEIVED', 'PARTIAL'].includes(rdn.status) && (
                                  <td className="py-2 text-center">
                                    {item.material_return_id ? (
                                      <span className="text-xs text-green-600 font-medium">Processed</span>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setSelectedRDN(rdn);
                                          setSelectedItem(item);
                                          setShowProcessModal(true);
                                        }}
                                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                      >
                                        Process
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {rdn.acceptance_notes && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">Acceptance Notes:</p>
                            <p className="text-xs text-gray-700">{rdn.acceptance_notes}</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Receipt Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedRDN && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Confirm Receipt</h3>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Confirm receipt of <span className="font-medium">{selectedRDN.return_note_number}</span> from{' '}
                  <span className="font-medium">{selectedRDN.project_name}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Total items: {selectedRDN.total_items} • Vehicle: {selectedRDN.vehicle_number || 'N/A'}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Acceptance Notes (Optional)
                </label>
                <textarea
                  value={acceptanceNotes}
                  onChange={(e) => setAcceptanceNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Any notes about the received materials..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={confirming}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReceipt}
                  disabled={confirming}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {confirming ? (
                    <>
                      <ClockIcon className="w-4 h-4 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4" />
                      Confirm Receipt
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Process Item Modal */}
      <AnimatePresence>
        {showProcessModal && selectedItem && selectedRDN && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowProcessModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Process Returned Item</h3>
                <button
                  onClick={() => setShowProcessModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-900">{selectedItem.material_name}</p>
                <p className="text-sm text-gray-500">{selectedItem.material_code}</p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span>
                    Quantity: <span className="font-medium">{selectedItem.quantity} {selectedItem.unit}</span>
                  </span>
                  <span className={`px-2 py-1 rounded-full ${getConditionBadgeClass(selectedItem.condition)}`}>
                    {selectedItem.condition}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
                <div className="space-y-2">
                  <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="add_to_stock"
                      checked={processAction === 'add_to_stock'}
                      onChange={(e) => setProcessAction(e.target.value as any)}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="ml-3 text-sm">
                      <span className="font-medium text-gray-900">Add to Stock</span>
                      <p className="text-xs text-gray-500">Material is in good condition, add to inventory</p>
                    </span>
                  </label>
                  <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="repair"
                      checked={processAction === 'repair'}
                      onChange={(e) => setProcessAction(e.target.value as any)}
                      className="w-4 h-4 text-orange-600"
                    />
                    <span className="ml-3 text-sm">
                      <span className="font-medium text-gray-900">Send for Repair</span>
                      <p className="text-xs text-gray-500">Material needs repair before use</p>
                    </span>
                  </label>
                  <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      value="disposal"
                      checked={processAction === 'disposal'}
                      onChange={(e) => setProcessAction(e.target.value as any)}
                      className="w-4 h-4 text-red-600"
                    />
                    <span className="ml-3 text-sm">
                      <span className="font-medium text-gray-900">Mark for Disposal</span>
                      <p className="text-xs text-gray-500">Material is beyond repair, dispose</p>
                    </span>
                  </label>
                </div>
              </div>

              {processAction !== 'add_to_stock' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={disposalNotes}
                    onChange={(e) => setDisposalNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional notes..."
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowProcessModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProcessItem}
                  disabled={processing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <ClockIcon className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4" />
                      Process Item
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(ReceiveReturns);
