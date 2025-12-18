import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Package, CheckCircle, X, Save, FileText,
  ArrowUpCircle, RefreshCw, Eye, Printer, Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

  // Print preview state
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [selectedDeliveryNote, setSelectedDeliveryNote] = useState<MaterialDeliveryNote | null>(null);

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
  }>>([]);

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [requestsData, deliveryNotesResult, projectsData, materialsData, configData] = await Promise.all([
        inventoryService.getAllInternalRequests(),
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
      fetchData();
      showSuccess('Request approved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to approve request';
      showError(errorMessage);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      await inventoryService.rejectInternalRequest(requestId, reason);
      fetchData();
      showSuccess('Request rejected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reject request';
      showError(errorMessage);
    }
  };

  const handleCreateDNFromRequest = (request: InternalMaterialRequest) => {
    setSelectedRequestForDN(request);

    const attentionTo = request.project_details?.site_supervisor?.full_name || '';

    if (!attentionTo) {
      showWarning('No Site Engineer assigned to this project. Please select one before creating the delivery note.');
    }

    setDnFormData({
      project_id: request.project_id || 0,
      delivery_date: new Date().toISOString().split('T')[0],
      attention_to: attentionTo,
      delivery_from: inventoryConfig.store_name,
      requested_by: request.requester_details?.full_name || '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      notes: `Material request #${request.request_number || request.request_id}`
    });

    setDnItems([{
      inventory_material_id: request.inventory_material_id || 0,
      quantity: request.quantity || 0,
      notes: '',
      internal_request_id: request.request_id
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
      const itemsToAdd = dnItems.map(item => ({
        inventory_material_id: item.inventory_material_id,
        quantity: item.quantity,
        notes: item.notes,
        internal_request_id: item.internal_request_id
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

  const handleAddDnItem = () => {
    setDnItems([...dnItems, { inventory_material_id: 0, quantity: 0, notes: '' }]);
  };

  const handleRemoveDnItem = (index: number) => {
    setDnItems(dnItems.filter((_, i) => i !== index));
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

  const handlePrintDeliveryNote = (dn: MaterialDeliveryNote) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Material Delivery Note - ${dn.delivery_note_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .info { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>MATERIAL DELIVERY NOTE</h1>
            <p>${dn.delivery_note_number}</p>
          </div>
          <div class="info">
            <p><strong>Project:</strong> ${dn.project_details?.project_name || ''}</p>
            <p><strong>Delivery Date:</strong> ${new Date(dn.delivery_date || '').toLocaleDateString()}</p>
            <p><strong>Attention To:</strong> ${dn.attention_to || ''}</p>
            <p><strong>Vehicle:</strong> ${dn.vehicle_number || '-'} / ${dn.driver_name || '-'}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sr No.</th>
                <th>Description</th>
                <th>Quantity</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${(dn.items || []).map((item, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${item.material_name || ''}${item.brand ? ` (${item.brand})` : ''}</td>
                  <td>${item.quantity} ${item.unit || ''}</td>
                  <td>${item.notes || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handleDownloadDeliveryNote = async (dn: MaterialDeliveryNote) => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIAL DELIVERY NOTE', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(dn.delivery_note_number || '', 105, 28, { align: 'center' });

    doc.setFontSize(10);
    let y = 40;
    doc.text(`Project: ${dn.project_details?.project_name || ''}`, 14, y);
    y += 7;
    doc.text(`Delivery Date: ${new Date(dn.delivery_date || '').toLocaleDateString()}`, 14, y);
    y += 7;
    doc.text(`Attention To: ${dn.attention_to || ''}`, 14, y);
    y += 7;
    doc.text(`Vehicle: ${dn.vehicle_number || '-'} / Driver: ${dn.driver_name || '-'}`, 14, y);

    const tableData = (dn.items || []).map((item, i) => [
      i + 1,
      `${item.material_name || ''}${item.brand ? ` (${item.brand})` : ''}`,
      `${item.quantity} ${item.unit || ''}`,
      item.notes || ''
    ]);

    autoTable(doc, {
      startY: y + 10,
      head: [['Sr No.', 'Description', 'Quantity', 'Notes']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [100, 100, 100] }
    });

    doc.save(`${dn.delivery_note_number || 'delivery-note'}.pdf`);
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

  const getAvailableRecipients = () => {
    const selectedProject = projects.find(p => p.project_id === dnFormData.project_id);
    if (!selectedProject) return [];

    const recipients: Array<{ name: string; role: string }> = [];
    selectedProject.site_supervisors?.forEach(se => {
      recipients.push({ name: se.full_name, role: 'Site Engineer' });
    });

    return recipients;
  };

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
              {['PENDING', 'APPROVED', 'COMPLETED'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-cyan-600 text-white'
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
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
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-cyan-600">
                        {req.quantity} {req.material_details?.unit || ''}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`font-medium ${(req.material_details?.current_stock || 0) >= (req.quantity || 0) ? 'text-green-600' : 'text-red-600'}`}>
                          {req.material_details?.current_stock || 0} {req.material_details?.unit || ''}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(req.status || 'PENDING')}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(req.created_at || '').toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {(req.status === 'PENDING' || req.status === 'send_request') && (
                            <>
                              <button
                                onClick={() => handleApproveRequest(req.request_id!)}
                                className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium"
                                aria-label={`Approve request ${req.request_number}`}
                              >
                                Approve
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
                              onClick={() => { setSelectedDeliveryNote(dn); setShowPrintPreview(true); }}
                              className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              title="Print Preview"
                              aria-label={`Preview ${dn.delivery_note_number}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrintDeliveryNote(dn)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="Print"
                              aria-label={`Print ${dn.delivery_note_number}`}
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadDeliveryNote(dn)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                              title="Download PDF"
                              aria-label={`Download ${dn.delivery_note_number}`}
                            >
                              <Download className="w-4 h-4" />
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
              </div>

              {dnFormData.project_id > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Attention To (Site Engineer) *</label>
                      <select
                        value={dnFormData.attention_to}
                        onChange={(e) => setDnFormData({ ...dnFormData, attention_to: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                        required
                        aria-label="Select site engineer"
                      >
                        <option value="">Select Site Engineer</option>
                        {getAvailableRecipients().map((recipient, idx) => (
                          <option key={idx} value={recipient.name}>
                            {recipient.name} ({recipient.role})
                          </option>
                        ))}
                      </select>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                      <input
                        type="text"
                        value={dnFormData.vehicle_number}
                        onChange={(e) => setDnFormData({ ...dnFormData, vehicle_number: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
                        aria-label="Vehicle number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
                      <input
                        type="text"
                        value={dnFormData.driver_name}
                        onChange={(e) => setDnFormData({ ...dnFormData, driver_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500"
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
                      <button
                        onClick={handleAddDnItem}
                        className="px-3 py-1 text-sm bg-cyan-100 text-cyan-700 rounded-lg hover:bg-cyan-200"
                        type="button"
                      >
                        + Add Item
                      </button>
                    </div>

                    <div className="space-y-2">
                      {dnItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2 rounded">
                          <div className="col-span-5">
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
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleDnItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                              placeholder="Qty"
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              min="0"
                              step="0.01"
                              aria-label={`Quantity for item ${index + 1}`}
                            />
                          </div>
                          <div className="col-span-4">
                            <input
                              type="text"
                              value={item.notes}
                              onChange={(e) => handleDnItemChange(index, 'notes', e.target.value)}
                              placeholder="Notes (optional)"
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              aria-label={`Notes for item ${index + 1}`}
                            />
                          </div>
                          <div className="col-span-1 text-center">
                            <button
                              onClick={() => handleRemoveDnItem(index)}
                              className="text-red-600 hover:text-red-800"
                              type="button"
                              aria-label={`Remove item ${index + 1}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
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
                </>
              )}

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
                  className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 flex items-center gap-2"
                  disabled={saving}
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
    </div>
  );
};

export default StockOutPage;
