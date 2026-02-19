import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Package, CheckCircle, X, Save, FileText,
  ArrowUpCircle, RefreshCw, Download, Printer, DollarSign, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  inventoryService,
  InternalMaterialRequest,
  MaterialDeliveryNote,
  CreateDeliveryNoteData,
  ProjectWithManagers,
  InventoryConfig,
  InventoryMaterial
} from '../services/inventoryService';
import { showSuccess, showError, showWarning } from '@/utils/toastHelper';
import { API_BASE_URL } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { INVENTORY_DEFAULTS, PAGINATION } from '@/lib/inventoryConstants';
import { normalizeStatus } from '../utils/inventoryHelpers';
import ConfirmationModal from '../components/ConfirmationModal';

// Unified tab type - all tabs in single row
type MainTabType = 'pending' | 'approved' | 'completed' | 'rejected' | 'draft_dn' | 'issued_dn' | 'delivered_dn';

const StockOutPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  // Main tab state
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('pending');

  // Handle URL parameters
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['pending', 'approved', 'completed', 'rejected', 'draft_dn', 'issued_dn', 'delivered_dn'].includes(tab)) {
      setActiveMainTab(tab as MainTabType);
    }
  }, [searchParams]);

  // Data states - Lazy loading pattern for Material Requests
  const [pendingRequests, setPendingRequests] = useState<InternalMaterialRequest[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<InternalMaterialRequest[]>([]);
  const [completedRequests, setCompletedRequests] = useState<InternalMaterialRequest[]>([]);
  const [rejectedRequests, setRejectedRequests] = useState<InternalMaterialRequest[]>([]);

  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [loadingRejected, setLoadingRejected] = useState(false);

  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [approvedLoaded, setApprovedLoaded] = useState(false);
  const [completedLoaded, setCompletedLoaded] = useState(false);
  const [rejectedLoaded, setRejectedLoaded] = useState(false);

  const [deliveryNotes, setDeliveryNotes] = useState<MaterialDeliveryNote[]>([]);
  const [projects, setProjects] = useState<ProjectWithManagers[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [inventoryConfig, setInventoryConfig] = useState<InventoryConfig>({
    store_name: '',
    company_name: '',
    currency: INVENTORY_DEFAULTS.CURRENCY,
    delivery_note_prefix: INVENTORY_DEFAULTS.DELIVERY_NOTE_PREFIX
  });

  // UI states
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeliveryNoteModal, setShowDeliveryNoteModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selected request for creating DN
  const [selectedRequestForDN, setSelectedRequestForDN] = useState<InternalMaterialRequest | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmColor?: 'CONFIRM' | 'DELETE' | 'APPROVE' | 'WARNING' | 'INFO';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
    confirmColor: 'CONFIRM'
  });

  // Rejection modal state
  const [rejectionModal, setRejectionModal] = useState<{
    show: boolean;
    requestId: number | null;
    reason: string;
  }>({
    show: false,
    requestId: null,
    reason: ''
  });

  // Materials view modal state (for grouped materials)
  const [materialsViewModal, setMaterialsViewModal] = useState<{
    show: boolean;
    materials: any[];
    requestNumber: number | null;
    parentMaterialName?: string;
  }>({
    show: false,
    materials: [],
    requestNumber: null,
    parentMaterialName: undefined
  });

  // Form state for new Delivery Note
  const [dnFormData, setDnFormData] = useState<CreateDeliveryNoteData>({
    project_id: 0,
    delivery_date: new Date().toISOString().split('T')[0],
    attention_to: '',
    delivery_from: '',
    requested_by: '',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    notes: '',
    transport_fee: 0
  });

  // Items to add to the delivery note
  const [dnItems, setDnItems] = useState<Array<{
    inventory_material_id: number;
    quantity: number;
    unit?: string;
    notes: string;
    internal_request_id?: number;
    use_backup?: boolean;
    // For vendor delivery materials (not yet in inventory)
    material_name?: string;
    sub_item_name?: string;
    brand?: string;
    is_vendor_delivery?: boolean;
  }>>([]);

  // Fetch initial data (projects, materials, config) - not requests
  const fetchInitialData = useCallback(async () => {
    setLoadingInitialData(true);
    try {
      const [projectsData, materialsData, configData] = await Promise.all([
        inventoryService.getAllProjects(),
        inventoryService.getAllInventoryItems(),
        inventoryService.getInventoryConfig()
      ]);

      setProjects(projectsData || []);
      setMaterials(materialsData);
      setInventoryConfig(configData);
      setDnFormData(prev => ({ ...prev, delivery_from: configData.store_name }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch initial data';
      showError(errorMessage);
    } finally {
      setLoadingInitialData(false);
    }
  }, []);

  // Find matching inventory material by trying multiple name strategies
  const findInventoryMatch = useCallback((matName?: string, matBrand?: string, parentItemName?: string) => {
    const tryMatch = (name?: string) => {
      if (!name) return undefined;
      return materials.find(inv => inv.material_name?.toLowerCase() === name.toLowerCase());
    };
    return tryMatch(matBrand) || tryMatch(matName) || tryMatch(parentItemName);
  }, [materials]);

  // Fetch pending requests
  const fetchPendingRequests = useCallback(async () => {
    setLoadingPending(true);
    try {
      const requestsData = await inventoryService.getSentInternalRequests();
      const pending = requestsData.filter(req => normalizeStatus(req.status) === 'PENDING');
      setPendingRequests(pending);
      setPendingLoaded(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch pending requests';
      showError(errorMessage);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  // Fetch approved requests (including DN_PENDING)
  const fetchApprovedRequests = useCallback(async () => {
    setLoadingApproved(true);
    try {
      const requestsData = await inventoryService.getSentInternalRequests();
      const approved = requestsData.filter(req => {
        const status = normalizeStatus(req.status);
        return status === 'APPROVED';
      });
      setApprovedRequests(approved);
      setApprovedLoaded(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch approved requests';
      showError(errorMessage);
    } finally {
      setLoadingApproved(false);
    }
  }, []);

  // Fetch completed requests (dispatched and fulfilled)
  const fetchCompletedRequests = useCallback(async () => {
    setLoadingCompleted(true);
    try {
      const requestsData = await inventoryService.getSentInternalRequests();
      const completed = requestsData.filter(req => {
        const status = normalizeStatus(req.status);
        return status === 'DISPATCHED' || status === 'FULFILLED';
      });
      setCompletedRequests(completed);
      setCompletedLoaded(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch completed requests';
      showError(errorMessage);
    } finally {
      setLoadingCompleted(false);
    }
  }, []);

  // Fetch rejected requests
  const fetchRejectedRequests = useCallback(async () => {
    setLoadingRejected(true);
    try {
      const requestsData = await inventoryService.getSentInternalRequests();
      const rejected = requestsData.filter(req => normalizeStatus(req.status) === 'REJECTED');
      setRejectedRequests(rejected);
      setRejectedLoaded(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch rejected requests';
      showError(errorMessage);
    } finally {
      setLoadingRejected(false);
    }
  }, []);

  // Fetch delivery notes for delivery-notes tab
  const fetchDeliveryNotes = useCallback(async () => {
    try {
      const deliveryNotesResult = await inventoryService.getAllDeliveryNotes();
      setDeliveryNotes(deliveryNotesResult.delivery_notes || []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch delivery notes';
      showError(errorMessage);
    }
  }, []);

  // Load initial data on mount
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Lazy load based on active main tab
  useEffect(() => {
    // Material request tabs
    if (activeMainTab === 'pending' && !pendingLoaded && !loadingPending) {
      fetchPendingRequests();
    } else if (activeMainTab === 'approved' && !approvedLoaded && !loadingApproved) {
      fetchApprovedRequests();
    } else if (activeMainTab === 'completed' && !completedLoaded && !loadingCompleted) {
      fetchCompletedRequests();
    } else if (activeMainTab === 'rejected' && !rejectedLoaded && !loadingRejected) {
      fetchRejectedRequests();
    }
    // Delivery note tabs
    else if (['draft_dn', 'issued_dn', 'delivered_dn'].includes(activeMainTab)) {
      fetchDeliveryNotes();
    }
  }, [
    activeMainTab,
    pendingLoaded,
    approvedLoaded,
    completedLoaded,
    rejectedLoaded,
    loadingPending,
    loadingApproved,
    loadingCompleted,
    loadingRejected,
    fetchPendingRequests,
    fetchApprovedRequests,
    fetchCompletedRequests,
    fetchRejectedRequests,
    fetchDeliveryNotes
  ]);

  // Helper functions
  const showConfirmation = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirm',
    confirmColor: 'CONFIRM' | 'DELETE' | 'APPROVE' | 'WARNING' | 'INFO' = 'CONFIRM'
  ) => {
    setConfirmModal({ show: true, title, message, onConfirm, confirmText, confirmColor });
  };

  const closeConfirmation = () => {
    setConfirmModal({ ...confirmModal, show: false });
  };

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status);
    const styles: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-blue-100 text-blue-800',
      'DN_PENDING': 'bg-indigo-100 text-indigo-800',
      'DISPATCHED': 'bg-purple-100 text-purple-800',
      'FULFILLED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[normalized] || 'bg-gray-100 text-gray-600'}`}>
        {normalized.replace('_', ' ')}
      </span>
    );
  };

  // ==================== HANDLERS ====================

  const handleApproveRequest = async (requestId: number) => {
    try {
      const response = await inventoryService.approveInternalRequest(requestId);

      // Remove from pending list
      setPendingRequests(prev => prev.filter(req => req.request_id !== requestId));

      // Add to approved list if it's loaded
      if (approvedLoaded) {
        const updatedRequest = pendingRequests.find(req => req.request_id === requestId);
        if (updatedRequest) {
          setApprovedRequests(prev => [{
            ...updatedRequest,
            status: 'APPROVED' as const,
            material_details: (response as any).material_details || updatedRequest.material_details
          }, ...prev]);
        }
      }

      // Refresh materials list to get updated stock values
      const materialsData = await inventoryService.getAllInventoryItems();
      setMaterials(materialsData);
      showSuccess('Request approved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to approve request';
      showError(errorMessage);
    }
  };

  // Open rejection modal
  const handleRejectRequest = (requestId: number) => {
    setRejectionModal({
      show: true,
      requestId,
      reason: ''
    });
  };

  // Confirm rejection with reason
  const confirmRejectRequest = async () => {
    if (!rejectionModal.requestId || !rejectionModal.reason.trim()) {
      showError('Please enter a rejection reason');
      return;
    }

    try {
      await inventoryService.rejectInternalRequest(rejectionModal.requestId, rejectionModal.reason);

      // Remove from pending list
      setPendingRequests(prev => prev.filter(req => req.request_id !== rejectionModal.requestId));

      // Add to rejected list if it's loaded
      if (rejectedLoaded) {
        const rejectedRequest = pendingRequests.find(req => req.request_id === rejectionModal.requestId);
        if (rejectedRequest) {
          setRejectedRequests(prev => [{
            ...rejectedRequest,
            status: 'REJECTED' as const,
            rejection_reason: rejectionModal.reason
          }, ...prev]);
        }
      }

      showSuccess('Request rejected');
      setRejectionModal({ show: false, requestId: null, reason: '' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reject request';
      showError(errorMessage);
    }
  };

  // Close rejection modal
  const closeRejectionModal = () => {
    setRejectionModal({ show: false, requestId: null, reason: '' });
  };

  const handleCreateDNFromRequest = (request: InternalMaterialRequest) => {
    setSelectedRequestForDN(request);

    // Validate that project exists in projects list
    if (!request.project_id) {
      showError('Request is missing project information. Cannot create delivery note.');
      return;
    }

    // First check request's project_details for site engineer (from backend enrichment)
    // Then fallback to projects list
    const projectData = projects.find(p => p.project_id === request.project_id);

    // If project not found in projects list, use data from request's project_details
    if (!projectData && !request.project_details) {
      showError(`Project not found (ID: ${request.project_id}). Please refresh the page and try again.`);
      return;
    }

    // Determine site engineer with priority order:
    // 1. Buyer-selected recipient (highest priority for vendor deliveries)
    // 2. Site engineer from request's project_details
    // 3. Fallback to project list if only one site engineer
    let attentionTo = '';
    const siteEngineerFromRequest = request.project_details?.site_supervisor;
    const siteEngineersFromProjectList = projectData?.site_supervisors || [];

    if (request.intended_recipient_name) {
      // HIGHEST PRIORITY: Use the site engineer selected by buyer when completing PO
      attentionTo = request.intended_recipient_name;
    } else if (siteEngineerFromRequest?.full_name) {
      // Second priority: Use site engineer from the request's project details
      attentionTo = siteEngineerFromRequest.full_name;
    } else if (siteEngineersFromProjectList.length === 1) {
      // Third priority: Fallback to project list if only one site engineer
      attentionTo = siteEngineersFromProjectList[0].full_name;
    } else if (siteEngineersFromProjectList.length === 0 && !siteEngineerFromRequest) {
      showWarning('No Site Engineer assigned to this project. Please assign one before creating the delivery note.');
    }

    // For vendor deliveries, use final_destination_site if available for context
    const isVendorDelivery = request.source_type === 'from_vendor_delivery';
    const destinationNote = isVendorDelivery && request.final_destination_site
      ? ` (Destination: ${request.final_destination_site})`
      : '';

    setDnFormData({
      project_id: request.project_id,
      delivery_date: new Date().toISOString().split('T')[0],
      attention_to: attentionTo,
      delivery_from: inventoryConfig.store_name,
      requested_by: request.requester_details?.full_name || '',
      request_date: request.created_at ? new Date(request.created_at).toISOString().split('T')[0] : undefined,
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      transport_fee: 0,
      notes: `Material request #${request.request_number || request.request_id}${destinationNote}`
    });

    // Handle grouped materials (materials_data) or single material
    if (request.materials_data && Array.isArray(request.materials_data) && request.materials_data.length > 0) {
      // Grouped materials - create DN item for each material
      const dnItemsList = request.materials_data.map(mat => {
        const matchedInventory = findInventoryMatch(mat.material_name, mat.brand, request.item_name);
        return {
          inventory_material_id: matchedInventory?.inventory_material_id || 0,
          quantity: mat.quantity || 0,
          unit: mat.unit || matchedInventory?.unit || 'unit',
          notes: '',
          internal_request_id: request.request_id,
          material_name: isVendorDelivery ? mat.material_name : undefined,
          sub_item_name: isVendorDelivery ? mat.sub_item_name : undefined,
          brand: isVendorDelivery ? mat.brand : undefined,
          is_vendor_delivery: isVendorDelivery
        };
      });
      setDnItems(dnItemsList);
    } else {
      // Single material
      const matchedInventory = findInventoryMatch(request.item_name, request.brand);

      setDnItems([{
        inventory_material_id: matchedInventory?.inventory_material_id || request.inventory_material_id || 0,
        quantity: request.quantity || 0,
        unit: request.unit || matchedInventory?.unit || 'unit',
        notes: '',
        internal_request_id: request.request_id,
        material_name: isVendorDelivery ? request.item_name : undefined,
        sub_item_name: isVendorDelivery ? request.sub_item_name : undefined,
        brand: isVendorDelivery ? request.brand : undefined,
        is_vendor_delivery: isVendorDelivery
      }]);
    }

    setShowDeliveryNoteModal(true);
    setActiveMainTab('draft_dn');
  };

  const handleDeliveryNoteProjectSelect = (projectId: number) => {
    const selectedProject = projects.find(p => p.project_id === projectId);

    let attentionTo = '';
    if (selectedProject?.site_supervisors?.length === 1) {
      attentionTo = selectedProject.site_supervisors[0].full_name;
    }

    setDnFormData({
      ...dnFormData,
      project_id: projectId,
      attention_to: attentionTo
    });
  };

  const handleCreateDeliveryNote = async () => {
    if (!dnFormData.project_id || !dnFormData.delivery_date) {
      showWarning('Please select a project and delivery date');
      return;
    }

    if (!dnFormData.attention_to) {
      showWarning('Please select a Site Engineer to receive the delivery');
      return;
    }

    if (!dnFormData.transport_fee || dnFormData.transport_fee <= 0) {
      showWarning('Please enter the transport fee');
      return;
    }

    if (dnItems.length === 0) {
      showWarning('Please add at least one item to the delivery note');
      return;
    }

    setSaving(true);
    try {
      const newNote = await inventoryService.createDeliveryNote(dnFormData, null);

      // Use bulk endpoint to add all items in a single request (eliminates N+1 API calls)
      // Include vendor delivery info for items that need inventory creation
      const itemsToAdd = dnItems.map(item => ({
        inventory_material_id: item.inventory_material_id,
        quantity: item.quantity,
        notes: item.notes,
        internal_request_id: item.internal_request_id,
        // For vendor delivery materials - include info for auto-creating inventory entry
        is_vendor_delivery: item.is_vendor_delivery,
        material_name: item.material_name,
        sub_item_name: item.sub_item_name,
        brand: item.brand
      }));

      const bulkResult = await inventoryService.addDeliveryNoteItemsBulk(newNote.delivery_note_id!, itemsToAdd);

      if (bulkResult.errors && bulkResult.errors.length > 0) {
        showWarning(`Some items had issues: ${bulkResult.errors.join(', ')}`);
      }

      setShowDeliveryNoteModal(false);
      resetDeliveryNoteForm();

      // Refresh the appropriate request list and delivery notes
      if (activeMainTab === 'approved' && approvedLoaded) {
        fetchApprovedRequests();
      }
      fetchDeliveryNotes();

      showSuccess('Delivery note created successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create delivery note';
      showError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const resetDeliveryNoteForm = () => {
    setDnFormData({
      project_id: 0,
      delivery_date: new Date().toISOString().split('T')[0],
      attention_to: '',
      delivery_from: inventoryConfig.store_name,
      requested_by: '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      notes: '',
      transport_fee: 0
    });
    setDnItems([]);
    setSelectedRequestForDN(null);
  };

  const handleDnItemChange = (index: number, field: string, value: unknown) => {
    setDnItems(dnItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const handleIssueDeliveryNote = (noteId: number) => {
    showConfirmation(
      'Issue Delivery Note',
      'Issue this delivery note? This will deduct stock for all items.',
      async () => {
        closeConfirmation();
        try {
          await inventoryService.issueDeliveryNote(noteId);
          fetchDeliveryNotes();
          showSuccess('Delivery note issued successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to issue delivery note';
          showError(errorMessage);
        }
      },
      'Issue',
      'APPROVE'
    );
  };

  const handleDispatchDeliveryNote = (noteId: number) => {
    const now = new Date();
    const dispatchDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const dispatchTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    showConfirmation(
      'Dispatch Delivery Note',
      `Dispatch Date: ${dispatchDate}\nDispatch Time: ${dispatchTime}\n\nConfirm dispatch of this delivery note?`,
      async () => {
        closeConfirmation();
        try {
          await inventoryService.dispatchDeliveryNote(noteId);
          fetchDeliveryNotes();
          showSuccess('Delivery note dispatched successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to dispatch delivery note';
          showError(errorMessage);
        }
      },
      'Dispatch',
      'CONFIRM'
    );
  };

  const handleCancelDeliveryNote = (noteId: number) => {
    showConfirmation(
      'Cancel Delivery Note',
      'Are you sure you want to cancel this delivery note?',
      async () => {
        closeConfirmation();
        try {
          await inventoryService.cancelDeliveryNote(noteId);
          fetchDeliveryNotes();
          showSuccess('Delivery note cancelled');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to cancel delivery note';
          showError(errorMessage);
        }
      },
      'Cancel',
      'DELETE'
    );
  };

  const handleDownloadDeliveryNote = async (dn: MaterialDeliveryNote) => {
    try {
      // Use backend PDF generation for professional format
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to download delivery notes');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/inventory/delivery_note/${dn.delivery_note_id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download delivery note');
      }

      // Download the PDF file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dn.delivery_note_number || 'delivery-note'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading DN:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to download delivery note PDF';
      showError(errorMessage);
    }
  };

  const handlePrintDeliveryNote = async (dn: MaterialDeliveryNote) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to print delivery notes');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/inventory/delivery_note/${dn.delivery_note_id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load delivery note for printing');
      }

      // Open PDF in new tab for printing
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error('Error printing DN:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to print delivery note';
      showError(errorMessage);
    }
  };

  // Get current requests based on active tab
  const currentRequests = useMemo(() => {
    if (activeMainTab === 'pending') return pendingRequests;
    if (activeMainTab === 'approved') return approvedRequests;
    if (activeMainTab === 'completed') return completedRequests;
    if (activeMainTab === 'rejected') return rejectedRequests;
    return [];
  }, [activeMainTab, pendingRequests, approvedRequests, completedRequests, rejectedRequests]);

  // Memoized filtered data with search
  const filteredRequests = useMemo(() => {
    if (searchTerm === '') return currentRequests;

    return currentRequests.filter(req => {
      const matchesSearch =
        req.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.project_details?.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.requester_details?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [currentRequests, searchTerm]);

  // Pagination for requests
  const requestsTotalPages = Math.ceil(filteredRequests.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredRequests.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredRequests, currentPage]);

  // Filtered delivery notes based on active tab
  const filteredDeliveryNotes = useMemo(() => {
    return deliveryNotes.filter(dn => {
      const status = normalizeStatus(dn.status);
      if (activeMainTab === 'draft_dn') return status === 'DRAFT';
      if (activeMainTab === 'issued_dn') return ['ISSUED', 'IN_TRANSIT', 'DISPATCHED'].includes(status);
      if (activeMainTab === 'delivered_dn') return status === 'DELIVERED';
      return false;
    });
  }, [deliveryNotes, activeMainTab]);

  // Pagination for delivery notes
  const dnTotalPages = Math.ceil(filteredDeliveryNotes.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedDeliveryNotes = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredDeliveryNotes.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredDeliveryNotes, currentPage]);

  // Reset page when tab or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeMainTab, searchTerm]);

  // Clamp page when total pages changes
  useEffect(() => {
    const totalPages = ['draft_dn', 'issued_dn', 'delivered_dn'].includes(activeMainTab) ? dnTotalPages : requestsTotalPages;
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [requestsTotalPages, dnTotalPages, currentPage, activeMainTab]);

  // Get loading state for current tab
  const isCurrentTabLoading = useMemo(() => {
    if (activeMainTab === 'pending') return loadingPending;
    if (activeMainTab === 'approved') return loadingApproved;
    if (activeMainTab === 'completed') return loadingCompleted;
    if (activeMainTab === 'rejected') return loadingRejected;
    return false;
  }, [activeMainTab, loadingPending, loadingApproved, loadingCompleted, loadingRejected]);

  const stockOutStats = useMemo(() => {
    const pending = pendingLoaded ? pendingRequests.length : 0;
    return { pending };
  }, [pendingRequests, pendingLoaded]);

  // Memoized recipients list for performance (avoids recalculation on every render)
  const availableRecipients = useMemo(() => {
    const recipients: Array<{ name: string; role: string }> = [];
    const seenNames = new Set<string>();

    // First, check if we have site engineer from the selected request's project_details
    // This is the most accurate source (enriched from backend)
    if (selectedRequestForDN?.project_details?.site_supervisor?.full_name) {
      const name = selectedRequestForDN.project_details.site_supervisor.full_name;
      recipients.push({ name, role: 'Site Engineer' });
      seenNames.add(name);
    }

    // Then add site engineers from the projects list (may have additional ones)
    const selectedProject = projects.find(p => p.project_id === dnFormData.project_id);
    if (selectedProject?.site_supervisors) {
      selectedProject.site_supervisors.forEach(se => {
        // Avoid duplicates using Set for O(1) lookup
        if (!seenNames.has(se.full_name)) {
          recipients.push({ name: se.full_name, role: 'Site Engineer' });
          seenNames.add(se.full_name);
        }
      });
    }

    return recipients;
  }, [selectedRequestForDN, projects, dnFormData.project_id]);

  if (loadingInitialData) {
    return (
      <div className="flex items-center justify-center h-64">
        <ModernLoadingSpinners size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock Out - Decrease Inventory</h1>
        <p className="text-gray-600 mt-1">Issue materials to project sites</p>
      </div>

      {/* Main Tabs - Single Row with horizontal scroll */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-2 min-w-max">
          {/* Material Request Tabs */}
          <button
            onClick={() => setActiveMainTab('pending')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeMainTab === 'pending'
                ? 'bg-yellow-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Package className="w-4 h-4" />
            Pending
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeMainTab === 'pending' ? 'bg-white/20' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {pendingRequests.length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab('approved')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeMainTab === 'approved'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Approved
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeMainTab === 'approved' ? 'bg-white/20' : 'bg-blue-100 text-blue-700'
            }`}>
              {approvedRequests.length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab('draft_dn')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeMainTab === 'draft_dn'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Draft DN
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeMainTab === 'draft_dn' ? 'bg-white/20' : 'bg-gray-200 text-gray-700'
            }`}>
              {deliveryNotes.filter(dn => normalizeStatus(dn.status) === 'DRAFT').length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab('issued_dn')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeMainTab === 'issued_dn'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Issued DN
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeMainTab === 'issued_dn' ? 'bg-white/20' : 'bg-blue-100 text-blue-700'
            }`}>
              {deliveryNotes.filter(dn => ['ISSUED', 'IN_TRANSIT', 'DISPATCHED'].includes(normalizeStatus(dn.status))).length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab('completed')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeMainTab === 'completed'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Completed
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeMainTab === 'completed' ? 'bg-white/20' : 'bg-green-100 text-green-700'
            }`}>
              {completedRequests.length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab('rejected')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeMainTab === 'rejected'
                ? 'bg-red-500 text-white'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            <X className="w-4 h-4" />
            Rejected
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeMainTab === 'rejected' ? 'bg-white/20' : 'bg-red-100 text-red-700'
            }`}>
              {rejectedRequests.length}
            </span>
          </button>
          <button
            onClick={() => setActiveMainTab('delivered_dn')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeMainTab === 'delivered_dn'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Delivered DN
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeMainTab === 'delivered_dn' ? 'bg-white/20' : 'bg-green-100 text-green-700'
            }`}>
              {deliveryNotes.filter(dn => normalizeStatus(dn.status) === 'DELIVERED').length}
            </span>
          </button>
        </div>
      </div>

      {/* MATERIAL REQUESTS TABS */}
      {['pending', 'approved', 'completed', 'rejected'].includes(activeMainTab) && (
        <>
          {/* Requests Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header with Search */}
            <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-800">
                {activeMainTab.charAt(0).toUpperCase() + activeMainTab.slice(1)} Material Requests
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 w-64"
                  aria-label="Search material requests"
                />
              </div>
            </div>
            {isCurrentTabLoading ? (
              <div className="flex items-center justify-center py-12">
                <ModernLoadingSpinners size="md" />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock / Destination</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedRequests.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                        No material requests found
                      </td>
                    </tr>
                  ) : (
                  paginatedRequests.map((req) => (
                    <tr key={req.request_id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        #{req.request_number || req.request_id}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{req.project_details?.project_name || '-'}</div>
                          <div className="text-gray-500 text-xs">{req.project_details?.project_code || ''}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>
                          <div className="font-medium">{req.requester_details?.full_name || '-'}</div>
                          <div className="text-gray-500 text-xs">{req.requester_details?.email || ''}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>
                          {/* Show grouped materials - if 1 show directly, if more show View button */}
                          {req.materials_data && Array.isArray(req.materials_data) && req.materials_data.length > 0 ? (
                            req.materials_data.length === 1 ? (
                              // Single material from grouped data - show directly with inventory status
                              (() => {
                                const mat = req.materials_data[0];
                                const inventoryMatch = findInventoryMatch(mat.material_name, mat.brand, req.item_name);
                                const isInInventory = !!inventoryMatch;
                                // Use material_details if available, otherwise use materials_data
                                const displayName = req.material_details?.material_name || mat.material_name || req.item_name;
                                return (
                                  <div>
                                    <div className="font-semibold text-gray-900">{displayName}</div>
                                    {req.material_details?.material_code && (
                                      <div className="text-xs text-gray-400">{req.material_details.material_code}</div>
                                    )}
                                    {/* Inventory status indicator - checks sub-item */}
                                    {isInInventory ? (
                                      <div className="flex items-center gap-1 mt-1">
                                        <CheckCircle className="w-3 h-3 text-green-500" />
                                        <span className="text-[10px] text-green-600">In Stock: {inventoryMatch.current_stock} {inventoryMatch.unit}</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 mt-1">
                                        <Package className="w-3 h-3 text-orange-500" />
                                        <span className="text-[10px] text-orange-600">Awaiting Vendor</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              // Multiple materials - show item name first, then View button
                              <div>
                                <div className="font-semibold text-gray-900 mb-2">{req.material_details?.material_name || req.item_name}</div>
                                {req.material_details?.material_code && (
                                  <div className="text-xs text-gray-400 mb-2">{req.material_details.material_code}</div>
                                )}
                                <button
                                  onClick={() => setMaterialsViewModal({
                                    show: true,
                                    materials: req.materials_data || [],
                                    requestNumber: req.request_number || null,
                                    parentMaterialName: req.item_name
                                  })}
                                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                                >
                                  <Package className="w-3.5 h-3.5 mr-1.5" />
                                  View {req.materials_data.length} Materials
                                </button>
                              </div>
                            )
                          ) : (
                            // Single material without materials_data
                            (() => {
                              const inventoryMatch = findInventoryMatch(req.item_name, req.brand);
                              const isInInventory = !!inventoryMatch;
                              // Use material_details if available, otherwise use item_name
                              const displayName = req.material_details?.material_name || req.item_name;
                              return (
                                <div>
                                  <div className="font-semibold text-gray-900">{displayName}</div>
                                  {req.material_details?.material_code && (
                                    <div className="text-xs text-gray-400">{req.material_details.material_code}</div>
                                  )}
                                  {/* Inventory status indicator - checks sub-item */}
                                  {isInInventory ? (
                                    <div className="flex items-center gap-1 mt-1">
                                      <CheckCircle className="w-3 h-3 text-green-500" />
                                      <span className="text-[10px] text-green-600">In Stock: {inventoryMatch.current_stock} {inventoryMatch.unit}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Package className="w-3 h-3 text-orange-500" />
                                      <span className="text-[10px] text-orange-600">Awaiting Vendor</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          )}
                          {/* Show source type badge for vendor deliveries */}
                          {req.source_type === 'from_vendor_delivery' && (
                            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                              <Package className="w-3 h-3 mr-1" />
                              Vendor Delivery
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-cyan-600">
                        {/* Show materials count for grouped requests */}
                        {req.materials_count && req.materials_count > 1
                          ? `${req.materials_count} items`
                          : `${req.quantity} ${req.material_details?.unit || ''}`}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {/* For vendor delivery, show destination instead of stock */}
                        {req.source_type === 'from_vendor_delivery' ? (
                          <span className="font-medium text-orange-600">
                            → {req.final_destination_site || 'Site'}
                          </span>
                        ) : (
                          (() => {
                            // Get stock from material_details or lookup from materials array
                            const matData0 = req.materials_data?.[0];
                            const inventoryMatch = findInventoryMatch(
                              matData0?.material_name || req.item_name,
                              matData0?.brand || req.brand,
                              req.item_name
                            );
                            const stockValue = req.material_details?.updated_stock ?? inventoryMatch?.current_stock ?? 0;
                            const unitValue = req.material_details?.unit || inventoryMatch?.unit || '';
                            return (
                              <span className={`font-medium ${stockValue >= (req.quantity || 0) ? 'text-green-600' : 'text-red-600'}`}>
                                {stockValue} {unitValue}
                              </span>
                            );
                          })()
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(req.status || 'PENDING')}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(req.created_at || '').toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {normalizeStatus(req.status) === 'PENDING' && (
                            (() => {
                              // Vendor deliveries bring stock from outside — skip inventory check
                              let hasEnoughStock = false;
                              if (req.source_type === 'from_vendor_delivery') {
                                hasEnoughStock = true;
                              } else if (req.materials_data && Array.isArray(req.materials_data) && req.materials_data.length > 0) {
                                // Grouped request: ALL materials must have sufficient stock
                                hasEnoughStock = req.materials_data.every((mat: any) => {
                                  const match = findInventoryMatch(mat.material_name, mat.brand, req.item_name);
                                  return match && (match.current_stock || 0) >= (mat.quantity || 0);
                                });
                              } else {
                                // Single-material: prefer authoritative backend field, fallback to inventory lookup
                                const singleStock = req.material_details?.current_stock;
                                if (singleStock !== undefined) {
                                  hasEnoughStock = singleStock >= (req.quantity || 0);
                                } else {
                                  const match = findInventoryMatch(req.item_name, req.brand, req.item_name);
                                  hasEnoughStock = !!match && (match.current_stock || 0) >= (req.quantity || 0);
                                }
                              }

                              const isButtonDisabled = !hasEnoughStock;
                              const disabledTitle = isButtonDisabled
                                ? 'Insufficient stock — check inventory levels before approving'
                                : '';

                              return (
                                <>
                                  <button
                                    onClick={() => handleApproveRequest(req.request_id!)}
                                    disabled={isButtonDisabled}
                                    className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
                                      isButtonDisabled
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : req.source_type === 'from_vendor_delivery'
                                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                                    }`}
                                    aria-label={req.source_type === 'from_vendor_delivery'
                                      ? `Confirm vendor delivery ${req.request_number}`
                                      : `Approve request ${req.request_number}`}
                                    title={disabledTitle}
                                  >
                                    {req.source_type === 'from_vendor_delivery' ? 'Confirm Receipt' : 'Approve'}
                                  </button>
                                  {/* Hide Reject button for vendor deliveries */}
                                  {req.source_type !== 'from_vendor_delivery' && (
                                    <button
                                      onClick={() => handleRejectRequest(req.request_id!)}
                                      className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                                      aria-label={`Reject request ${req.request_number}`}
                                    >
                                      Reject
                                    </button>
                                  )}
                                </>
                              );
                            })()
                          )}
                          {(req.status === 'APPROVED' || req.status === 'approved') && (
                            (() => {
                              // Check if all materials have sufficient stock
                              let hasStock = false;
                              if (req.materials_data && Array.isArray(req.materials_data) && req.materials_data.length > 0) {
                                hasStock = req.materials_data.every((mat: any) => {
                                  const match = findInventoryMatch(mat.material_name, mat.brand, req.item_name);
                                  return match && (match.current_stock || 0) >= (mat.quantity || 0);
                                });
                              } else {
                                const match = findInventoryMatch(req.item_name, req.brand);
                                hasStock = !!match && (match.current_stock || 0) >= (req.quantity || 0);
                              }

                              return hasStock ? (
                                <button
                                  onClick={() => handleCreateDNFromRequest(req)}
                                  className="px-3 py-1.5 text-xs bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-medium flex items-center gap-1"
                                  aria-label={`Create delivery note for request ${req.request_number}`}
                                >
                                  <FileText className="w-3 h-3" />
                                  Create DN
                                </button>
                              ) : (
                                <span
                                  className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg font-medium flex items-center gap-1 border border-amber-200"
                                  title="Stock is insufficient. Complete vendor delivery inspection in Stock In page first."
                                >
                                  <Package className="w-3 h-3" />
                                  Awaiting Stock
                                </span>
                              );
                            })()
                          )}
                          {(req.status === 'DN_PENDING' || req.status === 'dn_pending') && (
                            <span className="px-3 py-1.5 text-xs bg-indigo-100 text-indigo-600 rounded-lg font-medium flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              DN Pending
                            </span>
                          )}
                          {(req.status === 'DISPATCHED' || req.status === 'dispatched') && (
                            <span className="px-3 py-1.5 text-xs bg-purple-100 text-purple-600 rounded-lg font-medium flex items-center gap-1">
                              <ArrowUpCircle className="w-3 h-3" />
                              In Transit
                            </span>
                          )}
                          {(req.status === 'FULFILLED' || req.status === 'fulfilled') && (
                            <span className="px-3 py-1.5 text-xs bg-green-100 text-green-600 rounded-lg font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Delivered
                            </span>
                          )}
                          {(req.status === 'REJECTED' || req.status === 'rejected') && (
                            <div className="flex flex-col gap-1">
                              <span className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg font-medium flex items-center gap-1">
                                <X className="w-3 h-3" />
                                Rejected
                              </span>
                              {req.rejection_reason && (
                                <span className="text-xs text-red-600 italic max-w-[200px] truncate" title={req.rejection_reason}>
                                  "{req.rejection_reason}"
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}

            {/* Pagination for Requests */}
            {filteredRequests.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} requests
                  </div>
                  {requestsTotalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </button>
                      <span className="text-sm text-gray-600 px-2">
                        Page {currentPage} of {requestsTotalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, requestsTotalPages))}
                        disabled={currentPage === requestsTotalPages}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* DELIVERY NOTES TABS */}
      {['draft_dn', 'issued_dn', 'delivered_dn'].includes(activeMainTab) && (
        <>
          {/* Delivery Notes Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header with Create Button */}
            <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-800">
                {activeMainTab === 'draft_dn' ? 'Draft' : activeMainTab === 'issued_dn' ? 'Issued' : 'Delivered'} Delivery Notes
              </h2>
              {/* <button
                onClick={() => setShowDeliveryNoteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                aria-label="Create new delivery note"
              >
                <Plus className="w-5 h-5" />
                New Delivery Note
              </button> */}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">MDN Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date / Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedDeliveryNotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No {activeMainTab === 'draft_dn' ? 'draft' : activeMainTab === 'issued_dn' ? 'issued' : 'delivered'} delivery notes found
                    </td>
                  </tr>
                ) : (
                  paginatedDeliveryNotes.map((dn) => (
                      <tr key={dn.delivery_note_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {dn.delivery_note_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {dn.project_details?.project_name || `Project ${dn.project_id}`}
                          <span className="text-gray-500 text-xs block">{dn.project_details?.location}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {dn.total_items || dn.items?.length || 0} items
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {dn.vehicle_number || '-'}
                          {dn.driver_name && <span className="text-gray-500 text-xs block">{dn.driver_name}</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            dn.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                            dn.status === 'ISSUED' ? 'bg-blue-100 text-blue-700' :
                            dn.status === 'IN_TRANSIT' ? 'bg-purple-100 text-purple-700' :
                            dn.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                            dn.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {dn.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {dn.status === 'IN_TRANSIT' || dn.status === 'DELIVERED' ? (
                            dn.dispatched_at ? (
                              (() => {
                                const date = new Date(dn.dispatched_at);
                                if (isNaN(date.getTime())) {
                                  return <span className="text-gray-400">Invalid date</span>;
                                }
                                return (
                                  <div>
                                    <div className="font-medium text-gray-900">
                                      {date.toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                      })}
                                    </div>
                                    <div className="text-xs text-purple-600">
                                      {date.toLocaleTimeString('en-GB', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                      })}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-gray-400">Not dispatched</span>
                            )
                          ) : (
                            (() => {
                              const date = new Date(dn.delivery_date || '');
                              return isNaN(date.getTime())
                                ? <span className="text-gray-400">-</span>
                                : date.toLocaleDateString('en-GB');
                            })()
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDownloadDeliveryNote(dn)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                              title="Download PDF"
                              aria-label={`Download ${dn.delivery_note_number}`}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrintDeliveryNote(dn)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="Print"
                              aria-label={`Print ${dn.delivery_note_number}`}
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {dn.status === 'DRAFT' && (
                              <>
                                <button
                                  onClick={() => handleIssueDeliveryNote(dn.delivery_note_id!)}
                                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                  aria-label={`Issue ${dn.delivery_note_number}`}
                                >
                                  Issue
                                </button>
                                <button
                                  onClick={() => handleCancelDeliveryNote(dn.delivery_note_id!)}
                                  className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                                  aria-label={`Cancel ${dn.delivery_note_number}`}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {dn.status === 'ISSUED' && (
                              <button
                                onClick={() => handleDispatchDeliveryNote(dn.delivery_note_id!)}
                                className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                aria-label={`Dispatch ${dn.delivery_note_number}`}
                              >
                                Dispatch
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>

            {/* Pagination for Delivery Notes */}
            {filteredDeliveryNotes.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, filteredDeliveryNotes.length)} of {filteredDeliveryNotes.length} delivery notes
                  </div>
                  {dnTotalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </button>
                      <span className="text-sm text-gray-600 px-2">
                        Page {currentPage} of {dnTotalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, dnTotalPages))}
                        disabled={currentPage === dnTotalPages}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Delivery Note Modal - Simplified */}
      {showDeliveryNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create Delivery Note</h2>
              <button onClick={() => setShowDeliveryNoteModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Show project and site engineer info from request if available */}
              {selectedRequestForDN?.project_details ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-blue-700 mb-1">Project</label>
                        <div className="text-sm font-semibold text-blue-900">
                          {selectedRequestForDN.project_details.project_name}
                        </div>
                        <div className="text-xs text-blue-600">
                          Code: {selectedRequestForDN.project_details.project_code}
                        </div>
                        {selectedRequestForDN.project_details.area && (
                          <div className="text-xs text-blue-600">
                            Area: {selectedRequestForDN.project_details.area}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-blue-700 mb-1">
                          Assigned Site Engineers {selectedRequestForDN.project_details.site_supervisors && `(${selectedRequestForDN.project_details.site_supervisors.length})`}
                        </label>
                        {selectedRequestForDN.project_details.site_supervisors && selectedRequestForDN.project_details.site_supervisors.length > 0 ? (
                          <div className="space-y-1">
                            {selectedRequestForDN.project_details.site_supervisors.map((se, idx) => (
                              <div key={se.user_id} className="text-xs">
                                <span className="font-medium text-blue-900">{se.full_name}</span>
                                <span className="text-blue-600 ml-1">({se.email})</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-orange-600 font-medium">
                            No Site Engineers assigned
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Site Engineer Selection Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Attention To (Site Engineer) *
                    </label>
                    {selectedRequestForDN.project_details.site_supervisors && selectedRequestForDN.project_details.site_supervisors.length > 0 ? (
                      <select
                        value={dnFormData.attention_to}
                        onChange={(e) => setDnFormData({ ...dnFormData, attention_to: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                        required
                        aria-label="Select site engineer"
                      >
                        <option value="">Select Site Engineer</option>
                        {selectedRequestForDN.project_details.site_supervisors.map((se) => (
                          <option key={se.user_id} value={se.full_name}>
                            {se.full_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={dnFormData.attention_to}
                          onChange={(e) => setDnFormData({ ...dnFormData, attention_to: e.target.value })}
                          placeholder="Enter site engineer name or contact person"
                          className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-orange-50"
                          required
                          aria-label="Site engineer name"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This project has no assigned site engineers. Please enter the recipient's name manually.
                        </p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
                    <select
                      value={dnFormData.project_id}
                      onChange={(e) => handleDeliveryNoteProjectSelect(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                      required
                      aria-label="Select project"
                    >
                      <option value={0}>Select Project</option>
                      {projects.map((proj) => (
                        <option key={proj.project_id} value={proj.project_id}>
                          {proj.project_name} ({proj.project_code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Attention To (Site Engineer) *</label>
                    {availableRecipients.length > 0 ? (
                      <select
                        value={dnFormData.attention_to}
                        onChange={(e) => setDnFormData({ ...dnFormData, attention_to: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                        required
                        aria-label="Select site engineer"
                      >
                        <option value="">Select Site Engineer</option>
                        {availableRecipients.map((recipient, idx) => (
                          <option key={idx} value={recipient.name}>
                            {recipient.name} ({recipient.role})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full px-3 py-2 border border-red-300 bg-red-50 rounded-lg text-red-700 text-sm">
                        <span className="font-medium">⚠️ No Site Engineer assigned</span>
                        <p className="text-xs mt-1 text-red-600">Please assign a Site Engineer to this project first.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date *</label>
                  <input
                    type="date"
                    value={dnFormData.delivery_date}
                    onChange={(e) => setDnFormData({ ...dnFormData, delivery_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    required
                    aria-label="Delivery date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Requested By</label>
                  <input
                    type="text"
                    value={dnFormData.requested_by}
                    onChange={(e) => setDnFormData({ ...dnFormData, requested_by: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    aria-label="Requested by"
                  />
                </div>
              </div>

              {/* Transport & Delivery Details */}
              <div className="border-t pt-6 mt-6">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center mb-4">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                  </svg>
                  Transport & Delivery Details
                </h3>

                {/* Transport Fee Calculation Section - Full Width */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Transport Fee Calculation</h4>

                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter total transport fee <span className="text-red-500">*</span> <span className="text-xs text-gray-500 font-normal">(Default: 1.00 AED per unit)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dnFormData.transport_fee === 0 ? '' : dnFormData.transport_fee}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty string or valid decimal numbers
                      if (value === '') {
                        setDnFormData({ ...dnFormData, transport_fee: 0 });
                      } else {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue)) {
                          setDnFormData({ ...dnFormData, transport_fee: numValue });
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1.5 flex items-start">
                    <svg className="w-4 h-4 text-gray-400 mr-1 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    This is the total transport cost paid for material delivered.
                  </p>

                  {/* Total Transport Fee Display */}
                  {dnFormData.transport_fee > 0 && (
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
                          AED {(dnFormData.transport_fee || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-white rounded-md p-2 border border-blue-200">
                        <p className="text-xs text-blue-800 font-medium">
                          📊 Calculation: 1 × {(dnFormData.transport_fee || 0).toFixed(2)} = <span className="font-bold">{(dnFormData.transport_fee || 0).toFixed(2)} AED</span>
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-amber-600 italic mt-2">
                    ⚡ Total transport fee will be calculated automatically when you enter the quantity
                  </p>
                </div>

                {/* 2x2 Grid Layout for Driver & Vehicle Details */}
                <div className="grid grid-cols-2 gap-4">

                  {/* Row 1, Col 2: Driver Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Driver Name *
                    </label>
                    <input
                      type="text"
                      value={dnFormData.driver_name}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow letters, spaces, and common name characters
                        if (/^[a-zA-Z\s.''-]*$/.test(value)) {
                          setDnFormData({ ...dnFormData, driver_name: value });
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      placeholder="Enter driver name"
                      required
                    />
                  </div>

                  {/* Row 2, Col 1: Vehicle Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vehicle Number *
                    </label>
                    <input
                      type="text"
                      value={dnFormData.vehicle_number}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow alphanumeric characters, hyphens, and spaces for vehicle numbers
                        if (/^[a-zA-Z0-9\s-]*$/.test(value)) {
                          setDnFormData({ ...dnFormData, vehicle_number: value.toUpperCase() });
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      placeholder="Enter vehicle number"
                      required
                    />
                  </div>

                  {/* Row 2, Col 2: Driver Contact */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Driver Contact
                    </label>
                    <input
                      type="tel"
                      value={dnFormData.driver_contact}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers, +, -, spaces, and parentheses
                        if (/^[0-9+\s()-]*$/.test(value)) {
                          setDnFormData({ ...dnFormData, driver_contact: value });
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      placeholder="Enter driver contact number"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Items *</label>
                </div>

                <div className="space-y-2">
                  {dnItems.map((item, index) => (
                    <div key={index} className={`flex items-center gap-2 p-2 rounded ${item.is_vendor_delivery ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'}`}>
                      <div className="flex-1 min-w-0">
                        {/* Show material name directly for vendor deliveries, dropdown for store materials */}
                        {item.is_vendor_delivery ? (
                          <div className="px-2 py-1 text-sm">
                            <div className="font-medium text-gray-900">{item.material_name}</div>
                            {item.sub_item_name && <div className="text-xs text-gray-500">{item.sub_item_name}</div>}
                            <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                              <Package className="w-2.5 h-2.5 mr-0.5" />
                              Vendor Delivery
                            </span>
                          </div>
                        ) : (
                          <div className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white">
                            {materials.find(mat => mat.inventory_material_id === item.inventory_material_id)?.material_name || 'No material selected'} - Stock: {materials.find(mat => mat.inventory_material_id === item.inventory_material_id)?.current_stock || 0} {materials.find(mat => mat.inventory_material_id === item.inventory_material_id)?.unit || ''}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="w-20 px-2 py-1 text-sm text-center bg-gray-100 border border-gray-300 rounded text-gray-700">
                          {item.quantity}
                        </div>
                        <div className="text-sm text-gray-700 px-1 py-1 whitespace-nowrap">
                          {item.unit || 'unit'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={dnFormData.notes}
                  onChange={(e) => setDnFormData({ ...dnFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  rows={3}
                  aria-label="Delivery note notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowDeliveryNoteModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateDeliveryNote}
                  className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={saving || !dnFormData.attention_to || !dnFormData.vehicle_number || !dnFormData.driver_name}
                  title={
                    !dnFormData.attention_to ? 'Please select a Site Engineer first' :
                    !dnFormData.vehicle_number ? 'Please enter Vehicle Number' :
                    !dnFormData.driver_name ? 'Please enter Driver Name' : ''
                  }
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Creating...' : 'Create Delivery Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmation}
        confirmText={confirmModal.confirmText}
        confirmColor={confirmModal.confirmColor}
      />

      {/* Rejection Reason Modal */}
      {rejectionModal.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-50 to-red-100 px-6 py-4 border-b border-red-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <X className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Reject Request</h3>
                  <p className="text-sm text-gray-600">Please provide a reason for rejection</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionModal.reason}
                onChange={(e) => setRejectionModal(prev => ({ ...prev, reason: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={4}
                placeholder="Enter the reason for rejecting this request..."
                autoFocus
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
              <button
                onClick={closeRejectionModal}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRejectRequest}
                disabled={!rejectionModal.reason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Materials View Modal */}
      {materialsViewModal.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Materials - Request #{materialsViewModal.requestNumber}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {materialsViewModal.materials.length} materials in this request
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMaterialsViewModal({ show: false, materials: [], requestNumber: null })}
                  className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Materials List */}
            <div className="p-4 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                {materialsViewModal.materials.map((mat: any, idx: number) => {
                  // Check if material exists in inventory - use sub-item (brand) for check
                  const inventoryMatch = findInventoryMatch(mat.material_name, mat.brand, materialsViewModal.parentMaterialName);
                  const isInInventory = !!inventoryMatch;
                  const currentStock = inventoryMatch?.current_stock || 0;
                  const hasEnoughStock = isInInventory && currentStock >= (mat.quantity || 0);

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${
                        !isInInventory
                          ? 'bg-orange-50 border-orange-200'
                          : hasEnoughStock
                            ? 'bg-green-50 border-green-200'
                            : 'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">{mat.material_name}</div>
                          {materialsViewModal.parentMaterialName && (
                            <div className="text-xs text-gray-500">{materialsViewModal.parentMaterialName}</div>
                          )}
                          {mat.specification && <div className="text-xs text-gray-400">{mat.specification}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-cyan-600">
                            {mat.quantity} {mat.unit || 'nos'}
                          </div>
                          {mat.unit_price > 0 && (
                            <div className="text-xs text-gray-500">
                              AED {mat.unit_price?.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Inventory Status */}
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        {!isInInventory ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Package className="w-3.5 h-3.5 text-orange-500" />
                            <span className="text-orange-600 font-medium">Awaiting Vendor Delivery</span>
                          </div>
                        ) : hasEnoughStock ? (
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              <span className="text-green-600 font-medium">Available in inventory</span>
                            </div>
                            <span className="text-gray-600">Stock: {currentStock} {inventoryMatch?.unit || mat.unit || 'nos'}</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <ArrowUpCircle className="w-3.5 h-3.5 text-yellow-500" />
                              <span className="text-yellow-600 font-medium">Low stock</span>
                            </div>
                            <span className="text-gray-600">Stock: {currentStock} {inventoryMatch?.unit || mat.unit || 'nos'} (need {mat.quantity})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end">
              <button
                onClick={() => setMaterialsViewModal({ show: false, materials: [], requestNumber: null })}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockOutPage;
