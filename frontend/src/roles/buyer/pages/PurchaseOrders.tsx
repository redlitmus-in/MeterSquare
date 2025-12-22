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
  MessageSquare,
  Pencil,
  Loader2,
  TrendingDown,
  TrendingUp,
  Send
} from 'lucide-react';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';
import { buyerService, Purchase, PurchaseListResponse, StoreAvailabilityResponse, POChild, TDRejectedPOChild } from '../services/buyerService';
import PurchaseDetailsModal from '../components/PurchaseDetailsModal';
import MaterialVendorSelectionModal from '../components/MaterialVendorSelectionModal';
import VendorEmailModal from '../components/VendorEmailModal';
import EditPricesModal from '../components/EditPricesModal';
import { removeQueries } from '@/lib/queryClient';
import { STALE_TIMES, REALTIME_TABLES } from '@/lib/constants';

// Helper function to check if an item is a POChild (has parent_cr_id) vs a Purchase (has cr_id)
const isPOChild = (item: Purchase | POChild): item is POChild => {
  return 'parent_cr_id' in item;
};

const PurchaseOrders: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ongoing' | 'pending_approval' | 'completed' | 'rejected'>('ongoing');
  const [ongoingSubTab, setOngoingSubTab] = useState<'pending_purchase' | 'store_approved' | 'vendor_approved'>('pending_purchase');
  const [pendingApprovalSubTab, setPendingApprovalSubTab] = useState<'store_requests' | 'vendor_approval'>('store_requests');
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
  // Track which materials are selected for store request (by material_name)
  const [selectedStoreMaterials, setSelectedStoreMaterials] = useState<Set<string>>(new Set());
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<number | null>(null);
  const [isEditPricesModalOpen, setIsEditPricesModalOpen] = useState(false);
  const [selectedPurchaseForPriceEdit, setSelectedPurchaseForPriceEdit] = useState<Purchase | null>(null);

  // ✅ PERFORMANCE: Add pagination state
  const [pendingPage, setPendingPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);
  const perPage = 50; // Items per page

  // ✅ OPTIMIZED: Fetch pending purchases - Real-time updates via Supabase (NO POLLING)
  // BEFORE: Polling every 2 seconds = 30 requests/minute per user
  // AFTER: Real-time subscriptions only = ~1-2 requests/minute per user (97% reduction)
  // ✅ PERFORMANCE: Now with pagination support
  const { data: pendingData, isLoading: isPendingLoading, refetch: refetchPending } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-pending-purchases', pendingPage],
    fetchFn: () => buyerService.getPendingPurchases(pendingPage, perPage),
    realtimeTables: [...REALTIME_TABLES.PURCHASES_FULL], // ✅ Real-time subscriptions from constants
    staleTime: STALE_TIMES.STANDARD, // ✅ 30 seconds from constants
    // ❌ REMOVED: refetchInterval - No more polling!
  });

  // ✅ OPTIMIZED: Fetch completed purchases - Real-time updates via Supabase (NO POLLING)
  // Completed purchases are less time-sensitive, so use longer cache time
  // ✅ PERFORMANCE: Now with pagination support
  const { data: completedData, isLoading: isCompletedLoading, refetch: refetchCompleted } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-completed-purchases', completedPage],
    fetchFn: () => buyerService.getCompletedPurchases(completedPage, perPage),
    realtimeTables: [...REALTIME_TABLES.PURCHASES], // ✅ Real-time subscriptions from constants
    staleTime: STALE_TIMES.DASHBOARD, // ✅ 60 seconds from constants (completed data is less time-sensitive)
    // ❌ REMOVED: refetchInterval - No more polling!
  });

  // ✅ OPTIMIZED: Fetch rejected purchases - Real-time updates via Supabase
  // ✅ PERFORMANCE: Now with pagination support
  const { data: rejectedData, isLoading: isRejectedLoading, refetch: refetchRejected } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-rejected-purchases', rejectedPage],
    fetchFn: () => buyerService.getRejectedPurchases(rejectedPage, perPage),
    realtimeTables: [...REALTIME_TABLES.PURCHASES_FULL], // ✅ Real-time subscriptions from constants
    staleTime: STALE_TIMES.DASHBOARD, // ✅ 60 seconds from constants
  });

  // ✅ Fetch approved PO children (for Vendor Approved tab)
  const { data: approvedPOChildrenData, isLoading: isApprovedPOChildrenLoading, refetch: refetchApprovedPOChildren } = useAutoSync<{
    success: boolean;
    approved_count: number;
    po_children: POChild[];
  }>({
    queryKey: ['buyer-approved-po-children'],
    fetchFn: () => buyerService.getApprovedPOChildren(),
    realtimeTables: ['po_child', ...REALTIME_TABLES.CHANGE_REQUESTS], // Real-time subscriptions
    staleTime: STALE_TIMES.STANDARD, // 30 seconds from constants
  });

  // Fetch POChildren pending TD approval (for Pending Approval tab)
  const { data: pendingPOChildrenData, isLoading: isPendingPOChildrenLoading, refetch: refetchPendingPOChildren } = useAutoSync<{
    success: boolean;
    pending_count: number;
    po_children: POChild[];
  }>({
    queryKey: ['buyer-pending-po-children'],
    fetchFn: () => buyerService.getBuyerPendingPOChildren(),
    realtimeTables: ['po_child', ...REALTIME_TABLES.CHANGE_REQUESTS],
    staleTime: STALE_TIMES.STANDARD, // 30 seconds from constants
  });

  // Helper function for processing purchases (po_children are embedded in parent CR response)
  const processPurchases = (purchases: Purchase[]): Purchase[] => {
    return purchases;
  };

  // Raw purchases (not grouped) - for Pending Approval tab where sub-POs show as separate cards
  const rawPendingPurchases: Purchase[] = useMemo(() => {
    return (pendingData?.pending_purchases || []).map(p => ({ ...p, status: 'pending' as const }));
  }, [pendingData]);

  // Grouped purchases (sub-POs nested under parent) - for Ongoing tab
  const pendingPurchases: Purchase[] = useMemo(() => {
    return processPurchases(rawPendingPurchases);
  }, [rawPendingPurchases]);

  const completedPurchases: Purchase[] = useMemo(() => {
    const raw = (completedData?.completed_purchases || []).map(p => ({ ...p, status: 'completed' as const }));
    return processPurchases(raw);
  }, [completedData]);

  // Completed POChildren (vendor-split purchases)
  const completedPOChildren: POChild[] = useMemo(() => {
    const children = completedData?.completed_po_children || [];
    // Sort by updated_at (latest first), fallback to created_at
    return children.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA; // Descending (newest first)
    });
  }, [completedData]);

  const rejectedPurchases: Purchase[] = useMemo(() => {
    const raw = (rejectedData?.rejected_purchases || []).map(p => ({ ...p, status: 'rejected' as const }));
    return processPurchases(raw);
  }, [rejectedData]);

  // TD rejected PO children (can re-select vendor)
  const tdRejectedPOChildren: TDRejectedPOChild[] = useMemo(() => {
    const children = rejectedData?.td_rejected_po_children || [];
    // Sort by updated_at (latest first), fallback to created_at
    return children.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA; // Descending (newest first)
    });
  }, [rejectedData]);

  // Separate ongoing purchases by vendor approval status
  const pendingPurchaseItems = useMemo(() => {
    // No vendor selected yet AND not pending TD approval AND not rejected AND not sent to store (pending or approved)
    // POs with vendor_selection_pending_td_approval should be in Pending Approval tab, not here
    // POs with store_requests_pending should be in Pending Approval tab
    // POs with all_store_requests_approved should be in Ongoing > Store Approved tab
    // Rejected items should only show in Rejected tab
    return pendingPurchases.filter(p =>
      !p.vendor_id &&
      !p.vendor_selection_pending_td_approval &&
      !p.rejection_type &&
      !p.store_requests_pending &&  // Items sent to store pending should be in Pending Approval
      !p.all_store_requests_approved  // Items with approved store requests go to Store Approved
    );
  }, [pendingPurchases]);

  // Store approved items - PM approved, waiting for dispatch/fulfillment
  const storeApprovedItems = useMemo(() => {
    return pendingPurchases.filter(p =>
      p.all_store_requests_approved &&
      !p.vendor_id &&
      !p.rejection_type
    );
  }, [pendingPurchases]);

  const vendorApprovedItems = useMemo(() => {
    // Vendor selected and approved by TD (no longer pending approval) - include both parent and sub-POs
    // Exclude rejected items
    return rawPendingPurchases.filter(p => p.vendor_id && !p.vendor_selection_pending_td_approval && !p.rejection_type);
  }, [rawPendingPurchases]);

  // Approved PO children (new system - fetched from po_child table)
  const approvedPOChildren: POChild[] = useMemo(() => {
    const children = approvedPOChildrenData?.po_children || [];
    // Sort by updated_at (latest first), fallback to created_at
    return children.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA; // Descending (newest first)
    });
  }, [approvedPOChildrenData]);

  // Pending POChildren (sent to TD, waiting for approval)
  const pendingPOChildren: POChild[] = useMemo(() => {
    const children = pendingPOChildrenData?.po_children || [];
    // Sort by updated_at (latest first), fallback to created_at
    return children.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA; // Descending (newest first)
    });
  }, [pendingPOChildrenData]);

  // Pending Approval tab: Show sub-POs as SEPARATE cards (not grouped under parent)
  // Also includes items sent to store pending PM approval
  const pendingApprovalPurchases = useMemo(() => {
    // Filter from RAW data (not grouped) to show sub-POs as individual cards
    // Include: vendor_selection_pending_td_approval OR store_requests_pending
    // Exclude rejected items
    return rawPendingPurchases.filter(p =>
      (p.vendor_selection_pending_td_approval || p.store_requests_pending) && !p.rejection_type
    );
  }, [rawPendingPurchases]);

  // Separate store requests from vendor pending approval for sub-tabs
  const storeRequestsPending = useMemo(() => {
    return rawPendingPurchases.filter(p => p.store_requests_pending && !p.rejection_type);
  }, [rawPendingPurchases]);

  const vendorPendingApproval = useMemo(() => {
    return rawPendingPurchases.filter(p => p.vendor_selection_pending_td_approval && !p.rejection_type);
  }, [rawPendingPurchases]);

  // Determine which purchases to show based on active tab and sub-tab
  const currentPurchases = useMemo(() => {
    if (activeTab === 'ongoing') {
      if (ongoingSubTab === 'pending_purchase') return pendingPurchaseItems;
      if (ongoingSubTab === 'store_approved') return storeApprovedItems;
      return vendorApprovedItems;
    } else if (activeTab === 'pending_approval') {
      // Sub-tabs for pending approval
      return pendingApprovalSubTab === 'store_requests' ? storeRequestsPending : vendorPendingApproval;
    } else if (activeTab === 'rejected') {
      return rejectedPurchases;
    } else {
      return completedPurchases;
    }
  }, [activeTab, ongoingSubTab, pendingApprovalSubTab, pendingPurchaseItems, storeApprovedItems, vendorApprovedItems, storeRequestsPending, vendorPendingApproval, completedPurchases, rejectedPurchases]);

  const filteredPurchases = useMemo(() => {
    return currentPurchases
      .filter(purchase => {
        const searchLower = searchTerm.toLowerCase().trim();
        // ✅ Search by ID (CR-123, PO-123, 123), project code (MSQ26), project name, client, or item
        const crIdString = `cr-${purchase.cr_id}`;
        const poIdString = `po-${purchase.cr_id}`;
        const matchesSearch = !searchTerm ||
          purchase.project_name.toLowerCase().includes(searchLower) ||
          purchase.client.toLowerCase().includes(searchLower) ||
          purchase.item_name.toLowerCase().includes(searchLower) ||
          purchase.project_code?.toLowerCase().includes(searchLower) ||
          crIdString.includes(searchLower) ||
          poIdString.includes(searchLower) ||
          purchase.cr_id?.toString().includes(searchTerm.trim());

        return matchesSearch;
      })
      .sort((a, b) => {
        // Sort by created_at in descending order (newest first)
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });
  }, [currentPurchases, searchTerm]);

  // Merged and sorted array for vendor_approved tab - combines parent purchases and PO children in mixed order by date
  const mergedVendorApprovedItems = useMemo(() => {
    if (activeTab !== 'ongoing' || ongoingSubTab !== 'vendor_approved') {
      return [];
    }

    // Filter approved PO children by search term (includes ID and project code search)
    const searchLower = searchTerm.toLowerCase().trim();
    const filteredPOChildren = approvedPOChildren.filter(poChild => {
      const poIdString = `po-${poChild.id}`;
      const formattedId = (poChild.formatted_id || '').toLowerCase();
      return !searchTerm ||
        (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
        (poChild.vendor_name || '').toLowerCase().includes(searchLower) ||
        poChild.project_code?.toLowerCase().includes(searchLower) ||
        poIdString.includes(searchLower) ||
        formattedId.includes(searchLower) ||
        poChild.id?.toString().includes(searchTerm.trim());
    });

    // Combine filtered purchases and filtered PO children
    const combined: Array<Purchase | POChild> = [
      ...filteredPurchases,
      ...filteredPOChildren
    ];

    // Debug logging to check what we're sorting
    console.log('🔍 Mixed Ordering Debug:', {
      totalItems: combined.length,
      parentPurchases: filteredPurchases.length,
      poChildren: filteredPOChildren.length,
      sample: combined.slice(0, 5).map(item => ({
        id: isPOChild(item) ? `POChild-${item.id}` : `Purchase-${item.cr_id}`,
        created_at: item.created_at,
        type: isPOChild(item) ? 'POChild' : 'Purchase'
      }))
    });

    // Sort by created_at in descending order (newest first) - this creates the mixed order
    const sorted = combined.sort((a, b) => {
      // Handle undefined created_at by treating as 0 (oldest)
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

    // Debug logging after sort
    console.log('✅ After sorting (first 10):', sorted.slice(0, 10).map(item => ({
      id: isPOChild(item) ? `POChild-${item.id}` : `Purchase-${item.cr_id}`,
      created_at: item.created_at,
      type: isPOChild(item) ? 'POChild' : 'Purchase',
      date: item.created_at ? new Date(item.created_at).toLocaleString() : 'No date'
    })));

    return sorted;
  }, [activeTab, ongoingSubTab, filteredPurchases, approvedPOChildren, searchTerm]);

  const stats = useMemo(() => {
    return {
      ongoing: pendingPurchaseItems.length + storeApprovedItems.length + vendorApprovedItems.length + approvedPOChildren.length,
      pendingPurchase: pendingPurchaseItems.length,
      storeApproved: storeApprovedItems.length,
      vendorApproved: vendorApprovedItems.length + approvedPOChildren.length,
      pendingApproval: pendingApprovalPurchases.length + pendingPOChildren.length,
      storeRequestsPending: storeRequestsPending.length,
      vendorPendingApproval: vendorPendingApproval.length + pendingPOChildren.length,
      completed: completedPurchases.length + completedPOChildren.length,
      rejected: rejectedPurchases.length + tdRejectedPOChildren.length
    };
  }, [pendingPurchaseItems, storeApprovedItems, vendorApprovedItems, approvedPOChildren, pendingApprovalPurchases, pendingPOChildren, completedPurchases, completedPOChildren, rejectedPurchases, tdRejectedPOChildren, storeRequestsPending, vendorPendingApproval]);

  const handleViewDetails = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsDetailsModalOpen(true);
  };

  const handleEdit = (purchase: Purchase) => {
    // Open vendor selection modal which allows editing materials and vendor
    setSelectedPurchase(purchase);
    setIsVendorSelectionModalOpen(true);
  };

  const handleResend = async (crId: number) => {
    try {
      const response = await buyerService.resendChangeRequest(crId);
      if (response.success) {
        showSuccess('PO resent successfully!');
        // Remove cache completely and refetch fresh data
        removeQueries(['purchases']);
        removeQueries(['pending-purchases']);
        removeQueries(['buyer-pending-purchases']);
        removeQueries(['buyer-rejected-purchases']);
        removeQueries(['change-requests']);
        removeQueries(['dashboard']);
        // Small delay to ensure backend has processed the change
        await new Promise(resolve => setTimeout(resolve, 500));
        await refetchPending();
        await refetchRejected();
        // Switch to pending tab to see the resent item
        setActiveTab('ongoing');
        setOngoingSubTab('pending_purchase');
      } else {
        showError(response.message || 'Failed to resend');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to resend PO');
    }
  };

  const handleSelectVendor = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsVendorSelectionModalOpen(true);
  };

  const handleSendEmailToVendor = (purchase: Purchase) => {
    // Validation: Check if this is material-level vendor selection
    if (purchase.use_per_material_vendors && purchase.material_vendor_selections) {
      // Check if all materials have vendors selected
      const materialsWithoutVendors: string[] = [];

      purchase.materials.forEach(material => {
        const materialKey = material.material_name;
        const vendorSelection = purchase.material_vendor_selections?.[materialKey];

        if (!vendorSelection || !vendorSelection.vendor_id) {
          materialsWithoutVendors.push(material.material_name);
        }
      });

      if (materialsWithoutVendors.length > 0) {
        showError(
          `Cannot generate LPO. The following materials don't have vendors assigned: ${materialsWithoutVendors.join(', ')}. Please select vendors for all materials first.`
        );
        return;
      }
    }

    // Validation: If no vendor selected at all for non-split purchases
    if (!purchase.use_per_material_vendors && !purchase.vendor_id && (!purchase.po_children || purchase.po_children.length === 0)) {
      showError('Please select a vendor before generating LPO');
      return;
    }

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
      // Pass po_child_id if this is a POChild record to get correct materials
      await buyerService.sendVendorWhatsApp(purchase.cr_id, purchase.vendor_phone, true, purchase.po_child_id);
      showSuccess('Purchase order sent via WhatsApp!');
      // Remove cache completely and refetch fresh data
      removeQueries(['purchases']);
      removeQueries(['pending-purchases']);
      removeQueries(['buyer-pending-purchases']);
      removeQueries(['buyer-approved-po-children']);
      removeQueries(['dashboard']);
      // Small delay to ensure backend has processed the change
      await new Promise(resolve => setTimeout(resolve, 500));
      await refetchPending();
      await refetchApprovedPOChildren();
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

      // Remove cache completely and refetch fresh data
      removeQueries(['purchases']);
      removeQueries(['pending-purchases']);
      removeQueries(['buyer-pending-purchases']);
      removeQueries(['buyer-completed-purchases']);
      removeQueries(['buyer-approved-po-children']);
      removeQueries(['change-requests']);
      removeQueries(['dashboard']);
      // Small delay to ensure backend has processed the change
      await new Promise(resolve => setTimeout(resolve, 500));
      await refetchPending();
      await refetchCompleted();
      await refetchApprovedPOChildren();
      // Switch to completed tab to show the item
      setActiveTab('completed');
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
      setSelectedStoreMaterials(new Set()); // Reset selection

      const availability = await buyerService.checkStoreAvailability(purchase.cr_id);
      setStoreAvailability(availability);

      // Auto-select all available materials by default
      if (availability.available_materials.length > 0) {
        const availableNames = new Set(availability.available_materials.map(m => m.material_name));
        setSelectedStoreMaterials(availableNames);
      }
    } catch (error: any) {
      showError(error.message || 'Failed to check store availability');
      setIsStoreModalOpen(false);
    } finally {
      setCheckingStoreAvailability(false);
    }
  };

  // Toggle material selection for store request
  const toggleStoreMaterialSelection = (materialName: string) => {
    setSelectedStoreMaterials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialName)) {
        newSet.delete(materialName);
      } else {
        newSet.add(materialName);
      }
      return newSet;
    });
  };

  const handleConfirmGetFromStore = async () => {
    if (!selectedPurchase) return;
    if (selectedStoreMaterials.size === 0) {
      showWarning('Please select at least one material to request from store');
      return;
    }

    try {
      setCompletingFromStore(true);
      // Convert Set to Array and pass selected materials
      const selectedMaterialsList = Array.from(selectedStoreMaterials);
      const result = await buyerService.completeFromStore(selectedPurchase.cr_id, '', selectedMaterialsList);

      showSuccess(result.message || `${selectedMaterialsList.length} material(s) requested from M2 Store!`);
      setIsStoreModalOpen(false);
      setStoreAvailability(null);
      setSelectedPurchase(null);
      setSelectedStoreMaterials(new Set());

      // Remove cache completely and refetch fresh data
      removeQueries(['purchases']);
      removeQueries(['pending-purchases']);
      removeQueries(['buyer-pending-purchases']);
      removeQueries(['buyer-completed-purchases']);
      removeQueries(['inventory']);
      removeQueries(['requests']);
      removeQueries(['dashboard']);
      // Small delay to ensure backend has processed the change
      await new Promise(resolve => setTimeout(resolve, 500));
      await refetchPending();
      await refetchCompleted();
      // Switch to pending approval tab if partial selection, completed if all selected
      if (storeAvailability && selectedMaterialsList.length < storeAvailability.available_materials.length) {
        // Partial selection - stay on ongoing tab
        showInfo('Remaining materials can be ordered from vendor or requested from store later');
      } else {
        setActiveTab('completed');
      }
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
                  Approved extra materials and purchase orders
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
                onClick={() => setActiveTab('rejected')}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-3 transition-all whitespace-nowrap ${
                  activeTab === 'rejected'
                    ? 'border-red-500 text-red-600 bg-red-50'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <XCircleIcon className="w-5 h-5" />
                <span>Rejected</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  activeTab === 'rejected'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.rejected}
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
                onClick={() => setOngoingSubTab('store_approved')}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  ongoingSubTab === 'store_approved'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-white'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Store Approved</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  ongoingSubTab === 'store_approved'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.storeApproved}
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

        {/* Sub-tabs for Pending Approval - Only show when Pending Approval tab is active */}
        {activeTab === 'pending_approval' && (
          <div className="bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200 shadow-sm mb-6 p-1">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setPendingApprovalSubTab('store_requests')}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  pendingApprovalSubTab === 'store_requests'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-white'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Sent to Store</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  pendingApprovalSubTab === 'store_requests'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.storeRequestsPending}
                </span>
              </button>
              <button
                onClick={() => setPendingApprovalSubTab('vendor_approval')}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  pendingApprovalSubTab === 'vendor_approval'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-white'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Vendor Pending TD</span>
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  pendingApprovalSubTab === 'vendor_approval'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {stats.vendorPendingApproval}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="space-y-4">
          {/* Check for empty state - use merged arrays for special tabs */}
          {(activeTab === 'ongoing' && ongoingSubTab === 'vendor_approved' ? mergedVendorApprovedItems.length === 0 : filteredPurchases.length === 0) && !(activeTab === 'completed' && completedPOChildren.length > 0) && !(activeTab === 'pending_approval' && pendingApprovalSubTab === 'vendor_approval' && pendingPOChildren.length > 0) && !(activeTab === 'rejected' && tdRejectedPOChildren.length > 0) ? (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12 text-center">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                {activeTab === 'ongoing'
                  ? `No ${ongoingSubTab === 'pending_purchase' ? 'pending purchase' : ongoingSubTab === 'store_approved' ? 'store approved' : 'vendor approved'} items found`
                  : activeTab === 'pending_approval'
                    ? `No ${pendingApprovalSubTab === 'store_requests' ? 'store requests pending' : 'vendor pending TD approval'} items found`
                    : activeTab === 'rejected'
                      ? 'No rejected purchases found'
                      : 'No completed purchases found'
                }
              </p>
            </div>
          ) : viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Determine which items to show based on active tab */}
              {(
                activeTab === 'ongoing' && ongoingSubTab === 'vendor_approved'
                  ? mergedVendorApprovedItems
                  : activeTab === 'pending_approval' && pendingApprovalSubTab === 'vendor_approval'
                    ? pendingPOChildren
                    : filteredPurchases
              ).map((item) => {
                // Check if this is a POChild or Purchase
                if (isPOChild(item)) {
                  // Render POChild card
                  const poChild = item;

                  // Determine colors based on status
                  const isPending = poChild.vendor_selection_status === 'pending_td_approval';
                  const isApproved = poChild.vendor_selection_status === 'approved';
                  const isRejected = poChild.vendor_selection_status === 'rejected';

                  const borderColor = isPending ? 'border-amber-300' : isApproved ? 'border-green-300' : 'border-red-300';
                  const headerBg = isPending ? 'from-amber-50 to-amber-100' : isApproved ? 'from-green-50 to-green-100' : 'from-red-50 to-red-100';
                  const headerBorder = isPending ? 'border-amber-200' : isApproved ? 'border-green-200' : 'border-red-200';

                  return (
                    <motion.div
                      key={`po-child-${poChild.id}`}
                      initial={false}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col ${borderColor}`}
                    >
                      {/* Card Header - Same layout as legacy cards */}
                      <div className={`px-4 py-3 border-b bg-gradient-to-r ${headerBg} ${headerBorder}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-base font-bold text-gray-900 line-clamp-1">{poChild.project_name || 'Unknown Project'}</h3>
                          <Badge className="bg-green-100 text-green-800 text-xs whitespace-nowrap">
                            {poChild.formatted_id}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          {poChild.project_code && (
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3 h-3 flex-shrink-0 text-blue-600" />
                              <span className="truncate font-semibold text-blue-900">Project Code: {poChild.project_code}</span>
                            </div>
                          )}
                          {poChild.client && (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{poChild.client}</span>
                            </div>
                          )}
                          {poChild.location && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{poChild.location}</span>
                            </div>
                          )}
                          {poChild.boq_name && (
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{poChild.boq_name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Vendor Info Banner */}
                      <div className={`px-4 py-2 border-b ${
                        isPending ? 'bg-amber-50 border-amber-200' : isApproved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Store className={`w-4 h-4 ${isPending ? 'text-amber-600' : isApproved ? 'text-green-600' : 'text-red-600'}`} />
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-medium ${isPending ? 'text-amber-600' : isApproved ? 'text-green-600' : 'text-red-600'}`}>
                              Selected Vendor
                            </div>
                            <div className={`text-sm font-bold truncate ${isPending ? 'text-amber-900' : isApproved ? 'text-green-900' : 'text-red-900'}`}>
                              {poChild.vendor_name || 'No Vendor'}
                            </div>
                          </div>
                          <Badge className={`text-[10px] ${
                            isPending ? 'bg-amber-100 text-amber-800' : isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {isPending ? 'Awaiting TD' : isApproved ? 'TD Approved' : 'Rejected'}
                          </Badge>
                        </div>
                      </div>

                      {/* Card Body - Same layout as legacy cards */}
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="space-y-3 mb-4">
                          {poChild.item_name && (
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Item</div>
                              <div className="font-medium text-gray-900 text-sm line-clamp-1">{poChild.item_name}</div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Created</div>
                              <div className="text-xs flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Materials</div>
                              <div className="text-sm font-medium flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                {poChild.materials_count || poChild.materials?.length || 0} items
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            <span className="text-xs text-gray-500">Total Cost</span>
                            <span className="text-sm font-bold text-green-700">{formatCurrency(poChild.materials_total_cost || 0)}</span>
                          </div>
                        </div>

                        {/* Status Banner */}
                        {isPending && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-amber-600" />
                              <div>
                                <div className="text-xs font-semibold text-amber-900">Vendor Selection Pending</div>
                                <div className="text-[10px] text-amber-600">Waiting for TD approval</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {isApproved && (
                          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <div>
                                <div className="text-xs font-semibold text-green-900">TD Approved</div>
                                <div className="text-[10px] text-green-600">Ready for purchase completion</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {isRejected && (
                          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                            <div className="flex items-center gap-2">
                              <XCircleIcon className="w-4 h-4 text-red-600" />
                              <div>
                                <div className="text-xs font-semibold text-red-900">Rejected by TD</div>
                                <div className="text-[10px] text-red-600">{poChild.rejection_reason || 'Please select a different vendor'}</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-1.5 mt-auto">
                          {/* Show buttons ONLY when TD approved */}
                          {isApproved && (
                            <>
                              {/* If email OR WhatsApp sent: Show "Sent to Vendor" badge + Complete Purchase button */}
                              {(poChild.vendor_email_sent || poChild.vendor_whatsapp_sent) ? (
                                <>
                                  {/* Sent to Vendor badge */}
                                  <div className="w-full h-7 bg-green-50 border border-green-200 rounded flex items-center justify-center text-xs font-medium text-green-700 px-2 py-1">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Sent to Vendor
                                  </div>

                                  {/* Complete & Send to Store button */}
                                  <Button
                                    onClick={async () => {
                                      try {
                                        setCompletingPurchaseId(poChild.id);
                                        await buyerService.completePOChildPurchase(poChild.id);
                                        showSuccess('Purchase marked as complete!');
                                        refetchApprovedPOChildren();
                                      } catch (error: any) {
                                        showError(error.message || 'Failed to complete purchase');
                                      } finally {
                                        setCompletingPurchaseId(null);
                                      }
                                    }}
                                    disabled={completingPurchaseId === poChild.id}
                                    variant="default"
                                    size="sm"
                                    className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                                    title="Materials will go to M2 Store first, then Production Manager will dispatch to site"
                                  >
                                    {completingPurchaseId === poChild.id ? (
                                      <>
                                        <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Sending to Store...
                                      </>
                                    ) : (
                                      <>
                                        <Package className="w-3 h-3 mr-1" />
                                        Complete & Send to Store
                                      </>
                                    )}
                                  </Button>
                                </>
                              ) : (
                                /* If email NOT sent: Show Email + WhatsApp buttons */
                                <div className="flex gap-1.5 w-full">
                                  <Button
                                    onClick={() => {
                                      const purchaseLike: Purchase = {
                                        ...poChild,
                                        cr_id: poChild.parent_cr_id,
                                        vendor_id: poChild.vendor_id || 0,
                                        vendor_name: poChild.vendor_name || '',
                                        vendor_email: poChild.vendor_email || '',
                                        vendor_phone: poChild.vendor_phone || '',
                                        materials: poChild.materials || [],
                                        project_name: poChild.project_name || '',
                                        boq_name: poChild.boq_name || '',
                                        client: poChild.client || '',
                                        location: poChild.location || '',
                                        created_at: poChild.created_at || '',
                                        status: 'pending' as const,
                                        vendor_email_sent: poChild.vendor_email_sent || false,
                                        vendor_whatsapp_sent: poChild.vendor_whatsapp_sent || false,
                                        vendor_whatsapp_sent_at: poChild.vendor_whatsapp_sent_at || null,
                                        has_store_requests: false,
                                        store_requests_pending: false,
                                        all_store_requests_approved: false,
                                        any_store_request_rejected: false,
                                        vendor_selection_pending_td_approval: false,
                                        item_name: poChild.item_name || '',
                                        po_child_id: poChild.id,
                                      };
                                      setSelectedPurchase(purchaseLike);
                                      setIsVendorEmailModalOpen(true);
                                    }}
                                    className="flex-1 bg-[#243d8a] hover:bg-[#1e3270] text-white text-xs"
                                    size="sm"
                                  >
                                    <Mail className="w-3.5 h-3.5 mr-1" />
                                    Email
                                  </Button>
                                  {poChild.vendor_phone ? (
                                    poChild.vendor_whatsapp_sent ? (
                                      <div
                                        className="flex-1 flex items-center justify-center bg-green-50 border border-green-300 rounded text-green-600 text-xs px-2 py-1.5"
                                        title={`WhatsApp sent${poChild.vendor_whatsapp_sent_at ? ` on ${new Date(poChild.vendor_whatsapp_sent_at).toLocaleDateString()}` : ''}`}
                                      >
                                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                        Sent
                                      </div>
                                    ) : (
                                      <Button
                                        onClick={async () => {
                                          try {
                                            setSendingWhatsAppId(poChild.id);
                                            await buyerService.sendVendorWhatsApp(poChild.parent_cr_id, poChild.vendor_phone!, true, poChild.id);
                                            showSuccess('Purchase order sent via WhatsApp!');
                                            refetchApprovedPOChildren();
                                          } catch (error: any) {
                                            showError(error.message || 'Failed to send WhatsApp');
                                          } finally {
                                            setSendingWhatsAppId(null);
                                          }
                                        }}
                                        disabled={sendingWhatsAppId === poChild.id}
                                        className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs"
                                        size="sm"
                                        title="Send via WhatsApp"
                                      >
                                        {sendingWhatsAppId === poChild.id ? (
                                          <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <MessageSquare className="w-3.5 h-3.5 mr-1" />
                                        )}
                                        WhatsApp
                                      </Button>
                                    )
                                  ) : (
                                    <div
                                      className="flex-1 flex items-center justify-center bg-gray-100 border border-gray-300 rounded text-gray-400 text-xs px-2 py-1.5 cursor-not-allowed"
                                      title="No phone number available"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5 mr-1" />
                                      WhatsApp
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          {/* View Details - Always show */}
                          <Button
                            onClick={() => {
                              const purchaseLike: Purchase = {
                                ...poChild,
                                cr_id: poChild.parent_cr_id,
                                vendor_id: poChild.vendor_id || 0,
                                vendor_name: poChild.vendor_name || '',
                                vendor_email: poChild.vendor_email || '',
                                vendor_phone: poChild.vendor_phone || '',
                                materials: poChild.materials || [],
                                project_name: poChild.project_name || '',
                                boq_name: poChild.boq_name || '',
                                client: poChild.client || '',
                                location: poChild.location || '',
                                created_at: poChild.created_at || '',
                                status: 'pending' as const,
                                vendor_email_sent: poChild.vendor_email_sent || false,
                                vendor_whatsapp_sent: poChild.vendor_whatsapp_sent || false,
                                vendor_whatsapp_sent_at: poChild.vendor_whatsapp_sent_at || null,
                                has_store_requests: false,
                                store_requests_pending: false,
                                all_store_requests_approved: false,
                                any_store_request_rejected: false,
                                vendor_selection_pending_td_approval: false,
                                item_name: poChild.item_name || '',
                                po_child_id: poChild.id,
                              };
                              handleViewDetails(purchaseLike);
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-xs border-gray-300 hover:bg-gray-50 px-2 py-1"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View Details
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Render Purchase card
                const purchase = item as Purchase;
                return (
                <motion.div
                  key={purchase.cr_id}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col ${
                    purchase.status === 'completed'
                      ? 'border-green-200'
                      : purchase.status === 'rejected'
                        ? 'border-red-300'
                        : purchase.store_requests_pending || purchase.all_store_requests_approved
                          ? 'border-purple-200'
                          : purchase.vendor_selection_pending_td_approval
                            ? 'border-amber-200'
                            : 'border-blue-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`px-4 py-3 border-b ${
                    purchase.status === 'completed'
                      ? 'bg-gradient-to-r from-green-50 to-green-100 border-green-200'
                      : purchase.status === 'rejected'
                        ? 'bg-gradient-to-r from-red-50 to-red-100 border-red-200'
                        : purchase.store_requests_pending || purchase.all_store_requests_approved
                          ? 'bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200'
                          : purchase.vendor_selection_pending_td_approval
                            ? 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200'
                            : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{purchase.project_name}</h3>
                      <Badge className={`${
                        purchase.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : purchase.store_requests_pending || purchase.all_store_requests_approved
                            ? 'bg-purple-100 text-purple-800'
                            : purchase.vendor_selection_pending_td_approval
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                      } text-xs whitespace-nowrap`}>
                        {purchase.formatted_cr_id || `PO-${purchase.cr_id}`}
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

                  {/* Rejection Reason Banner - Show for rejected items */}
                  {purchase.status === 'rejected' && (purchase.rejection_reason || purchase.vendor_rejection_reason) && (
                    <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                      <div className="flex items-start gap-2">
                        <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-red-600 font-medium mb-0.5">
                            {purchase.rejection_type === 'vendor_selection' ? 'Vendor Selection Rejected' : 'Change Request Rejected'}
                          </div>
                          <div className="text-sm text-red-900 line-clamp-2">
                            {purchase.rejection_reason || purchase.vendor_rejection_reason}
                          </div>
                          {purchase.rejected_by_name && (
                            <div className="text-xs text-red-700 mt-1">
                              Rejected by: {purchase.rejected_by_name}
                            </div>
                          )}
                        </div>
                        <Badge className="bg-red-100 text-red-800 text-[10px]">
                          REJECTED
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
                            {/* Show remaining materials count (excluding store-sent) */}
                            {(() => {
                              const storeCount = purchase.store_requested_materials?.length || 0;
                              const totalCount = purchase.materials_count || 0;
                              const remainingCount = totalCount - storeCount;
                              if (storeCount > 0) {
                                return <span>{remainingCount} items <span className="text-purple-600 text-xs">({storeCount} in store)</span></span>;
                              }
                              return <span>{totalCount} items</span>;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Total Cost with Price Diff */}
                      <div className="pt-2 border-t border-gray-100">
                        {(() => {
                          // Check if any materials have negotiated prices
                          // Exclude store-sent materials from calculation
                          const storeRequestedMaterials = purchase.store_requested_materials || [];
                          const materials = (purchase.materials || []).filter((m: any) =>
                            !storeRequestedMaterials.includes(m.material_name)
                          );
                          const hasNegotiatedPrices = materials.some((m: any) =>
                            m.negotiated_price !== undefined && m.negotiated_price !== null
                          );
                          const originalTotal = materials.reduce((sum: number, m: any) => {
                            const originalPrice = m.original_unit_price || m.unit_price || 0;
                            return sum + (originalPrice * (m.quantity || 0));
                          }, 0);
                          // Recalculate current total excluding store materials
                          const currentTotal = materials.reduce((sum: number, m: any) => {
                            const price = m.negotiated_price ?? m.unit_price ?? 0;
                            return sum + (price * (m.quantity || 0));
                          }, 0);
                          const priceDiff = hasNegotiatedPrices ? currentTotal - originalTotal : 0;
                          const diffPercentage = originalTotal > 0 ? (priceDiff / originalTotal) * 100 : 0;

                          if (hasNegotiatedPrices && Math.abs(priceDiff) > 0.01) {
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Original</span>
                                  <span className="text-xs text-gray-400 line-through">{formatCurrency(originalTotal)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Negotiated</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm font-bold text-green-700">{formatCurrency(currentTotal)}</span>
                                    <Badge className={`text-[10px] px-1 py-0 ${
                                      priceDiff < 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                      {priceDiff < 0 ? <TrendingDown className="w-2.5 h-2.5 mr-0.5" /> : <TrendingUp className="w-2.5 h-2.5 mr-0.5" />}
                                      {priceDiff < 0 ? '' : '+'}{diffPercentage.toFixed(1)}%
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">Total Cost</span>
                              <span className="text-sm font-bold text-green-700">{formatCurrency(currentTotal)}</span>
                            </div>
                          );
                        })()}
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
                        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-purple-600" />
                            <div>
                              <div className="text-xs font-semibold text-purple-900">Sent to M2 Store</div>
                              <div className="text-xs text-purple-700">Awaiting PM approval ({purchase.store_request_count} request(s))</div>
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

                      {/* Partial Store Request - Some materials sent to store, others pending vendor selection */}
                      {purchase.status === 'pending' && purchase.has_store_requests && !purchase.store_requests_pending && !purchase.all_store_requests_approved && purchase.store_requested_materials && purchase.store_requested_materials.length > 0 && purchase.store_requested_materials.length < (purchase.materials_count || 0) && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-purple-600" />
                            <div>
                              <div className="text-xs font-semibold text-purple-900">
                                {purchase.store_requested_materials.length} material(s) sent to store
                              </div>
                              <div className="text-xs text-purple-700">
                                {(purchase.materials_count || 0) - purchase.store_requested_materials.length} remaining for vendor
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* First Row: Select Vendor OR Get from Store - Show if no vendor, no pending approval, AND (no store requests OR store request rejected OR partial store request) */}
                      {purchase.status === 'pending' && !purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (!purchase.has_store_requests || purchase.any_store_request_rejected || (purchase.store_requested_materials && purchase.store_requested_materials.length < (purchase.materials_count || 0))) && (
                        <div className="flex flex-col gap-1.5">
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
                          {/* Edit Prices Button */}
                          <Button
                            onClick={() => {
                              setSelectedPurchaseForPriceEdit(purchase);
                              setIsEditPricesModalOpen(true);
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 px-2 py-1"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Edit Prices
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

                      {/* Send to Vendor - Hide if POChildren exist (vendor-specific LPOs should be sent from POChild cards) */}
                      {purchase.status === 'pending' && purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (!purchase.po_children || purchase.po_children.length === 0) && (
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
                            {purchase.vendor_whatsapp_sent ? (
                              <Button
                                onClick={() => handleSendWhatsApp(purchase)}
                                disabled={sendingWhatsAppId === purchase.cr_id || !purchase.vendor_phone}
                                size="sm"
                                className="flex-1 h-7 text-xs bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 px-2 py-1"
                                title={`Sent via WhatsApp${purchase.vendor_whatsapp_sent_at ? ` on ${new Date(purchase.vendor_whatsapp_sent_at).toLocaleDateString()}` : ''}`}
                              >
                                {sendingWhatsAppId === purchase.cr_id ? (
                                  <div className="w-3 h-3 mr-1 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                )}
                                Sent
                              </Button>
                            ) : purchase.vendor_phone ? (
                              <Button
                                onClick={() => handleSendWhatsApp(purchase)}
                                disabled={sendingWhatsAppId === purchase.cr_id}
                                size="sm"
                                className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1"
                                title="Send via WhatsApp"
                              >
                                {sendingWhatsAppId === purchase.cr_id ? (
                                  <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <MessageSquare className="w-3 h-3 mr-1" />
                                )}
                                WhatsApp
                              </Button>
                            ) : (
                              <div
                                className="flex-1 h-7 flex items-center justify-center bg-gray-100 border border-gray-300 rounded text-gray-400 text-xs px-2 py-1 cursor-not-allowed"
                                title="No phone number available for this vendor"
                              >
                                <MessageSquare className="w-3 h-3 mr-1 opacity-50" />
                                No Phone
                              </div>
                            )}
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

                      {/* Rejected Item Actions - Resend only for CR rejections (not vendor selection) */}
                      {purchase.status === 'rejected' && purchase.rejection_type !== 'vendor_selection' && (
                        <Button
                          onClick={() => handleResend(purchase.cr_id)}
                          size="sm"
                          className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Resend
                        </Button>
                      )}

                      {/* Select New Vendor for Vendor Rejection */}
                      {purchase.status === 'rejected' && purchase.rejection_type === 'vendor_selection' && (
                        <Button
                          onClick={() => handleSelectVendor(purchase)}
                          size="sm"
                          className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1"
                        >
                          <Store className="w-3 h-3 mr-1" />
                          Select New Vendor
                        </Button>
                      )}

                      {/* Third Row: Complete & Send to Store - Show after email OR WhatsApp is sent */}
                      {purchase.status === 'pending' && !purchase.vendor_selection_pending_td_approval && purchase.vendor_id && (purchase.vendor_email_sent || purchase.vendor_whatsapp_sent) && (
                        <Button
                          onClick={() => handleMarkAsComplete(purchase.cr_id)}
                          disabled={completingPurchaseId === purchase.cr_id}
                          size="sm"
                          className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                          title="Materials will go to M2 Store first, then Production Manager will dispatch to site"
                        >
                          {completingPurchaseId === purchase.cr_id ? (
                            <>
                              <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Sending to Store...
                            </>
                          ) : (
                            <>
                              <Package className="w-3 h-3 mr-1" />
                              Complete & Send to Store
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* PO Children Display - Compact summary of sent vendor orders */}
                  {purchase.po_children && purchase.po_children.length > 0 && (
                    <div className="border-t border-gray-200 bg-gray-50/50 px-3 py-2">
                      <div className="text-[10px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        Sent to TD ({purchase.po_children.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {purchase.po_children.map((poChild) => (
                          <div
                            key={poChild.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${
                              poChild.vendor_selection_status === 'approved'
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : poChild.vendor_selection_status === 'pending_td_approval'
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : poChild.status === 'purchase_completed'
                                    ? 'bg-green-100 border-green-300 text-green-900'
                                    : 'bg-gray-50 border-gray-200 text-gray-600'
                            }`}
                            title={`${poChild.vendor_name || 'No vendor'} - ${poChild.materials_count || poChild.materials?.length || 0} items`}
                          >
                            <span className="font-semibold">{poChild.suffix}</span>
                            <span className="truncate max-w-[80px]">{poChild.vendor_name || 'N/A'}</span>
                            {poChild.status === 'purchase_completed' && (
                              <CheckCircle className="w-3 h-3 text-green-700 flex-shrink-0" />
                            )}
                            {poChild.vendor_selection_status === 'approved' && poChild.status !== 'purchase_completed' && (
                              <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                            )}
                            {poChild.vendor_selection_status === 'pending_td_approval' && (
                              <Clock className="w-3 h-3 text-amber-600 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
                );
              })}

              {/* OLD: Approved PO Children Cards - Now handled in merged array above for vendor_approved tab */}
              {/* Keeping this block commented for reference - it's now integrated in the main loop above */}
              {false && activeTab === 'ongoing' && ongoingSubTab === 'vendor_approved' && approvedPOChildren
                .filter(poChild =>
                  (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (poChild.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((poChild) => (
                <motion.div
                  key={`po-child-${poChild.id}`}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col border-green-300"
                >
                  {/* Card Header - Same layout as legacy cards */}
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-green-50 to-green-100 border-green-200">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{poChild.project_name || 'Unknown Project'}</h3>
                      <Badge className="bg-green-100 text-green-800 text-xs whitespace-nowrap">
                        {poChild.formatted_id}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      {poChild.project_code && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0 text-blue-600" />
                          <span className="truncate font-semibold text-blue-900">Project Code: {poChild.project_code}</span>
                        </div>
                      )}
                      {poChild.client && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.client}</span>
                        </div>
                      )}
                      {poChild.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.location}</span>
                        </div>
                      )}
                      {poChild.boq_name && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.boq_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vendor Info Banner */}
                  <div className="px-4 py-2 bg-green-50 border-b border-green-200">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-green-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-green-600 font-medium">Selected Vendor</div>
                        <div className="text-sm font-bold text-green-900 truncate">{poChild.vendor_name || 'No Vendor'}</div>
                      </div>
                      <Badge className="bg-green-100 text-green-800 text-[10px]">
                        TD Approved
                      </Badge>
                    </div>
                  </div>

                  {/* Card Body - Same layout as legacy cards */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="space-y-3 mb-4">
                      {poChild.item_name && (
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Item</div>
                          <div className="font-medium text-gray-900 text-sm line-clamp-1">{poChild.item_name}</div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Created</div>
                          <div className="text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Materials</div>
                          <div className="text-sm font-medium flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {poChild.materials_count || poChild.materials?.length || 0} items
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="text-xs text-gray-500">Total Cost</span>
                        <span className="text-sm font-bold text-green-700">{formatCurrency(poChild.materials_total_cost || 0)}</span>
                      </div>
                    </div>

                    {/* TD Approved Status */}
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <div>
                          <div className="text-xs font-semibold text-green-900">TD Approved</div>
                          <div className="text-xs text-green-700">Ready for purchase completion</div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      {/* Show Send Email/WhatsApp buttons if NEITHER email NOR WhatsApp sent yet */}
                      {!(poChild.vendor_email_sent || poChild.vendor_whatsapp_sent) ? (
                        <div className="flex gap-1.5 w-full">
                          <Button
                            onClick={() => {
                              // Convert POChild to Purchase format for email modal
                              const purchaseLike: Purchase = {
                                cr_id: poChild.parent_cr_id,
                                formatted_cr_id: poChild.formatted_id,
                                project_id: poChild.project_id || 0,
                                project_name: poChild.project_name || 'Unknown Project',
                                project_code: poChild.project_code,
                                client: poChild.client || '',
                                location: poChild.location || '',
                                boq_id: poChild.boq_id || 0,
                                boq_name: poChild.boq_name || '',
                                item_name: poChild.item_name || '',
                                sub_item_name: '',
                                request_type: '',
                                reason: '',
                                materials: poChild.materials || [],
                                materials_count: poChild.materials_count || poChild.materials?.length || 0,
                                total_cost: poChild.materials_total_cost || 0,
                                approved_by: 0,
                                approved_at: null,
                                created_at: poChild.created_at || '',
                                status: 'pending',
                                vendor_id: poChild.vendor_id,
                                vendor_name: poChild.vendor_name,
                                vendor_phone: poChild.vendor_phone,
                                vendor_email: poChild.vendor_email,
                                vendor_selection_status: poChild.vendor_selection_status,
                                po_child_id: poChild.id,  // Pass POChild ID for email API
                              };
                              setSelectedPurchase(purchaseLike);
                              setIsVendorEmailModalOpen(true);
                            }}
                            className="flex-1 bg-blue-900 hover:bg-blue-800 text-white text-xs"
                            size="sm"
                          >
                            <Mail className="w-3.5 h-3.5 mr-1" />
                            Email
                          </Button>
                          {poChild.vendor_phone ? (
                            poChild.vendor_whatsapp_sent ? (
                              <div
                                className="flex-1 flex items-center justify-center bg-green-50 border border-green-300 rounded text-green-600 text-xs px-2 py-1.5"
                                title={`WhatsApp sent${poChild.vendor_whatsapp_sent_at ? ` on ${new Date(poChild.vendor_whatsapp_sent_at).toLocaleDateString()}` : ''}`}
                              >
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                Sent
                              </div>
                            ) : (
                              <Button
                                onClick={async () => {
                                  try {
                                    setSendingWhatsAppId(poChild.id);
                                    await buyerService.sendVendorWhatsApp(poChild.parent_cr_id, poChild.vendor_phone!, true, poChild.id);
                                    showSuccess('Purchase order sent via WhatsApp!');
                                    refetchApprovedPOChildren();
                                  } catch (error: any) {
                                    showError(error.message || 'Failed to send WhatsApp');
                                  } finally {
                                    setSendingWhatsAppId(null);
                                  }
                                }}
                                disabled={sendingWhatsAppId === poChild.id}
                                className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs"
                                size="sm"
                                title="Send via WhatsApp"
                              >
                                {sendingWhatsAppId === poChild.id ? (
                                  <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <MessageSquare className="w-3.5 h-3.5 mr-1" />
                                )}
                                WhatsApp
                              </Button>
                            )
                          ) : (
                            <div
                              className="flex-1 flex items-center justify-center bg-gray-100 border border-gray-300 rounded text-gray-400 text-xs px-2 py-1.5 cursor-not-allowed"
                              title="No phone number available for this vendor"
                            >
                              <MessageSquare className="w-3.5 h-3.5 mr-1 opacity-50" />
                              No Phone
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Sent to Vendor Status (Email or WhatsApp) */}
                          <div className="w-full h-7 bg-green-50 border border-green-200 rounded flex items-center justify-center text-xs font-medium text-green-700 px-2 py-1">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Sent to Vendor
                          </div>
                          {/* Complete & Send to Store Button */}
                          <Button
                            onClick={async () => {
                              try {
                                setCompletingPurchaseId(poChild.id);
                                await buyerService.completePOChildPurchase(poChild.id);
                                showSuccess('Purchase marked as complete!');
                                refetchApprovedPOChildren();
                              } catch (error: any) {
                                showError(error.message || 'Failed to complete purchase');
                              } finally {
                                setCompletingPurchaseId(null);
                              }
                            }}
                            disabled={completingPurchaseId === poChild.id}
                            className="w-full bg-green-600 hover:bg-green-700 text-white text-xs"
                            size="sm"
                            title="Materials will go to M2 Store first, then Production Manager will dispatch to site"
                          >
                            {completingPurchaseId === poChild.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                Sending to Store...
                              </>
                            ) : (
                              <>
                                <Package className="w-3.5 h-3.5 mr-1.5" />
                                Complete & Send to Store
                              </>
                            )}
                          </Button>
                        </>
                      )}
                      <Button
                        onClick={() => {
                          // View details - convert to Purchase format
                          const purchaseLike: Purchase = {
                            cr_id: poChild.parent_cr_id,
                            formatted_cr_id: poChild.formatted_id,
                            project_id: poChild.project_id || 0,
                            project_name: poChild.project_name || 'Unknown Project',
                            project_code: poChild.project_code,
                            client: poChild.client || '',
                            location: poChild.location || '',
                            boq_id: poChild.boq_id || 0,
                            boq_name: poChild.boq_name || '',
                            item_name: poChild.item_name || '',
                            sub_item_name: '',
                            request_type: '',
                            reason: '',
                            materials: poChild.materials || [],
                            materials_count: poChild.materials_count || poChild.materials?.length || 0,
                            total_cost: poChild.materials_total_cost || 0,
                            approved_by: 0,
                            approved_at: null,
                            created_at: poChild.created_at || '',
                            status: 'pending',
                            vendor_id: poChild.vendor_id,
                            vendor_name: poChild.vendor_name,
                          };
                          setSelectedPurchase(purchaseLike);
                          setIsDetailsModalOpen(true);
                        }}
                        variant="outline"
                        className="w-full text-xs"
                        size="sm"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Pending POChildren Cards (when on Pending Approval tab) */}
              {activeTab === 'pending_approval' && pendingPOChildren
                .filter(poChild => {
                  const searchLower = searchTerm.toLowerCase().trim();
                  const poIdString = `po-${poChild.id}`;
                  const formattedId = (poChild.formatted_id || '').toLowerCase();
                  return !searchTerm ||
                    (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
                    (poChild.vendor_name || '').toLowerCase().includes(searchLower) ||
                    poChild.project_code?.toLowerCase().includes(searchLower) ||
                    poIdString.includes(searchLower) ||
                    formattedId.includes(searchLower) ||
                    poChild.id?.toString().includes(searchTerm.trim());
                })
                .map((poChild) => (
                <motion.div
                  key={`pending-po-child-${poChild.id}`}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col border-amber-300"
                >
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{poChild.project_name || 'Unknown Project'}</h3>
                      <Badge className="bg-amber-100 text-amber-800 text-xs whitespace-nowrap">
                        {poChild.formatted_id}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      {poChild.project_code && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0 text-blue-600" />
                          <span className="truncate font-semibold text-blue-900">Project Code: {poChild.project_code}</span>
                        </div>
                      )}
                      {poChild.client && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.client}</span>
                        </div>
                      )}
                      {poChild.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.location}</span>
                        </div>
                      )}
                      {poChild.boq_name && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.boq_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-4 py-3 flex-1 flex flex-col">
                    {/* Vendor Info */}
                    {poChild.vendor_name && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                        <div className="text-xs text-amber-600 mb-1">Selected Vendor</div>
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-amber-700" />
                          <span className="text-sm font-semibold text-amber-900">{poChild.vendor_name}</span>
                        </div>
                      </div>
                    )}

                    {/* Item */}
                    {poChild.item_name && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">Item</div>
                        <div className="font-medium text-sm">{poChild.item_name}</div>
                      </div>
                    )}

                    {/* Details Row */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Created</div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          {poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Materials</div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Package className="w-3 h-3" />
                          {poChild.materials_count || poChild.materials_data?.length || 0} items
                        </div>
                      </div>
                    </div>

                    {/* Total Cost */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">Total Cost</div>
                      <div className="text-lg font-bold text-amber-700">
                        {formatCurrency(poChild.materials_total_cost || 0)}
                      </div>
                    </div>

                    {/* Pending TD Approval Status */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <div>
                          <div className="text-xs font-semibold text-amber-900">Pending TD Approval</div>
                          <div className="text-xs text-amber-700">
                            Waiting for Technical Director to approve vendor selection
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* View Details Button */}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      <Button
                        onClick={() => {
                          const purchaseLike: Purchase = {
                            cr_id: poChild.parent_cr_id,
                            formatted_cr_id: poChild.formatted_id,
                            project_id: poChild.project_id || 0,
                            project_name: poChild.project_name || 'Unknown Project',
                            project_code: poChild.project_code,
                            client: poChild.client || '',
                            location: poChild.location || '',
                            boq_id: poChild.boq_id || 0,
                            boq_name: poChild.boq_name || '',
                            item_name: poChild.item_name || '',
                            sub_item_name: '',
                            request_type: '',
                            reason: '',
                            materials: poChild.materials || [],
                            materials_count: poChild.materials_count || poChild.materials_data?.length || 0,
                            total_cost: poChild.materials_total_cost || 0,
                            approved_by: 0,
                            approved_at: null,
                            created_at: poChild.created_at || '',
                            status: 'pending',
                            vendor_id: poChild.vendor_id,
                            vendor_name: poChild.vendor_name,
                          };
                          setSelectedPurchase(purchaseLike);
                          setIsDetailsModalOpen(true);
                        }}
                        variant="outline"
                        className="w-full text-xs"
                        size="sm"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Completed PO Children Cards (when on Completed tab) */}
              {activeTab === 'completed' && completedPOChildren
                .filter(poChild => {
                  const searchLower = searchTerm.toLowerCase().trim();
                  const poIdString = `po-${poChild.id}`;
                  const formattedId = (poChild.formatted_id || '').toLowerCase();
                  return !searchTerm ||
                    (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
                    (poChild.vendor_name || '').toLowerCase().includes(searchLower) ||
                    poChild.project_code?.toLowerCase().includes(searchLower) ||
                    poIdString.includes(searchLower) ||
                    formattedId.includes(searchLower) ||
                    poChild.id?.toString().includes(searchTerm.trim());
                })
                .map((poChild) => (
                <motion.div
                  key={`completed-po-child-${poChild.id}`}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col border-green-300"
                >
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-green-50 to-green-100 border-green-200">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{poChild.project_name || 'Unknown Project'}</h3>
                      <Badge className="bg-green-100 text-green-800 text-xs whitespace-nowrap">
                        {poChild.formatted_id}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      {poChild.project_code && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0 text-blue-600" />
                          <span className="truncate font-semibold text-blue-900">Project Code: {poChild.project_code}</span>
                        </div>
                      )}
                      {poChild.client && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.client}</span>
                        </div>
                      )}
                      {poChild.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.location}</span>
                        </div>
                      )}
                      {poChild.boq_name && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.boq_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-4 py-3 flex-1 flex flex-col">
                    {/* Vendor Info */}
                    {poChild.vendor_name && (
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                        <div className="text-xs text-green-600 mb-1">Vendor</div>
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-green-700" />
                          <span className="text-sm font-semibold text-green-900">{poChild.vendor_name}</span>
                        </div>
                      </div>
                    )}

                    {/* Item */}
                    {poChild.item_name && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">Item</div>
                        <div className="font-medium text-sm">{poChild.item_name}</div>
                      </div>
                    )}

                    {/* Details Row */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Created</div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          {poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Materials</div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Package className="w-3 h-3" />
                          {poChild.materials_count || poChild.materials_data?.length || 0} items
                        </div>
                      </div>
                    </div>

                    {/* Total Cost */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">Total Cost</div>
                      <div className="text-lg font-bold text-green-700">
                        {formatCurrency(poChild.materials_total_cost || 0)}
                      </div>
                    </div>

                    {/* Completed Status */}
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <div>
                          <div className="text-xs font-semibold text-green-900">Purchase Completed</div>
                          {poChild.purchase_completed_by_name && (
                            <div className="text-xs text-green-700">
                              By {poChild.purchase_completed_by_name}
                              {poChild.purchase_completion_date && (
                                <> on {new Date(poChild.purchase_completion_date).toLocaleDateString()}</>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* View Details Button */}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      <Button
                        onClick={() => {
                          const purchaseLike: Purchase = {
                            cr_id: poChild.parent_cr_id,
                            formatted_cr_id: poChild.formatted_id,
                            project_id: poChild.project_id || 0,
                            project_name: poChild.project_name || 'Unknown Project',
                            project_code: poChild.project_code,
                            client: poChild.client || '',
                            location: poChild.location || '',
                            boq_id: poChild.boq_id || 0,
                            boq_name: poChild.boq_name || '',
                            item_name: poChild.item_name || '',
                            sub_item_name: '',
                            request_type: '',
                            reason: '',
                            materials: poChild.materials || [],
                            materials_count: poChild.materials_count || poChild.materials_data?.length || 0,
                            total_cost: poChild.materials_total_cost || 0,
                            approved_by: 0,
                            approved_at: null,
                            created_at: poChild.created_at || '',
                            status: 'completed',
                            vendor_id: poChild.vendor_id,
                            vendor_name: poChild.vendor_name,
                          };
                          setSelectedPurchase(purchaseLike);
                          setIsDetailsModalOpen(true);
                        }}
                        variant="outline"
                        className="w-full text-xs"
                        size="sm"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* TD Rejected PO Children Cards (when on Rejected tab) - Buyer can re-select vendor */}
              {activeTab === 'rejected' && tdRejectedPOChildren
                .filter(poChild => {
                  const searchLower = searchTerm.toLowerCase().trim();
                  const poIdString = `po-${poChild.po_child_id}`;
                  const formattedId = (poChild.formatted_id || '').toLowerCase();
                  return !searchTerm ||
                    (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
                    poChild.project_code?.toLowerCase().includes(searchLower) ||
                    poIdString.includes(searchLower) ||
                    formattedId.includes(searchLower) ||
                    poChild.po_child_id?.toString().includes(searchTerm.trim());
                })
                .map((poChild) => (
                <motion.div
                  key={`td-rejected-po-child-${poChild.po_child_id}`}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col border-red-300"
                >
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-red-50 to-red-100 border-red-200">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{poChild.project_name || 'Unknown Project'}</h3>
                      <Badge className="bg-red-100 text-red-800 text-xs whitespace-nowrap">
                        {poChild.formatted_id}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      {poChild.client && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.client}</span>
                        </div>
                      )}
                      {poChild.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.location}</span>
                        </div>
                      )}
                      {poChild.boq_name && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{poChild.boq_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rejection Reason Banner */}
                  <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                    <div className="flex items-start gap-2">
                      <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-red-800">TD Rejected - Select New Vendor</div>
                        <div className="text-xs text-red-700 mt-0.5 line-clamp-2">
                          {poChild.rejection_reason}
                        </div>
                        {poChild.rejected_by_name && (
                          <div className="text-[10px] text-red-600 mt-1">Rejected by: {poChild.rejected_by_name}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-4 py-3 flex-1 flex flex-col">
                    {/* Item */}
                    {poChild.item_name && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">Item</div>
                        <div className="font-medium text-sm">{poChild.item_name}</div>
                      </div>
                    )}

                    {/* Details Row */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Created</div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          {poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Materials</div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Package className="w-3 h-3" />
                          {poChild.materials_count || 0} items
                        </div>
                      </div>
                    </div>

                    {/* Total Cost */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">Total Cost</div>
                      <div className="text-lg font-bold text-red-700">
                        {formatCurrency(poChild.total_cost || 0)}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      {/* Select New Vendor Button */}
                      <Button
                        onClick={() => {
                          // Convert to Purchase format for vendor selection modal
                          const purchaseLike: Purchase = {
                            cr_id: poChild.parent_cr_id,
                            formatted_cr_id: poChild.formatted_id,
                            project_id: poChild.project_id,
                            project_name: poChild.project_name,
                            client: poChild.client,
                            location: poChild.location,
                            boq_id: poChild.boq_id,
                            boq_name: poChild.boq_name,
                            item_name: poChild.item_name,
                            sub_item_name: '',
                            request_type: '',
                            reason: '',
                            materials: poChild.materials || [],
                            materials_count: poChild.materials_count || 0,
                            total_cost: poChild.total_cost || 0,
                            approved_by: 0,
                            approved_at: null,
                            created_at: poChild.created_at || '',
                            status: 'pending',
                            po_child_id: poChild.po_child_id,  // Pass POChild ID for re-selection
                          };
                          setSelectedPurchase(purchaseLike);
                          setIsVendorSelectionModalOpen(true);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
                        size="sm"
                      >
                        <Store className="w-3.5 h-3.5 mr-1.5" />
                        Select New Vendor
                      </Button>

                      <Button
                        onClick={() => {
                          const purchaseLike: Purchase = {
                            cr_id: poChild.parent_cr_id,
                            formatted_cr_id: poChild.formatted_id,
                            project_id: poChild.project_id,
                            project_name: poChild.project_name,
                            client: poChild.client,
                            location: poChild.location,
                            boq_id: poChild.boq_id,
                            boq_name: poChild.boq_name,
                            item_name: poChild.item_name,
                            sub_item_name: '',
                            request_type: '',
                            reason: '',
                            materials: poChild.materials || [],
                            materials_count: poChild.materials_count || 0,
                            total_cost: poChild.total_cost || 0,
                            approved_by: 0,
                            approved_at: null,
                            created_at: poChild.created_at || '',
                            status: 'rejected',
                          };
                          setSelectedPurchase(purchaseLike);
                          setIsDetailsModalOpen(true);
                        }}
                        variant="outline"
                        className="w-full text-xs"
                        size="sm"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">PO #</th>
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
                    {/* Determine which items to show based on active tab */}
                    {(
                      activeTab === 'ongoing' && ongoingSubTab === 'vendor_approved'
                        ? mergedVendorApprovedItems
                        : activeTab === 'pending_approval' && pendingApprovalSubTab === 'vendor_approval'
                          ? pendingPOChildren
                          : filteredPurchases
                    ).map((item) => {
                      // Skip POChildren in table view for now, or handle them differently
                      if (isPOChild(item)) {
                        // For table view, render POChild rows
                        const poChild = item;
                        return (
                          <motion.tr
                            key={`po-child-${poChild.id}`}
                            initial={false}
                            animate={{ opacity: 1 }}
                            className="hover:bg-gray-50 transition-colors bg-green-50/30"
                          >
                            <td className="px-3 py-3 whitespace-nowrap">
                              <Badge className="bg-green-100 text-green-800 text-xs">
                                {poChild.formatted_id}
                              </Badge>
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-medium text-gray-900 max-w-[200px] truncate">{poChild.project_name || 'Unknown Project'}</div>
                            </td>
                            <td className="px-3 py-3 hidden md:table-cell">
                              <div className="text-gray-600 max-w-[150px] truncate">{poChild.client || '-'}</div>
                            </td>
                            <td className="px-3 py-3 hidden lg:table-cell">
                              <div className="text-gray-600 max-w-[150px] truncate">{poChild.location || '-'}</div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-gray-900 max-w-[180px] truncate">{poChild.item_name || '-'}</div>
                            </td>
                            <td className="px-3 py-3 hidden sm:table-cell">
                              <div className="flex items-center gap-1 text-gray-600">
                                <Package className="w-3.5 h-3.5" />
                                {poChild.materials_count || poChild.materials?.length || 0}
                              </div>
                            </td>
                            <td className="px-3 py-3 hidden xl:table-cell">
                              <div className="font-medium text-gray-900">{formatCurrency(poChild.materials_total_cost || 0)}</div>
                            </td>
                            <td className="px-3 py-3 hidden lg:table-cell">
                              <div className="text-xs text-gray-600">
                                {poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  onClick={() => {
                                    const purchaseLike: Purchase = {
                                      ...poChild,
                                      cr_id: poChild.parent_cr_id,
                                      vendor_id: poChild.vendor_id || 0,
                                      vendor_name: poChild.vendor_name || '',
                                      vendor_email: poChild.vendor_email || '',
                                      vendor_phone: poChild.vendor_phone || '',
                                      materials: poChild.materials || [],
                                      project_name: poChild.project_name || '',
                                      boq_name: poChild.boq_name || '',
                                      client: poChild.client || '',
                                      location: poChild.location || '',
                                      created_at: poChild.created_at || '',
                                      status: 'pending' as const,
                                      vendor_email_sent: poChild.vendor_email_sent || false,
                                      vendor_whatsapp_sent: poChild.vendor_whatsapp_sent || false,
                                      vendor_whatsapp_sent_at: poChild.vendor_whatsapp_sent_at || null,
                                      has_store_requests: false,
                                      store_requests_pending: false,
                                      all_store_requests_approved: false,
                                      any_store_request_rejected: false,
                                      vendor_selection_pending_td_approval: false,
                                      item_name: poChild.item_name || '',
                                      po_child_id: poChild.id,
                                    };
                                    handleViewDetails(purchaseLike);
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  View
                                </Button>
                                <Button
                                  onClick={async () => {
                                    try {
                                      setCompletingPurchaseId(poChild.id);
                                      await buyerService.completePOChildPurchase(poChild.id);
                                      showSuccess('Purchase marked as complete!');
                                      refetchApprovedPOChildren();
                                    } catch (error: any) {
                                      showError(error.message || 'Failed to complete purchase');
                                    } finally {
                                      setCompletingPurchaseId(null);
                                    }
                                  }}
                                  disabled={completingPurchaseId === poChild.id}
                                  variant="default"
                                  size="sm"
                                  className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                                >
                                  {completingPurchaseId === poChild.id ? (
                                    <>
                                      <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      Completing...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Complete
                                    </>
                                  )}
                                </Button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      }

                      // Render Purchase row
                      const purchase = item as Purchase;
                      return (
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
                                : 'bg-blue-100 text-blue-800'
                          } text-xs`}>
                            {purchase.formatted_cr_id || `PO-${purchase.cr_id}`}
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
                                  {/* WhatsApp button with Sent status */}
                                  {purchase.vendor_whatsapp_sent ? (
                                    <Button
                                      onClick={() => handleSendWhatsApp(purchase)}
                                      disabled={sendingWhatsAppId === purchase.cr_id || !purchase.vendor_phone}
                                      size="sm"
                                      className="px-2 py-1 h-auto text-xs bg-green-100 hover:bg-green-200 text-green-700 border border-green-300"
                                      title={`Sent via WhatsApp${purchase.vendor_whatsapp_sent_at ? ` on ${new Date(purchase.vendor_whatsapp_sent_at).toLocaleDateString()}` : ''}`}
                                    >
                                      {sendingWhatsAppId === purchase.cr_id ? (
                                        <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-3 h-3 sm:mr-1" />
                                      )}
                                      <span className="hidden lg:inline">Sent</span>
                                    </Button>
                                  ) : purchase.vendor_phone ? (
                                    <Button
                                      onClick={() => handleSendWhatsApp(purchase)}
                                      disabled={sendingWhatsAppId === purchase.cr_id}
                                      size="sm"
                                      className="px-2 py-1 h-auto text-xs bg-green-500 hover:bg-green-600 text-white"
                                      title="Send via WhatsApp"
                                    >
                                      {sendingWhatsAppId === purchase.cr_id ? (
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <MessageSquare className="w-3 h-3 sm:mr-1" />
                                      )}
                                      <span className="hidden lg:inline">WA</span>
                                    </Button>
                                  ) : (
                                    <div
                                      className="px-2 py-1 h-auto flex items-center bg-gray-100 border border-gray-300 rounded text-gray-400 text-xs cursor-not-allowed"
                                      title="No phone number available"
                                    >
                                      <MessageSquare className="w-3 h-3 sm:mr-1 opacity-50" />
                                      <span className="hidden lg:inline">No Phone</span>
                                    </div>
                                  )}
                                </>
                              )
                            )}

                            {/* Complete & Send to Store - Show after email OR WhatsApp is sent */}
                            {purchase.status === 'pending' && !purchase.vendor_selection_pending_td_approval && purchase.vendor_id && (purchase.vendor_email_sent || purchase.vendor_whatsapp_sent) && (
                              <Button
                                onClick={() => handleMarkAsComplete(purchase.cr_id)}
                                disabled={completingPurchaseId === purchase.cr_id}
                                size="sm"
                                className="px-2 py-1 h-auto text-xs bg-green-600 hover:bg-green-700 text-white"
                                title="Materials will go to M2 Store first, then Production Manager will dispatch to site"
                              >
                                {completingPurchaseId === purchase.cr_id ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Package className="w-3 h-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Send to Store</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ✅ PERFORMANCE: Pagination Controls */}
          {(() => {
            // Get the current pagination data based on active tab
            let currentPagination = null;
            let currentPage = 1;
            let setCurrentPage = setPendingPage;

            if (activeTab === 'ongoing' || activeTab === 'pending_approval') {
              currentPagination = pendingData?.pagination;
              currentPage = pendingPage;
              setCurrentPage = setPendingPage;
            } else if (activeTab === 'completed') {
              currentPagination = completedData?.pagination;
              currentPage = completedPage;
              setCurrentPage = setCompletedPage;
            } else if (activeTab === 'rejected') {
              currentPagination = rejectedData?.pagination;
              currentPage = rejectedPage;
              setCurrentPage = setRejectedPage;
            }

            // Only show pagination if we have pagination data
            if (!currentPagination || currentPagination.pages <= 1) return null;

            const { total, pages, has_next, has_prev } = currentPagination;
            const start = (currentPage - 1) * perPage + 1;
            const end = Math.min(currentPage * perPage, total);

            return (
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
                {/* Results info */}
                <div className="flex-1 flex justify-between sm:hidden">
                  <Button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={!has_prev}
                    variant="outline"
                    size="sm"
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={!has_next}
                    variant="outline"
                    size="sm"
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </Button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing <span className="font-medium">{start}</span> to{' '}
                      <span className="font-medium">{end}</span> of{' '}
                      <span className="font-medium">{total}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <Button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={!has_prev}
                        variant="outline"
                        size="sm"
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Previous</span>
                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </Button>
                      <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                        Page {currentPage} of {pages}
                      </span>
                      <Button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={!has_next}
                        variant="outline"
                        size="sm"
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Next</span>
                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </Button>
                    </nav>
                  </div>
                </div>
              </div>
            );
          })()}
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
          onVendorSelected={async () => {
            // Remove cache completely and refetch fresh data
            removeQueries(['purchases']);
            removeQueries(['pending-purchases']);
            removeQueries(['buyer-pending-purchases']);
            removeQueries(['buyer-pending-po-children']);
            removeQueries(['buyer-approved-po-children']);
            removeQueries(['change-requests']);
            // Small delay to ensure backend has processed the change
            await new Promise(resolve => setTimeout(resolve, 500));
            await refetchPending();
            await refetchCompleted();
            await refetchPendingPOChildren();
            // Switch to pending approval tab to see the submitted vendor selection
            setActiveTab('pending_approval');
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
          onVendorSelected={async () => {
            // Remove cache completely and refetch fresh data
            removeQueries(['purchases']);
            removeQueries(['pending-purchases']);
            removeQueries(['buyer-pending-purchases']);
            removeQueries(['buyer-pending-po-children']);
            removeQueries(['buyer-approved-po-children']);
            removeQueries(['change-requests']);
            // Small delay to ensure backend has processed the change
            await new Promise(resolve => setTimeout(resolve, 500));

            // Refetch all data
            const pendingResult = await refetchPending();
            await refetchCompleted();
            await refetchPendingPOChildren();

            // Update selectedPurchase with fresh data so modal shows updated negotiated prices
            if (selectedPurchase && pendingResult.data?.pending_purchases) {
              const updatedPurchase = pendingResult.data.pending_purchases.find(
                (p: Purchase) => p.cr_id === selectedPurchase.cr_id
              );
              if (updatedPurchase) {
                setSelectedPurchase(updatedPurchase);
              }
            }

            // Switch to pending approval tab to see the submitted vendor selection
            setActiveTab('pending_approval');
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
          onEmailSent={async () => {
            // Remove cache completely and refetch fresh data
            removeQueries(['purchases']);
            removeQueries(['pending-purchases']);
            removeQueries(['buyer-pending-purchases']);
            // Small delay to ensure backend has processed the change
            await new Promise(resolve => setTimeout(resolve, 500));
            await refetchPending();
            await refetchCompleted();
          }}
        />
      )}

      {/* Edit Prices Modal for Purchase */}
      {selectedPurchaseForPriceEdit && (
        <EditPricesModal
          purchase={selectedPurchaseForPriceEdit}
          isOpen={isEditPricesModalOpen}
          onClose={() => {
            setIsEditPricesModalOpen(false);
            setSelectedPurchaseForPriceEdit(null);
          }}
          onPricesUpdated={async () => {
            // Refetch pending purchases to show updated prices
            removeQueries(['buyer-pending-purchases']);
            await new Promise(resolve => setTimeout(resolve, 500));
            await refetchPending();
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
                      <p className="text-sm text-red-600">PO-{selectedPurchase?.cr_id}</p>
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

                    {/* Available Materials - Clickable/Selectable */}
                    {storeAvailability.available_materials.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            Available ({storeAvailability.available_materials.length})
                          </h3>
                          <span className="text-xs text-gray-500">
                            {selectedStoreMaterials.size} selected
                          </span>
                        </div>
                        <div className="space-y-2">
                          {storeAvailability.available_materials.map((mat, idx) => {
                            const isSelected = selectedStoreMaterials.has(mat.material_name);
                            return (
                              <div
                                key={idx}
                                onClick={() => toggleStoreMaterialSelection(mat.material_name)}
                                className={`rounded-lg p-3 cursor-pointer transition-all border-2 ${
                                  isSelected
                                    ? 'bg-green-100 border-green-500 shadow-sm'
                                    : 'bg-green-50 border-green-200 hover:border-green-400'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Checkbox */}
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? 'bg-green-600 border-green-600'
                                      : 'bg-white border-gray-300'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  {/* Material Info */}
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900 text-sm">{mat.material_name}</div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      Required: {mat.required_quantity} | In Store: {mat.available_quantity}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Already Sent Materials - Show with status */}
                    {storeAvailability.already_sent_materials && storeAvailability.already_sent_materials.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Store className="w-4 h-4 text-purple-600" />
                          Already Sent to Store ({storeAvailability.already_sent_materials.length})
                        </h3>
                        <p className="text-xs text-gray-500 mb-2">These materials have already been requested</p>
                        <div className="space-y-2">
                          {storeAvailability.already_sent_materials.map((mat: any, idx: number) => (
                            <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3 opacity-80">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-gray-900 text-sm">{mat.material_name}</div>
                                <span className="text-xs px-2 py-0.5 rounded bg-purple-200 text-purple-800 capitalize">
                                  {mat.status}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                Required: {mat.required_quantity}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unavailable Materials - Not selectable */}
                    {storeAvailability.unavailable_materials.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <XCircleIcon className="w-4 h-4 text-red-600" />
                          Not Available ({storeAvailability.unavailable_materials.length})
                        </h3>
                        <p className="text-xs text-gray-500 mb-2">These materials need to be ordered from vendor</p>
                        <div className="space-y-2">
                          {storeAvailability.unavailable_materials.map((mat, idx) => (
                            <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3 opacity-70">
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
                <div className="flex items-center justify-between">
                  {/* Selection info */}
                  <div className="text-sm text-gray-600">
                    {selectedStoreMaterials.size > 0 ? (
                      <span className="text-green-700 font-medium">
                        {selectedStoreMaterials.size} material{selectedStoreMaterials.size !== 1 ? 's' : ''} selected for store
                      </span>
                    ) : (
                      <span className="text-gray-500">Select materials to request from store</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsStoreModalOpen(false);
                        setStoreAvailability(null);
                        setSelectedStoreMaterials(new Set());
                      }}
                      disabled={completingFromStore}
                    >
                      Cancel
                    </Button>
                    {/* Show button when there are available materials (even if some unavailable) */}
                    {storeAvailability && storeAvailability.available_materials.length > 0 && (
                      <Button
                        onClick={handleConfirmGetFromStore}
                        disabled={completingFromStore || selectedStoreMaterials.size === 0}
                        className="bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50"
                      >
                        {completingFromStore ? (
                          <>
                            <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Sending Request...
                          </>
                        ) : (
                          <>
                            <Package className="w-4 h-4 mr-2" />
                            Request Selected ({selectedStoreMaterials.size})
                          </>
                        )}
                      </Button>
                    )}
                  </div>
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
