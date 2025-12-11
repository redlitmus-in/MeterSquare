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
} from '@heroicons/react/24/outline';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showError, showSuccess } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';

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
  const [activeTab, setActiveTab] = useState<'pending' | 'received' | 'return'>('pending');
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  // Handle URL parameters for navigation (e.g., from notifications)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'pending') setActiveTab('pending');
    else if (tab === 'received') setActiveTab('received');
    else if (tab === 'return') setActiveTab('return');
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

  // RDN Creation Modal State
  const [showRDNModal, setShowRDNModal] = useState(false);
  const [rdnStep, setRdnStep] = useState<1 | 2 | 3>(1);
  const [rdnForm, setRdnForm] = useState({
    return_date: new Date().toISOString().split('T')[0],
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    notes: '',
    selected_materials: [] as Array<{
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
    }>
  });
  const [creatingRDN, setCreatingRDN] = useState(false);
  const [createdRDN, setCreatedRDN] = useState<any>(null);
  const [showRDNSuccessModal, setShowRDNSuccessModal] = useState(false);

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

  useEffect(() => {
    fetchDeliveryNotes();
  }, [fetchDeliveryNotes]);

  useEffect(() => {
    if (activeTab === 'return') {
      fetchReturnableData();
    }
  }, [activeTab, fetchReturnableData]);

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

    try {
      setConfirming(true);
      await apiClient.post(`/delivery_note/${selectedNote.delivery_note_id}/confirm`, {
        receiver_notes: receiverNotes
      });
      showSuccess('Delivery confirmed successfully!');
      setShowConfirmModal(false);
      setSelectedNote(null);
      fetchDeliveryNotes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to confirm delivery');
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
            <button
              onClick={fetchDeliveryNotes}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <ClockIcon className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending Receipt</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingNotes.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Received</p>
                <p className="text-2xl font-bold text-green-600">{receivedNotes.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ArrowUturnLeftIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Returnable</p>
                <p className="text-2xl font-bold text-purple-600">
                  {returnableProjects.reduce((sum, p) => sum + p.total_materials, 0)}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <DocumentTextIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Deliveries</p>
                <p className="text-2xl font-bold text-indigo-600">{deliveryNotes.length}</p>
              </div>
            </div>
          </motion.div>
        </div>

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
            onClick={() => setActiveTab('received')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'received'
                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <CheckCircleIcon className="w-4 h-4" />
            Received ({receivedNotes.length})
          </button>
          <button
            onClick={() => setActiveTab('return')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'return'
                ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            Return Materials
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
              {/* Returnable Materials Section */}
              {returnableProjects.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Materials Available for Return</h3>
                    <button
                      onClick={() => setShowRDNModal(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 active:bg-purple-700 transition-colors shadow-sm font-medium"
                    >
                      <DocumentTextIcon className="w-5 h-5" />
                      Create Return Delivery Note
                    </button>
                  </div>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                    <div className="flex items-start gap-3">
                      <TruckIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Return Delivery Note (RDN) Required</p>
                        <p className="text-sm text-blue-700 mt-1">
                          To return materials to the store, you must create a formal Return Delivery Note. This document will be given to the driver for transport and verification at the store.
                        </p>
                      </div>
                    </div>
                  </div>
                  {returnableProjects.map((project) => {
                    const isExpanded = expandedReturnProjects.has(project.project_id);
                    return (
                      <motion.div
                        key={project.project_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                      >
                        <button
                          onClick={() => toggleReturnProjectExpand(project.project_id)}
                          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                              <BuildingOfficeIcon className="w-5 h-5 text-purple-600" />
                            </div>
                            <div className="text-left">
                              <p className="font-semibold text-gray-900">{project.project_name}</p>
                              <p className="text-sm text-gray-500">{project.project_code} • {project.location}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                              {project.total_materials} material(s)
                            </span>
                            {isExpanded ? (
                              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </button>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t"
                            >
                              <div className="p-4">
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
                                    {project.materials.map((material) => (
                                      <tr key={material.delivery_note_item_id} className="hover:bg-purple-50">
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
                                    ))}
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

              {returnableProjects.length === 0 && materialReturns.length === 0 && (
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

              {/* Return History Section */}
              {materialReturns.length > 0 && (
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
                                {note.dispatched_at && (
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
                                        <th className="px-3 py-2 font-medium text-right">Received</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {note.items.map((item) => (
                                        <tr key={item.item_id}>
                                          <td className="px-3 py-2 font-medium text-gray-900">{item.material_name}</td>
                                          <td className="px-3 py-2 text-right text-gray-600">
                                            {item.quantity} {item.unit}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            {item.quantity_received !== undefined ? (
                                              <span className={item.quantity_received >= item.quantity ? 'text-green-600' : 'text-orange-600'}>
                                                {item.quantity_received} {item.unit}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400">-</span>
                                            )}
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

        {/* Info Note */}
        {activeTab !== 'return' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-1 bg-blue-100 rounded-full">
                <CubeIcon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-blue-800 font-medium">Material Delivery Flow</p>
                <p className="text-sm text-blue-600 mt-1">
                  <span className="font-medium">1. Dispatched</span> → PM dispatches material from store<br/>
                  <span className="font-medium">2. In Transit</span> → Material on the way to site<br/>
                  <span className="font-medium">3. Confirm Receipt</span> → You confirm when material arrives, request is marked as fulfilled
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-1 bg-purple-100 rounded-full">
                <ArrowUturnLeftIcon className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-purple-800 font-medium">Material Return Flow</p>
                <p className="text-sm text-purple-600 mt-1">
                  <span className="font-medium">1. Select Material</span> → Choose unused material from your received deliveries<br/>
                  <span className="font-medium">2. Specify Condition</span> → Good items can be added back to stock, Damaged/Defective go for review<br/>
                  <span className="font-medium">3. Submit Return</span> → Material is processed and stock is updated accordingly
                </p>
              </div>
            </div>
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
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
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

      {/* Create RDN Modal */}
      <AnimatePresence>
        {showRDNModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRDNModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-500 to-indigo-500 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <DocumentTextIcon className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-white">
                      <h3 className="text-lg font-semibold">Create Return Delivery Note</h3>
                      <p className="text-sm text-white/80">Complete form and select materials to return</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRDNModal(false)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6 text-white" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {rdnStep === 1 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 mb-4">Step 1: RDN Details</h4>

                    {/* Return Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Return Date *</label>
                      <input
                        type="date"
                        value={rdnForm.return_date}
                        onChange={(e) => setRdnForm({ ...rdnForm, return_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    {/* Vehicle & Driver Details */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                        <input
                          type="text"
                          value={rdnForm.vehicle_number}
                          onChange={(e) => setRdnForm({ ...rdnForm, vehicle_number: e.target.value })}
                          placeholder="e.g., DXB-A-12345"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name *</label>
                        <input
                          type="text"
                          value={rdnForm.driver_name}
                          onChange={(e) => setRdnForm({ ...rdnForm, driver_name: e.target.value })}
                          placeholder="Driver name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Driver Contact</label>
                        <input
                          type="text"
                          value={rdnForm.driver_contact}
                          onChange={(e) => setRdnForm({ ...rdnForm, driver_contact: e.target.value })}
                          placeholder="+971 50 123 4567"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={rdnForm.notes}
                        onChange={(e) => setRdnForm({ ...rdnForm, notes: e.target.value })}
                        placeholder="Additional notes or return reason..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}

                {rdnStep === 2 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 mb-4">Step 2: Select Materials to Return</h4>
                    <p className="text-sm text-gray-600 mb-4">Select materials and specify quantities to return</p>

                    {returnableProjects.map((project) => (
                      <div key={project.project_id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center gap-2 mb-3">
                          <BuildingOfficeIcon className="w-5 h-5 text-indigo-600" />
                          <h5 className="font-semibold text-gray-900">{project.project_name}</h5>
                          <span className="text-xs text-gray-500">({project.project_code})</span>
                        </div>
                        <div className="space-y-3">
                          {project.materials.map((material) => {
                            const isSelected = rdnForm.selected_materials.some(
                              m => m.delivery_note_item_id === material.delivery_note_item_id
                            );
                            const selectedMaterial = rdnForm.selected_materials.find(
                              m => m.delivery_note_item_id === material.delivery_note_item_id
                            );

                            const handleToggleSelect = () => {
                              if (isSelected) {
                                setRdnForm({
                                  ...rdnForm,
                                  selected_materials: rdnForm.selected_materials.filter(
                                    m => m.delivery_note_item_id !== material.delivery_note_item_id
                                  )
                                });
                              } else {
                                setRdnForm({
                                  ...rdnForm,
                                  selected_materials: [...rdnForm.selected_materials, {
                                    delivery_note_item_id: material.delivery_note_item_id,
                                    inventory_material_id: material.inventory_material_id,
                                    material_name: material.material_name,
                                    material_code: material.material_code,
                                    unit: material.unit,
                                    quantity: material.returnable_quantity,
                                    max_quantity: material.returnable_quantity,
                                    condition: 'Good',
                                    return_reason: '',
                                    original_dn: material.delivery_note_number
                                  }]
                                });
                              }
                            };

                            return (
                              <div
                                key={material.delivery_note_item_id}
                                role="button"
                                tabIndex={0}
                                className={`bg-white p-3 rounded border-2 transition-all cursor-pointer ${
                                  isSelected
                                    ? 'border-purple-400 bg-purple-50'
                                    : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50/50'
                                }`}
                                onClick={handleToggleSelect}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleToggleSelect();
                                  }
                                }}
                                aria-pressed={isSelected}
                                aria-label={`Select ${material.material_name} for return. Maximum ${material.returnable_quantity} ${material.unit} available.`}
                              >
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleToggleSelect();
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 w-4 h-4 text-purple-600"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                      <div>
                                        <p className="font-medium text-gray-900">{material.material_name}</p>
                                        <p className="text-xs text-gray-500">
                                          {material.material_code} • DN: {material.delivery_note_number}
                                        </p>
                                      </div>
                                      <span className="text-sm font-semibold text-purple-600">
                                        Max: {material.returnable_quantity} {material.unit}
                                      </span>
                                    </div>

                                    {isSelected && selectedMaterial && (
                                      <div className="mt-3 space-y-2 pl-2 border-l-2 border-purple-200" onClick={(e) => e.stopPropagation()}>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity *</label>
                                            <input
                                              type="number"
                                              min="0"
                                              max={material.returnable_quantity}
                                              step="0.001"
                                              value={selectedMaterial.quantity}
                                              onChange={(e) => {
                                                const newQty = parseFloat(e.target.value);
                                                setRdnForm({
                                                  ...rdnForm,
                                                  selected_materials: rdnForm.selected_materials.map(m =>
                                                    m.delivery_note_item_id === material.delivery_note_item_id
                                                      ? { ...m, quantity: newQty }
                                                      : m
                                                  )
                                                });
                                              }}
                                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Condition *</label>
                                            <select
                                              value={selectedMaterial.condition}
                                              onChange={(e) => {
                                                setRdnForm({
                                                  ...rdnForm,
                                                  selected_materials: rdnForm.selected_materials.map(m =>
                                                    m.delivery_note_item_id === material.delivery_note_item_id
                                                      ? { ...m, condition: e.target.value as 'Good' | 'Damaged' | 'Defective' }
                                                      : m
                                                  )
                                                });
                                              }}
                                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                                            >
                                              <option value="Good">Good</option>
                                              <option value="Damaged">Damaged</option>
                                              <option value="Defective">Defective</option>
                                            </select>
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Return Reason</label>
                                          <input
                                            type="text"
                                            value={selectedMaterial.return_reason}
                                            onChange={(e) => {
                                              setRdnForm({
                                                ...rdnForm,
                                                selected_materials: rdnForm.selected_materials.map(m =>
                                                  m.delivery_note_item_id === material.delivery_note_item_id
                                                    ? { ...m, return_reason: e.target.value }
                                                    : m
                                                )
                                              });
                                            }}
                                            placeholder="Why is this being returned?"
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {rdnForm.selected_materials.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                        <p className="text-sm text-amber-700">No materials selected. Please select at least one material to return.</p>
                      </div>
                    )}
                  </div>
                )}

                {rdnStep === 3 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 mb-4">Step 3: Review & Submit</h4>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      <h5 className="font-semibold text-blue-900">RDN Details</h5>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-blue-600">Return Date</p>
                          <p className="font-medium text-blue-900">{new Date(rdnForm.return_date).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-blue-600">Driver Name</p>
                          <p className="font-medium text-blue-900">{rdnForm.driver_name || '-'}</p>
                        </div>
                        <div>
                          <p className="text-blue-600">Vehicle Number</p>
                          <p className="font-medium text-blue-900">{rdnForm.vehicle_number || '-'}</p>
                        </div>
                        <div>
                          <p className="text-blue-600">Driver Contact</p>
                          <p className="font-medium text-blue-900">{rdnForm.driver_contact || '-'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                      <h5 className="font-semibold text-purple-900">Materials ({rdnForm.selected_materials.length})</h5>
                      <div className="space-y-2">
                        {rdnForm.selected_materials.map((material, idx) => (
                          <div key={idx} className="bg-white rounded p-3 text-sm">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{material.material_name}</p>
                                <p className="text-xs text-gray-500">{material.material_code} • DN: {material.original_dn}</p>
                                {material.return_reason && (
                                  <p className="text-xs text-gray-600 mt-1">Reason: {material.return_reason}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-purple-600">{material.quantity} {material.unit}</p>
                                <p className="text-xs text-gray-600">{material.condition}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <div className="flex gap-2">
                  {rdnStep > 1 && (
                    <button
                      onClick={() => setRdnStep((rdnStep - 1) as 1 | 2 | 3)}
                      disabled={creatingRDN}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowRDNModal(false);
                      setRdnStep(1);
                      setRdnForm({
                        return_date: new Date().toISOString().split('T')[0],
                        vehicle_number: '',
                        driver_name: '',
                        driver_contact: '',
                        notes: '',
                        selected_materials: []
                      });
                    }}
                    disabled={creatingRDN}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>

                {rdnStep < 3 && (
                  <button
                    onClick={() => {
                      if (rdnStep === 1 && !rdnForm.driver_name) {
                        showError('Driver name is required');
                        return;
                      }
                      if (rdnStep === 2 && rdnForm.selected_materials.length === 0) {
                        showError('Please select at least one material to return');
                        return;
                      }
                      setRdnStep((rdnStep + 1) as 1 | 2 | 3);
                    }}
                    disabled={creatingRDN}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    Next
                  </button>
                )}

                {rdnStep === 3 && (
                  <button
                    onClick={async () => {
                      if (rdnForm.selected_materials.length === 0) {
                        showError('No materials selected');
                        return;
                      }

                      // Validate quantities
                      const invalidMaterials = rdnForm.selected_materials.filter(
                        m => !m.quantity || m.quantity <= 0 || m.quantity > m.max_quantity || isNaN(m.quantity)
                      );

                      if (invalidMaterials.length > 0) {
                        showError('Please enter valid quantities for all selected materials');
                        return;
                      }

                      setCreatingRDN(true);
                      try {
                        // Get first project ID from selected materials
                        const firstMaterial = returnableProjects.find(p =>
                          p.materials.some(m =>
                            m.delivery_note_item_id === rdnForm.selected_materials[0].delivery_note_item_id
                          )
                        );

                        if (!firstMaterial) {
                          throw new Error('Could not determine project for RDN');
                        }

                        // Create RDN
                        const response = await apiClient.post('/return_delivery_notes', {
                          project_id: firstMaterial.project_id,
                          return_date: rdnForm.return_date,
                          vehicle_number: rdnForm.vehicle_number,
                          driver_name: rdnForm.driver_name,
                          driver_contact: rdnForm.driver_contact,
                          notes: rdnForm.notes,
                        });

                        const rdnId = response.data.return_delivery_note.return_note_id;

                        // Add items to RDN with error tracking
                        const failedItems: string[] = [];
                        for (const material of rdnForm.selected_materials) {
                          try {
                            await apiClient.post(`/return_delivery_note/${rdnId}/items`, {
                              inventory_material_id: material.inventory_material_id,
                              original_delivery_note_item_id: material.delivery_note_item_id,
                              quantity: material.quantity,
                              condition: material.condition,
                              return_reason: material.return_reason,
                            });
                          } catch (itemError) {
                            console.error(`Failed to add item ${material.material_name}:`, itemError);
                            failedItems.push(material.material_name);
                          }
                        }

                        // Check if any items failed
                        if (failedItems.length > 0) {
                          showError(`RDN created but failed to add: ${failedItems.join(', ')}. Please contact support.`);
                        }

                        // Store created RDN and show success modal with download option
                        setCreatedRDN(response.data.return_delivery_note);
                        setShowRDNModal(false);
                        setShowRDNSuccessModal(true);

                        // Reset form
                        setRdnStep(1);
                        setRdnForm({
                          return_date: new Date().toISOString().split('T')[0],
                          vehicle_number: '',
                          driver_name: '',
                          driver_contact: '',
                          notes: '',
                          selected_materials: []
                        });

                        // Refresh data
                        fetchReturnableData();
                      } catch (error: any) {
                        console.error('Error creating RDN:', error);
                        showError(error.response?.data?.error || 'Failed to create RDN');
                      } finally {
                        setCreatingRDN(false);
                      }
                    }}
                    disabled={creatingRDN}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {creatingRDN ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="w-4 h-4" />
                        Create RDN
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Return Material Modal (OLD - Deprecated) */}
      <AnimatePresence>
        {showReturnModal && selectedMaterial && (
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
              className="bg-white rounded-xl shadow-xl max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-purple-500 to-indigo-500 px-5 py-4 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <ArrowUturnLeftIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-white">
                      <h3 className="font-semibold">Return Material</h3>
                      <p className="text-sm text-white/80">{selectedMaterial.material_name}</p>
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

              <div className="p-5 space-y-4">
                {/* Delivery Note Header - Security Reference */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <DocumentTextIcon className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-blue-900">Original Delivery Note (DN) Reference</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-blue-600 font-medium">DN Number</p>
                      <p className="font-bold text-blue-900 text-lg">{selectedMaterial.delivery_note_number}</p>
                    </div>
                    <div>
                      <p className="text-blue-600 font-medium">Delivery Date</p>
                      <p className="font-semibold text-blue-900">
                        {selectedMaterial.delivery_date
                          ? new Date(selectedMaterial.delivery_date).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })
                          : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-blue-200">
                    <p className="text-xs text-blue-700">
                      <span className="font-medium">Security Note:</span> This material is being returned against the above DN for store verification and audit trail.
                    </p>
                  </div>
                </div>

                {/* Material Details */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <h5 className="text-xs font-semibold text-gray-600 mb-2 uppercase">Material Information</h5>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Material Code</p>
                      <p className="font-medium text-gray-900">{selectedMaterial.material_code}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Unit</p>
                      <p className="font-medium text-gray-900">{selectedMaterial.unit}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Brand</p>
                      <p className="font-medium text-gray-900">{selectedMaterial.brand || '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Dispatched Qty</p>
                      <p className="font-medium text-gray-900">{selectedMaterial.dispatched_quantity} {selectedMaterial.unit}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Already Returned</p>
                      <p className="font-medium text-gray-900">{selectedMaterial.returned_quantity} {selectedMaterial.unit}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Available to Return</p>
                      <p className="font-semibold text-purple-600 text-base">{selectedMaterial.returnable_quantity} {selectedMaterial.unit}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity to Return *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={selectedMaterial.returnable_quantity}
                    value={returnForm.quantity}
                    onChange={(e) => setReturnForm(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max: {selectedMaterial.returnable_quantity} {selectedMaterial.unit}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Condition *
                  </label>
                  <div className="flex gap-2">
                    {MATERIAL_CONDITIONS.map((condition) => (
                      <button
                        key={condition}
                        onClick={() => setReturnForm(prev => ({ ...prev, condition, add_to_stock: condition === 'Good' }))}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          returnForm.condition === condition
                            ? condition === 'Good'
                              ? 'bg-green-100 text-green-700 border-2 border-green-300'
                              : condition === 'Damaged'
                                ? 'bg-red-100 text-red-700 border-2 border-red-300'
                                : 'bg-orange-100 text-orange-700 border-2 border-orange-300'
                            : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {condition}
                      </button>
                    ))}
                  </div>
                </div>

                {returnForm.condition === 'Good' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="addToStock"
                      checked={returnForm.add_to_stock}
                      onChange={(e) => setReturnForm(prev => ({ ...prev, add_to_stock: e.target.checked }))}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="addToStock" className="text-sm text-gray-700">
                      Add back to store inventory
                    </label>
                  </div>
                )}

                {returnForm.condition !== 'Good' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> {returnForm.condition} items will be sent for PM review before disposal or repair.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Return Reason
                  </label>
                  <input
                    type="text"
                    value={returnForm.return_reason}
                    onChange={(e) => setReturnForm(prev => ({ ...prev, return_reason: e.target.value }))}
                    placeholder="e.g., Project completed, excess material"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={returnForm.notes}
                    onChange={(e) => setReturnForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    placeholder="Any additional notes..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReturn}
                  disabled={submittingReturn || returnForm.quantity <= 0 || returnForm.quantity > selectedMaterial.returnable_quantity}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {submittingReturn ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <ArrowUturnLeftIcon className="w-4 h-4" />
                      Submit Return
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RDN Success Modal with Download */}
      <AnimatePresence>
        {showRDNSuccessModal && createdRDN && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRDNSuccessModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                  <CheckCircleIcon className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">RDN Created Successfully!</h3>
                <p className="text-sm text-gray-600 mb-1">Return Delivery Note</p>
                <p className="text-2xl font-bold text-purple-600 mb-4">{createdRDN.return_note_number}</p>
                <p className="text-sm text-gray-500 mb-6">
                  The RDN has been created. You can now download the PDF document to give to the driver.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    showSuccess('PDF download feature will be available shortly');
                    // TODO: Implement PDF download
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  <DocumentTextIcon className="w-5 h-5" />
                  Download PDF for Driver
                </button>
                <button
                  onClick={() => {
                    setShowRDNSuccessModal(false);
                    setCreatedRDN(null);
                  }}
                  className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(MaterialReceipts);
