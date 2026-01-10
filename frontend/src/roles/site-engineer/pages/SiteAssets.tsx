import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CubeIcon,
  BuildingOfficeIcon,
  WrenchScrewdriverIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  DocumentTextIcon,
  CheckIcon,
  PaperAirplaneIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showError, showSuccess } from '@/utils/toastHelper';
import { apiClient, API_BASE_URL } from '@/api/config';
import {
  AssetRequisition,
  CreateRequisitionPayload,
  getMyRequisitions,
  createAssetRequisition,
  confirmRequisitionReceipt,
  cancelRequisition,
  sendToPM,
  updateRequisition,
  STATUS_LABELS,
  STATUS_COLORS,
  URGENCY_LABELS,
  URGENCY_COLORS,
  Urgency,
  canSendToPM,
  canEditRequisition,
  canCancelRequisition,
} from '../services/assetRequisitionService';

// Types - Updated for ADN flow
interface DispatchedAsset {
  adn_id: number;
  adn_number: string;
  adn_item_id: number;
  adn_status?: string;  // ADN-level status (IN_TRANSIT, PARTIAL, DELIVERED)
  receiver_notes?: string;  // Notes from partial receive
  category_id: number;
  category_code: string;
  category_name: string;
  asset_item_id?: number;
  item_code?: string;
  serial_number?: string;
  project_id: number;
  project_name: string;
  quantity: number;
  condition?: string;
  dispatched_at: string;
  dispatched_by: string;
  delivery_date?: string;
  is_received: boolean;
  received_at?: string;
  received_by?: string;
}

// Grouped ADN type
interface GroupedADN {
  adn_id: number;
  adn_number: string;
  adn_status?: string;  // ADN-level status
  receiver_notes?: string;  // Notes from partial receive
  project_id: number;
  project_name: string;
  dispatched_at: string;
  dispatched_by: string;
  items: DispatchedAsset[];
}

interface AssetHistory {
  movement_id: number;
  category_name: string;
  category_code: string;
  item_code?: string;
  movement_type: 'DISPATCH' | 'RETURN';
  project_id: number;
  project_name: string;
  quantity: number;
  dispatched_at?: string;
  dispatched_by?: string;
  returned_at?: string;
  returned_by?: string;
  condition_before?: string;
  condition_after?: string;
  notes?: string;
  created_at: string;
}

// Return Note (ARDN) type for SE's return notes list
interface MyReturnNote {
  ardn_id: number;
  ardn_number: string;
  project_id: number;
  project_name?: string;
  status: 'DRAFT' | 'ISSUED' | 'IN_TRANSIT' | 'RECEIVED' | 'PROCESSED' | 'CANCELLED';
  return_date: string;
  return_reason?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  notes?: string;
  total_items: number;
  items: Array<{
    return_item_id: number;
    category_name: string;
    item_code?: string;
    quantity: number;
    reported_condition: string;
    damage_description?: string;
  }>;
}

// Multi-item requisition type
interface RequisitionItem {
  id: number;
  category_id: number;
  category_code: string;
  category_name: string;
  quantity: number;
  available_quantity: number;
}

// Project type for filtering
interface ProjectOption {
  project_id: number;
  project_name: string;
  project_code: string;
  location?: string;
  my_completion_requested?: boolean;
  my_work_confirmed?: boolean;
}

// Constants for colors - Simplified professional neutral palette
const CONDITION_COLORS: Record<string, string> = {
  good: 'bg-gray-100 text-gray-800 border-gray-300',
  fair: 'bg-gray-100 text-gray-800 border-gray-300',
  poor: 'bg-gray-100 text-gray-800 border-gray-300',
  damaged: 'bg-gray-100 text-gray-800 border-gray-300',
  default: 'bg-gray-100 text-gray-800 border-gray-300'
};

const ARDN_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ISSUED: 'bg-gray-200 text-gray-800',
  IN_TRANSIT: 'bg-gray-200 text-gray-800',
  RECEIVED: 'bg-gray-300 text-gray-900',
  PROCESSED: 'bg-gray-300 text-gray-900',
  CANCELLED: 'bg-gray-100 text-gray-600'
};

const getConditionColor = (condition: string): string => {
  return CONDITION_COLORS[condition?.toLowerCase()] || CONDITION_COLORS.default;
};

const SiteAssets: React.FC = () => {
  const [pendingReceipt, setPendingReceipt] = useState<DispatchedAsset[]>([]);
  const [received, setReceived] = useState<DispatchedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingReceived, setMarkingReceived] = useState<number | null>(null);

  // Checkbox state for pending items - track by adn_item_id
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  // Partial receive modal state
  const [showPartialReceiveModal, setShowPartialReceiveModal] = useState(false);
  const [partialReceiveADN, setPartialReceiveADN] = useState<GroupedADN | null>(null);
  const [partialReceiveNotes, setPartialReceiveNotes] = useState('');

  // Return request modal state - now supports bulk return
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnADN, setReturnADN] = useState<GroupedADN | null>(null);
  const [returnItems, setReturnItems] = useState<DispatchedAsset[]>([]);
  const [returnItemConditions, setReturnItemConditions] = useState<Record<number, { condition: string; damage_description: string; quantity: number }>>({});
  const [returnNotes, setReturnNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Checkbox state for received items (for return selection)
  const [checkedReturnItems, setCheckedReturnItems] = useState<Set<number>>(new Set());

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Expanded ADN state
  const [expandedADNs, setExpandedADNs] = useState<Set<number>>(new Set());

  // My Return Notes state
  const [myReturnNotes, setMyReturnNotes] = useState<MyReturnNote[]>([]);
  const [showMyReturns, setShowMyReturns] = useState(true);
  const [expandedARDNs, setExpandedARDNs] = useState<Set<number>>(new Set());
  const [processingARDN, setProcessingARDN] = useState<number | null>(null);

  // Dispatch modal state
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchARDN, setDispatchARDN] = useState<MyReturnNote | null>(null);
  const [dispatchDriverName, setDispatchDriverName] = useState('');
  const [dispatchVehicleNumber, setDispatchVehicleNumber] = useState('');
  const [dispatchDriverContact, setDispatchDriverContact] = useState('');

  // Asset Requisition state
  const [requisitions, setRequisitions] = useState<AssetRequisition[]>([]);
  const [showRequisitionModal, setShowRequisitionModal] = useState(false);
  const [requisitionForm, setRequisitionForm] = useState<CreateRequisitionPayload>({
    project_id: 0,
    category_id: 0,
    quantity: 1,
    required_date: '',
    urgency: 'normal',
    purpose: '',
    site_location: ''
  });
  const [assetCategories, setAssetCategories] = useState<Array<{category_id: number; category_code: string; category_name: string; tracking_mode: string; available_quantity: number}>>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [submittingRequisition, setSubmittingRequisition] = useState(false);
  const [confirmReceiptReqId, setConfirmReceiptReqId] = useState<number | null>(null);
  const [receiptNotes, setReceiptNotes] = useState('');

  // Edit requisition modal state
  const [showEditReqModal, setShowEditReqModal] = useState(false);
  const [editRequisition, setEditRequisition] = useState<AssetRequisition | null>(null);
  const [editProjectId, setEditProjectId] = useState<number>(0);
  const [editPurpose, setEditPurpose] = useState('');
  const [editRequiredDate, setEditRequiredDate] = useState('');
  const [editUrgency, setEditUrgency] = useState<Urgency>('normal');
  const [editSiteLocation, setEditSiteLocation] = useState('');
  const [editItems, setEditItems] = useState<Array<{category_id: number; category_name: string; quantity: number}>>([]);

  // Confirmation modal state
  const [showConfirmSendPM, setShowConfirmSendPM] = useState(false);
  const [pendingSendRequisition, setPendingSendRequisition] = useState<AssetRequisition | null>(null);

  // Requisition sub-tab state
  type ReqSubTab = 'draft' | 'pending' | 'rejected' | 'dispatched' | 'completed';
  const [reqSubTab, setReqSubTab] = useState<ReqSubTab>('draft');

  // Get current user ID from localStorage
  const currentUserId = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.user_id || 0;
    } catch {
      return 0;
    }
  }, []);

  // Filter requisitions by sub-tab
  const filteredRequisitions = useMemo(() => {
    const statusMap: Record<ReqSubTab, string[]> = {
      draft: ['draft'],
      pending: ['pending_pm', 'pending_prod_mgr', 'pm_approved', 'prod_mgr_approved'],
      rejected: ['pm_rejected', 'prod_mgr_rejected'],
      dispatched: ['dispatched'],
      completed: ['completed'],
    };
    return requisitions.filter(r => statusMap[reqSubTab]?.includes(r.status));
  }, [requisitions, reqSubTab]);

  // Count requisitions by status for sub-tabs
  const reqStatusCounts = useMemo(() => ({
    draft: requisitions.filter(r => r.status === 'draft').length,
    pending: requisitions.filter(r => ['pending_pm', 'pending_prod_mgr', 'pm_approved', 'prod_mgr_approved'].includes(r.status)).length,
    rejected: requisitions.filter(r => ['pm_rejected', 'prod_mgr_rejected'].includes(r.status)).length,
    dispatched: requisitions.filter(r => r.status === 'dispatched').length,
    completed: requisitions.filter(r => r.status === 'completed').length,
  }), [requisitions]);

  // Multi-item requisition state
  const [requisitionItems, setRequisitionItems] = useState<RequisitionItem[]>([]);
  const [itemIdCounter, setItemIdCounter] = useState(0); // Counter for unique IDs

  // Category search state
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Tab state for organized navigation
  type TabType = 'assets' | 'requisitions' | 'returns' | 'history';
  const [activeTab, setActiveTab] = useState<TabType>('assets');

  // Loading states for each tab
  const [loadingRequisitions, setLoadingRequisitions] = useState(false);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [requisitionsLoaded, setRequisitionsLoaded] = useState(false);
  const [returnsLoaded, setReturnsLoaded] = useState(false);

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      // Use new ADN-based endpoint
      const response = await apiClient.get('/assets/se/dispatched-assets');
      const data = response.data.data || {};
      setPendingReceipt(data.pending_receipt || []);
      setReceived(data.received || []);
      // Reset checked items on refresh
      setCheckedItems(new Set());
    } catch (err) {
      console.error('Error fetching dispatched assets:', err);
      showError('Failed to load dispatched assets');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch my asset requisitions
  const fetchRequisitions = async () => {
    try {
      setLoadingRequisitions(true);
      const data = await getMyRequisitions();
      setRequisitions(data);
      setRequisitionsLoaded(true);
    } catch (err) {
      console.error('Error fetching requisitions:', err);
    } finally {
      setLoadingRequisitions(false);
    }
  };

  // Fetch categories and projects for requisition form
  const fetchRequisitionFormData = async () => {
    try {
      const [categoriesRes, projectsRes] = await Promise.all([
        apiClient.get('/assets/categories'),
        apiClient.get('/se_ongoing_projects')  // Use SE ongoing projects with completion status
      ]);
      const cats = categoriesRes.data?.categories || categoriesRes.data?.data || [];
      setAssetCategories(cats);
      // Handle response from se_ongoing_projects endpoint
      const allProjects: ProjectOption[] = projectsRes.data?.projects || projectsRes.data?.data || projectsRes.data || [];
      // Filter out projects that are pending approval or confirmed
      const activeProjects = allProjects.filter((p: ProjectOption) =>
        !p.my_completion_requested &&  // Not sent for approval
        !p.my_work_confirmed           // Not confirmed by PM
      );
      setProjects(activeProjects);
    } catch (err) {
      // Silent fail - form will show empty dropdowns
    }
  };

  // Open requisition modal
  const openRequisitionModal = () => {
    fetchRequisitionFormData();
    setRequisitionForm({
      project_id: 0,
      category_id: 0,
      quantity: 1,
      required_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      urgency: 'normal',
      purpose: '',
      site_location: ''
    });
    setRequisitionItems([]); // Reset items list
    setItemIdCounter(0); // Reset ID counter
    setCategorySearch('');
    setShowCategoryDropdown(false);
    setShowRequisitionModal(true);
  };

  // Add item to requisition list (or update quantity if already exists)
  const addItemToRequisition = () => {
    if (!requisitionForm.category_id) {
      showError('Please select a category');
      return;
    }
    if (requisitionForm.quantity < 1) {
      showError('Quantity must be at least 1');
      return;
    }

    const category = assetCategories.find(c => c.category_id === requisitionForm.category_id);
    if (!category) return;

    const availableQty = category.available_quantity ?? 0;

    // Check if category already in list - if so, update quantity
    const existingItem = requisitionItems.find(item => item.category_id === requisitionForm.category_id);
    if (existingItem) {
      const newQty = existingItem.quantity + requisitionForm.quantity;

      // Validate against available quantity
      if (newQty > availableQty) {
        showError(`Cannot exceed available quantity (${availableQty}) for ${category.category_name}`);
        return;
      }

      showSuccess(`Updated ${category.category_name} quantity to ${newQty}`);
      setRequisitionItems(prev => prev.map(item =>
        item.category_id === requisitionForm.category_id
          ? { ...item, quantity: newQty }
          : item
      ));
    } else {
      // Validate quantity against available for new item
      if (requisitionForm.quantity > availableQty) {
        showError(`Cannot exceed available quantity (${availableQty}) for ${category.category_name}`);
        return;
      }

      const newItem: RequisitionItem = {
        id: Date.now() + itemIdCounter,
        category_id: category.category_id,
        category_code: category.category_code,
        category_name: category.category_name,
        quantity: requisitionForm.quantity,
        available_quantity: availableQty
      };
      setRequisitionItems(prev => [...prev, newItem]);
      setItemIdCounter(prev => prev + 1);
      showSuccess(`Added ${category.category_name} to requisition`);
    }

    // Reset category selection for next item
    setRequisitionForm(prev => ({ ...prev, category_id: 0, quantity: 1 }));
    setCategorySearch('');
  };

  // Check if category is already in list
  const getCategoryInListQty = (categoryId: number): number | null => {
    const item = requisitionItems.find(i => i.category_id === categoryId);
    return item ? item.quantity : null;
  };

  // Remove item from requisition list
  const removeItemFromRequisition = (itemId: number) => {
    setRequisitionItems(prev => prev.filter(item => item.id !== itemId));
  };

  // Update item quantity in requisition list
  const updateItemQuantity = (itemId: number, quantity: number) => {
    if (quantity < 1) return;

    const item = requisitionItems.find(i => i.id === itemId);
    if (!item) return;

    const availableQty = item.available_quantity ?? 0;
    if (quantity > availableQty) {
      showError(`Cannot exceed available quantity (${availableQty}) for ${item.category_name}`);
      return;
    }

    setRequisitionItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, quantity } : i
    ));
  };

  // Submit requisition (single request with multiple items)
  const handleSubmitRequisition = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if we have items in the list OR a single item selected
    const hasListItems = requisitionItems.length > 0;
    const hasSingleItem = requisitionForm.category_id > 0;

    if (!hasListItems && !hasSingleItem) {
      showError('Please add at least one item to your request');
      return;
    }
    if (!requisitionForm.project_id || !requisitionForm.purpose.trim() || !requisitionForm.site_location?.trim()) {
      showError('Please fill all required fields (Project, Purpose, and Site Location)');
      return;
    }

    setSubmittingRequisition(true);
    try {
      // Build items array for submission
      let itemsToSubmit = [...requisitionItems];

      // If there's a current selection but not added to list, add it now
      if (hasSingleItem && !requisitionItems.some(item => item.category_id === requisitionForm.category_id)) {
        const category = assetCategories.find(c => c.category_id === requisitionForm.category_id);
        if (category) {
          itemsToSubmit.push({
            id: Date.now(),
            category_id: category.category_id,
            category_code: category.category_code,
            category_name: category.category_name,
            quantity: requisitionForm.quantity,
            available_quantity: category.available_quantity ?? 0
          });
        }
      }

      // Convert to API payload format (items array)
      const itemsPayload = itemsToSubmit.map(item => ({
        category_id: item.category_id,
        quantity: item.quantity
      }));

      // Submit single requisition with all items
      await createAssetRequisition({
        project_id: requisitionForm.project_id,
        items: itemsPayload,
        required_date: requisitionForm.required_date,
        urgency: requisitionForm.urgency,
        purpose: requisitionForm.purpose,
        site_location: requisitionForm.site_location
      });

      const itemCount = itemsToSubmit.length;
      const totalQty = itemsToSubmit.reduce((sum, item) => sum + item.quantity, 0);
      showSuccess(`Requisition submitted with ${itemCount} item${itemCount > 1 ? 's' : ''} (${totalQty} total qty)`);

      setShowRequisitionModal(false);
      setRequisitionItems([]);
      fetchRequisitions();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to submit requisition';
      showError(errMsg);
    } finally {
      setSubmittingRequisition(false);
    }
  };

  // Cancel requisition
  const handleCancelRequisition = async (reqId: number) => {
    if (!confirm('Are you sure you want to cancel this requisition?')) return;
    try {
      await cancelRequisition(reqId);
      showSuccess('Requisition cancelled');
      fetchRequisitions();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to cancel requisition';
      showError(errMsg);
    }
  };

  // Send requisition to PM for approval
  const handleSendToPM = async (req: AssetRequisition) => {
    setPendingSendRequisition(req);
    setShowConfirmSendPM(true);
  };

  // Confirm and send to PM
  const confirmSendToPM = async () => {
    if (!pendingSendRequisition) return;
    setSubmittingRequisition(true);
    try {
      await sendToPM(pendingSendRequisition.requisition_id);
      showSuccess('Requisition sent to PM for approval');
      fetchRequisitions();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to send to PM';
      showError(errMsg);
    } finally {
      setSubmittingRequisition(false);
      setShowConfirmSendPM(false);
      setPendingSendRequisition(null);
    }
  };

  // Open edit requisition modal
  const openEditReqModal = (req: AssetRequisition) => {
    setEditRequisition(req);
    setEditProjectId(req.project_id || 0);
    setEditPurpose(req.purpose);
    setEditRequiredDate(req.required_date?.split('T')[0] || '');
    setEditUrgency(req.urgency);
    setEditSiteLocation(req.site_location || '');

    // Initialize items for editing
    const items = req.items && req.items.length > 0
      ? req.items.map(item => ({
          category_id: item.category_id,
          category_name: item.category_name,
          quantity: item.quantity
        }))
      : [{
          category_id: req.category_id || 0,
          category_name: req.category_name || '',
          quantity: req.quantity || 1
        }];
    setEditItems(items);

    setShowEditReqModal(true);
  };

  // Close edit requisition modal
  const closeEditReqModal = () => {
    setShowEditReqModal(false);
    setEditRequisition(null);
    setEditProjectId(0);
    setEditPurpose('');
    setEditRequiredDate('');
    setEditUrgency('normal');
    setEditSiteLocation('');
    setEditItems([]);
  };

  // Handle update requisition
  const handleUpdateRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRequisition) return;
    if (!editProjectId || editProjectId === 0) {
      showError('Please select a project');
      return;
    }
    if (!editPurpose.trim()) {
      showError('Purpose is required');
      return;
    }
    if (!editRequiredDate) {
      showError('Required date is required');
      return;
    }
    // Validate items
    if (editItems.length === 0 || editItems.some(item => item.quantity <= 0)) {
      showError('All items must have a quantity greater than 0');
      return;
    }

    setSubmittingRequisition(true);
    try {
      await updateRequisition(editRequisition.requisition_id, {
        project_id: editProjectId,
        purpose: editPurpose.trim(),
        required_date: editRequiredDate,
        urgency: editUrgency,
        site_location: editSiteLocation.trim() || undefined,
        items: editItems.map(item => ({
          category_id: item.category_id,
          quantity: item.quantity
        }))
      });
      showSuccess('Requisition updated successfully');
      closeEditReqModal();
      fetchRequisitions();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to update requisition';
      showError(errMsg);
    } finally {
      setSubmittingRequisition(false);
    }
  };

  // Confirm receipt of dispatched requisition
  const handleConfirmReceipt = async () => {
    if (!confirmReceiptReqId) return;
    try {
      await confirmRequisitionReceipt(confirmReceiptReqId, { notes: receiptNotes });
      showSuccess('Receipt confirmed');
      setConfirmReceiptReqId(null);
      setReceiptNotes('');
      fetchRequisitions();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to confirm receipt';
      showError(errMsg);
    }
  };

  // Fetch return notes created by this SE
  const fetchMyReturnNotes = async () => {
    try {
      setLoadingReturns(true);
      const response = await apiClient.get('/assets/ss_return_notes', {
        params: { per_page: 50 }
      });
      if (response.data.success) {
        // Filter to show DRAFT, ISSUED, IN_TRANSIT, and RECEIVED (so SE can see when PM receives)
        const notes = response.data.data.filter((rn: MyReturnNote) =>
          ['DRAFT', 'ISSUED', 'IN_TRANSIT', 'RECEIVED'].includes(rn.status)
        );
        setMyReturnNotes(notes);
        setReturnsLoaded(true);
      }
    } catch (err) {
      console.error('Error fetching return notes:', err);
    } finally {
      setLoadingReturns(false);
    }
  };

  // Issue return note
  const handleIssueARDN = async (ardn: MyReturnNote) => {
    setProcessingARDN(ardn.ardn_id);
    try {
      await apiClient.put(`/assets/return-notes/${ardn.ardn_id}/issue`);
      showSuccess(`Return note ${ardn.ardn_number} issued`);
      fetchMyReturnNotes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to issue return note');
    } finally {
      setProcessingARDN(null);
    }
  };

  // Open dispatch modal
  const openDispatchModal = (ardn: MyReturnNote) => {
    setDispatchARDN(ardn);
    setDispatchDriverName(ardn.driver_name || '');
    setDispatchVehicleNumber(ardn.vehicle_number || '');
    setDispatchDriverContact(ardn.driver_contact || '');
    setShowDispatchModal(true);
  };

  // Dispatch return note with driver details
  const handleDispatchARDN = async () => {
    if (!dispatchARDN) return;
    setProcessingARDN(dispatchARDN.ardn_id);
    try {
      await apiClient.put(`/assets/return-notes/${dispatchARDN.ardn_id}/dispatch`, {
        vehicle_number: dispatchVehicleNumber,
        driver_name: dispatchDriverName,
        driver_contact: dispatchDriverContact
      });
      showSuccess(`Return note ${dispatchARDN.ardn_number} dispatched`);
      setShowDispatchModal(false);
      setDispatchARDN(null);
      fetchMyReturnNotes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to dispatch return note');
    } finally {
      setProcessingARDN(null);
    }
  };

  // Download ARDN PDF
  const handleDownloadARDN = async (ardn: MyReturnNote) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to download');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/assets/return-notes/${ardn.ardn_id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to download');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ardn.ardn_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      showError('Failed to download return note PDF');
    }
  };

  // Print ARDN PDF
  const handlePrintARDN = async (ardn: MyReturnNote) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to print');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/assets/return-notes/${ardn.ardn_id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load for print');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      }
    } catch {
      showError('Failed to print return note');
    }
  };

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return assetCategories;
    const search = categorySearch.toLowerCase();
    return assetCategories.filter(c =>
      c.category_code.toLowerCase().includes(search) ||
      c.category_name.toLowerCase().includes(search)
    );
  }, [assetCategories, categorySearch]);

  // Get selected category name for display
  const selectedCategoryName = useMemo(() => {
    const cat = assetCategories.find(c => c.category_id === requisitionForm.category_id);
    return cat ? `${cat.category_code} - ${cat.category_name}` : '';
  }, [assetCategories, requisitionForm.category_id]);

  // Group pending items by ADN
  const groupedPendingADNs = useMemo((): GroupedADN[] => {
    const groups: Record<number, GroupedADN> = {};

    pendingReceipt.forEach(item => {
      if (!groups[item.adn_id]) {
        groups[item.adn_id] = {
          adn_id: item.adn_id,
          adn_number: item.adn_number,
          adn_status: item.adn_status,
          receiver_notes: item.receiver_notes,
          project_id: item.project_id,
          project_name: item.project_name,
          dispatched_at: item.dispatched_at,
          dispatched_by: item.dispatched_by,
          items: []
        };
      }
      groups[item.adn_id].items.push(item);
    });

    return Object.values(groups).sort((a, b) =>
      new Date(b.dispatched_at).getTime() - new Date(a.dispatched_at).getTime()
    );
  }, [pendingReceipt]);

  // Group received items by ADN
  const groupedReceivedADNs = useMemo((): GroupedADN[] => {
    const groups: Record<number, GroupedADN> = {};

    received.forEach(item => {
      if (!groups[item.adn_id]) {
        groups[item.adn_id] = {
          adn_id: item.adn_id,
          adn_number: item.adn_number,
          adn_status: item.adn_status,
          receiver_notes: item.receiver_notes,
          project_id: item.project_id,
          project_name: item.project_name,
          dispatched_at: item.dispatched_at,
          dispatched_by: item.dispatched_by,
          items: []
        };
      }
      groups[item.adn_id].items.push(item);
    });

    return Object.values(groups).sort((a, b) =>
      new Date(b.dispatched_at).getTime() - new Date(a.dispatched_at).getTime()
    );
  }, [received]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      // Call new ADN/ARDN movement history endpoint
      const response = await apiClient.get('/assets/se/movement-history?limit=50');
      const data = response.data.data || {};
      const movements = data.movements || [];
      setHistory(movements);
    } catch (err) {
      console.error('Error fetching history:', err);
      showError('Failed to load movement history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Auto-fetch requisitions when requisitions tab is selected
  useEffect(() => {
    if (activeTab === 'requisitions' && !requisitionsLoaded && !loadingRequisitions) {
      fetchRequisitions();
    }
  }, [activeTab, requisitionsLoaded, loadingRequisitions]);

  // Auto-fetch return notes when returns tab is selected
  useEffect(() => {
    if (activeTab === 'returns') {
      fetchMyReturnNotes();
    }
  }, [activeTab]);

  // Auto-fetch history when history tab is selected
  useEffect(() => {
    if (activeTab === 'history' && history.length === 0 && !loadingHistory) {
      fetchHistory();
    }
  }, [activeTab]);

  // Handle marking entire ADN as received (all items)
  const handleMarkAllReceived = async (adnId: number) => {
    try {
      setMarkingReceived(adnId);
      await apiClient.put(`/assets/se/receive-adn/${adnId}`);
      showSuccess('All items marked as received!');
      fetchAssets();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to mark as received');
    } finally {
      setMarkingReceived(null);
    }
  };

  // Handle marking selected items as received (selective receive)
  // If partial (not all items selected), show modal for mandatory notes
  const handleMarkSelectedReceived = (adn: GroupedADN) => {
    const selectedItemIds = adn.items
      .filter(item => checkedItems.has(item.adn_item_id))
      .map(item => item.adn_item_id);

    if (selectedItemIds.length === 0) {
      showError('Please select at least one item to receive');
      return;
    }

    // If partial receive (not all items), show modal for mandatory notes
    const isPartialReceive = selectedItemIds.length < adn.items.length;
    if (isPartialReceive) {
      setPartialReceiveADN(adn);
      setPartialReceiveNotes('');
      setShowPartialReceiveModal(true);
      return;
    }

    // If all items selected, receive directly without notes
    submitReceiveItems(adn, selectedItemIds, '');
  };

  // Submit receive items to API
  const submitReceiveItems = async (adn: GroupedADN, selectedItemIds: number[], notes: string) => {
    try {
      setMarkingReceived(adn.adn_id);
      const response = await apiClient.put('/assets/se/receive-items', {
        adn_id: adn.adn_id,
        item_ids: selectedItemIds,
        notes: notes || undefined
      });

      const data = response.data.data;
      if (data.all_received) {
        showSuccess(`All ${data.received_count} item(s) received! Delivery note complete.`);
      } else {
        showSuccess(`${data.received_count} item(s) marked as received`);
      }

      // Clear checked items for this ADN
      setCheckedItems(prev => {
        const newSet = new Set(prev);
        selectedItemIds.forEach(id => newSet.delete(id));
        return newSet;
      });

      // Close modal if open
      setShowPartialReceiveModal(false);
      setPartialReceiveADN(null);
      setPartialReceiveNotes('');

      fetchAssets();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to mark items as received');
    } finally {
      setMarkingReceived(null);
    }
  };

  // Handle partial receive confirmation from modal
  const handleConfirmPartialReceive = () => {
    if (!partialReceiveADN) return;

    if (!partialReceiveNotes.trim()) {
      showError('Please provide a reason for partial receive');
      return;
    }

    const selectedItemIds = partialReceiveADN.items
      .filter(item => checkedItems.has(item.adn_item_id))
      .map(item => item.adn_item_id);

    submitReceiveItems(partialReceiveADN, selectedItemIds, partialReceiveNotes.trim());
  };

  // Get count of checked items in an ADN
  const getCheckedCountInADN = (adn: GroupedADN): number => {
    return adn.items.filter(item => checkedItems.has(item.adn_item_id)).length;
  };

  // Toggle checkbox for an item
  const toggleItemCheck = (itemId: number) => {
    setCheckedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Toggle all items in an ADN
  const toggleAllInADN = (adn: GroupedADN) => {
    const allItemIds = adn.items.map(i => i.adn_item_id);
    const allChecked = allItemIds.every(id => checkedItems.has(id));

    setCheckedItems(prev => {
      const newSet = new Set(prev);
      if (allChecked) {
        // Uncheck all
        allItemIds.forEach(id => newSet.delete(id));
      } else {
        // Check all
        allItemIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Check if all items in ADN are checked
  const isAllCheckedInADN = (adn: GroupedADN): boolean => {
    return adn.items.every(item => checkedItems.has(item.adn_item_id));
  };

  // Check if some items in ADN are checked
  const isSomeCheckedInADN = (adn: GroupedADN): boolean => {
    return adn.items.some(item => checkedItems.has(item.adn_item_id)) &&
           !adn.items.every(item => checkedItems.has(item.adn_item_id));
  };

  // Toggle ADN expansion
  const toggleADNExpansion = (adnId: number) => {
    setExpandedADNs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(adnId)) {
        newSet.delete(adnId);
      } else {
        newSet.add(adnId);
      }
      return newSet;
    });
  };

  // Toggle return item checkbox
  const toggleReturnItemCheck = (itemId: number) => {
    setCheckedReturnItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Toggle all return items in an ADN
  const toggleAllReturnInADN = (adn: GroupedADN) => {
    const allItemIds = adn.items.map(i => i.adn_item_id);
    const allChecked = allItemIds.every(id => checkedReturnItems.has(id));

    setCheckedReturnItems(prev => {
      const newSet = new Set(prev);
      if (allChecked) {
        allItemIds.forEach(id => newSet.delete(id));
      } else {
        allItemIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Check if all return items in ADN are checked
  const isAllReturnCheckedInADN = (adn: GroupedADN): boolean => {
    return adn.items.every(item => checkedReturnItems.has(item.adn_item_id));
  };

  // Check if some return items in ADN are checked
  const isSomeReturnCheckedInADN = (adn: GroupedADN): boolean => {
    return adn.items.some(item => checkedReturnItems.has(item.adn_item_id)) &&
           !adn.items.every(item => checkedReturnItems.has(item.adn_item_id));
  };

  // Get count of checked return items in an ADN
  const getCheckedReturnCountInADN = (adn: GroupedADN): number => {
    return adn.items.filter(item => checkedReturnItems.has(item.adn_item_id)).length;
  };

  // Open bulk return modal for selected items in an ADN
  const openBulkReturnModal = (adn: GroupedADN) => {
    const selectedItems = adn.items.filter(item => checkedReturnItems.has(item.adn_item_id));
    if (selectedItems.length === 0) {
      showError('Please select at least one item to return');
      return;
    }

    // Initialize conditions for each item with quantity
    const conditions: Record<number, { condition: string; damage_description: string; quantity: number }> = {};
    selectedItems.forEach(item => {
      conditions[item.adn_item_id] = { condition: 'good', damage_description: '', quantity: item.quantity };
    });

    setReturnADN(adn);
    setReturnItems(selectedItems);
    setReturnItemConditions(conditions);
    setReturnNotes('');
    setShowReturnModal(true);
  };

  // Open return modal for single item
  const openSingleReturnModal = (adn: GroupedADN, item: DispatchedAsset) => {
    const conditions: Record<number, { condition: string; damage_description: string; quantity: number }> = {
      [item.adn_item_id]: { condition: 'good', damage_description: '', quantity: item.quantity }
    };

    setReturnADN(adn);
    setReturnItems([item]);
    setReturnItemConditions(conditions);
    setReturnNotes('');
    setShowReturnModal(true);
  };

  // Update condition for a specific item
  const updateItemCondition = (itemId: number, field: 'condition' | 'damage_description' | 'quantity', value: string | number) => {
    setReturnItemConditions(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  const handleBulkReturnRequest = async () => {
    if (!returnADN || returnItems.length === 0) return;

    // Validate - if any item is not 'good', it needs a damage description
    const invalidItems = returnItems.filter(item => {
      const cond = returnItemConditions[item.adn_item_id];
      return cond.condition !== 'good' && !cond.damage_description.trim();
    });

    if (invalidItems.length > 0) {
      showError(`Please provide damage description for items with condition other than "good"`);
      return;
    }

    // Validate quantity
    const invalidQuantityItems = returnItems.filter(item => {
      const cond = returnItemConditions[item.adn_item_id];
      return !cond.quantity || cond.quantity <= 0 || cond.quantity > item.quantity;
    });

    if (invalidQuantityItems.length > 0) {
      showError(`Please enter valid return quantity (1 to available quantity)`);
      return;
    }

    try {
      setSubmitting(true);

      // Create return note via ARDN flow with multiple items
      const payload = {
        project_id: returnADN.project_id,
        original_adn_id: returnADN.adn_id,
        return_reason: returnNotes || 'Return request',
        notes: returnNotes,
        items: returnItems.map(item => {
          const cond = returnItemConditions[item.adn_item_id];
          return {
            category_id: item.category_id,
            asset_item_id: item.asset_item_id,
            original_adn_item_id: item.adn_item_id,
            quantity: cond.quantity,
            reported_condition: cond.condition,
            damage_description: cond.condition !== 'good' ? cond.damage_description : undefined,
            notes: returnNotes
          };
        })
      };

      const response = await apiClient.post('/assets/return-notes', payload);

      showSuccess(`Return note created: ${response.data.data?.ardn_number || 'Success'} with ${returnItems.length} item(s)`);
      setShowReturnModal(false);
      setReturnADN(null);
      setReturnItems([]);
      setReturnItemConditions({});
      setReturnNotes('');
      // Clear checked items for this ADN
      setCheckedReturnItems(prev => {
        const newSet = new Set(prev);
        returnItems.forEach(item => newSet.delete(item.adn_item_id));
        return newSet;
      });
      fetchAssets();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to create return request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <CubeIcon className="w-6 h-6 text-gray-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Site Assets</h1>
                <p className="text-sm text-gray-600">Track dispatched assets at your project sites</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openRequisitionModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <PlusIcon className="w-4 h-4" />
                Request Asset
              </button>
              <button
                onClick={fetchAssets}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-6 flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('assets')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'assets'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <CubeIcon className="w-4 h-4" />
              <span>My Assets</span>
              {(groupedPendingADNs.length > 0 || groupedReceivedADNs.length > 0) && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  activeTab === 'assets' ? 'bg-gray-200 text-gray-800' : 'bg-gray-200 text-gray-600'
                }`}>
                  {groupedPendingADNs.length + groupedReceivedADNs.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('requisitions')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'requisitions'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <DocumentTextIcon className="w-4 h-4" />
              <span>Requisitions</span>
              {requisitions.length > 0 && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  activeTab === 'requisitions' ? 'bg-gray-200 text-gray-800' : 'bg-gray-200 text-gray-600'
                }`}>
                  {requisitions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('returns')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'returns'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <ArrowUturnLeftIcon className="w-4 h-4" />
              <span>Returns</span>
              {myReturnNotes.length > 0 && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  activeTab === 'returns' ? 'bg-gray-200 text-gray-800' : 'bg-gray-200 text-gray-600'
                }`}>
                  {myReturnNotes.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <ClockIcon className="w-4 h-4" />
              <span>History</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ==================== ASSETS TAB ==================== */}
        {activeTab === 'assets' && (
          <>
            {/* Pending Receipt Section - Grouped by ADN */}
        {groupedPendingADNs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border-2 border-gray-300 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <TruckIcon className="w-5 h-5" />
                Dispatched - Pending Your Receipt
              </h3>
              <p className="text-sm text-gray-700 mt-1">
                Review items and mark delivery notes as received. All items in a delivery note will be marked received together.
              </p>
            </div>

            <div className="divide-y divide-gray-200">
              {groupedPendingADNs.map((adn) => {
                const isExpanded = expandedADNs.has(adn.adn_id);
                const allChecked = isAllCheckedInADN(adn);
                const someChecked = isSomeCheckedInADN(adn);

                return (
                  <div key={adn.adn_id} className="bg-white">
                    {/* ADN Header */}
                    <div className="px-5 py-4 bg-gray-50/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Select All Checkbox */}
                          <button
                            role="checkbox"
                            aria-checked={allChecked ? 'true' : someChecked ? 'mixed' : 'false'}
                            aria-label={`Select all items in ${adn.adn_number}`}
                            onClick={() => toggleAllInADN(adn)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              allChecked
                                ? 'bg-gray-500 border-gray-500'
                                : someChecked
                                  ? 'bg-gray-200 border-gray-500'
                                  : 'bg-white border-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {(allChecked || someChecked) && (
                              <CheckIcon className={`w-3 h-3 ${allChecked ? 'text-white' : 'text-gray-800'}`} />
                            )}
                          </button>

                          <button
                            onClick={() => toggleADNExpansion(adn.adn_id)}
                            className="flex items-center gap-2 hover:bg-gray-100 rounded-lg px-2 py-1 -ml-2 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUpIcon className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                            )}
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-gray-800">{adn.adn_number}</span>
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-900 rounded-full text-xs font-medium">
                                  {adn.items.length} item{adn.items.length !== 1 ? 's' : ''}
                                </span>
                                {adn.adn_status === 'PARTIAL' && (
                                  <span className="px-2 py-0.5 bg-gray-200 text-gray-900 rounded-full text-xs font-medium">
                                    Partial
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                <span className="font-medium">{adn.project_name}</span>
                                <span className="text-gray-400 mx-2">•</span>
                                <span className="text-xs">
                                  Dispatched: {new Date(adn.dispatched_at).toLocaleDateString()} at {new Date(adn.dispatched_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                              </p>
                            </div>
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Show "Receive Selected" when some items are checked */}
                          {getCheckedCountInADN(adn) > 0 && getCheckedCountInADN(adn) < adn.items.length && (
                            <button
                              onClick={() => handleMarkSelectedReceived(adn)}
                              disabled={markingReceived === adn.adn_id}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
                            >
                              {markingReceived === adn.adn_id ? (
                                <>
                                  <ModernLoadingSpinners size="xs" />
                                  Marking...
                                </>
                              ) : (
                                <>
                                  <CheckCircleIcon className="w-4 h-4" />
                                  Receive Selected ({getCheckedCountInADN(adn)})
                                </>
                              )}
                            </button>
                          )}
                          {/* Show "Receive All" button */}
                          <button
                            onClick={() => getCheckedCountInADN(adn) === adn.items.length
                              ? handleMarkSelectedReceived(adn)
                              : handleMarkAllReceived(adn.adn_id)}
                            disabled={markingReceived === adn.adn_id}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
                          >
                            {markingReceived === adn.adn_id && getCheckedCountInADN(adn) !== adn.items.length ? (
                              <>
                                <ModernLoadingSpinners size="xs" />
                                Marking...
                              </>
                            ) : (
                              <>
                                <CheckCircleIcon className="w-4 h-4" />
                                Receive All
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Items List */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 py-2 bg-gray-50 border-t border-gray-200">
                            {/* Show partial receive notes at top of items if ADN is PARTIAL */}
                            {adn.adn_status === 'PARTIAL' && adn.receiver_notes && (
                              <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-gray-900 uppercase mb-1">
                                  Why these items are pending
                                </p>
                                <p className="text-sm text-gray-800">{adn.receiver_notes}</p>
                              </div>
                            )}
                            <div className="divide-y divide-gray-100">
                              {adn.items.map((item) => (
                                <div
                                  key={item.adn_item_id}
                                  onClick={() => toggleItemCheck(item.adn_item_id)}
                                  className={`py-3 px-2 flex items-center gap-3 transition-colors cursor-pointer hover:bg-gray-100 rounded-lg ${
                                    checkedItems.has(item.adn_item_id) ? 'bg-gray-50/50 hover:bg-gray-100/50' : ''
                                  }`}
                                >
                                  {/* Item Checkbox */}
                                  <div
                                    role="checkbox"
                                    aria-checked={checkedItems.has(item.adn_item_id)}
                                    aria-label={`Select ${item.category_name}`}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                                      checkedItems.has(item.adn_item_id)
                                        ? 'bg-gray-500 border-gray-500'
                                        : 'bg-white border-gray-300'
                                    }`}
                                  >
                                    {checkedItems.has(item.adn_item_id) && (
                                      <CheckIcon className="w-3 h-3 text-white" />
                                    )}
                                  </div>

                                  <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                                    <CubeIcon className="w-4 h-4 text-gray-700" />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 text-sm">{item.category_name}</p>
                                    <p className="text-xs text-gray-500">
                                      {item.quantity} unit(s) • {item.item_code || item.serial_number || item.category_code}
                                      {item.condition && <span className="ml-2">• Condition: {item.condition}</span>}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Received Section - Grouped by ADN */}
        {groupedReceivedADNs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border-2 border-gray-300 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5" />
                Received at Your Sites
              </h3>
              <p className="text-sm text-gray-700 mt-1">Select items to create a Return Delivery Note (RDN). You can return multiple items at once.</p>
            </div>

            <div className="divide-y divide-gray-200">
              {groupedReceivedADNs.map((adn) => {
                const isExpanded = expandedADNs.has(adn.adn_id);
                const allReturnChecked = isAllReturnCheckedInADN(adn);
                const someReturnChecked = isSomeReturnCheckedInADN(adn);
                const checkedReturnCount = getCheckedReturnCountInADN(adn);

                return (
                  <div key={adn.adn_id} className="bg-white">
                    {/* ADN Header */}
                    <div className="px-5 py-4 bg-gray-50/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Select All Checkbox for Return */}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={allReturnChecked ? 'true' : someReturnChecked ? 'mixed' : 'false'}
                            aria-label={`Select all items in ${adn.adn_number} for return`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleAllReturnInADN(adn);
                            }}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              allReturnChecked
                                ? 'bg-gray-500 border-gray-500'
                                : someReturnChecked
                                  ? 'bg-gray-200 border-gray-500'
                                  : 'bg-white border-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {(allReturnChecked || someReturnChecked) && (
                              <CheckIcon className={`w-3 h-3 ${allReturnChecked ? 'text-white' : 'text-gray-800'}`} />
                            )}
                          </button>

                          <button
                            onClick={() => toggleADNExpansion(adn.adn_id)}
                            className="flex items-center gap-2 hover:bg-gray-100 rounded-lg px-2 py-1 -ml-2 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUpIcon className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                            )}
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-gray-800">{adn.adn_number}</span>
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-900 rounded-full text-xs font-medium">
                                  {adn.items.length} item{adn.items.length !== 1 ? 's' : ''}
                                </span>
                                {adn.adn_status === 'PARTIAL' && (
                                  <span className="px-2 py-0.5 bg-gray-200 text-gray-900 rounded-full text-xs font-medium">
                                    Partial DN
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                <span className="font-medium">{adn.project_name}</span>
                              </p>
                            </div>
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Show "Return Selected" when items are checked */}
                          {checkedReturnCount > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openBulkReturnModal(adn);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium shadow-sm"
                            >
                              <ArrowUturnLeftIcon className="w-4 h-4" />
                              Return Selected ({checkedReturnCount})
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Items List */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 py-2 bg-gray-50 border-t border-gray-200">
                            {/* Show partial receive notes if ADN had partial receive */}
                            {adn.adn_status === 'PARTIAL' && adn.receiver_notes && (
                              <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-gray-900 uppercase mb-1">
                                  Partial Receive Notes (some items still pending)
                                </p>
                                <p className="text-sm text-gray-800">{adn.receiver_notes}</p>
                              </div>
                            )}
                            <div className="divide-y divide-gray-100">
                              {adn.items.map((item) => (
                                <div
                                  key={item.adn_item_id}
                                  onClick={() => toggleReturnItemCheck(item.adn_item_id)}
                                  className={`py-3 px-2 flex items-center gap-3 transition-colors cursor-pointer hover:bg-gray-100 rounded-lg ${
                                    checkedReturnItems.has(item.adn_item_id) ? 'bg-gray-50/50 hover:bg-gray-100/50' : ''
                                  }`}
                                >
                                  {/* Item Checkbox */}
                                  <div
                                    role="checkbox"
                                    aria-checked={checkedReturnItems.has(item.adn_item_id)}
                                    aria-label={`Select ${item.category_name} for return`}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                                      checkedReturnItems.has(item.adn_item_id)
                                        ? 'bg-gray-500 border-gray-500'
                                        : 'bg-white border-gray-300'
                                    }`}
                                  >
                                    {checkedReturnItems.has(item.adn_item_id) && (
                                      <CheckIcon className="w-3 h-3 text-white" />
                                    )}
                                  </div>

                                  <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                                    <CubeIcon className="w-4 h-4 text-gray-700" />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 text-sm">{item.category_name}</p>
                                    <p className="text-xs text-gray-500">
                                      {item.quantity} unit(s) • {item.item_code || item.serial_number || item.category_code}
                                    </p>
                                    {item.received_at && (
                                      <p className="text-xs text-gray-700 mt-0.5">
                                        Received: {new Date(item.received_at).toLocaleDateString()}
                                        {item.received_by && ` by ${item.received_by}`}
                                      </p>
                                    )}
                                  </div>

                                  {/* Single item return button - only show for unchecked items when not all are selected */}
                                  {!allReturnChecked && !checkedReturnItems.has(item.adn_item_id) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openSingleReturnModal(adn, item);
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                                    >
                                      <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                                      Return
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {pendingReceipt.length === 0 && received.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center"
          >
            <div className="flex flex-col items-center">
              <div className="p-4 bg-gray-100 rounded-full mb-4">
                <CubeIcon className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Assets at Your Sites</h3>
              <p className="text-gray-500 max-w-md">
                There are currently no assets dispatched to your project sites.
                Assets will appear here when they are dispatched by the Production Manager.
              </p>
            </div>
          </motion.div>
        )}

        {/* Info Note */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="p-1 bg-gray-100 rounded-full">
              <CubeIcon className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-900 font-medium">Asset Flow</p>
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-medium">1. Dispatched</span> → PM dispatches asset, you see it in yellow section<br/>
                <span className="font-medium">2. Received</span> → Select items with checkboxes, then click "Receive Selected" or "Receive All"<br/>
                <span className="font-medium">3. Return</span> → Request return for individual items when done
              </p>
            </div>
          </div>
        </div>
          </>
        )}

        {/* ==================== RETURNS TAB ==================== */}
        {activeTab === 'returns' && (
          <>
            {/* Loading State */}
            {loadingReturns && (
              <div className="flex justify-center items-center py-12">
                <ModernLoadingSpinners size="md" />
              </div>
            )}

            {/* My Return Notes Section */}
        {!loadingReturns && myReturnNotes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden"
          >
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <ArrowUturnLeftIcon className="w-5 h-5 text-gray-700" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">My Return Notes</h2>
                    <p className="text-sm text-gray-500">Track your return requests - Issue → Dispatch → Store Receives</p>
                  </div>
                </div>
                <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
                  {myReturnNotes.length} pending
                </span>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {myReturnNotes.map(ardn => {
                const isExpanded = expandedARDNs.has(ardn.ardn_id);
                const isProcessing = processingARDN === ardn.ardn_id;

                return (
                  <div key={ardn.ardn_id} className="bg-white">
                    {/* ARDN Header */}
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedARDNs);
                              if (isExpanded) newExpanded.delete(ardn.ardn_id);
                              else newExpanded.add(ardn.ardn_id);
                              setExpandedARDNs(newExpanded);
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                          </button>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-700">{ardn.ardn_number}</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${ARDN_STATUS_COLORS[ardn.status]}`}>
                                {ardn.status}
                              </span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                {ardn.total_items} item(s)
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">{ardn.project_name || `Project #${ardn.project_id}`}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* DRAFT → Issue button */}
                          {ardn.status === 'DRAFT' && (
                            <button
                              onClick={() => handleIssueARDN(ardn)}
                              disabled={isProcessing}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shadow-sm"
                            >
                              {isProcessing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckCircleIcon className="w-3.5 h-3.5" />}
                              Issue
                            </button>
                          )}

                          {/* ISSUED → Dispatch button */}
                          {ardn.status === 'ISSUED' && (
                            <button
                              onClick={() => openDispatchModal(ardn)}
                              disabled={isProcessing}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shadow-sm"
                            >
                              {isProcessing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TruckIcon className="w-3.5 h-3.5" />}
                              Dispatch
                            </button>
                          )}

                          {/* IN_TRANSIT → Waiting indicator */}
                          {ardn.status === 'IN_TRANSIT' && (
                            <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium">
                              <ClockIcon className="w-3.5 h-3.5" />
                              In Transit to Store
                            </span>
                          )}

                          {/* RECEIVED → Success indicator */}
                          {ardn.status === 'RECEIVED' && (
                            <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium">
                              <CheckCircleIcon className="w-3.5 h-3.5" />
                              Received at Store
                            </span>
                          )}

                          {/* Download PDF */}
                          <button
                            onClick={() => handleDownloadARDN(ardn)}
                            className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-lg"
                            title="Download PDF"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                          </button>

                          {/* Print PDF */}
                          <button
                            onClick={() => handlePrintARDN(ardn)}
                            className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-lg"
                            title="Print"
                          >
                            <PrinterIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Items */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-gray-100"
                        >
                          <div className="px-5 py-3 bg-gray-50">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                              <div>
                                <span className="text-gray-500">Return Date:</span>
                                <p className="font-medium">{new Date(ardn.return_date).toLocaleDateString()}</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Reason:</span>
                                <p className="font-medium">{ardn.return_reason || '-'}</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Driver:</span>
                                <p className="font-medium">{ardn.driver_name || '-'}</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Vehicle:</span>
                                <p className="font-medium">{ardn.vehicle_number || '-'}</p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {ardn.items.map(item => (
                                <div
                                  key={item.return_item_id}
                                  className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200"
                                >
                                  <div className="p-1.5 bg-gray-100 rounded">
                                    <CubeIcon className="w-4 h-4 text-gray-700" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{item.category_name}</p>
                                    <p className="text-xs text-gray-500">
                                      {item.quantity} unit(s) • {item.item_code || '-'}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-start gap-1.5 flex-shrink-0">
                                    <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${getConditionColor(item.reported_condition)}`}>
                                      {item.reported_condition}
                                    </span>
                                    {item.damage_description && (
                                      <p className="text-xs text-red-600 text-left leading-relaxed max-w-[220px]">
                                        {item.damage_description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

            {/* Empty State for Returns */}
            {!loadingReturns && myReturnNotes.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center"
              >
                <div className="flex flex-col items-center">
                  <div className="p-4 bg-gray-100 rounded-full mb-4">
                    <ArrowUturnLeftIcon className="w-12 h-12 text-gray-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Return Notes</h3>
                  <p className="text-gray-500 max-w-md">
                    You haven't created any return notes yet. When you need to return assets, select items from the "My Assets" tab and create a return request.
                  </p>
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* ==================== REQUISITIONS TAB ==================== */}
        {activeTab === 'requisitions' && (
          <>
            {/* Loading State */}
            {loadingRequisitions && (
              <div className="flex justify-center items-center py-12">
                <ModernLoadingSpinners size="md" />
              </div>
            )}

            {/* Asset Requisitions Section */}
            {!loadingRequisitions && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Sub-tabs for filtering */}
              <div className="px-5 py-2 border-b border-gray-100 flex gap-2 overflow-x-auto">
                {(['draft', 'pending', 'rejected', 'dispatched', 'completed'] as ReqSubTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setReqSubTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      reqSubTab === tab
                        ? tab === 'rejected'
                          ? 'bg-gray-100 text-gray-800'
                          : tab === 'draft'
                          ? 'bg-gray-200 text-gray-800'
                          : 'bg-gray-100 text-gray-800'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)} ({reqStatusCounts[tab]})
                  </button>
                ))}
              </div>

              {/* Content */}
              {filteredRequisitions.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="flex flex-col items-center">
                    <div className="p-4 bg-gray-100 rounded-full mb-4">
                      <DocumentTextIcon className="w-10 h-10 text-gray-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No {reqSubTab} requisitions
                    </h3>
                    <p className="text-gray-500 max-w-md mb-4 text-sm">
                      {reqSubTab === 'rejected'
                        ? 'No rejected requisitions. Rejected requests will appear here for you to edit and resend.'
                        : reqSubTab === 'draft'
                        ? 'No draft requisitions. Create a new request to get started.'
                        : reqSubTab === 'pending'
                        ? 'No pending requisitions. Requests awaiting approval will appear here.'
                        : `No requisitions in "${reqSubTab}" status.`}
                    </p>
                    {reqSubTab === 'draft' && (
                      <button
                        onClick={openRequisitionModal}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Create New Request
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredRequisitions.map(req => {
                    // Get items - use items array if available, else fallback to single item
                    const reqItems = req.items && req.items.length > 0 ? req.items : (
                      req.category_id ? [{
                        category_id: req.category_id,
                        category_code: req.category_code,
                        category_name: req.category_name,
                        quantity: req.quantity ?? 1
                      }] : []
                    );
                    const totalItems = req.total_items ?? reqItems.length;
                    const totalQty = req.total_quantity ?? reqItems.reduce((sum, item) => sum + (item.quantity ?? 1), 0);

                    return (
                      <div key={req.requisition_id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-semibold text-gray-700">
                                {req.requisition_code}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status]}`}>
                                {STATUS_LABELS[req.status]}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_COLORS[req.urgency]}`}>
                                {URGENCY_LABELS[req.urgency]}
                              </span>
                              {totalItems > 1 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  {totalItems} items
                                </span>
                              )}
                            </div>
                            {/* Multi-item display */}
                            <div className="mt-2 space-y-1">
                              {reqItems.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-400">{idx + 1}.</span>
                                  <span className="font-medium text-gray-900">{item.category_name || item.category_code}</span>
                                  <span className="text-gray-500">×</span>
                                  <span className="text-gray-700">{item.quantity}</span>
                                </div>
                              ))}
                            </div>
                            {totalItems > 1 && (
                              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                                Total: {totalQty} unit{totalQty !== 1 ? 's' : ''}
                              </div>
                            )}
                            <p className="text-xs text-gray-500 mt-2">{req.project_name}</p>
                            {req.site_location && (
                              <p className="text-xs text-gray-400">Site: {req.site_location}</p>
                            )}
                            <p className="text-xs text-gray-400">Required: {new Date(req.required_date).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Send to PM - for draft or pm_rejected */}
                            {canSendToPM(req, currentUserId) && (
                              <button
                                onClick={() => handleSendToPM(req)}
                                disabled={submittingRequisition}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 shadow-sm"
                              >
                                <PaperAirplaneIcon className="w-3 h-3" />
                                {req.status === 'pm_rejected' ? 'Resend' : 'Send for Approval'}
                              </button>
                            )}
                            {/* Edit - for draft or pm_rejected */}
                            {canEditRequisition(req, currentUserId) && (
                              <button
                                onClick={() => openEditReqModal(req)}
                                className="px-3 py-1.5 text-gray-700 text-xs hover:bg-gray-100 rounded-lg flex items-center gap-1 border border-gray-200"
                              >
                                <PencilIcon className="w-3 h-3" />
                                Edit
                              </button>
                            )}
                            {req.status === 'dispatched' && (
                              <button
                                onClick={() => setConfirmReceiptReqId(req.requisition_id)}
                                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 shadow-sm"
                              >
                                Confirm Receipt
                              </button>
                            )}
                            {canCancelRequisition(req, currentUserId) && (
                              <button
                                onClick={() => handleCancelRequisition(req.requisition_id)}
                                className="px-3 py-1.5 text-red-600 text-xs hover:bg-red-50 rounded-lg border border-red-200"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
            )}
          </>
        )}

        {/* ==================== HISTORY TAB ==================== */}
        {activeTab === 'history' && (
          <>
            {/* History Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="px-5 py-4 flex items-center justify-between bg-gray-50/50 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <ClockIcon className="w-5 h-5 text-gray-700" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">Asset Movement History</h3>
                    <p className="text-sm text-gray-500">View all dispatches and returns for your projects</p>
                  </div>
                </div>
                <button
                  onClick={fetchHistory}
                  className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium flex items-center gap-1"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {/* Content */}
              {loadingHistory ? (
                  <div className="p-8 text-center">
                    <ModernLoadingSpinners size="sm" className="mx-auto" />
                    <p className="text-sm text-gray-500 mt-2">Loading history...</p>
                  </div>
                ) : history.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <DocumentTextIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No movement history found for your projects</p>
                  </div>
                ) : (
                  <div className="h-[calc(100vh-350px)] min-h-[600px] overflow-y-auto">
                    {/* Group by project */}
                    {Object.entries(
                      history.reduce((acc, h) => {
                        const key = `${h.project_id}-${h.project_name}`;
                        if (!acc[key]) acc[key] = { project_name: h.project_name, movements: [] };
                        acc[key].movements.push(h);
                        return acc;
                      }, {} as Record<string, { project_name: string; movements: AssetHistory[] }>)
                    ).map(([key, group]) => {
                      const isProjectExpanded = expandedProjects.has(key);
                      return (
                        <div key={key} className="border-b border-gray-200 last:border-b-0">
                          {/* Project Header - Clickable */}
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedProjects);
                              if (isProjectExpanded) {
                                newExpanded.delete(key);
                              } else {
                                newExpanded.add(key);
                              }
                              setExpandedProjects(newExpanded);
                            }}
                            className="w-full px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <BuildingOfficeIcon className="w-5 h-5 text-gray-700" />
                              <h4 className="font-semibold text-gray-900">{group.project_name}</h4>
                              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                                {group.movements.length} movement(s)
                              </span>
                            </div>
                            {isProjectExpanded ? (
                              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          {/* Project Movements - Collapsible */}
                          <AnimatePresence>
                            {isProjectExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="divide-y divide-gray-100">
                                  {group.movements.map((h) => (
                                    <div key={h.movement_id} className="px-5 py-3 hover:bg-gray-50">
                                      <div className="flex items-start gap-3">
                                        <div className={`p-1.5 rounded-lg ${h.movement_type === 'DISPATCH' ? 'bg-gray-100' : 'bg-gray-100'}`}>
                                          {h.movement_type === 'DISPATCH' ? (
                                            <TruckIcon className="w-4 h-4 text-gray-700" />
                                          ) : (
                                            <ArrowUturnLeftIcon className="w-4 h-4 text-gray-700" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                              h.movement_type === 'DISPATCH' ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                              {h.movement_type === 'DISPATCH' ? 'Dispatched' : 'Returned'}
                                            </span>
                                            <span className="font-medium text-gray-900 text-sm">{h.category_name}</span>
                                            <span className="text-xs text-gray-500">
                                              {h.quantity} unit(s)
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                            <span>
                                              {new Date(h.dispatched_at || h.returned_at || h.created_at).toLocaleDateString('en-IN', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                              })}
                                              {' '}
                                              {new Date(h.dispatched_at || h.returned_at || h.created_at).toLocaleTimeString('en-IN', {
                                                hour: '2-digit', minute: '2-digit', hour12: true
                                              })}
                                            </span>
                                            <span>•</span>
                                            <span>By: {h.movement_type === 'DISPATCH' ? h.dispatched_by : h.returned_by || '-'}</span>
                                            {h.item_code && (
                                              <>
                                                <span>•</span>
                                                <span>{h.item_code}</span>
                                              </>
                                            )}
                                          </div>
                                          {h.notes && (
                                            <p className="text-xs text-gray-500 mt-1 bg-gray-100 rounded px-2 py-1 inline-block">
                                              {h.notes}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
            </motion.div>
          </>
        )}
      </div>

      {/* Bulk Return Request Modal */}
      <AnimatePresence>
        {showReturnModal && returnADN && returnItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowReturnModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gray-800 px-5 py-4 rounded-t-xl flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <ArrowUturnLeftIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-white">
                      <h3 className="font-semibold">Create Return Delivery Note (RDN)</h3>
                      <p className="text-sm text-white/80">
                        {returnADN.adn_number} • {returnItems.length} item{returnItems.length !== 1 ? 's' : ''} to return
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowReturnModal(false)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* DN Info */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-700 font-medium">Returning from</p>
                      <p className="font-semibold text-gray-900">{returnADN.project_name}</p>
                      <p className="text-xs text-gray-700 font-mono mt-1">Original DN: {returnADN.adn_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-700">{returnItems.length}</p>
                      <p className="text-xs text-gray-600">Items</p>
                    </div>
                  </div>
                </div>

                {/* Items with Condition Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Condition for Each Item
                  </label>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {returnItems.map((item) => {
                      const cond = returnItemConditions[item.adn_item_id] || { condition: 'good', damage_description: '', quantity: item.quantity };
                      return (
                        <div key={item.adn_item_id} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                              <CubeIcon className="w-4 h-4 text-gray-700" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm">{item.category_name}</p>
                              <p className="text-xs text-gray-500">
                                Available: {item.quantity} unit(s) • {item.item_code || item.serial_number || item.category_code}
                              </p>

                              {/* Quantity Input */}
                              <div className="mt-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Return Quantity</label>
                                <div>
                                  <input
                                    type="number"
                                    min="1"
                                    max={item.quantity}
                                    value={cond.quantity}
                                    onChange={(e) => updateItemCondition(item.adn_item_id, 'quantity', parseInt(e.target.value) || 1)}
                                    className={`w-24 px-2 py-1 text-sm border rounded focus:ring-1 ${
                                      cond.quantity <= 0 || cond.quantity > item.quantity
                                        ? 'border-gray-500 focus:ring-gray-500 focus:border-gray-500 bg-gray-50'
                                        : 'border-gray-300 focus:ring-gray-500 focus:border-gray-500'
                                    }`}
                                  />
                                  <span className="ml-2 text-xs text-gray-500">of {item.quantity} available</span>
                                  {(cond.quantity <= 0 || cond.quantity > item.quantity) && (
                                    <p className="text-xs text-gray-700 mt-1 font-medium">
                                      {cond.quantity <= 0 ? '* Quantity must be at least 1' : `* Cannot exceed ${item.quantity} available`}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Condition Buttons */}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {['good', 'fair', 'poor', 'damaged'].map((condition) => (
                                  <button
                                    key={condition}
                                    onClick={() => updateItemCondition(item.adn_item_id, 'condition', condition)}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition-all ${
                                      cond.condition === condition
                                        ? condition === 'good' ? 'bg-gray-100 border-gray-500 text-gray-800'
                                          : condition === 'fair' ? 'bg-gray-100 border-gray-500 text-gray-800'
                                          : condition === 'poor' ? 'bg-gray-100 border-gray-500 text-gray-800'
                                          : 'bg-gray-100 border-gray-500 text-gray-800'
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                  >
                                    {condition.charAt(0).toUpperCase() + condition.slice(1)}
                                  </button>
                                ))}
                              </div>

                              {/* Damage Description if not good */}
                              {cond.condition !== 'good' && (
                                <div className="mt-2">
                                  <textarea
                                    rows={3}
                                    value={cond.damage_description}
                                    onChange={(e) => updateItemCondition(item.adn_item_id, 'damage_description', e.target.value)}
                                    placeholder={cond.condition === 'damaged' ? 'Describe damage...' : 'Describe condition...'}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-gray-500 focus:border-gray-500 resize-none"
                                  />
                                  {!cond.damage_description.trim() && (
                                    <p className="text-xs text-gray-600 mt-1">* Required for non-good condition</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Return Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Return Notes (Optional)
                  </label>
                  <textarea
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    rows={2}
                    placeholder="Reason for return, any additional information..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-4 border-t border-gray-200 flex justify-between items-center flex-shrink-0 bg-gray-50">
                <p className="text-sm text-gray-500">
                  RDN will be created for {returnItems.length} item{returnItems.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowReturnModal(false)}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkReturnRequest}
                    disabled={
                      submitting ||
                      returnItems.some(item => {
                        const cond = returnItemConditions[item.adn_item_id];
                        return !cond || cond.quantity <= 0 || cond.quantity > item.quantity;
                      })
                    }
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
                  >
                    {submitting ? (
                      <>
                        <ModernLoadingSpinners size="xs" />
                        Creating RDN...
                      </>
                    ) : (
                      <>
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                        Create Return Note
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Partial Receive Modal - Mandatory Notes */}
        {showPartialReceiveModal && partialReceiveADN && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPartialReceiveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Partial Receive</h3>
                  <p className="text-sm text-gray-500">
                    {partialReceiveADN.adn_number} - {getCheckedCountInADN(partialReceiveADN)} of {partialReceiveADN.items.length} items
                  </p>
                </div>
                <button
                  onClick={() => setShowPartialReceiveModal(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="px-5 py-4 space-y-4">
                {/* Items being received */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900 mb-2">Items to receive:</p>
                  <ul className="text-sm text-gray-800 space-y-1">
                    {partialReceiveADN.items
                      .filter(item => checkedItems.has(item.adn_item_id))
                      .map(item => (
                        <li key={item.adn_item_id} className="flex items-center gap-2">
                          <CheckCircleIcon className="w-4 h-4 text-gray-600" />
                          {item.category_name} ({item.quantity} unit{item.quantity > 1 ? 's' : ''})
                        </li>
                      ))
                    }
                  </ul>
                </div>

                {/* Items NOT being received */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Items NOT received (remaining):</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {partialReceiveADN.items
                      .filter(item => !checkedItems.has(item.adn_item_id))
                      .map(item => (
                        <li key={item.adn_item_id} className="flex items-center gap-2">
                          <ClockIcon className="w-4 h-4 text-gray-600" />
                          {item.category_name} ({item.quantity} unit{item.quantity > 1 ? 's' : ''})
                        </li>
                      ))
                    }
                  </ul>
                </div>

                {/* Mandatory Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason for Partial Receive <span className="text-gray-600">*</span>
                  </label>
                  <textarea
                    value={partialReceiveNotes}
                    onChange={(e) => setPartialReceiveNotes(e.target.value)}
                    rows={3}
                    placeholder="Why are you not receiving all items? (e.g., items missing, wrong items, damaged items not in delivery...)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">This is required for partial receives</p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowPartialReceiveModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPartialReceive}
                  disabled={markingReceived === partialReceiveADN.adn_id || !partialReceiveNotes.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
                >
                  {markingReceived === partialReceiveADN.adn_id ? (
                    <>
                      <ModernLoadingSpinners size="xs" />
                      Receiving...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4" />
                      Confirm Partial Receive
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Dispatch ARDN Modal */}
        {showDispatchModal && dispatchARDN && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDispatchModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <TruckIcon className="w-5 h-5 text-gray-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Dispatch Return Note</h3>
                      <p className="text-sm text-gray-500">{dispatchARDN.ardn_number}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDispatchModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-600">
                  Enter driver and vehicle details to dispatch this return note.
                </p>

                {/* Driver Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={dispatchDriverName}
                    onChange={(e) => setDispatchDriverName(e.target.value)}
                    placeholder="Enter driver name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                </div>

                {/* Vehicle Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={dispatchVehicleNumber}
                    onChange={(e) => setDispatchVehicleNumber(e.target.value)}
                    placeholder="Enter vehicle number (e.g., KA-01-AB-1234)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                </div>

                {/* Driver Contact */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Driver Contact
                  </label>
                  <input
                    type="tel"
                    value={dispatchDriverContact}
                    onChange={(e) => setDispatchDriverContact(e.target.value)}
                    placeholder="Enter driver phone number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                </div>

                {/* Items Summary */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Items being returned:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {dispatchARDN.items.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        {item.category_name} ({item.quantity} unit{item.quantity > 1 ? 's' : ''})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDispatchARDN}
                  disabled={processingARDN === dispatchARDN.ardn_id}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
                >
                  {processingARDN === dispatchARDN.ardn_id ? (
                    <>
                      <ModernLoadingSpinners size="xs" />
                      Dispatching...
                    </>
                  ) : (
                    <>
                      <TruckIcon className="w-4 h-4" />
                      Dispatch
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Create Asset Requisition Modal - Multi-Item Support */}
        {showRequisitionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRequisitionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSubmitRequisition}>
                {/* Modal Header */}
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Request Assets</h3>
                    <p className="text-sm text-gray-500">Add multiple items and submit for PM approval</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRequisitionModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-5 space-y-4">
                  {/* Project Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project <span className="text-gray-600">*</span>
                    </label>
                    <select
                      value={requisitionForm.project_id}
                      onChange={(e) => {
                        const projectId = Number(e.target.value);
                        const selectedProject = projects.find(p => p.project_id === projectId);
                        setRequisitionForm(prev => ({
                          ...prev,
                          project_id: projectId,
                          site_location: selectedProject?.location || ''
                        }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                      required
                    >
                      <option value={0}>Select project...</option>
                      {projects.map(p => (
                        <option key={p.project_id} value={p.project_id}>
                          {p.project_code} - {p.project_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Items Section - Box */}
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <CubeIcon className="w-4 h-4" />
                      Add Items to Request
                    </h4>

                    {/* Add Item Row */}
                    <div className="flex gap-2 items-end mb-3">
                      {/* Category Search */}
                      <div className="flex-1 relative">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                        {(() => {
                          const selectedInListQty = requisitionForm.category_id > 0 ? getCategoryInListQty(requisitionForm.category_id) : null;
                          const isAlreadyInList = selectedInListQty !== null;
                          return (
                            <>
                              <input
                                type="text"
                                placeholder={assetCategories.length === 0 ? 'Loading...' : 'Search category...'}
                                value={requisitionForm.category_id ? selectedCategoryName : categorySearch}
                                onChange={(e) => {
                                  setCategorySearch(e.target.value);
                                  setShowCategoryDropdown(true);
                                  if (requisitionForm.category_id) {
                                    setRequisitionForm(prev => ({ ...prev, category_id: 0 }));
                                  }
                                }}
                                onFocus={() => setShowCategoryDropdown(true)}
                                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm ${
                                  isAlreadyInList ? 'border-gray-400 bg-gray-50' : 'border-gray-300'
                                }`}
                              />
                              {isAlreadyInList && (
                                <p className="text-xs text-gray-800 mt-1">
                                  Already in list with qty {selectedInListQty}. Adding will update total.
                                </p>
                              )}
                            </>
                          );
                        })()}
                        {/* Dropdown */}
                        {showCategoryDropdown && assetCategories.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredCategories.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500">No categories found</div>
                            ) : (
                              filteredCategories.map(c => {
                                const existingItem = requisitionItems.find(item => item.category_id === c.category_id);
                                const isInList = existingItem !== undefined;
                                const currentQty = existingItem?.quantity || 0;
                                const availableQty = c.available_quantity ?? 0;
                                const isOutOfStock = availableQty === 0;
                                const isMaxedOut = isInList && currentQty >= availableQty;

                                return (
                                  <button
                                    key={c.category_id}
                                    type="button"
                                    disabled={isOutOfStock}
                                    onClick={() => {
                                      if (isOutOfStock) return;

                                      if (isInList) {
                                        // If already in list, increase quantity by 1 if not maxed out
                                        if (currentQty >= availableQty) {
                                          showError(`Cannot exceed available quantity (${availableQty}) for ${c.category_name}`);
                                          return;
                                        }

                                        setRequisitionItems(prev => prev.map(item =>
                                          item.category_id === c.category_id
                                            ? { ...item, quantity: currentQty + 1 }
                                            : item
                                        ));
                                        showSuccess(`Increased ${c.category_name} quantity to ${currentQty + 1}`);
                                      } else {
                                        // Add new item with quantity 1
                                        if (availableQty < 1) {
                                          showError(`No stock available for ${c.category_name}`);
                                          return;
                                        }

                                        const newItem: RequisitionItem = {
                                          id: Date.now() + itemIdCounter,
                                          category_id: c.category_id,
                                          category_code: c.category_code,
                                          category_name: c.category_name,
                                          quantity: 1,
                                          available_quantity: availableQty
                                        };
                                        setRequisitionItems(prev => [...prev, newItem]);
                                        setItemIdCounter(prev => prev + 1);
                                        showSuccess(`Added ${c.category_name} to requisition`);
                                      }

                                      setCategorySearch('');
                                      setShowCategoryDropdown(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm flex justify-between items-center gap-2 ${
                                      isOutOfStock
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                        : isMaxedOut
                                        ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                                        : isInList
                                        ? 'bg-gray-50 border-l-2 border-gray-400 hover:bg-gray-100'
                                        : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className={`font-medium ${isOutOfStock ? 'line-through' : ''}`}>
                                        {c.category_code} - {c.category_name}
                                      </span>
                                      {isInList && !isOutOfStock && (
                                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                          isMaxedOut ? 'text-gray-800 bg-gray-100' : 'text-gray-800 bg-gray-100'
                                        }`}>
                                          {currentQty} / {availableQty} {isMaxedOut ? '(Max)' : ''}
                                        </span>
                                      )}
                                      {isOutOfStock && (
                                        <span className="ml-2 text-xs text-gray-600">
                                          Out of stock
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                                      isOutOfStock ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {isOutOfStock ? 'Unavailable' : `Avail: ${availableQty}`}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                        {showCategoryDropdown && (
                          <div className="fixed inset-0 z-40" onClick={() => setShowCategoryDropdown(false)} />
                        )}
                      </div>

                      {/* Quantity */}
                      <div className="w-24">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={requisitionForm.quantity}
                          onChange={(e) => setRequisitionForm(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm"
                        />
                      </div>

                      {/* Add/Update Button */}
                      {(() => {
                        const isUpdate = requisitionForm.category_id > 0 && getCategoryInListQty(requisitionForm.category_id) !== null;
                        return (
                          <button
                            type="button"
                            onClick={addItemToRequisition}
                            className={`px-3 py-2 text-white rounded-lg transition-colors flex items-center gap-1 shadow-sm ${
                              isUpdate ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                            title={isUpdate ? 'Update quantity' : 'Add to list'}
                          >
                            <PlusIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">{isUpdate ? 'Update' : 'Add'}</span>
                          </button>
                        );
                      })()}
                    </div>

                    {/* Items List */}
                    {requisitionItems.length > 0 && (
                      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800">
                            {requisitionItems.length} item{requisitionItems.length > 1 ? 's' : ''} in request
                          </span>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                          {requisitionItems.map((item) => (
                            <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {item.category_code} - {item.category_name}
                                </p>
                                <p className="text-xs text-gray-500">Available: {item.available_quantity}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) => updateItemQuantity(item.id, Number(e.target.value))}
                                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeItemFromRequisition(item.id)}
                                  className="p-1 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                  title="Remove"
                                >
                                  <XMarkIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {requisitionItems.length === 0 && !requisitionForm.category_id && (
                      <p className="text-xs text-gray-500 text-center py-2">
                        Search and add items above, or select one item and submit directly
                      </p>
                    )}
                  </div>

                  {/* Common Fields for All Items */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Required Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Required Date <span className="text-gray-600">*</span>
                      </label>
                      <input
                        type="date"
                        value={requisitionForm.required_date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setRequisitionForm(prev => ({ ...prev, required_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                        required
                      />
                    </div>

                    {/* Urgency */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                      <select
                        value={requisitionForm.urgency}
                        onChange={(e) => setRequisitionForm(prev => ({ ...prev, urgency: e.target.value as Urgency }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  {/* Purpose */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purpose / Justification <span className="text-gray-600">*</span>
                    </label>
                    <textarea
                      value={requisitionForm.purpose}
                      onChange={(e) => setRequisitionForm(prev => ({ ...prev, purpose: e.target.value }))}
                      rows={2}
                      placeholder="Why do you need these assets?"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                      required
                    />
                  </div>

                  {/* Site Location */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Site Location <span className="text-gray-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={requisitionForm.site_location || ''}
                      onChange={(e) => setRequisitionForm(prev => ({ ...prev, site_location: e.target.value }))}
                      placeholder="Specific location at site"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                      required
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between sticky bottom-0 bg-gray-50">
                  <div className="text-sm text-gray-600">
                    {requisitionItems.length > 0 ? (
                      <span className="font-medium text-gray-700">
                        {requisitionItems.length} item{requisitionItems.length > 1 ? 's' : ''} ready to submit
                      </span>
                    ) : requisitionForm.category_id ? (
                      <span className="text-gray-500">1 item selected</span>
                    ) : (
                      <span className="text-gray-400">No items selected</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowRequisitionModal(false)}
                      className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingRequisition || (requisitionItems.length === 0 && !requisitionForm.category_id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
                    >
                      {submittingRequisition ? (
                        <>
                          <ModernLoadingSpinners size="xs" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <PaperAirplaneIcon className="w-4 h-4" />
                          Submit Request {requisitionItems.length > 1 ? `(${requisitionItems.length} items)` : requisitionItems.length === 1 ? '(1 item)' : ''}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Confirm Receipt Modal */}
        {confirmReceiptReqId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setConfirmReceiptReqId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Confirm Receipt</h3>
                <p className="text-sm text-gray-500">Confirm that you have received the dispatched asset</p>
              </div>

              <div className="p-5 space-y-4">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-800">
                    This confirms that the asset has been delivered to your site and is in your possession.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                  <textarea
                    value={receiptNotes}
                    onChange={(e) => setReceiptNotes(e.target.value)}
                    rows={2}
                    placeholder="Any notes about the received asset..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setConfirmReceiptReqId(null);
                    setReceiptNotes('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReceipt}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  Confirm Receipt
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Edit Requisition Modal */}
        {showEditReqModal && editRequisition && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeEditReqModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900">Edit Requisition</h3>
                <p className="text-sm text-gray-500">{editRequisition.requisition_code}</p>
              </div>

              <form onSubmit={handleUpdateRequisition} className="p-5 space-y-4">
                {/* Project Selection - Same as Create Modal */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project <span className="text-gray-600">*</span>
                  </label>
                  <select
                    value={editProjectId}
                    onChange={(e) => {
                      const projectId = Number(e.target.value);
                      const selectedProject = projects.find(p => p.project_id === projectId);
                      setEditProjectId(projectId);
                      // Auto-fetch location from project
                      setEditSiteLocation(selectedProject?.location || '');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                    required
                  >
                    <option value={0}>Select project...</option>
                    {projects.map(p => (
                      <option key={p.project_id} value={p.project_id}>
                        {p.project_code} - {p.project_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Show rejection reason if pm_rejected */}
                {editRequisition.status === 'pm_rejected' && editRequisition.pm_rejection_reason && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm font-medium text-gray-800">PM Rejection Reason:</p>
                    <p className="text-sm text-gray-700 mt-1">{editRequisition.pm_rejection_reason}</p>
                  </div>
                )}

                {/* Add Items to Request - same format as Request Assets modal */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <h3 className="text-sm font-semibold text-gray-700">Add Items to Request</h3>
                  </div>

                  <div className="grid grid-cols-12 gap-2 mb-3">
                    <div className="col-span-8">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search category..."
                          value={categorySearch}
                          onChange={(e) => {
                            setCategorySearch(e.target.value);
                            setShowCategoryDropdown(true);
                          }}
                          onFocus={() => setShowCategoryDropdown(true)}
                          onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                        />
                        {showCategoryDropdown && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {assetCategories
                              .filter(cat =>
                                (cat.category_name.toLowerCase().includes(categorySearch.toLowerCase()) ||
                                cat.category_code.toLowerCase().includes(categorySearch.toLowerCase())) &&
                                (cat.available_quantity ?? 0) > 0
                              )
                              .map(cat => {
                                const existingItemIndex = editItems.findIndex(item => item.category_id === cat.category_id);
                                const isAlreadyAdded = existingItemIndex !== -1;
                                const currentQty = isAlreadyAdded ? editItems[existingItemIndex].quantity : 0;
                                const availableQty = cat.available_quantity ?? 0;
                                const isMaxedOut = isAlreadyAdded && currentQty >= availableQty;

                                return (
                                  <div
                                    key={cat.category_id}
                                    onClick={() => {
                                      if (isAlreadyAdded) {
                                        // If already added, increase quantity by 1 if not maxed out
                                        if (currentQty >= availableQty) {
                                          showError(`Cannot exceed available quantity (${availableQty}) for ${cat.category_name}`);
                                          return;
                                        }

                                        const newQty = currentQty + 1;
                                        setEditItems(prevItems => {
                                          const newItems = [...prevItems];
                                          newItems[existingItemIndex] = {
                                            ...newItems[existingItemIndex],
                                            quantity: newQty
                                          };
                                          return newItems;
                                        });
                                        showSuccess(`Increased ${cat.category_name} quantity to ${newQty}`);
                                      } else {
                                        // Add new item with quantity 1
                                        if (availableQty < 1) {
                                          showError(`No stock available for ${cat.category_name}`);
                                          return;
                                        }
                                        setEditItems(prevItems => [...prevItems, {
                                          category_id: cat.category_id,
                                          category_name: cat.category_name,
                                          quantity: 1
                                        }]);
                                        showSuccess(`Added ${cat.category_name} to requisition`);
                                      }
                                      setCategorySearch('');
                                      setShowCategoryDropdown(false);
                                    }}
                                    className={`px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                                      isMaxedOut ? 'bg-gray-50 opacity-60 cursor-not-allowed' : isAlreadyAdded ? 'bg-gray-50' : ''
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-gray-900">{cat.category_name}</span>
                                      <div className="flex items-center gap-2">
                                        {isAlreadyAdded && (
                                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                                            isMaxedOut ? 'text-gray-800 bg-gray-100' : 'text-gray-800 bg-gray-100'
                                          }`}>
                                            {currentQty} / {availableQty} {isMaxedOut ? '(Max)' : ''}
                                          </span>
                                        )}
                                        <span className="text-xs text-gray-700">Avail: {availableQty}</span>
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-500">{cat.category_code}</p>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value="1"
                        readOnly
                        className="w-full px-3 py-2 text-sm text-center border border-gray-300 rounded-lg bg-gray-50"
                      />
                    </div>
                  </div>

                  {/* Items List */}
                  {editItems.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700">{editItems.length} {editItems.length === 1 ? 'item' : 'items'} in request</p>
                      {editItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{idx + 1}. {item.category_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newValue = Math.max(1, parseInt(e.target.value) || 1);
                                const category = assetCategories.find(c => c.category_id === item.category_id);
                                const availableQty = category?.available_quantity ?? 0;

                                if (newValue > availableQty) {
                                  showError(`Cannot exceed available quantity (${availableQty}) for ${item.category_name}`);
                                  return;
                                }

                                setEditItems(prevItems => {
                                  const newItems = [...prevItems];
                                  newItems[idx] = {
                                    ...newItems[idx],
                                    quantity: newValue
                                  };
                                  return newItems;
                                });
                              }}
                              className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editItems.length > 1) {
                                  setEditItems(editItems.filter((_, i) => i !== idx));
                                } else {
                                  showError('At least one item is required');
                                }
                              }}
                              className="text-gray-700 hover:text-gray-900 p-1"
                              title="Remove item"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">No items selected</p>
                  )}
                </div>

                {/* Purpose */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Purpose <span className="text-gray-600">*</span>
                  </label>
                  <textarea
                    value={editPurpose}
                    onChange={(e) => setEditPurpose(e.target.value)}
                    rows={3}
                    placeholder="Why do you need this asset?"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 resize-none"
                    required
                  />
                </div>

                {/* Required Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Required Date <span className="text-gray-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={editRequiredDate}
                    onChange={(e) => setEditRequiredDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                    required
                  />
                </div>

                {/* Urgency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                  <select
                    value={editUrgency}
                    onChange={(e) => setEditUrgency(e.target.value as Urgency)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* Site Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site Location</label>
                  <input
                    type="text"
                    value={editSiteLocation}
                    onChange={(e) => setEditSiteLocation(e.target.value)}
                    placeholder="Specific location at site (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeEditReqModal}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRequisition}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm"
                  >
                    {submittingRequisition ? (
                      <ModernLoadingSpinners size="sm" />
                    ) : (
                      <CheckCircleIcon className="w-4 h-4" />
                    )}
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal - Send to PM */}
      <AnimatePresence>
        {showConfirmSendPM && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowConfirmSendPM(false);
              setPendingSendRequisition(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Icon and Header */}
              <div className="flex flex-col items-center mb-4">
                <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Send to Project Manager?</h3>
              </div>

              {/* Message */}
              <p className="text-gray-600 text-center mb-6">
                Are you sure you want to send this requisition to the Project Manager for approval?
              </p>

              {/* Requisition Info */}
              {pendingSendRequisition && (
                <div className="bg-gray-50 rounded-lg p-3 mb-6 border border-gray-200">
                  <div className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-500">Requisition Code:</span>
                      <span className="font-medium text-gray-900">{pendingSendRequisition.requisition_code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Project:</span>
                      <span className="font-medium text-gray-900">{pendingSendRequisition.project_name}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmSendPM(false);
                    setPendingSendRequisition(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  disabled={submittingRequisition}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSendToPM}
                  disabled={submittingRequisition}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submittingRequisition ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      <span>Send to PM</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(SiteAssets);
