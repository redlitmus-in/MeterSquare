import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Package, CheckCircle, X, Save, FileText,
  ArrowUpCircle, RefreshCw, Download, Printer
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
import { INVENTORY_DEFAULTS } from '@/lib/inventoryConstants';
import { normalizeStatus } from '../utils/inventoryHelpers';
import ConfirmationModal from '../components/ConfirmationModal';

type StockOutSubTab = 'requests' | 'delivery-notes';

const StockOutPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  // Tab state
  const [activeSubTab, setActiveSubTab] = useState<StockOutSubTab>('requests');

  // Handle URL parameters
  useEffect(() => {
    const subtab = searchParams.get('subtab');
    if (subtab === 'requests') setActiveSubTab('requests');
    else if (subtab === 'delivery-notes') setActiveSubTab('delivery-notes');
  }, [searchParams]);

  // Data states
  const [allRequests, setAllRequests] = useState<InternalMaterialRequest[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [dnStatusFilter, setDnStatusFilter] = useState<string>('DRAFT');
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
    notes: ''
  });

  // Items to add to the delivery note
  const [dnItems, setDnItems] = useState<Array<{
    inventory_material_id: number;
    quantity: number;
    notes: string;
    internal_request_id?: number;
    use_backup?: boolean;
    // For vendor delivery materials (not yet in inventory)
    material_name?: string;
    brand?: string;
    is_vendor_delivery?: boolean;
  }>>([]);

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    try {
      // Use getSentInternalRequests() to get ALL requests with request_send=True
      // This includes requests from Buyers, not just the current user's requests
      const [requestsData, deliveryNotesResult, projectsData, materialsData, configData] = await Promise.all([
        inventoryService.getSentInternalRequests(),
        inventoryService.getAllDeliveryNotes(),
        inventoryService.getAllProjects(),
        inventoryService.getAllInventoryItems(),
        inventoryService.getInventoryConfig()
      ]);

      setAllRequests(requestsData);
      setDeliveryNotes(deliveryNotesResult.delivery_notes || []);
      setProjects(projectsData || []);
      setMaterials(materialsData);
      setInventoryConfig(configData);
      setDnFormData(prev => ({ ...prev, delivery_from: configData.store_name }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data';
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      await inventoryService.approveInternalRequest(requestId);
      // Update local state smoothly instead of full page reload
      setAllRequests(prev => prev.map(req =>
        req.request_id === requestId
          ? { ...req, status: 'APPROVED' as const }
          : req
      ));
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
      // Update local state smoothly instead of full page reload
      setAllRequests(prev => prev.map(req =>
        req.request_id === rejectionModal.requestId
          ? { ...req, status: 'REJECTED' as const, rejection_reason: rejectionModal.reason }
          : req
      ));
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
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      notes: `Material request #${request.request_number || request.request_id}${destinationNote}`
    });

    // For vendor delivery requests, store material info since it's not in inventory
    setDnItems([{
      inventory_material_id: request.inventory_material_id || 0,
      quantity: request.quantity || 0,
      notes: '',
      internal_request_id: request.request_id,
      material_name: isVendorDelivery ? request.material_name : undefined,
      brand: isVendorDelivery ? request.brand : undefined,
      is_vendor_delivery: isVendorDelivery
    }]);

    setShowDeliveryNoteModal(true);
    setActiveSubTab('delivery-notes');
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

    if (dnItems.length === 0) {
      showWarning('Please add at least one item to the delivery note');
      return;
    }

    setSaving(true);
    try {
      const newNote = await inventoryService.createDeliveryNote(dnFormData);

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
        brand: item.brand
      }));

      const bulkResult = await inventoryService.addDeliveryNoteItemsBulk(newNote.delivery_note_id!, itemsToAdd);

      if (bulkResult.errors && bulkResult.errors.length > 0) {
        showWarning(`Some items had issues: ${bulkResult.errors.join(', ')}`);
      }

      setShowDeliveryNoteModal(false);
      resetDeliveryNoteForm();
      fetchData();
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
      notes: ''
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
          fetchData();
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
          fetchData();
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
          fetchData();
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

      // Use correct API base URL from environment (VITE_API_BASE_URL includes /api)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';
      const response = await fetch(`${baseUrl}/delivery_note/${dn.delivery_note_id}/download`, {
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

      // Use correct API base URL from environment (VITE_API_BASE_URL includes /api)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';
      const response = await fetch(`${baseUrl}/delivery_note/${dn.delivery_note_id}/download`, {
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

  // Memoized filtered data
  const filteredRequests = useMemo(() => {
    return allRequests.filter(req => {
      const normalized = normalizeStatus(req.status);

      // Map status filter to actual statuses
      let matchesStatus = false;
      if (statusFilter === 'PENDING') {
        matchesStatus = normalized === 'PENDING';
      } else if (statusFilter === 'APPROVED') {
        matchesStatus = normalized === 'APPROVED' || normalized === 'DN_PENDING';
      } else if (statusFilter === 'COMPLETED') {
        matchesStatus = normalized === 'DISPATCHED' || normalized === 'FULFILLED';
      } else if (statusFilter === 'REJECTED') {
        matchesStatus = normalized === 'REJECTED' || req.status?.toLowerCase() === 'rejected';
      }

      const matchesSearch = searchTerm === '' ||
        req.material_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.project_details?.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.requester_details?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [allRequests, statusFilter, searchTerm]);

  const stockOutStats = useMemo(() => {
    const pending = allRequests.filter(r => normalizeStatus(r.status) === 'PENDING').length;
    return { pending };
  }, [allRequests]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
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

      {/* Info Banner */}
      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <ArrowUpCircle className="w-5 h-5 text-cyan-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-cyan-900">Stock Out - Decrease Inventory</h3>
            <p className="text-sm text-cyan-700 mt-1">
              Issue materials <strong>going out</strong> to project sites. This <strong>decreases stock quantities</strong>.
            </p>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-cyan-600">
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                <strong>Requests:</strong> Material requests from Procurement team
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <strong>Delivery Notes:</strong> Official dispatch documents for site delivery
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSubTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === 'requests'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          aria-label="Material Requests tab"
        >
          <Package className="w-4 h-4 inline mr-2" />
          Material Requests
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
            {stockOutStats.pending}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('delivery-notes')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === 'delivery-notes'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          aria-label="Delivery Notes tab"
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Delivery Notes
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
            {deliveryNotes.length}
          </span>
        </button>
      </div>

      {/* REQUESTS SUB-TAB */}
      {activeSubTab === 'requests' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex gap-2 flex-wrap">
              {['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === status
                      ? status === 'REJECTED'
                        ? 'bg-red-600 text-white'
                        : 'bg-cyan-600 text-white'
                      : status === 'REJECTED'
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  aria-label={`Filter by ${status}`}
                >
                  {status}
                </button>
              ))}
            </div>
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

          {/* Requests Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      No material requests found
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => (
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
                          <div className="font-medium">{req.material_name}</div>
                          {req.brand && <div className="text-gray-500 text-xs">{req.brand}</div>}
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
                        {req.quantity} {req.material_details?.unit || ''}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {/* For vendor delivery, show destination instead of stock */}
                        {req.source_type === 'from_vendor_delivery' ? (
                          <span className="font-medium text-orange-600">
                            → {req.final_destination_site || 'Site'}
                          </span>
                        ) : (
                          <span className={`font-medium ${(req.material_details?.current_stock || 0) >= (req.quantity || 0) ? 'text-green-600' : 'text-red-600'}`}>
                            {req.material_details?.current_stock || 0} {req.material_details?.unit || ''}
                          </span>
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
                            <>
                              <button
                                onClick={() => handleApproveRequest(req.request_id!)}
                                className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
                                  req.source_type === 'from_vendor_delivery'
                                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}
                                aria-label={req.source_type === 'from_vendor_delivery'
                                  ? `Confirm vendor delivery ${req.request_number}`
                                  : `Approve request ${req.request_number}`}
                              >
                                {req.source_type === 'from_vendor_delivery' ? 'Confirm Receipt' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req.request_id!)}
                                className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                                aria-label={`Reject request ${req.request_number}`}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {(req.status === 'APPROVED' || req.status === 'approved') && (
                            <button
                              onClick={() => handleCreateDNFromRequest(req)}
                              className="px-3 py-1.5 text-xs bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-medium flex items-center gap-1"
                              aria-label={`Create delivery note for request ${req.request_number}`}
                            >
                              <FileText className="w-3 h-3" />
                              Create DN
                            </button>
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
          </div>
        </>
      )}

      {/* DELIVERY NOTES SUB-TAB */}
      {activeSubTab === 'delivery-notes' && (
        <>
          {/* Filters for Delivery Notes */}
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {['DRAFT', 'ISSUED', 'DELIVERED'].map(status => (
                <button
                  key={status}
                  onClick={() => setDnStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    dnStatusFilter === status
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  aria-label={`Filter by ${status}`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDeliveryNoteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
              aria-label="Create new delivery note"
            >
              <Plus className="w-5 h-5" />
              New Delivery Note
            </button>
          </div>

          {/* Delivery Notes Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">MDN Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {deliveryNotes
                  .filter(dn => {
                    if (dnStatusFilter === 'DRAFT') return dn.status === 'DRAFT';
                    if (dnStatusFilter === 'ISSUED') return dn.status === 'ISSUED' || dn.status === 'IN_TRANSIT';
                    if (dnStatusFilter === 'DELIVERED') return dn.status === 'DELIVERED';
                    return true;
                  })
                  .length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No delivery notes found
                    </td>
                  </tr>
                ) : (
                  deliveryNotes
                    .filter(dn => {
                      if (dnStatusFilter === 'DRAFT') return dn.status === 'DRAFT';
                      if (dnStatusFilter === 'ISSUED') return dn.status === 'ISSUED' || dn.status === 'IN_TRANSIT';
                      if (dnStatusFilter === 'DELIVERED') return dn.status === 'DELIVERED';
                      return true;
                    })
                    .map((dn) => (
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
                          {new Date(dn.delivery_date || '').toLocaleDateString()}
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
                          {selectedRequestForDN.project_details.location && ` • ${selectedRequestForDN.project_details.location}`}
                        </div>
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
                            ⚠️ No Site Engineers assigned
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number *</label>
                  <input
                    type="text"
                    value={dnFormData.vehicle_number}
                    onChange={(e) => setDnFormData({ ...dnFormData, vehicle_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    required
                    aria-label="Vehicle number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name *</label>
                  <input
                    type="text"
                    value={dnFormData.driver_name}
                    onChange={(e) => setDnFormData({ ...dnFormData, driver_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    required
                    aria-label="Driver name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver Contact</label>
                  <input
                    type="text"
                    value={dnFormData.driver_contact}
                    onChange={(e) => setDnFormData({ ...dnFormData, driver_contact: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                    aria-label="Driver contact"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Items *</label>
                </div>

                <div className="space-y-2">
                  {dnItems.map((item, index) => (
                    <div key={index} className={`grid grid-cols-12 gap-2 items-center p-2 rounded ${item.is_vendor_delivery ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'}`}>
                      <div className="col-span-7">
                        {/* Show material name directly for vendor deliveries, dropdown for store materials */}
                        {item.is_vendor_delivery ? (
                          <div className="px-2 py-1 text-sm">
                            <div className="font-medium text-gray-900">{item.material_name}</div>
                            {item.brand && <div className="text-xs text-gray-500">{item.brand}</div>}
                            <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                              <Package className="w-2.5 h-2.5 mr-0.5" />
                              Vendor Delivery
                            </span>
                          </div>
                        ) : (
                          <select
                            value={item.inventory_material_id}
                            onChange={(e) => handleDnItemChange(index, 'inventory_material_id', parseInt(e.target.value))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            aria-label={`Material for item ${index + 1}`}
                          >
                            <option value={0}>Select Material</option>
                            {materials.map((mat) => (
                              <option key={mat.inventory_material_id} value={mat.inventory_material_id}>
                                {mat.material_name} - Stock: {mat.current_stock} {mat.unit}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="col-span-2">
                        <div className="px-2 py-1 text-sm text-gray-900 font-medium">
                          {item.quantity}
                        </div>
                      </div>
                      <div className="col-span-3">
                        {/* Show unit */}
                        <div className="text-sm text-gray-700 px-2 py-1">
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
    </div>
  );
};

export default StockOutPage;
