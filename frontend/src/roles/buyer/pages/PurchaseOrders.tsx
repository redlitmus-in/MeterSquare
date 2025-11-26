import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  ShoppingCart,
  CheckCircle,
  Clock,
  Building2,
  MapPin,
  FileText,
  Package,
  Calendar,
  Eye,
  Check,
  DollarSign,
  LayoutGrid,
  Table as TableIcon,
  Store,
  Mail,
  TruckIcon,
  XCircleIcon,
  Phone,
  X,
  MessageSquare
} from 'lucide-react';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';
import { buyerService, Purchase, PurchaseListResponse, StoreAvailabilityResponse } from '../services/buyerService';
import PurchaseDetailsModal from '../components/PurchaseDetailsModal';
import MaterialVendorSelectionModal from '../components/MaterialVendorSelectionModal';
import VendorEmailModal from '../components/VendorEmailModal';
const PurchaseOrders: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ongoing' | 'pending_approval' | 'completed'>('ongoing');
  const [ongoingSubTab, setOngoingSubTab] = useState<'pending_purchase' | 'vendor_approved'>('pending_purchase');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isVendorSelectionModalOpen, setIsVendorSelectionModalOpen] = useState(false);
  const [isVendorEmailModalOpen, setIsVendorEmailModalOpen] = useState(false);
  const [completingPurchaseId, setCompletingPurchaseId] = useState<number | null>(null);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [storeAvailability, setStoreAvailability] = useState<StoreAvailabilityResponse | null>(null);
  const [checkingStoreAvailability, setCheckingStoreAvailability] = useState(false);
  const [completingFromStore, setCompletingFromStore] = useState(false);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<number | null>(null);

  // ✅ OPTIMIZED: Fetch pending purchases - Real-time updates via Supabase (NO POLLING)
  // BEFORE: Polling every 2 seconds = 30 requests/minute per user
  // AFTER: Real-time subscriptions only = ~1-2 requests/minute per user (97% reduction)
  const { data: pendingData, isLoading: isPendingLoading, refetch: refetchPending } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-pending-purchases'],
    fetchFn: () => buyerService.getPendingPurchases(),
    realtimeTables: ['purchases', 'purchase_materials', 'change_requests'], // ✅ Real-time subscriptions
    staleTime: 30000, // ✅ 30 seconds (was 2 seconds)
    // ❌ REMOVED: refetchInterval - No more polling!
  });

  // ✅ OPTIMIZED: Fetch completed purchases - Real-time updates via Supabase (NO POLLING)
  // Completed purchases are less time-sensitive, so use longer cache time
  const { data: completedData, isLoading: isCompletedLoading, refetch: refetchCompleted } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-completed-purchases'],
    fetchFn: () => buyerService.getCompletedPurchases(),
    realtimeTables: ['purchases', 'purchase_materials'], // ✅ Real-time subscriptions
    staleTime: 60000, // ✅ 60 seconds (completed data is less time-sensitive)
    // ❌ REMOVED: refetchInterval - No more polling!
  });

  // Helper function to group sub-CRs under their parent CRs
  const groupPurchasesWithSubCRs = (purchases: Purchase[]): Purchase[] => {
    // Separate parent CRs and sub-CRs
    const parentCRs = purchases.filter(p => !p.is_sub_cr);
    const subCRs = purchases.filter(p => p.is_sub_cr);

    // Create a map of parent_cr_id to sub-CRs
    const subCRsByParent = new Map<number, Purchase[]>();
    subCRs.forEach(subCR => {
      if (subCR.parent_cr_id) {
        const existing = subCRsByParent.get(subCR.parent_cr_id) || [];
        existing.push(subCR);
        subCRsByParent.set(subCR.parent_cr_id, existing);
      }
    });

    // Attach sub-CRs to their parents and sort by suffix
    const result = parentCRs.map(parent => ({
      ...parent,
      sub_crs: (subCRsByParent.get(parent.cr_id) || []).sort((a, b) => {
        const suffixA = a.cr_number_suffix || '';
        const suffixB = b.cr_number_suffix || '';
        return suffixA.localeCompare(suffixB);
      })
    }));

    // Also include orphan sub-CRs (whose parent is not in current list)
    const orphanSubCRs = subCRs.filter(subCR =>
      !subCR.parent_cr_id || !parentCRs.some(p => p.cr_id === subCR.parent_cr_id)
    );

    return [...result, ...orphanSubCRs];
  };

  // Raw purchases (not grouped) - for Pending Approval tab where sub-CRs show as separate cards
  const rawPendingPurchases: Purchase[] = useMemo(() => {
    return (pendingData?.pending_purchases || []).map(p => ({ ...p, status: 'pending' as const }));
  }, [pendingData]);

  // Grouped purchases (sub-CRs nested under parent) - for Ongoing tab
  const pendingPurchases: Purchase[] = useMemo(() => {
    return groupPurchasesWithSubCRs(rawPendingPurchases);
  }, [rawPendingPurchases]);

  const completedPurchases: Purchase[] = useMemo(() => {
    const raw = (completedData?.completed_purchases || []).map(p => ({ ...p, status: 'completed' as const }));
    return groupPurchasesWithSubCRs(raw);
  }, [completedData]);

  // Separate ongoing purchases by vendor approval status
  const pendingPurchaseItems = useMemo(() => {
    // No vendor selected yet - only show parent CRs (not sub-CRs, they go to Pending Approval)
    return pendingPurchases.filter(p => !p.is_sub_cr && (!p.vendor_id || p.vendor_selection_pending_td_approval));
  }, [pendingPurchases]);

  const vendorApprovedItems = useMemo(() => {
    // Vendor selected and approved by TD (no longer pending approval) - include both parent and sub-CRs
    return rawPendingPurchases.filter(p => p.vendor_id && !p.vendor_selection_pending_td_approval);
  }, [rawPendingPurchases]);

  // Pending Approval tab: Show sub-CRs as SEPARATE cards (not grouped under parent)
  const pendingApprovalPurchases = useMemo(() => {
    // Filter from RAW data (not grouped) to show sub-CRs as individual cards
    return rawPendingPurchases.filter(p => p.vendor_selection_pending_td_approval);
  }, [rawPendingPurchases]);

  // Determine which purchases to show based on active tab and sub-tab
  const currentPurchases = useMemo(() => {
    if (activeTab === 'ongoing') {
      return ongoingSubTab === 'pending_purchase' ? pendingPurchaseItems : vendorApprovedItems;
    } else if (activeTab === 'pending_approval') {
      return pendingApprovalPurchases;
    } else {
      return completedPurchases;
    }
  }, [activeTab, ongoingSubTab, pendingPurchaseItems, vendorApprovedItems, pendingApprovalPurchases, completedPurchases]);

  const filteredPurchases = useMemo(() => {
    return currentPurchases
      .filter(purchase => {
        const matchesSearch =
          purchase.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          purchase.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
          purchase.item_name.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesSearch;
      })
      .sort((a, b) => {
        // Sort by created_at in descending order (newest first)
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });
  }, [currentPurchases, searchTerm]);

  const stats = useMemo(() => {
    return {
      ongoing: pendingPurchaseItems.length + vendorApprovedItems.length,
      pendingPurchase: pendingPurchaseItems.length,
      vendorApproved: vendorApprovedItems.length,
      pendingApproval: pendingApprovalPurchases.length,
      completed: completedPurchases.length
    };
  }, [pendingPurchaseItems, vendorApprovedItems, pendingApprovalPurchases, completedPurchases]);

  const handleViewDetails = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsDetailsModalOpen(true);
  };

  const handleSelectVendor = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsVendorSelectionModalOpen(true);
  };

  const handleSendEmailToVendor = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsVendorEmailModalOpen(true);
  };

  const handleSendWhatsApp = async (purchase: Purchase) => {
    if (!purchase.vendor_phone) {
      showError('Vendor phone number not available');
      return;
    }

    try {
      setSendingWhatsAppId(purchase.cr_id);
      await buyerService.sendVendorWhatsApp(purchase.cr_id, purchase.vendor_phone);
      showSuccess('Purchase order sent via WhatsApp!');
      refetchPending();
    } catch (error: any) {
      showError(error.message || 'Failed to send WhatsApp');
    } finally {
      setSendingWhatsAppId(null);
    }
  };

  const handleMarkAsComplete = async (crId: number) => {
    try {
      setCompletingPurchaseId(crId);
      await buyerService.completePurchase({ cr_id: crId });

      showSuccess('Purchase marked as complete successfully!');

      // Refetch both lists
      refetchPending();
      refetchCompleted();
    } catch (error: any) {
      showError(error.message || 'Failed to complete purchase');
    } finally {
      setCompletingPurchaseId(null);
    }
  };

  const handleGetFromStore = async (purchase: Purchase) => {
    try {
      setSelectedPurchase(purchase);
      setCheckingStoreAvailability(true);
      setIsStoreModalOpen(true);

      const availability = await buyerService.checkStoreAvailability(purchase.cr_id);
      setStoreAvailability(availability);
    } catch (error: any) {
      showError(error.message || 'Failed to check store availability');
      setIsStoreModalOpen(false);
    } finally {
      setCheckingStoreAvailability(false);
    }
  };

  const handleConfirmGetFromStore = async () => {
    if (!selectedPurchase) return;

    try {
      setCompletingFromStore(true);
      const result = await buyerService.completeFromStore(selectedPurchase.cr_id);

      showSuccess(result.message || 'Material requests sent to M2 Store!');
      setIsStoreModalOpen(false);
      setStoreAvailability(null);
      setSelectedPurchase(null);

      // Refetch pending list (purchase stays in pending until manually completed)
      refetchPending();
    } catch (error: any) {
      showError(error.message || 'Failed to request from store');
    } finally {
      setCompletingFromStore(false);
    }
  };

  const isLoading = isPendingLoading || isCompletedLoading;

  if (isLoading && currentPurchases.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <ShoppingCart className="w-6 h-6 text-[#243d8a]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#243d8a]">Purchase Orders</h1>
                <p className="text-sm text-gray-600">
                  Approved extra materials and change requests
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Total Purchases</div>
              <div className="text-2xl font-bold text-[#243d8a]">{stats.ongoing + stats.pendingApproval + stats.completed}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Search Bar with Controls */}
        <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search by project, client, or item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 border-gray-300 focus:border-[#243d8a] focus:ring-2 focus:ring-[#243d8a]/20 rounded-lg text-sm shadow-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="inline-flex items-center gap-1 bg-white border border-gray-300 rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setViewMode('card')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'card'
                    ? 'bg-[#243d8a] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'table'
                    ? 'bg-[#243d8a] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title="Table view"
              >
                <TableIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Tabs - Modern Design */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="border-b border-gray-200">
            <div className="flex items-center gap-1 px-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab('ongoing')}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-3 transition-all whitespace-nowrap ${
                  activeTab === 'ongoing'
                    ? 'border-[#243d8a] text-[#243d8a] bg-[#243d8a]/5'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Clock className="w-5 h-5" />
                <span>Ongoing</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  activeTab === 'ongoing'
                    ? 'bg-[#243d8a] text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.ongoing}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('pending_approval')}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-3 transition-all whitespace-nowrap ${
                  activeTab === 'pending_approval'
                    ? 'border-amber-500 text-amber-600 bg-amber-50'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Store className="w-5 h-5" />
                <span>Pending Approval</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  activeTab === 'pending_approval'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.pendingApproval}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-3 transition-all whitespace-nowrap ${
                  activeTab === 'completed'
                    ? 'border-green-500 text-green-600 bg-green-50'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                <span>Completed</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  activeTab === 'completed'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.completed}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Sub-tabs for Ongoing - Only show when Ongoing tab is active */}
        {activeTab === 'ongoing' && (
          <div className="bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200 shadow-sm mb-6 p-1">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setOngoingSubTab('pending_purchase')}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  ongoingSubTab === 'pending_purchase'
                    ? 'bg-[#243d8a] text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-white'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Pending Purchase</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  ongoingSubTab === 'pending_purchase'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.pendingPurchase}
                </span>
              </button>
              <button
                onClick={() => setOngoingSubTab('vendor_approved')}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  ongoingSubTab === 'vendor_approved'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-white'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>Vendor Approved</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  ongoingSubTab === 'vendor_approved'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.vendorApproved}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="space-y-4">
          {filteredPurchases.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12 text-center">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                {activeTab === 'ongoing'
                  ? `No ${ongoingSubTab === 'pending_purchase' ? 'pending purchase' : 'vendor approved'} items found`
                  : `No ${activeTab === 'pending_approval' ? 'pending approval' : 'completed'} purchases found`
                }
              </p>
            </div>
          ) : viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPurchases.map((purchase) => (
                <motion.div
                  key={purchase.cr_id}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col ${
                    purchase.status === 'completed'
                      ? 'border-green-200'
                      : purchase.vendor_selection_pending_td_approval
                        ? 'border-amber-200'
                        : 'border-red-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`px-4 py-3 border-b ${
                    purchase.status === 'completed'
                      ? 'bg-gradient-to-r from-green-50 to-green-100 border-green-200'
                      : purchase.vendor_selection_pending_td_approval
                        ? 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200'
                        : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{purchase.project_name}</h3>
                      <Badge className={`${
                        purchase.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : purchase.vendor_selection_pending_td_approval
                            ? 'bg-amber-100 text-amber-800'
                            : purchase.is_sub_cr
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                      } text-xs whitespace-nowrap`}>
                        PO: {purchase.formatted_cr_id || `CR-${purchase.cr_id}`}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      {purchase.project_code && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0 text-blue-600" />
                          <span className="truncate font-semibold text-blue-900">Project Code: {purchase.project_code}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.client}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.boq_name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vendor Info Banner - Show for sub-CRs or items with vendor pending approval */}
                  {purchase.vendor_selection_pending_td_approval && purchase.vendor_name && (
                    <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-amber-600" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-amber-600 font-medium">Selected Vendor</div>
                          <div className="text-sm font-bold text-amber-900 truncate">{purchase.vendor_name}</div>
                        </div>
                        <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                          Awaiting TD
                        </Badge>
                      </div>
                    </div>
                  )}

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="space-y-3 mb-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Item</div>
                        <div className="font-medium text-gray-900 text-sm line-clamp-1">{purchase.item_name}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Created</div>
                          <div className="text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(purchase.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Materials</div>
                          <div className="text-sm font-medium flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {purchase.materials_count} items
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      {/* Pending Approval Status */}
                      {purchase.vendor_selection_pending_td_approval && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <div>
                              <div className="text-xs font-semibold text-amber-900">Vendor Selection Pending</div>
                              <div className="text-xs text-amber-700">Waiting for TD approval</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Store Request Status - Pending Approval */}
                      {purchase.status === 'pending' && purchase.has_store_requests && !purchase.any_store_request_rejected && !purchase.vendor_id && purchase.store_requests_pending && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <div>
                              <div className="text-xs font-semibold text-amber-900">Requested from M2 Store</div>
                              <div className="text-xs text-amber-700">Waiting for approval ({purchase.store_request_count} request(s))</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Store Request Status - All Approved */}
                      {purchase.status === 'pending' && purchase.has_store_requests && purchase.all_store_requests_approved && !purchase.vendor_id && (
                        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <div>
                              <div className="text-xs font-semibold text-green-900">Store Request Approved</div>
                              <div className="text-xs text-green-700">{purchase.store_request_count} request(s) approved</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Store Request Status - Rejected (show warning) */}
                      {purchase.status === 'pending' && purchase.has_store_requests && purchase.any_store_request_rejected && !purchase.vendor_id && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <XCircleIcon className="w-4 h-4 text-red-600" />
                            <div>
                              <div className="text-xs font-semibold text-red-900">Store Request Rejected</div>
                              <div className="text-xs text-red-700">Please select a vendor or try again</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* First Row: Select Vendor OR Get from Store - Show if no vendor, no pending approval, AND (no store requests OR store request rejected) */}
                      {purchase.status === 'pending' && !purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (!purchase.has_store_requests || purchase.any_store_request_rejected) && (
                        <div className="flex gap-1.5">
                          <Button
                            onClick={() => handleSelectVendor(purchase)}
                            size="sm"
                            className="flex-1 h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1"
                          >
                            <Store className="w-3 h-3 mr-1" />
                            Select Vendor
                          </Button>
                          <Button
                            onClick={() => handleGetFromStore(purchase)}
                            size="sm"
                            className="flex-1 h-7 text-xs bg-purple-500 hover:bg-purple-600 text-white px-2 py-1"
                            title="Get materials directly from M2 Store"
                          >
                            <Package className="w-3 h-3 mr-1" />
                            Get from Store
                          </Button>
                        </div>
                      )}

                      {/* Complete button - Show ONLY when ALL store requests are approved */}
                      {purchase.status === 'pending' && purchase.has_store_requests && purchase.all_store_requests_approved && !purchase.vendor_id && (
                        <Button
                          onClick={() => handleMarkAsComplete(purchase.cr_id)}
                          disabled={completingPurchaseId === purchase.cr_id}
                          size="sm"
                          className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                        >
                          {completingPurchaseId === purchase.cr_id ? (
                            <>
                              <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Completing...
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Mark as Complete
                            </>
                          )}
                        </Button>
                      )}

                      {/* Send to Vendor */}
                      {purchase.status === 'pending' && purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (
                        purchase.vendor_email_sent ? (
                          <div className="w-full h-7 bg-green-50 border border-green-200 rounded flex items-center justify-center text-xs font-medium text-green-700 px-2 py-1">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Sent to Vendor
                          </div>
                        ) : (
                          <div className="flex gap-1.5 w-full">
                            <Button
                              onClick={() => handleSendEmailToVendor(purchase)}
                              size="sm"
                              className="flex-1 h-7 text-xs bg-[#243d8a] hover:bg-[#1e3270] text-white px-2 py-1"
                            >
                              <Mail className="w-3 h-3 mr-1" />
                              Email
                            </Button>
                            {/* <Button
                              onClick={() => handleSendWhatsApp(purchase)}
                              disabled={sendingWhatsAppId === purchase.cr_id || !purchase.vendor_phone}
                              size="sm"
                              className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1"
                              title={!purchase.vendor_phone ? 'Vendor phone not available' : 'Send via WhatsApp'}
                            >
                              {sendingWhatsAppId === purchase.cr_id ? (
                                <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <MessageSquare className="w-3 h-3 mr-1" />
                              )}
                              WhatsApp
                            </Button> */}
                          </div>
                        )
                      )}

                      {/* Second Row: View */}
                      <Button
                        onClick={() => handleViewDetails(purchase)}
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs border-gray-300 hover:bg-gray-50 px-2 py-1"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View Details
                      </Button>

                      {/* Third Row: Mark as Complete - Only show after email is sent */}
                      {purchase.status === 'pending' && !purchase.vendor_selection_pending_td_approval && purchase.vendor_id && purchase.vendor_email_sent && (
                        <Button
                          onClick={() => handleMarkAsComplete(purchase.cr_id)}
                          disabled={completingPurchaseId === purchase.cr_id}
                          size="sm"
                          className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                        >
                          {completingPurchaseId === purchase.cr_id ? (
                            <>
                              <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Completing...
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Mark as Complete
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Sub-CRs Display - Compact summary of sent vendor orders */}
                  {purchase.sub_crs && purchase.sub_crs.length > 0 && (
                    <div className="border-t border-gray-200 bg-gray-50/50 px-3 py-2">
                      <div className="text-[10px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        Sent to TD ({purchase.sub_crs.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {purchase.sub_crs.map((subCR) => (
                          <div
                            key={subCR.cr_id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${
                              subCR.vendor_selection_status === 'approved'
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : subCR.vendor_selection_status === 'pending_td_approval'
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : 'bg-gray-50 border-gray-200 text-gray-600'
                            }`}
                            title={`${subCR.vendor_name || 'No vendor'} - ${subCR.materials_count} items`}
                          >
                            <span className="font-semibold">{subCR.cr_number_suffix}</span>
                            <span className="truncate max-w-[80px]">{subCR.vendor_name || 'N/A'}</span>
                            {subCR.vendor_selection_status === 'approved' && (
                              <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                            )}
                            {subCR.vendor_selection_status === 'pending_td_approval' && (
                              <Clock className="w-3 h-3 text-amber-600 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">CR #</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Project</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden md:table-cell">Client</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">Location</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Item</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden sm:table-cell">Materials</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden xl:table-cell">Total Cost</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">Created</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredPurchases.map((purchase) => (
                      <motion.tr
                        key={purchase.cr_id}
                        initial={false}
                        animate={{ opacity: 1 }}
                        className={`hover:bg-gray-50 transition-colors ${
                          purchase.status === 'completed'
                            ? 'bg-green-50/30'
                            : purchase.vendor_selection_pending_td_approval
                              ? 'bg-amber-50/30'
                              : ''
                        }`}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Badge className={`${
                            purchase.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : purchase.vendor_selection_pending_td_approval
                                ? 'bg-amber-100 text-amber-800'
                                : purchase.is_sub_cr
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                          } text-xs`}>
                            {purchase.formatted_cr_id || `CR-${purchase.cr_id}`}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900 max-w-[200px] truncate">{purchase.project_name}</div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <div className="text-gray-600 max-w-[150px] truncate">{purchase.client}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="text-gray-600 max-w-[150px] truncate">{purchase.location}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-gray-900 max-w-[180px] truncate">{purchase.item_name}</div>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Package className="w-3.5 h-3.5" />
                            {purchase.materials_count}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell">
                          <div className="font-medium text-gray-900">{formatCurrency(purchase.total_cost)}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="text-xs text-gray-600">
                            {new Date(purchase.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              onClick={() => handleViewDetails(purchase)}
                              variant="outline"
                              size="sm"
                              className="px-2 py-1 h-auto text-xs border-gray-300"
                            >
                              <Eye className="w-3 h-3 sm:mr-1" />
                              <span className="hidden sm:inline">View</span>
                            </Button>

                            {/* Get from Store - Show if no vendor, no pending approval, AND (no store requests OR store request rejected) */}
                            {purchase.status === 'pending' && !purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (!purchase.has_store_requests || purchase.any_store_request_rejected) && (
                              <Button
                                onClick={() => handleGetFromStore(purchase)}
                                size="sm"
                                className="px-2 py-1 h-auto text-xs bg-purple-500 hover:bg-purple-600 text-white"
                                title="Get from M2 Store"
                              >
                                <Package className="w-3 h-3 sm:mr-1" />
                                <span className="hidden lg:inline">Store</span>
                              </Button>
                            )}

                            {/* Store Request Pending indicator */}
                            {purchase.status === 'pending' && purchase.has_store_requests && !purchase.any_store_request_rejected && !purchase.vendor_id && purchase.store_requests_pending && (
                              <div className="px-2 py-1 h-auto bg-amber-50 border border-amber-200 rounded text-xs font-medium text-amber-700 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span className="hidden lg:inline">Pending</span>
                              </div>
                            )}

                            {/* Store Request Approved indicator */}
                            {purchase.status === 'pending' && purchase.has_store_requests && purchase.all_store_requests_approved && !purchase.vendor_id && (
                              <div className="px-2 py-1 h-auto bg-green-50 border border-green-200 rounded text-xs font-medium text-green-700 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                <span className="hidden lg:inline">Approved</span>
                              </div>
                            )}

                            {/* Store Request Rejected indicator */}
                            {purchase.status === 'pending' && purchase.has_store_requests && purchase.any_store_request_rejected && !purchase.vendor_id && (
                              <div className="px-2 py-1 h-auto bg-red-50 border border-red-200 rounded text-xs font-medium text-red-700 flex items-center gap-1">
                                <XCircleIcon className="w-3 h-3" />
                                <span className="hidden lg:inline">Rejected</span>
                              </div>
                            )}

                            {/* Complete button - ONLY when ALL store requests are approved */}
                            {purchase.status === 'pending' && purchase.has_store_requests && purchase.all_store_requests_approved && !purchase.vendor_id && (
                              <Button
                                onClick={() => handleMarkAsComplete(purchase.cr_id)}
                                disabled={completingPurchaseId === purchase.cr_id}
                                size="sm"
                                className="px-2 py-1 h-auto text-xs bg-green-600 hover:bg-green-700 text-white"
                              >
                                {completingPurchaseId === purchase.cr_id ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-3 h-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Complete</span>
                                  </>
                                )}
                              </Button>
                            )}

                            {/* Send to Vendor */}
                            {purchase.status === 'pending' && purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (
                              purchase.vendor_email_sent ? (
                                <div className="px-2 py-1 h-auto bg-green-50 border border-green-200 rounded text-xs font-medium text-green-700 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  <span className="hidden lg:inline">Sent</span>
                                </div>
                              ) : (
                                <>
                                  <Button
                                    onClick={() => handleSendEmailToVendor(purchase)}
                                    size="sm"
                                    className="px-2 py-1 h-auto text-xs bg-[#243d8a] hover:bg-[#1e3270] text-white"
                                  >
                                    <Mail className="w-3 h-3 sm:mr-1" />
                                    <span className="hidden lg:inline">Email</span>
                                  </Button>
                                  {/* <Button
                                    onClick={() => handleSendWhatsApp(purchase)}
                                    disabled={sendingWhatsAppId === purchase.cr_id || !purchase.vendor_phone}
                                    size="sm"
                                    className="px-2 py-1 h-auto text-xs bg-green-500 hover:bg-green-600 text-white"
                                    title={!purchase.vendor_phone ? 'No phone' : 'WhatsApp'}
                                  >
                                    {sendingWhatsAppId === purchase.cr_id ? (
                                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <MessageSquare className="w-3 h-3 sm:mr-1" />
                                    )}
                                    <span className="hidden lg:inline">WA</span>
                                  </Button> */}
                                </>
                              )
                            )}

                            {/* Mark as Complete - Only show after email is sent */}
                            {purchase.status === 'pending' && !purchase.vendor_selection_pending_td_approval && purchase.vendor_id && purchase.vendor_email_sent && (
                              <Button
                                onClick={() => handleMarkAsComplete(purchase.cr_id)}
                                disabled={completingPurchaseId === purchase.cr_id}
                                size="sm"
                                className="px-2 py-1 h-auto text-xs bg-green-600 hover:bg-green-700 text-white"
                              >
                                {completingPurchaseId === purchase.cr_id ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-3 h-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Complete</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Purchase Details Modal */}
      {selectedPurchase && (
        <PurchaseDetailsModal
          purchase={selectedPurchase}
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedPurchase(null);
          }}
          onVendorSelected={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}

      {/* Material-Specific Vendor Selection Modal */}
      {selectedPurchase && (
        <MaterialVendorSelectionModal
          purchase={selectedPurchase}
          isOpen={isVendorSelectionModalOpen}
          onClose={() => {
            setIsVendorSelectionModalOpen(false);
            setSelectedPurchase(null);
          }}
          onVendorSelected={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}

      {/* Vendor Email Modal */}
      {selectedPurchase && (
        <VendorEmailModal
          purchase={selectedPurchase}
          isOpen={isVendorEmailModalOpen}
          onClose={() => {
            setIsVendorEmailModalOpen(false);
            setSelectedPurchase(null);
          }}
          onEmailSent={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}

      {/* Store Availability Modal */}
      <AnimatePresence>
        {isStoreModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              if (!completingFromStore) {
                setIsStoreModalOpen(false);
                setStoreAvailability(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-red-100 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-200 rounded-lg">
                      <Package className="w-5 h-5 text-red-700" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-red-800">Get from M2 Store</h2>
                      <p className="text-sm text-red-600">CR-{selectedPurchase?.cr_id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!completingFromStore) {
                        setIsStoreModalOpen(false);
                        setStoreAvailability(null);
                      }
                    }}
                    className="p-1 hover:bg-red-200 rounded-lg transition-colors"
                    disabled={completingFromStore}
                  >
                    <X className="w-5 h-5 text-red-700" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto max-h-[50vh]">
                {checkingStoreAvailability ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <ModernLoadingSpinners variant="pulse-wave" />
                    <p className="mt-4 text-gray-600">Checking store availability...</p>
                  </div>
                ) : storeAvailability ? (
                  <div className="space-y-4">
                    {/* Status Summary */}
                    <div className={`p-4 rounded-lg border ${
                      storeAvailability.can_complete_from_store
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {storeAvailability.can_complete_from_store ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <span className="font-semibold text-green-800">All materials available in store!</span>
                          </>
                        ) : (
                          <>
                            <XCircleIcon className="w-5 h-5 text-red-600" />
                            <span className="font-semibold text-red-800">Some materials not available</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Available Materials */}
                    {storeAvailability.available_materials.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          Available ({storeAvailability.available_materials.length})
                        </h3>
                        <div className="space-y-2">
                          {storeAvailability.available_materials.map((mat, idx) => (
                            <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="font-medium text-gray-900 text-sm">{mat.material_name}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                Required: {mat.required_quantity} | In Store: {mat.available_quantity}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unavailable Materials */}
                    {storeAvailability.unavailable_materials.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <XCircleIcon className="w-4 h-4 text-red-600" />
                          Not Available ({storeAvailability.unavailable_materials.length})
                        </h3>
                        <div className="space-y-2">
                          {storeAvailability.unavailable_materials.map((mat, idx) => (
                            <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="font-medium text-gray-900 text-sm">{mat.material_name}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                Required: {mat.required_quantity} | In Store: {mat.available_quantity}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsStoreModalOpen(false);
                      setStoreAvailability(null);
                    }}
                    disabled={completingFromStore}
                  >
                    Cancel
                  </Button>
                  {storeAvailability?.can_complete_from_store && (
                    <Button
                      onClick={handleConfirmGetFromStore}
                      disabled={completingFromStore}
                      className="bg-purple-500 hover:bg-purple-600 text-white"
                    >
                      {completingFromStore ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sending Request...
                        </>
                      ) : (
                        <>
                          <Package className="w-4 h-4 mr-2" />
                          Request from Store
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (727 lines - CRITICAL)
export default React.memo(PurchaseOrders);
