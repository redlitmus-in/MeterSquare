import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckCircle, XCircle, Edit, Send, Clock, User, TrendingUp, TrendingDown } from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface InternalRevision {
  id: number;
  internal_revision_number: number;
  action_type: string;
  actor_role: string;
  actor_name: string;
  status_before: string;
  status_after: string;
  rejection_reason?: string;
  approval_comments?: string;
  changes_summary?: any;
  created_at: string;
}

interface BOQWithInternalRevisions {
  boq_id: number;
  boq_name: string;
  title: string;
  status: string;
  internal_revision_number: number;
  revision_number: number;
  total_cost: number;
  project: {
    name: string;
    client: string;
    location: string;
  };
}

const InternalRevisionTimeline: React.FC = () => {
  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';

  const [boqs, setBOQs] = useState<BOQWithInternalRevisions[]>([]);
  const [selectedBoq, setSelectedBoq] = useState<BOQWithInternalRevisions | null>(null);
  const [internalRevisions, setInternalRevisions] = useState<InternalRevision[]>([]);
  const [isLoadingBOQs, setIsLoadingBOQs] = useState(false);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRevisionIndex, setSelectedRevisionIndex] = useState<number | null>(null);

  useEffect(() => {
    loadBOQsWithInternalRevisions();
  }, []);

  useEffect(() => {
    if (selectedBoq) {
      loadInternalRevisions(selectedBoq.boq_id);
    }
  }, [selectedBoq]);

  const loadBOQsWithInternalRevisions = async () => {
    setIsLoadingBOQs(true);
    try {
      const response = await fetch(`${API_URL}/boqs/internal_revisions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setBOQs(data.data);
        // Don't auto-select - let user choose from recent projects
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      toast.error('Failed to load BOQs with internal revisions');
    } finally {
      setIsLoadingBOQs(false);
    }
  };

  const loadInternalRevisions = async (boqId: number) => {
    setIsLoadingRevisions(true);
    try {
      const response = await fetch(`${API_URL}/boq/${boqId}/internal_revisions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        // Sort in descending order (latest first)
        const sorted = data.data.internal_revisions.sort((a: InternalRevision, b: InternalRevision) =>
          b.internal_revision_number - a.internal_revision_number
        );
        setInternalRevisions(sorted);
        // Auto-select the latest revision for comparison
        if (sorted.length > 0) {
          setSelectedRevisionIndex(0);
        }
      }
    } catch (error) {
      console.error('Error loading internal revisions:', error);
      toast.error('Failed to load internal revision history');
    } finally {
      setIsLoadingRevisions(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'TD_APPROVED':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'TD_REJECTED':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'PM_EDITED':
        return <Edit className="h-5 w-5 text-blue-600" />;
      case 'SENT_TO_TD':
      case 'SENT_TO_PM':
        return <Send className="h-5 w-5 text-purple-600" />;
      case 'ESTIMATOR_RESUBMIT':
      case 'INTERNAL_REVISION_EDIT':
        return <Edit className="h-5 w-5 text-orange-600" />;
      case 'CREATED':
        return <User className="h-5 w-5 text-gray-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      'CREATED': 'BOQ Created',
      'PM_EDITED': 'PM Edited',
      'SENT_TO_PM': 'Sent to PM',
      'SENT_TO_TD': 'Sent to TD',
      'TD_REJECTED': 'TD Rejected',
      'TD_APPROVED': 'TD Approved',
      'ESTIMATOR_RESUBMIT': 'Estimator Resubmitted',
      'INTERNAL_REVISION_EDIT': 'Internal Revision'
    };
    return labels[actionType] || actionType;
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'TD_APPROVED':
        return 'bg-green-50 border-green-200';
      case 'TD_REJECTED':
        return 'bg-red-50 border-red-200';
      case 'PM_EDITED':
        return 'bg-blue-50 border-blue-200';
      case 'SENT_TO_TD':
      case 'SENT_TO_PM':
        return 'bg-purple-50 border-purple-200';
      case 'ESTIMATOR_RESUBMIT':
      case 'INTERNAL_REVISION_EDIT':
        return 'bg-orange-50 border-orange-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
  };

  const filteredBOQs = boqs.filter(boq =>
    boq.boq_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    boq.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    boq.project?.client?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate total from items
  const calculateTotalFromSnapshot = (snapshot: any) => {
    if (!snapshot?.items || snapshot.items.length === 0) return 0;

    return snapshot.items.reduce((total: number, item: any) => {
      const itemTotal = item.sub_items && item.sub_items.length > 0
        ? item.sub_items.reduce((sum: number, si: any) =>
            sum + (si.materials_cost || 0) + (si.labour_cost || 0), 0)
        : (item.materials?.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0) || 0) +
          (item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0);

      const miscellaneousAmount = (itemTotal * (item.overhead_percentage || 0)) / 100;
      const overheadProfitAmount = (itemTotal * (item.profit_margin_percentage || 0)) / 100;
      const subtotal = itemTotal + miscellaneousAmount + overheadProfitAmount;
      const discountAmount = (subtotal * (item.discount_percentage || 0)) / 100;
      const afterDiscount = subtotal - discountAmount;
      const vatAmount = (afterDiscount * (item.vat_percentage || 0)) / 100;
      const finalTotalPrice = afterDiscount + vatAmount;

      return total + finalTotalPrice;
    }, 0);
  };

  const calculateChange = (current: number, previous: number) => {
    if (!previous || previous === 0) return { value: 0, percentage: 0 };
    const change = current - previous;
    const percentage = ((change / previous) * 100).toFixed(2);
    return { value: change, percentage: parseFloat(percentage) };
  };

  // Helper to check if value changed
  const hasChanged = (currentValue: any, previousValue: any): boolean => {
    if (currentValue === undefined || previousValue === undefined) return false;
    if (typeof currentValue === 'number' && typeof previousValue === 'number') {
      return Math.abs(currentValue - previousValue) > 0.01;
    }
    return currentValue !== previousValue;
  };

  // Render BOQ Items with comparison highlighting
  const renderBOQItemsComparison = (currentSnapshot: any, previousSnapshot: any | null) => {
    if (!currentSnapshot?.items || currentSnapshot.items.length === 0) {
      return <p className="text-sm text-gray-500 italic">No items in this revision</p>;
    }

    return (
      <div className="space-y-3">
        {currentSnapshot.items.map((item: any, itemIdx: number) => {
          // Find matching previous item
          const prevItem = previousSnapshot?.items?.find((pi: any) => pi.item_name === item.item_name);

          // Calculate item totals
          const itemTotal = item.sub_items && item.sub_items.length > 0
            ? item.sub_items.reduce((sum: number, si: any) =>
                sum + (si.materials_cost || 0) + (si.labour_cost || 0), 0)
            : (item.materials?.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0) || 0) +
              (item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0);

          const miscellaneousAmount = (itemTotal * (item.overhead_percentage || 0)) / 100;
          const overheadProfitAmount = (itemTotal * (item.profit_margin_percentage || 0)) / 100;
          const subtotal = itemTotal + miscellaneousAmount + overheadProfitAmount;
          const discountAmount = (subtotal * (item.discount_percentage || 0)) / 100;
          const afterDiscount = subtotal - discountAmount;
          const vatAmount = (afterDiscount * (item.vat_percentage || 0)) / 100;
          const finalTotalPrice = afterDiscount + vatAmount;

          const isNew = !prevItem;

          return (
            <div key={itemIdx} className={`border rounded-lg p-3 ${isNew ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-300'}`}>
              <div className="flex items-start justify-between mb-2">
                <h5 className="font-semibold text-gray-900 text-sm">
                  {isNew && <span className="text-xs bg-yellow-200 text-yellow-900 px-2 py-0.5 rounded mr-2">NEW</span>}
                  {item.item_name}
                </h5>
              </div>
              {item.description && (
                <p className="text-xs text-gray-600 mb-2">{item.description}</p>
              )}

              {/* Sub Items */}
              {item.sub_items && item.sub_items.length > 0 && (
                <div className="mb-2 space-y-2">
                  <p className="text-xs font-semibold text-gray-700 mb-1">📋 Sub Items:</p>
                  {item.sub_items.map((subItem: any, subIdx: number) => {
                    const prevSubItem = prevItem?.sub_items?.find((ps: any) => ps.sub_item_name === subItem.sub_item_name);

                    return (
                      <div key={subIdx} className="bg-green-50 border border-green-200 rounded p-2">
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <p className="font-semibold text-xs text-gray-900">{subItem.sub_item_name}</p>
                            {subItem.scope && <p className="text-xs text-gray-600">{subItem.scope}</p>}
                          </div>
                          <div className="text-right text-xs text-gray-600">
                            {subItem.size && <div>Size: {subItem.size}</div>}
                            {subItem.location && <div>Loc: {subItem.location}</div>}
                          </div>
                        </div>

                        {/* Sub Item Materials */}
                        {subItem.materials && subItem.materials.length > 0 && (
                          <div className="mb-1">
                            <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                            <div className="space-y-1">
                              {subItem.materials.map((mat: any, matIdx: number) => {
                                const prevMat = prevSubItem?.materials?.find((pm: any) => pm.material_name === mat.material_name);
                                const quantityChanged = prevMat ? hasChanged(mat.quantity, prevMat.quantity) : !prevMat;
                                const priceChanged = prevMat ? hasChanged(mat.quantity * mat.unit_price, prevMat.quantity * prevMat.unit_price) : !prevMat;
                                const isNewMat = !prevMat;

                                return (
                                  <div key={matIdx} className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${isNewMat ? 'bg-yellow-100' : 'bg-white'}`}>
                                    <span className={quantityChanged ? 'bg-yellow-200 px-1 rounded' : ''}>
                                      {mat.material_name} ({mat.quantity} {mat.unit})
                                    </span>
                                    <span className={`font-semibold ${priceChanged ? 'bg-yellow-200 px-1 rounded' : ''}`}>
                                      AED {(mat.quantity * mat.unit_price).toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Sub Item Labour */}
                        {subItem.labour && subItem.labour.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700 mb-1">👷 Labour:</p>
                            <div className="space-y-1">
                              {subItem.labour.map((lab: any, labIdx: number) => {
                                const prevLab = prevSubItem?.labour?.find((pl: any) => pl.labour_role === lab.labour_role);
                                const hoursChanged = prevLab ? hasChanged(lab.hours, prevLab.hours) : !prevLab;
                                const costChanged = prevLab ? hasChanged(lab.hours * lab.rate_per_hour, prevLab.hours * prevLab.rate_per_hour) : !prevLab;
                                const isNewLab = !prevLab;

                                return (
                                  <div key={labIdx} className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${isNewLab ? 'bg-yellow-100' : 'bg-white'}`}>
                                    <span className={hoursChanged ? 'bg-yellow-200 px-1 rounded' : ''}>
                                      {lab.labour_role} ({lab.hours}h @ AED {lab.rate_per_hour}/h)
                                    </span>
                                    <span className={`font-semibold ${costChanged ? 'bg-yellow-200 px-1 rounded' : ''}`}>
                                      AED {(lab.hours * lab.rate_per_hour).toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Direct Materials (for items without sub_items) */}
              {(!item.sub_items || item.sub_items.length === 0) && item.materials && item.materials.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                  <div className="space-y-1">
                    {item.materials.map((mat: any, matIdx: number) => {
                      const prevMat = prevItem?.materials?.find((pm: any) => pm.material_name === mat.material_name);
                      const quantityChanged = prevMat ? hasChanged(mat.quantity, prevMat.quantity) : !prevMat;
                      const priceChanged = prevMat ? hasChanged(mat.total_price, prevMat.total_price) : !prevMat;
                      const isNewMat = !prevMat;

                      return (
                        <div key={matIdx} className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${isNewMat ? 'bg-yellow-100' : 'bg-blue-50'}`}>
                          <span className={quantityChanged ? 'bg-yellow-200 px-1 rounded' : ''}>
                            {mat.material_name} ({mat.quantity} {mat.unit})
                          </span>
                          <span className={`font-semibold ${priceChanged ? 'bg-yellow-200 px-1 rounded' : ''}`}>
                            AED {mat.total_price}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Direct Labour (for items without sub_items) */}
              {(!item.sub_items || item.sub_items.length === 0) && item.labour && item.labour.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-700 mb-1">👷 Labour:</p>
                  <div className="space-y-1">
                    {item.labour.map((lab: any, labIdx: number) => {
                      const prevLab = prevItem?.labour?.find((pl: any) => pl.labour_role === lab.labour_role);
                      const hoursChanged = prevLab ? hasChanged(lab.hours, prevLab.hours) : !prevLab;
                      const costChanged = prevLab ? hasChanged(lab.total_cost, prevLab.total_cost) : !prevLab;
                      const isNewLab = !prevLab;

                      return (
                        <div key={labIdx} className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${isNewLab ? 'bg-yellow-100' : 'bg-blue-50'}`}>
                          <span className={hoursChanged ? 'bg-yellow-200 px-1 rounded' : ''}>
                            {lab.labour_role} ({lab.hours}h)
                          </span>
                          <span className={`font-semibold ${costChanged ? 'bg-yellow-200 px-1 rounded' : ''}`}>
                            AED {lab.total_cost}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pricing Details */}
              <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                <div className="text-xs text-gray-600 flex justify-between">
                  <span>Item Total:</span>
                  <span className="font-semibold">AED {itemTotal.toFixed(2)}</span>
                </div>
                {item.overhead_percentage > 0 && (
                  <div className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${prevItem && hasChanged(item.overhead_percentage, prevItem.overhead_percentage) ? 'bg-yellow-200' : ''}`}>
                    <span>Miscellaneous ({item.overhead_percentage}%):</span>
                    <span className="font-semibold">AED {miscellaneousAmount.toFixed(2)}</span>
                  </div>
                )}
                {item.profit_margin_percentage > 0 && (
                  <div className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${prevItem && hasChanged(item.profit_margin_percentage, prevItem.profit_margin_percentage) ? 'bg-yellow-200' : ''}`}>
                    <span>Overhead & Profit ({item.profit_margin_percentage}%):</span>
                    <span className="font-semibold">AED {overheadProfitAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="text-xs text-gray-700 flex justify-between bg-gray-100 rounded px-2 py-1 font-semibold">
                  <span>Subtotal:</span>
                  <span>AED {subtotal.toFixed(2)}</span>
                </div>
                {item.discount_percentage > 0 && (
                  <div className={`text-xs text-red-600 flex justify-between rounded px-2 py-1 ${prevItem && hasChanged(item.discount_percentage, prevItem.discount_percentage) ? 'bg-yellow-200' : ''}`}>
                    <span>Discount ({item.discount_percentage}%):</span>
                    <span className="font-semibold">- AED {discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="text-xs text-gray-700 flex justify-between">
                  <span>After Discount:</span>
                  <span className="font-semibold">AED {afterDiscount.toFixed(2)}</span>
                </div>
                {item.vat_percentage > 0 && (
                  <div className={`text-xs text-green-600 flex justify-between rounded px-2 py-1 ${prevItem && hasChanged(item.vat_percentage, prevItem.vat_percentage) ? 'bg-yellow-200' : ''}`}>
                    <span>VAT ({item.vat_percentage}%):</span>
                    <span className="font-semibold">+ AED {vatAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="text-sm font-bold text-gray-900 flex justify-between bg-green-50 rounded px-2 py-1 mt-1">
                  <span>Final Price:</span>
                  <span>AED {finalTotalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const currentRevision = selectedRevisionIndex !== null ? internalRevisions[selectedRevisionIndex] : null;
  const previousRevision = selectedRevisionIndex !== null && selectedRevisionIndex < internalRevisions.length - 1
    ? internalRevisions[selectedRevisionIndex + 1]
    : null;

  const currentSnapshot = currentRevision?.changes_summary;
  const previousSnapshot = previousRevision?.changes_summary;

  const currentTotal = currentSnapshot ? calculateTotalFromSnapshot(currentSnapshot) : 0;
  const previousTotal = previousSnapshot ? calculateTotalFromSnapshot(previousSnapshot) : 0;
  const change = calculateChange(currentTotal, previousTotal);

  return (
    <div className="space-y-6">
      {/* Header with BOQ Selection */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Internal Revisions History</h3>
        <p className="text-sm text-gray-600 mb-4">
          View all internal approval cycles (PM edits, TD rejections) before sending to client
        </p>

        {/* Recent Projects - Always visible (4-5 most recent) */}
        {!selectedBoq && boqs.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700 mb-3">Recent Projects:</p>
            <div className="space-y-2">
              {boqs.slice(0, 5).map((boq) => (
                <button
                  key={boq.boq_id}
                  onClick={() => {
                    setSelectedBoq(boq);
                    setSearchTerm('');
                    setSelectedRevisionIndex(null);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{boq.boq_name}</div>
                      <div className="text-sm text-gray-600">
                        {boq.project?.name} • {boq.project?.client}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-sm font-semibold px-2 py-1 rounded inline-block bg-blue-100 text-blue-700">
                        Internal Rev: {boq.internal_revision_number}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search BOQs */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search BOQs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* BOQ Dropdown - Only shows when searching */}
        {searchTerm && (
          isLoadingBOQs ? (
            <div className="flex justify-center py-8">
              <ModernLoadingSpinners size="sm" />
            </div>
          ) : filteredBOQs.length > 0 ? (
            <select
              value={selectedBoq?.boq_id || ''}
              onChange={(e) => {
                const boq = boqs.find(b => b.boq_id === parseInt(e.target.value));
                setSelectedBoq(boq || null);
                setSelectedRevisionIndex(null);
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
            >
              {filteredBOQs.map((boq) => (
                <option key={boq.boq_id} value={boq.boq_id}>
                  {boq.boq_name} - {boq.project?.name} - Internal Rev: {boq.internal_revision_number}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-center py-8 text-gray-500 mb-4">
              <p className="font-medium">No BOQs found matching "{searchTerm}"</p>
            </div>
          )
        )}

        {/* Selected BOQ Info */}
        {selectedBoq && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-blue-900">{selectedBoq.boq_name}</h4>
                <p className="text-sm text-blue-700">
                  {selectedBoq.project?.name} • {selectedBoq.project?.client}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-blue-900">
                  Internal Rev: {selectedBoq.internal_revision_number}
                </div>
                <div className="text-sm text-blue-700">{formatCurrency(selectedBoq.total_cost)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Split View: Current (Left) vs Previous (Right) */}
      {selectedBoq && internalRevisions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT SIDE: Current Internal Revision */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 border-b border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-green-900">📌 Current Internal Revision</h3>
                  <p className="text-sm text-green-700">
                    Internal Rev {currentRevision?.internal_revision_number}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-900">
                    {formatCurrency(currentTotal)}
                  </div>
                  {previousSnapshot && change.percentage !== 0 && (
                    <div className={`flex items-center justify-end gap-1 text-xs font-semibold ${
                      change.percentage > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {change.percentage > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {change.percentage > 0 ? '+' : ''}{change.percentage}%
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            {isLoadingRevisions ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <ModernLoadingSpinners size="md" />
                <p className="mt-4 text-gray-600">Loading details...</p>
              </div>
            ) : currentSnapshot ? (
              <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Action:</span>
                      <span className="font-semibold">{getActionLabel(currentRevision.action_type)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">By:</span>
                      <span className="font-semibold">{currentRevision.actor_name} ({currentRevision.actor_role})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-semibold">
                        {new Date(currentRevision.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Items:</span>
                      <span className="font-semibold">{currentSnapshot.total_items || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Rejection/Approval Messages */}
                {currentRevision.rejection_reason && (
                  <div className="p-3 bg-red-100 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-900 mb-1">Rejection Reason:</p>
                    <p className="text-sm text-red-800">{currentRevision.rejection_reason}</p>
                  </div>
                )}
                {currentRevision.approval_comments && (
                  <div className="p-3 bg-green-100 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-900 mb-1">Approval Comments:</p>
                    <p className="text-sm text-green-800">{currentRevision.approval_comments}</p>
                  </div>
                )}

                {/* Items */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Items</h4>
                  {renderBOQItemsComparison(currentSnapshot, previousSnapshot)}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No data available</div>
            )}
          </motion.div>

          {/* RIGHT SIDE: Previous Internal Revisions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 border-b border-purple-200">
              <h3 className="text-lg font-bold text-purple-900">📝 Previous Internal Revisions</h3>
              <p className="text-sm text-purple-700">Select to compare</p>
            </div>

            {/* Content */}
            {isLoadingRevisions ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <ModernLoadingSpinners size="md" />
                <p className="mt-4 text-gray-600">Loading revisions...</p>
              </div>
            ) : internalRevisions.length > 1 ? (
              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {internalRevisions.map((revision, index) => {
                  const isSelected = index === selectedRevisionIndex;
                  const revisionTotal = revision.changes_summary ? calculateTotalFromSnapshot(revision.changes_summary) : 0;

                  return (
                    <motion.button
                      key={revision.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => setSelectedRevisionIndex(index)}
                      className={`w-full text-left border rounded-lg p-3 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getActionIcon(revision.action_type)}
                          <div>
                            <div className="font-bold text-gray-900 text-sm">
                              Internal Rev {revision.internal_revision_number}
                            </div>
                            <div className="text-xs text-gray-500">
                              {getActionLabel(revision.action_type)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-gray-900">
                            {formatCurrency(revisionTotal)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(revision.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600">
                        By: {revision.actor_name}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="font-medium">No previous internal revisions</p>
                <p className="text-sm mt-1">This is the first internal revision</p>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* No Data State */}
      {selectedBoq && internalRevisions.length === 0 && !isLoadingRevisions && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-12 text-center">
          <Clock className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="font-medium text-gray-700 text-lg">No internal revision history</p>
          <p className="text-sm mt-2 text-gray-600">
            Internal changes will appear here once tracking begins
          </p>
        </div>
      )}
    </div>
  );
};

export default InternalRevisionTimeline;
