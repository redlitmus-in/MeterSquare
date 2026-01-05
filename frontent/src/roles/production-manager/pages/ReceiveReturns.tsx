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
import { showError, showSuccess } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';
import {
  CONDITION_COLORS,
  RETURN_ACTIONS,
  RETURN_ACTION_LABELS,
  RDN_STATUS_BADGES
} from '@/lib/inventoryConstants';

interface RDNItem {
  return_item_id: number;
  inventory_material_id: number;
  material_name: string;
  material_code: string;
  unit: string;
  quantity: number;
  condition: 'Good' | 'Damaged' | 'Defective';
  return_reason: string;
  material_return_id?: number;
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
  dispatched_at?: string;
  accepted_at?: string;
  acceptance_notes?: string;
  items: RDNItem[];
  total_items: number;
}

interface ItemAction {
  return_item_id: number;
  action: string;
  notes?: string;
  processed?: boolean;
  processing?: boolean;
}

type TabType = 'pending' | 'received' | 'all';

const ReceiveReturns: React.FC = () => {
  const [returnDeliveryNotes, setReturnDeliveryNotes] = useState<ReturnDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRDNs, setExpandedRDNs] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  // Improved Confirm Receipt Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedRDN, setSelectedRDN] = useState<ReturnDeliveryNote | null>(null);
  const [itemActions, setItemActions] = useState<Map<number, ItemAction>>(new Map());
  const [acceptanceNotes, setAcceptanceNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const confirmingReceiptRef = React.useRef(false);

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

  const openConfirmModal = (rdn: ReturnDeliveryNote) => {
    setSelectedRDN(rdn);

    // Initialize actions for each item based on condition
    const initialActions = new Map<number, ItemAction>();
    rdn.items.forEach((item) => {
      const defaultAction = item.condition === 'Good'
        ? RETURN_ACTIONS.ADD_TO_STOCK
        : RETURN_ACTIONS.SEND_FOR_REPAIR;

      initialActions.set(item.return_item_id, {
        return_item_id: item.return_item_id,
        action: defaultAction,
        notes: '',
        processed: false,
        processing: false
      });
    });

    setItemActions(initialActions);
    setShowConfirmModal(true);
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setSelectedRDN(null);
    setItemActions(new Map());
    setAcceptanceNotes('');
    setReceiptConfirmed(false);
  };

  const updateItemAction = (itemId: number, action: string) => {
    setItemActions((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(itemId);
      if (existing) {
        newMap.set(itemId, { ...existing, action });
      }
      return newMap;
    });
  };

  const updateItemNotes = (itemId: number, notes: string) => {
    setItemActions((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(itemId);
      if (existing) {
        newMap.set(itemId, { ...existing, notes });
      }
      return newMap;
    });
  };

  // Process a single item
  const handleProcessSingleItem = async (itemId: number) => {
    if (!selectedRDN) return;

    const itemAction = itemActions.get(itemId);
    if (!itemAction) return;

    // Set processing state for this item
    setItemActions((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(itemId);
      if (existing) {
        newMap.set(itemId, { ...existing, processing: true });
      }
      return newMap;
    });

    try {
      // If receipt not yet confirmed, confirm it first (use ref to prevent race condition)
      if (!receiptConfirmed && !confirmingReceiptRef.current) {
        confirmingReceiptRef.current = true;
        try {
          await apiClient.post(`/return_delivery_note/${selectedRDN.return_note_id}/confirm`, {
            acceptance_notes: acceptanceNotes
          });
          setReceiptConfirmed(true);
        } finally {
          confirmingReceiptRef.current = false;
        }
      }

      // Process this single item
      await apiClient.post(
        `/return_delivery_note/${selectedRDN.return_note_id}/items/${itemId}/process`,
        {
          action: itemAction.action,
          notes: itemAction.notes || ''
        }
      );

      // Mark item as processed and check if all done
      setItemActions((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(itemId);
        if (existing) {
          newMap.set(itemId, { ...existing, processed: true, processing: false });
        }

        // Check if all items are now processed
        const allProcessed = Array.from(newMap.values()).every(ia => ia.processed);
        if (allProcessed) {
          setTimeout(() => {
            showSuccess('All items processed! Return delivery complete.');
            closeConfirmModal();
            fetchReturnDeliveryNotes();
          }, 100);
        }

        return newMap;
      });

      showSuccess('Item processed successfully!');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to process item');
      // Reset processing state using functional update to avoid stale closure
      setItemActions((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(itemId);
        if (existing) {
          newMap.set(itemId, { ...existing, processing: false });
        }
        return newMap;
      });
    }
  };

  const handleConfirmReceipt = async () => {
    if (!selectedRDN) return;

    setConfirming(true);
    try {
      // STEP 1: Confirm receipt (status: IN_TRANSIT → RECEIVED)
      if (!receiptConfirmed && !confirmingReceiptRef.current) {
        confirmingReceiptRef.current = true;
        try {
          await apiClient.post(`/return_delivery_note/${selectedRDN.return_note_id}/confirm`, {
            acceptance_notes: acceptanceNotes
          });
          setReceiptConfirmed(true);
        } finally {
          confirmingReceiptRef.current = false;
        }
      }

      // STEP 2: Process all unprocessed items with their actions using batch endpoint
      const unprocessedItems = Array.from(itemActions.values())
        .filter(item => !item.processed)
        .map(item => ({
          item_id: item.return_item_id,
          action: item.action,
          notes: item.notes || ''
        }));

      if (unprocessedItems.length > 0) {
        const result = await apiClient.post(
          `/return_delivery_note/${selectedRDN.return_note_id}/process_all_items`,
          { items: unprocessedItems }
        );

        if (result.data.errors && result.data.errors.length > 0) {
          showError(`Some items had issues: ${result.data.errors.join(', ')}`);
        }
      }

      showSuccess('Return delivery processed successfully!');
      closeConfirmModal();
      fetchReturnDeliveryNotes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to process return delivery');
    } finally {
      setConfirming(false);
    }
  };

  // Filter RDNs by tab
  const filteredRDNs = returnDeliveryNotes.filter((rdn) => {
    if (activeTab === 'pending') {
      return rdn.status === 'IN_TRANSIT';
    } else if (activeTab === 'received') {
      return ['RECEIVED', 'PARTIAL'].includes(rdn.status);
    }
    return true;
  });

  const getTabCount = (tab: TabType): number => {
    if (tab === 'pending') {
      return returnDeliveryNotes.filter((r) => r.status === 'IN_TRANSIT').length;
    } else if (tab === 'received') {
      return returnDeliveryNotes.filter((r) => ['RECEIVED', 'PARTIAL'].includes(r.status)).length;
    }
    return returnDeliveryNotes.length;
  };

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
            In Transit ({getTabCount('pending')})
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
            Received ({getTabCount('received')})
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
            All ({getTabCount('all')})
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
              const statusBadge = RDN_STATUS_BADGES[rdn.status] || RDN_STATUS_BADGES.DRAFT;
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
                            onClick={() => openConfirmModal(rdn)}
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
                                <th className="pb-2 font-medium text-center">Status</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {rdn.items.map((item) => (
                              <tr key={item.return_item_id} className="hover:bg-white">
                                <td className="py-2">
                                  <p className="font-medium text-gray-900">{item.material_name}</p>
                                  <p className="text-xs text-gray-500">{item.material_code}</p>
                                </td>
                                <td className="py-2 text-right font-medium text-gray-900">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="py-2">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${CONDITION_COLORS[item.condition.toUpperCase()] || CONDITION_COLORS.GOOD}`}>
                                    {item.condition}
                                  </span>
                                </td>
                                <td className="py-2 text-gray-600 text-xs">{item.return_reason || '-'}</td>
                                {['RECEIVED', 'PARTIAL'].includes(rdn.status) && (
                                  <td className="py-2 text-center">
                                    <span className="text-xs text-green-600 font-medium">Processed</span>
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

      {/* Improved Confirm Receipt Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedRDN && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={closeConfirmModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Confirm & Process Return Delivery</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedRDN.return_note_number} • {selectedRDN.project_name}
                    </p>
                  </div>
                  <button
                    onClick={closeConfirmModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">
                  Review each item and decide the action. Good condition items are automatically set to "Add to Stock".
                </p>

                {/* Items */}
                <div className="space-y-3">
                  {selectedRDN.items.map((item, index) => {
                    const itemAction = itemActions.get(item.return_item_id);
                    const currentAction = itemAction?.action || '';
                    const needsNotes = currentAction !== RETURN_ACTIONS.ADD_TO_STOCK;
                    const isProcessed = itemAction?.processed;
                    const isProcessing = itemAction?.processing;
                    // Use a combination of item_id and index for unique key
                    const itemKey = `${item.return_item_id}-${index}`;

                    return (
                      <div
                        key={itemKey}
                        className={`border rounded-lg p-4 ${
                          isProcessed
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{item.material_name}</p>
                              {isProcessed && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                  ✓ Processed
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">{item.material_code}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-xs text-gray-600">
                                {item.quantity} {item.unit}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${CONDITION_COLORS[item.condition.toUpperCase()] || CONDITION_COLORS.GOOD}`}>
                                {item.condition}
                              </span>
                              {item.return_reason && (
                                <span className="text-xs text-gray-500">• {item.return_reason}</span>
                              )}
                            </div>
                          </div>
                          {/* Process button for individual item */}
                          {!isProcessed && (
                            <button
                              onClick={() => handleProcessSingleItem(item.return_item_id)}
                              disabled={isProcessing || confirming}
                              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {isProcessing ? (
                                <>
                                  <ModernLoadingSpinners size="xxs" />
                                  Processing...
                                </>
                              ) : (
                                'Process'
                              )}
                            </button>
                          )}
                        </div>

                        {!isProcessed && (
                          <>
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-gray-700">Action</label>
                              <div className="grid grid-cols-3 gap-2">
                                {Object.values(RETURN_ACTIONS).map((action) => {
                                  // Filter actions based on condition
                                  const isGoodCondition = item.condition.toLowerCase() === 'good';
                                  const shouldShowAction =
                                    (isGoodCondition && action === RETURN_ACTIONS.ADD_TO_STOCK) ||
                                    (!isGoodCondition && action !== RETURN_ACTIONS.ADD_TO_STOCK);

                                  if (!shouldShowAction) return null;

                                  const actionLabel = RETURN_ACTION_LABELS[action];
                                  const inputId = `action-${itemKey}-${action}`;
                                  return (
                                    <label
                                      key={action}
                                      htmlFor={inputId}
                                      className={`flex items-center p-2 border rounded-lg cursor-pointer transition-colors ${
                                        currentAction === action
                                          ? 'border-blue-500 bg-blue-50'
                                          : 'border-gray-300 hover:bg-gray-100'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        id={inputId}
                                        name={`action-${itemKey}`}
                                        value={action}
                                        checked={currentAction === action}
                                        onChange={() => updateItemAction(item.return_item_id, action)}
                                        className="w-3 h-3"
                                        disabled={isProcessing}
                                      />
                                      <span className="ml-2 text-xs">
                                        <span className={`font-medium ${actionLabel.color}`}>
                                          {actionLabel.label}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              {currentAction && RETURN_ACTION_LABELS[currentAction as keyof typeof RETURN_ACTION_LABELS] && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {RETURN_ACTION_LABELS[currentAction as keyof typeof RETURN_ACTION_LABELS].description}
                                </p>
                              )}
                            </div>

                            {needsNotes && (
                              <div className="mt-3">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Notes (Optional)
                                </label>
                                <textarea
                                  value={itemAction?.notes || ''}
                                  onChange={(e) => updateItemNotes(item.return_item_id, e.target.value)}
                                  rows={2}
                                  disabled={isProcessing}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                                  placeholder="Additional notes for this action..."
                                />
                              </div>
                            )}
                          </>
                        )}

                        {isProcessed && itemAction && (
                          <div className="mt-2 text-xs text-green-700">
                            Action taken: <span className="font-medium">{RETURN_ACTION_LABELS[itemAction.action as keyof typeof RETURN_ACTION_LABELS].label}</span>
                            {itemAction.notes && <span className="text-gray-500 ml-2">• {itemAction.notes}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* General Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    General Acceptance Notes (Optional)
                  </label>
                  <textarea
                    value={acceptanceNotes}
                    onChange={(e) => setAcceptanceNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Any overall notes about the received materials..."
                  />
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6">
                {/* Progress indicator */}
                {(() => {
                  const processedCount = Array.from(itemActions.values()).filter(ia => ia.processed).length;
                  const totalCount = itemActions.size;
                  const allProcessed = processedCount === totalCount;
                  const unprocessedCount = totalCount - processedCount;

                  return (
                    <>
                      {processedCount > 0 && !allProcessed && (
                        <div className="mb-4 text-center">
                          <span className="text-sm text-gray-600">
                            <span className="font-medium text-green-600">{processedCount}</span> of{' '}
                            <span className="font-medium">{totalCount}</span> items processed
                          </span>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={closeConfirmModal}
                          disabled={confirming}
                          className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                          {allProcessed ? 'Close' : 'Cancel'}
                        </button>
                        {!allProcessed && (
                          <button
                            onClick={handleConfirmReceipt}
                            disabled={confirming}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                          >
                            {confirming ? (
                              <>
                                <ModernLoadingSpinners size="xs" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CheckCircleIcon className="w-4 h-4" />
                                {unprocessedCount === totalCount
                                  ? 'Confirm & Process All'
                                  : `Process Remaining (${unprocessedCount})`}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(ReceiveReturns);
