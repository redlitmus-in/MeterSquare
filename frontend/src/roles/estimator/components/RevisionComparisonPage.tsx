import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, TrendingUp, TrendingDown, Send, Mail, Edit, Eye, ArrowRight, CheckCircle, Clock, XCircle, Calculator, Info, Image as ImageIcon, FileCheck } from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { BOQ } from '../types';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InternalRevisionTimeline from './InternalRevisionTimeline';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ✅ LISTEN TO REAL-TIME UPDATES - No more 3-second polling!
  const boqUpdateTimestamp = useRealtimeUpdateStore(state => state.boqUpdateTimestamp);

  // Get display revision number
  // Original = show "Original", First Revision = 1, Second Revision = 2, etc.
  const getDisplayRevisionNumber = (boq: BOQ) => {
    return boq.revision_number || 0;
  };

  const getRevisionLabel = (boq: BOQ) => {
    const revNum = boq.revision_number || 0;
    return revNum === 0 ? 'Original' : `R${revNum}`;
  };

  // Filter BOQs for Client Revisions tab:
  // Show ALL BOQs with revision_number > 0 (regardless of status)
  // Sort by most recent first (created_at descending)
  const boqsWithRevisions = boqList
    .filter(boq => {
      return (boq.revision_number || 0) > 0;
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
      const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
      return dateB - dateA; // Most recent first
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
    }
  }, [selectedBoq]);

  // ✅ RELOAD revision data when real-time update is received
  useEffect(() => {
    if (boqUpdateTimestamp === 0) return;

    // Refresh the parent component's BOQ list
    if (onRefresh) {
      onRefresh();
    }

    // Reload revision data if a BOQ is selected
    if (selectedBoq) {
      loadRevisionData(selectedBoq);
    }
  }, [boqUpdateTimestamp]);

  // Update selectedBoq when boqList changes (e.g., after approval/rejection, client response, or edit)
  useEffect(() => {
    if (selectedBoq && boqList.length > 0) {
      const updatedBoq = boqList.find(b => b.boq_id === selectedBoq.boq_id);
      if (updatedBoq) {
        // Update if status changed OR if updated_at changed (indicating an edit)
        if (updatedBoq.status !== selectedBoq.status ||
            updatedBoq.updated_at !== selectedBoq.updated_at) {
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

  // ✅ REMOVED POLLING - Now using real-time updates instead
  // No more 3-second polling! Updates happen instantly via real-time store

  // Handle send to TD with loading state
  const handleSendToTD = async (boq: BOQ) => {
    setIsSendingToTD(true);
    try {
      await onSendToTD(boq);
      // Refresh data after sending
      if (onRefresh) {
        await onRefresh();
      }

      // Wait a bit for the data to refresh, then update selectedBoq with latest status
      setTimeout(() => {
        const updatedBoq = boqList.find(b => b.boq_id === boq.boq_id);
        if (updatedBoq) {
          setSelectedBoq(updatedBoq);
        }
      }, 500);

      // Reload revision data
      await loadRevisionData(boq);
      // Real-time updates will automatically handle approval notifications
    } catch (error) {
      console.error('Error sending to TD:', error);
    } finally {
      setIsSendingToTD(false);
    }
  };

  const loadRevisionData = async (boq: BOQ) => {
    setIsLoading(true);
    try {
      // 🔥 Fetch FULL detailed BOQ from /boq/{boq_id} endpoint (like Internal Revisions does)
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('access_token');

      const response = await fetch(`${API_URL}/boq/${boq.boq_id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const boqData = await response.json();

      if (boqData && boqData.boq_id) {
        console.log('📊 Loaded detailed BOQ data:', boqData);

        // Set current version with full details
        const current = {
          boq_detail_id: boqData.boq_id,
          boq_id: boqData.boq_id,
          version: 'current',
          boq_details: {
            items: boqData.existing_purchase?.items || [],
            discount_percentage: boqData.discount_percentage || 0,
            discount_amount: boqData.discount_amount || 0,
            total_cost: boqData.total_cost || 0,
            preliminaries: boqData.preliminaries || {},
            terms_conditions: boqData.terms_conditions || { items: [] }
          },
          total_cost: boqData.total_cost || 0,
          created_at: boqData.created_at
        };

        // Now fetch history for previous revisions
        const result = await estimatorService.getBOQDetailsHistory(boq.boq_id!);
        let historyList = result.success && result.data ? (result.data.history || []) : [];

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
      showError('Failed to load revision data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
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

  // Calculate grand total from items (quantity × rate - discount) + preliminaries
  const calculateTotalFromItems = (boqData: any) => {
    if (!boqData?.boq_details?.items || boqData.boq_details.items.length === 0) return 0;

    const allItems = boqData.boq_details.items || [];

    // Calculate subtotal (sum of all sub-item client amounts using quantity × rate)
    const clientCostBeforeDiscount = allItems.reduce((sum: number, item: any) => {
      if (item.sub_items && item.sub_items.length > 0) {
        return sum + item.sub_items.reduce((siSum: number, si: any) =>
          siSum + ((si.quantity || 0) * (si.rate || 0)), 0
        );
      }
      return sum + (item.client_cost || 0);
    }, 0);

    // Add preliminaries amount
    const preliminariesAmount = boqData.boq_details?.preliminaries?.cost_details?.amount || 0;
    const combinedSubtotal = clientCostBeforeDiscount + preliminariesAmount;

    // Calculate discount on combined subtotal
    let totalDiscount = 0;
    if (boqData.boq_details?.discount_percentage && boqData.boq_details.discount_percentage > 0) {
      totalDiscount = (combinedSubtotal * boqData.boq_details.discount_percentage) / 100;
    } else if (boqData.boq_details?.discount_amount && boqData.boq_details.discount_amount > 0) {
      totalDiscount = boqData.boq_details.discount_amount;
    }

    // Grand total after discount
    return combinedSubtotal - totalDiscount;
  };

  // Calculate Grand Total with discount from snapshot + preliminaries
  const calculateGrandTotal = (snapshot: any): number => {
    if (!snapshot?.items || snapshot.items.length === 0) return 0;

    const allItems = snapshot.items || [];

    // Calculate subtotal (sum of all item client amounts)
    const itemsSubtotal = allItems.reduce((sum: number, item: any) => {
      // Calculate client amount for each item
      let itemClientAmount = (item.quantity || 0) * (item.rate || 0);
      if (itemClientAmount === 0 && item.sub_items && item.sub_items.length > 0) {
        // If rate is 0, calculate from sub-items
        itemClientAmount = item.sub_items.reduce((siSum: number, si: any) =>
          siSum + ((si.quantity || 0) * (si.rate || 0)), 0
        );
      }
      return sum + itemClientAmount;
    }, 0);

    // Add preliminaries amount
    const preliminariesAmount = snapshot.preliminaries?.cost_details?.amount || 0;
    const combinedSubtotal = itemsSubtotal + preliminariesAmount;

    // Get overall BOQ discount on combined subtotal
    let overallDiscount = 0;

    if (snapshot.discount_percentage && snapshot.discount_percentage > 0) {
      overallDiscount = (combinedSubtotal * snapshot.discount_percentage) / 100;
    } else if (snapshot.discount_amount && snapshot.discount_amount > 0) {
      overallDiscount = snapshot.discount_amount;
    }

    const grandTotal = combinedSubtotal - overallDiscount;
    return grandTotal;
  };

  // Render Grand Total Section with Discount Impact
  const renderGrandTotalSection = (snapshot: any) => {
    if (!snapshot?.items || snapshot.items.length === 0) return null;

    const allItems = snapshot.items || [];

    // Calculate items subtotal
    const itemsSubtotal = allItems.reduce((sum: number, item: any) => {
      let itemClientAmount = (item.quantity || 0) * (item.rate || 0);
      if (itemClientAmount === 0 && item.sub_items && item.sub_items.length > 0) {
        itemClientAmount = item.sub_items.reduce((siSum: number, si: any) =>
          siSum + ((si.quantity || 0) * (si.rate || 0)), 0
        );
      }
      return sum + itemClientAmount;
    }, 0);

    // Add preliminaries amount
    const preliminaryAmount = snapshot.preliminaries?.cost_details?.amount || 0;
    const subtotal = itemsSubtotal + preliminaryAmount;

    // Get overall BOQ discount (applied to combined subtotal)
    let overallDiscount = 0;
    let overallDiscountPercentage = 0;

    if (snapshot.discount_percentage && snapshot.discount_percentage > 0) {
      overallDiscountPercentage = snapshot.discount_percentage;
      overallDiscount = (subtotal * snapshot.discount_percentage) / 100;
    } else if (snapshot.discount_amount && snapshot.discount_amount > 0) {
      overallDiscount = snapshot.discount_amount;
      overallDiscountPercentage = subtotal > 0 ? (overallDiscount / subtotal) * 100 : 0;
    }

    const grandTotal = subtotal - overallDiscount;

    return (
      <div className="mt-4 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-4 border-2 border-green-300">
        <h4 className="font-bold text-green-900 mb-3 text-sm">📊 Grand Total Summary</h4>

        <div className="space-y-2">
          {preliminaryAmount > 0 ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Items Subtotal:</span>
                <span className="font-semibold">AED {itemsSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Preliminaries:</span>
                <span className="font-semibold">AED {preliminaryAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t border-green-300 pt-2">
                <span className="text-gray-800">Combined Subtotal {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
                <span className="font-semibold">AED {subtotal.toFixed(2)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-gray-800">Client Cost {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
              <span className="font-semibold">AED {subtotal.toFixed(2)}</span>
            </div>
          )}

          {overallDiscount > 0 && (
            <>
              <div className="flex justify-between text-sm text-red-700">
                <span>Overall Discount ({overallDiscountPercentage.toFixed(1)}%):</span>
                <span className="font-semibold">- AED {overallDiscount.toFixed(2)}</span>
              </div>
              <div className="h-px bg-green-300"></div>
            </>
          )}

          <div className="flex justify-between text-base font-bold text-green-900 bg-green-200 rounded px-3 py-2">
            <span>Grand Total:</span>
            <span>AED {grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
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

        {/* Search/Select Dropdown - Now at TOP */}
        <div className="relative mb-4" ref={dropdownRef}>
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

        {/* Recent Projects - Always visible (4-5 most recent) */}
        {!selectedBoq && boqsWithRevisions.length > 0 && (
          <div className="mt-4 space-y-2">
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
                        {getRevisionLabel(boq)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

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
              </div>
            </div>
            {/* Show rejection/cancellation reason based on status */}
            {selectedBoq.client_rejection_reason && (() => {
              const status = selectedBoq.status?.toLowerCase() || '';
              const isCancelled = status === 'client_cancelled';
              const isRejected = status === 'rejected' || status === 'client_rejected';

              return (
                <div className={`mt-3 p-3 rounded-lg border ${
                  isCancelled
                    ? 'bg-gray-50 border-gray-300'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className={`text-lg ${isCancelled ? 'text-gray-500' : 'text-red-500'}`}>
                      {isCancelled ? '🚫' : '⚠️'}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${isCancelled ? 'text-gray-800' : 'text-red-800'}`}>
                        {isCancelled ? 'Cancellation Reason:' : 'TD Rejection Reason:'}
                      </p>
                      <p className={`text-sm ${isCancelled ? 'text-gray-700' : 'text-red-700'}`}>
                        {selectedBoq.client_rejection_reason}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
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
                {/* Preliminaries Section - Shown FIRST */}
                {currentRevisionData.boq_details?.preliminaries && (
                  <div className="mb-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border-2 border-purple-200 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-purple-900">📋 Preliminaries & Approval Works</h3>
                        <p className="text-sm text-purple-700">Selected conditions and terms</p>
                      </div>
                    </div>

                    {/* Selected Items */}
                    {currentRevisionData.boq_details.preliminaries.items && currentRevisionData.boq_details.preliminaries.items.length > 0 && (
                      <div className="bg-white rounded-lg p-4 mb-4">
                        <div className="space-y-2">
                          {currentRevisionData.boq_details.preliminaries.items
                            .filter((item: any) => (typeof item === 'object' ? (item.checked || item.selected) : true))
                            .map((item: any, idx: number) => {
                            const itemText = typeof item === 'object' ? (item.description || item.name || item.text || '') : item;
                            const isCustom = typeof item === 'object' && item.isCustom;
                            return (
                              <div key={idx} className="flex items-start gap-2 text-sm">
                                <span className="text-purple-600 mt-0.5">✓</span>
                                <span className="text-gray-700 flex-1">
                                  {itemText}
                                  {isCustom && <span className="ml-2 text-xs text-orange-600 font-semibold">(Custom)</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Cost Summary */}
                    {(() => {
                      const costDetails = currentRevisionData.boq_details.preliminaries.cost_details || {};
                      const amount = costDetails.amount || 0;

                      return (
                        <div className="bg-white rounded-lg p-4">
                          <h5 className="text-sm font-semibold text-gray-900 mb-3">📊 Cost Summary</h5>
                          <div className="grid grid-cols-4 gap-3 text-sm">
                            <div>
                              <span className="text-gray-600">Qty:</span>
                              <p className="font-semibold text-gray-900">1</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Unit:</span>
                              <p className="font-semibold text-gray-900">lot</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Rate:</span>
                              <p className="font-semibold text-green-700">{formatCurrency(amount)}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Amount:</span>
                              <p className="font-bold text-purple-800">{formatCurrency(amount)}</p>
                            </div>
                          </div>

                          {/* Internal Cost Summary */}
                          {costDetails.internal_cost !== undefined && (
                            <div className="mt-4 pt-4 border-t border-purple-200">
                              <h5 className="text-sm font-semibold text-gray-900 mb-3">💰 Internal Cost Summary</h5>
                              {(() => {
                                const internalCostBase = costDetails.internal_cost || 0;
                                const miscPct = costDetails.misc_percentage || 0;
                                const overheadPct = costDetails.overhead_profit_percentage || 0;
                                const transportPct = costDetails.transport_percentage || 0;

                                const miscAmount = (amount * miscPct) / 100;
                                const overheadAmount = (amount * overheadPct) / 100;
                                const transportAmount = (amount * transportPct) / 100;
                                const totalInternalCost = internalCostBase + miscAmount + overheadAmount + transportAmount;

                                return (
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Base Internal Cost:</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(internalCostBase)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Miscellaneous ({miscPct}%):</span>
                                      <span className="font-semibold text-yellow-700">{formatCurrency(miscAmount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Overhead & Profit ({overheadPct}%):</span>
                                      <span className="font-semibold text-indigo-600">{formatCurrency(overheadAmount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Transport ({transportPct}%):</span>
                                      <span className="font-semibold text-teal-600">{formatCurrency(transportAmount)}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-purple-200">
                                      <span className="text-gray-900 font-bold">Total Internal Cost:</span>
                                      <span className="font-bold text-red-600">{formatCurrency(totalInternalCost)}</span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* BOQ Items */}
                {currentRevisionData.boq_details?.items?.map((item: any, index: number) => {
                  const prevRevision = getPreviousRevisionForComparison();
                  const prevItem = prevRevision ? findPreviousItem(item.item_name, prevRevision) : null;

                  return (
                    <div key={index} className="border-2 rounded-lg overflow-hidden mb-4 bg-white border-blue-300">
                      {/* Item Header - More Prominent */}
                      <div className="px-4 py-3 bg-blue-50 border-b-2 border-blue-300">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                              🔷 {item.item_name}
                              {item.work_type && (
                                <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-semibold">
                                  {item.work_type}
                                </span>
                              )}
                            </h4>
                            {/* Show main item quantity and unit */}
                            {item.quantity && item.unit && (
                              <p className="text-sm text-gray-700 mt-1 font-medium">
                                Qty: {item.quantity} {item.unit}
                                {item.rate && item.rate > 0 && ` × Rate: AED ${item.rate.toFixed(2)}`}
                                {item.item_total && item.item_total > 0 && (
                                  <span className="ml-2 font-bold text-blue-800">
                                    = AED {item.item_total.toFixed(2)}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Item Body */}
                      <div className="p-4">
                        {item.description && (
                          <p className="text-sm text-gray-700 mb-3 bg-gray-50 p-2 rounded border-l-4 border-gray-400">{item.description}</p>
                        )}

                      {/* Sub Items */}
                      {item.sub_items && item.sub_items.length > 0 && (
                        <div className="mb-4 space-y-3">
                          <h5 className="text-sm font-bold text-indigo-900 mb-3 pb-2 border-b-2 border-indigo-200 bg-indigo-50 px-3 py-2 rounded-t">
                            📋 Sub Items ({item.sub_items.length})
                          </h5>
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
                                  <div className="text-right text-xs">
                                    {subItem.size && <div className="text-gray-600">Size: {subItem.size}</div>}
                                    <div className="font-semibold text-gray-900">
                                      AED {((subItem.materials_cost || 0) + (subItem.labour_cost || 0)).toFixed(2)}
                                    </div>
                                    {subItem.location && <div className="text-gray-600">Location: {subItem.location}</div>}
                                    {subItem.brand && <div className="text-gray-600">Brand: {subItem.brand}</div>}
                                  </div>
                                </div>

                                {/* Sub-item Images */}
                                {subItem.sub_item_image && Array.isArray(subItem.sub_item_image) && subItem.sub_item_image.length > 0 && (
                                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                      <ImageIcon className="w-3.5 h-3.5" />
                                      Attached Images ({subItem.sub_item_image.length})
                                    </h5>
                                    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                                      {subItem.sub_item_image.map((image: any, imgIndex: number) => (
                                        <div
                                          key={imgIndex}
                                          className="relative group cursor-pointer"
                                          onClick={() => window.open(image.url, '_blank')}
                                        >
                                          <img
                                            src={image.url}
                                            alt={`${subItem.sub_item_name} - ${image.original_name || image.filename}`}
                                            className="w-full h-20 object-cover rounded-lg border border-gray-200 hover:border-green-500 transition-all"
                                          />
                                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
                                            <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Sub Item Materials */}
                                {subItem.materials && subItem.materials.length > 0 && (
                                  <div className="mb-3 bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
                                    <h5 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-2">
                                      📦 Raw Materials
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
                                          {subItem.materials.map((mat: any, matIdx: number) => {
                                            const prevMat = prevSubItem?.materials?.find((pm: any) => pm.material_name === mat.material_name);
                                            const quantityChanged = prevMat ? hasChanged(mat.quantity, prevMat.quantity) : !prevMat;
                                            const priceChanged = prevMat ? hasChanged(mat.quantity * mat.unit_price, prevMat.quantity * prevMat.unit_price) : !prevMat;
                                            const isNew = !prevMat;
                                            const materialTotal = mat.total_price || (mat.quantity * mat.unit_price);

                                            return (
                                              <tr key={matIdx} className={`border-b border-blue-100 ${isNew ? 'bg-yellow-100' : matIdx % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}`}>
                                                <td className={`py-1.5 px-2 text-gray-900 ${quantityChanged ? 'bg-yellow-200' : ''}`}>
                                                  {mat.material_name}
                                                  {mat.description && <div className="text-xs text-gray-500">{mat.description}</div>}
                                                </td>
                                                <td className={`py-1.5 px-2 text-center text-gray-700 ${quantityChanged ? 'bg-yellow-200' : ''}`}>{mat.quantity}</td>
                                                <td className="py-1.5 px-2 text-center text-gray-700 uppercase">{mat.unit}</td>
                                                <td className="py-1.5 px-2 text-right text-gray-700">AED {mat.unit_price?.toFixed(2) || '0.00'}</td>
                                                <td className={`py-1.5 px-2 text-right font-semibold text-blue-700 ${priceChanged ? 'bg-yellow-200' : ''}`}>AED {materialTotal.toFixed(2)}</td>
                                              </tr>
                                            );
                                          })}
                                          <tr className="bg-blue-200 border-t-2 border-blue-400">
                                            <td colSpan={4} className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">Materials Total:</td>
                                            <td className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">
                                              AED {subItem.materials.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0).toFixed(2)}
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Sub Item Labour */}
                                {subItem.labour && subItem.labour.length > 0 && (
                                  <div className="mb-3 bg-red-50/20 rounded-lg p-3 border border-red-300 hover:border-red-400 transition-all duration-200">
                                    <h5 className="text-xs font-bold text-orange-900 mb-2 flex items-center gap-2">
                                      👷 Labour
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
                                          {subItem.labour.map((lab: any, labIdx: number) => {
                                            const prevLab = prevSubItem?.labour?.find((pl: any) => pl.labour_role === lab.labour_role);
                                            const hoursChanged = prevLab ? hasChanged(lab.hours, prevLab.hours) : !prevLab;
                                            const costChanged = prevLab ? hasChanged(lab.hours * lab.rate_per_hour, prevLab.hours * prevLab.rate_per_hour) : !prevLab;
                                            const isNew = !prevLab;
                                            const labourTotal = lab.total_cost || (lab.hours * lab.rate_per_hour);

                                            return (
                                              <tr key={labIdx} className={`border-b border-orange-100 ${isNew ? 'bg-yellow-100' : labIdx % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                <td className={`py-1.5 px-2 text-gray-900 ${hoursChanged ? 'bg-yellow-200' : ''}`}>{lab.labour_role}</td>
                                                <td className={`py-1.5 px-2 text-center text-gray-700 ${hoursChanged ? 'bg-yellow-200' : ''}`}>{lab.hours} hrs</td>
                                                <td className="py-1.5 px-2 text-right text-gray-700">AED {lab.rate_per_hour?.toFixed(2) || '0.00'}</td>
                                                <td className={`py-1.5 px-2 text-right font-semibold text-orange-700 ${costChanged ? 'bg-yellow-200' : ''}`}>AED {labourTotal.toFixed(2)}</td>
                                              </tr>
                                            );
                                          })}
                                          <tr className="bg-orange-200 border-t-2 border-orange-400">
                                            <td colSpan={3} className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">Labour Total:</td>
                                            <td className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">
                                              AED {subItem.labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0).toFixed(2)}
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Cost Breakdown Percentages (Per-Sub-Item) - EXACT COPY from BOQDetailsModal with Yellow Highlighting */}
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

                                      // Get previous percentages for comparison
                                      const prevMiscPercentage = prevSubItem ? (prevSubItem.misc_percentage || 10) : miscPercentage;
                                      const prevOverheadProfitPercentage = prevSubItem ? (prevSubItem.overhead_profit_percentage || 25) : overheadProfitPercentage;
                                      const prevTransportPercentage = prevSubItem ? (prevSubItem.transport_percentage || 5) : transportPercentage;

                                      // Check if percentages changed
                                      const miscChanged = prevSubItem && hasChanged(miscPercentage, prevMiscPercentage);
                                      const overheadChanged = prevSubItem && hasChanged(overheadProfitPercentage, prevOverheadProfitPercentage);
                                      const transportChanged = prevSubItem && hasChanged(transportPercentage, prevTransportPercentage);

                                      return (
                                        <>
                                          <div className="flex justify-between">
                                            <span className="text-gray-700">Client Amount (Qty × Rate):</span>
                                            <span className="font-semibold text-gray-900">{formatCurrency(clientAmount)}</span>
                                          </div>
                                          <div className={`flex justify-between rounded px-2 py-1 ${miscChanged ? 'bg-yellow-200' : ''}`}>
                                            <span className="text-gray-700">Miscellaneous ({miscPercentage}%):</span>
                                            <span className="font-semibold text-red-600">- {formatCurrency(miscAmount)}</span>
                                          </div>
                                          <div className={`flex justify-between rounded px-2 py-1 ${overheadChanged ? 'bg-yellow-200' : ''}`}>
                                            <span className="text-gray-700">Overhead & Profit ({overheadProfitPercentage}%):</span>
                                            <span className="font-semibold text-red-600">- {formatCurrency(overheadProfitAmount)}</span>
                                          </div>
                                          <div className={`flex justify-between rounded px-2 py-1 ${transportChanged ? 'bg-yellow-200' : ''}`}>
                                            <span className="text-gray-700">Transport ({transportPercentage}%):</span>
                                            <span className="font-semibold text-red-600">- {formatCurrency(transportAmount)}</span>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>

                                {/* Profit Analysis (Per-Sub-Item) - EXACT COPY from BOQDetailsModal */}
                                <div className="bg-green-50/50 rounded-lg p-3 border border-green-300 mt-3">
                                  <h5 className="text-xs font-bold text-green-900 mb-2 flex items-center gap-2">
                                    <Info className="w-3.5 h-3.5" />
                                    Profit Analysis
                                  </h5>
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

                      {/* Cost Analysis (Item-Level) - EXACT COPY from BOQDetailsModal with Yellow Highlighting */}
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

                            // Calculate previous values for yellow highlighting
                            const prevItem = prevRevision?.boq_details?.items?.find((pi: any) => pi.item_name === item.item_name);
                            const prevClientCost = prevItem ? (prevItem.client_cost || prevItem.sub_items?.reduce((sum: number, si: any) => sum + ((si.quantity || 0) * (si.rate || 0)), 0) || 0) : 0;
                            const prevInternalCost = prevItem ? (prevItem.internal_cost || prevItem.sub_items?.reduce((sum: number, si: any) => {
                              const materialCost = si.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || m.quantity * m.unit_price), 0) || 0;
                              const labourCost = si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0;
                              const subClientAmount = (si.quantity || 0) * (si.rate || 0);
                              const miscAmount = subClientAmount * ((si.misc_percentage || 10) / 100);
                              const overheadProfitAmount = subClientAmount * ((si.overhead_profit_percentage || 25) / 100);
                              const transportAmount = subClientAmount * ((si.transport_percentage || 5) / 100);
                              return sum + materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount;
                            }, 0) || 0) : 0;
                            const prevProjectMargin = prevItem ? (prevItem.project_margin || (prevClientCost - prevInternalCost)) : 0;

                            const clientCostChanged = prevItem && hasChanged(clientCost, prevClientCost);
                            const internalCostChanged = prevItem && hasChanged(internalCost, prevInternalCost);
                            const marginChanged = prevItem && hasChanged(projectMargin, prevProjectMargin);

                            return (
                              <>
                                <div className={`flex justify-between items-center py-1 rounded px-2 ${clientCostChanged ? 'bg-yellow-200' : ''}`}>
                                  <span className="text-gray-700 font-medium">Client Cost (Total):</span>
                                  <span className="text-blue-700 font-bold text-base">{formatCurrency(clientCost)}</span>
                                </div>
                                <div className={`flex justify-between items-center py-1 rounded px-2 ${internalCostChanged ? 'bg-yellow-200' : ''}`}>
                                  <span className="text-gray-700 font-medium">Internal Cost (Total):</span>
                                  <span className="text-orange-600 font-semibold">{formatCurrency(internalCost)}</span>
                                </div>
                                <div className={`flex justify-between items-center pt-2 border-t-2 border-blue-400 rounded px-2 ${marginChanged ? 'bg-yellow-200' : ''}`}>
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
                    </div>
                  );
                })}

                {/* TERMS & CONDITIONS SECTION */}
                {currentRevisionData.boq_details?.terms_conditions && currentRevisionData.boq_details.terms_conditions.items?.length > 0 && (
                  <div className="mt-6 mb-6 mx-4">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-300 rounded-t-lg p-4 flex items-center gap-3">
                      <FileCheck className="w-6 h-6 text-blue-700" />
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">Terms & Conditions</h3>
                        <p className="text-xs text-gray-600">Selected terms and conditions</p>
                      </div>
                    </div>

                    {/* Terms List */}
                    <div className="bg-white border-x border-b border-blue-300 rounded-b-lg p-4">
                      <div className="space-y-2">
                        {currentRevisionData.boq_details.terms_conditions.items
                          .filter((term: any) => term.checked)
                          .map((term: any, index: number) => (
                          <div key={term.term_id || index} className="bg-blue-50 rounded-lg p-3 border border-blue-200 hover:shadow-sm transition-shadow">
                            <div className="flex items-start gap-3">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                {index + 1}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm text-gray-800 leading-relaxed">{term.terms_text}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Grand Total with Discount Impact */}
                {currentRevisionData.boq_details?.items && currentRevisionData.boq_details.items.length > 0 && (
                  <div className="mt-6 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-5 border-2 border-green-300 mx-4 mb-4">
                    <div className="space-y-3">
                      {(() => {
                        const allItems = currentRevisionData.boq_details.items || [];

                        // Calculate subtotal (sum of all sub-item client amounts)
                        const boqItemsSubtotal = allItems.reduce((sum: number, item: any) => {
                          if (item.sub_items && item.sub_items.length > 0) {
                            return sum + item.sub_items.reduce((siSum: number, si: any) =>
                              siSum + ((si.quantity || 0) * (si.rate || 0)), 0
                            );
                          }
                          return sum + (item.client_cost || 0);
                        }, 0);

                        // Add preliminaries amount to subtotal
                        const preliminariesAmount = currentRevisionData.boq_details?.preliminaries?.cost_details?.amount || 0;
                        const subtotal = boqItemsSubtotal + preliminariesAmount;

                        // Calculate total internal cost from BOQ items
                        const boqItemsInternalCost = allItems.reduce((sum: number, item: any) => {
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

                        // Add preliminaries internal cost
                        const preliminariesInternalCost = (() => {
                          if (!currentRevisionData.boq_details?.preliminaries?.cost_details) return 0;
                          const costDetails = currentRevisionData.boq_details.preliminaries.cost_details;
                          const internalCostBase = costDetails.internal_cost || 0;
                          const miscPct = costDetails.misc_percentage || 10;
                          const overheadPct = costDetails.overhead_profit_percentage || 25;
                          const transportPct = costDetails.transport_percentage || 5;
                          const miscAmount = (preliminariesAmount * miscPct) / 100;
                          const overheadAmount = (preliminariesAmount * overheadPct) / 100;
                          const transportAmount = (preliminariesAmount * transportPct) / 100;
                          return internalCostBase + miscAmount + overheadAmount + transportAmount;
                        })();

                        const totalInternalCost = boqItemsInternalCost + preliminariesInternalCost;

                        // Calculate profits
                        const totalActualProfit = subtotal - totalInternalCost;
                        const profitMarginPercentage = subtotal > 0 ? (totalActualProfit / subtotal) * 100 : 0;

                        // Overall discount - Priority 1: Check for overall BOQ-level discount
                        let overallDiscount = 0;
                        let overallDiscountPercentage = 0;

                        if (currentRevisionData.boq_details.discount_percentage && currentRevisionData.boq_details.discount_percentage > 0) {
                          // Priority 1: Overall BOQ discount percentage
                          overallDiscountPercentage = currentRevisionData.boq_details.discount_percentage;
                          overallDiscount = (subtotal * currentRevisionData.boq_details.discount_percentage) / 100;
                          console.log('💰 Overall BOQ Discount (Current):', {
                            percentage: currentRevisionData.boq_details.discount_percentage,
                            amount: overallDiscount,
                            subtotal
                          });
                        } else if (currentRevisionData.boq_details.discount_amount && currentRevisionData.boq_details.discount_amount > 0) {
                          // Priority 2: Overall BOQ discount amount
                          overallDiscount = currentRevisionData.boq_details.discount_amount;
                          overallDiscountPercentage = subtotal > 0 ? (overallDiscount / subtotal) * 100 : 0;
                        } else {
                          // Priority 3: Fall back to item-level discounts
                          allItems.forEach((item: any) => {
                            overallDiscount += (item.discount_amount || 0);
                          });
                          if (subtotal > 0 && overallDiscount > 0) {
                            overallDiscountPercentage = (overallDiscount / subtotal) * 100;
                          }
                        }

                        // Grand total
                        const grandTotal = subtotal - overallDiscount;

                        // Calculate profit after discount
                        const negotiableMarginAfterDiscount = grandTotal - totalInternalCost;
                        const profitMarginAfterDiscount = grandTotal > 0 ? (negotiableMarginAfterDiscount / grandTotal) * 100 : 0;

                        // Get previous revision for discount comparison
                        const prevRevisionForDiscount = getPreviousRevisionForComparison();
                        const prevDiscountPercentage = prevRevisionForDiscount?.boq_details?.discount_percentage || 0;
                        const discountChanged = prevRevisionForDiscount && hasChanged(overallDiscountPercentage, prevDiscountPercentage);

                        return (
                          <>
                            {preliminariesAmount > 0 ? (
                              <>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-700">Items Subtotal:</span>
                                  <span className="font-semibold">AED {boqItemsSubtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-700">Preliminaries:</span>
                                  <span className="font-semibold">AED {preliminariesAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-base font-medium border-t border-green-300 pt-2">
                                  <span className="text-gray-800">Combined Subtotal {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
                                  <span className="font-semibold">AED {subtotal.toFixed(2)}</span>
                                </div>
                              </>
                            ) : (
                              <div className="flex justify-between text-base font-medium">
                                <span className="text-gray-800">Client Cost {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
                                <span className="font-semibold">AED {subtotal.toFixed(2)}</span>
                              </div>
                            )}
                            {overallDiscount > 0 && (
                              <>
                                <div className={`flex justify-between text-sm text-red-600 rounded px-2 py-1 ${discountChanged ? 'bg-yellow-200' : ''}`}>
                                  <span>Discount ({overallDiscountPercentage.toFixed(1)}%):</span>
                                  <span className="font-semibold">- AED {overallDiscount.toFixed(2)}</span>
                                </div>
                              </>
                            )}
                            <div className="flex justify-between pt-3 border-t-2 border-green-400 text-lg font-bold">
                              <span className="text-green-900">
                                Grand Total: <span className="text-xs font-normal text-gray-600">(Excluding VAT)</span>
                              </span>
                              <span className="text-green-700">AED {grandTotal.toFixed(2)}</span>
                            </div>

                            {/* Show discount impact on profitability */}
                            {overallDiscount > 0 && (
                              <div className="mt-4 pt-4 border-t border-green-300 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
                                <h6 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                                  📊 Discount Impact on Profitability
                                </h6>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Client Cost:</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 line-through">
                                        AED {subtotal.toFixed(2)}
                                      </span>
                                      <span className="text-blue-700 font-bold">
                                        → AED {grandTotal.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Internal Cost:</span>
                                    <span className="font-semibold text-red-600">
                                      AED {totalInternalCost.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                    <span className="text-gray-700 font-medium">Negotiable Margins:</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 line-through">
                                        AED {totalActualProfit.toFixed(2)}
                                      </span>
                                      <span className={`font-bold ${negotiableMarginAfterDiscount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                        → AED {negotiableMarginAfterDiscount.toFixed(2)}
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
                                      ⚠️
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
                )}
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
                const isClientRevisionRejected = status === 'client_revision_rejected';
                const isClientRevisionAccepted = status === 'client_revision_accepted';
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

                if (isClientRevisionAccepted) {
                  return (
                    <div className="text-center text-xs text-green-700 font-medium py-2">
                      <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-600" />
                      Client Revision Accepted by TD
                    </div>
                  );
                }

                // Handle both client_rejected and client_revision_rejected statuses
                if (isClientRejected || isClientRevisionRejected) {
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {/* Revise BOQ */}
                      <button
                        onClick={() => onEdit(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                        title={isClientRevisionRejected ? "Revise BOQ - Rejected by TD" : "Revise BOQ based on client feedback"}
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
                              {formatCurrency(revision.boq_details?.total_cost || calculateGrandTotal(revision.boq_details))}
                            </div>
                            {revision.boq_details?.discount_percentage > 0 && (
                              <div className="text-xs text-red-600 font-semibold">
                                Discount: {revision.boq_details.discount_percentage}%
                              </div>
                            )}
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
                          {/* Preliminaries Section - Shown FIRST (Previous Revision) */}
                          {revision.boq_details?.preliminaries && (
                            <div className="mb-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border-2 border-purple-200 shadow-lg">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white rounded-lg shadow-sm">
                                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-purple-900">📋 Preliminaries & Approval Works</h3>
                                  <p className="text-sm text-purple-700">Selected conditions and terms</p>
                                </div>
                              </div>

                              {(() => {
                                const prelimData = revision.boq_details.preliminaries;
                                const items = prelimData.items || [];
                                const costDetails = prelimData.cost_details || {};
                                const amount = costDetails.amount || 0;
                                const miscPct = costDetails.misc_percentage || 10;
                                const overheadPct = costDetails.overhead_profit_percentage || 25;
                                const transportPct = costDetails.transport_percentage || 5;

                                return (
                                  <>
                                    {/* Selected Items */}
                                    {items.length > 0 && (
                                      <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                                        <h5 className="text-sm font-semibold text-gray-900 mb-3">Selected Items:</h5>
                                        <div className="space-y-2">
                                          {items
                                            .filter((item: any) => (typeof item === 'object' ? (item.checked || item.selected) : true))
                                            .map((item: any, idx: number) => {
                                            const itemText = typeof item === 'object' ? (item.description || item.name || item.text || '') : item;
                                            const isCustom = typeof item === 'object' && (item.custom_item || item.isCustom);
                                            return (
                                              <div key={idx} className="flex items-start gap-2">
                                                <span className="text-green-600 font-bold mt-0.5">✓</span>
                                                <div className="flex-1">
                                                  <p className="text-sm text-gray-800">{itemText}</p>
                                                  {isCustom && (
                                                    <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                                      Custom Item
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Cost Summary */}
                                    <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
                                      <h5 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h5>
                                      <div className="grid grid-cols-4 gap-4">
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Quantity</p>
                                          <p className="text-sm font-semibold text-gray-900">{costDetails.quantity || 1}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Unit</p>
                                          <p className="text-sm font-semibold text-gray-900">{costDetails.unit || 'lot'}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Rate (AED)</p>
                                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(costDetails.rate || 0)}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-gray-600 mb-1">Amount (AED)</p>
                                          <p className="text-sm font-bold text-purple-900">{formatCurrency(amount)}</p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Internal Cost Summary */}
                                    {costDetails.internal_cost !== undefined && (
                                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                                        <h5 className="text-sm font-semibold text-gray-900 mb-3">Internal Cost Summary</h5>
                                        {(() => {
                                          const internalCostBase = costDetails.internal_cost || 0;
                                          const miscAmount = (amount * miscPct) / 100;
                                          const overheadAmount = (amount * overheadPct) / 100;
                                          const transportAmount = (amount * transportPct) / 100;
                                          const totalInternalCost = internalCostBase + miscAmount + overheadAmount + transportAmount;

                                          return (
                                            <div className="space-y-2 text-sm">
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Base Internal Cost:</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(internalCostBase)}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Miscellaneous ({miscPct}%):</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(miscAmount)}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Overhead & Profit ({overheadPct}%):</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(overheadAmount)}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-gray-700">Transport ({transportPct}%):</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(transportAmount)}</span>
                                              </div>
                                              <div className="flex justify-between pt-2 border-t-2 border-blue-300">
                                                <span className="text-gray-900 font-bold">Total Internal Cost:</span>
                                                <span className="font-bold text-red-600">{formatCurrency(totalInternalCost)}</span>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {revision.boq_details.items.map((item: any, itemIdx: number) => {
                            // Calculate client amount - if rate is 0, calculate from sub-items
                            let clientAmount = (item.quantity || 0) * (item.rate || 0);
                            if (clientAmount === 0 && item.sub_items && item.sub_items.length > 0) {
                              clientAmount = item.sub_items.reduce((sum: number, subItem: any) => {
                                const subItemClientAmount = (subItem.quantity || 0) * (subItem.rate || 0);
                                return sum + subItemClientAmount;
                              }, 0);
                            }

                            const miscellaneousAmount = item.overhead_amount || (clientAmount * ((item.overhead_percentage || 10) / 100));
                            const overheadProfitAmount = item.profit_margin_amount || (clientAmount * ((item.profit_margin_percentage || 15) / 100));
                            const subtotal = item.subtotal || clientAmount;

                            return (
                              <div key={itemIdx} className="border-2 rounded-lg overflow-hidden mb-4 bg-white border-red-300">
                                {/* Item Header */}
                                <div className="px-4 py-3 bg-red-50 border-b-2 border-red-300">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                        🔷 {item.item_name}
                                        {item.work_type && (
                                          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-semibold">
                                            {item.work_type}
                                          </span>
                                        )}
                                      </h4>
                                      {item.quantity && item.unit && (
                                        <p className="text-sm text-gray-700 mt-1 font-medium">
                                          Qty: {item.quantity} {item.unit}
                                          {item.rate && item.rate > 0 && ` × Rate: AED ${item.rate.toFixed(2)}`}
                                          {item.item_total && item.item_total > 0 && (
                                            <span className="ml-2 font-bold text-blue-800">
                                              = AED {item.item_total.toFixed(2)}
                                            </span>
                                          )}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Item Body */}
                                <div className="p-4">
                                  {item.description && (
                                    <p className="text-sm text-gray-700 mb-3 bg-gray-50 p-2 rounded border-l-4 border-gray-400">{item.description}</p>
                                  )}

                                  {/* Sub Items */}
                                  {item.sub_items && item.sub_items.length > 0 && (
                                    <div className="mb-4 space-y-3">
                                      <h5 className="text-sm font-bold text-indigo-900 mb-3 pb-2 border-b-2 border-indigo-200 bg-indigo-50 px-3 py-2 rounded-t">
                                        📋 Sub Items ({item.sub_items.length})
                                      </h5>
                                      {item.sub_items.map((subItem: any, subIdx: number) => (
                                        <div key={subIdx} className="bg-green-50 border border-green-200 rounded p-2">
                                          <div className="flex justify-between items-start mb-1">
                                            <div className="flex-1">
                                              <p className="font-semibold text-xs text-gray-900">{subItem.sub_item_name}</p>
                                              {subItem.scope && <p className="text-xs text-gray-600">{subItem.scope}</p>}
                                              <p className="text-xs text-gray-600 mt-1">
                                                Qty: {subItem.quantity} {subItem.unit} × Rate: AED {subItem.rate?.toFixed(2) || '0.00'}
                                              </p>
                                            </div>
                                            <div className="text-right text-xs ml-2">
                                              {subItem.size && <div className="text-gray-600">Size: {subItem.size}</div>}
                                              {subItem.location && <div className="text-gray-600">Loc: {subItem.location}</div>}
                                              {subItem.brand && <div className="text-gray-600">Brand: {subItem.brand}</div>}
                                              {subItem.base_total !== undefined && (
                                                <div className="font-bold text-blue-900 mt-1 bg-blue-100 px-2 py-0.5 rounded">
                                                  Base: AED {subItem.base_total?.toFixed(2)}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* Sub-item Images */}
                                          {subItem.sub_item_image && Array.isArray(subItem.sub_item_image) && subItem.sub_item_image.length > 0 && (
                                            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                              <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                                <ImageIcon className="w-3.5 h-3.5" />
                                                Attached Images ({subItem.sub_item_image.length})
                                              </h5>
                                              <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                                                {subItem.sub_item_image.map((image: any, imgIndex: number) => (
                                                  <div
                                                    key={imgIndex}
                                                    className="relative group cursor-pointer"
                                                    onClick={() => window.open(image.url, '_blank')}
                                                  >
                                                    <img
                                                      src={image.url}
                                                      alt={`${subItem.sub_item_name} - ${image.original_name || image.filename}`}
                                                      className="w-full h-20 object-cover rounded-lg border border-gray-200 hover:border-red-500 transition-all"
                                                    />
                                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
                                                      <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {/* Sub Item Materials */}
                                          {subItem.materials && subItem.materials.length > 0 && (
                                            <div className="mb-3 bg-red-50/20 rounded-lg p-3 border border-red-300">
                                              <h5 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-2">
                                                📦 Raw Materials
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
                                                    {subItem.materials.map((mat: any, matIdx: number) => {
                                                      const materialTotal = mat.total_price || (mat.quantity * mat.unit_price);
                                                      return (
                                                        <tr key={matIdx} className={`border-b border-blue-100 ${matIdx % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}`}>
                                                          <td className="py-1.5 px-2 text-gray-900">
                                                            {mat.material_name}
                                                            {mat.description && <div className="text-xs text-gray-500">{mat.description}</div>}
                                                          </td>
                                                          <td className="py-1.5 px-2 text-center text-gray-700">{mat.quantity}</td>
                                                          <td className="py-1.5 px-2 text-center text-gray-700 uppercase">{mat.unit}</td>
                                                          <td className="py-1.5 px-2 text-right text-gray-700">AED {mat.unit_price?.toFixed(2) || '0.00'}</td>
                                                          <td className="py-1.5 px-2 text-right font-semibold text-blue-700">AED {materialTotal.toFixed(2)}</td>
                                                        </tr>
                                                      );
                                                    })}
                                                    <tr className="bg-blue-200 border-t-2 border-blue-400">
                                                      <td colSpan={4} className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">Materials Total:</td>
                                                      <td className="py-1.5 px-2 font-bold text-blue-900 text-right text-xs">
                                                        AED {subItem.materials.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0).toFixed(2)}
                                                      </td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          )}

                                          {/* Sub Item Labour */}
                                          {subItem.labour && subItem.labour.length > 0 && (
                                            <div className="bg-orange-50/20 rounded-lg p-3 border border-orange-300">
                                              <h5 className="text-xs font-bold text-orange-900 mb-2 flex items-center gap-2">
                                                👷 Labour
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
                                                    {subItem.labour.map((lab: any, labIdx: number) => (
                                                      <tr key={labIdx} className={`border-b border-orange-100 ${labIdx % 2 === 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                                                        <td className="py-1.5 px-2 text-gray-900">{lab.labour_role}</td>
                                                        <td className="py-1.5 px-2 text-center text-gray-700">{lab.hours} hrs</td>
                                                        <td className="py-1.5 px-2 text-right text-gray-700">AED {lab.rate_per_hour?.toFixed(2) || '0.00'}</td>
                                                        <td className="py-1.5 px-2 text-right font-semibold text-orange-700">
                                                          AED {(lab.total_cost || (lab.hours * lab.rate_per_hour)).toFixed(2)}
                                                        </td>
                                                      </tr>
                                                    ))}
                                                    <tr className="bg-orange-200 border-t-2 border-orange-400">
                                                      <td colSpan={3} className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">Labour Total:</td>
                                                      <td className="py-1.5 px-2 font-bold text-orange-900 text-right text-xs">
                                                        AED {subItem.labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0).toFixed(2)}
                                                      </td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          )}

                                          {/* Cost Breakdown Percentages (Per-Sub-Item) - EXACT COPY from BOQDetailsModal */}
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

                                          {/* Profit Analysis (Per-Sub-Item) - EXACT COPY from BOQDetailsModal */}
                                          <div className="bg-green-50/50 rounded-lg p-3 border border-green-300 mt-3">
                                            <h5 className="text-xs font-bold text-green-900 mb-2 flex items-center gap-2">
                                              <Info className="w-3.5 h-3.5" />
                                              Profit Analysis
                                            </h5>
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

                                  {/* Item-Level Cost Summary & Profit Analysis */}
                                  <div className="mt-3 pt-2 border-t-2 border-gray-300 bg-gray-50 rounded p-3 space-y-1">
                                    {(() => {
                                      // Calculate from sub_items (NEW format)
                                      let itemClientAmount = 0;
                                      let itemInternalCost = 0;
                                      let itemMiscAmount = 0;
                                      let itemOpAmount = 0;
                                      let itemTransportAmount = 0;

                                      if (item.sub_items && item.sub_items.length > 0) {
                                        item.sub_items.forEach((si: any) => {
                                          const siClientAmt = (si.quantity || 0) * (si.rate || 0);
                                          itemClientAmount += siClientAmt;

                                          const matCost = si.materials?.reduce((sum: number, m: any) => sum + (m.total_price || m.quantity * m.unit_price), 0) || 0;
                                          const labCost = si.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || l.hours * l.rate_per_hour), 0) || 0;

                                          const miscPct = si.misc_percentage || 10;
                                          const opPct = si.overhead_profit_percentage || 25;
                                          const transportPct = si.transport_percentage || 5;

                                          itemMiscAmount += (siClientAmt * miscPct) / 100;
                                          itemOpAmount += (siClientAmt * opPct) / 100;
                                          itemTransportAmount += (siClientAmt * transportPct) / 100;

                                          itemInternalCost += matCost + labCost + (siClientAmt * miscPct / 100) + (siClientAmt * transportPct / 100);
                                        });
                                      } else {
                                        // Fallback for items without sub_items (old format)
                                        itemClientAmount = clientAmount;
                                        itemInternalCost = item.internal_cost || 0;
                                        itemMiscAmount = miscellaneousAmount;
                                        itemOpAmount = overheadProfitAmount;
                                      }

                                      const itemActualProfit = itemClientAmount - itemInternalCost;
                                      const itemProfitMargin = itemClientAmount > 0 ? ((itemActualProfit / itemClientAmount) * 100) : 0;

                                      return (
                                        <>
                                          <div className="text-xs text-gray-700 flex justify-between rounded px-2 py-1 bg-blue-50 font-semibold">
                                            <span>💰 Client Amount (Total):</span>
                                            <span>AED {itemClientAmount.toFixed(2)}</span>
                                          </div>
                                          <div className="text-xs text-gray-600 flex justify-between rounded px-2 py-1">
                                            <span>🔧 Internal Cost (Mat + Lab + Misc + Transport):</span>
                                            <span className="font-semibold">AED {itemInternalCost.toFixed(2)}</span>
                                          </div>
                                          {itemMiscAmount > 0 && (
                                            <div className="text-xs text-gray-500 flex justify-between rounded px-2 py-1 pl-6">
                                              <span>↳ Miscellaneous (~10%):</span>
                                              <span>AED {itemMiscAmount.toFixed(2)}</span>
                                            </div>
                                          )}
                                          {itemTransportAmount > 0 && (
                                            <div className="text-xs text-gray-500 flex justify-between rounded px-2 py-1 pl-6">
                                              <span>↳ Transport (~5%):</span>
                                              <span>AED {itemTransportAmount.toFixed(2)}</span>
                                            </div>
                                          )}
                                          {itemOpAmount > 0 && (
                                            <div className="text-xs text-purple-600 flex justify-between rounded px-2 py-1 bg-purple-50">
                                              <span>📊 Overhead & Profit (~25%):</span>
                                              <span className="font-semibold">AED {itemOpAmount.toFixed(2)}</span>
                                            </div>
                                          )}
                                          <div className={`text-sm font-bold flex justify-between rounded px-2 py-1 mt-2 ${
                                            itemActualProfit >= itemOpAmount ? 'bg-green-100 text-green-900' : 'bg-yellow-100 text-yellow-900'
                                          }`}>
                                            <span>💎 Negotiable Margins:</span>
                                            <span>AED {itemActualProfit.toFixed(2)} ({itemProfitMargin.toFixed(1)}%)</span>
                                          </div>
                                          {itemOpAmount > 0 && (
                                            <div className="text-xs px-2 py-1">
                                              {itemActualProfit >= itemOpAmount ? (
                                                <span className="text-green-700">✅ Profit target met or exceeded</span>
                                              ) : (
                                                <span className="text-yellow-700">⚠️ Below planned O&P (AED {(itemOpAmount - itemActualProfit).toFixed(2)} less)</span>
                                              )}
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* TERMS & CONDITIONS SECTION */}
                          {revision.boq_details?.terms_conditions && revision.boq_details.terms_conditions.items?.length > 0 && (
                            <div className="mt-6 mb-6 mx-4">
                              {/* Header */}
                              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-300 rounded-t-lg p-4 flex items-center gap-3">
                                <FileCheck className="w-6 h-6 text-blue-700" />
                                <div>
                                  <h3 className="text-lg font-bold text-gray-900">Terms & Conditions</h3>
                                  <p className="text-xs text-gray-600">Selected terms and conditions</p>
                                </div>
                              </div>

                              {/* Terms List */}
                              <div className="bg-white border-x border-b border-blue-300 rounded-b-lg p-4">
                                <div className="space-y-2">
                                  {revision.boq_details.terms_conditions.items
                                    .filter((term: any) => term.checked)
                                    .map((term: any, index: number) => (
                                    <div key={term.term_id || index} className="bg-blue-50 rounded-lg p-3 border border-blue-200 hover:shadow-sm transition-shadow">
                                      <div className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                          {index + 1}
                                        </span>
                                        <div className="flex-1">
                                          <p className="text-sm text-gray-800 leading-relaxed">{term.terms_text}</p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Grand Total Section */}
                          {renderGrandTotalSection(revision.boq_details)}
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

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (2,244 lines)
export default React.memo(RevisionComparisonPage);
