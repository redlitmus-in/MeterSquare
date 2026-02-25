import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, TrendingUp, TrendingDown, CheckCircle, XCircle, Eye, Clock, Calculator, Info, Image as ImageIcon, FileCheck } from 'lucide-react';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InternalRevisionTimeline from '@/roles/estimator/components/InternalRevisionTimeline';
import { API_BASE_URL } from '@/api/config';

interface BOQ {
  boq_id: number;
  title?: string;
  boq_name?: string;
  project_name?: string;
  client?: string;
  project?: {
    name: string;
    client: string;
  };
  project_details?: {
    project_name: string;
    client: string;
  };
  revision_number?: number;
  total_cost?: number;
  selling_price?: number;
  status?: string;
  client_rejection_reason?: string | null;
}

interface TDRevisionComparisonPageProps {
  boqList: BOQ[];
  onApprove: (boq: BOQ) => void;
  onReject: (boq: BOQ) => void;
  onViewDetails: (boq: BOQ) => void;
  onRefresh?: () => Promise<void>;
  refreshTrigger?: number; // Trigger for InternalRevisionTimeline refresh
  defaultSubTab?: 'client' | 'internal'; // Default sub-tab from URL parameter
}

const TDRevisionComparisonPage: React.FC<TDRevisionComparisonPageProps> = ({
  boqList,
  onApprove,
  onReject,
  onViewDetails,
  onRefresh,
  refreshTrigger,
  defaultSubTab = 'client'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [currentRevisionData, setCurrentRevisionData] = useState<any>(null);
  const [previousRevisions, setPreviousRevisions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedRevisionIndex, setExpandedRevisionIndex] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Helper functions to safely get BOQ data (defined early for use in filters)
  const getProjectTitle = (boq: BOQ) => {
    return boq.title || boq.boq_name || boq.project_name || boq.project?.name || boq.project_details?.project_name || 'Unnamed Project';
  };

  const getProjectName = (boq: BOQ) => {
    return boq.project_name || boq.project?.name || boq.project_details?.project_name || 'Unnamed Project';
  };

  const getClientName = (boq: BOQ) => {
    return boq.client || boq.project?.client || boq.project_details?.client || 'Unknown Client';
  };

  const getTotalCost = (boq: BOQ) => {
    return boq.selling_price || boq.total_cost || 0;
  };

  // Get display revision number
  // Original = show "Original", First Revision = 1, Second Revision = 2, etc.
  const getDisplayRevisionNumber = (boq: BOQ) => {
    return boq.revision_number || 0;
  };

  const getRevisionLabel = (boq: BOQ) => {
    const revNum = boq.revision_number || 0;
    return revNum === 0 ? 'Original' : `R${revNum}`;
  };

  // State for active tab - use defaultSubTab from URL parameter
  const [activeTab, setActiveTab] = useState<'client' | 'internal'>(defaultSubTab);

  // Update activeTab when defaultSubTab prop changes (e.g., from notification link)
  useEffect(() => {
    if (defaultSubTab) {
      setActiveTab(defaultSubTab);
    }
  }, [defaultSubTab]);

  // Filter BOQs for TD based on active tab and sort by recent first
  const boqsWithRevisions = boqList
    .filter(boq => {
      const status = boq.status?.toLowerCase() || '';

      if (activeTab === 'client') {
        // Client Revisions tab: Show ALL BOQs with revision_number > 0
        return (boq.revision_number || 0) > 0;
      } else {
        // Internal Revisions tab: Show pending approval or with revisions (original logic)
        const hasRevisions = (boq.revision_number || 0) > 0;
        const isPendingApproval = (status === 'pending_approval' || status === 'pending_revision' || status === 'pending' || status === 'client_pending_revision');
        return hasRevisions || isPendingApproval;
      }
    })
    .sort((a, b) => {
      // Sort by most recent first (created_at or updated_at descending)
      const dateA = new Date((a as any).created_at || (a as any).updated_at || 0).getTime();
      const dateB = new Date((b as any).created_at || (b as any).updated_at || 0).getTime();
      return dateB - dateA; // Most recent first
    });

  // Filter based on search (includes ID search)
  const filteredBOQs = boqsWithRevisions.filter(boq => {
    const searchLower = searchTerm.toLowerCase().trim();
    // ✅ Search by ID (B-123, 123), title, project name, or client
    const boqIdString = `b-${boq.boq_id || boq.id}`;
    return !searchTerm ||
      getProjectTitle(boq).toLowerCase().includes(searchLower) ||
      getProjectName(boq).toLowerCase().includes(searchLower) ||
      getClientName(boq).toLowerCase().includes(searchLower) ||
      boqIdString.includes(searchLower) ||
      (boq.boq_id || boq.id)?.toString().includes(searchTerm.trim());
  });

  useEffect(() => {
    if (selectedBoq) {
      loadRevisionData(selectedBoq);
    }
  }, [selectedBoq]);

  // Update selectedBoq when boqList changes (e.g., after approval/rejection)
  useEffect(() => {
    if (selectedBoq && boqList.length > 0) {
      const updatedBoq = boqList.find(b => b.boq_id === selectedBoq.boq_id);
      if (updatedBoq) {
        // Check if BOQ still exists in filtered list based on current tab
        const stillInFilteredList = boqsWithRevisions.find(b => b.boq_id === selectedBoq.boq_id);

        if (!stillInFilteredList) {
          // BOQ no longer matches filter criteria, clear selection and return to list
          console.log('🔄 BOQ no longer in filtered list, clearing selection');
          setSelectedBoq(null);
          setCurrentRevisionData(null);
          setPreviousRevisions([]);
          // Don't auto-select, let user manually choose next BOQ
        } else if (updatedBoq.status !== selectedBoq.status ||
                   updatedBoq.updated_at !== selectedBoq.updated_at) {
          // Update if status changed OR if content edited (updated_at changed) but still in list
          console.log('🔄 BOQ updated:', updatedBoq.status !== selectedBoq.status ? 'status changed' : 'content edited');
          setSelectedBoq(updatedBoq);
        }
      } else {
        // BOQ no longer exists in boqList, clear selection and return to list
        console.log('🔄 BOQ no longer exists, clearing selection');
        setSelectedBoq(null);
        setCurrentRevisionData(null);
        setPreviousRevisions([]);
        // Don't auto-select, let user manually choose next BOQ
      }
    }
  }, [boqList, boqsWithRevisions]);

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

  const loadRevisionData = async (boq: BOQ) => {
    setIsLoading(true);
    try {
      // 🔥 Fetch FULL detailed BOQ from /boq/{boq_id} endpoint (like Internal Revisions does)
      const API_URL = API_BASE_URL;
      const token = localStorage.getItem('access_token');

      const response = await fetch(`${API_URL}/boq/${boq.boq_id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const boqData = await response.json();

      if (boqData && boqData.boq_id) {
        console.log('📊 TD: Loaded detailed BOQ data:', boqData);

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
            profit_analysis: boqData.profit_analysis || null,
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

  // Find matching item in previous revision
  const findPreviousItem = (itemName: string, prevRevision: any) => {
    if (!prevRevision?.boq_details?.items) return null;
    return prevRevision.boq_details.items.find((item: any) => item.item_name === itemName);
  };

  // Calculate grand total from items (quantity × rate - discount)
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

    // Add preliminaries amount to the subtotal
    const preliminariesAmount = boqData.boq_details?.preliminaries?.cost_details?.amount || 0;
    const combinedSubtotal = clientCostBeforeDiscount + preliminariesAmount;

    // Calculate discount on combined subtotal (BOQ items + Preliminaries)
    let totalDiscount = 0;
    if (boqData.boq_details?.discount_percentage && boqData.boq_details.discount_percentage > 0) {
      totalDiscount = (combinedSubtotal * boqData.boq_details.discount_percentage) / 100;
    } else if (boqData.boq_details?.discount_amount && boqData.boq_details.discount_amount > 0) {
      totalDiscount = boqData.boq_details.discount_amount;
    }

    // Grand total after discount
    return combinedSubtotal - totalDiscount;
  };

  // Calculate Grand Total with discount from snapshot
  const calculateGrandTotal = (snapshot: any): number => {
    if (!snapshot?.items || snapshot.items.length === 0) return 0;

    const allItems = snapshot.items || [];

    // Calculate subtotal (sum of all item client amounts)
    const subtotal = allItems.reduce((sum: number, item: any) => {
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

    // Add preliminaries amount to the subtotal
    const preliminariesAmount = snapshot.preliminaries?.cost_details?.amount || 0;
    const combinedSubtotal = subtotal + preliminariesAmount;

    // Get overall BOQ discount (apply to combined subtotal)
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
      <Tabs value={activeTab} className="w-full" onValueChange={(value) => setActiveTab(value as 'client' | 'internal')}>
        {/* Sub-navigation Tabs */}
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="client">Client Revisions</TabsTrigger>
          <TabsTrigger value="internal">Internal Revisions</TabsTrigger>
        </TabsList>

        {/* Client Revisions Tab */}
        <TabsContent value="client" className="space-y-6">
          {/* Project Selection Dropdown */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Select Project to Review Revisions</h3>

        {/* Search/Select Dropdown */}
        <div className="relative mb-4" ref={dropdownRef}>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={selectedBoq ? getProjectTitle(selectedBoq) : "🔍 Click to select project or search..."}
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
                          <div className="font-semibold text-gray-900">{getProjectTitle(boq)}</div>
                          {/* Status Badge */}
                          {(() => {
                            const status = boq.status?.toLowerCase() || '';
                            if (status === 'pending_approval' || status === 'pending_revision' || status === 'pending' || status === 'client_pending_revision') {
                              return (
                                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                                  ⏳ Pending Review
                                </span>
                              );
                            }
                            if (status === 'revision_approved') {
                              return (
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  ✓ Approved
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="text-sm text-gray-600">
                          {getProjectName(boq)} • {getClientName(boq)}
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
                  <p className="font-medium">No projects pending review found</p>
                  <p className="text-sm mt-1">All projects are reviewed</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Recent Projects - Always visible (4-5 most recent) */}
        {!selectedBoq && boqsWithRevisions.length > 0 && (
          <div className="space-y-2">
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
                        <div className="font-semibold text-gray-900">{getProjectTitle(boq)}</div>
                        {/* Status Badge */}
                        {(() => {
                          const status = boq.status?.toLowerCase() || '';
                          if (status === 'pending_approval' || status === 'pending_revision' || status === 'pending' || status === 'client_pending_revision') {
                            return (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                                ⏳ Pending Review
                              </span>
                            );
                          }
                          if (status === 'revision_approved') {
                            return (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                ✓ Approved
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="text-sm text-gray-600">
                        {getProjectName(boq)} • {getClientName(boq)}
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
              ))}
            </div>
          </div>
        )}

        {/* Selected Project Info */}
        {selectedBoq && !searchTerm && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-blue-900">{getProjectTitle(selectedBoq)}</h4>
                <p className="text-sm text-blue-700">
                  {getProjectName(selectedBoq)} • {getClientName(selectedBoq)}
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
                        {isCancelled ? 'Cancellation Reason:' : 'Previous Rejection Reason:'}
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

                    {(() => {
                      const prelimData = currentRevisionData.boq_details.preliminaries;
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
                                  .filter((item: any) => item.checked || item.selected)
                                  .map((item: any, idx: number) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <span className="text-green-600 font-bold mt-0.5">✓</span>
                                    <div className="flex-1">
                                      <p className="text-sm text-gray-800">{item.description}</p>
                                      {item.custom_item && (
                                        <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                          Custom Item
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
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

                {/* Items */}
                {currentRevisionData.boq_details?.items?.map((item: any, index: number) => {
                  const prevRevision = getPreviousRevisionForComparison();
                  const prevItem = prevRevision ? findPreviousItem(item.item_name, prevRevision) : null;

                  return (
                    <div key={index} className="border-2 rounded-lg overflow-hidden mb-4 bg-white border-blue-300">
                      {/* Item Header - More Prominent */}
                      <div className="px-4 py-3 bg-blue-50 border-b-2 border-blue-300">
                        <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                          🔷 {item.item_name}
                        </h4>
                        {item.description && (
                          <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                        )}
                      </div>

                      {/* Item Body */}
                      <div className="p-4 space-y-4">

                      {/* Sub Items */}
                      {item.sub_items && item.sub_items.length > 0 && (
                        <div className="space-y-3">
                          <h5 className="text-sm font-bold text-blue-900 bg-blue-50 px-3 py-2 rounded border border-blue-200">
                            📋 Sub-Items ({item.sub_items.length})
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
                                <div className="text-right text-xs text-gray-600">
                                  {subItem.size && <div>Size: {subItem.size}</div>}
                                  {subItem.location && <div>Location: {subItem.location}</div>}
                                  {subItem.brand && <div>Brand: {subItem.brand}</div>}
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

                              {/* Sub Item Materials - Professional Table */}
                              {subItem.materials && subItem.materials.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1">
                                    📦 Materials
                                  </p>
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
                                      <tbody className="divide-y divide-gray-200">
                                        {subItem.materials.map((mat: any, matIdx: number) => {
                                          const prevMat = prevSubItem?.materials?.find((pm: any) => pm.material_name === mat.material_name);
                                          const quantityChanged = prevMat ? mat.quantity !== prevMat.quantity : !prevMat;
                                          const priceChanged = prevMat ? (mat.quantity * mat.unit_price) !== (prevMat.quantity * prevMat.unit_price) : !prevMat;
                                          const isNew = !prevMat;

                                          return (
                                            <tr key={matIdx} className={`hover:bg-blue-50 ${isNew ? 'bg-yellow-50' : ''}`}>
                                              <td className="py-1.5 px-2 text-gray-700">{mat.material_name}</td>
                                              <td className={`py-1.5 px-2 text-center ${quantityChanged ? 'bg-yellow-200 font-semibold' : ''}`}>
                                                {mat.quantity}
                                              </td>
                                              <td className="py-1.5 px-2 text-center text-gray-600">{mat.unit}</td>
                                              <td className="py-1.5 px-2 text-right text-gray-600">
                                                {mat.unit_price ? `AED ${Number(mat.unit_price).toFixed(2)}` : '-'}
                                              </td>
                                              <td className={`py-1.5 px-2 text-right font-semibold ${priceChanged ? 'bg-yellow-200' : ''}`}>
                                                AED {(mat.quantity * mat.unit_price).toFixed(2)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Sub Item Labour - Professional Table */}
                              {subItem.labour && subItem.labour.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1">
                                    👷 Labour
                                  </p>
                                  <div className="bg-white rounded border border-green-200 overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead className="bg-green-100 border-b border-green-200">
                                        <tr>
                                          <th className="text-left py-1.5 px-2 font-semibold text-green-900">Role</th>
                                          <th className="text-center py-1.5 px-2 font-semibold text-green-900">Hours</th>
                                          <th className="text-right py-1.5 px-2 font-semibold text-green-900">Rate/Hr</th>
                                          <th className="text-right py-1.5 px-2 font-semibold text-green-900">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {subItem.labour.map((lab: any, labIdx: number) => {
                                          const prevLab = prevSubItem?.labour?.find((pl: any) => pl.labour_role === lab.labour_role);
                                          const hoursChanged = prevLab ? lab.hours !== prevLab.hours : !prevLab;
                                          const costChanged = prevLab ? (lab.hours * lab.rate_per_hour) !== (prevLab.hours * prevLab.rate_per_hour) : !prevLab;
                                          const isNew = !prevLab;

                                          return (
                                            <tr key={labIdx} className={`hover:bg-green-50 ${isNew ? 'bg-yellow-50' : ''}`}>
                                              <td className="py-1.5 px-2 text-gray-700">{lab.labour_role}</td>
                                              <td className={`py-1.5 px-2 text-center ${hoursChanged ? 'bg-yellow-200 font-semibold' : ''}`}>
                                                {lab.hours}
                                              </td>
                                              <td className="py-1.5 px-2 text-right text-gray-600">
                                                AED {Number(lab.rate_per_hour).toFixed(2)}
                                              </td>
                                              <td className={`py-1.5 px-2 text-right font-semibold ${costChanged ? 'bg-yellow-200' : ''}`}>
                                                AED {(lab.hours * lab.rate_per_hour).toFixed(2)}
                                              </td>
                                            </tr>
                                          );
                                        })}
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
                                    const actualProfit = subItem.actual_profit || (clientAmount - internalCost);

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
                                          <span className="text-gray-800 font-medium">Actual Profit:</span>
                                          <span className={`font-bold ${actualProfit >= plannedProfit ? 'text-green-600' : 'text-orange-600'}`}>
                                            {formatCurrency(actualProfit)}
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

                    {/* Direct Materials (for items without sub_items) - Professional Table */}
                    {(!item.sub_items || item.sub_items.length === 0) && item.materials && item.materials.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-gray-800 flex items-center gap-1">
                          📦 Materials
                        </p>
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
                            <tbody className="divide-y divide-gray-200">
                              {item.materials.map((mat: any, matIdx: number) => (
                                <tr key={matIdx} className="hover:bg-blue-50">
                                  <td className="py-1.5 px-2 text-gray-700">{mat.material_name}</td>
                                  <td className="py-1.5 px-2 text-center">{mat.quantity}</td>
                                  <td className="py-1.5 px-2 text-center text-gray-600">{mat.unit}</td>
                                  <td className="py-1.5 px-2 text-right text-gray-600">
                                    {mat.unit_price ? `AED ${Number(mat.unit_price).toFixed(2)}` : '-'}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-semibold">
                                    AED {mat.total_price}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Direct Labour (for items without sub_items) - Professional Table */}
                    {(!item.sub_items || item.sub_items.length === 0) && item.labour && item.labour.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-gray-800 flex items-center gap-1">
                          👷 Labour
                        </p>
                        <div className="bg-white rounded border border-green-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-green-100 border-b border-green-200">
                              <tr>
                                <th className="text-left py-1.5 px-2 font-semibold text-green-900">Role</th>
                                <th className="text-center py-1.5 px-2 font-semibold text-green-900">Hours</th>
                                <th className="text-right py-1.5 px-2 font-semibold text-green-900">Rate/Hr</th>
                                <th className="text-right py-1.5 px-2 font-semibold text-green-900">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {item.labour.map((lab: any, labIdx: number) => (
                                <tr key={labIdx} className="hover:bg-green-50">
                                  <td className="py-1.5 px-2 text-gray-700">{lab.labour_role}</td>
                                  <td className="py-1.5 px-2 text-center">{lab.hours}</td>
                                  <td className="py-1.5 px-2 text-right text-gray-600">
                                    AED {lab.rate_per_hour ? Number(lab.rate_per_hour).toFixed(2) : '-'}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-semibold">
                                    AED {lab.total_cost}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

                          // Calculate previous values for yellow highlighting (prevItem already available from line 630)
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
                                <span className="text-gray-900 font-bold">Negotiable Margin:</span>
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
                    {/* End Item Body */}
                  </div>
                  );
                })}

                {/* TERMS & CONDITIONS SECTION */}
                {currentRevisionData.boq_details?.terms_conditions && currentRevisionData.boq_details.terms_conditions.items?.length > 0 && (
                  <div className="mt-6 mb-6">
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

                {/* Cost Breakdown Percentages */}
                {currentRevisionData.boq_details?.cost_breakdown_percentages && (
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border-2 border-purple-200">
                    <h4 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
                      📊 Cost Breakdown Percentages
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded p-2 border border-purple-200">
                        <div className="text-xs text-gray-600">Materials</div>
                        <div className="text-lg font-bold text-purple-900">
                          {currentRevisionData.boq_details.cost_breakdown_percentages.materials_percentage?.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-white rounded p-2 border border-purple-200">
                        <div className="text-xs text-gray-600">Labour</div>
                        <div className="text-lg font-bold text-purple-900">
                          {currentRevisionData.boq_details.cost_breakdown_percentages.labour_percentage?.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-white rounded p-2 border border-purple-200">
                        <div className="text-xs text-gray-600">Overhead</div>
                        <div className="text-lg font-bold text-purple-900">
                          {currentRevisionData.boq_details.cost_breakdown_percentages.overhead_percentage?.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-white rounded p-2 border border-purple-200">
                        <div className="text-xs text-gray-600">Profit</div>
                        <div className="text-lg font-bold text-purple-900">
                          {currentRevisionData.boq_details.cost_breakdown_percentages.profit_percentage?.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Profit Analysis */}
                {currentRevisionData.boq_details?.profit_analysis && (
                  <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border-2 border-green-300">
                    <h4 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                      💰 Profit Analysis
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center bg-white rounded p-2 border border-green-200">
                        <span className="text-sm text-gray-700">Client Amount (Before Discount):</span>
                        <span className="font-bold text-green-900">
                          AED {Number(currentRevisionData.boq_details.profit_analysis.client_amount || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-white rounded p-2 border border-green-200">
                        <span className="text-sm text-gray-700">Internal Cost:</span>
                        <span className="font-bold text-gray-900">
                          AED {Number(currentRevisionData.boq_details.profit_analysis.internal_cost || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-green-200 rounded p-2 border border-green-300">
                        <span className="text-sm font-semibold text-green-900">Planned Profit:</span>
                        <span className="font-bold text-green-900">
                          AED {Number(currentRevisionData.boq_details.profit_analysis.planned_profit || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-green-200 rounded p-2 border border-green-300">
                        <span className="text-sm font-semibold text-green-900">Profit Margin:</span>
                        <span className="font-bold text-green-900">
                          {Number(currentRevisionData.boq_details.profit_analysis.profit_margin_percentage || 0).toFixed(2)}%
                        </span>
                      </div>
                      {currentRevisionData.boq_details.profit_analysis.actual_profit && (
                        <div className="flex justify-between items-center bg-blue-200 rounded p-2 border border-blue-300">
                          <span className="text-sm font-semibold text-blue-900">Actual Profit (After Discount):</span>
                          <span className="font-bold text-blue-900">
                            AED {Number(currentRevisionData.boq_details.profit_analysis.actual_profit || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Grand Total with Discount Impact */}
                {(() => {
                  const allItems = currentRevisionData.boq_details?.items || [];

                  // Calculate subtotal (sum of all sub-item client amounts using quantity × rate)
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
                  const clientCostBeforeDiscount = boqItemsSubtotal + preliminariesAmount;

                  // Overall discount - Priority 1: Check for overall BOQ-level discount
                  let totalDiscount = 0;
                  let discountPercentage = 0;

                  if (currentRevisionData.boq_details?.discount_percentage && currentRevisionData.boq_details.discount_percentage > 0) {
                    // Priority 1: Overall BOQ discount percentage
                    discountPercentage = currentRevisionData.boq_details.discount_percentage;
                    totalDiscount = (clientCostBeforeDiscount * currentRevisionData.boq_details.discount_percentage) / 100;
                    console.log('💰 Overall BOQ Discount (TD Current):', {
                      percentage: currentRevisionData.boq_details.discount_percentage,
                      amount: totalDiscount,
                      subtotal: clientCostBeforeDiscount
                    });
                  } else if (currentRevisionData.boq_details?.discount_amount && currentRevisionData.boq_details.discount_amount > 0) {
                    // Priority 2: Overall BOQ discount amount
                    totalDiscount = currentRevisionData.boq_details.discount_amount;
                    discountPercentage = clientCostBeforeDiscount > 0 ? (totalDiscount / clientCostBeforeDiscount) * 100 : 0;
                  } else {
                    // Priority 3: Fall back to item-level discounts
                    totalDiscount = currentRevisionData.boq_details?.items?.reduce((sum: number, item: any) => {
                      const itemTotal = item.sub_items && item.sub_items.length > 0
                        ? item.sub_items.reduce((s: number, si: any) => s + (si.materials_cost || 0) + (si.labour_cost || 0), 0)
                        : (item.materials?.reduce((s: number, m: any) => s + (m.total_price || 0), 0) || 0) +
                          (item.labour?.reduce((s: number, l: any) => s + (l.total_cost || 0), 0) || 0);

                      const misc = (itemTotal * (item.overhead_percentage || 0)) / 100;
                      const overhead = (itemTotal * (item.profit_margin_percentage || 0)) / 100;
                      const subtotal = itemTotal + misc + overhead;
                      const discount = (subtotal * (item.discount_percentage || 0)) / 100;

                      return sum + discount;
                    }, 0) || 0;

                    if (clientCostBeforeDiscount > 0 && totalDiscount > 0) {
                      discountPercentage = (totalDiscount / clientCostBeforeDiscount) * 100;
                    }
                  }

                  // Grand total after discount
                  const grandTotal = clientCostBeforeDiscount - totalDiscount;

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
                  const totalActualProfit = clientCostBeforeDiscount - totalInternalCost;
                  const profitMarginPercentage = clientCostBeforeDiscount > 0 ? (totalActualProfit / clientCostBeforeDiscount) * 100 : 0;

                  const actualProfitAfterDiscount = grandTotal - totalInternalCost;
                  const profitMarginAfterDiscount = grandTotal > 0 ? (actualProfitAfterDiscount / grandTotal) * 100 : 0;

                  // Get previous revision for discount comparison
                  const prevRevisionForDiscount = getPreviousRevisionForComparison();
                  const prevDiscountPercentage = prevRevisionForDiscount?.boq_details?.discount_percentage || 0;
                  const discountChanged = prevRevisionForDiscount && hasChanged(discountPercentage, prevDiscountPercentage);

                  return (
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border-2 border-blue-300">
                      <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                        💵 Grand Total
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center bg-white rounded p-2 border border-blue-200">
                          <span className="text-sm text-gray-700">Client Cost (Before Discount):</span>
                          <span className="font-bold text-gray-900">
                            AED {clientCostBeforeDiscount.toFixed(2)}
                          </span>
                        </div>
                        {totalDiscount > 0 && (
                          <div className={`flex justify-between items-center bg-red-50 rounded p-2 border border-red-200 ${discountChanged ? 'bg-yellow-200' : ''}`}>
                            <span className="text-sm text-red-700">Discount ({discountPercentage.toFixed(2)}%):</span>
                            <span className="font-bold text-red-700">
                              - AED {totalDiscount.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center bg-blue-200 rounded p-3 border border-blue-300">
                          <span className="text-base font-bold text-blue-900">Grand Total (Excluding VAT):</span>
                          <span className="text-xl font-bold text-blue-900">
                            AED {grandTotal.toFixed(2)}
                          </span>
                        </div>

                        {/* Discount Impact on Profitability - EXACT COPY from Estimator */}
                        {totalDiscount > 0 && (
                          <div className="mt-4 pt-4 border-t border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
                            <h6 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                              📊 Discount Impact on Profitability
                            </h6>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600">Client Cost:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 line-through">
                                    AED {clientCostBeforeDiscount.toFixed(2)}
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
                                <span className="text-gray-700 font-medium">Actual Profit:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 line-through">
                                    AED {totalActualProfit.toFixed(2)}
                                  </span>
                                  <span className={`font-bold ${actualProfitAfterDiscount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                    → AED {actualProfitAfterDiscount.toFixed(2)}
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
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No data available</div>
            )}

            {/* Action Buttons - TD Specific (Approve/Reject) */}
            <div className="border-t border-gray-200 p-3 bg-gray-50">
              {(() => {
                const status = selectedBoq.status?.toLowerCase() || '';
                const isPendingApproval = status === 'pending_approval' || status === 'pending_revision' || status === 'pending' || status === 'client_pending_revision';
                const isRevisionApproved = status === 'revision_approved' || status === 'approved';
                const isSentToClient = status === 'sent_for_confirmation';
                const isClientConfirmed = status === 'client_confirmed';
                const isClientRejected = status === 'client_rejected';
                const isClientCancelled = status === 'client_cancelled';

                // Client cancelled
                if (isClientCancelled) {
                  return (
                    <div className="text-center text-xs text-gray-600 font-medium py-2">
                      <XCircle className="h-5 w-5 mx-auto mb-1 text-gray-500" />
                      Client Cancelled Project
                    </div>
                  );
                }

                // Client confirmed - ready for PM assignment or already assigned
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

                // Client rejected - waiting for estimator revision
                if (isClientRejected) {
                  return (
                    <div className="text-center text-xs text-orange-700 font-medium py-2">
                      <XCircle className="h-5 w-5 mx-auto mb-1 text-orange-600" />
                      Client Rejected - Awaiting Revision
                    </div>
                  );
                }

                // Sent to client - awaiting response
                if (isSentToClient) {
                  return (
                    <div className="text-center text-xs text-blue-700 font-medium py-2">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                      Sent to Client - Awaiting Response
                    </div>
                  );
                }

                // Show View button only for revision_approved (already approved by TD)
                if (isRevisionApproved) {
                  return (
                    <div className="space-y-2">
                      <button
                        onClick={() => onViewDetails(selectedBoq)}
                        className="w-full text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View Details</span>
                      </button>
                      <div className="text-center text-xs text-green-700 font-medium py-1">
                        <CheckCircle className="h-4 w-4 inline-block mr-1 text-green-600" />
                        Approved - Ready for Client
                      </div>
                    </div>
                  );
                }

                // Show Approve/Reject buttons for pending approval
                if (isPendingApproval) {
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

                      {/* Approve */}
                      <button
                        onClick={() => onApprove(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(34, 197, 94)' }}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Approve</span>
                      </button>

                      {/* Reject */}
                      <button
                        onClick={() => onReject(selectedBoq)}
                        className="text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1"
                        style={{ backgroundColor: 'rgb(239, 68, 68)' }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Reject</span>
                      </button>
                    </div>
                  );
                }

                // Default: Show view button
                return (
                  <div className="text-center text-xs text-gray-600 font-medium py-2">
                    <Eye className="h-5 w-5 mx-auto mb-1 text-gray-500" />
                    View Only
                  </div>
                );
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
              <p className="text-sm text-purple-700">Review history and changes</p>
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

                          {revision.boq_details.items.map((item: any, itemIdx: number) => (
                            <div key={itemIdx} className="bg-white rounded-lg p-4 shadow-sm border border-red-200">
                              <h5 className="font-semibold text-gray-900 mb-2 text-sm">{item.item_name}</h5>
                              {item.description && (
                                <p className="text-xs text-gray-600 mb-3">{item.description}</p>
                              )}

                              {/* Sub Items */}
                              {item.sub_items && item.sub_items.length > 0 && (
                                <div className="mb-3 space-y-2">
                                  <h5 className="text-xs font-bold text-red-900 bg-red-100 px-2 py-1.5 rounded border border-red-200">
                                    📋 Sub-Items ({item.sub_items.length})
                                  </h5>
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

                                      {/* Sub Item Materials - Detailed Table */}
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

                                      {/* Sub Item Labour - Detailed Table */}
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
                                            const actualProfit = subItem.actual_profit || (clientAmount - internalCost);

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
                                                  <span className="text-gray-800 font-medium">Actual Profit:</span>
                                                  <span className={`font-bold ${actualProfit >= plannedProfit ? 'text-green-600' : 'text-orange-600'}`}>
                                                    {formatCurrency(actualProfit)}
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

                              {/* Direct Materials (for items without sub_items) - Compact Table */}
                              {(!item.sub_items || item.sub_items.length === 0) && item.materials && item.materials.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-bold text-gray-800 mb-1">📦 Materials</p>
                                  <div className="bg-white rounded border border-red-200 overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead className="bg-red-100 border-b border-red-200">
                                        <tr>
                                          <th className="text-left py-1 px-1.5 font-semibold text-red-900">Material</th>
                                          <th className="text-center py-1 px-1.5 font-semibold text-red-900">Qty</th>
                                          <th className="text-right py-1 px-1.5 font-semibold text-red-900">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {item.materials.map((mat: any, matIdx: number) => (
                                          <tr key={matIdx} className="hover:bg-red-50">
                                            <td className="py-1 px-1.5 text-gray-700">{mat.material_name}</td>
                                            <td className="py-1 px-1.5 text-center text-gray-600">{mat.quantity} {mat.unit}</td>
                                            <td className="py-1 px-1.5 text-right font-semibold">AED {mat.total_price}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Direct Labour (for items without sub_items) - Compact Table */}
                              {(!item.sub_items || item.sub_items.length === 0) && item.labour && item.labour.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-bold text-gray-800 mb-1">👷 Labour</p>
                                  <div className="bg-white rounded border border-red-200 overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead className="bg-red-100 border-b border-red-200">
                                        <tr>
                                          <th className="text-left py-1 px-1.5 font-semibold text-red-900">Role</th>
                                          <th className="text-center py-1 px-1.5 font-semibold text-red-900">Hours</th>
                                          <th className="text-right py-1 px-1.5 font-semibold text-red-900">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {item.labour.map((lab: any, labIdx: number) => (
                                          <tr key={labIdx} className="hover:bg-red-50">
                                            <td className="py-1 px-1.5 text-gray-700">{lab.labour_role}</td>
                                            <td className="py-1 px-1.5 text-center text-gray-600">{lab.hours}h</td>
                                            <td className="py-1 px-1.5 text-right font-semibold">AED {lab.total_cost}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
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
          <InternalRevisionTimeline
            userRole="technical_director"
            onApprove={onApprove}
            onReject={onReject}
            refreshTrigger={refreshTrigger}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (2,142 lines)
export default React.memo(TDRevisionComparisonPage);
