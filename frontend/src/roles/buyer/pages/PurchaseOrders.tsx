import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  XCircleIcon,
  X,
  MessageSquare,
  TrendingDown,
  TrendingUp
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
import SiteEngineerModal from '../components/SiteEngineerModal';
import StoreAvailabilityModal from '../components/StoreAvailabilityModal';
import { removeQueries, invalidateQueries } from '@/lib/queryClient';
import { STALE_TIMES, REALTIME_TABLES, PAGINATION } from '@/lib/constants';

// Helper function to check if an item is a POChild (has parent_cr_id) vs a Purchase (has cr_id)
const isPOChild = (item: Purchase | POChild | TDRejectedPOChild): item is POChild | TDRejectedPOChild => {
  return 'parent_cr_id' in item;
};

// Helper function to check if an item is a TDRejectedPOChild (has po_child_id instead of id)
const isTDRejectedPOChild = (item: any): item is TDRejectedPOChild => {
  return 'po_child_id' in item && !('id' in item);
};

// Helper to get the unique ID for a POChild or TDRejectedPOChild
const getPOChildId = (item: POChild | TDRejectedPOChild): number => {
  if ('po_child_id' in item) {
    return (item as TDRejectedPOChild).po_child_id;
  }
  return (item as POChild).id;
};

const PurchaseOrders: React.FC = () => {
  const location = useLocation();
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
  const [openWithWhatsAppPreview, setOpenWithWhatsAppPreview] = useState(false);
  const [isEditPricesModalOpen, setIsEditPricesModalOpen] = useState(false);
  const [selectedPurchaseForPriceEdit, setSelectedPurchaseForPriceEdit] = useState<Purchase | null>(null);
  // Site Engineer Selection for Vendor Delivery
  const [isSiteEngineerModalOpen, setIsSiteEngineerModalOpen] = useState(false);
  const [selectedPOChildForCompletion, setSelectedPOChildForCompletion] = useState<POChild | null>(null);
  const [siteEngineersForProject, setSiteEngineersForProject] = useState<Array<{
    user_id: number;
    full_name: string;
    email: string;
  }>>([]);
  const [loadingSiteEngineers, setLoadingSiteEngineers] = useState(false);
  // Send for TD Approval state
  const [sendingForApprovalId, setSendingForApprovalId] = useState<number | null>(null);
  const [sentApprovalIds, setSentApprovalIds] = useState<Set<number>>(new Set());

  // ✅ PERFORMANCE: Add pagination state - separate for each tab and sub-tab
  // Main tab pages (for server-side pagination)
  const [pendingPage, setPendingPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);

  // Sub-tab pages for client-side pagination (each sub-tab has its own page state)
  // Ongoing tab sub-tabs
  const [ongoingPendingPurchasePage, setOngoingPendingPurchasePage] = useState(1);
  const [ongoingStoreApprovedPage, setOngoingStoreApprovedPage] = useState(1);
  const [ongoingVendorApprovedPage, setOngoingVendorApprovedPage] = useState(1);
  // Pending Approval tab sub-tabs
  const [pendingApprovalStoreRequestsPage, setPendingApprovalStoreRequestsPage] = useState(1);
  const [pendingApprovalVendorApprovalPage, setPendingApprovalVendorApprovalPage] = useState(1);

  const perPage = PAGINATION.DEFAULT_PAGE_SIZE; // Items per page

  // ✅ OPTIMIZED: Fetch pending purchases - Real-time updates via Supabase (NO POLLING)
  // IMPORTANT: Fetch ALL pending data (no server pagination) because we filter client-side for sub-tabs
  // Each sub-tab (pending_purchase, store_approved, vendor_approved) filters from this data
  const { data: pendingData, isLoading: isPendingLoading, refetch: refetchPending } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-pending-purchases'],
    fetchFn: () => buyerService.getPendingPurchases(1, 1000), // Fetch all (up to 1000)
    realtimeTables: [...REALTIME_TABLES.PURCHASES_FULL],
    staleTime: STALE_TIMES.STANDARD, // 30s - real-time subscriptions handle instant updates
  });

  // ✅ OPTIMIZED: Fetch completed purchases - Real-time updates via Supabase (NO POLLING)
  // IMPORTANT: Fetch ALL completed data because we display both parent CRs AND POChildren
  // Server pagination only tracks parent CRs, so we use client-side pagination for the combined list
  const { data: completedData, isLoading: isCompletedLoading, refetch: refetchCompleted } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-completed-purchases'],
    fetchFn: () => buyerService.getCompletedPurchases(1, 1000), // Fetch all (up to 1000)
    realtimeTables: [...REALTIME_TABLES.PURCHASES],
    staleTime: STALE_TIMES.STANDARD, // 30s - real-time subscriptions handle instant updates
  });

  // ✅ OPTIMIZED: Fetch rejected purchases - Real-time updates via Supabase
  // IMPORTANT: Fetch ALL rejected data because we display both parent CRs AND td_rejected_po_children
  // Server pagination only tracks parent CRs, so we use client-side pagination for the combined list
  const { data: rejectedData, isLoading: isRejectedLoading, refetch: refetchRejected } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-rejected-purchases'],
    fetchFn: () => buyerService.getRejectedPurchases(1, 1000), // Fetch all (up to 1000)
    realtimeTables: [...REALTIME_TABLES.PURCHASES_FULL],
    staleTime: STALE_TIMES.STANDARD, // 30s - real-time subscriptions handle instant updates
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
    staleTime: STALE_TIMES.STANDARD, // 30s - real-time subscriptions handle instant updates
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
    staleTime: STALE_TIMES.STANDARD, // 30s - real-time subscriptions handle instant updates
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
    // POs with all_store_requests_approved should be in Ongoing > Store Approved tab
    // Rejected items should only show in Rejected tab
    // FIX: Keep parent CR in Ongoing when it has PARTIAL store routing (remaining materials need vendor selection)
    // Only move to Pending Approval when ALL materials are sent to store
    return pendingPurchases.filter(p =>
      !p.vendor_id &&
      !p.vendor_selection_pending_td_approval &&
      !p.rejection_type &&
      // Only exclude if ALL materials are sent to store (no remaining materials for vendor)
      !(p.store_requests_pending && (p.store_requested_materials?.length || 0) >= (p.materials_count || 0)) &&
      !p.all_store_requests_approved &&  // Items with approved store requests go to Store Approved
      !p.all_store_requests_rejected  // Items with ALL store requests rejected go to Rejected tab
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

  // Split approved POChildren by routing type
  // Vendor-routed → "Ongoing > Vendor Approved" tab
  const vendorApprovedPOChildren = useMemo(() => {
    return approvedPOChildren.filter(pc => pc.routing_type !== 'store');
  }, [approvedPOChildren]);

  // Store-routed → "Pending Approval > Sent to Store" tab (not Ongoing > Store Approved)
  // Exclude store-rejected POChildren (they go to Rejected tab)
  const storePOChildren = useMemo(() => {
    return approvedPOChildren.filter(pc =>
      pc.routing_type === 'store' &&
      pc.status !== 'store_rejected' &&
      pc.vendor_selection_status !== 'store_rejected'
    );
  }, [approvedPOChildren]);

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

  // Filter pending POChildren to vendor-only (defensive: exclude any store ones that shouldn't be here)
  const vendorPendingPOChildren = useMemo(() => {
    return pendingPOChildren.filter(pc => pc.routing_type !== 'store');
  }, [pendingPOChildren]);

  // Pending Approval tab: Show sub-POs as SEPARATE cards (not grouped under parent)
  // Also includes items sent to store pending PM approval
  const pendingApprovalPurchases = useMemo(() => {
    // Filter from RAW data (not grouped) to show sub-POs as individual cards
    // Include: vendor_selection_pending_td_approval OR store_requests_pending (only when ALL materials are store-routed)
    // Exclude rejected items
    // FIX: Don't include parent CRs with partial store routing - they stay in "Ongoing > Pending Purchase"
    // Only include in Pending Approval when ALL materials are sent to store (no remaining materials for vendor)
    return rawPendingPurchases.filter(p => {
      if (p.rejection_type) return false;
      if (p.vendor_selection_pending_td_approval) return true;
      // For store requests: only include if ALL materials are store-routed
      if (p.store_requests_pending) {
        const storeCount = p.store_requested_materials?.length || 0;
        const totalCount = p.materials_count || 0;
        return storeCount >= totalCount; // All materials sent to store
      }
      return false;
    });
  }, [rawPendingPurchases]);

  // Separate store requests from vendor pending approval for sub-tabs
  const storeRequestsPending = useMemo(() => {
    // FIX: Only include parent CRs where ALL materials are store-routed
    // For partial routing, only the store POChild should appear in "Sent to Store"
    return rawPendingPurchases.filter(p => {
      if (!p.store_requests_pending || p.rejection_type) return false;
      const storeCount = p.store_requested_materials?.length || 0;
      const totalCount = p.materials_count || 0;
      return storeCount >= totalCount; // All materials sent to store
    });
  }, [rawPendingPurchases]);

  const vendorPendingApproval = useMemo(() => {
    return rawPendingPurchases.filter(p => p.vendor_selection_pending_td_approval && !p.rejection_type);
  }, [rawPendingPurchases]);

  // Determine which purchases to show based on active tab and sub-tab
  const currentPurchases = useMemo(() => {
    let items: Array<Purchase | POChild> = [];

    if (activeTab === 'ongoing') {
      if (ongoingSubTab === 'pending_purchase') items = pendingPurchaseItems;
      else if (ongoingSubTab === 'store_approved') items = storeApprovedItems; // Parent CRs only (PM approved)
      else items = vendorApprovedItems;
    } else if (activeTab === 'pending_approval') {
      if (pendingApprovalSubTab === 'vendor_approval') {
        // Vendor Pending TD: Only vendor POChildren + parent CRs without POChildren
        const parentIdsWithPOChildren = new Set(
          vendorPendingPOChildren.map(child => child.parent_cr_id).filter(Boolean)
        );
        const parentsWithoutChildren = vendorPendingApproval.filter(
          p => !parentIdsWithPOChildren.has(p.cr_id)
        );
        items = [...parentsWithoutChildren, ...vendorPendingPOChildren];
      } else {
        // Sent to Store: Store POChildren + parent CRs with store_requests_pending (dedup)
        const parentIdsWithStorePOChildren = new Set(
          storePOChildren.map(child => child.parent_cr_id).filter(Boolean)
        );
        // Only include parent CRs that DON'T have store POChildren (avoid duplicates)
        const storeParentsWithoutChildren = storeRequestsPending.filter(
          p => !parentIdsWithStorePOChildren.has(p.cr_id)
        );
        items = [...storeParentsWithoutChildren, ...storePOChildren];
      }
    } else if (activeTab === 'rejected') {
      items = [...rejectedPurchases, ...tdRejectedPOChildren];
    } else if (activeTab === 'completed') {
      items = [...completedPurchases, ...completedPOChildren];
    } else {
      items = completedPurchases;
    }

    // Deduplicate items based on unique identifier
    const seen = new Set<string>();
    return items.filter(item => {
      const key = isPOChild(item)
        ? `poChild-${getPOChildId(item)}`
        : `purchase-${item.cr_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeTab, ongoingSubTab, pendingApprovalSubTab, pendingPurchaseItems, storeApprovedItems, vendorApprovedItems, storeRequestsPending, vendorPendingApproval, vendorPendingPOChildren, storePOChildren, completedPurchases, completedPOChildren, rejectedPurchases, tdRejectedPOChildren]);

  const filteredPurchases = useMemo(() => {
    return currentPurchases
      .filter(item => {
        if (!searchTerm) return true;

        const searchLower = searchTerm.toLowerCase().trim();

        // Handle POChild items differently
        if (isPOChild(item)) {
          const poIdString = `po-${getPOChildId(item)}`;
          const formattedId = (item.formatted_id || '').toLowerCase();
          return (item.project_name || item.item_name || '').toLowerCase().includes(searchLower) ||
            (item.vendor_name || '').toLowerCase().includes(searchLower) ||
            (item.client || '').toLowerCase().includes(searchLower) ||
            item.project_code?.toLowerCase().includes(searchLower) ||
            poIdString.includes(searchLower) ||
            formattedId.includes(searchLower) ||
            getPOChildId(item)?.toString().includes(searchTerm.trim());
        }

        // Handle Purchase items
        const crIdString = `cr-${item.cr_id}`;
        const poIdString = `po-${item.cr_id}`;
        return item.project_name?.toLowerCase().includes(searchLower) ||
          item.client?.toLowerCase().includes(searchLower) ||
          item.item_name?.toLowerCase().includes(searchLower) ||
          item.project_code?.toLowerCase().includes(searchLower) ||
          crIdString.includes(searchLower) ||
          poIdString.includes(searchLower) ||
          item.cr_id?.toString().includes(searchTerm.trim());
      })
      .sort((a, b) => {
        // Sort by updated_at (fallback to created_at) in descending order — recently updated POs show first
        const updatedA = (a as any).updated_at;
        const updatedB = (b as any).updated_at;
        const dateA = updatedA ? new Date(updatedA).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const dateB = updatedB ? new Date(updatedB).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return dateB - dateA;
      });
  }, [currentPurchases, searchTerm]);

  // Merged and sorted array for vendor_approved tab - combines parent purchases and PO children in mixed order by date
  const mergedVendorApprovedItems = useMemo(() => {
    if (activeTab !== 'ongoing' || ongoingSubTab !== 'vendor_approved') {
      return [];
    }

    // Filter vendor-approved PO children by search term (store POChildren go to Store Approved tab)
    const searchLower = searchTerm.toLowerCase().trim();
    const filteredPOChildren = vendorApprovedPOChildren.filter(poChild => {
      const poIdString = `po-${getPOChildId(poChild)}`;
      const formattedId = (poChild.formatted_id || '').toLowerCase();
      return !searchTerm ||
        (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
        (poChild.vendor_name || '').toLowerCase().includes(searchLower) ||
        poChild.project_code?.toLowerCase().includes(searchLower) ||
        poIdString.includes(searchLower) ||
        formattedId.includes(searchLower) ||
        getPOChildId(poChild)?.toString().includes(searchTerm.trim());
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

    // Sort by updated_at (fallback to created_at) in descending order — recently updated POs show first
    const sorted = combined.sort((a, b) => {
      const updatedA = (a as any).updated_at;
      const updatedB = (b as any).updated_at;
      const dateA = updatedA ? new Date(updatedA).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
      const dateB = updatedB ? new Date(updatedB).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
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
  }, [activeTab, ongoingSubTab, filteredPurchases, vendorApprovedPOChildren, searchTerm]);

  // Get current page for the active sub-tab (client-side pagination for sub-tabs, server-side for main tabs)
  const currentSubTabPage = useMemo(() => {
    if (activeTab === 'ongoing') {
      if (ongoingSubTab === 'pending_purchase') return ongoingPendingPurchasePage;
      if (ongoingSubTab === 'store_approved') return ongoingStoreApprovedPage;
      if (ongoingSubTab === 'vendor_approved') return ongoingVendorApprovedPage;
    } else if (activeTab === 'pending_approval') {
      if (pendingApprovalSubTab === 'store_requests') return pendingApprovalStoreRequestsPage;
      if (pendingApprovalSubTab === 'vendor_approval') return pendingApprovalVendorApprovalPage;
    } else if (activeTab === 'completed') {
      return completedPage;
    } else if (activeTab === 'rejected') {
      return rejectedPage;
    }
    return 1;
  }, [activeTab, ongoingSubTab, pendingApprovalSubTab, ongoingPendingPurchasePage, ongoingStoreApprovedPage, ongoingVendorApprovedPage, pendingApprovalStoreRequestsPage, pendingApprovalVendorApprovalPage, completedPage, rejectedPage]);

  // Paginate the items for display
  // - Tabs with sub-tabs (ongoing, pending_approval): Use client-side pagination
  // Paginate the items for display - ALL tabs use client-side pagination
  const paginatedItems = useMemo(() => {
    const itemsPerPage = PAGINATION.DEFAULT_PAGE_SIZE;

    // Determine which items to use based on active tab and subtab
    let items: Array<Purchase | POChild>;

    if (activeTab === 'ongoing') {
      // Client-side pagination - server returns ALL data, we filter and paginate
      if (ongoingSubTab === 'vendor_approved') {
        items = mergedVendorApprovedItems;
      } else {
        items = filteredPurchases;
      }
    } else if (activeTab === 'pending_approval') {
      // Client-side pagination - server returns ALL data, we filter and paginate
      items = filteredPurchases;
    } else if (activeTab === 'completed' || activeTab === 'rejected') {
      // Client-side pagination - server returns ALL data (both parent CRs + POChildren)
      items = filteredPurchases;
    } else {
      items = filteredPurchases;
    }

    // ALL tabs use client-side pagination now
    const startIndex = (currentSubTabPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return items.slice(startIndex, endIndex);
  }, [activeTab, ongoingSubTab, pendingApprovalSubTab, mergedVendorApprovedItems, filteredPurchases, currentSubTabPage]);

  // Calculate the actual vendor pending count (vendor-only POChildren, no store)
  const vendorPendingActualCount = useMemo(() => {
    // Must match currentPurchases logic for vendor_approval subtab
    const parentIdsWithPOChildren = new Set(
      vendorPendingPOChildren.map(child => child.parent_cr_id).filter(Boolean)
    );
    const parentsWithoutChildren = vendorPendingApproval.filter(
      p => !parentIdsWithPOChildren.has(p.cr_id)
    );

    const items = [...parentsWithoutChildren, ...vendorPendingPOChildren];
    const seen = new Set<string>();
    return items.filter(item => {
      const key = isPOChild(item)
        ? `poChild-${getPOChildId(item)}`
        : `purchase-${(item as Purchase).cr_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }, [vendorPendingApproval, vendorPendingPOChildren]);

  // Calculate store requests count (parent CRs + store POChildren, deduped)
  const storeRequestsActualCount = useMemo(() => {
    const parentIdsWithStorePOChildren = new Set(
      storePOChildren.map(child => child.parent_cr_id).filter(Boolean)
    );
    const storeParentsWithoutChildren = storeRequestsPending.filter(
      p => !parentIdsWithStorePOChildren.has(p.cr_id)
    );
    return storeParentsWithoutChildren.length + storePOChildren.length;
  }, [storeRequestsPending, storePOChildren]);

  const stats = useMemo(() => {
    // For completed/rejected tabs: Server pagination only counts parent CRs, not POChildren
    // We need to add BOTH parent CRs + POChildren for accurate count
    // Use the counts from the response data which include both
    const completedPOChildrenCount = completedData?.completed_po_children_count ?? completedPOChildren.length;
    const completedPurchasesCount = completedData?.completed_purchases_count ?? completedPurchases.length;
    const completedTotal = completedPurchasesCount + completedPOChildrenCount;

    const rejectedPOChildrenCount = rejectedData?.td_rejected_po_children?.length ?? tdRejectedPOChildren.length;
    const rejectedPurchasesCount = rejectedData?.rejected_purchases?.length ?? rejectedPurchases.length;
    const rejectedTotal = rejectedPurchasesCount + rejectedPOChildrenCount;

    return {
      ongoing: pendingPurchaseItems.length + storeApprovedItems.length + vendorApprovedItems.length + vendorApprovedPOChildren.length,
      pendingPurchase: pendingPurchaseItems.length,
      storeApproved: storeApprovedItems.length,
      vendorApproved: vendorApprovedItems.length + vendorApprovedPOChildren.length,
      pendingApproval: storeRequestsActualCount + vendorPendingActualCount,
      storeRequestsPending: storeRequestsActualCount,
      vendorPendingApproval: vendorPendingActualCount,
      completed: completedTotal,
      rejected: rejectedTotal
    };
  }, [pendingPurchaseItems, storeApprovedItems, vendorApprovedItems, vendorApprovedPOChildren, vendorPendingActualCount, storeRequestsActualCount, completedPurchases, completedPOChildren, rejectedPurchases, tdRejectedPOChildren, completedData, rejectedData]);

  // Initialize tab from URL query parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const subtabParam = params.get('subtab');

    if (tabParam) {
      // Map URL tab parameter to valid tab values
      if (tabParam === 'ongoing' || tabParam === 'pending_approval' || tabParam === 'completed' || tabParam === 'rejected') {
        setActiveTab(tabParam);

        // Handle sub-tab parameter
        if (tabParam === 'ongoing' && subtabParam) {
          if (subtabParam === 'pending_purchase' || subtabParam === 'store_approved' || subtabParam === 'vendor_approved') {
            setOngoingSubTab(subtabParam);
          }
        } else if (tabParam === 'pending_approval' && subtabParam) {
          if (subtabParam === 'store_requests' || subtabParam === 'vendor_approval') {
            setPendingApprovalSubTab(subtabParam);
          }
        }
      } else if (tabParam === 'approved') {
        // Handle "approved" from old notifications - show completed tab
        setActiveTab('completed');
      } else if (tabParam === 'pending') {
        // Handle "pending" from notifications - show pending_approval tab
        setActiveTab('pending_approval');
      }
    }
  }, [location.search]); // Run whenever URL parameters change

  // Reset ALL sub-tab pages when search term changes
  // This ensures search results start from page 1
  useEffect(() => {
    // Server-side pagination pages
    setPendingPage(1);
    setCompletedPage(1);
    setRejectedPage(1);
    // Client-side sub-tab pagination pages
    setOngoingPendingPurchasePage(1);
    setOngoingStoreApprovedPage(1);
    setOngoingVendorApprovedPage(1);
    setPendingApprovalStoreRequestsPage(1);
    setPendingApprovalVendorApprovalPage(1);
  }, [searchTerm]);

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

  // Open modal with WhatsApp preview (instead of directly sending)
  const handleOpenWhatsAppPreview = (purchase: Purchase) => {
    if (!purchase.vendor_phone) {
      showError('Vendor phone number not available');
      return;
    }
    setSelectedPurchase(purchase);
    setOpenWithWhatsAppPreview(true);
    setIsVendorEmailModalOpen(true);
  };

  // Open modal with WhatsApp preview for POChild (convert POChild to Purchase-like object)
  const handleOpenPOChildWhatsAppPreview = (poChild: POChild) => {
    if (!poChild.vendor_phone) {
      showError('Vendor phone number not available');
      return;
    }
    // Convert POChild to Purchase-like object (same as email button does)
    const purchaseLike = {
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
      po_child_id: getPOChildId(poChild),
      child_notes: (poChild as any).child_notes || '',
    } as any;
    setSelectedPurchase(purchaseLike);
    setOpenWithWhatsAppPreview(true);
    setIsVendorEmailModalOpen(true);
  };

  const handleMarkAsComplete = async (crId: number) => {
    try {
      setCompletingPurchaseId(crId);
      await buyerService.completePurchase({ cr_id: crId });

      showSuccess('Purchase marked as complete successfully!');

      try {
        // ✅ FIX: Use invalidateQueries instead of removeQueries for immediate refresh
        // invalidateQueries marks data as stale and triggers refetch with fresh data
        await Promise.all([
          invalidateQueries(['purchases']),
          invalidateQueries(['pending-purchases']),
          invalidateQueries(['buyer-pending-purchases']),
          invalidateQueries(['buyer-completed-purchases']),
          invalidateQueries(['buyer-approved-po-children']),
          invalidateQueries(['change-requests']),
          invalidateQueries(['dashboard'])
        ]);

        // ✅ FIX: Wait for all refetches to complete in parallel before tab switch
        await Promise.all([
          refetchPending(),
          refetchCompleted(),
          refetchApprovedPOChildren()
        ]);
      } catch (cacheError) {
        // Log error but don't fail the operation (backend succeeded)
        console.error('Failed to refresh cache after purchase completion:', cacheError);
        // Show warning but still proceed with tab switch
        showWarning('Purchase completed but display may not be fully updated. Please refresh if needed.');
      }

      // Switch to completed tab (even if cache refresh partially failed)
      setActiveTab('completed');
    } catch (error: any) {
      showError(error.message || 'Failed to complete purchase');
    } finally {
      setCompletingPurchaseId(null);
    }
  };

  // Helper function for POChild completion with proper cache invalidation
  const handlePOChildComplete = async (poChildId: number, notes: string = '', recipient: string = '') => {
    try {
      setCompletingPurchaseId(poChildId);

      // Optional: Check M2 Store availability before completing purchase
      // This is non-blocking - we'll show a warning but still allow completion
      try {
        const poChild = approvedPOChildren?.find((p: any) => p.id === poChildId);
        if (poChild && poChild.materials_data) {
          // Format materials for availability check
          const materials = poChild.materials_data.map((m: any) => ({
            material_name: m.material_name || m.sub_item_name || '',
            brand: m.brand || '',
            size: m.size || '',
            quantity: m.quantity || 0
          }));

          // Check availability (non-critical, doesn't block completion)
          const availability = await buyerService.checkMaterialAvailability(materials);

          if (!availability.overall_available && availability.unavailable_count > 0) {
            console.warn(`⚠️ M2 Store Availability: ${availability.unavailable_count} material(s) have insufficient stock`);
            // You can show a toast/alert here if needed
            // showWarning(`Note: ${availability.unavailable_count} material(s) have low stock in M2 Store. Production Manager will handle procurement.`);
          }
        }
      } catch (availError) {
        // Availability check failed (non-critical) - continue with purchase
        console.warn('Material availability check failed (non-critical):', availError);
      }

      // Complete purchase (routes to M2 Store automatically)
      await buyerService.completePOChildPurchase(poChildId, notes, recipient);

      showSuccess('Purchase completed and routed to M2 Store! Production Manager will dispatch to site.');

      try {
        // ✅ FIX: Use invalidateQueries instead of removeQueries for immediate refresh
        await Promise.all([
          invalidateQueries(['purchases']),
          invalidateQueries(['pending-purchases']),
          invalidateQueries(['buyer-pending-purchases']),
          invalidateQueries(['buyer-completed-purchases']),
          invalidateQueries(['buyer-approved-po-children']),
          invalidateQueries(['buyer-pending-po-children']),
          invalidateQueries(['change-requests']),
          invalidateQueries(['dashboard'])
        ]);

        // ✅ FIX: Wait for all refetches to complete in parallel
        await Promise.all([
          refetchPending(),
          refetchCompleted(),
          refetchApprovedPOChildren()
        ]);
      } catch (cacheError) {
        // Log error but don't fail the operation (backend succeeded)
        console.error('Failed to refresh cache after POChild completion:', cacheError);
        // Show warning but still proceed
        showWarning('Purchase completed but display may not be fully updated. Please refresh if needed.');
      }

      // Switch to vendor_approved subtab to show the change
      setOngoingSubTab('vendor_approved');

      return true;
    } catch (error: any) {
      showError(error.message || 'Failed to complete purchase');
      return false;
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
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 pb-4 sm:pb-8">
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
          {(activeTab === 'ongoing' && ongoingSubTab === 'vendor_approved'
            ? mergedVendorApprovedItems.length === 0
            : filteredPurchases.length === 0) ? (
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
              {/* Display paginated items for current tab/subtab */}
              {paginatedItems.map((item) => {
                // Check if this is a POChild or Purchase
                if (isPOChild(item)) {
                  // Render POChild card
                  const poChild = item;

                  // Determine colors based on status
                  const isPending = poChild.vendor_selection_status === 'pending_td_approval';
                  const isApproved = poChild.vendor_selection_status === 'approved';
                  const isStoreRouted = poChild.routing_type === 'store' && (poChild.status === 'sent_to_store' || poChild.status === 'routed_to_store');
                  // sent_to_store = still pending PM approval (NOT completed)
                  // routed_to_store = buyer completed purchase, vendor delivering to store (completed)
                  const isCompleted = poChild.status === 'routed_to_store' || poChild.status === 'purchase_completed' || poChild.status === 'completed';
                  // CRITICAL: Don't show as rejected if already completed (PM may have rejected then later approved)
                  const isRejected = !isCompleted && (poChild.vendor_selection_status === 'rejected' || poChild.vendor_selection_status === 'td_rejected' || poChild.vendor_selection_status === 'store_rejected');
                  const isStoreRejected = !isCompleted && (poChild.vendor_selection_status === 'store_rejected' || poChild.status === 'store_rejected');

                  // Store-routed items use purple styling, not the vendor-approval color logic
                  const borderColor = isCompleted ? 'border-green-300' : isStoreRejected ? 'border-red-300' : isStoreRouted ? 'border-purple-300' : isPending ? 'border-amber-300' : isApproved ? 'border-green-300' : isRejected ? 'border-red-300' : 'border-blue-300';
                  const headerBg = isCompleted ? 'from-green-50 to-green-100' : isStoreRejected ? 'from-red-50 to-red-100' : isStoreRouted ? 'from-purple-50 to-purple-100' : isPending ? 'from-amber-50 to-amber-100' : isApproved ? 'from-green-50 to-green-100' : isRejected ? 'from-red-50 to-red-100' : 'from-blue-50 to-blue-100';
                  const headerBorder = isCompleted ? 'border-green-200' : isStoreRejected ? 'border-red-200' : isStoreRouted ? 'border-purple-200' : isPending ? 'border-amber-200' : isApproved ? 'border-green-200' : isRejected ? 'border-red-200' : 'border-blue-200';

                  return (
                    <motion.div
                      key={`po-child-${getPOChildId(poChild)}`}
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

                      {/* ✅ NEW: Routing Type Badge */}
                      {poChild.routing_type && (
                        <div className={`px-4 py-2 border-b ${
                          poChild.routing_type === 'store' ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'
                        }`}>
                          <div className="flex items-center gap-2">
                            {poChild.routing_type === 'store' ? (
                              <>
                                <Store className="w-4 h-4 text-blue-600" />
                                <span className="text-xs font-semibold text-blue-900">Store Routing</span>
                                <Badge className="bg-blue-100 text-blue-800 text-[10px]">
                                  Via M2 Store → PM Dispatch
                                </Badge>
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-4 h-4 text-purple-600" />
                                <span className="text-xs font-semibold text-purple-900">Vendor Routing</span>
                                <Badge className="bg-purple-100 text-purple-800 text-[10px]">
                                  Requires TD Approval
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Vendor Info Banner */}
                      <div className={`px-4 py-2 border-b ${
                        isCompleted ? 'bg-green-50 border-green-200' : isStoreRejected ? 'bg-red-50 border-red-200' : isStoreRouted ? 'bg-purple-50 border-purple-200' : isPending ? 'bg-amber-50 border-amber-200' : isApproved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Store className={`w-4 h-4 ${isCompleted ? 'text-green-600' : isStoreRejected ? 'text-red-600' : isStoreRouted ? 'text-purple-600' : isPending ? 'text-amber-600' : isApproved ? 'text-green-600' : 'text-red-600'}`} />
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-medium ${isCompleted ? 'text-green-600' : isStoreRejected ? 'text-red-600' : isStoreRouted ? 'text-purple-600' : isPending ? 'text-amber-600' : isApproved ? 'text-green-600' : 'text-red-600'}`}>
                              {poChild.routing_type === 'store' ? 'Destination' : 'Selected Vendor'}
                            </div>
                            <div className={`text-sm font-bold truncate ${isCompleted ? 'text-green-900' : isStoreRejected ? 'text-red-900' : isStoreRouted ? 'text-purple-900' : isPending ? 'text-amber-900' : isApproved ? 'text-green-900' : 'text-red-900'}`}>
                              {poChild.vendor_name || (poChild.routing_type === 'store' ? 'M2 Store' : 'No Vendor')}
                            </div>
                          </div>
                          <Badge className={`text-[10px] ${
                            isCompleted ? 'bg-green-100 text-green-800' : isStoreRejected ? 'bg-red-100 text-red-800' : isStoreRouted ? 'bg-purple-100 text-purple-800' : isPending ? 'bg-amber-100 text-amber-800' : isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {isCompleted ? 'Completed' : isStoreRejected ? 'Rejected by PM' : isStoreRouted ? 'Sent to Store' : isPending ? 'Awaiting TD' : isApproved ? 'TD Approved' : 'Rejected'}
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
                            <span className="text-sm font-bold text-green-700">{formatCurrency(poChild.materials_total_cost || (poChild as any).total_cost || 0)}</span>
                          </div>

                          {/* Supplier Notes */}
                          {poChild.supplier_notes && (
                            <div className="pt-2 border-t border-gray-100">
                              <div className="text-xs text-gray-500 mb-1">Supplier Notes</div>
                              <div className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded p-2 italic line-clamp-2">
                                "{poChild.supplier_notes}"
                              </div>
                            </div>
                          )}
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
                        {isApproved && !isCompleted && (
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
                        {isStoreRouted && !isCompleted && (
                          <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-3">
                            <div className="flex items-center gap-2">
                              <Store className="w-4 h-4 text-purple-600" />
                              <div>
                                <div className="text-xs font-semibold text-purple-900">Sent to Store</div>
                                <div className="text-[10px] text-purple-600">Awaiting PM approval</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {isCompleted && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-blue-600" />
                              <div>
                                <div className="text-xs font-semibold text-blue-900">Purchase Completed</div>
                                <div className="text-[10px] text-blue-600">Routed to M2 Store</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {isRejected && (
                          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                            <div className="flex items-center gap-2">
                              <XCircleIcon className="w-4 h-4 text-red-600" />
                              <div>
                                <div className="text-xs font-semibold text-red-900">
                                  {isStoreRejected ? 'Store Request Rejected by PM' : 'Rejected by TD'}
                                </div>
                                <div className="text-[10px] text-red-600">
                                  {poChild.rejection_reason || (isStoreRejected ? 'Store material request was rejected' : 'Please select a different vendor')}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-1.5 mt-auto">
                          {/* Send for TD Approval button for pending vendor-routed PO children */}
                          {/* Show button only if NOT already sent (check vendor_selection_date from backend OR in-memory sentApprovalIds) */}
                          {isPending && poChild.routing_type === 'vendor' && !poChild.vendor_selection_date && !sentApprovalIds.has(getPOChildId(poChild)) && (
                            <Button
                              onClick={async () => {
                                const poId = getPOChildId(poChild);
                                try {
                                  setSendingForApprovalId(poId);
                                  const response = await buyerService.sendForTDApproval(
                                    poChild.parent_cr_id,
                                    [poId]
                                  );
                                  showSuccess(response.message || 'Sent for TD approval!');
                                  setSentApprovalIds(prev => new Set([...prev, poId]));
                                  await refetchPendingPOChildren();
                                } catch (error: any) {
                                  showError(error.message || 'Failed to send for approval');
                                } finally {
                                  setSendingForApprovalId(null);
                                }
                              }}
                              disabled={sendingForApprovalId === getPOChildId(poChild)}
                              className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs"
                              size="sm"
                            >
                              {sendingForApprovalId === getPOChildId(poChild) ? (
                                <>Sending...</>
                              ) : (
                                <>
                                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                                  Send for TD Approval
                                </>
                              )}
                            </Button>
                          )}
                          {isPending && poChild.routing_type === 'vendor' && (poChild.vendor_selection_date || sentApprovalIds.has(getPOChildId(poChild))) && (
                            <div className="w-full h-7 bg-amber-50 border border-amber-200 rounded flex items-center justify-center text-xs font-medium text-amber-700 px-2 py-1">
                              <Check className="w-3 h-3 mr-1" />
                              Sent to TD
                            </div>
                          )}

                          {/* Select New Vendor for TD-Rejected POChildren (not store rejections) */}
                          {isRejected && !isStoreRejected && (
                            <>
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
                                    materials_count: poChild.materials_count || poChild.materials?.length || 0,
                                    total_cost: poChild.materials_total_cost || 0,
                                    approved_by: 0,
                                    approved_at: null,
                                    created_at: poChild.created_at || '',
                                    status: 'pending',
                                    po_child_id: getPOChildId(poChild),
                                    child_notes: (poChild as any).child_notes || '',
                                  } as any;
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
                                    ...poChild,
                                    cr_id: poChild.parent_cr_id,
                                    vendor_id: poChild.vendor_id || 0,
                                    status: 'rejected',
                                  } as any;
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
                            </>
                          )}

                          {/* Store-rejected POChildren - show details + select vendor option */}
                          {isStoreRejected && (
                            <>
                              <Button
                                onClick={() => {
                                  const purchaseLike: Purchase = {
                                    ...poChild,
                                    cr_id: poChild.parent_cr_id,
                                    vendor_id: 0,
                                    status: 'rejected',
                                  } as any;
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
                                    materials_count: poChild.materials_count || poChild.materials?.length || 0,
                                    total_cost: poChild.materials_total_cost || 0,
                                    approved_by: 0,
                                    approved_at: null,
                                    created_at: poChild.created_at || '',
                                    status: 'pending',
                                    po_child_id: getPOChildId(poChild),
                                    child_notes: (poChild as any).child_notes || '',
                                  } as any;
                                  setSelectedPurchase(purchaseLike);
                                  setIsVendorSelectionModalOpen(true);
                                }}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs"
                                size="sm"
                              >
                                <Store className="w-3.5 h-3.5 mr-1.5" />
                                Select Vendor Instead
                              </Button>
                            </>
                          )}

                          {/* Show buttons ONLY when TD approved AND not completed */}
                          {isApproved && !isCompleted && (
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
                                      // If project has a project_id, fetch site engineers first
                                      if (poChild.project_id) {
                                        try {
                                          setSelectedPOChildForCompletion(poChild);
                                          setLoadingSiteEngineers(true);
                                          setIsSiteEngineerModalOpen(true);

                                          const result = await buyerService.getProjectSiteEngineers(poChild.project_id);
                                          setSiteEngineersForProject(result.site_engineers || []);
                                        } catch (error: any) {
                                          showError(error.message || 'Failed to fetch site engineers');
                                          setIsSiteEngineerModalOpen(false);
                                        } finally {
                                          setLoadingSiteEngineers(false);
                                        }
                                      } else {
                                        // No project_id, complete directly with proper cache invalidation
                                        await handlePOChildComplete(getPOChildId(poChild));
                                      }
                                    }}
                                    disabled={completingPurchaseId === getPOChildId(poChild)}
                                    variant="default"
                                    size="sm"
                                    className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                                    title="Materials will go to M2 Store first, then Production Manager will dispatch to site"
                                  >
                                    {completingPurchaseId === getPOChildId(poChild) ? (
                                      <>
                                        <ModernLoadingSpinners size="xxs" />
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
                                        po_child_id: getPOChildId(poChild),
                                        child_notes: (poChild as any).child_notes || '',
                                      } as any;
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
                                      <Button
                                        onClick={() => handleOpenPOChildWhatsAppPreview(poChild)}
                                        className="flex-1 bg-green-50 hover:bg-green-100 text-green-600 border border-green-300 text-xs"
                                        size="sm"
                                        title={`WhatsApp sent${poChild.vendor_whatsapp_sent_at ? ` on ${new Date(poChild.vendor_whatsapp_sent_at).toLocaleDateString()}` : ''} - Click to resend`}
                                      >
                                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                        Sent
                                      </Button>
                                    ) : (
                                      <Button
                                        onClick={() => handleOpenPOChildWhatsAppPreview(poChild)}
                                        className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs"
                                        size="sm"
                                        title="Send via WhatsApp"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5 mr-1" />
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

                          {/* View Details - Show only when not already rendered by rejected sections above */}
                          {!isRejected && <Button
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
                                po_child_id: getPOChildId(poChild),
                                child_notes: (poChild as any).child_notes || '',
                              } as any;
                              handleViewDetails(purchaseLike);
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-xs border-gray-300 hover:bg-gray-50 px-2 py-1"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View Details
                          </Button>}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Render Purchase card
                const purchase = item as Purchase;
                const isCompletedCR = ['purchase_completed', 'routed_to_store', 'completed'].includes(purchase.status || '');
                // Don't show as rejected if already completed (PM may have rejected then later approved)
                const isStoreRejectedCR = !isCompletedCR && (purchase.rejection_type === 'store_rejection' || purchase.store_request_status === 'store_rejected');
                const isRejectedCR = !isCompletedCR && (purchase.status === 'rejected' || isStoreRejectedCR);
                return (
                <motion.div
                  key={purchase.cr_id}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col ${
                    purchase.status === 'completed'
                      ? 'border-green-200'
                      : isRejectedCR
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
                      : isRejectedCR
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
                          : isRejectedCR
                            ? 'bg-red-100 text-red-800'
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

                  {/* Rejection Reason Banner - Show for rejected items (CR rejected, vendor rejected, or store rejected) */}
                  {isRejectedCR && (purchase.rejection_reason || purchase.vendor_rejection_reason) && (
                    <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                      <div className="flex items-start gap-2">
                        <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-red-600 font-medium mb-0.5">
                            {isStoreRejectedCR ? 'Store Request Rejected by PM' : purchase.rejection_type === 'vendor_selection' ? 'Vendor Selection Rejected' : 'Change Request Rejected'}
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
                      {/* POChildren Pending TD Approval Status - Show prominently */}
                      {purchase.po_children && purchase.po_children.length > 0 && purchase.po_children.some((poChild: any) => poChild.vendor_selection_status === 'pending_td_approval') && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <div>
                              <div className="text-xs font-semibold text-amber-900">
                                Vendor Pending TD Approval
                              </div>
                              <div className="text-xs text-amber-700">
                                {purchase.po_children.filter((pc: any) => pc.vendor_selection_status === 'pending_td_approval').length} vendor(s) sent to TD for approval
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

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

                      {/* Store Request Status - Pending Approval (only when ALL materials sent to store) */}
                      {(purchase.status === 'pending' || purchase.status === 'sent_to_store') && purchase.has_store_requests && !purchase.any_store_request_rejected && !purchase.vendor_id && purchase.store_requests_pending && (purchase.store_requested_materials?.length || 0) >= (purchase.materials_count || 0) && (
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
                      {(purchase.status === 'pending' || purchase.status === 'sent_to_store') && purchase.has_store_requests && purchase.all_store_requests_approved && !purchase.vendor_id && (
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
                      {(purchase.status === 'pending' || purchase.status === 'sent_to_store') && purchase.has_store_requests && purchase.any_store_request_rejected && !purchase.vendor_id && (
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
                      {(purchase.status === 'pending' || purchase.status === 'sent_to_store') && purchase.has_store_requests && purchase.store_requested_materials && purchase.store_requested_materials.length > 0 && purchase.store_requested_materials.length < (purchase.materials_count || 0) && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-purple-600" />
                            <div>
                              <div className="text-xs font-semibold text-purple-900">
                                {purchase.store_requested_materials.length} material(s) sent to store
                                {purchase.store_requests_pending && <span className="text-purple-600"> (awaiting PM)</span>}
                                {purchase.all_store_requests_approved && <span className="text-green-600"> (approved)</span>}
                              </div>
                              <div className="text-xs text-purple-700">
                                {(purchase.materials_count || 0) - purchase.store_requested_materials.length} remaining for vendor selection
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
                              <ModernLoadingSpinners size="xxs" />
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
                                onClick={() => handleOpenWhatsAppPreview(purchase)}
                                disabled={sendingWhatsAppId === purchase.cr_id || !purchase.vendor_phone}
                                size="sm"
                                className="flex-1 h-7 text-xs bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 px-2 py-1"
                                title={`Sent via WhatsApp${purchase.vendor_whatsapp_sent_at ? ` on ${new Date(purchase.vendor_whatsapp_sent_at).toLocaleDateString()}` : ''}`}
                              >
                                {sendingWhatsAppId === purchase.cr_id ? (
                                  <ModernLoadingSpinners size="xxs" />
                                ) : (
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                )}
                                Sent
                              </Button>
                            ) : purchase.vendor_phone ? (
                              <Button
                                onClick={() => handleOpenWhatsAppPreview(purchase)}
                                disabled={sendingWhatsAppId === purchase.cr_id}
                                size="sm"
                                className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1"
                                title="Send via WhatsApp"
                              >
                                {sendingWhatsAppId === purchase.cr_id ? (
                                  <ModernLoadingSpinners size="xxs" />
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

                      {/* Rejected Item Actions - Resend only for CR rejections (not vendor selection or store rejection) */}
                      {purchase.status === 'rejected' && purchase.rejection_type !== 'vendor_selection' && purchase.rejection_type !== 'store_rejection' && (
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

                      {/* Select Vendor for Store Rejection - buyer can try purchasing from vendor instead */}
                      {isStoreRejectedCR && (
                        <Button
                          onClick={() => handleSelectVendor(purchase)}
                          size="sm"
                          className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1"
                        >
                          <Store className="w-3 h-3 mr-1" />
                          Select Vendor Instead
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
                              <ModernLoadingSpinners size="xxs" />
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
                            key={`po-child-${getPOChildId(poChild)}`}
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
                    {/* Display paginated items for current tab/subtab */}
                    {paginatedItems.map((item) => {
                      // Skip POChildren in table view for now, or handle them differently
                      if (isPOChild(item)) {
                        // For table view, render POChild rows
                        const poChild = item;
                        return (
                          <motion.tr
                            key={`po-child-${getPOChildId(poChild)}`}
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
                                      po_child_id: getPOChildId(poChild),
                                      child_notes: (poChild as any).child_notes || '',
                                    } as any;
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
                                    // If project has a project_id, fetch site engineers first
                                    if (poChild.project_id) {
                                      try {
                                        setSelectedPOChildForCompletion(poChild);
                                        setLoadingSiteEngineers(true);
                                        setIsSiteEngineerModalOpen(true);

                                        const result = await buyerService.getProjectSiteEngineers(poChild.project_id);
                                        setSiteEngineersForProject(result.site_engineers || []);

                                      } catch (error: any) {
                                        showError(error.message || 'Failed to fetch site engineers');
                                        setIsSiteEngineerModalOpen(false);
                                      } finally {
                                        setLoadingSiteEngineers(false);
                                      }
                                    } else {
                                      // No project_id, complete directly with proper cache invalidation
                                      await handlePOChildComplete(getPOChildId(poChild));
                                    }
                                  }}
                                  disabled={completingPurchaseId === getPOChildId(poChild)}
                                  variant="default"
                                  size="sm"
                                  className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                                >
                                  {completingPurchaseId === getPOChildId(poChild) ? (
                                    <>
                                      <ModernLoadingSpinners size="xxs" />
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
                                  <ModernLoadingSpinners size="xxs" />
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
                                      onClick={() => handleOpenWhatsAppPreview(purchase)}
                                      disabled={sendingWhatsAppId === purchase.cr_id || !purchase.vendor_phone}
                                      size="sm"
                                      className="px-2 py-1 h-auto text-xs bg-green-100 hover:bg-green-200 text-green-700 border border-green-300"
                                      title={`Sent via WhatsApp${purchase.vendor_whatsapp_sent_at ? ` on ${new Date(purchase.vendor_whatsapp_sent_at).toLocaleDateString()}` : ''}`}
                                    >
                                      {sendingWhatsAppId === purchase.cr_id ? (
                                        <ModernLoadingSpinners size="xxs" />
                                      ) : (
                                        <CheckCircle className="w-3 h-3 sm:mr-1" />
                                      )}
                                      <span className="hidden lg:inline">Sent</span>
                                    </Button>
                                  ) : purchase.vendor_phone ? (
                                    <Button
                                      onClick={() => handleOpenWhatsAppPreview(purchase)}
                                      disabled={sendingWhatsAppId === purchase.cr_id}
                                      size="sm"
                                      className="px-2 py-1 h-auto text-xs bg-green-500 hover:bg-green-600 text-white"
                                      title="Send via WhatsApp"
                                    >
                                      {sendingWhatsAppId === purchase.cr_id ? (
                                        <ModernLoadingSpinners size="xxs" />
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
                                  <ModernLoadingSpinners size="xxs" />
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

          {/* ✅ PERFORMANCE: Pagination Controls - All tabs use client-side pagination */}
          {(() => {
            let setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
            let totalFiltered: number;

            // Determine which page setter and total to use based on active tab AND sub-tab
            // ALL tabs now use client-side pagination since we fetch ALL data
            if (activeTab === 'ongoing') {
              if (ongoingSubTab === 'pending_purchase') {
                setCurrentPage = setOngoingPendingPurchasePage;
                totalFiltered = stats.pendingPurchase;
              } else if (ongoingSubTab === 'store_approved') {
                setCurrentPage = setOngoingStoreApprovedPage;
                totalFiltered = stats.storeApproved;
              } else {
                setCurrentPage = setOngoingVendorApprovedPage;
                totalFiltered = mergedVendorApprovedItems.length;
              }
            } else if (activeTab === 'pending_approval') {
              if (pendingApprovalSubTab === 'store_requests') {
                setCurrentPage = setPendingApprovalStoreRequestsPage;
                totalFiltered = stats.storeRequestsPending;
              } else {
                setCurrentPage = setPendingApprovalVendorApprovalPage;
                totalFiltered = stats.vendorPendingApproval;
              }
            } else if (activeTab === 'completed') {
              setCurrentPage = setCompletedPage;
              totalFiltered = stats.completed;
            } else if (activeTab === 'rejected') {
              setCurrentPage = setRejectedPage;
              totalFiltered = stats.rejected;
            } else {
              setCurrentPage = setPendingPage;
              totalFiltered = filteredPurchases.length;
            }

            // All pagination is now client-side
            const currentPage = currentSubTabPage;
            const perPage = PAGINATION.DEFAULT_PAGE_SIZE;
            const totalItems = totalFiltered;
            const totalPages = Math.ceil(totalFiltered / perPage);
            const has_prev = currentSubTabPage > 1;
            const has_next = currentSubTabPage < totalPages;

            // Calculate display range
            const start = totalItems > 0 ? (currentPage - 1) * perPage + 1 : 0;
            const end = Math.min(currentPage * perPage, totalItems);

            // Only show pagination if there are items
            if (totalItems === 0) {
              return (
                <div className="flex items-center justify-center bg-white border-t border-gray-200 rounded-b-lg p-4 mt-6">
                  <div className="text-sm text-gray-500 font-medium">
                    No results found
                  </div>
                </div>
              );
            }

            return (
              <div className="flex items-center justify-between bg-white border-t border-gray-200 rounded-b-lg p-4 mt-6">
                <div className="text-sm text-gray-600 font-medium">
                  Showing {start} to {end} of {totalItems} results
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={!has_prev}
                      className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ color: 'rgb(36, 61, 138)' }}
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={!has_next}
                      className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ color: 'rgb(36, 61, 138)' }}
                    >
                      Next
                    </button>
                  </div>
                )}
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
            removeQueries(['buyer-rejected-purchases']);
            removeQueries(['change-requests']);
            // Small delay to ensure backend has processed the change
            await new Promise(resolve => setTimeout(resolve, 500));
            await Promise.all([
              refetchPending(),
              refetchCompleted(),
              refetchPendingPOChildren(),
              refetchRejected(),
            ]);
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
            removeQueries(['buyer-rejected-purchases']);
            removeQueries(['change-requests']);
            // Small delay to ensure backend has processed the change
            await new Promise(resolve => setTimeout(resolve, 500));

            // Refetch all data including rejected (item may have moved from rejected tab)
            const pendingResult = await refetchPending();
            await Promise.all([
              refetchCompleted(),
              refetchPendingPOChildren(),
              refetchRejected(),
            ]);

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
          onNotesUpdated={async () => {
            try {
              // Optimized: Only refetch the relevant query instead of all queries
              // This provides instant UI update without 3 separate API calls

              // Only clear and refetch the specific purchase lists that might contain this purchase
              removeQueries(['buyer-pending-purchases', pendingPage]);
              removeQueries(['buyer-completed-purchases']);
              removeQueries(['buyer-pending-po-children']);

              // Refetch only the current tab's data for instant update
              if (activeTab === 'pending' || activeTab === 'pending_approval') {
                const pendingResult = await refetchPending();

                // Update selectedPurchase with fresh data
                if (selectedPurchase && pendingResult.data?.pending_purchases) {
                  const updatedPurchase = pendingResult.data.pending_purchases.find(
                    (p: Purchase) => p.cr_id === selectedPurchase.cr_id
                  );
                  if (updatedPurchase) {
                    setSelectedPurchase(updatedPurchase);
                  }
                }
              } else if (activeTab === 'completed') {
                await refetchCompleted();
              }

              // Only refetch POChildren if we're on that tab
              if (activeTab === 'pending_po_children' || activeTab === 'approved_po_children') {
                await refetchPendingPOChildren();
              }

              // DON'T switch tabs - stay on current tab so user sees notes updated
            } catch (error) {
              console.error('Failed to refresh after notes update:', error);
              // Notes are still saved on backend, just UI refresh failed
              // User can manually refresh page if needed
            }
          }}
        />
      )}

      {/* Vendor Email Modal */}
      {selectedPurchase && (
        <VendorEmailModal
          purchase={selectedPurchase}
          isOpen={isVendorEmailModalOpen}
          openWithWhatsAppPreview={openWithWhatsAppPreview}
          onClose={() => {
            setIsVendorEmailModalOpen(false);
            setSelectedPurchase(null);
            setOpenWithWhatsAppPreview(false); // Reset WhatsApp preview state
          }}
          onEmailSent={async () => {
            // Remove cache completely and refetch fresh data
            removeQueries(['purchases']);
            removeQueries(['pending-purchases']);
            removeQueries(['buyer-pending-purchases']);
            removeQueries(['buyer-approved-po-children']);
            removeQueries(['buyer-pending-po-children']);
            removeQueries(['dashboard']);

            // Longer delay to ensure backend has processed the change and database is updated
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Force refetch all tabs to ensure UI is updated
            await Promise.all([
              refetchPending(),
              refetchCompleted(),
              refetchApprovedPOChildren()
            ]);

            // Reset to first page and switch to completed tab to show the newly completed purchase
            setCompletedPage(1);
            setActiveTab('completed');
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

      {/* Site Engineer Selection Modal */}
      <SiteEngineerModal
        isOpen={isSiteEngineerModalOpen}
        poChild={selectedPOChildForCompletion}
        siteEngineers={siteEngineersForProject}
        loadingSiteEngineers={loadingSiteEngineers}
        completingPurchaseId={completingPurchaseId}
        onClose={() => {
          setIsSiteEngineerModalOpen(false);
          setSelectedPOChildForCompletion(null);
          setSiteEngineersForProject([]);
        }}
        onComplete={handlePOChildComplete}
      />

      {/* Store Availability Modal */}
      <StoreAvailabilityModal
        isOpen={isStoreModalOpen}
        purchase={selectedPurchase}
        storeAvailability={storeAvailability}
        checkingStoreAvailability={checkingStoreAvailability}
        completingFromStore={completingFromStore}
        selectedStoreMaterials={selectedStoreMaterials}
        onToggleMaterial={toggleStoreMaterialSelection}
        onClose={() => {
          setIsStoreModalOpen(false);
          setStoreAvailability(null);
          setSelectedStoreMaterials(new Set());
        }}
        onConfirm={handleConfirmGetFromStore}
      />
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (727 lines - CRITICAL)
export default React.memo(PurchaseOrders);
