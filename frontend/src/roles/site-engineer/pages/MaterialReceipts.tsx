import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TruckIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  CubeIcon,
  ArrowUturnLeftIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showError, showSuccess, showInfo } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';
import {
  MaterialSelectionModal,
  RDNCreationModal,
  RDNSuccessModal
} from '../components/RDNWorkflowModals';

interface DeliveryNoteItem {
  item_id: number;
  material_name: string;
  quantity: number;
  quantity_received?: number;
  unit: string;
  internal_request_id?: number;
}

interface ReturnableMaterial {
  delivery_note_item_id: number;
  delivery_note_id: number;
  delivery_note_number: string;
  delivery_date?: string;
  inventory_material_id: number;
  material_code: string;
  material_name: string;
  brand?: string;
  unit: string;
  is_returnable: boolean;
  dispatched_quantity: number;
  returned_quantity: number;
  returnable_quantity: number;
}

interface ReturnableProject {
  project_id: number;
  project_name: string;
  project_code: string;
  location?: string;
  materials: ReturnableMaterial[];
  total_materials: number;
}

interface MaterialReturnRecord {
  return_id: number;
  delivery_note_item_id?: number;
  inventory_material_id: number;
  project_id: number;
  quantity: number;
  condition: string;
  add_to_stock: boolean;
  return_reason?: string;
  notes?: string;
  disposal_status?: string;
  created_at: string;
  created_by: string;
  material_name?: string;
  material_code?: string;
  unit?: string;
  project_name?: string;
  project_code?: string;
  delivery_note_number?: string;
  delivery_date?: string;
}

interface DeliveryNote {
  delivery_note_id: number;
  delivery_note_number: string;
  project_id: number;
  project_name: string;
  project_code: string;
  delivery_date: string;
  status: string;
  items: DeliveryNoteItem[];
  created_by: string;
  created_at: string;
  dispatched_at?: string;
  dispatched_by?: string;
  received_at?: string;
  received_by?: string;
  receiver_notes?: string;
  notes?: string;
  prepared_by?: string;
  attention_to?: string;
  delivery_from?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_contact?: string;
  issued_at?: string;
  issued_by?: string;
}

const MATERIAL_CONDITIONS = ['Good', 'Damaged', 'Defective'] as const;

const MaterialReceipts: React.FC = () => {
  // URL params for navigation from notifications
  const [searchParams] = useSearchParams();

  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'return' | 'history'>('pending');
  const [returnSubTab, setReturnSubTab] = useState<'returnable' | 'rdns'>('returnable');
  const [historySubTab, setHistorySubTab] = useState<'returns' | 'received'>('returns');
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  // Handle URL parameters for navigation (e.g., from notifications)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'pending') setActiveTab('pending');
    else if (tab === 'received') {
      setActiveTab('history');
      setHistorySubTab('received');
    }
    else if (tab === 'return') setActiveTab('return');
    else if (tab === 'history') setActiveTab('history');
  }, [searchParams]);

  // Confirm receipt modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);
  const [receiverNotes, setReceiverNotes] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Return materials state
  const [returnableProjects, setReturnableProjects] = useState<ReturnableProject[]>([]);
  const [materialReturns, setMaterialReturns] = useState<MaterialReturnRecord[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [expandedReturnProjects, setExpandedReturnProjects] = useState<Set<number>>(new Set());

  // Return modal state (OLD - keeping for backward compatibility)
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<ReturnableMaterial | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [returnForm, setReturnForm] = useState({
    quantity: 1,
    condition: 'Good' as typeof MATERIAL_CONDITIONS[number],
    return_reason: '',
    notes: '',
    add_to_stock: true
  });
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // STAGE 1: Material Selection Cart State
  const [showMaterialSelectionModal, setShowMaterialSelectionModal] = useState(false);
  const [selectedProjectForModal, setSelectedProjectForModal] = useState<number | null>(null);

  // Initialize cart from localStorage if available
  const [selectedMaterialsCart, setSelectedMaterialsCart] = useState<Array<{
    delivery_note_item_id: number;
    inventory_material_id: number;
    material_name: string;
    material_code: string;
    unit: string;
    quantity: number;
    max_quantity: number;
    condition: 'Good' | 'Damaged' | 'Defective';
    return_reason: string;
    original_dn: string;
    project_id: number;
    project_name: string;
  }>>(() => {
    // Load saved cart from localStorage on initial render
    const savedCart = localStorage.getItem('materialReturnCart');
    if (savedCart) {
      try {
        return JSON.parse(savedCart);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (selectedMaterialsCart.length > 0) {
      localStorage.setItem('materialReturnCart', JSON.stringify(selectedMaterialsCart));
    } else {
      localStorage.removeItem('materialReturnCart');
    }
  }, [selectedMaterialsCart]);

  // Switch to return tab if there are items in cart on page load
  useEffect(() => {
    const savedCart = localStorage.getItem('materialReturnCart');
    if (savedCart) {
      try {
        const cart = JSON.parse(savedCart);
        if (cart && cart.length > 0) {
          setActiveTab('return');
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // STAGE 2: RDN Creation Modal State (uses saved cart)
  const [showRDNModal, setShowRDNModal] = useState(false);
  const [rdnForm, setRdnForm] = useState({
    return_date: new Date().toISOString().split('T')[0],
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    notes: '',
  });
  const [creatingRDN, setCreatingRDN] = useState(false);
  const [createdRDN, setCreatedRDN] = useState<any>(null);
  const [showRDNSuccessModal, setShowRDNSuccessModal] = useState(false);

  // RDN List State
  const [returnDeliveryNotes, setReturnDeliveryNotes] = useState<any[]>([]);
  const [loadingRDNs, setLoadingRDNs] = useState(false);
  const [expandedRDNs, setExpandedRDNs] = useState<Set<number>>(new Set());

  const fetchDeliveryNotes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/my-delivery-notes');
      setDeliveryNotes(response.data.delivery_notes || []);
    } catch (err) {
      console.error('Error fetching delivery notes:', err);
      showError('Failed to load delivery notes');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReturnableData = useCallback(async () => {
    try {
      setLoadingReturns(true);
      const [returnableRes, returnsRes] = await Promise.all([
        apiClient.get('/my-returnable-materials'),
        apiClient.get('/my-material-returns')
      ]);
      setReturnableProjects(returnableRes.data.projects || []);
      setMaterialReturns(returnsRes.data.returns || []);
    } catch (err) {
      console.error('Error fetching return data:', err);
      showError('Failed to load return data');
    } finally {
      setLoadingReturns(false);
    }
  }, []);

  const fetchReturnDeliveryNotes = useCallback(async () => {
    try {
      setLoadingRDNs(true);
      const response = await apiClient.get('/my-return-delivery-notes');
      setReturnDeliveryNotes(response.data.return_delivery_notes || []);
    } catch (err) {
      console.error('Error fetching return delivery notes:', err);
      showError('Failed to load return delivery notes');
    } finally {
      setLoadingRDNs(false);
    }
  }, []);

  useEffect(() => {
    fetchDeliveryNotes();
    // Fetch return data on mount to show counts in tabs
    fetchReturnableData();
    fetchReturnDeliveryNotes();
  }, [fetchDeliveryNotes, fetchReturnableData, fetchReturnDeliveryNotes]);

  const toggleExpand = (noteId: number) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(noteId)) {
      newExpanded.delete(noteId);
    } else {
      newExpanded.add(noteId);
    }
    setExpandedNotes(newExpanded);
  };

  const openConfirmModal = (note: DeliveryNote) => {
    setSelectedNote(note);
    setReceiverNotes('');
    setShowConfirmModal(true);
  };

  const handleConfirmReceipt = async () => {
    if (!selectedNote) return;

    const deliveryNoteId = selectedNote.delivery_note_id;
    const currentUser = 'Current User'; // You can get this from auth context if available

    try {
      setConfirming(true);

      // Optimistic UI update - immediately update the state
      setDeliveryNotes(prevNotes =>
        prevNotes.map(note =>
          note.delivery_note_id === deliveryNoteId
            ? {
                ...note,
                status: 'DELIVERED',
                received_at: new Date().toISOString(),
                received_by: currentUser,
                receiver_notes: receiverNotes
              }
            : note
        )
      );

      // Close modal immediately for smooth UX
      setShowConfirmModal(false);
      setSelectedNote(null);

      // Show success message
      showSuccess('Delivery confirmed successfully!');

      // Background API call and sync
      setSyncing(true);
      try {
        await apiClient.post(`/delivery_note/${deliveryNoteId}/confirm`, {
          receiver_notes: receiverNotes
        });

        // Fetch fresh data in background to ensure consistency
        await Promise.all([
          fetchDeliveryNotes(),
          fetchReturnableData() // Refresh returnable materials since this delivery is now available for returns
        ]);
      } finally {
        setSyncing(false);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to confirm delivery');

      // Revert optimistic update on error
      fetchDeliveryNotes();
    } finally {
      setConfirming(false);
    }
  };

  const toggleReturnProjectExpand = (projectId: number) => {
    const newExpanded = new Set(expandedReturnProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedReturnProjects(newExpanded);
  };

  const openReturnModal = (material: ReturnableMaterial, projectId: number) => {
    setSelectedMaterial(material);
    setSelectedProjectId(projectId);
    setReturnForm({
      quantity: 1,
      condition: 'Good',
      return_reason: '',
      notes: '',
      add_to_stock: true
    });
    setShowReturnModal(true);
  };

  const handleSubmitReturn = async () => {
    if (!selectedMaterial) return;

    if (returnForm.quantity <= 0 || returnForm.quantity > selectedMaterial.returnable_quantity) {
      showError(`Quantity must be between 1 and ${selectedMaterial.returnable_quantity}`);
      return;
    }

    try {
      setSubmittingReturn(true);
      await apiClient.post('/material_return', {
        delivery_note_item_id: selectedMaterial.delivery_note_item_id,
        quantity: returnForm.quantity,
        condition: returnForm.condition,
        return_reason: returnForm.return_reason,
        notes: returnForm.notes
      });
      showSuccess('Material return submitted successfully!');
      setShowReturnModal(false);
      setSelectedMaterial(null);
      setSelectedProjectId(null);
      fetchReturnableData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to submit return');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const getConditionBadgeClass = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'good': return 'bg-green-100 text-green-700';
      case 'damaged': return 'bg-red-100 text-red-700';
      case 'defective': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getDisposalStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'pending_review': return { class: 'bg-yellow-100 text-yellow-700', text: 'Pending Review' };
      case 'approved_disposal': return { class: 'bg-red-100 text-red-700', text: 'Approved for Disposal' };
      case 'disposed': return { class: 'bg-gray-100 text-gray-700', text: 'Disposed' };
      case 'repaired': return { class: 'bg-green-100 text-green-700', text: 'Repaired' };
      default: return { class: 'bg-gray-100 text-gray-700', text: status };
    }
  };

  const getRDNStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT': return { class: 'bg-gray-100 text-gray-700', text: 'Draft' };
      case 'ISSUED': return { class: 'bg-blue-100 text-blue-700', text: 'Issued' };
      case 'IN_TRANSIT': return { class: 'bg-yellow-100 text-yellow-700', text: 'In Transit' };
      case 'RECEIVED': return { class: 'bg-purple-100 text-purple-700', text: 'Received' };
      case 'APPROVED': return { class: 'bg-green-100 text-green-700', text: 'Approved' };
      case 'REJECTED': return { class: 'bg-red-100 text-red-700', text: 'Rejected' };
      default: return { class: 'bg-gray-100 text-gray-700', text: status };
    }
  };

  const toggleRDNExpand = (rdnId: number) => {
    const newExpanded = new Set(expandedRDNs);
    if (newExpanded.has(rdnId)) {
      newExpanded.delete(rdnId);
    } else {
      newExpanded.add(rdnId);
    }
    setExpandedRDNs(newExpanded);
  };

  const handleIssueRDN = async (rdnId: number, rdnNumber: string) => {
    try {
      // Optimistic UI update
      setReturnDeliveryNotes(prevNotes =>
        prevNotes.map(rdn =>
          rdn.return_note_id === rdnId
            ? { ...rdn, status: 'ISSUED', issued_at: new Date().toISOString() }
            : rdn
        )
      );

      showSuccess('RDN issued successfully! Ready for dispatch.');

      // Background API call
      setSyncing(true);
      const response = await apiClient.post(`/return_delivery_note/${rdnId}/issue`, {});
      setCreatedRDN(response.data.return_delivery_note);
      setShowRDNSuccessModal(true);

      // Refresh in background
      await fetchReturnDeliveryNotes();
      setSyncing(false);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to issue RDN');
      fetchReturnDeliveryNotes(); // Revert on error
      setSyncing(false);
    }
  };

  const handleDispatchRDN = async (rdnId: number) => {
    try {
      // Optimistic UI update
      setReturnDeliveryNotes(prevNotes =>
        prevNotes.map(rdn =>
          rdn.return_note_id === rdnId
            ? { ...rdn, status: 'IN_TRANSIT', dispatched_at: new Date().toISOString() }
            : rdn
        )
      );

      showSuccess('RDN dispatched successfully!');

      // Background API call
      setSyncing(true);
      await apiClient.post(`/return_delivery_note/${rdnId}/dispatch`, {});

      // Refresh in background
      await fetchReturnDeliveryNotes();
      setSyncing(false);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to dispatch RDN');
      fetchReturnDeliveryNotes(); // Revert on error
      setSyncing(false);
    }
  };

  const handleDownloadRDNPDF = async (rdnId: number, rdnNumber: string) => {
    try {
      const response = await apiClient.get(`/return_delivery_note/${rdnId}/download`, {
        responseType: 'blob',
      });

      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${rdnNumber.replace(/\//g, '-')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showSuccess('PDF downloaded successfully!');
    } catch (err) {
      showError('Failed to download PDF');
    }
  };

  const handleDownloadDNPDF = async (dnId: number, dnNumber: string) => {
    try {
      const response = await apiClient.get(`/delivery_note/${dnId}/download`, {
        responseType: 'blob',
      });

      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${dnNumber.replace(/\//g, '-')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showSuccess('DN PDF downloaded successfully!');
    } catch (err) {
      showError('Failed to download DN PDF');
    }
  };

  // Filter notes by status
  const pendingNotes = deliveryNotes.filter(n => ['IN_TRANSIT', 'ISSUED', 'DISPATCHED'].includes(n.status));
  const receivedNotes = deliveryNotes.filter(n => ['DELIVERED', 'PARTIAL'].includes(n.status));

  const displayNotes = activeTab === 'pending' ? pendingNotes : receivedNotes;

  // Group by project
  const groupedNotes = displayNotes.reduce((acc, note) => {
    const key = `${note.project_id}-${note.project_name}`;
    if (!acc[key]) {
      acc[key] = { project_name: note.project_name, project_code: note.project_code, notes: [] };
    }
    acc[key].notes.push(note);
    return acc;
  }, {} as Record<string, { project_name: string; project_code: string; notes: DeliveryNote[] }>);

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
      <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <TruckIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Material Receipts</h1>
                <p className="text-sm text-gray-600">Confirm delivery of materials to your sites</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {syncing && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <ArrowPathIcon className="w-4 h-4 text-blue-600 animate-spin" />
                  <span className="text-sm text-blue-700 font-medium">Syncing...</span>
                </div>
              )}
              <button
                onClick={fetchDeliveryNotes}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Tab Buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <ClockIcon className="w-4 h-4" />
            Pending ({pendingNotes.length})
          </button>
          <button
            onClick={() => setActiveTab('return')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'return'
                ? 'bg-blue-50 text-blue-700 border-2 border-blue-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            Materials ({(returnableProjects.reduce((sum, p) => sum + p.materials.length, 0) + returnDeliveryNotes.length)})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-purple-50 text-purple-700 border-2 border-purple-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <DocumentTextIcon className="w-4 h-4" />
            History ({(materialReturns.length + receivedNotes.length)})
          </button>
        </div>

        {/* Content */}
        {activeTab === 'return' ? (
          /* Return Tab Content */
          loadingReturns ? (
            <div className="flex items-center justify-center py-12">
              <ModernLoadingSpinners variant="pulse-wave" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Sub-tabs for Return Materials */}
              <div className="flex gap-2 border-b border-gray-200">
                <button
                  onClick={() => setReturnSubTab('returnable')}
                  className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                    returnSubTab === 'returnable'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Returnable Materials ({returnableProjects.reduce((sum, p) => sum + p.materials.length, 0)})
                </button>
                <button
                  onClick={() => setReturnSubTab('rdns')}
                  className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                    returnSubTab === 'rdns'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Return Delivery Notes ({returnDeliveryNotes.length})
                </button>
              </div>

              {/* Returnable Materials Sub-tab */}
              {returnSubTab === 'returnable' && returnableProjects.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Materials Available for Return</h3>
                  </div>
                  {returnableProjects.map((project) => {
                    const isExpanded = expandedReturnProjects.has(project.project_id);
                    // Filter selected materials count for THIS project only
                    const projectSelectedCount = selectedMaterialsCart.filter(
                      m => m.project_id === project.project_id
                    ).length;
                    return (
                      <motion.div
                        key={project.project_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                      >
                        <div className="w-full px-5 py-3 flex items-center justify-between">
                          <button
                            onClick={() => toggleReturnProjectExpand(project.project_id)}
                            className="flex items-center gap-3 hover:bg-gray-50 transition-colors flex-1"
                          >
                            <div className="p-2 bg-purple-100 rounded-lg">
                              <BuildingOfficeIcon className="w-5 h-5 text-purple-600" />
                            </div>
                            <div className="text-left">
                              <p className="font-semibold text-gray-900">{project.project_name}</p>
                              <p className="text-sm text-gray-500">{project.project_code} • {project.location}</p>
                            </div>
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium ml-3">
                              {project.total_materials} material(s)
                            </span>
                            {isExpanded ? (
                              <ChevronUpIcon className="w-5 h-5 text-gray-400 ml-2" />
                            ) : (
                              <ChevronDownIcon className="w-5 h-5 text-gray-400 ml-2" />
                            )}
                          </button>

                          {/* Action Buttons in Header */}
                          <div className="flex items-center gap-2 ml-4">
                            {projectSelectedCount > 0 ? (
                              <>
                                <span className="text-xs text-purple-700 font-medium px-2 py-1 bg-purple-50 rounded">
                                  {projectSelectedCount} selected
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProjectForModal(project.project_id);
                                    setShowMaterialSelectionModal(true);
                                  }}
                                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowRDNModal(true);
                                  }}
                                  className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors font-medium"
                                >
                                  Create RDN
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProjectForModal(project.project_id);
                                  setShowMaterialSelectionModal(true);
                                }}
                                className="px-3 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors font-medium"
                              >
                                Select Materials
                              </button>
                            )}
                          </div>
                        </div>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t"
                            >
                              <div className="p-4 space-y-4">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-gray-500 border-b">
                                      <th className="pb-2 font-medium">Material</th>
                                      <th className="pb-2 font-medium">Original DN</th>
                                      <th className="pb-2 font-medium text-right">Dispatched</th>
                                      <th className="pb-2 font-medium text-right">Returned</th>
                                      <th className="pb-2 font-medium text-right">Returnable</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {project.materials.map((material) => {
                                      const isInCart = selectedMaterialsCart.some(
                                        m => m.delivery_note_item_id === material.delivery_note_item_id
                                      );
                                      return (
                                        <tr key={material.delivery_note_item_id} className={`hover:bg-purple-50 ${isInCart ? 'bg-purple-50' : ''}`}>
                                          <td className="py-3">
                                            <p className="font-medium text-gray-900">{material.material_name}</p>
                                            <p className="text-xs text-gray-500">{material.material_code} {material.brand && `• ${material.brand}`}</p>
                                          </td>
                                          <td className="py-3">
                                            <div className="flex items-center gap-2">
                                              <DocumentTextIcon className="w-4 h-4 text-blue-600" />
                                              <div>
                                                <p className="font-medium text-blue-700">{material.delivery_note_number}</p>
                                                {material.delivery_date && (
                                                  <p className="text-xs text-gray-500">
                                                    {new Date(material.delivery_date).toLocaleDateString()}
                                                  </p>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3 text-right text-gray-600">
                                            {material.dispatched_quantity} {material.unit}
                                          </td>
                                          <td className="py-3 text-right text-gray-600">
                                            {material.returned_quantity} {material.unit}
                                          </td>
                                          <td className="py-3 text-right">
                                            <span className="font-semibold text-purple-600">
                                              {material.returnable_quantity} {material.unit}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {returnSubTab === 'returnable' && returnableProjects.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center"
                >
                  <div className="flex flex-col items-center">
                    <div className="p-4 bg-gray-100 rounded-full mb-4">
                      <ArrowUturnLeftIcon className="w-12 h-12 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Materials to Return</h3>
                    <p className="text-gray-500 max-w-md">
                      You don't have any materials available for return. Materials become returnable after you confirm receipt from delivered shipments.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* RDN Sub-tab */}
              {returnSubTab === 'rdns' && (
                loadingRDNs ? (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                    <ModernLoadingSpinners size="md" />
                    <p className="text-gray-500 mt-2">Loading return delivery notes...</p>
                  </div>
                ) : returnDeliveryNotes.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                    <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No return delivery notes yet. Create one to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {returnDeliveryNotes.map((rdn) => {
                      const statusBadge = getRDNStatusBadge(rdn.status);
                      const isExpanded = expandedRDNs.has(rdn.return_note_id);

                      return (
                        <div key={rdn.return_note_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                          {/* RDN Header */}
                          <div className="p-4">
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => toggleRDNExpand(rdn.return_note_id)}
                                className="flex items-center gap-3 flex-1 text-left hover:bg-gray-50 -m-2 p-2 rounded transition-colors"
                              >
                                <div className="p-2 bg-orange-100 rounded-lg">
                                  <DocumentTextIcon className="w-5 h-5 text-orange-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{rdn.return_note_number}</p>
                                  <p className="text-sm text-gray-500">
                                    {rdn.project_name} • {rdn.total_items} item(s) • {new Date(rdn.return_date).toLocaleDateString()}
                                  </p>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ml-3 ${statusBadge.class}`}>
                                  {statusBadge.text}
                                </span>
                                {isExpanded ? (
                                  <ChevronUpIcon className="w-5 h-5 text-gray-400 ml-auto" />
                                ) : (
                                  <ChevronDownIcon className="w-5 h-5 text-gray-400 ml-auto" />
                                )}
                              </button>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={() => handleDownloadRDNPDF(rdn.return_note_id, rdn.return_note_number)}
                                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors font-medium"
                                >
                                  Download PDF
                                </button>

                                {rdn.status === 'DRAFT' && (
                                  <button
                                    onClick={() => handleIssueRDN(rdn.return_note_id, rdn.return_note_number)}
                                    className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
                                  >
                                    Issue
                                  </button>
                                )}

                                {rdn.status === 'ISSUED' && (
                                  <button
                                    onClick={() => handleDispatchRDN(rdn.return_note_id)}
                                    className="px-3 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors font-medium"
                                  >
                                    Dispatch
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* RDN Items (Expanded) */}
                          {isExpanded && rdn.items && rdn.items.length > 0 && (
                            <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-gray-500 border-b border-gray-200">
                                    <th className="pb-2 font-medium">Material</th>
                                    <th className="pb-2 font-medium text-right">Quantity</th>
                                    <th className="pb-2 font-medium">Condition</th>
                                    <th className="pb-2 font-medium">Reason</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {rdn.items.map((item: any) => (
                                    <tr key={item.item_id} className="hover:bg-white">
                                      <td className="py-2">
                                        <p className="font-medium text-gray-900">{item.material_name}</p>
                                        <p className="text-xs text-gray-500">{item.material_code}</p>
                                      </td>
                                      <td className="py-2 text-right font-medium text-gray-900">
                                        {item.quantity} {item.unit}
                                      </td>
                                      <td className="py-2">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConditionBadgeClass(item.condition)}`}>
                                          {item.condition}
                                        </span>
                                      </td>
                                      <td className="py-2 text-gray-600 text-xs">
                                        {item.return_reason || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* Transport Details */}
                              {rdn.vehicle_number && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <p className="text-xs text-gray-500 mb-1 font-medium">Transport Details:</p>
                                  <div className="grid grid-cols-4 gap-4 text-xs">
                                    <div>
                                      <span className="text-gray-500">Vehicle:</span>
                                      <span className="ml-1 text-gray-900 font-medium">{rdn.vehicle_number}</span>
                                    </div>
                                    {rdn.driver_name && (
                                      <div>
                                        <span className="text-gray-500">Driver:</span>
                                        <span className="ml-1 text-gray-900 font-medium">{rdn.driver_name}</span>
                                      </div>
                                    )}
                                    {rdn.driver_contact && (
                                      <div>
                                        <span className="text-gray-500">Contact:</span>
                                        <span className="ml-1 text-gray-900 font-medium">{rdn.driver_contact}</span>
                                      </div>
                                    )}
                                    {rdn.transport_fee !== undefined && rdn.transport_fee !== null && (
                                      <div>
                                        <span className="text-gray-500">Transport Fee:</span>
                                        <span className="ml-1 text-gray-900 font-medium">
                                          AED {Number(rdn.transport_fee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {rdn.delivery_note_url && (
                                    <div className="mt-2">
                                      <a
                                        href={rdn.delivery_note_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                      >
                                        <DocumentTextIcon className="h-4 w-4 mr-1" />
                                        View Delivery Note Document
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          )
        ) : activeTab === 'history' ? (
          /* Return History Tab Content */
          loadingReturns ? (
            <div className="flex items-center justify-center py-12">
              <ModernLoadingSpinners variant="pulse-wave" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Sub-tabs for History */}
              <div className="flex gap-2 border-b border-gray-200">
                <button
                  onClick={() => setHistorySubTab('returns')}
                  className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                    historySubTab === 'returns'
                      ? 'border-purple-600 text-purple-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Material Returns ({materialReturns.length})
                </button>
                <button
                  onClick={() => setHistorySubTab('received')}
                  className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                    historySubTab === 'received'
                      ? 'border-purple-600 text-purple-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Received Deliveries ({receivedNotes.length})
                </button>
              </div>

              {/* Material Returns Sub-tab */}
              {historySubTab === 'returns' && (
                materialReturns.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Return History</h3>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-500">
                          <th className="px-4 py-3 font-medium">Material</th>
                          <th className="px-4 py-3 font-medium">Delivery Note</th>
                          <th className="px-4 py-3 font-medium text-right">Qty</th>
                          <th className="px-4 py-3 font-medium">Condition</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {materialReturns.map((ret) => {
                          const disposalBadge = getDisposalStatusBadge(ret.disposal_status);
                          return (
                            <tr key={ret.return_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{ret.material_name}</p>
                                <p className="text-xs text-gray-500">{ret.material_code}</p>
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                <p className="font-medium">{ret.delivery_note_number || '-'}</p>
                                {ret.delivery_date && (
                                  <p className="text-xs text-gray-400">
                                    {new Date(ret.delivery_date).toLocaleDateString()}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {ret.quantity} {ret.unit}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConditionBadgeClass(ret.condition)}`}>
                                  {ret.condition}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {ret.add_to_stock ? (
                                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                    Added to Stock
                                  </span>
                                ) : disposalBadge ? (
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${disposalBadge.class}`}>
                                    {disposalBadge.text}
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                                    Processed
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-sm">
                                {new Date(ret.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No material returns yet.</p>
                  </div>
                )
              )}

              {/* Received Deliveries Sub-tab */}
              {historySubTab === 'received' && (
                loading ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners variant="pulse-wave" />
                  </div>
                ) : receivedNotes.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center"
                  >
                    <div className="flex flex-col items-center">
                      <div className="p-4 bg-gray-100 rounded-full mb-4">
                        <TruckIcon className="w-12 h-12 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Received Deliveries</h3>
                      <p className="text-gray-500 max-w-md">
                        No materials have been received yet.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(receivedNotes.reduce((acc: any, note: DeliveryNote) => {
                      const key = `${note.project_id}-${note.project_name}`;
                      if (!acc[key]) {
                        acc[key] = {
                          project_id: note.project_id,
                          project_name: note.project_name,
                          notes: []
                        };
                      }
                      acc[key].notes.push(note);
                      return acc;
                    }, {})).map(([key, group]: [string, any]) => (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                      >
                        {/* Project Header */}
                        <div className="px-5 py-3 bg-gray-50 border-b">
                          <div className="flex items-center gap-2">
                            <BuildingOfficeIcon className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-semibold text-gray-900">{group.project_name}</h3>
                            <span className="ml-auto px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                              {group.notes.length} delivery note(s)
                            </span>
                          </div>
                        </div>

                        {/* Delivery Notes List */}
                        <div className="divide-y divide-gray-100">
                          {group.notes.map((note: DeliveryNote) => {
                            const isExpanded = expandedNotes.has(note.delivery_note_id);
                            return (
                              <div key={note.delivery_note_id}>
                                <div className="w-full px-5 py-4 hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={() => toggleExpand(note.delivery_note_id)}
                                      className="flex items-center gap-3 flex-1 text-left"
                                    >
                                      <div className="p-2 bg-green-100 rounded-lg">
                                        <DocumentTextIcon className="w-5 h-5 text-green-600" />
                                      </div>
                                      <div>
                                        <p className="font-semibold text-gray-900">{note.delivery_note_number}</p>
                                        <p className="text-sm text-gray-500">
                                          Delivered on {new Date(note.delivery_date).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </button>
                                    <div className="flex items-center gap-3">
                                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                        Received
                                      </span>
                                      <button
                                        onClick={() => handleDownloadDNPDF(note.delivery_note_id, note.delivery_note_number)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                        title="Download PDF"
                                      >
                                        <ArrowDownTrayIcon className="w-4 h-4" />
                                        PDF
                                      </button>
                                      <button
                                        onClick={() => toggleExpand(note.delivery_note_id)}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                      >
                                        {isExpanded ? (
                                          <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                                        ) : (
                                          <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden bg-gray-50 border-t"
                                    >
                                      <div className="px-5 py-4">
                                        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                          <div>
                                            <p className="text-gray-500 text-xs mb-1">Received By</p>
                                            <p className="font-medium text-gray-900">{note.received_by || '-'}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-500 text-xs mb-1">Received At</p>
                                            <p className="font-medium text-gray-900">
                                              {note.received_at ? new Date(note.received_at).toLocaleString() : '-'}
                                            </p>
                                          </div>
                                        </div>

                                        {note.receiver_notes && (
                                          <div className="mb-4">
                                            <p className="text-gray-500 text-xs mb-1">Notes</p>
                                            <p className="text-gray-700 text-sm">{note.receiver_notes}</p>
                                          </div>
                                        )}

                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="text-left text-gray-500 border-b">
                                              <th className="pb-2 font-medium">Material</th>
                                              <th className="pb-2 font-medium text-right">Quantity</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-200">
                                            {note.items.map((item) => (
                                              <tr key={item.item_id}>
                                                <td className="py-2 text-gray-900">{item.material_name}</td>
                                                <td className="py-2 text-right text-gray-600">
                                                  {item.quantity} {item.unit}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )
              )}
            </div>
          )
        ) : displayNotes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center"
          >
            <div className="flex flex-col items-center">
              <div className="p-4 bg-gray-100 rounded-full mb-4">
                <TruckIcon className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {activeTab === 'pending' ? 'No Pending Deliveries' : 'No Received Deliveries'}
              </h3>
              <p className="text-gray-500 max-w-md">
                {activeTab === 'pending'
                  ? 'There are no materials in transit to your sites. Deliveries will appear here when dispatched.'
                  : 'No materials have been received yet.'}
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedNotes).map(([key, group]) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
              >
                {/* Project Header */}
                <div className="px-5 py-3 bg-gray-50 border-b">
                  <div className="flex items-center gap-2">
                    <BuildingOfficeIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">{group.project_name}</h3>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                      {group.project_code}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {group.notes.length} delivery note(s)
                    </span>
                  </div>
                </div>

                {/* Delivery Notes */}
                <div className="divide-y divide-gray-100">
                  {group.notes.map((note) => {
                    const isExpanded = expandedNotes.has(note.delivery_note_id);
                    return (
                      <div key={note.delivery_note_id}>
                        {/* Note Header */}
                        <div className="px-5 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-lg ${
                                activeTab === 'pending' ? 'bg-yellow-100' : 'bg-green-100'
                              }`}>
                                {activeTab === 'pending' ? (
                                  <TruckIcon className="w-5 h-5 text-yellow-600" />
                                ) : (
                                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-gray-900">{note.delivery_note_number}</p>
                                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                    note.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-700' :
                                    note.status === 'DISPATCHED' ? 'bg-orange-100 text-orange-700' :
                                    note.status === 'ISSUED' ? 'bg-yellow-100 text-yellow-700' :
                                    note.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {note.status === 'IN_TRANSIT' ? 'In Transit' :
                                     note.status === 'DISPATCHED' ? 'Dispatched' :
                                     note.status === 'ISSUED' ? 'Issued' :
                                     note.status === 'DELIVERED' ? 'Delivered' : note.status}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500">
                                  {note.items.length} item(s) • Delivery Date: {new Date(note.delivery_date).toLocaleDateString()}
                                </p>
                                {note.dispatched_at && (note.status === 'IN_TRANSIT' || note.status === 'DISPATCHED' || note.status === 'DELIVERED') && (
                                  <p className="text-xs text-blue-600 mt-0.5">
                                    <span className="font-medium">Dispatched:</span> {new Date(note.dispatched_at).toLocaleString()} by {note.dispatched_by}
                                  </p>
                                )}
                                {note.received_at && (
                                  <p className="text-xs text-green-600">
                                    <span className="font-medium">Received:</span> {new Date(note.received_at).toLocaleString()} by {note.received_by}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {activeTab === 'pending' && (
                                <button
                                  onClick={() => openConfirmModal(note)}
                                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                                >
                                  <CheckCircleIcon className="w-4 h-4" />
                                  Confirm Receipt
                                </button>
                              )}
                              <button
                                onClick={() => handleDownloadDNPDF(note.delivery_note_id, note.delivery_note_number)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                title="Download PDF"
                              >
                                <ArrowDownTrayIcon className="w-4 h-4" />
                                Download PDF
                              </button>
                              <button
                                onClick={() => toggleExpand(note.delivery_note_id)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                                ) : (
                                  <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Items List - Expandable */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden bg-gray-50 border-t"
                            >
                              <div className="px-5 py-4 space-y-4">
                                {/* Dispatch Details */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white rounded-lg p-3 border border-gray-200">
                                  <div>
                                    <p className="text-xs text-gray-500">From</p>
                                    <p className="text-sm font-medium text-gray-900">{note.delivery_from || 'M2 Store'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Attention To</p>
                                    <p className="text-sm font-medium text-gray-900">{note.attention_to || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Prepared By</p>
                                    <p className="text-sm font-medium text-gray-900">{note.prepared_by || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Issued</p>
                                    <p className="text-sm font-medium text-gray-900">
                                      {note.issued_at ? new Date(note.issued_at).toLocaleDateString() : '-'}
                                    </p>
                                  </div>
                                  {(note.vehicle_number || note.driver_name) && (
                                    <>
                                      <div>
                                        <p className="text-xs text-gray-500">Vehicle No.</p>
                                        <p className="text-sm font-medium text-gray-900">{note.vehicle_number || '-'}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500">Driver</p>
                                        <p className="text-sm font-medium text-gray-900">{note.driver_name || '-'}</p>
                                      </div>
                                      {note.driver_contact && (
                                        <div>
                                          <p className="text-xs text-gray-500">Driver Contact</p>
                                          <p className="text-sm font-medium text-gray-900">{note.driver_contact}</p>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Materials Table */}
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-2">Materials</p>
                                  <table className="w-full text-sm bg-white rounded-lg border border-gray-200">
                                    <thead>
                                      <tr className="text-left text-gray-500 border-b">
                                        <th className="px-3 py-2 font-medium">Material</th>
                                        <th className="px-3 py-2 font-medium text-right">Quantity</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {note.items.map((item) => (
                                        <tr key={item.item_id}>
                                          <td className="px-3 py-2 font-medium text-gray-900">{item.material_name}</td>
                                          <td className="px-3 py-2 text-right text-gray-600">
                                            {item.quantity} {item.unit}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Notes */}
                                {note.notes && (
                                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                                    <p className="text-xs text-gray-500 mb-1">Dispatch Notes</p>
                                    <p className="text-sm text-gray-700">{note.notes}</p>
                                  </div>
                                )}
                                {note.receiver_notes && (
                                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                                    <p className="text-xs text-green-600 mb-1">Receiver Notes</p>
                                    <p className="text-sm text-green-800">{note.receiver_notes}</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        )}

      </div>

      {/* Confirm Receipt Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-5 py-4 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <CheckCircleIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-white">
                      <h3 className="font-semibold">Confirm Receipt</h3>
                      <p className="text-sm text-white/80">{selectedNote.delivery_note_number}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-500">Delivery for</p>
                  <p className="font-medium text-gray-900">{selectedNote.project_name}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedNote.items.length} item(s)</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Items:</p>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {selectedNote.items.map((item) => (
                      <div key={item.item_id} className="flex justify-between text-sm py-1">
                        <span className="text-gray-900">{item.material_name}</span>
                        <span className="text-gray-600">{item.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={receiverNotes}
                    onChange={(e) => setReceiverNotes(e.target.value)}
                    rows={2}
                    placeholder="Any notes about the delivery..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReceipt}
                  disabled={confirming}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {confirming ? (
                    <>
                      <ModernLoadingSpinners size="xs" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4" />
                      Confirm Receipt
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* NEW WORKFLOW: Material Selection Modal (STEP 1) */}
      <MaterialSelectionModal
        show={showMaterialSelectionModal}
        onClose={() => {
          setShowMaterialSelectionModal(false);
          setSelectedProjectForModal(null);
        }}
        returnableProjects={selectedProjectForModal
          ? returnableProjects.filter(p => p.project_id === selectedProjectForModal)
          : returnableProjects
        }
        selectedMaterialsCart={selectedMaterialsCart}
        onSaveSelection={(materials) => setSelectedMaterialsCart(materials)}
        selectedProjectId={selectedProjectForModal}
      />

      {/* NEW WORKFLOW: RDN Creation Modal (STEP 2) */}
      <RDNCreationModal
        show={showRDNModal}
        onClose={() => setShowRDNModal(false)}
        selectedMaterials={selectedMaterialsCart}
        creating={creatingRDN}
        onCreateRDN={async (rdnData, deliveryNoteFile) => {
          setCreatingRDN(true);
          try {
            const firstMaterial = selectedMaterialsCart[0];
            if (!firstMaterial) {
              throw new Error('No materials selected');
            }

            // Prepare FormData for file upload
            const formData = new FormData();
            formData.append('project_id', firstMaterial.project_id.toString());
            formData.append('return_date', rdnData.return_date);
            formData.append('vehicle_number', rdnData.vehicle_number);
            formData.append('driver_name', rdnData.driver_name);
            formData.append('driver_contact', rdnData.driver_contact);
            formData.append('notes', rdnData.notes);
            formData.append('transport_fee', (rdnData.transport_fee || 0).toString());
            formData.append('materials_data', JSON.stringify(selectedMaterialsCart));

            if (deliveryNoteFile) {
              formData.append('delivery_note', deliveryNoteFile);
            }

            const response = await apiClient.post('/return_delivery_notes', formData);

            const rdnId = response.data.return_delivery_note.return_note_id;

            for (const material of selectedMaterialsCart) {
              await apiClient.post(`/return_delivery_note/${rdnId}/items`, {
                inventory_material_id: material.inventory_material_id,
                original_delivery_note_item_id: material.delivery_note_item_id,
                quantity: material.quantity,
                condition: material.condition,
                return_reason: material.return_reason,
              });
            }

            showSuccess('RDN created successfully! Click Issue to finalize.');
            setCreatedRDN(response.data.return_delivery_note);
            setShowRDNModal(false);
            setShowRDNSuccessModal(false); // Don't show success modal - RDN is just DRAFT
            setSelectedMaterialsCart([]);
            fetchReturnableData();
            fetchReturnDeliveryNotes();
          } catch (error: any) {
            console.error('Error creating RDN:', error);
            showError(error.response?.data?.error || 'Failed to create RDN');
          } finally {
            setCreatingRDN(false);
          }
        }}
      />

      {/* NEW WORKFLOW: Success Modal */}
      <RDNSuccessModal
        show={showRDNSuccessModal}
        onClose={() => {
          setShowRDNSuccessModal(false);
          setCreatedRDN(null);
        }}
        rdnNumber={createdRDN?.return_note_number || ''}
        onDownloadPDF={() => {
          if (createdRDN) {
            handleDownloadRDNPDF(createdRDN.return_note_id, createdRDN.return_note_number);
          }
        }}
      />
    </div>
  );
};

export default React.memo(MaterialReceipts);
