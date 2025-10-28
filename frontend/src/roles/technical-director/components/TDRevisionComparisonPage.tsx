import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, TrendingUp, TrendingDown, CheckCircle, XCircle, Eye, Clock } from 'lucide-react';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InternalRevisionTimeline from '@/roles/estimator/components/InternalRevisionTimeline';

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
}

const TDRevisionComparisonPage: React.FC<TDRevisionComparisonPageProps> = ({
  boqList,
  onApprove,
  onReject,
  onViewDetails,
  onRefresh,
  refreshTrigger
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
    return revNum === 0 ? 'Original' : `${revNum}`;
  };

  // State for active tab
  const [activeTab, setActiveTab] = useState<'client' | 'internal'>('client');

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
        const isPendingApproval = (status === 'pending_approval' || status === 'pending_revision' || status === 'pending');
        return hasRevisions || isPendingApproval;
      }
    })
    .sort((a, b) => {
      // Sort by most recent first (created_at or updated_at descending)
      const dateA = new Date((a as any).created_at || (a as any).updated_at || 0).getTime();
      const dateB = new Date((b as any).created_at || (b as any).updated_at || 0).getTime();
      return dateB - dateA; // Most recent first
    });

  // Filter based on search
  const filteredBOQs = boqsWithRevisions.filter(boq =>
    getProjectTitle(boq).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getProjectName(boq).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getClientName(boq).toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        } else if (updatedBoq.status !== selectedBoq.status) {
          // Update if status changed but still in list
          console.log('🔄 BOQ status updated from', selectedBoq.status, 'to', updatedBoq.status);
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
      const result = await estimatorService.getBOQDetailsHistory(boq.boq_id!);

      if (result.success && result.data) {
        const current = result.data.current_version;
        let historyList = result.data.history || [];

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
      <Tabs defaultValue="client" className="w-full" onValueChange={(value) => setActiveTab(value as 'client' | 'internal')}>
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
                            if (status === 'pending_approval' || status === 'pending_revision' || status === 'pending') {
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
                        <div className="text-xs text-gray-500 mt-1">{formatCurrency(getTotalCost(boq))}</div>
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
                          if (status === 'pending_approval' || status === 'pending_revision' || status === 'pending') {
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
                      <div className="text-xs text-gray-500 mt-1">{formatCurrency(getTotalCost(boq))}</div>
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
                <div className="text-sm text-blue-700">{formatCurrency(getTotalCost(selectedBoq))}</div>
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
                            <div className="text-sm font-bold text-gray-900 flex justify-between bg-green-50 rounded px-2 py-1 mt-2">
                              <span>Final Total Price:</span>
                              <span>AED {finalTotalPrice.toFixed(2)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    </div>
                    {/* End Item Body */}
                  </div>
                  );
                })}

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
                  const totalBeforeDiscount = currentRevisionData.boq_details?.items?.reduce((sum: number, item: any) => {
                    const itemTotal = item.sub_items && item.sub_items.length > 0
                      ? item.sub_items.reduce((s: number, si: any) => s + (si.materials_cost || 0) + (si.labour_cost || 0), 0)
                      : (item.materials?.reduce((s: number, m: any) => s + (m.total_price || 0), 0) || 0) +
                        (item.labour?.reduce((s: number, l: any) => s + (l.total_cost || 0), 0) || 0);

                    const misc = (itemTotal * (item.overhead_percentage || 0)) / 100;
                    const overhead = (itemTotal * (item.profit_margin_percentage || 0)) / 100;
                    const subtotal = itemTotal + misc + overhead;
                    const discount = (subtotal * (item.discount_percentage || 0)) / 100;

                    return sum + (subtotal - discount);
                  }, 0) || 0;

                  const totalDiscount = currentRevisionData.boq_details?.items?.reduce((sum: number, item: any) => {
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

                  const clientCostBeforeDiscount = currentRevisionData.boq_details?.items?.reduce((sum: number, item: any) => {
                    const itemTotal = item.sub_items && item.sub_items.length > 0
                      ? item.sub_items.reduce((s: number, si: any) => s + (si.materials_cost || 0) + (si.labour_cost || 0), 0)
                      : (item.materials?.reduce((s: number, m: any) => s + (m.total_price || 0), 0) || 0) +
                        (item.labour?.reduce((s: number, l: any) => s + (l.total_cost || 0), 0) || 0);

                    const misc = (itemTotal * (item.overhead_percentage || 0)) / 100;
                    const overhead = (itemTotal * (item.profit_margin_percentage || 0)) / 100;

                    return sum + itemTotal + misc + overhead;
                  }, 0) || 0;

                  const discountPercentage = clientCostBeforeDiscount > 0
                    ? (totalDiscount / clientCostBeforeDiscount) * 100
                    : 0;

                  const internalCost = currentRevisionData.boq_details?.profit_analysis?.internal_cost || 0;
                  const profitBeforeDiscount = clientCostBeforeDiscount - internalCost;
                  const profitAfterDiscount = totalBeforeDiscount - internalCost;
                  const profitMarginBefore = clientCostBeforeDiscount > 0
                    ? (profitBeforeDiscount / clientCostBeforeDiscount) * 100
                    : 0;
                  const profitMarginAfter = totalBeforeDiscount > 0
                    ? (profitAfterDiscount / totalBeforeDiscount) * 100
                    : 0;

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
                          <div className="flex justify-between items-center bg-red-50 rounded p-2 border border-red-200">
                            <span className="text-sm text-red-700">Discount ({discountPercentage.toFixed(2)}%):</span>
                            <span className="font-bold text-red-700">
                              - AED {totalDiscount.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center bg-blue-200 rounded p-3 border border-blue-300">
                          <span className="text-base font-bold text-blue-900">Grand Total (Excluding VAT):</span>
                          <span className="text-xl font-bold text-blue-900">
                            AED {totalBeforeDiscount.toFixed(2)}
                          </span>
                        </div>

                        {/* Discount Impact on Profitability */}
                        {totalDiscount > 0 && internalCost > 0 && (
                          <div className="mt-3 bg-yellow-50 rounded-lg p-3 border border-yellow-300">
                            <h5 className="font-bold text-yellow-900 mb-2 text-sm">⚠️ Discount Impact on Profitability</h5>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-700">Profit Before Discount:</span>
                                <span className="font-semibold">AED {profitBeforeDiscount.toFixed(2)} ({profitMarginBefore.toFixed(2)}%)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-700">Profit After Discount:</span>
                                <span className="font-semibold">AED {profitAfterDiscount.toFixed(2)} ({profitMarginAfter.toFixed(2)}%)</span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-yellow-300">
                                <span className="text-yellow-900 font-semibold">Profit Reduction:</span>
                                <span className="font-bold text-red-700">
                                  AED {(profitBeforeDiscount - profitAfterDiscount).toFixed(2)} ({(profitMarginBefore - profitMarginAfter).toFixed(2)}%)
                                </span>
                              </div>
                              {profitMarginAfter < 15 && (
                                <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
                                  <p className="text-red-800 font-semibold text-xs">
                                    ⚠️ Warning: Profit margin has dropped below 15% after discount!
                                  </p>
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
                const isPendingApproval = status === 'pending_approval' || status === 'pending_revision' || status === 'pending';
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

                                      {/* Sub Item Materials - Compact Table */}
                                      {subItem.materials && subItem.materials.length > 0 && (
                                        <div className="mb-2">
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
                                                {subItem.materials.map((mat: any, matIdx: number) => (
                                                  <tr key={matIdx} className="hover:bg-red-50">
                                                    <td className="py-1 px-1.5 text-gray-700">{mat.material_name}</td>
                                                    <td className="py-1 px-1.5 text-center text-gray-600">{mat.quantity} {mat.unit}</td>
                                                    <td className="py-1 px-1.5 text-right font-semibold">AED {(mat.quantity * mat.unit_price).toFixed(2)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}

                                      {/* Sub Item Labour - Compact Table */}
                                      {subItem.labour && subItem.labour.length > 0 && (
                                        <div>
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
                                                {subItem.labour.map((lab: any, labIdx: number) => (
                                                  <tr key={labIdx} className="hover:bg-red-50">
                                                    <td className="py-1 px-1.5 text-gray-700">{lab.labour_role}</td>
                                                    <td className="py-1 px-1.5 text-center text-gray-600">{lab.hours}h</td>
                                                    <td className="py-1 px-1.5 text-right font-semibold">AED {(lab.hours * lab.rate_per_hour).toFixed(2)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}
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

export default TDRevisionComparisonPage;
