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
  Clock,
  TrendingUp,
  HelpCircle,
  Info,
  ArrowLeft
} from 'lucide-react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { estimatorService } from '../services/estimatorService';
import { BOQGetResponse, BOQItemDetailed } from '../types';
import { toast } from 'sonner';
import BOQHistoryTimeline from './BOQHistoryTimeline';
import BOQRevisionHistory from './BOQRevisionHistory';
import BOQComparisonView from './BOQComparisonView';
import ModernLoadingSpinners from '../../../components/ui/ModernLoadingSpinners';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface BOQDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boq: any; // Can be either simple BOQ data from list or full BOQGetResponse
  onEdit?: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
  onApprove?: () => void; // For TD/PM approval
  onReject?: () => void; // For TD/PM rejection
  onRequestExtension?: () => void; // For PM to request day extension
  showNewPurchaseItems?: boolean; // Control whether to show new_purchase section (default: false for Projects, true for Change Requests)
  refreshTrigger?: number; // Add a trigger to force refresh from parent
  fullScreen?: boolean; // Enable full-screen mode (no backdrop, back arrow instead of X)
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
  onRequestExtension,
  showNewPurchaseItems = false, // Default to false (Projects page won't show new items)
  refreshTrigger,
  fullScreen = false // Default to modal mode
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

  const formatCurrency = (value: number, showCurrency: boolean = false) => {
    const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return showCurrency ? `AED ${formatted}` : formatted;
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
        <div className={fullScreen ? "relative w-full min-h-screen" : "fixed inset-0 z-50 overflow-y-auto"}>
          <div className={fullScreen ? "w-full min-h-screen" : "flex items-center justify-center min-h-screen px-4"}>
            {!fullScreen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50"
                onClick={onClose}
              />
            )}

            <motion.div
              initial={fullScreen ? {} : { opacity: 0, scale: 0.95 }}
              animate={fullScreen ? {} : { opacity: 1, scale: 1 }}
              exit={fullScreen ? {} : { opacity: 0, scale: 0.95 }}
              className={fullScreen
                ? "relative bg-white w-full min-h-screen"
                : "relative bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
              }
            >
              {/* Header */}
              <div className={`bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b border-blue-100 px-6 py-5 ${fullScreen ? 'sticky top-0 z-50 bg-white' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Back button - Show on LEFT in fullScreen mode */}
                    {fullScreen && (
                      <button
                        onClick={onClose}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Go Back"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                    )}
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

                    {/* Request Extension Button - For PM on approved projects */}
                    {onRequestExtension && (
                      <button
                        onClick={onRequestExtension}
                        className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-sm"
                        title="Request Day Extension"
                      >
                        <Calendar className="w-5 h-5" />
                        Request Extension
                      </button>
                    )}

                    {onEdit && (() => {
                      const status = displayData?.status?.toLowerCase() || '';
                      // Can edit if: draft, approved, revision_approved, sent_for_confirmation, under_revision, pending_revision, pending_pm_approval, pending
                      // Cannot edit if: client_confirmed, rejected, completed, client_rejected, client_cancelled
                      const canEdit = !status ||
                        status === 'draft' ||
                        status === 'approved' ||
                        status === 'revision_approved' ||
                        status === 'sent_for_confirmation' ||
                        status === 'under_revision' ||
                        status === 'pending_revision' ||
                        status === 'pending_pm_approval' ||
                        status === 'pending';
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
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload();
                        }}
                        className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                        title="Download BOQ"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    )}
                    {/* Close button - Only show in normal modal mode (not fullScreen) */}
                    {!fullScreen && (
                      <button
                        onClick={onClose}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
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
                  {/* Show Client Revisions tab when revision_number is not 0 (i.e., has client revisions) */}
                  {(displayData?.revision_number != null && displayData.revision_number !== 0) && (
                    <button
                      onClick={() => setActiveTab('revisions')}
                      className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-all ${
                        activeTab === 'revisions'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-1 sm:gap-2">
                        <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Client Revisions</span>
                        <span className="sm:hidden">Revisions</span>
                        {displayData.revision_number > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">
                            {displayData.revision_number}
                          </span>
                        )}
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className={fullScreen ? "p-6" : "overflow-y-auto max-h-[calc(90vh-200px)] p-6"}>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <ModernLoadingSpinners size="lg" />
                    <p className="mt-6 text-gray-600 text-sm font-medium">Loading BOQ details...</p>
                  </div>
                ) : activeTab === 'history' ? (
                  <BOQHistoryTimeline
                    boqId={displayData?.boq_id || boq?.boq_id}
                    onDataChange={fetchBOQDetails}
                  />
                ) : activeTab === 'revisions' ? (
                  <BOQRevisionHistory
                    boqId={displayData?.boq_id || boq?.boq_id}
                  />
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

                    {/* Project Timeline */}
                    {(boqData.project_details?.start_date || boqData.project_details?.end_date || boqData.project_details?.duration_days) && (
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100/30 rounded-lg p-5 mb-6 border border-blue-200">
                        <h3 className="text-base font-bold text-blue-900 mb-4 flex items-center gap-2">
                          <div className="p-1.5 bg-white rounded-lg shadow-sm">
                            <Clock className="w-4 h-4 text-blue-600" />
                          </div>
                          Project Timeline
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {boqData.project_details?.start_date && (
                            <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                              <span className="text-xs text-blue-700 font-medium block mb-1">Start Date</span>
                              <p className="font-semibold text-gray-900 flex items-center gap-1">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                {new Date(boqData.project_details.start_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                          )}
                          {boqData.project_details?.end_date && (
                            <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                              <span className="text-xs text-blue-700 font-medium block mb-1">End Date</span>
                              <p className="font-semibold text-gray-900 flex items-center gap-1">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                {new Date(boqData.project_details.end_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                          )}
                          {boqData.project_details?.duration_days !== undefined && boqData.project_details?.duration_days !== null && (
                            <div className="bg-white/60 rounded-lg p-3 border border-blue-200">
                              <span className="text-xs text-blue-700 font-medium block mb-1">Duration</span>
                              <p className="font-semibold text-gray-900 flex items-center gap-1">
                                <Clock className="w-4 h-4 text-blue-500" />
                                {boqData.project_details.duration_days} days
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Combined Section: Preliminaries FIRST, then BOQ Items */}
                    <div>
                      {/* 1. PRELIMINARIES SECTION - Shown FIRST */}
                      {boqData.preliminaries && (boqData.preliminaries.items?.length > 0 || boqData.preliminaries.notes) && (
                        <div className="mb-6">
                          {/* Header */}
                          <div className="bg-gray-100 border border-gray-300 rounded-t-lg p-4 flex items-center gap-3">
                            <FileText className="w-6 h-6 text-gray-700" />
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">Preliminaries & Approval Works</h3>
                              <p className="text-xs text-gray-600">Selected conditions and terms</p>
                            </div>
                          </div>

                          {/* Preliminary Items List */}
                          {boqData.preliminaries.items && boqData.preliminaries.items.length > 0 && (
                            <div className="bg-white border-x border-gray-300 p-4">
                              <div className="space-y-2">
                                {boqData.preliminaries.items.map((item: any, index: number) => (
                                  <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:shadow-sm transition-shadow">
                                    <div className="flex items-start gap-3">
                                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-600 text-white flex items-center justify-center text-xs font-bold">
                                        {index + 1}
                                      </span>
                                      <div className="flex-1">
                                        <p className="text-sm text-gray-800">{item.description}</p>
                                        {item.isCustom && (
                                          <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded font-medium">
                                            Custom
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Cost Summary */}
                          {boqData.preliminaries.cost_details && (boqData.preliminaries.cost_details.quantity || boqData.preliminaries.cost_details.rate || boqData.preliminaries.cost_details.amount) && (
                            <div className="bg-white border-x border-b border-gray-300 rounded-b-lg p-4">
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <h5 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h5>
                                <div className="grid grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Quantity</p>
                                    <p className="text-sm font-medium text-gray-900">{boqData.preliminaries.cost_details.quantity || 0}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Unit</p>
                                    <p className="text-sm font-medium text-gray-900">{boqData.preliminaries.cost_details.unit || 'Nos'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Rate</p>
                                    <p className="text-sm font-medium text-gray-900">{formatCurrency(boqData.preliminaries.cost_details.rate || 0)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                                    <p className="text-sm font-bold text-gray-900">{formatCurrency(boqData.preliminaries.cost_details.amount || 0)}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Internal Cost Breakdown for Preliminaries */}
                              {boqData.preliminaries.cost_details.internal_cost !== undefined && (
                                <div className="mt-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                                  <h5 className="text-sm font-semibold text-gray-900 mb-3">Internal Cost Summary</h5>
                                  {(() => {
                                    const costDetails = boqData.preliminaries.cost_details;
                                    const internalCostBase = costDetails.internal_cost || 0;
                                    const amount = costDetails.amount || 0;
                                    const miscPct = costDetails.misc_percentage || 10;
                                    const overheadPct = costDetails.overhead_profit_percentage || 25;
                                    const transportPct = costDetails.transport_percentage || 5;

                                    const miscAmount = (amount * miscPct) / 100;
                                    const overheadAmount = (amount * overheadPct) / 100;
                                    const transportAmount = (amount * transportPct) / 100;
                                    const totalInternalCost = internalCostBase + miscAmount + overheadAmount + transportAmount;

                                    return (
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between items-center">
                                          <span className="text-gray-600">Base Internal Cost:</span>
                                          <span className="font-semibold text-gray-900">{formatCurrency(internalCostBase)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                                          <span className="text-gray-600">Miscellaneous ({miscPct}%):</span>
                                          <span className="font-semibold text-yellow-700">{formatCurrency(miscAmount)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="text-gray-600">Overhead & Profit ({overheadPct}%):</span>
                                          <span className="font-semibold text-indigo-600">{formatCurrency(overheadAmount)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="text-gray-600">Transport ({transportPct}%):</span>
                                          <span className="font-semibold text-teal-600">{formatCurrency(transportAmount)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t-2 border-purple-300">
                                          <span className="text-gray-800 font-bold">Total Internal Cost:</span>
                                          <span className="text-lg font-bold text-red-600">{formatCurrency(totalInternalCost)}</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {boqData.preliminaries.notes && (
                                <div className="mt-3 bg-white rounded-lg p-4 border border-gray-200">
                                  <h5 className="text-sm font-semibold text-gray-900 mb-2">Additional Notes</h5>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{boqData.preliminaries.notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}


                      {/* 2. BOQ ITEMS SECTION - Shown AFTER Preliminaries */}
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
                                  </div>
                                  {/* Second row with description only */}
                                  {item.description && (
                                    <div className="ml-9 text-sm text-gray-600">
                                      {item.description}
                                    </div>
                                  )}
                                </div>

                                {/* Item Details (Expandable) */}
                                {expandedItems.includes(`existing-${index}`) && (
                                  <div className="p-4 space-y-4">
                                    {/* Sub Items */}
                                    {item.sub_items?.length > 0 && (
                                      <div className="space-y-4">
                                        {item.sub_items.map((subItem: any, subIndex: number) => (
                                          <div key={subIndex} className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border-2 border-green-400 shadow-sm">
                                            <div className="mb-3">
                                              <h4 className="text-sm font-bold text-green-900 flex items-center gap-2">
                                                <div className="p-1.5 bg-white rounded shadow-sm">
                                                  <FileText className="w-4 h-4 text-green-600" />
                                                </div>
                                                Sub Item #{subIndex + 1}: {subItem.sub_item_name || subItem.scope}
                                              </h4>
                                              {subItem.scope && (
                                                <p className="text-xs text-gray-600 mt-1 ml-8"><strong>Scope:</strong> {subItem.scope}</p>
                                              )}
                                              <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                                                {subItem.size && <div><span className="text-gray-600">Size:</span> <span className="font-medium">{subItem.size}</span></div>}
                                                {subItem.location && <div><span className="text-gray-600">Location:</span> <span className="font-medium">{subItem.location}</span></div>}
                                                {subItem.brand && <div><span className="text-gray-600">Brand:</span> <span className="font-medium">{subItem.brand}</span></div>}
                                                <div><span className="text-gray-600">Qty:</span> <span className="font-medium">{subItem.quantity} {subItem.unit}</span></div>
                                                {subItem.rate && <div><span className="text-gray-600">Rate:</span> <span className="font-medium">₹{subItem.rate}</span></div>}
                                              </div>
                                            </div>

                                            {/* Sub-item Materials */}
                                            {subItem.materials?.length > 0 && (
                                              <div className="mb-3 bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
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
                                                      {subItem.materials.map((material: any, mIndex: number) => {
                                                        const materialTotal = material.total_price || (material.quantity * material.unit_price);
                                                        return (
                                                          <tr key={mIndex} className={`border-b border-blue-100 ${mIndex % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}`}>
                                                            <td className="py-1.5 px-2 text-gray-900">
                                                              <div>{material.material_name}</div>
                                                              {material.description && <div className="text-xs text-gray-500">{material.description}</div>}
                                                            </td>
                                                            <td className="py-1.5 px-2 text-center text-gray-700">{material.quantity}</td>
                                                            <td className="py-1.5 px-2 text-center text-gray-700 uppercase">{material.unit}</td>
                                                            <td className="py-1.5 px-2 text-right text-gray-700">{formatCurrency(material.unit_price)}</td>
                                                            <td className="py-1.5 px-2 text-right font-semibold text-blue-700">{formatCurrency(materialTotal)}</td>
                                                          </tr>
                                                        );
                                                      })}
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
                                              <div className="bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
                                                <h5 className="text-xs font-bold text-orange-900 mb-2 flex items-center gap-2">
                                                  <Users className="w-3.5 h-3.5" />
                                                  Labour
                                                </h5>
                                                <div className="bg-white rounded border border-orange-200 overflow-hidden">
                                                  <table className="w-full text-xs">
                                                    <thead className="bg-orange-100 border-b border-orange-200">
                                                      <tr>
                                                        <th className="text-left py-1.5 px-2 font-semibold text-orange-900">Role</th>
                                                        <th className="text-center py-1.5 px-2 font-semibold text-orange-900">Work Type</th>
                                                        <th className="text-center py-1.5 px-2 font-semibold text-orange-900">Hours</th>
                                                        <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Rate/hr</th>
                                                        <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Total</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {subItem.labour.map((labour: any, lIndex: number) => (
                                                        <tr key={lIndex} className={`border-b border-orange-100 ${lIndex % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                          <td className="py-1.5 px-2 text-gray-900">{labour.labour_role}</td>
                                                          <td className="py-1.5 px-2 text-center text-gray-700 capitalize">{labour.work_type?.replace('_', ' ') || 'Daily Wages'}</td>
                                                          <td className="py-1.5 px-2 text-center text-gray-700">{labour.hours} hrs</td>
                                                          <td className="py-1.5 px-2 text-right text-gray-700">{formatCurrency(labour.rate_per_hour)}</td>
                                                          <td className="py-1.5 px-2 text-right font-semibold text-orange-700">{formatCurrency(labour.total_cost || labour.hours * labour.rate_per_hour)}</td>
                                                        </tr>
                                                      ))}
                                                      <tr className="bg-orange-200 border-t-2 border-orange-400">
                                                        <td colSpan={4} className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">Labour Total:</td>
                                                        <td className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">
                                                          {formatCurrency(subItem.labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0))}
                                                        </td>
                                                      </tr>
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}

                                            {/* Cost Breakdown Percentages (Per-Sub-Item) */}
                                            <div className="bg-purple-50/50 rounded-lg p-3 border border-purple-300 mt-3">
                                              <h5 className="text-xs font-bold text-purple-900 mb-2 flex items-center gap-2">
                                                <Calculator className="w-3.5 h-3.5" />
                                                Cost Breakdown Percentages
                                              </h5>
                                              <div className="space-y-1.5 text-xs">
                                                {(() => {
                                                  const clientAmount = (subItem.quantity || 0) * (subItem.rate || 0);
                                                  const miscPercentage = subItem.misc_percentage || 10;
                                                  const miscAmount = subItem.misc_amount || (clientAmount * (miscPercentage / 100));
                                                  const overheadProfitPercentage = subItem.overhead_profit_percentage || 25;
                                                  const overheadProfitAmount = subItem.overhead_profit_amount || (clientAmount * (overheadProfitPercentage / 100));
                                                  const transportPercentage = subItem.transport_percentage || 5;
                                                  const transportAmount = subItem.transport_amount || (clientAmount * (transportPercentage / 100));

                                                  return (
                                                    <>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Client Amount (Qty × Rate):</span>
                                                        <span className="font-semibold text-gray-900">{formatCurrency(clientAmount)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Miscellaneous ({miscPercentage}%):</span>
                                                        <span className="font-semibold text-red-600">- {formatCurrency(miscAmount)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Overhead & Profit ({overheadProfitPercentage}%):</span>
                                                        <span className="font-semibold text-red-600">- {formatCurrency(overheadProfitAmount)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Transport ({transportPercentage}%):</span>
                                                        <span className="font-semibold text-red-600">- {formatCurrency(transportAmount)}</span>
                                                      </div>
                                                    </>
                                                  );
                                                })()}
                                              </div>
                                            </div>

                                            {/* Profit Analysis (Per-Sub-Item) */}
                                            <div className="bg-green-50/50 rounded-lg p-3 border border-green-300 mt-3">
                                              <div className="flex items-center justify-between mb-2">
                                                <h5 className="text-xs font-bold text-green-900 flex items-center gap-2">
                                                  <Info className="w-3.5 h-3.5" />
                                                  Profit Analysis
                                                </h5>
                                                <Popover>
                                                  <PopoverTrigger asChild>
                                                    <button className="p-1 hover:bg-green-200 rounded-full transition-colors" title="View Calculation Formulas">
                                                      <HelpCircle className="w-3.5 h-3.5 text-green-700" />
                                                    </button>
                                                  </PopoverTrigger>
                                                  <PopoverContent className="w-96 bg-white">
                                                    <div className="space-y-3">
                                                      <h6 className="font-bold text-sm text-gray-900 border-b pb-2">BOQ Calculation Formulas</h6>
                                                      <div className="space-y-2 text-xs">
                                                        <div className="bg-blue-50 p-2 rounded">
                                                          <strong className="text-blue-900">Client Amount:</strong>
                                                          <p className="text-gray-700 mt-1">= Quantity × Rate</p>
                                                        </div>
                                                        <div className="bg-orange-50 p-2 rounded">
                                                          <strong className="text-orange-900">Materials Cost:</strong>
                                                          <p className="text-gray-700 mt-1">= Sum of all material costs</p>
                                                        </div>
                                                        <div className="bg-purple-50 p-2 rounded">
                                                          <strong className="text-purple-900">Labour Cost:</strong>
                                                          <p className="text-gray-700 mt-1">= Sum of all labour costs</p>
                                                        </div>
                                                        <div className="bg-yellow-50 p-2 rounded">
                                                          <strong className="text-yellow-900">Misc:</strong>
                                                          <p className="text-gray-700 mt-1">= Client Amount × (Misc % / 100)</p>
                                                        </div>
                                                        <div className="bg-indigo-50 p-2 rounded">
                                                          <strong className="text-indigo-900">Overhead & Profit:</strong>
                                                          <p className="text-gray-700 mt-1">= Client Amount × (O&P % / 100)</p>
                                                        </div>
                                                        <div className="bg-teal-50 p-2 rounded">
                                                          <strong className="text-teal-900">Transport:</strong>
                                                          <p className="text-gray-700 mt-1">= Client Amount × (Transport % / 100)</p>
                                                        </div>
                                                        <div className="bg-red-50 p-2 rounded border-2 border-red-200">
                                                          <strong className="text-red-900">Internal Cost (Total):</strong>
                                                          <p className="text-gray-700 mt-1">= Materials + Labour + Misc + O&P + Transport</p>
                                                        </div>
                                                        <div className="bg-green-50 p-2 rounded border-2 border-green-200">
                                                          <strong className="text-green-900">Planned Profit:</strong>
                                                          <p className="text-gray-700 mt-1">= Overhead & Profit amount</p>
                                                        </div>
                                                        <div className="bg-emerald-50 p-2 rounded border-2 border-emerald-200">
                                                          <strong className="text-emerald-900">Negotiable Margins:</strong>
                                                          <p className="text-gray-700 mt-1">= Client Amount - Internal Cost (Total)</p>
                                                          <p className="text-gray-500 text-xs mt-0.5 italic">Shows actual profit after all costs including O&P</p>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </PopoverContent>
                                                </Popover>
                                              </div>
                                              <div className="space-y-1.5 text-xs">
                                                {(() => {
                                                  const clientAmount = (subItem.quantity || 0) * (subItem.rate || 0);
                                                  const materialCost = subItem.material_cost || (subItem.materials?.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0) || 0);
                                                  const labourCost = subItem.labour_cost || (subItem.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0);
                                                  const miscAmount = subItem.misc_amount || (clientAmount * ((subItem.misc_percentage || 10) / 100));
                                                  const transportAmount = subItem.transport_amount || (clientAmount * ((subItem.transport_percentage || 5) / 100));
                                                  const plannedProfit = subItem.planned_profit || (clientAmount * ((subItem.overhead_profit_percentage || 25) / 100));
                                                  const internalCost = subItem.internal_cost || (materialCost + labourCost + miscAmount + plannedProfit + transportAmount);
                                                  const negotiableMargin = subItem.actual_profit || (clientAmount - internalCost);

                                                  return (
                                                    <>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Client Amount:</span>
                                                        <span className="font-semibold text-gray-900">{formatCurrency(clientAmount)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Materials Cost:</span>
                                                        <span className="font-semibold text-gray-900">{formatCurrency(materialCost)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Labour Cost:</span>
                                                        <span className="font-semibold text-gray-900">{formatCurrency(labourCost)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Misc ({subItem.misc_percentage || 10}%):</span>
                                                        <span className="font-semibold text-gray-900">{formatCurrency(miscAmount)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Overhead & Profit ({subItem.overhead_profit_percentage || 25}%):</span>
                                                        <span className="font-semibold text-gray-900">{formatCurrency(plannedProfit)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-700">Transport ({subItem.transport_percentage || 5}%):</span>
                                                        <span className="font-semibold text-gray-900">{formatCurrency(transportAmount)}</span>
                                                      </div>
                                                      <div className="flex justify-between pt-1.5 border-t border-gray-300">
                                                        <span className="text-gray-800 font-bold">Internal Cost (Total):</span>
                                                        <span className="font-bold text-red-600">{formatCurrency(internalCost)}</span>
                                                      </div>
                                                      <div className="flex justify-between pt-1.5 mt-1.5 border-t border-green-300">
                                                        <span className="text-gray-700 font-medium">Planned Profit:</span>
                                                        <span className="font-semibold text-blue-600">{formatCurrency(plannedProfit)}</span>
                                                      </div>
                                                      <div className="flex justify-between">
                                                        <span className="text-gray-800 font-medium">Negotiable Margins:</span>
                                                        <span className={`font-bold ${negotiableMargin >= plannedProfit ? 'text-green-600' : 'text-orange-600'}`}>
                                                          {formatCurrency(negotiableMargin)}
                                                        </span>
                                                      </div>
                                                    </>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Cost Analysis (Item-Level) */}
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border-2 border-blue-300 shadow-sm">
                                      <h5 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                                        <Calculator className="w-4 h-4" />
                                        Cost Analysis
                                      </h5>
                                      <div className="space-y-2 text-sm">
                                        {(() => {
                                          const clientCost = item.client_cost || item.sub_items?.reduce((sum: number, si: any) => sum + ((si.quantity || 0) * (si.rate || 0)), 0) || 0;
                                          const internalCost = item.internal_cost || item.sub_items?.reduce((sum: number, si: any) => {
                                            const materialCost = si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || m.quantity * m.unit_price), 0) || 0;
                                            const labourCost = si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0;
                                            const subClientAmount = (si.quantity || 0) * (si.rate || 0);
                                            const miscAmount = subClientAmount * ((si.misc_percentage || 10) / 100);
                                            const overheadProfitAmount = subClientAmount * ((si.overhead_profit_percentage || 25) / 100);
                                            const transportAmount = subClientAmount * ((si.transport_percentage || 5) / 100);
                                            return sum + materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount;
                                          }, 0) || 0;
                                          const projectMargin = item.project_margin || (clientCost - internalCost);
                                          const marginPercentage = clientCost > 0 ? ((projectMargin / clientCost) * 100) : 0;

                                          return (
                                            <>
                                              <div className="flex justify-between items-center py-1">
                                                <span className="text-gray-700 font-medium">Client Cost (Total):</span>
                                                <span className="text-blue-700 font-bold text-base">{formatCurrency(clientCost)}</span>
                                              </div>
                                              <div className="flex justify-between items-center py-1">
                                                <span className="text-gray-700 font-medium">Internal Cost (Total):</span>
                                                <span className="text-orange-600 font-semibold">{formatCurrency(internalCost)}</span>
                                              </div>
                                              <div className="flex justify-between items-center pt-2 border-t-2 border-blue-400">
                                                <span className="text-gray-900 font-bold">Project Margin:</span>
                                                <div className="text-right">
                                                  <div className={`font-bold text-lg ${projectMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(projectMargin)}
                                                  </div>
                                                  <div className={`text-xs font-semibold ${marginPercentage >= 20 ? 'text-green-600' : marginPercentage >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    ({marginPercentage.toFixed(1)}% margin)
                                                  </div>
                                                </div>
                                              </div>
                                            </>
                                          );
                                        })()}
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
                                </div>

                                {/* Expandable Details */}
                                {expandedItems.includes(`new-${index}`) && (
                                  <div className="p-4 space-y-4">
                                    {/* Materials - Purple Theme */}
                                    {item.materials?.length > 0 && (
                                      <div className="bg-red-50/20 rounded-lg p-4 border border-red-300 hover:border-red-400 transition-all duration-200">
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
                                      <div className="bg-red-50/20 rounded-lg p-4 border border-red-300 hover:border-red-400 transition-all duration-200">
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
                                                <th className="text-center py-2 px-3 font-semibold text-orange-900">Work Type</th>
                                                <th className="text-center py-2 px-3 font-semibold text-orange-900">Working Hours</th>
                                                <th className="text-right py-2 px-3 font-semibold text-orange-900">Rate/Hour</th>
                                                <th className="text-right py-2 px-3 font-semibold text-orange-900">Amount</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {item.labour.map((labour, lIndex) => (
                                                <tr key={lIndex} className={`border-b border-orange-100 ${lIndex % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                  <td className="py-2.5 px-3 text-gray-900">{labour.labour_role}</td>
                                                  <td className="py-2.5 px-3 text-center text-gray-700 capitalize">{labour.work_type?.replace('_', ' ') || 'Daily Wages'}</td>
                                                  <td className="py-2.5 px-3 text-center text-gray-700">{labour.hours} hrs</td>
                                                  <td className="py-2.5 px-3 text-right text-gray-700">{formatCurrency(labour.rate_per_hour)}</td>
                                                  <td className="py-2.5 px-3 text-right font-semibold text-orange-700">{formatCurrency(labour.total_cost)}</td>
                                                </tr>
                                              ))}
                                              <tr className="bg-orange-200 border-t-2 border-orange-400">
                                                <td colSpan={4} className="py-2.5 px-3 font-bold text-orange-900 text-right">Total Labour:</td>
                                                <td className="py-2.5 px-3 font-bold text-orange-900 text-right">
                                                  {formatCurrency(item.labour.reduce((sum, l) => sum + (l.total_cost || 0), 0))}
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {/* Cost Analysis (Item-Level) */}
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border-2 border-blue-300 shadow-sm">
                                      <h5 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                                        <Calculator className="w-4 h-4" />
                                        Cost Analysis
                                      </h5>
                                      <div className="space-y-2 text-sm">
                                        {(() => {
                                          const clientCost = item.client_cost || item.sub_items?.reduce((sum: number, si: any) => sum + ((si.quantity || 0) * (si.rate || 0)), 0) || 0;
                                          const internalCost = item.internal_cost || item.sub_items?.reduce((sum: number, si: any) => {
                                            const materialCost = si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || m.quantity * m.unit_price), 0) || 0;
                                            const labourCost = si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0;
                                            const subClientAmount = (si.quantity || 0) * (si.rate || 0);
                                            const miscAmount = subClientAmount * ((si.misc_percentage || 10) / 100);
                                            const overheadProfitAmount = subClientAmount * ((si.overhead_profit_percentage || 25) / 100);
                                            const transportAmount = subClientAmount * ((si.transport_percentage || 5) / 100);
                                            return sum + materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount;
                                          }, 0) || 0;
                                          const projectMargin = item.project_margin || (clientCost - internalCost);
                                          const marginPercentage = clientCost > 0 ? ((projectMargin / clientCost) * 100) : 0;

                                          return (
                                            <>
                                              <div className="flex justify-between items-center py-1">
                                                <span className="text-gray-700 font-medium">Client Cost (Total):</span>
                                                <span className="text-blue-700 font-bold text-base">{formatCurrency(clientCost)}</span>
                                              </div>
                                              <div className="flex justify-between items-center py-1">
                                                <span className="text-gray-700 font-medium">Internal Cost (Total):</span>
                                                <span className="text-orange-600 font-semibold">{formatCurrency(internalCost)}</span>
                                              </div>
                                              <div className="flex justify-between items-center pt-2 border-t-2 border-blue-400">
                                                <span className="text-gray-900 font-bold">Project Margin:</span>
                                                <div className="text-right">
                                                  <div className={`font-bold text-lg ${projectMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(projectMargin)}
                                                  </div>
                                                  <div className={`text-xs font-semibold ${marginPercentage >= 20 ? 'text-green-600' : marginPercentage >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    ({marginPercentage.toFixed(1)}% margin)
                                                  </div>
                                                </div>
                                              </div>
                                            </>
                                          );
                                        })()}
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
                            </div>

                            {/* Item Details (Expandable) */}
                            {expandedItems.includes(`item-${index}`) && (
                              <div className="p-4 space-y-4">
                                {/* Sub Items */}
                                {item.sub_items?.length > 0 && (
                                  <div className="space-y-4">
                                    {item.sub_items.map((subItem: any, subIndex: number) => (
                                      <div key={subIndex} className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border-2 border-green-400 shadow-sm">
                                        <div className="mb-3">
                                          <h4 className="text-sm font-bold text-green-900 flex items-center gap-2">
                                            <div className="p-1.5 bg-white rounded shadow-sm">
                                              <FileText className="w-4 h-4 text-green-600" />
                                            </div>
                                            Sub Item #{subIndex + 1}: {subItem.sub_item_name || subItem.scope}
                                          </h4>
                                          {subItem.scope && (
                                            <p className="text-xs text-gray-600 mt-1 ml-8"><strong>Scope:</strong> {subItem.scope}</p>
                                          )}
                                          <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                                            {subItem.size && <div><span className="text-gray-600">Size:</span> <span className="font-medium">{subItem.size}</span></div>}
                                            {subItem.location && <div><span className="text-gray-600">Location:</span> <span className="font-medium">{subItem.location}</span></div>}
                                            {subItem.brand && <div><span className="text-gray-600">Brand:</span> <span className="font-medium">{subItem.brand}</span></div>}
                                            <div><span className="text-gray-600">Qty:</span> <span className="font-medium">{subItem.quantity} {subItem.unit}</span></div>
                                            {subItem.rate && <div><span className="text-gray-600">Rate:</span> <span className="font-medium">₹{subItem.rate}</span></div>}
                                          </div>
                                        </div>

                                        {/* Sub-item Materials */}
                                        {subItem.materials?.length > 0 && (
                                          <div className="mb-3 bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
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
                                          <div className="bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
                                            <h5 className="text-xs font-bold text-orange-900 mb-2 flex items-center gap-2">
                                              <Users className="w-3.5 h-3.5" />
                                              Labour
                                            </h5>
                                            <div className="bg-white rounded border border-orange-200 overflow-hidden">
                                              <table className="w-full text-xs">
                                                <thead className="bg-orange-100 border-b border-orange-200">
                                                  <tr>
                                                    <th className="text-left py-1.5 px-2 font-semibold text-orange-900">Role</th>
                                                    <th className="text-center py-1.5 px-2 font-semibold text-orange-900">Work Type</th>
                                                    <th className="text-center py-1.5 px-2 font-semibold text-orange-900">Hours</th>
                                                    <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Rate/hr</th>
                                                    <th className="text-right py-1.5 px-2 font-semibold text-orange-900">Total</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {subItem.labour.map((labour: any, lIndex: number) => (
                                                    <tr key={lIndex} className={`border-b border-orange-100 ${lIndex % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                      <td className="py-1.5 px-2 text-gray-900">{labour.labour_role}</td>
                                                      <td className="py-1.5 px-2 text-center text-gray-700 capitalize">{labour.work_type?.replace('_', ' ') || 'Daily Wages'}</td>
                                                      <td className="py-1.5 px-2 text-center text-gray-700">{labour.hours} hrs</td>
                                                      <td className="py-1.5 px-2 text-right text-gray-700">{formatCurrency(labour.rate_per_hour)}</td>
                                                      <td className="py-1.5 px-2 text-right font-semibold text-orange-700">{formatCurrency(labour.total_cost || labour.hours * labour.rate_per_hour)}</td>
                                                    </tr>
                                                  ))}
                                                  <tr className="bg-orange-200 border-t-2 border-orange-400">
                                                    <td colSpan={4} className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">Labour Total:</td>
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

                                {/* Cost Analysis (Item-Level) */}
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border-2 border-blue-300 shadow-sm">
                                  <h5 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                                    <Calculator className="w-4 h-4" />
                                    Cost Analysis
                                  </h5>
                                  <div className="space-y-2 text-sm">
                                    {(() => {
                                      const clientCost = item.client_cost || item.sub_items?.reduce((sum: number, si: any) => sum + ((si.quantity || 0) * (si.rate || 0)), 0) || 0;
                                      const internalCost = item.internal_cost || item.sub_items?.reduce((sum: number, si: any) => {
                                        const materialCost = si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || m.quantity * m.unit_price), 0) || 0;
                                        const labourCost = si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0;
                                        return sum + materialCost + labourCost;
                                      }, 0) || 0;
                                      const projectMargin = item.project_margin || (clientCost - internalCost);
                                      const marginPercentage = clientCost > 0 ? ((projectMargin / clientCost) * 100) : 0;

                                      return (
                                        <>
                                          <div className="flex justify-between items-center py-1">
                                            <span className="text-gray-700 font-medium">Client Cost (Total):</span>
                                            <span className="text-blue-700 font-bold text-base">{formatCurrency(clientCost)}</span>
                                          </div>
                                          <div className="flex justify-between items-center py-1">
                                            <span className="text-gray-700 font-medium">Internal Cost (Mat + Lab):</span>
                                            <span className="text-orange-600 font-semibold">{formatCurrency(internalCost)}</span>
                                          </div>
                                          <div className="flex justify-between items-center pt-2 border-t-2 border-blue-400">
                                            <span className="text-gray-900 font-bold">Project Margin:</span>
                                            <div className="text-right">
                                              <div className={`font-bold text-lg ${projectMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCurrency(projectMargin)}
                                              </div>
                                              <div className={`text-xs font-semibold ${marginPercentage >= 20 ? 'text-green-600' : marginPercentage >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                ({marginPercentage.toFixed(1)}% margin)
                                              </div>
                                            </div>
                                          </div>
                                        </>
                                      );
                                    })()}
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

                    {/* Cost Analysis Summary - BOQ Items + Preliminaries Comparison */}
                    {((boqData.existing_purchase && boqData.existing_purchase.items.length > 0) ||
                      (boqData.items && boqData.items.length > 0) ||
                      (boqData.preliminaries?.cost_details?.amount && boqData.preliminaries.cost_details.amount > 0)) && (() => {
                        const allItems = boqData.existing_purchase?.items || boqData.items || [];
                        const preliminaryAmount = boqData.preliminaries?.cost_details?.amount || 0;

                        // Calculate BOQ Items totals
                        const boqItemsClientCost = allItems.reduce((sum, item) => {
                          if (item.sub_items && item.sub_items.length > 0) {
                            return sum + item.sub_items.reduce((siSum: number, si: any) =>
                              siSum + ((si.quantity || 0) * (si.rate || 0)), 0
                            );
                          }
                          return sum + (item.client_cost || 0);
                        }, 0);

                        const boqItemsInternalCost = allItems.reduce((sum, item) => {
                          if (item.sub_items && item.sub_items.length > 0) {
                            return sum + item.sub_items.reduce((siSum: number, si: any) => {
                              const matCost = (si.materials || []).reduce((mc: number, m: any) =>
                                mc + (m.total_price || m.quantity * m.unit_price || 0), 0);
                              const labCost = (si.labour || []).reduce((lc: number, l: any) =>
                                lc + (l.total_cost || l.hours * l.rate_per_hour || 0), 0);
                              return siSum + matCost + labCost;
                            }, 0);
                          }
                          return sum + (item.internal_cost || 0);
                        }, 0);

                        const boqItemsPlannedProfit = allItems.reduce((sum, item) => {
                          if (item.sub_items && item.sub_items.length > 0) {
                            return sum + item.sub_items.reduce((siSum: number, si: any) => {
                              const clientAmt = (si.quantity || 0) * (si.rate || 0);
                              const overheadPct = si.overhead_profit_percentage || item.overhead_profit_percentage || 25;
                              return siSum + (clientAmt * (overheadPct / 100));
                            }, 0);
                          }
                          return sum + (item.planned_profit || 0);
                        }, 0);

                        const boqItemsNegotiableMargin = boqItemsClientCost - boqItemsInternalCost;

                        // Calculate Preliminaries totals from actual data (if exists)
                        let preliminaryInternalCost = 0;
                        let preliminaryPlannedProfit = 0;
                        let preliminaryNegotiableMargin = 0;

                        if (preliminaryAmount > 0 && boqData.preliminaries) {
                          const costDetails = boqData.preliminaries.cost_details || {};
                          const internalCostBase = costDetails.internal_cost || 0;
                          const miscPct = costDetails.misc_percentage || 10;
                          const overheadPct = costDetails.overhead_profit_percentage || 25;
                          const transportPct = costDetails.transport_percentage || 5;

                          const miscAmount = (preliminaryAmount * miscPct) / 100;
                          const overheadAmount = (preliminaryAmount * overheadPct) / 100;
                          const transportAmount = (preliminaryAmount * transportPct) / 100;

                          preliminaryInternalCost = internalCostBase + miscAmount + overheadAmount + transportAmount;
                          preliminaryPlannedProfit = overheadAmount;
                          preliminaryNegotiableMargin = preliminaryAmount - preliminaryInternalCost;
                        }

                        // Combined totals
                        const combinedClientCost = boqItemsClientCost + preliminaryAmount;
                        const combinedInternalCost = boqItemsInternalCost + preliminaryInternalCost;
                        const combinedPlannedProfit = boqItemsPlannedProfit + preliminaryPlannedProfit;
                        const combinedNegotiableMargin = boqItemsNegotiableMargin + preliminaryNegotiableMargin;

                        return (
                          <div className="mt-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-300 shadow-xl">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="p-3 bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl shadow-md">
                                <Calculator className="w-6 h-6 text-amber-600" />
                              </div>
                              <h3 className="text-xl font-bold text-amber-900">Cost Analysis Summary</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* BOQ Items Analysis */}
                              {allItems.length > 0 && (
                                <div className="bg-white rounded-xl p-4 border border-amber-200">
                                  <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b">BOQ Items</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Client Cost:</span>
                                      <span className="font-semibold text-blue-700">{boqItemsClientCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Internal Cost:</span>
                                      <span className="font-semibold text-red-600">{boqItemsInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t">
                                      <span className="text-gray-600">Planned Profit:</span>
                                      <span className="font-semibold text-indigo-600">{boqItemsPlannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Negotiable Margins:</span>
                                      <span className={`font-semibold ${boqItemsNegotiableMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {boqItemsNegotiableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Preliminaries Analysis */}
                              {preliminaryAmount > 0 && (
                                <div className="bg-white rounded-xl p-4 border border-purple-200">
                                  <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b">Preliminaries & Approvals</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Client Amount:</span>
                                      <span className="font-semibold text-blue-700">{preliminaryAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Internal Cost:</span>
                                      <span className="font-semibold text-red-600">{preliminaryInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t">
                                      <span className="text-gray-600">Planned Profit:</span>
                                      <span className="font-semibold text-indigo-600">{preliminaryPlannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Negotiable Margins:</span>
                                      <span className={`font-semibold ${preliminaryNegotiableMargin >= preliminaryPlannedProfit ? 'text-green-600' : 'text-red-600'}`}>
                                        {preliminaryNegotiableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Combined Totals */}
                            {allItems.length > 0 && preliminaryAmount > 0 && (
                              <div className="mt-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-300">
                                <h4 className="text-sm font-bold text-green-900 mb-3">Combined Totals (BOQ + Preliminaries)</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div className="text-center">
                                    <p className="text-xs text-gray-600 mb-1">Total Client</p>
                                    <p className="text-lg font-bold text-blue-700">{combinedClientCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-gray-600 mb-1">Total Internal</p>
                                    <p className="text-lg font-bold text-red-600">{combinedInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-gray-600 mb-1">Planned Profit</p>
                                    <p className="text-lg font-bold text-indigo-600">{combinedPlannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-gray-600 mb-1">Negotiable Margins</p>
                                    <p className={`text-lg font-bold ${combinedNegotiableMargin >= combinedPlannedProfit ? 'text-green-600' : 'text-red-600'}`}>
                                      {combinedNegotiableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

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

                          {/* BOQ Financial Summary */}
                          <div className="space-y-4">
                            {(() => {
                              const allItems = boqData.existing_purchase?.items || boqData.items || [];

                              // Calculate totals
                              const totalClientAmount = allItems.reduce((sum, item) => {
                                if (item.sub_items && item.sub_items.length > 0) {
                                  return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                    siSum + ((si.quantity || 0) * (si.rate || 0)), 0
                                  );
                                }
                                return sum + (item.client_cost || 0);
                              }, 0);

                              const totalMaterialCost = allItems.reduce((sum, item) => {
                                if (item.sub_items && item.sub_items.length > 0) {
                                  return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                    siSum + (si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || m.quantity * m.unit_price), 0) || 0), 0
                                  );
                                }
                                return sum + (item.materials?.reduce((mSum, m) => mSum + (m.total_price || 0), 0) || 0);
                              }, 0);

                              const totalLabourCost = allItems.reduce((sum, item) => {
                                if (item.sub_items && item.sub_items.length > 0) {
                                  return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                    siSum + (si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0), 0
                                  );
                                }
                                return sum + (item.labour?.reduce((lSum, l) => lSum + (l.total_cost || 0), 0) || 0);
                              }, 0);

                              const totalMiscCost = allItems.reduce((sum, item) => {
                                if (item.sub_items && item.sub_items.length > 0) {
                                  return sum + item.sub_items.reduce((siSum: number, si: any) => {
                                    const clientAmt = (si.quantity || 0) * (si.rate || 0);
                                    return siSum + (clientAmt * ((si.misc_percentage || 10) / 100));
                                  }, 0);
                                }
                                return sum;
                              }, 0);

                              const totalTransportCost = allItems.reduce((sum, item) => {
                                if (item.sub_items && item.sub_items.length > 0) {
                                  return sum + item.sub_items.reduce((siSum: number, si: any) => {
                                    const clientAmt = (si.quantity || 0) * (si.rate || 0);
                                    return siSum + (clientAmt * ((si.transport_percentage || 5) / 100));
                                  }, 0);
                                }
                                return sum;
                              }, 0);

                              // Calculate planned profit (sum of all O&P)
                              const totalPlannedProfit = allItems.reduce((sum, item) => {
                                if (item.sub_items && item.sub_items.length > 0) {
                                  return sum + item.sub_items.reduce((siSum: number, si: any) => {
                                    const clientAmt = (si.quantity || 0) * (si.rate || 0);
                                    const opPercentage = si.overhead_profit_percentage || 25;
                                    return siSum + (clientAmt * (opPercentage / 100));
                                  }, 0);
                                }
                                return sum;
                              }, 0);

                              const totalInternalCost = totalMaterialCost + totalLabourCost + totalMiscCost + totalPlannedProfit + totalTransportCost;
                              const projectMargin = totalClientAmount - totalInternalCost;
                              const marginPercentage = totalClientAmount > 0 ? ((projectMargin / totalClientAmount) * 100) : 0;

                              // Calculate actual profit (sum of all actual profits)
                              // Formula: Client Amount - Internal Cost Total (includes O&P)
                              const totalActualProfit = allItems.reduce((sum, item) => {
                                if (item.sub_items && item.sub_items.length > 0) {
                                  return sum + item.sub_items.reduce((siSum: number, si: any) => {
                                    const clientAmt = (si.quantity || 0) * (si.rate || 0);
                                    const matCost = si.materials?.reduce((m: number, mat: any) => m + (mat.total_price || mat.quantity * mat.unit_price), 0) || 0;
                                    const labCost = si.labour?.reduce((l: number, lab: any) => l + (lab.total_cost || lab.hours * lab.rate_per_hour), 0) || 0;
                                    const miscAmt = clientAmt * ((si.misc_percentage || 10) / 100);
                                    const opAmt = clientAmt * ((si.overhead_profit_percentage || 25) / 100);
                                    const transportAmt = clientAmt * ((si.transport_percentage || 5) / 100);
                                    const internalCost = matCost + labCost + miscAmt + opAmt + transportAmt;
                                    // Negotiable Margins = Client Amount - Internal Cost Total
                                    return siSum + (clientAmt - internalCost);
                                  }, 0);
                                }
                                return sum;
                              }, 0);

                              const profitVariance = totalActualProfit - totalPlannedProfit;
                              const profitVariancePercentage = totalPlannedProfit > 0 ? ((profitVariance / totalPlannedProfit) * 100) : 0;

                              return (
                                <>
                                  {/* BOQ Financials */}
                                  <div className="bg-white rounded-lg p-5 border-2 border-blue-300 shadow-sm">
                                    <h4 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                                      <DollarSign className="w-5 h-5" />
                                      BOQ Financials
                                    </h4>
                                    <div className="space-y-3">
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-700 font-medium">Client Amount:</span>
                                        <span className="text-xl font-bold text-blue-700">{formatCurrency(totalClientAmount)}</span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-700 font-medium">Internal Cost:</span>
                                        <span className="text-base font-semibold text-orange-600">{formatCurrency(totalInternalCost)}</span>
                                      </div>
                                      <div className="ml-6 space-y-1 text-sm text-gray-600">
                                        <div className="flex justify-between">
                                          <span>Materials:</span>
                                          <span className="font-medium">{formatCurrency(totalMaterialCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Labour:</span>
                                          <span className="font-medium">{formatCurrency(totalLabourCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Miscellaneous:</span>
                                          <span className="font-medium">{formatCurrency(totalMiscCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Overhead & Profit:</span>
                                          <span className="font-medium">{formatCurrency(totalPlannedProfit)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Transport:</span>
                                          <span className="font-medium">{formatCurrency(totalTransportCost)}</span>
                                        </div>
                                      </div>
                                      <div className="flex justify-between items-center pt-3 border-t-2 border-blue-300">
                                        <span className="text-gray-900 font-bold">Project Margin:</span>
                                        <div className="text-right">
                                          <div className={`text-xl font-bold ${projectMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(projectMargin)}
                                          </div>
                                          <div className={`text-xs font-semibold ${marginPercentage >= 30 ? 'text-green-600' : marginPercentage >= 20 ? 'text-yellow-600' : 'text-orange-600'}`}>
                                            ({marginPercentage.toFixed(1)}%)
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Profit Analysis */}
                                  <div className="bg-white rounded-lg p-5 border-2 border-green-300 shadow-sm">
                                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                                      <TrendingUp className="w-5 h-5" />
                                      Profit Analysis
                                    </h4>
                                    <div className="space-y-3">
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-700 font-medium">Planned Profit (O&P):</span>
                                        <span className="text-base font-semibold text-blue-600">{formatCurrency(totalPlannedProfit)}</span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-700 font-medium">Negotiable Margins:</span>
                                        <span className={`text-xl font-bold ${totalActualProfit >= totalPlannedProfit ? 'text-green-600' : 'text-orange-600'}`}>
                                          {formatCurrency(totalActualProfit)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center pt-3 border-t-2 border-green-300">
                                        <span className="text-gray-900 font-bold">Variance:</span>
                                        <div className="text-right">
                                          <div className={`text-lg font-bold ${profitVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {profitVariance >= 0 ? '+' : ''}{formatCurrency(profitVariance)}
                                          </div>
                                          <div className={`text-xs font-semibold ${profitVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ({profitVariance >= 0 ? '+' : ''}{profitVariancePercentage.toFixed(1)}%)
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>

                          {/* Grand Total with Discount Impact */}
                          <div className="mt-6 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-5 border-2 border-green-300">
                            <div className="space-y-3">
                              {(() => {
                                const allItems = boqData.existing_purchase?.items || boqData.items || [];

                                // Calculate items subtotal (sum of all sub-item client amounts)
                                const itemsSubtotal = allItems.reduce((sum, item) => {
                                  if (item.sub_items && item.sub_items.length > 0) {
                                    return sum + item.sub_items.reduce((siSum: number, si: any) =>
                                      siSum + ((si.quantity || 0) * (si.rate || 0)), 0
                                    );
                                  }
                                  return sum + (item.client_cost || 0);
                                }, 0);

                                // Extract preliminary amount from BOQ data
                                const preliminaryAmount = boqData.preliminaries?.cost_details?.amount || 0;

                                // Calculate combined subtotal (items + preliminary)
                                const subtotal = itemsSubtotal + preliminaryAmount;

                                // Calculate total internal cost
                                const totalInternalCost = allItems.reduce((sum, item) => {
                                  if (item.sub_items && item.sub_items.length > 0) {
                                    return sum + item.sub_items.reduce((siSum: number, si: any) => {
                                      const matCost = si.materials?.reduce((m: number, mat: any) => m + (mat.total_price || mat.quantity * mat.unit_price), 0) || 0;
                                      const labCost = si.labour?.reduce((l: number, lab: any) => l + (lab.total_cost || lab.hours * lab.rate_per_hour), 0) || 0;
                                      const clientAmt = (si.quantity || 0) * (si.rate || 0);
                                      const miscAmt = clientAmt * ((si.misc_percentage || 10) / 100);
                                      const opAmt = clientAmt * ((si.overhead_profit_percentage || 25) / 100);
                                      const transportAmt = clientAmt * ((si.transport_percentage || 5) / 100);
                                      return siSum + matCost + labCost + miscAmt + opAmt + transportAmt;
                                    }, 0);
                                  }
                                  return sum + (item.internal_cost || 0);
                                }, 0);

                                // Calculate profits
                                const totalActualProfit = subtotal - totalInternalCost;
                                const profitMarginPercentage = subtotal > 0 ? (totalActualProfit / subtotal) * 100 : 0;

                                // Overall discount (BOQ-level from overall discount input OR sum of item discounts)
                                let overallDiscount = boqData.discount_amount || 0;
                                let overallDiscountPercentage = boqData.discount_percentage || 0;

                                // If no BOQ-level discount, calculate from items
                                if (overallDiscount === 0) {
                                  allItems.forEach((item: any) => {
                                    overallDiscount += (item.discount_amount || 0);
                                  });
                                  // Calculate percentage from total
                                  if (subtotal > 0 && overallDiscount > 0) {
                                    overallDiscountPercentage = (overallDiscount / subtotal) * 100;
                                  }
                                }

                                // Grand total
                                const grandTotal = subtotal - overallDiscount;

                                // Calculate profit after discount
                                const negotiableMarginAfterDiscount = grandTotal - totalInternalCost;
                                const profitMarginAfterDiscount = grandTotal > 0 ? (negotiableMarginAfterDiscount / grandTotal) * 100 : 0;

                                return (
                                  <>
                                    <div className="flex justify-between text-base font-medium">
                                      <span className="text-gray-800">Items Subtotal:</span>
                                      <span className="font-semibold">{formatCurrency(itemsSubtotal)}</span>
                                    </div>

                                    {/* Show preliminary amount if it exists */}
                                    {preliminaryAmount > 0 && (
                                      <>
                                        <div className="flex justify-between text-base font-medium">
                                          <span className="text-gray-800">Preliminary Amount:</span>
                                          <span className="font-semibold">{formatCurrency(preliminaryAmount)}</span>
                                        </div>
                                        <div className="flex justify-between text-base font-bold pt-2 border-t border-green-200">
                                          <span className="text-gray-900">Combined Subtotal:</span>
                                          <span className="text-gray-900">{formatCurrency(subtotal)}</span>
                                        </div>
                                      </>
                                    )}

                                    {overallDiscount > 0 && (
                                      <>
                                        <div className="flex justify-between text-sm text-red-600">
                                          <span>Discount ({overallDiscountPercentage.toFixed(1)}%):</span>
                                          <span className="font-semibold">- {formatCurrency(overallDiscount)}</span>
                                        </div>
                                      </>
                                    )}
                                    <div className="flex justify-between pt-3 border-t-2 border-green-400 text-lg font-bold">
                                      <span className="text-green-900">
                                        Grand Total: <span className="text-xs font-normal text-gray-600">(Excluding VAT)</span>
                                      </span>
                                      <span className="text-green-700">{formatCurrency(grandTotal, true)}</span>
                                    </div>

                                    {/* Show discount impact on profitability */}
                                    {overallDiscount > 0 && (
                                      <div className="mt-4 pt-4 border-t border-green-300 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
                                        <h6 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                                          <TrendingUp className="w-3.5 h-3.5" />
                                          Discount Impact on Profitability
                                        </h6>
                                        <div className="space-y-2 text-xs">
                                          <div className="flex justify-between items-center">
                                            <span className="text-gray-600">Client Cost:</span>
                                            <div className="flex items-center gap-2">
                                              <span className="text-gray-500 line-through">
                                                {formatCurrency(subtotal)}
                                              </span>
                                              <span className="text-blue-700 font-bold">
                                                → {formatCurrency(grandTotal)}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-gray-600">Internal Cost:</span>
                                            <span className="font-semibold text-red-600">
                                              {formatCurrency(totalInternalCost)}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                            <span className="text-gray-700 font-medium">Negotiable Margins:</span>
                                            <div className="flex items-center gap-2">
                                              <span className="text-gray-500 line-through">
                                                {formatCurrency(totalActualProfit)}
                                              </span>
                                              <span className={`font-bold ${negotiableMarginAfterDiscount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                → {formatCurrency(negotiableMarginAfterDiscount)}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex justify-between items-center bg-white/60 rounded px-2 py-1">
                                            <span className="text-gray-700 font-medium">Profit Margin:</span>
                                            <div className="flex items-center gap-2">
                                              <span className="text-gray-500 text-xs">
                                                {profitMarginPercentage.toFixed(1)}%
                                              </span>
                                              <span className={`font-bold ${profitMarginAfterDiscount >= 15 ? 'text-emerald-700' : profitMarginAfterDiscount >= 10 ? 'text-orange-600' : 'text-red-600'}`}>
                                                → {profitMarginAfterDiscount.toFixed(1)}%
                                              </span>
                                            </div>
                                          </div>
                                          {profitMarginAfterDiscount < 15 && (
                                            <div className="mt-2 p-2 bg-orange-100 border border-orange-300 rounded text-orange-800 flex items-start gap-2">
                                              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                              <span className="text-xs">
                                                <strong>Warning:</strong> Profit margin is below recommended 15%. This discount significantly reduces profitability.
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
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