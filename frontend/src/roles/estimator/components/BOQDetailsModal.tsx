import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Package,
  Users,
  Calculator,
  Building2,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  Printer,
  Edit,
  Eye,
  Clock
} from 'lucide-react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { estimatorService } from '../services/estimatorService';
import { BOQGetResponse, BOQItemDetailed } from '../types';
import { toast } from 'sonner';
import BOQHistoryTimeline from './BOQHistoryTimeline';
import BOQRevisionHistory from './BOQRevisionHistory';
import BOQComparisonView from './BOQComparisonView';

interface BOQDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boq: any; // Can be either simple BOQ data from list or full BOQGetResponse
  onEdit?: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
  onApprove?: () => void; // For TD/PM approval
  onReject?: () => void; // For TD/PM rejection
  showNewPurchaseItems?: boolean; // Control whether to show new_purchase section (default: false for Projects, true for Change Requests)
  refreshTrigger?: number; // Add a trigger to force refresh from parent
}

const BOQDetailsModal: React.FC<BOQDetailsModalProps> = ({
  isOpen,
  onClose,
  boq,
  onEdit,
  onDownload,
  onPrint,
  onApprove,
  onReject,
  showNewPurchaseItems = false, // Default to false (Projects page won't show new items)
  refreshTrigger
}) => {
  const [boqData, setBoqData] = useState<BOQGetResponse | null>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'revisions'>('details');

  useEffect(() => {
    if (isOpen && boq?.boq_id) {
      fetchBOQDetails();
    }
  }, [isOpen, boq?.boq_id, refreshTrigger]); // Add refreshTrigger to dependencies

  const fetchBOQDetails = async () => {
    if (!boq?.boq_id) return;

    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQById(boq.boq_id);
      if (result.success && result.data) {
        setBoqData(result.data);

        // Auto-expand first few items for better UX
        const expandedIds: string[] = [];
        // Expand first 2 existing items
        if (result.data.existing_purchase?.items) {
          expandedIds.push(...result.data.existing_purchase.items.slice(0, 2).map((_, index) => `existing-${index}`));
        } else if (result.data.items) {
          expandedIds.push(...result.data.items.slice(0, 2).map((_, index) => `item-${index}`));
        }
        // Also expand all new purchase items (since they're important)
        if (result.data.new_purchase?.items) {
          expandedIds.push(...result.data.new_purchase.items.map((_, index) => `new-${index}`));
        }
        setExpandedItems(expandedIds);
      } else {
        toast.error(result.message || 'Failed to fetch BOQ details');
      }
    } catch (error) {
      toast.error('Error loading BOQ details');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status?.toLowerCase().replace('_', '') || 'draft';
    const colors: Record<string, string> = {
      draft: 'text-gray-600 bg-gray-100',
      inreview: 'text-yellow-700 bg-yellow-100',
      approved: 'text-green-700 bg-green-100',
      sentforconfirmation: 'text-blue-700 bg-blue-100',
      rejected: 'text-red-700 bg-red-100'
    };
    return colors[normalizedStatus] || colors.draft;
  };

  if (!isOpen) return null;

  const displayData = boqData || boq; // Use fetched data if available, otherwise use passed boq

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50"
              onClick={onClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b border-blue-100 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm border border-blue-200">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-[#243d8a]">BOQ Details</h2>
                      {displayData && (
                        <p className="text-sm text-gray-600">{displayData.boq_name || displayData.title || 'Unnamed BOQ'}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Approve Button - For TD/PM */}
                    {onApprove && (
                      <button
                        onClick={onApprove}
                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
                        title="Approve BOQ"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                        Approve
                      </button>
                    )}

                    {/* Reject Button - For TD/PM */}
                    {onReject && (
                      <button
                        onClick={onReject}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
                        title="Reject BOQ"
                      >
                        <XCircleIcon className="w-5 h-5" />
                        Reject
                      </button>
                    )}

                    {onEdit && (() => {
                      const status = displayData?.status?.toLowerCase() || '';
                      // Estimator can edit if: draft, approved, revision_approved, sent_for_confirmation, under_revision, pending_revision
                      // Cannot edit if: pending (sent to TD), client_confirmed, rejected, completed, client_rejected, client_cancelled
                      const canEdit = !status ||
                        status === 'draft' ||
                        status === 'approved' ||
                        status === 'revision_approved' ||
                        status === 'sent_for_confirmation' ||
                        status === 'under_revision' ||
                        status === 'pending_revision';
                      return canEdit;
                    })() && (
                      <button
                        onClick={onEdit}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit BOQ"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                    )}
                    {onDownload && (
                      <button
                        onClick={onDownload}
                        className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                        title="Download BOQ"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 bg-gray-50 px-3 sm:px-6">
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'details'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 sm:gap-2">
                      <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">BOQ Details</span>
                      <span className="sm:hidden">Details</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'history'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">History & Timeline</span>
                      <span className="sm:hidden">History</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-200px)] p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-4 text-gray-600">Loading BOQ details...</p>
                    </div>
                  </div>
                ) : activeTab === 'history' ? (
                  <BOQHistoryTimeline boqId={displayData?.boq_id || boq?.boq_id} />
                ) : boqData ? (
                  <>
                    {/* Project Information */}
                    <div className="bg-gradient-to-r from-red-50 to-red-100/30 rounded-lg p-5 mb-6 border border-red-200">
                      <h3 className="text-base font-bold text-red-900 mb-4 flex items-center gap-2">
                        <div className="p-1.5 bg-white rounded-lg shadow-sm">
                          <Building2 className="w-4 h-4 text-red-600" />
                        </div>
                        Project Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <span className="text-xs text-red-700 font-medium">Project Name:</span>
                          <p className="font-semibold text-gray-900">{boqData.project_details?.project_name || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-xs text-red-700 font-medium">Location:</span>
                          <p className="font-medium text-gray-900 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-red-500" />
                            {boqData.project_details?.location || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-red-700 font-medium">Floor:</span>
                          <p className="font-medium text-gray-900">{boqData.project_details?.floor || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-xs text-red-700 font-medium">Working Hours:</span>
                          <p className="font-medium text-gray-900">{boqData.project_details?.hours || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-xs text-red-700 font-medium block mb-1">Status:</span>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(boqData.status)}`}>
                            {boqData.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-red-700 font-medium">Created:</span>
                          <p className="font-medium text-gray-900 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-red-500" />
                            {boqData.created_at ? new Date(boqData.created_at).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Preliminaries & Approval Works */}
                    {boqData.preliminaries && (boqData.preliminaries.items?.length > 0 || boqData.preliminaries.notes) && (
                      <div className="mb-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-500 rounded-lg">
                            <FileText className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Preliminaries & Approval Works</h3>
                            <p className="text-xs text-gray-600">Selected conditions and terms</p>
                          </div>
                        </div>

                        {boqData.preliminaries.items && boqData.preliminaries.items.length > 0 && (
                          <div className="space-y-2 mb-4">
                            {boqData.preliminaries.items.map((item: any, index: number) => (
                              <div key={index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-purple-200">
                                <div className="mt-0.5 w-4 h-4 rounded border-2 border-purple-500 bg-purple-500 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <div className="flex-1 text-sm text-gray-700">
                                  {item.description}
                                  {item.isCustom && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded font-medium">Custom</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {boqData.preliminaries.notes && (
                          <div className="bg-white rounded-lg p-4 border border-purple-200">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Additional Notes</h4>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{boqData.preliminaries.notes}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* BOQ Items */}
                    <div>
                      {/* Existing Purchase Items */}
                      {boqData.existing_purchase && boqData.existing_purchase.items.length > 0 && (
                        <div className="mb-8">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Existing BOQ Items</h3>
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                              {boqData.existing_purchase.items.length} Items
                            </span>
                          </div>
                          <div className="space-y-4">
                            {boqData.existing_purchase.items.map((item: BOQItemDetailed, index: number) => (
                              <div key={item.master_item_id || index} className="border border-blue-200 rounded-lg bg-blue-50/30">
                                {/* Item Header */}
                                <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3 flex-1">
                                      <button
                                        onClick={() => toggleItemExpanded(`existing-${index}`)}
                                        className="p-1 hover:bg-blue-200 rounded"
                                      >
                                        {expandedItems.includes(`existing-${index}`) ? (
                                          <ChevronDown className="w-4 h-4" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4" />
                                        )}
                                      </button>
                                      <div className="flex-1">
                                        <span className="font-medium text-lg">{item.item_name}</span>
                                        {item.work_type && (
                                          <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                            {item.work_type}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-semibold text-green-600">
                                        {formatCurrency(item.selling_price || item.item_total || 0)}
                                      </p>
                                      <p className="text-xs text-gray-600">Total Price</p>
                                    </div>
                                  </div>
                                  {/* Second row with description and item details */}
                                  <div className="ml-9 flex items-center gap-4 text-sm text-gray-700">
                                    {item.description && (
                                      <span className="text-gray-600">{item.description}</span>
                                    )}
                                    {item.quantity && item.rate && (
                                      <div className="flex items-center gap-3 ml-auto">
                                        <span className="text-xs text-gray-500">Qty:</span>
                                        <span className="font-medium">{item.quantity}</span>
                                        <span className="text-xs text-gray-500">{item.unit || 'nos'}</span>
                                        <span className="text-gray-400">×</span>
                                        <span className="text-xs text-gray-500">Rate:</span>
                                        <span className="font-medium">{formatCurrency(item.rate)}</span>
                                        <span className="text-gray-400">=</span>
                                        <span className="font-semibold text-blue-600">{formatCurrency(item.item_total || (item.quantity * item.rate))}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Item Details (Expandable) */}
                                {expandedItems.includes(`existing-${index}`) && (
                                  <div className="p-4 space-y-4">
                                    {/* Sub Items */}
                                    {item.sub_items?.length > 0 && (
                                      <div className="space-y-4">
                                        {item.sub_items.map((subItem: any, subIndex: number) => (
                                          <div key={subIndex} className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border border-green-200">
                                            <div className="mb-3">
                                              <h4 className="text-sm font-bold text-green-900 flex items-center gap-2">
                                                <div className="p-1.5 bg-white rounded shadow-sm">
                                                  <FileText className="w-4 h-4 text-green-600" />
                                                </div>
                                                Sub Item #{subIndex + 1}: {subItem.scope || subItem.sub_item_name}
                                              </h4>
                                              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                                {subItem.size && <div><span className="text-gray-600">Size:</span> <span className="font-medium">{subItem.size}</span></div>}
                                                {subItem.location && <div><span className="text-gray-600">Location:</span> <span className="font-medium">{subItem.location}</span></div>}
                                                {subItem.brand && <div><span className="text-gray-600">Brand:</span> <span className="font-medium">{subItem.brand}</span></div>}
                                                <div><span className="text-gray-600">Qty:</span> <span className="font-medium">{subItem.quantity} {subItem.unit}</span></div>
                                              </div>
                                            </div>

                                            {/* Sub-item Materials */}
                                            {subItem.materials?.length > 0 && (
                                              <div className="mb-3 bg-blue-50/50 rounded-lg p-3 border border-blue-200">
                                                <h5 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-2">
                                                  <Package className="w-3.5 h-3.5" />
                                                  Raw Materials
                                                </h5>
                                                <div className="bg-white rounded border border-blue-200 overflow-hidden">
                                                  <table className="w-full text-xs">
                                                    <thead className="bg-blue-100 border-b border-blue-200">
                                                      <tr>
                                                        <th className="text-left py-1.5 px-2 font-semibold text-blue-900">Material</th>
                                                        <th className="text-center py-1.5 px-2 font-semibold text-blue-900">Qty</th>
                                                        <th className="text-center py-1.5 px-2 font-semibold text-blue-900">Unit</th>
                                                        <th className="text-right py-1.5 px-2 font-semibold text-blue-900">Rate</th>
                                                        <th className="text-right py-1.5 px-2 font-semibold text-blue-900">Total</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {subItem.materials.map((material: any, mIndex: number) => (
                                                        <tr key={mIndex} className={`border-b border-blue-100 ${mIndex % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}`}>
                                                          <td className="py-1.5 px-2 text-gray-900">
                                                            <div>{material.material_name}</div>
                                                            {material.description && <div className="text-xs text-gray-500">{material.description}</div>}
                                                          </td>
                                                          <td className="py-1.5 px-2 text-center text-gray-700">{material.quantity}</td>
                                                          <td className="py-1.5 px-2 text-center text-gray-700 uppercase">{material.unit}</td>
                                                          <td className="py-1.5 px-2 text-right text-gray-700">{formatCurrency(material.unit_price)}</td>
                                                          <td className="py-1.5 px-2 text-right font-semibold text-blue-700">{formatCurrency(material.total_price || material.quantity * material.unit_price)}</td>
                                                        </tr>
                                                      ))}
                                                      <tr className="bg-blue-200 border-t-2 border-blue-400">
                                                        <td colSpan={4} className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">Materials Total:</td>
                                                        <td className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">
                                                          {formatCurrency(subItem.materials.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0))}
                                                        </td>
                                                      </tr>
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}

                                            {/* Sub-item Labour */}
                                            {subItem.labour?.length > 0 && (
                                              <div className="bg-orange-50/50 rounded-lg p-3 border border-orange-200">
                                                <h5 className="text-xs font-bold text-orange-900 mb-2 flex items-center gap-2">
                                                  <Users className="w-3.5 h-3.5" />
                                                  Labour
                                                </h5>
                                                <div className="bg-white rounded border border-orange-200 overflow-hidden">
                                                  <table className="w-full text-xs">
                                                    <thead className="bg-orange-100 border-b border-orange-200">
                                                      <tr>
                                                        <th className="text-left py-1.5 px-2 font-semibold text-orange-900">Role</th>
                                                        <th className="text-center py-1.5 px-2 font-semibold text-orange-900">Hours</th>
                                                        <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Rate/hr</th>
                                                        <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Total</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {subItem.labour.map((labour: any, lIndex: number) => (
                                                        <tr key={lIndex} className={`border-b border-orange-100 ${lIndex % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                          <td className="py-1.5 px-2 text-gray-900">{labour.labour_role}</td>
                                                          <td className="py-1.5 px-2 text-center text-gray-700">{labour.hours} hrs</td>
                                                          <td className="py-1.5 px-2 text-right text-gray-700">{formatCurrency(labour.rate_per_hour)}</td>
                                                          <td className="py-1.5 px-2 text-right font-semibold text-orange-700">{formatCurrency(labour.total_cost || labour.hours * labour.rate_per_hour)}</td>
                                                        </tr>
                                                      ))}
                                                      <tr className="bg-orange-200 border-t-2 border-orange-400">
                                                        <td colSpan={3} className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">Labour Total:</td>
                                                        <td className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">
                                                          {formatCurrency(subItem.labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0))}
                                                        </td>
                                                      </tr>
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Cost Summary */}
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                      <h5 className="text-sm font-bold text-gray-900 mb-3">Cost Summary</h5>
                                      <div className="space-y-1 text-xs">
                                        <div className="flex justify-between py-1">
                                          <span className="text-gray-600">Item Total (Qty × Rate):</span>
                                          <span className="font-semibold">{formatCurrency(item.item_total || (item.quantity || 0) * (item.rate || 0))}</span>
                                        </div>
                                        <div className="flex justify-between py-1">
                                          <span className="text-gray-600">Miscellaneous ({item.overhead_percentage || 0}%):</span>
                                          <span className="font-semibold">{formatCurrency(item.overhead_amount || 0)}</span>
                                        </div>
                                        <div className="flex justify-between py-1">
                                          <span className="text-gray-600">Overhead & Profit ({item.profit_margin_percentage || item.overhead_profit_percentage || 0}%):</span>
                                          <span className="font-semibold">{formatCurrency(item.profit_margin_amount || item.overhead_profit_amount || 0)}</span>
                                        </div>
                                        <div className="flex justify-between py-1 border-t border-gray-200 pt-1">
                                          <span className="text-gray-700 font-medium">Subtotal:</span>
                                          <span className="font-semibold">{formatCurrency(item.subtotal || item.before_discount || ((item.item_total || 0) + (item.miscellaneous_amount || 0) + (item.overhead_amount || 0) + (item.profit_margin_amount || item.overhead_profit_amount || 0)))}</span>
                                        </div>
                                        {(item.discount_percentage || 0) > 0 && (
                                          <>
                                            <div className="flex justify-between py-1 text-red-600">
                                              <span>Discount ({item.discount_percentage}%):</span>
                                              <span className="font-semibold">- {formatCurrency(item.discount_amount || 0)}</span>
                                            </div>
                                            <div className="flex justify-between py-1 border-t border-gray-200 pt-1">
                                              <span className="text-gray-700 font-medium">After Discount:</span>
                                              <span className="font-semibold">{formatCurrency(item.after_discount || 0)}</span>
                                            </div>
                                          </>
                                        )}
                                        {(item.vat_percentage || 0) > 0 && (
                                          <div className="flex justify-between py-1 border-t border-gray-200 pt-1">
                                            <span className="text-gray-700 font-medium">VAT ({item.vat_percentage}%) <span className="text-xs text-green-600">[ADDITIONAL]</span>:</span>
                                            <span className="font-semibold text-green-600">+ {formatCurrency(item.vat_amount || 0)}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between pt-2 border-t-2 border-gray-400 font-bold">
                                          <span className="text-gray-900">Final Total Price:</span>
                                          <span className="text-green-600">{formatCurrency(item.selling_price || item.estimatedSellingPrice || 0)}</span>
                                        </div>
                                        {(item.subItemsTotal || item.totalMaterialCost || item.totalLabourCost) && (item.subItemsTotal > 0 || item.totalMaterialCost > 0 || item.totalLabourCost > 0) && (
                                          <div className="mt-3 pt-3 border-t border-gray-300">
                                            <div className="text-xs text-gray-500 mb-2 font-medium">Raw Materials Breakdown:</div>
                                            {item.totalMaterialCost > 0 && (
                                              <div className="flex justify-between py-0.5">
                                                <span className="text-gray-500 text-xs">Materials:</span>
                                                <span className="text-gray-700 text-xs">{formatCurrency(item.totalMaterialCost)}</span>
                                              </div>
                                            )}
                                            {item.totalLabourCost > 0 && (
                                              <div className="flex justify-between py-0.5">
                                                <span className="text-gray-500 text-xs">Labour:</span>
                                                <span className="text-gray-700 text-xs">{formatCurrency(item.totalLabourCost)}</span>
                                              </div>
                                            )}
                                            {(item.subItemsTotal || (item.totalMaterialCost + item.totalLabourCost)) > 0 && (
                                              <div className="flex justify-between py-0.5 border-t border-gray-200 mt-1 pt-1">
                                                <span className="text-gray-600 text-xs font-medium">Raw Materials Total:</span>
                                                <span className="text-gray-700 text-xs font-semibold">{formatCurrency(item.subItemsTotal || (item.totalMaterialCost + item.totalLabourCost))}</span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* New Purchase Items */}
                      {showNewPurchaseItems && boqData.new_purchase && boqData.new_purchase.items.length > 0 && (
                        <div className="mb-8">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">New Purchase Items</h3>
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                              {boqData.new_purchase.items.length} Items
                            </span>
                          </div>
                          <div className="space-y-4">
                            {boqData.new_purchase.items.map((item: BOQItemDetailed, index: number) => (
                              <div key={item.master_item_id || index} className="border border-purple-200 rounded-lg bg-purple-50/30">
                                {/* Same structure as existing purchase, but with purple theme... */}
                                {/* For brevity, using same component structure */}
                                <div className="bg-purple-50 px-4 py-3 flex items-center justify-between border-b border-purple-200">
                                  <div className="flex items-center gap-3 flex-1">
                                    <button
                                      onClick={() => toggleItemExpanded(`new-${index}`)}
                                      className="p-1 hover:bg-purple-200 rounded"
                                    >
                                      {expandedItems.includes(`new-${index}`) ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </button>
                                    <div className="flex-1">
                                      <span className="font-medium">{item.item_name}</span>
                                      <span className="ml-2 px-2 py-0.5 text-xs bg-purple-200 text-purple-800 rounded font-semibold">NEW</span>
                                      {item.description && (
                                        <span className="ml-2 text-sm text-gray-600">{item.description}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-lg font-semibold text-green-600">
                                      {formatCurrency(item.selling_price)}
                                    </p>
                                    <p className="text-xs text-gray-600">Selling Price</p>
                                  </div>
                                </div>

                                {/* Expandable Details */}
                                {expandedItems.includes(`new-${index}`) && (
                                  <div className="p-4 space-y-4">
                                    {/* Materials - Purple Theme */}
                                    {item.materials?.length > 0 && (
                                      <div className="bg-gradient-to-r from-purple-50 to-purple-100/30 rounded-lg p-4 border border-purple-200">
                                        <h4 className="text-sm font-bold text-purple-900 mb-3 flex items-center gap-2">
                                          <div className="p-1.5 bg-white rounded shadow-sm">
                                            <Package className="w-4 h-4 text-purple-600" />
                                          </div>
                                          Raw Materials
                                        </h4>
                                        <div className="bg-white rounded-lg border border-purple-200 overflow-hidden">
                                          <table className="w-full text-sm">
                                            <thead className="bg-purple-100 border-b border-purple-200">
                                              <tr>
                                                <th className="text-left py-2 px-3 font-semibold text-purple-900">Material Name</th>
                                                <th className="text-center py-2 px-3 font-semibold text-purple-900">Quantity</th>
                                                <th className="text-center py-2 px-3 font-semibold text-purple-900">Unit</th>
                                                <th className="text-right py-2 px-3 font-semibold text-purple-900">Rate</th>
                                                <th className="text-right py-2 px-3 font-semibold text-purple-900">Amount</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {item.materials.map((material, mIndex) => (
                                                <tr key={mIndex} className={`border-b border-purple-100 ${mIndex % 2 === 0 ? 'bg-purple-50/30' : 'bg-white'}`}>
                                                  <td className="py-2.5 px-3 text-gray-900">{material.material_name}</td>
                                                  <td className="py-2.5 px-3 text-center text-gray-700">{material.quantity}</td>
                                                  <td className="py-2.5 px-3 text-center text-gray-700 uppercase">{material.unit}</td>
                                                  <td className="py-2.5 px-3 text-right text-gray-700">{formatCurrency(material.unit_price)}</td>
                                                  <td className="py-2.5 px-3 text-right font-semibold text-purple-700">{formatCurrency(material.total_price)}</td>
                                                </tr>
                                              ))}
                                              <tr className="bg-purple-200 border-t-2 border-purple-400">
                                                <td colSpan={4} className="py-2.5 px-3 font-bold text-purple-900 text-right">Total Materials:</td>
                                                <td className="py-2.5 px-3 font-bold text-purple-900 text-right">
                                                  {formatCurrency(item.materials.reduce((sum, m) => sum + (m.total_price || 0), 0))}
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {/* Labour - Orange Theme */}
                                    {item.labour?.length > 0 && (
                                      <div className="bg-gradient-to-r from-orange-50 to-orange-100/30 rounded-lg p-4 border border-orange-200">
                                        <h4 className="text-sm font-bold text-orange-900 mb-3 flex items-center gap-2">
                                          <div className="p-1.5 bg-white rounded shadow-sm">
                                            <Users className="w-4 h-4 text-orange-600" />
                                          </div>
                                          Labour Breakdown
                                        </h4>
                                        <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                                          <table className="w-full text-sm">
                                            <thead className="bg-orange-100 border-b border-orange-200">
                                              <tr>
                                                <th className="text-left py-2 px-3 font-semibold text-orange-900">Labour Role</th>
                                                <th className="text-center py-2 px-3 font-semibold text-orange-900">Working Hours</th>
                                                <th className="text-right py-2 px-3 font-semibold text-orange-900">Rate/Hour</th>
                                                <th className="text-right py-2 px-3 font-semibold text-orange-900">Amount</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {item.labour.map((labour, lIndex) => (
                                                <tr key={lIndex} className={`border-b border-orange-100 ${lIndex % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                  <td className="py-2.5 px-3 text-gray-900">{labour.labour_role}</td>
                                                  <td className="py-2.5 px-3 text-center text-gray-700">{labour.hours} hrs</td>
                                                  <td className="py-2.5 px-3 text-right text-gray-700">{formatCurrency(labour.rate_per_hour)}</td>
                                                  <td className="py-2.5 px-3 text-right font-semibold text-orange-700">{formatCurrency(labour.total_cost)}</td>
                                                </tr>
                                              ))}
                                              <tr className="bg-orange-200 border-t-2 border-orange-400">
                                                <td colSpan={3} className="py-2.5 px-3 font-bold text-orange-900 text-right">Total Labour:</td>
                                                <td className="py-2.5 px-3 font-bold text-orange-900 text-right">
                                                  {formatCurrency(item.labour.reduce((sum, l) => sum + (l.total_cost || 0), 0))}
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {/* Overheads & Profit - Green Theme */}
                                    <div className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border border-green-200">
                                      <h5 className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
                                        <div className="p-1.5 bg-white rounded shadow-sm">
                                          <Calculator className="w-4 h-4 text-green-600" />
                                        </div>
                                        Overheads & Profit
                                      </h5>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Overhead ({item.overhead_percentage}%):</span>
                                          <span className="font-semibold">{formatCurrency(item.overhead_amount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Profit Margin ({item.profit_margin_percentage}%):</span>
                                          <span className="font-semibold">{formatCurrency(item.profit_margin_amount)}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Cost Summary - Gray Theme */}
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                      <h5 className="text-sm font-bold text-gray-900 mb-3">Cost Summary</h5>
                                      <div className="space-y-1 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Base Cost:</span>
                                          <span className="font-semibold">{formatCurrency(item.base_cost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Overhead ({item.overhead_percentage || 0}%):</span>
                                          <span className="font-semibold">{formatCurrency(item.overhead_amount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Profit ({item.profit_margin_percentage || 0}%):</span>
                                          <span className="font-semibold">{formatCurrency(item.profit_margin_amount)}</span>
                                        </div>
                                        {(item.discount_percentage || 0) > 0 && (
                                          <div className="flex justify-between text-red-600">
                                            <span>Discount ({item.discount_percentage}%):</span>
                                            <span className="font-semibold">- {formatCurrency(item.discount_amount || 0)}</span>
                                          </div>
                                        )}
                                        {(item.vat_percentage || 0) > 0 && (
                                          <div className="flex justify-between text-blue-600">
                                            <span>VAT ({item.vat_percentage}%):</span>
                                            <span className="font-semibold">+ {formatCurrency(item.vat_amount || 0)}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between pt-2 border-t border-gray-300 font-bold">
                                          <span className="text-gray-900">Selling Price:</span>
                                          <span className="text-green-600">{formatCurrency(item.selling_price || item.estimatedSellingPrice || item.total_cost)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Fallback: Old format (backward compatibility) */}
                      {!boqData.existing_purchase && !boqData.new_purchase && boqData.items && (
                        <>
                          <h3 className="text-lg font-semibold text-gray-900 mb-4">BOQ Items</h3>
                          <div className="space-y-4">
                            {boqData.items?.map((item: BOQItemDetailed, index: number) => (
                          <div key={item.master_item_id || index} className="border border-gray-200 rounded-lg">
                            {/* Item Header */}
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <button
                                  onClick={() => toggleItemExpanded(`item-${index}`)}
                                  className="p-1 hover:bg-gray-200 rounded"
                                >
                                  {expandedItems.includes(`item-${index}`) ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                                <div className="flex-1">
                                  <span className="font-medium">{item.item_name}</span>
                                  {item.description && (
                                    <span className="ml-2 text-sm text-gray-600">{item.description}</span>
                                  )}
                                  {item.work_type && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                      {item.work_type}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-semibold text-green-600">
                                  {formatCurrency(item.selling_price)}
                                </p>
                                <p className="text-xs text-gray-600">Selling Price</p>
                              </div>
                            </div>

                            {/* Item Details (Expandable) */}
                            {expandedItems.includes(`item-${index}`) && (
                              <div className="p-4 space-y-4">
                                {/* Sub Items */}
                                {item.sub_items?.length > 0 && (
                                  <div className="space-y-4">
                                    {item.sub_items.map((subItem: any, subIndex: number) => (
                                      <div key={subIndex} className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border border-green-200">
                                        <div className="mb-3">
                                          <h4 className="text-sm font-bold text-green-900 flex items-center gap-2">
                                            <div className="p-1.5 bg-white rounded shadow-sm">
                                              <FileText className="w-4 h-4 text-green-600" />
                                            </div>
                                            Sub Item #{subIndex + 1}: {subItem.scope || subItem.sub_item_name}
                                          </h4>
                                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                            {subItem.size && <div><span className="text-gray-600">Size:</span> <span className="font-medium">{subItem.size}</span></div>}
                                            {subItem.location && <div><span className="text-gray-600">Location:</span> <span className="font-medium">{subItem.location}</span></div>}
                                            {subItem.brand && <div><span className="text-gray-600">Brand:</span> <span className="font-medium">{subItem.brand}</span></div>}
                                            <div><span className="text-gray-600">Qty:</span> <span className="font-medium">{subItem.quantity} {subItem.unit}</span></div>
                                          </div>
                                        </div>

                                        {/* Sub-item Materials */}
                                        {subItem.materials?.length > 0 && (
                                          <div className="mb-3 bg-blue-50/50 rounded-lg p-3 border border-blue-200">
                                            <h5 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-2">
                                              <Package className="w-3.5 h-3.5" />
                                              Raw Materials
                                            </h5>
                                            <div className="bg-white rounded border border-blue-200 overflow-hidden">
                                              <table className="w-full text-xs">
                                                <thead className="bg-blue-100 border-b border-blue-200">
                                                  <tr>
                                                    <th className="text-left py-1.5 px-2 font-semibold text-blue-900">Material</th>
                                                    <th className="text-center py-1.5 px-2 font-semibold text-blue-900">Qty</th>
                                                    <th className="text-center py-1.5 px-2 font-semibold text-blue-900">Unit</th>
                                                    <th className="text-right py-1.5 px-2 font-semibold text-blue-900">Rate</th>
                                                    <th className="text-right py-1.5 px-2 font-semibold text-blue-900">Total</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {subItem.materials.map((material: any, mIndex: number) => (
                                                    <tr key={mIndex} className={`border-b border-blue-100 ${mIndex % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}`}>
                                                      <td className="py-1.5 px-2 text-gray-900">
                                                        <div>{material.material_name}</div>
                                                        {material.description && <div className="text-xs text-gray-500">{material.description}</div>}
                                                      </td>
                                                      <td className="py-1.5 px-2 text-center text-gray-700">{material.quantity}</td>
                                                      <td className="py-1.5 px-2 text-center text-gray-700 uppercase">{material.unit}</td>
                                                      <td className="py-1.5 px-2 text-right text-gray-700">{formatCurrency(material.unit_price)}</td>
                                                      <td className="py-1.5 px-2 text-right font-semibold text-blue-700">{formatCurrency(material.total_price || material.quantity * material.unit_price)}</td>
                                                    </tr>
                                                  ))}
                                                  <tr className="bg-blue-200 border-t-2 border-blue-400">
                                                    <td colSpan={4} className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">Materials Total:</td>
                                                    <td className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">
                                                      {formatCurrency(subItem.materials.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0))}
                                                    </td>
                                                  </tr>
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}

                                        {/* Sub-item Labour */}
                                        {subItem.labour?.length > 0 && (
                                          <div className="bg-orange-50/50 rounded-lg p-3 border border-orange-200">
                                            <h5 className="text-xs font-bold text-orange-900 mb-2 flex items-center gap-2">
                                              <Users className="w-3.5 h-3.5" />
                                              Labour
                                            </h5>
                                            <div className="bg-white rounded border border-orange-200 overflow-hidden">
                                              <table className="w-full text-xs">
                                                <thead className="bg-orange-100 border-b border-orange-200">
                                                  <tr>
                                                    <th className="text-left py-1.5 px-2 font-semibold text-orange-900">Role</th>
                                                    <th className="text-center py-1.5 px-2 font-semibold text-orange-900">Hours</th>
                                                    <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Rate/hr</th>
                                                    <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Total</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {subItem.labour.map((labour: any, lIndex: number) => (
                                                    <tr key={lIndex} className={`border-b border-orange-100 ${lIndex % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                      <td className="py-1.5 px-2 text-gray-900">{labour.labour_role}</td>
                                                      <td className="py-1.5 px-2 text-center text-gray-700">{labour.hours} hrs</td>
                                                      <td className="py-1.5 px-2 text-right text-gray-700">{formatCurrency(labour.rate_per_hour)}</td>
                                                      <td className="py-1.5 px-2 text-right font-semibold text-orange-700">{formatCurrency(labour.total_cost || labour.hours * labour.rate_per_hour)}</td>
                                                    </tr>
                                                  ))}
                                                  <tr className="bg-orange-200 border-t-2 border-orange-400">
                                                    <td colSpan={3} className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">Labour Total:</td>
                                                    <td className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">
                                                      {formatCurrency(subItem.labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0))}
                                                    </td>
                                                  </tr>
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Overheads & Profit - Green Theme */}
                                <div className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border border-green-200">
                                  <h5 className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
                                    <div className="p-1.5 bg-white rounded shadow-sm">
                                      <Calculator className="w-4 h-4 text-green-600" />
                                    </div>
                                    Overheads & Profit
                                  </h5>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Overhead ({item.overhead_percentage}%):</span>
                                      <span className="font-semibold">{formatCurrency(item.overhead_amount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Profit Margin ({item.profit_margin_percentage}%):</span>
                                      <span className="font-semibold">{formatCurrency(item.profit_margin_amount)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Cost Summary - Gray Theme */}
                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                  <h5 className="text-sm font-bold text-gray-900 mb-3">Cost Summary</h5>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Base Cost:</span>
                                      <span className="font-semibold">{formatCurrency(item.base_cost)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Overhead ({item.overhead_percentage || 0}%):</span>
                                      <span className="font-semibold">{formatCurrency(item.overhead_amount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Profit ({item.profit_margin_percentage || 0}%):</span>
                                      <span className="font-semibold">{formatCurrency(item.profit_margin_amount)}</span>
                                    </div>
                                    {(item.discount_percentage || 0) > 0 && (
                                      <div className="flex justify-between text-red-600">
                                        <span>Discount ({item.discount_percentage}%):</span>
                                        <span className="font-semibold">- {formatCurrency(item.discount_amount || 0)}</span>
                                      </div>
                                    )}
                                    {(item.vat_percentage || 0) > 0 && (
                                      <div className="flex justify-between text-blue-600">
                                        <span>VAT ({item.vat_percentage}%):</span>
                                        <span className="font-semibold">+ {formatCurrency(item.vat_amount || 0)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between pt-2 border-t border-gray-300 font-bold">
                                      <span className="text-gray-900">Selling Price:</span>
                                      <span className="text-green-600">{formatCurrency(item.selling_price || item.estimatedSellingPrice || item.total_cost)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Overall Cost Summary - Updated to support both formats */}
                    {((boqData.existing_purchase && boqData.existing_purchase.items.length > 0) ||
                      (boqData.items && boqData.items.length > 0)) && (
                        <div className="mt-8 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border-2 border-indigo-200 shadow-lg">
                          <h3 className="text-lg font-bold text-indigo-900 mb-5 flex items-center gap-2">
                            <div className="p-2 bg-white rounded-lg shadow-sm">
                              <Calculator className="w-5 h-5 text-indigo-600" />
                            </div>
                            Overall Cost Summary
                          </h3>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Materials Summary */}
                            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <Package className="w-5 h-5 text-blue-600" />
                                <h4 className="font-semibold text-blue-900">Total Materials</h4>
                              </div>
                              <div className="space-y-2 text-sm">
                                {(() => {
                                  // Use combined_summary if available, otherwise calculate from items
                                  const allItems = boqData.existing_purchase?.items || boqData.items || [];
                                  const totalMaterialCost = boqData.combined_summary?.total_material_cost ||
                                                          boqData.summary?.total_material_cost ||
                                                          allItems.reduce((sum, item) => {
                                                            // Check if item has sub_items with materials
                                                            if (item.sub_items && item.sub_items.length > 0) {
                                                              return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                                                siSum + (si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || 0), 0) || 0), 0
                                                              );
                                                            }
                                                            // Otherwise use item-level materials
                                                            return sum + (item.materials?.reduce((mSum, m) => mSum + (m.total_price || 0), 0) || 0);
                                                          }, 0);
                                  const totalMaterialCount = boqData.combined_summary?.total_materials ||
                                                           boqData.summary?.total_materials ||
                                                           allItems.reduce((sum, item) => {
                                                             // Check if item has sub_items with materials
                                                             if (item.sub_items && item.sub_items.length > 0) {
                                                               return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                                                 siSum + (si.materials?.length || 0), 0
                                                               );
                                                             }
                                                             // Otherwise use item-level materials
                                                             return sum + (item.materials?.length || 0);
                                                           }, 0);
                                  return (
                                    <>
                                      <div className="flex justify-between text-gray-600">
                                        <span>Total Items:</span>
                                        <span className="font-medium">{totalMaterialCount}</span>
                                      </div>
                                      <div className="flex justify-between pt-2 border-t border-blue-100 font-bold text-blue-700">
                                        <span>Total Cost:</span>
                                        <span>{formatCurrency(totalMaterialCost)}</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Labour Summary */}
                            <div className="bg-white rounded-lg p-4 border border-orange-200 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <Users className="w-5 h-5 text-orange-600" />
                                <h4 className="font-semibold text-orange-900">Total Labour</h4>
                              </div>
                              <div className="space-y-2 text-sm">
                                {(() => {
                                  const allItems = boqData.existing_purchase?.items || boqData.items || [];
                                  const totalLabourCost = boqData.combined_summary?.total_labour_cost ||
                                                        boqData.summary?.total_labour_cost ||
                                                        allItems.reduce((sum, item) => {
                                                          // Check if item has sub_items with labour
                                                          if (item.sub_items && item.sub_items.length > 0) {
                                                            return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                                              siSum + (si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || 0), 0) || 0), 0
                                                            );
                                                          }
                                                          // Otherwise use item-level labour
                                                          return sum + (item.labour?.reduce((lSum, l) => lSum + (l.total_cost || 0), 0) || 0);
                                                        }, 0);
                                  const totalLabourCount = boqData.combined_summary?.total_labour ||
                                                         boqData.summary?.total_labour ||
                                                         allItems.reduce((sum, item) => {
                                                           // Check if item has sub_items with labour
                                                           if (item.sub_items && item.sub_items.length > 0) {
                                                             return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                                               siSum + (si.labour?.length || 0), 0
                                                             );
                                                           }
                                                           // Otherwise use item-level labour
                                                           return sum + (item.labour?.length || 0);
                                                         }, 0);
                                  return (
                                    <>
                                      <div className="flex justify-between text-gray-600">
                                        <span>Total Resources:</span>
                                        <span className="font-medium">{totalLabourCount}</span>
                                      </div>
                                      <div className="flex justify-between pt-2 border-t border-orange-100 font-bold text-orange-700">
                                        <span>Total Cost:</span>
                                        <span>{formatCurrency(totalLabourCost)}</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Grand Total */}
                          <div className="mt-6 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-5 border-2 border-green-300">
                            <div className="space-y-3">
                              {(() => {
                                const allItems = boqData.existing_purchase?.items || boqData.items || [];

                                // Calculate totals from all items
                                const totalItemsAmount = allItems.reduce((sum, item) => sum + (item.item_total || 0), 0);
                                const totalMiscellaneous = allItems.reduce((sum, item) => sum + (item.overhead_amount || 0), 0);
                                const totalOverheadProfit = allItems.reduce((sum, item) => sum + (item.profit_margin_amount || 0), 0);
                                const totalSubtotal = allItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
                                const totalDiscount = allItems.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
                                const totalAfterDiscount = allItems.reduce((sum, item) => sum + (item.after_discount || 0), 0);
                                const totalVAT = allItems.reduce((sum, item) => sum + (item.vat_amount || 0), 0);
                                const grandTotal = boqData.combined_summary?.selling_price ||
                                                 boqData.summary?.selling_price ||
                                                 allItems.reduce((sum, item) => sum + (item.selling_price || item.total_cost || 0), 0);

                                return (
                                  <>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Total Items Amount:</span>
                                      <span className="font-semibold">{formatCurrency(totalItemsAmount)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Miscellaneous:</span>
                                      <span className="font-semibold">{formatCurrency(totalMiscellaneous)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Overhead & Profit:</span>
                                      <span className="font-semibold">{formatCurrency(totalOverheadProfit)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm font-medium border-t border-green-300 pt-2 mt-2">
                                      <span className="text-gray-800">Subtotal:</span>
                                      <span className="font-semibold">{formatCurrency(totalSubtotal)}</span>
                                    </div>
                                    {totalDiscount > 0 && (
                                      <div className="flex justify-between text-sm text-red-600">
                                        <span>Total Discount:</span>
                                        <span className="font-semibold">- {formatCurrency(totalDiscount)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between text-sm font-medium">
                                      <span className="text-gray-800">After Discount:</span>
                                      <span className="font-semibold">{formatCurrency(totalAfterDiscount)}</span>
                                    </div>
                                    {totalVAT > 0 && (
                                      <div className="flex justify-between text-sm text-green-600 font-medium">
                                        <span>Total VAT <span className="text-xs">[ADDITIONAL]</span>:</span>
                                        <span className="font-semibold">+ {formatCurrency(totalVAT)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between pt-3 border-t-2 border-green-400 text-lg font-bold">
                                      <span className="text-green-900">Grand Total:</span>
                                      <span className="text-green-700">{formatCurrency(grandTotal)}</span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  // Simple BOQ display when full details aren't loaded
                  <div className="text-center py-8">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
                      <p className="text-yellow-800">
                        Click to load detailed BOQ information
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BOQDetailsModal;