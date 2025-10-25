import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, TrendingUp, TrendingDown, Send, Mail, Edit, Eye, ArrowRight, CheckCircle, Clock, XCircle } from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { toast } from 'sonner';
import { BOQ } from '../types';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InternalRevisionTimeline from './InternalRevisionTimeline';

interface RevisionComparisonPageProps {
  boqList: BOQ[];
  onSendToTD: (boq: BOQ) => Promise<void>;
  onSendToClient: (boq: BOQ) => void;
  onEdit: (boq: BOQ) => void;
  onViewDetails: (boq: BOQ) => void;
  onCompare: (currentBoq: BOQ, previousRevision: any) => void;
  onClientApproval?: (boq: BOQ) => void;
  onRevisionRequest?: (boq: BOQ) => void;
  onCancel?: (boq: BOQ) => void;
  onRefresh?: () => Promise<void>;
}

const RevisionComparisonPage: React.FC<RevisionComparisonPageProps> = ({
  boqList,
  onSendToTD,
  onSendToClient,
  onEdit,
  onViewDetails,
  onCompare,
  onClientApproval,
  onRevisionRequest,
  onCancel,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [currentRevisionData, setCurrentRevisionData] = useState<any>(null);
  const [previousRevisions, setPreviousRevisions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedRevisionIndex, setExpandedRevisionIndex] = useState<number | null>(null);
  const [isSendingToTD, setIsSendingToTD] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get display revision number
  // Original = show "Original", First Revision = 1, Second Revision = 2, etc.
  const getDisplayRevisionNumber = (boq: BOQ) => {
    return boq.revision_number || 0;
  };

  const getRevisionLabel = (boq: BOQ) => {
    const revNum = boq.revision_number || 0;
    return revNum === 0 ? 'Original' : `${revNum}`;
  };

  // Filter BOQs for Client Revisions tab:
  // 1. BOQs with revisions (revision_number > 0)
  // 2. Approved BOQs waiting to send to client (approved/revision_approved)
  // 3. BOQs pending TD approval (pending_approval/pending_revision)
  // 4. BOQs being edited (under_revision)
  // 5. BOQs with client interactions
  const boqsWithRevisions = boqList.filter(boq => {
    const status = boq.status?.toLowerCase() || '';
    const hasRevisions = (boq.revision_number || 0) > 0;
    const isApprovedNotSent = (status === 'approved' || status === 'revision_approved');
    const isPendingApproval = (status === 'pending_approval' || status === 'pending_revision' || status === 'pending');
    const isUnderRevision = (status === 'under_revision');
    const isSentToClient = (status === 'sent_for_confirmation');
    const isClientRejected = (status === 'client_rejected');
    const isClientConfirmed = (status === 'client_confirmed');
    const isClientCancelled = (status === 'client_cancelled');

    return hasRevisions || isApprovedNotSent || isPendingApproval || isUnderRevision || isSentToClient || isClientRejected || isClientConfirmed || isClientCancelled;
  });

  // Filter based on search
  const filteredBOQs = boqsWithRevisions.filter(boq =>
    boq.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    boq.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    boq.project?.client?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (selectedBoq) {
      loadRevisionData(selectedBoq);
      startPollingForApproval();
    }
    return () => {
      stopPolling();
    };
  }, [selectedBoq]);

  // Update selectedBoq when boqList changes (e.g., after approval/rejection or client response)
  useEffect(() => {
    if (selectedBoq && boqList.length > 0) {
      const updatedBoq = boqList.find(b => b.boq_id === selectedBoq.boq_id);
      if (updatedBoq) {
        // Only update if the status actually changed (not just any property)
        if (updatedBoq.status !== selectedBoq.status) {
          console.log('🔄 BOQ status updated from', selectedBoq.status, 'to', updatedBoq.status);
          setSelectedBoq(updatedBoq);
        }
      }
    }
  }, [boqList]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Auto-refresh when BOQ is pending TD approval
  const startPollingForApproval = () => {
    stopPolling(); // Clear any existing interval

    if (selectedBoq && (selectedBoq.status === 'pending_approval' || selectedBoq.status === 'pending_revision')) {
      console.log('🔄 Started polling for TD approval');
      const interval = setInterval(async () => {
        if (onRefresh) {
          await onRefresh();
          // Update selectedBoq from refreshed list
          const updated = boqList.find(b => b.boq_id === selectedBoq.boq_id);
          if (updated && (updated.status === 'approved' || updated.status === 'revision_approved')) {
            console.log('✅ TD Approved! Stopping poll');
            toast.success('BOQ approved by Technical Director!');
            setSelectedBoq(updated);
            stopPolling();
          }
        }
      }, 3000); // Poll every 3 seconds for instant updates
      setPollingInterval(interval);
    }
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
      console.log('⏹️ Stopped polling');
    }
  };

  // Handle send to TD with loading state
  const handleSendToTD = async (boq: BOQ) => {
    setIsSendingToTD(true);
    try {
      await onSendToTD(boq);
      // Refresh data after sending
      if (onRefresh) {
        await onRefresh();
      }
      // Reload revision data
      await loadRevisionData(boq);
      // Start polling for approval
      startPollingForApproval();
    } catch (error) {
      console.error('Error sending to TD:', error);
    } finally {
      setIsSendingToTD(false);
    }
  };

  const loadRevisionData = async (boq: BOQ) => {
    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQDetailsHistory(boq.boq_id!);

      if (result.success && result.data) {
        const current = result.data.current_version;
        let historyList = result.data.history || [];

        console.log('📊 BOQ History Data:', {
          currentRevision: boq.revision_number,
          historyCount: historyList.length,
          historyVersions: historyList.map((h: any) => h.version)
        });

        // For Rev 1 with no history, show placeholder message
        // (Note: New revisions created after backend fix will have history automatically)
        if ((boq.revision_number || 0) === 1 && historyList.length === 0) {
          console.log('⚠️ No history found for Rev 1 - This BOQ was created before history tracking was enabled');
          // Don't create fake data - just show empty state with explanation
        }

        // Filter to show only revisions less than current
        const filtered = historyList
          .filter((h: any) => {
            const revNum = typeof h.version === 'number' ? h.version : parseInt(h.version || '0');
            const currentRevNum = boq.revision_number || 0;
            const shouldInclude = !isNaN(revNum) && revNum < currentRevNum;

            console.log(`  Rev ${revNum}: ${shouldInclude ? '✓ Include' : '✗ Skip'} (current: ${currentRevNum})`);
            return shouldInclude;
          })
          .sort((a: any, b: any) => {
            const aNum = typeof a.version === 'number' ? a.version : parseInt(a.version || '0');
            const bNum = typeof b.version === 'number' ? b.version : parseInt(b.version || '0');
            return bNum - aNum; // Descending (Rev 4, 3, 2, 1, 0)
          });

        console.log(`📋 Filtered ${filtered.length} previous revisions:`, filtered.map((f: any) => f.version));

        setCurrentRevisionData(current);
        setPreviousRevisions(filtered);
      }
    } catch (error) {
      console.error('Error loading revision data:', error);
      toast.error('Failed to load revision data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
  };

  const calculateChange = (current: number, previous: number) => {
    if (!previous || previous === 0) return { value: 0, percentage: 0 };
    const change = current - previous;
    const percentage = ((change / previous) * 100).toFixed(2);
    return { value: change, percentage: parseFloat(percentage) };
  };

  // Helper function to check if a value has changed compared to previous revision
  const hasChanged = (currentValue: any, previousValue: any): boolean => {
    if (currentValue === undefined || previousValue === undefined) return false;
    if (typeof currentValue === 'number' && typeof previousValue === 'number') {
      return Math.abs(currentValue - previousValue) > 0.01; // Account for floating point precision
    }
    return currentValue !== previousValue;
  };

  // Get previous revision for comparison (the immediate previous one)
  const getPreviousRevisionForComparison = () => {
    if (previousRevisions.length > 0) {
      // Sort by version descending and get the first one (most recent previous)
      const sorted = [...previousRevisions].sort((a, b) => {
        const aNum = typeof a.version === 'number' ? a.version : parseInt(a.version || '0');
        const bNum = typeof b.version === 'number' ? b.version : parseInt(b.version || '0');
        return bNum - aNum;
      });
      return sorted[0];
    }
    return null;
  };

  // Find matching material in previous revision
  const findPreviousMaterial = (itemName: string, materialName: string, prevRevision: any) => {
    if (!prevRevision?.boq_details?.items) return null;
    const prevItem = prevRevision.boq_details.items.find((item: any) => item.item_name === itemName);
    if (!prevItem?.materials) return null;
    return prevItem.materials.find((mat: any) => mat.material_name === materialName);
  };

  // Find matching labour in previous revision
  const findPreviousLabour = (itemName: string, labourRole: string, prevRevision: any) => {
    if (!prevRevision?.boq_details?.items) return null;
    const prevItem = prevRevision.boq_details.items.find((item: any) => item.item_name === itemName);
    if (!prevItem?.labour) return null;
    return prevItem.labour.find((lab: any) => lab.labour_role === labourRole);
  };

  // Find matching item in previous revision
  const findPreviousItem = (itemName: string, prevRevision: any) => {
    if (!prevRevision?.boq_details?.items) return null;
    return prevRevision.boq_details.items.find((item: any) => item.item_name === itemName);
  };

  // Calculate total price from items
  const calculateTotalFromItems = (boqData: any) => {
    if (!boqData?.boq_details?.items || boqData.boq_details.items.length === 0) return 0;

    return boqData.boq_details.items.reduce((total: number, item: any) => {
      // Calculate item total from sub_items or direct materials/labour
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

  return (
    <div className="space-y-6">
      <Tabs defaultValue="client" className="w-full">
        {/* Sub-navigation Tabs */}
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="client">Client Revisions</TabsTrigger>
          <TabsTrigger value="internal">Internal Revisions</TabsTrigger>
        </TabsList>

        {/* Client Revisions Tab */}
        <TabsContent value="client" className="space-y-6">
          {/* Project Selection Dropdown */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Select Project to View Revisions</h3>

        {/* Recent Projects - Always visible (4-5 most recent) */}
        {!selectedBoq && boqsWithRevisions.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700 mb-3">Recent Projects:</p>
            <div className="space-y-2">
              {boqsWithRevisions.slice(0, 5).map((boq) => (
                <button
                  key={boq.boq_id}
                  onClick={() => {
                    setSelectedBoq(boq);
                    setSearchTerm('');
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold text-gray-900">{boq.title}</div>
                        {/* Status Badge */}
                        {(() => {
                          const status = boq.status?.toLowerCase() || '';
                          if (status === 'approved' || status === 'revision_approved') {
                            return (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                ✓ Ready
                              </span>
                            );
                          } else if (status === 'pending_approval' || status === 'pending_revision' || status === 'pending') {
                            return (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                                ⏳ Pending
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="text-sm text-gray-600">
                        {boq.project?.name} • {boq.project?.client}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className={`text-sm font-semibold px-2 py-1 rounded inline-block ${
                        getDisplayRevisionNumber(boq) >= 7 ? 'bg-red-100 text-red-700' :
                        getDisplayRevisionNumber(boq) >= 4 ? 'bg-orange-100 text-orange-700' :
                        getDisplayRevisionNumber(boq) >= 1 ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        Rev {getDisplayRevisionNumber(boq)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search/Select Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={selectedBoq ? selectedBoq.title : "🔍 Click to select project or search..."}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onClick={() => setShowDropdown(true)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
          />

          {/* Dropdown Results - Show on focus or when typing */}
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute z-20 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-xl max-h-80 overflow-y-auto"
            >
              {boqsWithRevisions.length > 0 ? (
                (searchTerm ? filteredBOQs : boqsWithRevisions.slice(0, 20)).map((boq) => (
                  <button
                    key={boq.boq_id}
                    onClick={() => {
                      setSelectedBoq(boq);
                      setSearchTerm('');
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-semibold text-gray-900">{boq.title}</div>
                          {/* Status Badge */}
                          {(() => {
                            const status = boq.status?.toLowerCase() || '';
                            if (status === 'approved' || status === 'revision_approved') {
                              return (
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  ✓ Ready
                                </span>
                              );
                            } else if (status === 'pending_approval' || status === 'pending_revision' || status === 'pending') {
                              return (
                                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                                  ⏳ Pending
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="text-sm text-gray-600">
                          {boq.project?.name} • {boq.project?.client}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className={`text-sm font-semibold px-2 py-1 rounded inline-block ${
                          getDisplayRevisionNumber(boq) >= 7 ? 'bg-red-100 text-red-700' :
                          getDisplayRevisionNumber(boq) >= 4 ? 'bg-orange-100 text-orange-700' :
                          getDisplayRevisionNumber(boq) > 0 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {getRevisionLabel(boq)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{formatCurrency(boq.total_cost || 0)}</div>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-gray-500">
                  <p className="font-medium">No projects with revisions found</p>
                  <p className="text-sm mt-1">Try searching or check other tabs</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Selected Project Info */}
        {selectedBoq && !searchTerm && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-blue-900">{selectedBoq.title}</h4>
                <p className="text-sm text-blue-700">
                  {selectedBoq.project?.name} • {selectedBoq.project?.client}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-blue-900">{getRevisionLabel(selectedBoq)}</div>
                <div className="text-sm text-blue-700">{formatCurrency(selectedBoq.total_cost || 0)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Split View: Current Revision (Left) + Previous Revisions (Right) */}
      {selectedBoq && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT SIDE: Current Revision */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 border-b border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-green-900">📌 Current Revision</h3>
                  <p className="text-sm text-green-700">{getRevisionLabel(selectedBoq)}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-900">
                    {formatCurrency(calculateTotalFromItems(currentRevisionData))}
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <ModernLoadingSpinners size="md" />
                <p className="mt-4 text-gray-600">Loading details...</p>
              </div>
            ) : currentRevisionData ? (
              <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Items:</span>
                      <span className="font-semibold">{currentRevisionData.total_items || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Cost:</span>
                      <span className="font-semibold">{formatCurrency(currentRevisionData.total_cost || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Created:</span>
                      <span className="font-semibold">
                        {new Date(currentRevisionData.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items */}
                {currentRevisionData.boq_details?.items?.map((item: any, index: number) => {
                  const prevRevision = getPreviousRevisionForComparison();
                  const prevItem = prevRevision ? findPreviousItem(item.item_name, prevRevision) : null;

                  return (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                      <h5 className="font-semibold text-gray-900 mb-2">{item.item_name}</h5>
                      {item.description && (
                        <p className="text-sm text-gray-600 mb-3">{item.description}</p>
                      )}

                      {/* Sub Items */}
                      {item.sub_items && item.sub_items.length > 0 && (
                        <div className="mb-3 space-y-2">
                          <p className="text-xs font-semibold text-gray-700 mb-2">📋 Sub Items:</p>
                          {item.sub_items.map((subItem: any, subIdx: number) => {
                            // Find previous sub-item for comparison
                            const prevSubItem = prevItem?.sub_items?.find((ps: any) => ps.sub_item_name === subItem.sub_item_name);

                            return (
                              <div key={subIdx} className="bg-green-50 border border-green-200 rounded-lg p-3">
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="font-semibold text-sm text-gray-900">{subItem.sub_item_name}</p>
                                    {subItem.scope && <p className="text-xs text-gray-600">{subItem.scope}</p>}
                                  </div>
                                  <div className="text-right text-xs text-gray-600">
                                    {subItem.size && <div>Size: {subItem.size}</div>}
                                    {subItem.location && <div>Location: {subItem.location}</div>}
                                    {subItem.brand && <div>Brand: {subItem.brand}</div>}
                                  </div>
                                </div>

                                {/* Sub Item Materials */}
                                {subItem.materials && subItem.materials.length > 0 && (
                                  <div className="mb-2">
                                    <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                                    <div className="space-y-1">
                                      {subItem.materials.map((mat: any, matIdx: number) => {
                                        const prevMat = prevSubItem?.materials?.find((pm: any) => pm.material_name === mat.material_name);
                                        const quantityChanged = prevMat ? hasChanged(mat.quantity, prevMat.quantity) : !prevMat;
                                        const priceChanged = prevMat ? hasChanged(mat.quantity * mat.unit_price, prevMat.quantity * prevMat.unit_price) : !prevMat;
                                        const isNew = !prevMat;

                                        return (
                                          <div key={matIdx} className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${isNew ? 'bg-yellow-100' : 'bg-white'}`}>
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
                                        const isNew = !prevLab;

                                        return (
                                          <div key={labIdx} className={`text-xs text-gray-600 flex justify-between rounded px-2 py-1 ${isNew ? 'bg-yellow-100' : 'bg-white'}`}>
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
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                          <div className="space-y-1">
                            {item.materials.map((mat: any, matIdx: number) => {
                              const prevMat = prevRevision ? findPreviousMaterial(item.item_name, mat.material_name, prevRevision) : null;
                              const quantityChanged = prevMat ? hasChanged(mat.quantity, prevMat.quantity) : !prevMat;
                              const priceChanged = prevMat ? hasChanged(mat.total_price, prevMat.total_price) : !prevMat;
                              const isNew = !prevMat;

                              return (
                                <div key={matIdx} className={`text-sm text-gray-600 flex justify-between rounded px-2 py-1 ${isNew ? 'bg-yellow-100' : ''}`}>
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
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-gray-700 mb-1">👷 Labour:</p>
                          <div className="space-y-1">
                            {item.labour.map((lab: any, labIdx: number) => {
                              const prevLab = prevRevision ? findPreviousLabour(item.item_name, lab.labour_role, prevRevision) : null;
                              const hoursChanged = prevLab ? hasChanged(lab.hours, prevLab.hours) : !prevLab;
                              const costChanged = prevLab ? hasChanged(lab.total_cost, prevLab.total_cost) : !prevLab;
                              const isNew = !prevLab;

                              return (
                                <div key={labIdx} className={`text-sm text-gray-600 flex justify-between rounded px-2 py-1 ${isNew ? 'bg-yellow-100' : ''}`}>
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

                      {/* Additional Details: Overhead, Profit, Discount, VAT */}
                      <div className="mt-3 pt-2 border-t border-gray-200 space-y-1">
                        {/* Calculate costs with correct labels */}
                        {(() => {
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

                          return (
                            <>
                              <div className="text-xs text-gray-600 flex justify-between rounded px-2 py-1">
                                <span>Item Total (Qty × Rate):</span>
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
                              <div className="text-xs text-gray-700 flex justify-between rounded px-2 py-1 bg-gray-100 font-semibold">
                                <span>Subtotal:</span>
                                <span>AED {subtotal.toFixed(2)}</span>
                              </div>
                              {item.discount_percentage > 0 && (
                                <div className={`text-xs text-red-600 flex justify-between rounded px-2 py-1 ${prevItem && hasChanged(item.discount_percentage, prevItem.discount_percentage) ? 'bg-yellow-200' : ''}`}>
                                  <span>Discount ({item.discount_percentage}%):</span>
                                  <span className="font-semibold">- AED {discountAmount.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="text-xs text-gray-700 flex justify-between rounded px-2 py-1">
                                <span>After Discount:</span>
                                <span className="font-semibold">AED {afterDiscount.toFixed(2)}</span>
                              </div>
                              {item.vat_percentage > 0 && (
                                <div className={`text-xs text-green-600 flex justify-between rounded px-2 py-1 ${prevItem && hasChanged(item.vat_percentage, prevItem.vat_percentage) ? 'bg-yellow-200' : ''}`}>
                                  <span>VAT ({item.vat_percentage}%) [ADDITIONAL]:</span>
                                  <span className="font-semibold">+ AED {vatAmount.toFixed(2)}</span>
                                </div>
                              )}
                              <div className={`text-sm font-bold text-gray-900 flex justify-between bg-green-50 rounded px-2 py-1 mt-2 ${prevItem && hasChanged(finalTotalPrice, prevItem.selling_price || 0) ? 'bg-yellow-200' : ''}`}>
                                <span>Final Total Price:</span>
                                <span>AED {finalTotalPrice.toFixed(2)}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No data available</div>
            )}

            {/* Action Buttons - EXACT WORKFLOW MATCH */}
            <div className="border-t border-gray-200 p-3 bg-gray-50">
              {(() => {
                const status = selectedBoq.status?.toLowerCase() || '';
                const isDraft = !status || status === 'draft';
                const isPendingApproval = status === 'pending_approval' || status === 'pending';
                const isApprovedByTD = status === 'approved' || status === 'revision_approved';
                const isSentToClient = status === 'sent_for_confirmation';
                const isClientRejected = status === 'client_rejected';
                const isClientConfirmed = status === 'client_confirmed';
                const isClientCancelled = status === 'client_cancelled';
                const isPendingRevision = status === 'pending_revision';
                const isUnderRevision = status === 'under_revision';

                if (isClientCancelled) {
                  return (
                    <div className="text-center text-xs text-gray-600 font-medium py-2">
                      <XCircle className="h-5 w-5 mx-auto mb-1 text-gray-400" />
                      Project Permanently Cancelled
                    </div>
                  );
                }

                if (isClientConfirmed) {
                  // Check if PM is already assigned
                  const isPMAssigned = selectedBoq.pm_assigned || selectedBoq.project_manager_id;

                  return (
                    <div className="text-center text-xs text-green-700 font-medium py-2">
                      <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-600" />
                      {isPMAssigned ? 'PM Assigned' : 'Client Approved - Awaiting PM Assignment'}
                    </div>
                  );
                }

                if (isPendingRevision) {
                  return (
                    <div className="text-center text-xs text-red-700 font-medium py-2">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-red-600" />
                      Revision Pending TD Approval
                    </div>
                  );
                }

                if (isClientRejected) {
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {/* Revise BOQ */}
                      <button
                        onClick={() => onEdit(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                        title="Revise BOQ based on client feedback"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Revise BOQ</span>
                        <span className="sm:hidden">Edit</span>
                      </button>

                      {/* Send to TD */}
                      <button
                        onClick={() => handleSendToTD(selectedBoq)}
                        disabled={isSendingToTD}
                        className={`text-xs h-8 rounded transition-all flex items-center justify-center gap-1 ${
                          isSendingToTD
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'text-red-900 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-sm hover:opacity-90'
                        }`}
                        title="Send revised BOQ to Technical Director for approval"
                      >
                        {isSendingToTD ? (
                          <>
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-red-900"></div>
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <Mail className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Send to TD</span>
                            <span className="sm:hidden">To TD</span>
                          </>
                        )}
                      </button>

                      {/* Cancel Project */}
                      <button
                        onClick={() => onCancel && onCancel(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(239, 68, 68)' }}
                        title="Cancel this project permanently"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Cancel</span>
                        <span className="sm:hidden">Cancel</span>
                      </button>
                    </div>
                  );
                }

                if (isSentToClient) {
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {/* Client Approved */}
                      <button
                        onClick={() => onClientApproval && onClientApproval(selectedBoq)}
                        className="col-span-1 text-green-600 text-xs h-8 rounded hover:bg-green-50 transition-all flex items-center justify-center gap-1 border border-green-300"
                        title="Client Approved"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Client Approved</span>
                        <span className="sm:hidden">Approved</span>
                      </button>

                      {/* Revisions */}
                      <button
                        onClick={() => onRevisionRequest && onRevisionRequest(selectedBoq)}
                        className="col-span-1 text-red-600 text-xs h-8 rounded hover:bg-red-50 transition-all flex items-center justify-center gap-1 border border-red-300"
                        title="Revisions Needed"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Revisions</span>
                      </button>

                      {/* Cancel */}
                      <button
                        onClick={() => onCancel && onCancel(selectedBoq)}
                        className="col-span-1 text-red-600 text-xs h-8 rounded hover:bg-red-50 transition-all flex items-center justify-center gap-1 border border-red-300"
                        title="Cancel Project"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Cancel</span>
                      </button>
                    </div>
                  );
                }

                if (isUnderRevision) {
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {/* Edit Again */}
                      <button
                        onClick={() => onEdit(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                        title="Edit Again"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit Again
                      </button>

                      {/* Send Revision to TD */}
                      <button
                        onClick={() => handleSendToTD(selectedBoq)}
                        disabled={isSendingToTD}
                        className={`text-xs h-8 rounded transition-all flex items-center justify-center gap-1 ${
                          isSendingToTD
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'text-red-900 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-sm hover:opacity-90'
                        }`}
                        title="Send Revision to TD"
                      >
                        {isSendingToTD ? (
                          <>
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-red-900"></div>
                            <span className="text-xs">Sending...</span>
                          </>
                        ) : (
                          <>
                            <Mail className="h-3.5 w-3.5" />
                            Send to TD
                          </>
                        )}
                      </button>
                    </div>
                  );
                }

                if (isApprovedByTD) {
                  const isRevisionApproved = status === 'revision_approved';
                  return (
                    <div className="space-y-2">
                      {/* Send Revision to Client button - NO EDIT BUTTON once TD approves */}
                      <button
                        onClick={() => onSendToClient(selectedBoq)}
                        className="w-full text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                        title={`Send ${isRevisionApproved ? 'Revision' : 'BOQ'} to Client`}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {selectedBoq.revision_number && selectedBoq.revision_number > 0 ? 'Send Revision to Client' : 'Send to Client'}
                      </button>
                    </div>
                  );
                }

                // Draft state
                if (isDraft || isPendingApproval) {
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {/* View Details */}
                      <button
                        onClick={() => onViewDetails(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">View</span>
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => onEdit(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                        disabled={isPendingApproval}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </button>

                      {/* Send to TD / Sent */}
                      <button
                        onClick={() => handleSendToTD(selectedBoq)}
                        disabled={isPendingApproval || isSendingToTD}
                        className={`text-xs h-8 rounded transition-all flex items-center justify-center gap-1 ${
                          isPendingApproval || isSendingToTD
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'text-red-900 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 shadow-sm hover:opacity-90'
                        }`}
                        title={isPendingApproval ? "Sent to TD" : "Send to Technical Director"}
                      >
                        {isSendingToTD ? (
                          <>
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-red-900"></div>
                            <span className="text-xs">Sending</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            {isPendingApproval ? 'Sent' : 'Send TD'}
                          </>
                        )}
                      </button>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          </motion.div>

          {/* RIGHT SIDE: Previous Revisions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 border-b border-purple-200">
              <h3 className="text-lg font-bold text-purple-900">📝 Previous Revisions</h3>
              <p className="text-sm text-purple-700">Click to compare with current</p>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <ModernLoadingSpinners size="md" />
                <p className="mt-4 text-gray-600">Loading revisions...</p>
              </div>
            ) : previousRevisions.length > 0 ? (
              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {previousRevisions.map((revision, index) => {
                  const revNum = typeof revision.version === 'number' ? revision.version : parseInt(revision.version || '0');
                  const change = calculateChange(
                    currentRevisionData?.total_cost || 0,
                    revision.total_cost || 0
                  );
                  const isExpanded = expandedRevisionIndex === index;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                    >
                      {/* Header - Always visible */}
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-3 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">📝</span>
                            <div>
                              <div className="font-bold text-gray-900">
                                {revNum === 0 ? 'Original' : `Revision ${revNum}`}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(revision.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-900">
                              {formatCurrency(calculateTotalFromItems(revision))}
                            </div>
                            {change.percentage !== 0 && (
                              <div className={`flex items-center gap-1 text-xs font-semibold ${
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

                      {/* Expandable Details - Full Details with Soft Red Background */}
                      {isExpanded && revision.boq_details?.items && (
                        <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 space-y-3 max-h-[500px] overflow-y-auto">
                          {revision.boq_details.items.map((item: any, itemIdx: number) => (
                            <div key={itemIdx} className="bg-white rounded-lg p-4 shadow-sm border border-red-200">
                              <h5 className="font-semibold text-gray-900 mb-2 text-sm">{item.item_name}</h5>
                              {item.description && (
                                <p className="text-xs text-gray-600 mb-3">{item.description}</p>
                              )}

                              {/* Sub Items */}
                              {item.sub_items && item.sub_items.length > 0 && (
                                <div className="mb-3 space-y-2">
                                  <p className="text-xs font-semibold text-gray-700 mb-2">📋 Sub Items:</p>
                                  {item.sub_items.map((subItem: any, subIdx: number) => (
                                    <div key={subIdx} className="bg-red-100 border border-red-300 rounded-lg p-2">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <p className="font-semibold text-xs text-gray-900">{subItem.sub_item_name}</p>
                                          {subItem.scope && <p className="text-xs text-gray-600">{subItem.scope}</p>}
                                        </div>
                                        <div className="text-right text-xs text-gray-600">
                                          {subItem.size && <div>Size: {subItem.size}</div>}
                                          {subItem.location && <div>Loc: {subItem.location}</div>}
                                          {subItem.brand && <div>Brand: {subItem.brand}</div>}
                                        </div>
                                      </div>

                                      {/* Sub Item Materials */}
                                      {subItem.materials && subItem.materials.length > 0 && (
                                        <div className="mb-2">
                                          <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                                          <div className="space-y-1">
                                            {subItem.materials.map((mat: any, matIdx: number) => (
                                              <div key={matIdx} className="text-xs text-gray-600 flex justify-between bg-white rounded px-2 py-1">
                                                <span>{mat.material_name} ({mat.quantity} {mat.unit})</span>
                                                <span className="font-semibold">AED {(mat.quantity * mat.unit_price).toFixed(2)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Sub Item Labour */}
                                      {subItem.labour && subItem.labour.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-gray-700 mb-1">👷 Labour:</p>
                                          <div className="space-y-1">
                                            {subItem.labour.map((lab: any, labIdx: number) => (
                                              <div key={labIdx} className="text-xs text-gray-600 flex justify-between bg-white rounded px-2 py-1">
                                                <span>{lab.labour_role} ({lab.hours}h)</span>
                                                <span className="font-semibold">AED {(lab.hours * lab.rate_per_hour).toFixed(2)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Direct Materials (for items without sub_items) */}
                              {(!item.sub_items || item.sub_items.length === 0) && item.materials && item.materials.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-gray-700 mb-1">📦 Materials:</p>
                                  <div className="space-y-1">
                                    {item.materials.map((mat: any, matIdx: number) => (
                                      <div key={matIdx} className="text-xs text-gray-600 flex justify-between bg-red-50 p-2 rounded">
                                        <span>{mat.material_name} ({mat.quantity} {mat.unit})</span>
                                        <span className="font-semibold">AED {mat.total_price}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Direct Labour (for items without sub_items) */}
                              {(!item.sub_items || item.sub_items.length === 0) && item.labour && item.labour.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-gray-700 mb-1">👷 Labour:</p>
                                  <div className="space-y-1">
                                    {item.labour.map((lab: any, labIdx: number) => (
                                      <div key={labIdx} className="text-xs text-gray-600 flex justify-between bg-red-50 p-2 rounded">
                                        <span>{lab.labour_role} ({lab.hours}h)</span>
                                        <span className="font-semibold">AED {lab.total_cost}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Additional Details: Overhead, Profit, Discount, VAT */}
                              <div className="mt-3 pt-2 border-t border-red-200 space-y-1">
                                {/* Calculate costs with correct labels */}
                                {(() => {
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

                                  return (
                                    <>
                                      <div className="text-xs text-gray-600 flex justify-between rounded px-2 py-1">
                                        <span>Item Total (Qty × Rate):</span>
                                        <span className="font-semibold">AED {itemTotal.toFixed(2)}</span>
                                      </div>
                                      {item.overhead_percentage > 0 && (
                                        <div className="text-xs text-gray-600 flex justify-between">
                                          <span>Miscellaneous ({item.overhead_percentage}%):</span>
                                          <span className="font-semibold">AED {miscellaneousAmount.toFixed(2)}</span>
                                        </div>
                                      )}
                                      {item.profit_margin_percentage > 0 && (
                                        <div className="text-xs text-gray-600 flex justify-between">
                                          <span>Overhead & Profit ({item.profit_margin_percentage}%):</span>
                                          <span className="font-semibold">AED {overheadProfitAmount.toFixed(2)}</span>
                                        </div>
                                      )}
                                      <div className="text-xs text-gray-700 flex justify-between rounded px-2 py-1 bg-gray-100 font-semibold">
                                        <span>Subtotal:</span>
                                        <span>AED {subtotal.toFixed(2)}</span>
                                      </div>
                                      {item.discount_percentage > 0 && (
                                        <div className="text-xs text-red-600 flex justify-between">
                                          <span>Discount ({item.discount_percentage}%):</span>
                                          <span className="font-semibold">- AED {discountAmount.toFixed(2)}</span>
                                        </div>
                                      )}
                                      <div className="text-xs text-gray-700 flex justify-between rounded px-2 py-1">
                                        <span>After Discount:</span>
                                        <span className="font-semibold">AED {afterDiscount.toFixed(2)}</span>
                                      </div>
                                      {item.vat_percentage > 0 && (
                                        <div className="text-xs text-green-600 flex justify-between">
                                          <span>VAT ({item.vat_percentage}%) [ADDITIONAL]:</span>
                                          <span className="font-semibold">+ AED {vatAmount.toFixed(2)}</span>
                                        </div>
                                      )}
                                      <div className="text-sm font-bold text-gray-900 flex justify-between bg-red-50 rounded px-2 py-1 mt-2">
                                        <span>Final Total Price:</span>
                                        <span>AED {finalTotalPrice.toFixed(2)}</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Button - Only Show/Hide Details */}
                      <div className="p-2 bg-gray-50 border-t border-gray-200">
                        <button
                          onClick={() => setExpandedRevisionIndex(isExpanded ? null : index)}
                          className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors font-medium"
                        >
                          {isExpanded ? '▲ Hide Details' : '▼ Show Details'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <div className="text-5xl mb-3">📝</div>
                <p className="font-medium text-gray-700">No Previous Revisions Available</p>
                <p className="text-sm mt-2 text-gray-600">
                  {getDisplayRevisionNumber(selectedBoq) === 0
                    ? 'This is the original BOQ'
                    : 'Original BOQ data was not saved. New revisions will have full history.'
                  }
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}

        </TabsContent>

        {/* Internal Revisions Tab */}
        <TabsContent value="internal">
          <InternalRevisionTimeline />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RevisionComparisonPage;
