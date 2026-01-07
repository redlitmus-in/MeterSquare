/**
 * Asset Receive Returns Page
 * PM processes returned assets - verify condition and decide fate
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, Package, RefreshCw, AlertTriangle,
  Wrench, Trash2, Check, X, Eye
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import {
  getReturnNotes,
  getReturnNote,
  receiveReturnNote,
  processReturnNote,
  AssetReturnDeliveryNote,
  ARDNItem,
  ReportedCondition,
  ActionTaken
} from '../services/assetDnService';
import { showSuccess, showError } from '@/utils/toastHelper';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-yellow-100 text-yellow-700',
  RECEIVED: 'bg-green-100 text-green-700',
  PROCESSED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-700'
};

const CONDITION_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  damaged: 'bg-red-100 text-red-700',
  needs_repair: 'bg-orange-100 text-orange-700',
  lost: 'bg-gray-100 text-gray-700'
};

const ACTION_OPTIONS: { value: ActionTaken; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'return_to_stock', label: 'Return to Stock', icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-500 hover:bg-green-600' },
  { value: 'send_to_repair', label: 'Send to Repair', icon: <Wrench className="w-4 h-4" />, color: 'bg-orange-500 hover:bg-orange-600' },
  { value: 'dispose', label: 'Dispose', icon: <Trash2 className="w-4 h-4" />, color: 'bg-red-500 hover:bg-red-600' },
  { value: 'write_off', label: 'Write Off', icon: <X className="w-4 h-4" />, color: 'bg-gray-500 hover:bg-gray-600' }
];

interface ProcessingItem {
  return_item_id: number;
  verified_condition: ReportedCondition;
  pm_notes: string;
  action_taken: ActionTaken;
  quantity_accepted: number;
}

type TabType = 'pending' | 'history';

const AssetReceiveReturns: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewId = searchParams.get('view');

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [pendingReturns, setPendingReturns] = useState<AssetReturnDeliveryNote[]>([]);
  const [processedReturns, setProcessedReturns] = useState<AssetReturnDeliveryNote[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<AssetReturnDeliveryNote | null>(null);
  const [processingItems, setProcessingItems] = useState<ProcessingItem[]>([]);
  const [showProcessModal, setShowProcessModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (viewId) {
      fetchReturnDetails(parseInt(viewId));
    }
  }, [viewId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getReturnNotes({ per_page: 100 });
      // Filter to show only returns that need processing
      setPendingReturns(data.data.filter(r =>
        ['IN_TRANSIT', 'RECEIVED'].includes(r.status)
      ));
      // Filter processed returns for history
      setProcessedReturns(data.data.filter(r =>
        r.status === 'PROCESSED'
      ));
    } catch (error) {
      console.error('Error fetching data:', error);
      showError('Failed to load pending returns');
    } finally {
      setLoading(false);
    }
  };

  const fetchReturnDetails = async (ardnId: number) => {
    try {
      const data = await getReturnNote(ardnId);
      setSelectedReturn(data);
      initializeProcessingItems(data.items);
      setShowProcessModal(true);
    } catch (error) {
      console.error('Error fetching return details:', error);
      showError('Failed to load return details');
    }
  };

  const initializeProcessingItems = (items: ARDNItem[]) => {
    setProcessingItems(items.map(item => ({
      return_item_id: item.return_item_id,
      verified_condition: item.reported_condition,
      pm_notes: '',
      action_taken: item.reported_condition === 'ok' ? 'return_to_stock' :
        item.reported_condition === 'lost' ? 'write_off' :
          'send_to_repair',
      quantity_accepted: item.quantity
    })));
  };

  const handleReceive = async (ardnId: number) => {
    setLoading(true);
    try {
      await receiveReturnNote(ardnId);
      showSuccess('Return note received at store');
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to receive';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!selectedReturn) return;

    // Validate all items have actions
    for (const item of processingItems) {
      if (!item.action_taken) {
        showError('Please select an action for all items');
        return;
      }
    }

    setLoading(true);
    try {
      await processReturnNote(selectedReturn.ardn_id, {
        items: processingItems
      });
      showSuccess(`Return note ${selectedReturn.ardn_number} processed successfully`);
      setShowProcessModal(false);
      setSelectedReturn(null);
      fetchData();
      // Clear URL param
      navigate('/production-manager/returnable-assets/receive-returns', { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to process return';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const updateProcessingItem = (returnItemId: number, field: keyof ProcessingItem, value: string | number) => {
    setProcessingItems(items =>
      items.map(item =>
        item.return_item_id === returnItemId
          ? { ...item, [field]: value }
          : item
      )
    );
  };

  const closeModal = () => {
    setShowProcessModal(false);
    setSelectedReturn(null);
    navigate('/production-manager/returnable-assets/receive-returns', { replace: true });
  };

  if (loading && pendingReturns.length === 0 && !showProcessModal) {
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
            <h1 className="text-2xl font-bold text-gray-800">Receive Returns</h1>
            <p className="text-gray-500">Process returned assets - verify and decide their fate</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Pending
              {pendingReturns.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {pendingReturns.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              History
              {processedReturns.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === 'history' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {processedReturns.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Pending Tab Content */}
        {activeTab === 'pending' && (
          pendingReturns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
              <p>No pending returns to process</p>
            </div>
          ) : (
            <div className="divide-y">
              {pendingReturns.map(rn => (
                <div key={rn.ardn_id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-orange-600">{rn.ardn_number}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[rn.status]}`}>
                          {rn.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {rn.project_name || `Project #${rn.project_id}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {rn.total_items} items • Returned by {rn.returned_by} • {new Date(rn.return_date).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {rn.status === 'IN_TRANSIT' && (
                        <button
                          onClick={() => handleReceive(rn.ardn_id)}
                          disabled={loading}
                          className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
                        >
                          <Check className="w-4 h-4" />
                          Receive
                        </button>
                      )}
                      {rn.status === 'RECEIVED' && (
                        <button
                          onClick={() => fetchReturnDetails(rn.ardn_id)}
                          className="flex items-center gap-1 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Process
                        </button>
                      )}
                      <button
                        onClick={() => fetchReturnDetails(rn.ardn_id)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Item Preview */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rn.items.slice(0, 3).map(item => (
                      <span
                        key={item.return_item_id}
                        className={`px-2 py-1 rounded text-xs ${CONDITION_COLORS[item.reported_condition]}`}
                      >
                        {item.category_name} ({item.reported_condition})
                      </span>
                    ))}
                    {rn.items.length > 3 && (
                      <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                        +{rn.items.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* History Tab Content */}
        {activeTab === 'history' && (
          processedReturns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No processed returns yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {processedReturns.map(rn => (
                <div key={rn.ardn_id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-green-600">{rn.ardn_number}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[rn.status]}`}>
                          {rn.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {rn.project_name || `Project #${rn.project_id}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {rn.total_items} items • Returned by {rn.returned_by || '-'} • Processed: {rn.processed_at ? new Date(rn.processed_at).toLocaleDateString() : '-'}
                      </p>
                    </div>
                    <button
                      onClick={() => fetchReturnDetails(rn.ardn_id)}
                      className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                    </button>
                  </div>

                  {/* Items Summary */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rn.items.slice(0, 5).map(item => (
                      <span
                        key={item.return_item_id}
                        className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600"
                      >
                        {item.category_name} - {item.action_taken?.replace(/_/g, ' ') || item.reported_condition}
                      </span>
                    ))}
                    {rn.items.length > 5 && (
                      <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                        +{rn.items.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Process/View Modal */}
      {showProcessModal && selectedReturn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className={`p-4 border-b flex items-center justify-between ${
              selectedReturn.status === 'PROCESSED' ? 'bg-green-50' : 'bg-purple-50'
            }`}>
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedReturn.status === 'PROCESSED' ? 'Return Details' : 'Process Return'}: {selectedReturn.ardn_number}
                </h2>
                <p className="text-sm text-gray-500">
                  {selectedReturn.project_name || `Project #${selectedReturn.project_id}`} • {selectedReturn.total_items} items
                  {selectedReturn.status === 'PROCESSED' && selectedReturn.processed_at && (
                    <span className="ml-2">• Processed: {new Date(selectedReturn.processed_at).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-gray-200 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                {selectedReturn.items.map((item) => {
                  const isProcessed = selectedReturn.status === 'PROCESSED';
                  const processingItem = !isProcessed ? processingItems.find(p => p.return_item_id === item.return_item_id) : null;

                  // Get action label for display
                  const getActionLabel = (action: string | undefined) => {
                    const actionMap: Record<string, { label: string; color: string }> = {
                      'return_to_stock': { label: 'Returned to Stock', color: 'bg-green-100 text-green-700' },
                      'send_to_repair': { label: 'Sent to Repair', color: 'bg-orange-100 text-orange-700' },
                      'dispose': { label: 'Disposed', color: 'bg-red-100 text-red-700' },
                      'write_off': { label: 'Written Off', color: 'bg-gray-100 text-gray-700' }
                    };
                    return actionMap[action || ''] || { label: action || '-', color: 'bg-gray-100 text-gray-600' };
                  };

                  return (
                    <div key={item.return_item_id} className="border rounded-lg p-4">
                      {/* Item Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Package className="w-5 h-5 text-gray-400" />
                          <div>
                            <span className="font-medium">{item.category_name}</span>
                            {item.item_code && (
                              <span className="text-sm text-gray-500 ml-2">({item.item_code})</span>
                            )}
                            {item.serial_number && (
                              <span className="text-xs text-gray-400 ml-2">SN: {item.serial_number}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">Qty: {item.quantity}</span>
                          <span className={`px-2 py-1 rounded text-xs ${CONDITION_COLORS[item.reported_condition]}`}>
                            Reported: {item.reported_condition}
                          </span>
                        </div>
                      </div>

                      {/* Damage Description */}
                      {item.damage_description && (
                        <div className="mb-3 p-2 bg-red-50 rounded text-sm text-red-700">
                          <strong>Damage:</strong> {item.damage_description}
                        </div>
                      )}

                      {/* Read-only view for PROCESSED items */}
                      {isProcessed ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <span className="text-sm text-gray-500">Verified Condition:</span>
                              <span className={`ml-2 px-2 py-1 rounded text-xs ${CONDITION_COLORS[item.verified_condition || item.reported_condition]}`}>
                                {item.verified_condition || item.reported_condition}
                              </span>
                            </div>
                            {item.pm_notes && (
                              <div>
                                <span className="text-sm text-gray-500">PM Notes:</span>
                                <span className="ml-2 text-sm">{item.pm_notes}</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">Action Taken:</span>
                            <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${getActionLabel(item.action_taken).color}`}>
                              {getActionLabel(item.action_taken).label}
                            </span>
                          </div>
                        </div>
                      ) : (
                        /* Editable form for non-processed items */
                        processingItem && (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Verified Condition
                                </label>
                                <select
                                  value={processingItem.verified_condition}
                                  onChange={(e) => updateProcessingItem(item.return_item_id, 'verified_condition', e.target.value as ReportedCondition)}
                                  className="w-full px-3 py-2 border rounded-lg"
                                >
                                  <option value="ok">OK</option>
                                  <option value="damaged">Damaged</option>
                                  <option value="needs_repair">Needs Repair</option>
                                  <option value="lost">Lost</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  PM Notes
                                </label>
                                <input
                                  type="text"
                                  value={processingItem.pm_notes}
                                  onChange={(e) => updateProcessingItem(item.return_item_id, 'pm_notes', e.target.value)}
                                  placeholder="Optional notes..."
                                  className="w-full px-3 py-2 border rounded-lg"
                                />
                              </div>
                            </div>

                            {/* Action Selection */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Action *
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {ACTION_OPTIONS.map(action => (
                                  <button
                                    key={action.value}
                                    type="button"
                                    onClick={() => updateProcessingItem(item.return_item_id, 'action_taken', action.value)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${processingItem.action_taken === action.value
                                        ? `${action.color} text-white`
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      }`}
                                  >
                                    {action.icon}
                                    {action.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg"
              >
                {selectedReturn.status === 'PROCESSED' ? 'Close' : 'Cancel'}
              </button>
              {selectedReturn.status !== 'PROCESSED' && (
                <button
                  onClick={handleProcess}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Process All Items
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetReceiveReturns;
