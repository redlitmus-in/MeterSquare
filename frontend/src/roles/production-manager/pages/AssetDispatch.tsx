/**
 * Asset Dispatch Page (Production Manager)
 * Two sub-tabs like Stock Out page:
 * 1. Requisitions - Approve/reject PM-approved requisitions
 * 2. Delivery Notes (ADN) - Create and dispatch asset delivery notes
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Truck, Send, Package, RefreshCw, FileText,
  Trash2, Check, X, Eye, ChevronDown, ChevronUp, Download, Printer,
  Clock, CheckCircle, XCircle, Search, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { PAGINATION } from '@/lib/inventoryConstants';
import { apiClient, API_BASE_URL } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import {
  createDeliveryNote,
  getDeliveryNotes,
  dispatchDeliveryNote,
  getAvailableForDispatch,
  AssetDeliveryNote,
  AssetCondition,
  AssetCategory,
  AssetItem
} from '../services/assetDnService';
import {
  AssetRequisition,
  getProdMgrPendingRequisitions,
  getReadyForDispatch,
  prodMgrApproveRequisition,
  prodMgrRejectRequisition,
  dispatchRequisition,
  STATUS_LABELS,
  STATUS_COLORS,
  URGENCY_LABELS,
  URGENCY_COLORS,
} from '@/roles/site-engineer/services/assetRequisitionService';
import { showSuccess, showError } from '@/utils/toastHelper';

// Unified tab type - all tabs in single row
type MainTabType = 'pending' | 'ready_dispatch' | 'rejected' | 'draft' | 'issued' | 'delivered';

interface SiteEngineer {
  user_id: number;
  full_name: string;
  email: string;
}

interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
  location?: string;
  site_supervisors?: SiteEngineer[];
}

interface DispatchItem {
  category_id: number;
  category_name: string;
  category_code: string;
  tracking_mode: 'individual' | 'quantity';
  asset_item_id?: number;
  item_code?: string;
  serial_number?: string;
  quantity: number;
  available: number;
  condition: AssetCondition;
  notes: string;
  individualItemIds?: number[]; // For grouped individual items (stores multiple asset_item_ids)
}

const DN_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-yellow-100 text-yellow-700',
  DELIVERED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-red-100 text-red-700'
};

const AssetDispatch: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ==================== MAIN TAB STATE ====================
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('pending');

  // Handle URL parameters
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['pending', 'ready_dispatch', 'rejected', 'draft', 'issued', 'delivered'].includes(tab)) {
      setActiveMainTab(tab as MainTabType);
    }
  }, [searchParams]);

  // ==================== DELIVERY NOTES STATE ====================
  const [projects, setProjects] = useState<Project[]>([]);
  const [availableCategories, setAvailableCategories] = useState<AssetCategory[]>([]);
  const [availableItems, setAvailableItems] = useState<AssetItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedDN, setExpandedDN] = useState<number | null>(null);

  // Separate DN data by status (lazy loading)
  const [draftDNs, setDraftDNs] = useState<AssetDeliveryNote[]>([]);
  const [issuedDNs, setIssuedDNs] = useState<AssetDeliveryNote[]>([]);
  const [deliveredDNs, setDeliveredDNs] = useState<AssetDeliveryNote[]>([]);

  // Loading states for each DN tab
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingIssued, setLoadingIssued] = useState(false);
  const [loadingDelivered, setLoadingDelivered] = useState(false);
  const [loadingFormData, setLoadingFormData] = useState(false);

  // Track which DN tabs have been loaded
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [issuedLoaded, setIssuedLoaded] = useState(false);
  const [deliveredLoaded, setDeliveredLoaded] = useState(false);
  const [formDataLoaded, setFormDataLoaded] = useState(false);

  // DN Form state
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [siteLocation, setSiteLocation] = useState('');
  const [attentionTo, setAttentionTo] = useState('');
  const [availableSEs, setAvailableSEs] = useState<SiteEngineer[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [transportFee, setTransportFee] = useState<number>(0);
  const [deliveryNoteFile, setDeliveryNoteFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [dispatchItems, setDispatchItems] = useState<DispatchItem[]>([]);
  const [quantityExpanded, setQuantityExpanded] = useState(true);
  const [individualExpanded, setIndividualExpanded] = useState(true);

  // Linked requisition state (when creating DN from requisition)
  const [linkedRequisitionId, setLinkedRequisitionId] = useState<number | null>(null);
  const [linkedRequisitionCode, setLinkedRequisitionCode] = useState<string | null>(null);

  // ==================== REQUISITIONS STATE ====================
  const [pendingRequisitions, setPendingRequisitions] = useState<AssetRequisition[]>([]);
  const [readyDispatchRequisitions, setReadyDispatchRequisitions] = useState<AssetRequisition[]>([]);
  const [rejectedRequisitions, setRejectedRequisitions] = useState<AssetRequisition[]>([]);

  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingReadyDispatch, setLoadingReadyDispatch] = useState(false);
  const [loadingRejected, setLoadingRejected] = useState(false);

  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [readyDispatchLoaded, setReadyDispatchLoaded] = useState(false);
  const [rejectedLoaded, setRejectedLoaded] = useState(false);

  const [reqSearchTerm, setReqSearchTerm] = useState('');

  // Pagination state for requisitions and DNs
  const [reqCurrentPage, setReqCurrentPage] = useState(1);
  const [dnCurrentPage, setDnCurrentPage] = useState(1);

  // Requisition Modal state
  const [selectedRequisition, setSelectedRequisition] = useState<AssetRequisition | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [actionNotes, setActionNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ==================== FETCH FUNCTIONS ====================

  // Fetch form data (projects and available assets) - only when needed
  // Returns the fetched data to avoid race conditions when using data immediately after fetch
  const fetchFormData = useCallback(async (): Promise<{
    projects: Project[];
    categories: AssetCategory[];
    items: AssetItem[];
  } | null> => {
    try {
      setLoadingFormData(true);
      const [projectsRes, availableData] = await Promise.all([
        apiClient.get('/all_project', { params: { per_page: 100, has_se_assigned: 'true' } }),
        getAvailableForDispatch()
      ]);
      const fetchedProjects = projectsRes.data?.projects || projectsRes.data?.data || [];
      const fetchedCategories = availableData.quantity_based;
      const fetchedItems = availableData.individual_items;

      setProjects(fetchedProjects);
      setAvailableCategories(fetchedCategories);
      setAvailableItems(fetchedItems);
      setFormDataLoaded(true);

      return {
        projects: fetchedProjects,
        categories: fetchedCategories,
        items: fetchedItems
      };
    } catch (error) {
      console.error('Error fetching form data:', error);
      showError('Failed to load form data');
      return null;
    } finally {
      setLoadingFormData(false);
    }
  }, []);

  // Fetch Draft DNs
  const fetchDraftDNs = useCallback(async () => {
    try {
      setLoadingDraft(true);
      const data = await getDeliveryNotes({ status: 'DRAFT', per_page: 50 });
      setDraftDNs(data.data);
      setDraftLoaded(true);
    } catch (error) {
      console.error('Error fetching draft DNs:', error);
      showError('Failed to load draft delivery notes');
    } finally {
      setLoadingDraft(false);
    }
  }, []);

  // Fetch Issued DNs (includes IN_TRANSIT)
  const fetchIssuedDNs = useCallback(async () => {
    try {
      setLoadingIssued(true);
      // Fetch all and filter client-side to include both ISSUED and IN_TRANSIT
      const data = await getDeliveryNotes({ per_page: 100 });
      const issued = data.data.filter((dn: AssetDeliveryNote) => dn.status === 'ISSUED' || dn.status === 'IN_TRANSIT');
      setIssuedDNs(issued);
      setIssuedLoaded(true);
    } catch (error) {
      console.error('Error fetching issued DNs:', error);
      showError('Failed to load issued delivery notes');
    } finally {
      setLoadingIssued(false);
    }
  }, []);

  // Fetch Delivered DNs
  const fetchDeliveredDNs = useCallback(async () => {
    try {
      setLoadingDelivered(true);
      const data = await getDeliveryNotes({ status: 'DELIVERED', per_page: 50 });
      setDeliveredDNs(data.data);
      setDeliveredLoaded(true);
    } catch (error) {
      console.error('Error fetching delivered DNs:', error);
      showError('Failed to load delivered delivery notes');
    } finally {
      setLoadingDelivered(false);
    }
  }, []);

  // Fetch pending requisitions
  const fetchPending = useCallback(async () => {
    try {
      setLoadingPending(true);
      const data = await getProdMgrPendingRequisitions({ status: 'pending' });
      const pending = data.filter(r => r.status === 'pending_prod_mgr');
      setPendingRequisitions(pending);
      setPendingLoaded(true);
    } catch (err) {
      console.error('Error fetching pending requisitions:', err);
      showError('Failed to load pending requisitions');
    } finally {
      setLoadingPending(false);
    }
  }, []);

  // Fetch ready for dispatch requisitions
  const fetchReadyDispatch = useCallback(async () => {
    try {
      setLoadingReadyDispatch(true);
      const data = await getReadyForDispatch();
      setReadyDispatchRequisitions(data);
      setReadyDispatchLoaded(true);
    } catch (err) {
      console.error('Error fetching ready for dispatch:', err);
      showError('Failed to load dispatch queue');
    } finally {
      setLoadingReadyDispatch(false);
    }
  }, []);

  // Fetch rejected requisitions
  const fetchRejected = useCallback(async () => {
    try {
      setLoadingRejected(true);
      const data = await getProdMgrPendingRequisitions({ status: 'all' });
      const rejected = data.filter(r => r.status === 'prod_mgr_rejected');
      setRejectedRequisitions(rejected);
      setRejectedLoaded(true);
    } catch (err) {
      console.error('Error fetching rejected requisitions:', err);
      showError('Failed to load rejected requisitions');
    } finally {
      setLoadingRejected(false);
    }
  }, []);

  // Lazy load tabs based on activeMainTab
  useEffect(() => {
    // Requisition tabs
    if (activeMainTab === 'pending' && !pendingLoaded && !loadingPending) {
      fetchPending();
    } else if (activeMainTab === 'ready_dispatch' && !readyDispatchLoaded && !loadingReadyDispatch) {
      fetchReadyDispatch();
    } else if (activeMainTab === 'rejected' && !rejectedLoaded && !loadingRejected) {
      fetchRejected();
    }
    // DN tabs
    else if (activeMainTab === 'draft' && !draftLoaded && !loadingDraft) {
      fetchDraftDNs();
    } else if (activeMainTab === 'issued' && !issuedLoaded && !loadingIssued) {
      fetchIssuedDNs();
    } else if (activeMainTab === 'delivered' && !deliveredLoaded && !loadingDelivered) {
      fetchDeliveredDNs();
    }
  }, [
    activeMainTab,
    pendingLoaded, readyDispatchLoaded, rejectedLoaded,
    loadingPending, loadingReadyDispatch, loadingRejected,
    fetchPending, fetchReadyDispatch, fetchRejected,
    draftLoaded, issuedLoaded, deliveredLoaded,
    loadingDraft, loadingIssued, loadingDelivered,
    fetchDraftDNs, fetchIssuedDNs, fetchDeliveredDNs
  ]);

  // Fetch form data when showing the form
  useEffect(() => {
    if (showForm && !formDataLoaded && !loadingFormData) {
      fetchFormData();
    }
  }, [showForm, formDataLoaded, loadingFormData, fetchFormData]);

  // ==================== REQUISITION HELPERS ====================

  const currentRequisitions = useMemo(() => {
    switch (activeMainTab) {
      case 'pending': return pendingRequisitions;
      case 'ready_dispatch': return readyDispatchRequisitions;
      case 'rejected': return rejectedRequisitions;
      default: return [];
    }
  }, [activeMainTab, pendingRequisitions, readyDispatchRequisitions, rejectedRequisitions]);

  const isReqLoading = useMemo(() => {
    switch (activeMainTab) {
      case 'pending': return loadingPending;
      case 'ready_dispatch': return loadingReadyDispatch;
      case 'rejected': return loadingRejected;
      default: return false;
    }
  }, [activeMainTab, loadingPending, loadingReadyDispatch, loadingRejected]);

  const filteredRequisitions = useMemo(() => {
    if (!reqSearchTerm) return currentRequisitions;
    const term = reqSearchTerm.toLowerCase();
    return currentRequisitions.filter(r => {
      if (
        r.requisition_code.toLowerCase().includes(term) ||
        r.project_name?.toLowerCase().includes(term) ||
        r.category_name?.toLowerCase().includes(term) ||
        r.requested_by_name.toLowerCase().includes(term)
      ) return true;
      if (r.items && r.items.length > 0) {
        return r.items.some(item =>
          item.category_name?.toLowerCase().includes(term) ||
          item.category_code?.toLowerCase().includes(term)
        );
      }
      return false;
    });
  }, [currentRequisitions, reqSearchTerm]);

  // Pagination calculations for requisitions
  const reqTotalPages = Math.ceil(filteredRequisitions.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedRequisitions = useMemo(() => {
    const startIndex = (reqCurrentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredRequisitions.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredRequisitions, reqCurrentPage]);

  // Reset requisition page when tab or search changes
  useEffect(() => {
    setReqCurrentPage(1);
  }, [activeMainTab, reqSearchTerm]);

  // Clamp requisition page when total pages decreases
  useEffect(() => {
    if (reqCurrentPage > reqTotalPages && reqTotalPages > 0) {
      setReqCurrentPage(reqTotalPages);
    }
  }, [reqCurrentPage, reqTotalPages]);

  const reqStatusCounts = useMemo(() => ({
    pending: pendingRequisitions.length,
    ready_dispatch: readyDispatchRequisitions.length,
    rejected: rejectedRequisitions.length,
  }), [pendingRequisitions, readyDispatchRequisitions, rejectedRequisitions]);

  const refreshCurrentTab = useCallback(() => {
    if (activeMainTab === 'pending') {
      setPendingLoaded(false);
      fetchPending();
    } else if (activeMainTab === 'ready_dispatch') {
      setReadyDispatchLoaded(false);
      fetchReadyDispatch();
    } else if (activeMainTab === 'rejected') {
      setRejectedLoaded(false);
      fetchRejected();
    } else if (activeMainTab === 'draft') {
      setDraftLoaded(false);
      fetchDraftDNs();
    } else if (activeMainTab === 'issued') {
      setIssuedLoaded(false);
      fetchIssuedDNs();
    } else if (activeMainTab === 'delivered') {
      setDeliveredLoaded(false);
      fetchDeliveredDNs();
    }
  }, [activeMainTab, fetchPending, fetchReadyDispatch, fetchRejected, fetchDraftDNs, fetchIssuedDNs, fetchDeliveredDNs]);

  // ==================== DN HELPERS ====================

  const currentDNs = useMemo(() => {
    switch (activeMainTab) {
      case 'draft': return draftDNs;
      case 'issued': return issuedDNs;
      case 'delivered': return deliveredDNs;
      default: return [];
    }
  }, [activeMainTab, draftDNs, issuedDNs, deliveredDNs]);

  // Pagination calculations for DNs
  const dnTotalPages = Math.ceil(currentDNs.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedDNs = useMemo(() => {
    const startIndex = (dnCurrentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return currentDNs.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [currentDNs, dnCurrentPage]);

  // Reset DN page when tab changes
  useEffect(() => {
    setDnCurrentPage(1);
  }, [activeMainTab]);

  // Clamp DN page when total pages decreases
  useEffect(() => {
    if (dnCurrentPage > dnTotalPages && dnTotalPages > 0) {
      setDnCurrentPage(dnTotalPages);
    }
  }, [dnCurrentPage, dnTotalPages]);

  const isDNLoading = useMemo(() => {
    switch (activeMainTab) {
      case 'draft': return loadingDraft;
      case 'issued': return loadingIssued;
      case 'delivered': return loadingDelivered;
      default: return false;
    }
  }, [activeMainTab, loadingDraft, loadingIssued, loadingDelivered]);

  const dnStatusCounts = useMemo(() => ({
    DRAFT: draftDNs.length,
    ISSUED: issuedDNs.length,
    DELIVERED: deliveredDNs.length,
  }), [draftDNs, issuedDNs, deliveredDNs]);

  const totalDNCount = useMemo(() => {
    return draftDNs.length + issuedDNs.length + deliveredDNs.length;
  }, [draftDNs, issuedDNs, deliveredDNs]);


  const openActionModal = (requisition: AssetRequisition, action: 'approve' | 'reject') => {
    setSelectedRequisition(requisition);
    setActionType(action);
    setActionNotes('');
    setRejectionReason('');
    setShowActionModal(true);
  };

  const openDetailModal = (requisition: AssetRequisition) => {
    setSelectedRequisition(requisition);
    setShowDetailModal(true);
  };

  const handleApprove = async () => {
    if (!selectedRequisition) return;
    setSubmitting(true);
    try {
      await prodMgrApproveRequisition(selectedRequisition.requisition_id, { notes: actionNotes || undefined });
      showSuccess('Requisition approved successfully');
      setShowActionModal(false);
      setPendingLoaded(false);
      setReadyDispatchLoaded(false);
      fetchPending();
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : 'Failed to approve requisition');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequisition) return;
    if (!rejectionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }
    setSubmitting(true);
    try {
      await prodMgrRejectRequisition(selectedRequisition.requisition_id, {
        rejection_reason: rejectionReason,
        notes: actionNotes || undefined
      });
      showSuccess('Requisition rejected');
      setShowActionModal(false);
      setPendingLoaded(false);
      setRejectedLoaded(false);
      fetchPending();
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : 'Failed to reject requisition');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ==================== DELIVERY NOTE HANDLERS ====================

  const handleProjectSelect = (projectId: number | null) => {
    setSelectedProjectId(projectId);
    if (projectId) {
      const selectedProject = projects.find(p => p.project_id === projectId);
      if (selectedProject) {
        setSiteLocation(selectedProject.location || '');
        const ses = selectedProject.site_supervisors || [];
        setAvailableSEs(ses);
        if (ses.length === 1) {
          setAttentionTo(ses[0].full_name || '');
        } else {
          setAttentionTo('');
        }
      }
    } else {
      setSiteLocation('');
      setAttentionTo('');
      setAvailableSEs([]);
    }
  };

  const addDispatchItem = (category: AssetCategory) => {
    if (category.tracking_mode === 'quantity') {
      if (dispatchItems.some(i => i.category_id === category.category_id && !i.asset_item_id)) {
        showError('This category is already added');
        return;
      }
      setDispatchItems([...dispatchItems, {
        category_id: category.category_id,
        category_name: category.category_name,
        category_code: category.category_code,
        tracking_mode: 'quantity',
        quantity: 1,
        available: category.available_quantity,
        condition: 'good',
        notes: ''
      }]);
    }
  };

  const addIndividualItem = (item: AssetItem) => {
    if (dispatchItems.some(i => i.asset_item_id === item.item_id)) {
      showError('This item is already added');
      return;
    }
    const category = availableCategories.find(c => c.category_id === item.category_id) ||
      { category_name: item.category_name || '', category_code: item.category_code || '' };

    setDispatchItems([...dispatchItems, {
      category_id: item.category_id,
      category_name: category.category_name,
      category_code: category.category_code,
      tracking_mode: 'individual',
      asset_item_id: item.item_id,
      item_code: item.item_code,
      serial_number: item.serial_number,
      quantity: 1,
      available: 1,
      condition: item.current_condition as AssetCondition,
      notes: ''
    }]);
  };

  const removeDispatchItem = (index: number) => {
    setDispatchItems(dispatchItems.filter((_, i) => i !== index));
  };

  const updateDispatchItem = (index: number, field: keyof DispatchItem, value: string | number) => {
    const newItems = [...dispatchItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setDispatchItems(newItems);
  };

  const [creatingDN, setCreatingDN] = useState(false);

  const handleSubmitDN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      showError('Please select a project');
      return;
    }
    if (dispatchItems.length === 0) {
      showError('Please add at least one item to dispatch');
      return;
    }
    for (const item of dispatchItems) {
      // availableCategories = quantity-based categories only
      // availableItems = individual tracking items (each has category_id)
      const isInQuantityCategories = availableCategories.some(c => c.category_id === item.category_id);
      const categoryHasIndividualItems = availableItems.some(i => i.category_id === item.category_id);

      // If category is not in either list and doesn't have asset_item_id, it's not dispatchable
      if (!isInQuantityCategories && !categoryHasIndividualItems && !item.asset_item_id) {
        showError(`"${item.category_name}" is not available in inventory. Please remove it from the dispatch list.`);
        return;
      }

      // Check if item has no available stock
      if (item.available === 0) {
        showError(`${item.category_name} has no available stock. Please remove it from the dispatch list.`);
        return;
      }
      if (item.quantity > item.available) {
        showError(`Quantity exceeds available stock for ${item.category_name}`);
        return;
      }

      // Category requires individual tracking if:
      // 1. Item is explicitly marked as 'individual', OR
      // 2. Category is NOT in quantity-based list (individual tracking categories don't appear there)
      const requiresIndividualTracking = item.tracking_mode === 'individual' ||
        (!isInQuantityCategories && (categoryHasIndividualItems || !item.asset_item_id));

      // For individual tracking, accept either:
      // - Single item with asset_item_id
      // - Grouped items with individualItemIds
      if (requiresIndividualTracking && !item.asset_item_id && (!item.individualItemIds || item.individualItemIds.length === 0)) {
        showError(`"${item.category_name}" requires individual tracking. Please remove it and select specific items from the "Individual Items" section below.`);
        return;
      }
    }
    setCreatingDN(true);
    try {
      const result = await createDeliveryNote({
        project_id: selectedProjectId,
        site_location: siteLocation || undefined,
        delivery_date: new Date().toISOString(),
        attention_to: attentionTo || undefined,
        vehicle_number: vehicleNumber || undefined,
        driver_name: driverName || undefined,
        driver_contact: driverContact || undefined,
        transport_fee: transportFee || undefined,
        notes: notes || undefined,
        requisition_id: linkedRequisitionId || undefined,
        items: dispatchItems.flatMap(item => {
          // For grouped individual items, expand them into separate items for the backend
          if (item.individualItemIds && item.individualItemIds.length > 0) {
            return item.individualItemIds.map(assetItemId => ({
              category_id: item.category_id,
              asset_item_id: assetItemId,
              quantity: 1,
              condition: item.condition,
              notes: item.notes || undefined
            }));
          }
          // For quantity-based or single individual items, send as is
          return [{
            category_id: item.category_id,
            asset_item_id: item.asset_item_id,
            quantity: item.quantity,
            condition: item.condition,
            notes: item.notes || undefined
          }];
        })
      });

      // If linked to a requisition, mark it as dispatched
      if (linkedRequisitionId) {
        try {
          await dispatchRequisition(linkedRequisitionId, {
            notes: `Linked to DN: ${result.adn_number}`,
            adn_id: result.adn_id
          });
          showSuccess(`Delivery Note ${result.adn_number} created and requisition dispatched`);
          // Refresh ready_dispatch tab (requisition moved out)
          setReadyDispatchLoaded(false);
        } catch (reqError) {
          console.error('Error dispatching linked requisition:', reqError);
          showSuccess(`Delivery Note created: ${result.adn_number}`);
          showError('Warning: Requisition status could not be updated. Please update it manually.');
        }
      } else {
        showSuccess(`Delivery Note created: ${result.adn_number}`);
      }

      resetDNForm();
      // Refresh draft tab since new DN starts as DRAFT
      setDraftLoaded(false);
      setFormDataLoaded(false);
      fetchDraftDNs();
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : 'Failed to create delivery note');
    } finally {
      setCreatingDN(false);
    }
  };

  const [dispatchingDN, setDispatchingDN] = useState(false);

  const handleDispatchDN = async (adnId: number) => {
    if (!confirm('Are you sure you want to dispatch this delivery note? Stock will be deducted.')) {
      return;
    }
    setDispatchingDN(true);
    try {
      const result = await dispatchDeliveryNote(adnId);
      showSuccess(`Delivery Note ${result.adn_number} dispatched successfully`);
      // Refresh DRAFT and ISSUED tabs since DN moved from DRAFT to ISSUED
      setDraftLoaded(false);
      setIssuedLoaded(false);
      setFormDataLoaded(false);
      // Re-fetch current tab
      if (activeMainTab === 'draft') {
        fetchDraftDNs();
      } else if (activeMainTab === 'issued') {
        fetchIssuedDNs();
      }
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : 'Failed to dispatch');
    } finally {
      setDispatchingDN(false);
    }
  };

  const resetDNForm = () => {
    setSelectedProjectId(null);
    setSiteLocation('');
    setAttentionTo('');
    setAvailableSEs([]);
    setVehicleNumber('');
    setDriverName('');
    setDriverContact('');
    setTransportFee(0);
    setDeliveryNoteFile(null);
    setNotes('');
    setDispatchItems([]);
    setShowForm(false);
    setLinkedRequisitionId(null);
    setLinkedRequisitionCode(null);
  };

  // Handle dispatch by opening DN form with requisition data
  const handleDispatchWithDN = async (requisition: AssetRequisition) => {
    try {
      // Switch to draft tab for visual feedback
      setActiveMainTab('draft');

      // Get form data - either from existing state or fetch fresh
      let projectsList = projects;
      let categoriesList = availableCategories;
      let itemsList = availableItems;

      if (!formDataLoaded) {
        const fetchedData = await fetchFormData();
        if (!fetchedData) {
          // Fetch failed, error already shown by fetchFormData
          return;
        }
        projectsList = fetchedData.projects;
        categoriesList = fetchedData.categories;
        itemsList = fetchedData.items;
      }

      // Store the linked requisition
      setLinkedRequisitionId(requisition.requisition_id);
      setLinkedRequisitionCode(requisition.requisition_code);

      // Find the project and set it
      const projectId = requisition.project_id;
      if (projectId) {
        setSelectedProjectId(projectId);
        const selectedProject = projectsList.find(p => p.project_id === projectId);
        if (selectedProject) {
          setSiteLocation(requisition.site_location || selectedProject.location || '');
          const ses = selectedProject.site_supervisors || [];
          setAvailableSEs(ses);
        }
      }

      // Set attention_to as the requester's name
      setAttentionTo(requisition.requested_by_name || '');

      // Pre-fill items from the requisition
      const prefilledItems: DispatchItem[] = [];

      if (requisition.items && requisition.items.length > 0) {
        // Multiple items
        for (const item of requisition.items) {
          // Find the matching category in available assets (quantity-based categories)
          const category = categoriesList.find(c => c.category_id === item.category_id);

          // Also check if this is an individual tracking category by looking at itemsList
          const availableItemsForCategory = itemsList.filter(
            ai => ai.category_id === item.category_id && ai.current_status === 'available'
          ) || [];
          const isIndividualTracking = item.tracking_mode === 'individual' || availableItemsForCategory.length > 0;

          if (isIndividualTracking) {
            // Handle individual tracking mode - show as grouped quantity
            const requestedQty = item.quantity || 1;
            const itemsToAdd = availableItemsForCategory.slice(0, requestedQty);
            const categoryName = item.category_name || category?.category_name || 'Unknown';
            const categoryCode = item.category_code || category?.category_code || '';

            // Group individual items into a single line item
            const itemCodes = itemsToAdd.map(ai => ai.item_code).filter(Boolean).join(', ');
            const note = itemsToAdd.length > 0
              ? `Individual items: ${itemCodes || itemsToAdd.map((ai, idx) => `#${idx + 1}`).join(', ')}`
              : `⚠️ No available items - ${requestedQty} needed`;

            prefilledItems.push({
              category_id: item.category_id,
              category_name: categoryName,
              category_code: categoryCode,
              tracking_mode: 'individual',
              quantity: itemsToAdd.length > 0 ? itemsToAdd.length : requestedQty,
              available: availableItemsForCategory.length,
              condition: 'good',
              notes: note,
              // Store the asset_item_ids for backend submission (will be used when creating DN)
              individualItemIds: itemsToAdd.map(ai => ai.item_id)
            });

            // Add shortfall warning if needed
            if (itemsToAdd.length < requestedQty) {
              const shortfall = requestedQty - itemsToAdd.length;
              prefilledItems[prefilledItems.length - 1].notes += ` | ⚠️ Shortfall: ${shortfall} more needed`;
            }
          } else if (category) {
            // Quantity-based tracking - add as is
            prefilledItems.push({
              category_id: item.category_id,
              category_name: item.category_name || category.category_name,
              category_code: item.category_code || category.category_code,
              tracking_mode: 'quantity',
              quantity: item.quantity || 1,
              available: category.available_quantity ?? item.quantity ?? 1,
              condition: 'good',
              notes: ''
            });
          } else {
            // Category not found in available, add anyway for visibility
            prefilledItems.push({
              category_id: item.category_id,
              category_name: item.category_name || 'Unknown',
              category_code: item.category_code || '',
              tracking_mode: item.tracking_mode || 'quantity',
              quantity: item.quantity || 1,
              available: 0,
              condition: 'good',
              notes: '⚠️ Category not found in inventory'
            });
          }
        }
      } else if (requisition.category_id) {
        // Single item (old format)
        const category = categoriesList.find(c => c.category_id === requisition.category_id);

        // Also check for individual tracking items
        const availableItemsForCategory = (fetchedData?.items || itemsList).filter(
          ai => ai.category_id === requisition.category_id && ai.current_status === 'available'
        ) || [];
        const isIndividualTracking = requisition.tracking_mode === 'individual' ||
          category?.tracking_mode === 'individual' ||
          availableItemsForCategory.length > 0;

        if (isIndividualTracking) {
          // Handle individual tracking for single item requisition - show as grouped quantity
          const requestedQty = requisition.quantity || 1;
          const itemsToAdd = availableItemsForCategory.slice(0, requestedQty);
          const categoryName = requisition.category_name || category?.category_name || 'Unknown';
          const categoryCode = requisition.category_code || category?.category_code || '';

          // Group individual items into a single line item
          const itemCodes = itemsToAdd.map(ai => ai.item_code).filter(Boolean).join(', ');
          const note = itemsToAdd.length > 0
            ? `Individual items: ${itemCodes || itemsToAdd.map((ai, idx) => `#${idx + 1}`).join(', ')}`
            : `⚠️ No available items - ${requestedQty} needed`;

          prefilledItems.push({
            category_id: requisition.category_id,
            category_name: categoryName,
            category_code: categoryCode,
            tracking_mode: 'individual',
            quantity: itemsToAdd.length > 0 ? itemsToAdd.length : requestedQty,
            available: availableItemsForCategory.length,
            condition: 'good',
            notes: note,
            // Store the asset_item_ids for backend submission
            individualItemIds: itemsToAdd.map(ai => ai.item_id)
          });

          // Add shortfall warning if needed
          if (itemsToAdd.length < requestedQty) {
            const shortfall = requestedQty - itemsToAdd.length;
            prefilledItems[prefilledItems.length - 1].notes += ` | ⚠️ Shortfall: ${shortfall} more needed`;
          }
        } else if (category) {
          // Quantity-based tracking
          prefilledItems.push({
            category_id: requisition.category_id,
            category_name: requisition.category_name || category.category_name,
            category_code: requisition.category_code || category.category_code,
            tracking_mode: 'quantity',
            quantity: requisition.quantity || 1,
            available: category.available_quantity ?? requisition.quantity ?? 1,
            condition: 'good',
            notes: ''
          });
        } else {
          // Category not found anywhere
          prefilledItems.push({
            category_id: requisition.category_id,
            category_name: requisition.category_name || 'Unknown',
            category_code: requisition.category_code || '',
            tracking_mode: requisition.tracking_mode || 'quantity',
            quantity: requisition.quantity || 1,
            available: 0,
            condition: 'good',
            notes: '⚠️ Category not found in inventory'
          });
        }
      }

      setDispatchItems(prefilledItems);

      // Add requisition code to notes
      setNotes(`For Requisition: ${requisition.requisition_code}`);

      // Open the form
      setShowForm(true);
      setShowActionModal(false);
    } catch (error) {
      console.error('Error preparing dispatch form:', error);
      showError('Failed to prepare dispatch form. Please try again.');
      // Reset linked requisition state on error
      setLinkedRequisitionId(null);
      setLinkedRequisitionCode(null);
    }
  };

  const handleDownloadDN = async (dn: AssetDeliveryNote) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to download delivery notes');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/assets/delivery-notes/${dn.adn_id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download delivery note');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dn.adn_number || 'ADN'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to download delivery note PDF');
    }
  };

  const handlePrintDN = async (dn: AssetDeliveryNote) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to print delivery notes');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/assets/delivery-notes/${dn.adn_id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load delivery note for printing');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to print delivery note');
    }
  };

  // Main Tab configuration - all tabs in single row
  const mainTabs: { key: MainTabType; label: string; icon: React.ReactNode; activeColor: string; badgeColor: string; count: number }[] = [
    { key: 'pending', label: 'Pending', icon: <Clock className="h-4 w-4" />, activeColor: 'bg-yellow-500 text-white', badgeColor: 'bg-yellow-100 text-yellow-700', count: reqStatusCounts.pending },
    { key: 'ready_dispatch', label: 'Ready', icon: <Truck className="h-4 w-4" />, activeColor: 'bg-blue-600 text-white', badgeColor: 'bg-blue-100 text-blue-700', count: reqStatusCounts.ready_dispatch },
    { key: 'rejected', label: 'Rejected', icon: <XCircle className="h-4 w-4" />, activeColor: 'bg-red-500 text-white', badgeColor: 'bg-red-100 text-red-700', count: reqStatusCounts.rejected },
    { key: 'draft', label: 'Draft ADN', icon: <FileText className="h-4 w-4" />, activeColor: 'bg-gray-700 text-white', badgeColor: 'bg-gray-200 text-gray-700', count: dnStatusCounts.DRAFT },
    { key: 'issued', label: 'Issued ADN', icon: <Send className="h-4 w-4" />, activeColor: 'bg-blue-600 text-white', badgeColor: 'bg-blue-100 text-blue-700', count: dnStatusCounts.ISSUED },
    { key: 'delivered', label: 'Delivered ADN', icon: <CheckCircle className="h-4 w-4" />, activeColor: 'bg-green-600 text-white', badgeColor: 'bg-green-100 text-green-700', count: dnStatusCounts.DELIVERED },
  ];

  // ==================== RENDER ====================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Asset Dispatch</h1>
            <p className="text-gray-500">Manage requisitions and dispatch assets to sites</p>
          </div>
        </div>
        <button
          onClick={() => refreshCurrentTab()}
          className="p-2 hover:bg-gray-100 rounded-lg"
          disabled={isReqLoading || isDNLoading}
        >
          <RefreshCw className={`w-5 h-5 ${(isReqLoading || isDNLoading) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Tabs - Single Row */}
      <div className="flex gap-2 flex-wrap">
        {mainTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveMainTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeMainTab === tab.key
                ? tab.activeColor
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeMainTab === tab.key ? 'bg-white/20' : tab.badgeColor
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ==================== REQUISITIONS TABS ==================== */}
      {['pending', 'ready_dispatch', 'rejected'].includes(activeMainTab) && (
        <>

          {/* Search */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by code, project, category, or requester..."
                value={reqSearchTerm}
                onChange={(e) => setReqSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>

          {/* Loading */}
          {isReqLoading && (
            <div className="flex justify-center py-12">
              <ModernLoadingSpinners variant="pulse" size="md" />
            </div>
          )}

          {/* Requisitions List */}
          {!isReqLoading && filteredRequisitions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No requisitions found</h3>
              <p className="text-sm text-gray-500">
                {activeMainTab === 'pending' ? 'No requisitions waiting for your approval'
                  : activeMainTab === 'ready_dispatch' ? 'No approved requisitions ready for dispatch'
                  : 'No rejected requisitions'}
              </p>
            </div>
          ) : !isReqLoading && (
            <div className="space-y-4">
              {paginatedRequisitions.map(requisition => (
                <div
                  key={requisition.requisition_id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono font-semibold text-blue-600">
                          {requisition.requisition_code}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[requisition.status]}`}>
                          {STATUS_LABELS[requisition.status]}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_COLORS[requisition.urgency]}`}>
                          {URGENCY_LABELS[requisition.urgency]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Project:</span>
                          <span className="ml-1 font-medium">{requisition.project_name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Items:</span>
                          {requisition.items && requisition.items.length > 0 ? (
                            <span className="ml-1 font-medium">
                              {requisition.total_items || requisition.items.length} item{(requisition.total_items || requisition.items.length) > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="ml-1 font-medium">{requisition.category_name}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-gray-500">Qty:</span>
                          <span className="ml-1 font-medium">
                            {requisition.items && requisition.items.length > 0
                              ? requisition.total_quantity || requisition.items.reduce((s, i) => s + (i.quantity ?? 1), 0)
                              : requisition.quantity}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Required:</span>
                          <span className="ml-1 font-medium">{formatDate(requisition.required_date)}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="text-gray-500">Requested by:</span>
                        <span className="ml-1">{requisition.requested_by_name}</span>
                        <span className="text-gray-400 ml-2">|</span>
                        <span className="ml-2 text-gray-500">PM Approved by:</span>
                        <span className="ml-1">{requisition.pm_reviewed_by_name || '-'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openDetailModal(requisition)}
                        className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="hidden md:inline">Details</span>
                      </button>
                      {requisition.status === 'pending_prod_mgr' && (
                        <>
                          <button
                            onClick={() => openActionModal(requisition, 'approve')}
                            className="px-3 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Check className="h-4 w-4" />
                            <span className="hidden md:inline">Approve</span>
                          </button>
                          <button
                            onClick={() => openActionModal(requisition, 'reject')}
                            className="px-3 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <X className="h-4 w-4" />
                            <span className="hidden md:inline">Reject</span>
                          </button>
                        </>
                      )}
                      {requisition.status === 'prod_mgr_approved' && (
                        <button
                          onClick={() => handleDispatchWithDN(requisition)}
                          className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Truck className="h-4 w-4" />
                          <span className="hidden md:inline">Create DN</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination for Requisitions */}
              {filteredRequisitions.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Showing {((reqCurrentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(reqCurrentPage * PAGINATION.DEFAULT_PAGE_SIZE, filteredRequisitions.length)} of {filteredRequisitions.length} requisitions
                  </span>
                  {reqTotalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setReqCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={reqCurrentPage === 1}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {reqCurrentPage} of {reqTotalPages}
                      </span>
                      <button
                        onClick={() => setReqCurrentPage(prev => Math.min(prev + 1, reqTotalPages))}
                        disabled={reqCurrentPage === reqTotalPages}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ==================== DELIVERY NOTES TABS ==================== */}
      {['draft', 'issued', 'delivered'].includes(activeMainTab) && (
        <>
          {/* Create DN Form */}
          {showForm && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">New Asset Delivery Note (ADN)</h2>
                {linkedRequisitionCode && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">
                      Linked to: {linkedRequisitionCode}
                    </span>
                  </div>
                )}
              </div>
              {loadingFormData ? (
                <div className="flex items-center justify-center py-12">
                  <ModernLoadingSpinners size="md" />
                </div>
              ) : (
              <form onSubmit={handleSubmitDN} className="space-y-6">
                {/* Project & Site Information */}
                <div className="border-b pb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Delivery Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Project *
                        {linkedRequisitionId && <span className="text-xs text-blue-600 ml-2">(From Requisition)</span>}
                      </label>
                      <select
                        value={selectedProjectId || ''}
                        onChange={(e) => handleProjectSelect(Number(e.target.value) || null)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 ${linkedRequisitionId ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                        required
                        disabled={linkedRequisitionId ? true : false}
                      >
                        <option value="">Select Project</option>
                        {projects.map(p => (
                          <option key={p.project_id} value={p.project_id}>
                            {p.project_name} ({p.project_code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Site Location
                        {linkedRequisitionId && <span className="text-xs text-blue-600 ml-2">(From Requisition)</span>}
                      </label>
                      <input
                        type="text"
                        value={siteLocation}
                        onChange={(e) => setSiteLocation(e.target.value)}
                        placeholder="Auto-populated from project"
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 ${linkedRequisitionId ? 'bg-gray-50 cursor-not-allowed' : siteLocation ? 'bg-green-50' : ''}`}
                        disabled={linkedRequisitionId ? true : false}
                      />
                    </div>
                  </div>
                </div>

                {/* Recipient & Transport Details */}
                <div className="border-b pb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Recipient & Transport Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Attention To (Site Engineer) *
                        {linkedRequisitionId && <span className="text-xs text-blue-600 ml-2">(Requester)</span>}
                      </label>
                      {availableSEs.length > 1 && !linkedRequisitionId ? (
                        <select
                          value={attentionTo}
                          onChange={(e) => setAttentionTo(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                          required
                        >
                          <option value="">-- Select Site Engineer --</option>
                          {availableSEs.map(se => (
                            <option key={se.user_id} value={se.full_name}>{se.full_name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={attentionTo}
                          onChange={(e) => setAttentionTo(e.target.value)}
                          placeholder={availableSEs.length === 0 ? "Select a project first" : "Auto-populated"}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 ${linkedRequisitionId ? 'bg-gray-50 cursor-not-allowed' : attentionTo ? 'bg-green-50' : ''}`}
                          readOnly={linkedRequisitionId ? true : availableSEs.length === 1}
                          required={availableSEs.length === 0}
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                      <input
                        type="text"
                        value={vehicleNumber}
                        onChange={(e) => setVehicleNumber(e.target.value)}
                        placeholder="e.g., ABC-1234"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
                      <input
                        type="text"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="Driver name"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Driver Contact</label>
                      <input
                        type="text"
                        value={driverContact}
                        onChange={(e) => setDriverContact(e.target.value)}
                        placeholder="Driver contact number"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  {/* Transport Fee Calculation */}
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Transport Fee Calculation</h4>

                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enter total transport fee <span className="text-xs text-gray-500 font-normal">(Default: 1.00 AED per unit)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={transportFee === 0 ? '' : transportFee}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          setTransportFee(0);
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue)) {
                            setTransportFee(numValue);
                          }
                        }
                      }}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 flex items-start">
                      <svg className="w-4 h-4 text-gray-400 mr-1 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      This is the total transport cost paid for material delivered.
                    </p>

                    {/* Total Transport Fee Display */}
                    {transportFee > 0 && (
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4 shadow-sm mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm text-blue-900 font-semibold">
                              Total Transport Fee:
                            </span>
                          </div>
                          <span className="text-2xl font-bold text-blue-900">
                            AED {transportFee.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-white rounded-md p-2 border border-blue-200">
                          <p className="text-xs text-blue-800 font-medium">
                            📊 Calculation: 1 × {transportFee.toFixed(2)} = <span className="font-bold">{transportFee.toFixed(2)} AED</span>
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-amber-600 italic mt-2">
                      ⚡ Total transport fee will be calculated automatically when you enter the quantity
                    </p>
                  </div>

                </div>

                {/* Asset Selection - Only show if NOT creating from requisition */}
                {!linkedRequisitionId && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Package className="w-5 h-5 text-orange-600" />
                        Select Assets to Dispatch
                      </h3>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Quantity-based Assets */}
                      {availableCategories.length > 0 && (
                      <div className="bg-blue-50 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setQuantityExpanded(!quantityExpanded)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                            <span className="text-sm font-semibold text-blue-800">Quantity-based Assets</span>
                            <span className="px-2 py-0.5 bg-blue-200 text-blue-700 text-xs font-bold rounded-full">
                              {availableCategories.filter(cat => cat.tracking_mode === 'quantity').length}
                            </span>
                          </div>
                          {quantityExpanded ? <ChevronUp className="w-5 h-5 text-blue-600" /> : <ChevronDown className="w-5 h-5 text-blue-600" />}
                        </button>
                        {quantityExpanded && (
                          <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                            {availableCategories.filter(cat => cat.tracking_mode === 'quantity').map(cat => {
                              const isSelected = dispatchItems.some(i => i.category_id === cat.category_id && !i.asset_item_id);
                              return (
                                <button
                                  key={cat.category_id}
                                  type="button"
                                  onClick={() => addDispatchItem(cat)}
                                  className={`flex items-center justify-between px-3 py-2 border rounded-lg transition-all text-left relative ${
                                    isSelected
                                      ? 'bg-green-100 border-green-500 ring-2 ring-green-300'
                                      : 'bg-white border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                                  }`}
                                >
                                  {isSelected && (
                                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                      <Check className="w-3 h-3 text-white" />
                                    </span>
                                  )}
                                  <span className={`font-medium text-sm truncate ${isSelected ? 'text-green-800' : 'text-gray-800'}`}>
                                    {cat.category_name}
                                  </span>
                                  <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full ${isSelected ? 'bg-green-200 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {cat.available_quantity}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Individual Items */}
                    {availableItems.length > 0 && (
                      <div className="bg-purple-50 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setIndividualExpanded(!individualExpanded)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-purple-600 rounded-full"></span>
                            <span className="text-sm font-semibold text-purple-800">Individual Items</span>
                            <span className="text-xs text-purple-600">(Tracked by Serial Number)</span>
                            <span className="px-2 py-0.5 bg-purple-200 text-purple-700 text-xs font-bold rounded-full">
                              {availableItems.length}
                            </span>
                          </div>
                          {individualExpanded ? <ChevronUp className="w-5 h-5 text-purple-600" /> : <ChevronDown className="w-5 h-5 text-purple-600" />}
                        </button>
                        {individualExpanded && (
                          <div className="px-4 pb-3 max-h-72 overflow-y-auto">
                            {Object.entries(
                              availableItems.reduce((groups, item) => {
                                const category = item.category_name || 'Other';
                                if (!groups[category]) groups[category] = [];
                                groups[category].push(item);
                                return groups;
                              }, {} as Record<string, typeof availableItems>)
                            ).map(([categoryName, items]) => (
                              <div key={categoryName} className="mb-3 last:mb-0">
                                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1.5">{categoryName}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {items.map(item => {
                                    const isSelected = dispatchItems.some(i => i.asset_item_id === item.item_id);
                                    return (
                                      <button
                                        key={item.item_id}
                                        type="button"
                                        onClick={() => addIndividualItem(item)}
                                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-all text-left relative ${
                                          isSelected
                                            ? 'bg-green-100 border-green-500 ring-2 ring-green-300'
                                            : 'bg-white border-purple-200 hover:border-purple-400 hover:bg-purple-50'
                                        }`}
                                      >
                                        {isSelected ? (
                                          <span className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Check className="w-3 h-3 text-white" />
                                          </span>
                                        ) : (
                                          <Plus className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <span className={`text-sm font-medium block truncate ${isSelected ? 'text-green-800' : 'text-gray-800'}`}>
                                            {item.serial_number || item.item_code}
                                          </span>
                                          <span className={`text-xs ${isSelected ? 'text-green-600' : 'text-gray-500'}`}>{item.item_code}</span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                      {!linkedRequisitionId && dispatchItems.length === 0 && availableCategories.length === 0 && availableItems.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                          <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>No assets available for dispatch</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Items to Dispatch - Always show, especially for requisition-linked DNs */}
                {dispatchItems.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 border-b">
                      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        Items to Dispatch ({dispatchItems.length})
                      </h3>
                    </div>
                    <div className="p-3 space-y-1.5">
                      {dispatchItems.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg">
                          <div className={`p-1.5 rounded-lg ${item.tracking_mode === 'individual' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                            <Package className={`w-3.5 h-3.5 ${item.tracking_mode === 'individual' ? 'text-purple-600' : 'text-blue-600'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold text-gray-900 block">{item.category_name}</span>
                            {item.tracking_mode === 'individual' && (
                              <span className="text-xs text-gray-500">
                                {item.serial_number ? `SN: ${item.serial_number}` : item.item_code}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg">
                            <label className="text-xs text-gray-600 font-medium">Qty:</label>
                            {item.tracking_mode === 'quantity' ? (
                              <>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.available}
                                  value={item.quantity || ''}
                                  placeholder="1"
                                  onChange={(e) => updateDispatchItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                  className="w-12 px-1.5 py-0.5 text-sm border rounded text-center font-semibold"
                                  disabled={linkedRequisitionId ? true : false}
                                />
                                <span className="text-xs text-gray-400">/ {item.available}</span>
                              </>
                            ) : (
                              <span className="px-1.5 py-0.5 text-sm font-semibold text-gray-700">{item.quantity || 1}</span>
                            )}
                          </div>
                          {!linkedRequisitionId && (
                            <button
                              type="button"
                              onClick={() => removeDispatchItem(index)}
                              className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={resetDNForm}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingDN || dispatchItems.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  >
                    {creatingDN ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                    Create Delivery Note
                  </button>
                </div>
              </form>
              )}
            </div>
          )}

          {/* DN Loading */}
          {isDNLoading && currentDNs.length === 0 && (
            <div className="flex items-center justify-center min-h-[200px]">
              <ModernLoadingSpinners size="sm" />
            </div>
          )}

          {/* Delivery Notes Table */}
          {!isDNLoading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2 text-gray-800">
                  <Truck className="w-5 h-5 text-orange-500" />
                  {activeMainTab === 'draft' ? 'Draft' : activeMainTab === 'issued' ? 'Issued' : 'Delivered'} Asset Delivery Notes
                </h2>
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                  {currentDNs.length} {currentDNs.length === 1 ? 'Note' : 'Notes'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ADN Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site Engineer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transport Fee</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedDNs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center">
                          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500">No {activeMainTab === 'draft' ? 'draft' : activeMainTab === 'issued' ? 'issued' : 'delivered'} asset delivery notes found</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedDNs.map(dn => (
                          <React.Fragment key={dn.adn_id}>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setExpandedDN(expandedDN === dn.adn_id ? null : dn.adn_id)}
                                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  >
                                    {expandedDN === dn.adn_id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                  </button>
                                  <span className="font-semibold text-orange-600">{dn.adn_number}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="font-medium text-gray-900">{dn.project_name || '-'}</div>
                                <div className="text-xs text-gray-500">{dn.site_location || ''}</div>
                              </td>
                              <td className="px-4 py-4">
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                                  {(() => {
                                    // Group items by category and count unique categories
                                    const uniqueCategories = new Set();
                                    dn.items?.forEach(item => {
                                      uniqueCategories.add(item.category_name);
                                    });
                                    return uniqueCategories.size || 0;
                                  })()} items
                                </span>
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-900">{dn.attention_to || '-'}</td>
                              <td className="px-4 py-4 text-sm">
                                <div className="text-gray-900">{dn.vehicle_number || '-'}</div>
                                {dn.driver_name && <div className="text-xs text-gray-500">{dn.driver_name}</div>}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <div className="text-gray-900 font-medium">
                                  {dn.transport_fee ? `AED ${Number(dn.transport_fee).toFixed(2)}` : '-'}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${DN_STATUS_COLORS[dn.status]}`}>
                                  {dn.status?.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-500">
                                {new Date(dn.delivery_date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleDownloadDN(dn)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg" title="Download PDF">
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handlePrintDN(dn)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg" title="Print">
                                    <Printer className="w-4 h-4" />
                                  </button>
                                  {dn.status === 'DRAFT' && (
                                    <button
                                      onClick={() => handleDispatchDN(dn.adn_id)}
                                      className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium flex items-center gap-1 ml-1"
                                    >
                                      <Send className="w-3 h-3" />
                                      Dispatch
                                    </button>
                                  )}
                                  {dn.status === 'IN_TRANSIT' && (
                                    <span className="px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg font-medium flex items-center gap-1 ml-1">
                                      <Truck className="w-3 h-3" />
                                      In Transit
                                    </span>
                                  )}
                                  {dn.status === 'DELIVERED' && (
                                    <span className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg font-medium flex items-center gap-1 ml-1">
                                      <Check className="w-3 h-3" />
                                      Delivered
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {expandedDN === dn.adn_id && (
                              <tr>
                                <td colSpan={9} className="bg-gray-50 px-6 py-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                                    <div>
                                      <span className="text-gray-500 text-xs uppercase">Delivery Date</span>
                                      <p className="font-medium">{new Date(dn.delivery_date).toLocaleDateString()}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 text-xs uppercase">Attention To</span>
                                      <p className="font-medium">{dn.attention_to || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 text-xs uppercase">Driver</span>
                                      <p className="font-medium">{dn.driver_name || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 text-xs uppercase">Vehicle</span>
                                      <p className="font-medium">{dn.vehicle_number || '-'}</p>
                                    </div>
                                  </div>
                                  <div className="border rounded-lg overflow-hidden bg-white">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Asset</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Item Code</th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Qty</th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Received</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {(() => {
                                          // Group items by category_name for display (matching PDF format)
                                          const grouped = {};
                                          dn.items.forEach(item => {
                                            const key = item.category_name;
                                            if (!grouped[key]) {
                                              grouped[key] = {
                                                category_name: item.category_name,
                                                quantity: 0,
                                                is_received_all: true,
                                                statuses: new Set()
                                              };
                                            }
                                            // For individual items, count each as 1 unit
                                            grouped[key].quantity += (item.item_code ? 1 : item.quantity);
                                            if (!item.is_received) grouped[key].is_received_all = false;
                                            grouped[key].statuses.add(item.status);
                                          });

                                          return Object.values(grouped).map((groupedItem, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-3 py-2 font-medium text-gray-900">{groupedItem.category_name}</td>
                                              <td className="px-3 py-2 text-gray-500">-</td>
                                              <td className="px-3 py-2 text-center font-semibold text-blue-600">{groupedItem.quantity}</td>
                                              <td className="px-3 py-2 text-center">
                                                {groupedItem.is_received_all ? (
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                    <Check className="w-3 h-3" /> Yes
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                                    <X className="w-3 h-3" /> No
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                  groupedItem.statuses.size === 1 ? (
                                                    [...groupedItem.statuses][0] === 'fully_returned' ? 'bg-green-100 text-green-700' :
                                                    [...groupedItem.statuses][0] === 'partial_return' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-blue-100 text-blue-700'
                                                  ) : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                  {groupedItem.statuses.size === 1 ? [...groupedItem.statuses][0]?.replace('_', ' ') : 'mixed'}
                                                </span>
                                              </td>
                                            </tr>
                                          ));
                                        })()}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination for DNs */}
              {currentDNs.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    Showing {((dnCurrentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(dnCurrentPage * PAGINATION.DEFAULT_PAGE_SIZE, currentDNs.length)} of {currentDNs.length} delivery notes
                  </span>
                  {dnTotalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDnCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={dnCurrentPage === 1}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {dnCurrentPage} of {dnTotalPages}
                      </span>
                      <button
                        onClick={() => setDnCurrentPage(prev => Math.min(prev + 1, dnTotalPages))}
                        disabled={dnCurrentPage === dnTotalPages}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ==================== MODALS ==================== */}

      {/* Detail Modal */}
      {showDetailModal && selectedRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Requisition Details - {selectedRequisition.requisition_code}
              </h2>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[selectedRequisition.status]}`}>
                  {STATUS_LABELS[selectedRequisition.status]}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${URGENCY_COLORS[selectedRequisition.urgency]}`}>
                  {URGENCY_LABELS[selectedRequisition.urgency]}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Request Details</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-500">Project</span>
                      <p className="font-medium">{selectedRequisition.project_name}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Required Date</span>
                      <p className="font-medium">{formatDate(selectedRequisition.required_date)}</p>
                    </div>
                  </div>
                  {selectedRequisition.site_location && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">Site Location</span>
                      <p className="font-medium">{selectedRequisition.site_location}</p>
                    </div>
                  )}
                  <div className="mt-3">
                    <span className="text-xs text-gray-500 uppercase font-medium">Requested Items</span>
                    {selectedRequisition.items && selectedRequisition.items.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {selectedRequisition.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-2 rounded border">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-5">{idx + 1}.</span>
                              <span className="font-medium">{item.category_name || item.category_code}</span>
                            </div>
                            <span className="text-gray-600">{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 bg-white p-2 rounded border">
                        <p className="font-medium">{selectedRequisition.category_name}</p>
                        <p className="text-sm text-gray-600 mt-1">Quantity: {selectedRequisition.quantity}</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Purpose</span>
                    <p className="font-medium">{selectedRequisition.purpose}</p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Requester</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium">{selectedRequisition.requested_by_name}</p>
                  <p className="text-sm text-gray-500">Requested: {formatDateTime(selectedRequisition.requested_at)}</p>
                </div>
              </div>
              {selectedRequisition.pm_reviewed_at && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">PM Review</h3>
                  <div className={`rounded-lg p-4 ${selectedRequisition.pm_decision === 'approved' ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {selectedRequisition.pm_decision === 'approved' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className={`font-medium ${selectedRequisition.pm_decision === 'approved' ? 'text-green-700' : 'text-red-700'}`}>
                        {selectedRequisition.pm_decision === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </div>
                    <p className="text-sm">By: {selectedRequisition.pm_reviewed_by_name}</p>
                    <p className="text-sm text-gray-600">On: {formatDateTime(selectedRequisition.pm_reviewed_at)}</p>
                  </div>
                </div>
              )}
              {selectedRequisition.dispatched_at && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Dispatch Details</h3>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Truck className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-700">Dispatched</span>
                    </div>
                    <p className="text-sm">By: {selectedRequisition.dispatched_by_name}</p>
                    <p className="text-sm text-gray-600">On: {formatDateTime(selectedRequisition.dispatched_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && selectedRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {actionType === 'approve' && 'Approve Requisition'}
                {actionType === 'reject' && 'Reject Requisition'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {selectedRequisition.requisition_code} - {selectedRequisition.items && selectedRequisition.items.length > 0
                  ? `${selectedRequisition.total_items || selectedRequisition.items.length} item(s)`
                  : selectedRequisition.category_name}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {actionType === 'reject' && (
                <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                  <p className="text-sm text-red-700">
                    This action cannot be undone. The requester will be notified of the rejection.
                  </p>
                </div>
              )}
              {actionType === 'reject' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    placeholder="Please provide a reason for rejection..."
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {actionType === 'reject' ? 'Additional Notes' : 'Notes'} (Optional)
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Add any notes..."
                />
              </div>
            </div>
            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowActionModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                disabled={submitting}
              >
                Cancel
              </button>
              {actionType === 'approve' && (
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve
                </button>
              )}
              {actionType === 'reject' && (
                <button
                  onClick={handleReject}
                  disabled={submitting || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetDispatch;
