import React, { useState, useEffect, useMemo } from 'react';
import { ArrowDownCircle, Package, Search, FileText, ChevronDown, ChevronLeft, ChevronRight, X, ExternalLink, Truck, Download, CheckCircle, ClipboardCheck, ArrowLeft, AlertTriangle, Eye, RotateCcw } from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import EvidenceLightbox, { EvidenceItem } from '@/components/ui/EvidenceLightbox';
import { inventoryService, InventoryMaterial, CustomUnit } from '../services/inventoryService';
import { apiClient } from '@/api/config';
import { PAGINATION } from '@/lib/constants';
import { showError, showWarning, showSuccess } from '@/utils/toastHelper';
import UnifiedStockInModal from '../components/UnifiedStockInModal';
import { vendorInspectionService, AcceptedMaterialForStockIn } from '@/services/vendorInspectionService';

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

// Buyer Transfer Interface
interface BuyerTransfer {
  delivery_note_id: number;
  delivery_note_number: string;
  project_name: string;
  delivery_date: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  transport_fee: number | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string | null;
  received_at?: string;
  materials?: any[];
  items: {
    item_id: number;
    inventory_material_id: number;
    material_name: string;
    material_code: string | null;
    quantity: number;
    unit: string;
    unit_price: number | null;
  }[];
  total_items: number;
  total_quantity: number;
}

interface PurchaseTransaction {
  inventory_transaction_id?: number;
  inventory_material_id: number;
  material_code?: string;
  material_name?: string;
  brand?: string;
  size?: string;
  category?: string;
  unit?: string;
  transaction_type: 'PURCHASE';
  quantity: number;
  unit_price: number;
  total_amount: number;
  reference_number?: string;
  notes?: string;
  delivery_note_url?: string;
  driver_name?: string;
  vehicle_number?: string;
  per_unit_transport_fee?: number;
  transport_fee?: number;
  transport_notes?: string;
  delivery_batch_ref?: string;
  created_at?: string;
  created_by?: string;
  delivery_note_number?: string;
  delivery_note_details?: {
    delivery_note_id: number;
    delivery_note_number: string;
    delivery_date: string | null;
    status: string;
    driver_name?: string;
    vehicle_number?: string;
    driver_contact?: string;
    transport_fee?: number;
    project_id?: number;
  };
  dn_transport_fee?: number;
  dn_driver_name?: string;
  dn_vehicle_number?: string;
}

const REJECTION_CATEGORIES = [
  { value: 'quality_defect', label: 'Quality Defect' },
  { value: 'wrong_specification', label: 'Wrong Specification' },
  { value: 'quantity_shortage', label: 'Quantity Shortage' },
  { value: 'damaged_in_transit', label: 'Damaged in Transit' },
  { value: 'expired', label: 'Expired / Outdated' },
  { value: 'other', label: 'Other' },
];

const StockInPage: React.FC = () => {
  // Data states
  const [allMaterials, setAllMaterials] = useState<InventoryMaterial[]>([]);
  const [purchaseTransactions, setPurchaseTransactions] = useState<PurchaseTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<PurchaseTransaction[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());

  // Delivery batch data
  const [recentBatches, setRecentBatches] = useState<Array<{
    delivery_batch_ref: string;
    driver_name: string;
    vehicle_number: string;
    transport_fee: number;
    transport_notes: string;
    created_at: string;
    material_count: number;
    delivery_note_url?: string;
  }>>([]);

  // Custom units
  const [customUnits, setCustomUnits] = useState<CustomUnit[]>([]);

  // Buyer Transfers state
  const [showBuyerTransfersModal, setShowBuyerTransfersModal] = useState(false);
  const [buyerTransfers, setBuyerTransfers] = useState<BuyerTransfer[]>([]);
  const [buyerTransfersHistory, setBuyerTransfersHistory] = useState<BuyerTransfer[]>([]);
  const [loadingBuyerTransfers, setLoadingBuyerTransfers] = useState(false);
  const [receivingTransferId, setReceivingTransferId] = useState<number | null>(null);
  const [buyerTransfersTab, setBuyerTransfersTab] = useState<'pending' | 'history'>('pending');

  // Inspection Centre modal state
  const [showVendorDeliveriesModal, setShowVendorDeliveriesModal] = useState(false);
  const [inspectionCentreTab, setInspectionCentreTab] = useState<'pending' | 'awaiting_stockin' | 'history' | 'held'>('pending');

  // Pending tab
  const [pendingInspections, setPendingInspections] = useState<any[]>([]);
  const [pendingInspectionsCount, setPendingInspectionsCount] = useState(0);
  const [loadingInspections, setLoadingInspections] = useState(false);
  const [selectedIMR, setSelectedIMR] = useState<any | null>(null);
  const [loadingIMRDetails, setLoadingIMRDetails] = useState(false);
  const [materialDecisions, setMaterialDecisions] = useState<Array<{
    material_name: string; brand: string; size: string; unit: string;
    ordered_qty: number; accepted_qty: number; rejected_qty: number;
    rejection_category: string; rejection_notes: string;
  }>>([]);
  const [vendorDriverName, setVendorDriverName] = useState('');
  const [vendorVehicleNumber, setVendorVehicleNumber] = useState('');
  const [vendorReferenceNumber, setVendorReferenceNumber] = useState('');
  const [inspectionOverallNotes, setInspectionOverallNotes] = useState('');
  const [submittingInspection, setSubmittingInspection] = useState(false);
  // Evidence upload for inspection
  const [evidenceFiles, setEvidenceFiles] = useState<Array<{
    file: File;
    preview: string;
    fileType: 'image' | 'video';
    uploading: boolean;
    uploaded?: { url: string; file_name: string; file_type: string };
    error?: string;
  }>>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  // History tab
  const [inspectionHistory, setInspectionHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [historyLightboxOpen, setHistoryLightboxOpen] = useState(false);
  const [historyLightboxIndex, setHistoryLightboxIndex] = useState(0);
  const [historyLightboxEvidence, setHistoryLightboxEvidence] = useState<any[]>([]);

  // Awaiting Stock In tab
  const [awaitingStockInInspections, setAwaitingStockInInspections] = useState<any[]>([]);
  const [awaitingStockInCount, setAwaitingStockInCount] = useState(0);
  const [loadingAwaitingStockIn, setLoadingAwaitingStockIn] = useState(false);
  const [activeStockInInspectionId, setActiveStockInInspectionId] = useState<number | null>(null);

  // Held Materials tab
  const [heldMaterials, setHeldMaterials] = useState<any[]>([]);
  const [loadingHeld, setLoadingHeld] = useState(false);
  const [refundEvidenceOpen, setRefundEvidenceOpen] = useState(false);
  const [refundEvidenceList, setRefundEvidenceList] = useState<EvidenceItem[]>([]);
  const [refundEvidenceIndex, setRefundEvidenceIndex] = useState(0);

  // Pre-fill stock-in data from inspection result
  const [prefillStockInData, setPrefillStockInData] = useState<{
    materials: Array<{
      material_name: string; brand?: string; size?: string; unit?: string;
      quantity: number; unit_price: number; driver_name?: string;
      vehicle_number?: string; reference_number?: string; per_unit_transport_fee?: number;
    }>;
  } | null>(null);


  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterTransactions();
    extractRecentBatches();
  }, [searchTerm, purchaseTransactions]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [materials, transactionsResult] = await Promise.all([
        inventoryService.getAllInventoryItems(),
        inventoryService.getAllInventoryTransactions({ transaction_type: 'PURCHASE' })
      ]);

      setAllMaterials(materials);
      setPurchaseTransactions(transactionsResult.transactions as unknown as PurchaseTransaction[]);

      // Fetch custom units (optional)
      try {
        const customUnitsData = await inventoryService.getCustomUnits();
        setCustomUnits(customUnitsData);
      } catch (error) {
        console.warn('Custom units not available:', error);
        setCustomUnits([]);
      }

      // After main data fetch, fetch inspection counts silently
      vendorInspectionService.getPendingInspections(1, 1).then(res => {
        setPendingInspectionsCount(res.total || 0);
      }).catch(() => {});
      vendorInspectionService.getPendingStockInInspections(1, 1).then(res => {
        setAwaitingStockInCount(res.total || 0);
      }).catch(() => {});

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterTransactions = () => {
    let filtered = [...purchaseTransactions];
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(txn =>
        txn.material_name?.toLowerCase().includes(search) ||
        txn.material_code?.toLowerCase().includes(search) ||
        txn.reference_number?.toLowerCase().includes(search)
      );
    }
    setFilteredTransactions(filtered);
  };


  // Fetch pending buyer transfers
  const fetchBuyerTransfers = async () => {
    setLoadingBuyerTransfers(true);
    try {
      const [pendingResponse, historyResponse] = await Promise.all([
        apiClient.get('/inventory/buyer-transfers/pending', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        }),
        apiClient.get('/inventory/buyer-transfers/history', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        })
      ]);
      if (pendingResponse.data.success) {
        setBuyerTransfers(pendingResponse.data.transfers || []);
      }
      if (historyResponse.data.success) {
        setBuyerTransfersHistory(historyResponse.data.transfers || []);
      }
    } catch (error) {
      console.error('Error fetching buyer transfers:', error);
      setBuyerTransfers([]);
      setBuyerTransfersHistory([]);
    } finally {
      setLoadingBuyerTransfers(false);
    }
  };

  // Receive a buyer transfer
  const handleReceiveBuyerTransfer = async (deliveryNoteId: number) => {
    setReceivingTransferId(deliveryNoteId);
    try {
      const response = await apiClient.post(`/inventory/buyer-transfers/${deliveryNoteId}/receive`, {}, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      });
      if (response.data.success) {
        showSuccess(`Transfer ${response.data.delivery_note_number} received successfully! Materials added to inventory.`);
        fetchBuyerTransfers();
        fetchData();
      }
    } catch (error: unknown) {
      console.error('Error receiving transfer:', error);
      const message = error instanceof Error ? error.message : 'Failed to receive transfer';
      showError(message);
    } finally {
      setReceivingTransferId(null);
    }
  };

  // Download buyer transfer DN as PDF
  const handleDownloadBuyerTransferPDF = async (deliveryNoteId: number, deliveryNoteNumber: string) => {
    try {
      const response = await apiClient.get(`/inventory/delivery_note/${deliveryNoteId}/download`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
        responseType: 'blob'
      });
      if (response.data.type === 'application/json') {
        const text = await response.data.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.error || 'Failed to download PDF');
      }
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${deliveryNoteNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error('Error downloading PDF:', error);
      const message = error instanceof Error ? error.message : 'Failed to download PDF';
      showError(message);
    }
  };

  const handleOpenBuyerTransfersModal = () => {
    setShowBuyerTransfersModal(true);
    fetchBuyerTransfers();
  };

  // Vendor Inspection Handlers
  const fetchPendingInspections = async () => {
    setLoadingInspections(true);
    try {
      const result = await vendorInspectionService.getPendingInspections();
      setPendingInspections(result.data || []);
      setPendingInspectionsCount(result.total || 0);
    } catch (error) {
      setPendingInspections([]);
    } finally {
      setLoadingInspections(false);
    }
  };

  const fetchInspectionHistory = async () => {
    setLoadingHistory(true);
    try {
      const result = await vendorInspectionService.getInspectionHistory(1, 50, historyStatusFilter || undefined);
      setInspectionHistory(result.data || []);
    } catch {
      setInspectionHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchAwaitingStockIn = async () => {
    setLoadingAwaitingStockIn(true);
    try {
      const result = await vendorInspectionService.getPendingStockInInspections();
      setAwaitingStockInInspections(result.data || []);
      setAwaitingStockInCount(result.total || 0);
    } catch {
      setAwaitingStockInInspections([]);
    } finally {
      setLoadingAwaitingStockIn(false);
    }
  };

  const fetchHeldMaterials = async () => {
    setLoadingHeld(true);
    try {
      const result = await vendorInspectionService.getHeldMaterials();
      setHeldMaterials(result.data || []);
    } catch {
      setHeldMaterials([]);
    } finally {
      setLoadingHeld(false);
    }
  };

  const handleOpenVendorDeliveries = () => {
    setShowVendorDeliveriesModal(true);
    setSelectedIMR(null);
    setInspectionCentreTab('pending');
    fetchPendingInspections();
  };

  const handleInspectionCentreTabChange = (tab: 'pending' | 'awaiting_stockin' | 'history' | 'held') => {
    setInspectionCentreTab(tab);
    setSelectedIMR(null);
    if (tab === 'pending') fetchPendingInspections();
    if (tab === 'awaiting_stockin') fetchAwaitingStockIn();
    if (tab === 'history') fetchInspectionHistory();
    if (tab === 'held') fetchHeldMaterials();
  };

  const handleSelectIMRForInspection = async (imrId: number) => {
    setLoadingIMRDetails(true);
    setSelectedIMR(null);
    setMaterialDecisions([]);
    try {
      const result = await vendorInspectionService.getInspectionDetails(imrId);
      const imrData = (result as any).data;
      setSelectedIMR(imrData);
      const decisions = (imrData.materials_for_inspection || []).map((mat: any) => ({
        material_name: mat.material_name || '',
        brand: mat.brand || '',
        size: mat.size || '',
        unit: mat.unit || '',
        ordered_qty: mat.ordered_qty || 0,
        accepted_qty: mat.ordered_qty || 0,
        rejected_qty: 0,
        rejection_category: '',
        rejection_notes: '',
      }));
      setMaterialDecisions(decisions);
      setVendorDriverName('');
      setVendorVehicleNumber('');
      setVendorReferenceNumber('');
      setInspectionOverallNotes('');
      setEvidenceFiles([]);
    } catch (error) {
      showError('Failed to load delivery details');
    } finally {
      setLoadingIMRDetails(false);
    }
  };

  const handleEvidenceFileSelect = async (files: FileList | null) => {
    if (!files || !selectedIMR) return;
    const crId = selectedIMR.cr_id;

    const newEntries = Array.from(files).map(file => {
      const isVideo = file.type.startsWith('video/');
      const preview = isVideo ? '' : URL.createObjectURL(file);
      return { file, preview, fileType: isVideo ? 'video' as const : 'image' as const, uploading: true };
    });

    setEvidenceFiles(prev => [...prev, ...newEntries]);
    setUploadingEvidence(true);

    // Upload each file
    const uploadResults = await Promise.all(
      newEntries.map(async (entry, i) => {
        try {
          const result = await vendorInspectionService.uploadInspectionEvidence(entry.file, crId);
          return { index: evidenceFiles.length + i, success: true, data: result };
        } catch (err) {
          return { index: evidenceFiles.length + i, success: false, error: err instanceof Error ? err.message : 'Upload failed' };
        }
      })
    );

    setEvidenceFiles(prev => {
      const updated = [...prev];
      uploadResults.forEach(result => {
        if (result.index < updated.length) {
          if (result.success && result.data) {
            updated[result.index] = { ...updated[result.index], uploading: false, uploaded: result.data };
          } else {
            updated[result.index] = { ...updated[result.index], uploading: false, error: result.error };
          }
        }
      });
      return updated;
    });
    setUploadingEvidence(false);
  };

  const handleRemoveEvidence = (index: number) => {
    setEvidenceFiles(prev => {
      const entry = prev[index];
      if (entry.preview) URL.revokeObjectURL(entry.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleMaterialQtyChange = (index: number, acceptedQty: number) => {
    setMaterialDecisions(prev => prev.map((d, i) => {
      if (i !== index) return d;
      const accepted = Math.min(Math.max(0, acceptedQty), d.ordered_qty);
      return { ...d, accepted_qty: accepted, rejected_qty: d.ordered_qty - accepted };
    }));
  };

  const handleMaterialRejectionChange = (index: number, field: 'rejection_category' | 'rejection_notes', value: string) => {
    setMaterialDecisions(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };

  const computeOverallDecision = (): 'fully_approved' | 'partially_approved' | 'fully_rejected' => {
    if (materialDecisions.length === 0) return 'fully_approved';
    const allAccepted = materialDecisions.every(d => d.accepted_qty >= d.ordered_qty);
    const allRejected = materialDecisions.every(d => d.accepted_qty === 0);
    if (allAccepted) return 'fully_approved';
    if (allRejected) return 'fully_rejected';
    return 'partially_approved';
  };

  const handleAcceptAllMaterials = () => {
    setMaterialDecisions(prev => prev.map(d => ({
      ...d,
      accepted_qty: d.ordered_qty,
      rejected_qty: 0, rejection_category: '', rejection_notes: '',
    })));
  };

  const handleRejectAllMaterials = () => {
    setMaterialDecisions(prev => prev.map(d => ({
      ...d, accepted_qty: 0, rejected_qty: d.ordered_qty,
    })));
  };

  const handleSubmitInspection = async () => {
    if (!selectedIMR) return;
    const missingCategory = materialDecisions.some(d => d.rejected_qty > 0 && !d.rejection_category);
    if (missingCategory) {
      showError('Please select a rejection reason for all rejected materials');
      return;
    }
    const decision = computeOverallDecision();

    // Evidence is required when there are any rejections
    if (decision !== 'fully_approved') {
      const uploadedCount = evidenceFiles.filter(e => e.uploaded).length;
      if (uploadedCount === 0) {
        showError('Please upload at least one photo or video as evidence for rejected materials');
        return;
      }
      if (uploadingEvidence || evidenceFiles.some(e => e.uploading)) {
        showError('Please wait for all files to finish uploading');
        return;
      }
    }

    const uploadedEvidence = evidenceFiles
      .filter(e => e.uploaded)
      .map(e => ({ url: e.uploaded!.url, file_name: e.uploaded!.file_name, file_type: e.uploaded!.file_type }));

    setSubmittingInspection(true);
    try {
      const response = await vendorInspectionService.submitInspection(selectedIMR.request_id, {
        decision,
        materials_inspection: materialDecisions.map(d => ({
          material_name: d.material_name,
          brand: d.brand || undefined,
          size: d.size || undefined,
          unit: d.unit,
          ordered_qty: d.ordered_qty,
          accepted_qty: d.accepted_qty,
          rejected_qty: d.rejected_qty,
          rejection_category: d.rejection_category || undefined,
          rejection_notes: d.rejection_notes || undefined,
        })),
        overall_notes: inspectionOverallNotes || undefined,
        evidence_urls: uploadedEvidence.length > 0 ? uploadedEvidence : undefined,
        stock_in_details: decision !== 'fully_rejected' ? {
          driver_name: vendorDriverName || undefined,
          vehicle_number: vendorVehicleNumber || undefined,
          reference_number: vendorReferenceNumber || undefined,
        } : undefined,
      });

      const messages: Record<string, string> = {
        fully_approved: 'Inspection submitted! You can stock-in now or find it later in "Awaiting Stock In" tab.',
        partially_approved: 'Inspection submitted! Buyer notified for rejected items. Stock-in accepted materials now or later.',
        fully_rejected: 'All materials rejected. Buyer has been notified to handle the return.',
      };
      showSuccess(messages[decision]);
      setSelectedIMR(null);
      setEvidenceFiles([]);
      setShowVendorDeliveriesModal(false);
      fetchPendingInspections();
      fetchData();

      // Refresh awaiting stock-in count
      vendorInspectionService.getPendingStockInInspections(1, 1).then(res => {
        setAwaitingStockInCount(res.total || 0);
      }).catch(() => {});

      // Auto-open stock-in form pre-filled with accepted materials
      const acceptedMaterials: AcceptedMaterialForStockIn[] = response.data?.accepted_materials ?? [];
      if (acceptedMaterials.length > 0) {
        setActiveStockInInspectionId(response.data?.inspection_id ?? null);
        setPrefillStockInData({ materials: acceptedMaterials });
        setShowPurchaseModal(true);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to submit inspection');
    } finally {
      setSubmittingInspection(false);
    }
  };

  const handleStockInFromInspection = (inspection: any) => {
    const acceptedMaterials = inspection.accepted_materials || [];
    if (acceptedMaterials.length === 0) {
      showWarning('No accepted materials found for this inspection');
      return;
    }
    setActiveStockInInspectionId(inspection.id);
    // Close Inspection Centre, then open the regular stock-in form with prefilled materials
    setShowVendorDeliveriesModal(false);
    setPrefillStockInData({ materials: acceptedMaterials });
    setShowPurchaseModal(true);
  };

  const handleStockInSaveComplete = async () => {
    fetchData();
    setShowPurchaseModal(false);

    // If this stock-in was for an inspected delivery, mark it complete
    if (activeStockInInspectionId) {
      try {
        await vendorInspectionService.completeInspectionStockIn(activeStockInInspectionId);
        showSuccess('Stock-in completed and inspection marked as done');
      } catch (error) {
        console.error('Failed to mark inspection stock-in complete:', error);
        showWarning('Stock was saved, but failed to mark the inspection as complete. Please retry from the Awaiting Stock In tab.');
      }
      setActiveStockInInspectionId(null);
      // Refresh awaiting stock-in count
      vendorInspectionService.getPendingStockInInspections(1, 1).then(res => {
        setAwaitingStockInCount(res.total || 0);
      }).catch(() => {});
      fetchAwaitingStockIn();
    }
    setPrefillStockInData(null);
  };

  // Extract recent delivery batches from transactions
  const extractRecentBatches = () => {
    const batchMap = new Map<string, {
      delivery_batch_ref: string;
      driver_name: string;
      vehicle_number: string;
      transport_fee: number;
      transport_notes: string;
      created_at: string;
      material_count: number;
      delivery_note_url?: string;
    }>();

    purchaseTransactions.forEach(txn => {
      if (txn.delivery_batch_ref) {
        if (!batchMap.has(txn.delivery_batch_ref)) {
          batchMap.set(txn.delivery_batch_ref, {
            delivery_batch_ref: txn.delivery_batch_ref,
            driver_name: txn.dn_driver_name || txn.driver_name || '',
            vehicle_number: txn.dn_vehicle_number || txn.vehicle_number || '',
            transport_fee: txn.dn_transport_fee ?? txn.transport_fee ?? 0,
            transport_notes: txn.transport_notes || '',
            created_at: txn.created_at || '',
            material_count: 1,
            delivery_note_url: txn.delivery_note_url
          });
        } else {
          const existing = batchMap.get(txn.delivery_batch_ref)!;
          existing.material_count += 1;
          const txnTransportFee = txn.dn_transport_fee ?? txn.transport_fee ?? 0;
          if (txnTransportFee && txnTransportFee > existing.transport_fee) {
            existing.transport_fee = txnTransportFee;
          }
          const txnDriver = txn.dn_driver_name || txn.driver_name;
          if (!existing.driver_name && txnDriver) existing.driver_name = txnDriver;
          const txnVehicle = txn.dn_vehicle_number || txn.vehicle_number;
          if (!existing.vehicle_number && txnVehicle) existing.vehicle_number = txnVehicle;
          if (!existing.delivery_note_url && txn.delivery_note_url) {
            existing.delivery_note_url = txn.delivery_note_url;
          }
        }
      }
    });

    const batches = Array.from(batchMap.values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setRecentBatches(batches.slice(0, 10));
  };

  // Create batch details map for transport fee and delivery notes lookup
  const batchDetailsMap = useMemo(() => {
    const map = new Map<string, {
      transport_fee: number;
      material_count: number;
      delivery_batch_ref: string;
      material_names: string[];
      transport_notes: string;
      driver_name: string;
      vehicle_number: string;
    }>();

    purchaseTransactions.forEach(txn => {
      if (txn.delivery_batch_ref) {
        if (!map.has(txn.delivery_batch_ref)) {
          map.set(txn.delivery_batch_ref, {
            delivery_batch_ref: txn.delivery_batch_ref,
            transport_fee: txn.dn_transport_fee ?? txn.transport_fee ?? 0,
            transport_notes: txn.transport_notes || '',
            driver_name: txn.dn_driver_name || txn.driver_name || '',
            vehicle_number: txn.dn_vehicle_number || txn.vehicle_number || '',
            material_count: 1,
            material_names: [txn.material_name || 'Unknown']
          });
        } else {
          const existing = map.get(txn.delivery_batch_ref)!;
          existing.material_count += 1;
          const materialName = txn.material_name || 'Unknown';
          if (!existing.material_names.includes(materialName)) {
            existing.material_names.push(materialName);
          }
          const txnTransportFee = txn.dn_transport_fee ?? txn.transport_fee ?? 0;
          if (txnTransportFee && txnTransportFee > existing.transport_fee) {
            existing.transport_fee = txnTransportFee;
            if (txn.transport_notes) existing.transport_notes = txn.transport_notes;
            const txnDriver = txn.dn_driver_name || txn.driver_name;
            if (txnDriver) existing.driver_name = txnDriver;
            const txnVehicle = txn.dn_vehicle_number || txn.vehicle_number;
            if (txnVehicle) existing.vehicle_number = txnVehicle;
          } else {
            if (!existing.transport_notes && txn.transport_notes) existing.transport_notes = txn.transport_notes;
            const txnDriver = txn.dn_driver_name || txn.driver_name;
            if (!existing.driver_name && txnDriver) existing.driver_name = txnDriver;
            const txnVehicle = txn.dn_vehicle_number || txn.vehicle_number;
            if (!existing.vehicle_number && txnVehicle) existing.vehicle_number = txnVehicle;
          }
        }
      }
    });
    return map;
  }, [purchaseTransactions]);

  // Group transactions by material
  const groupedTransactions = useMemo(() => {
    const groups = new Map<number, {
      material: { id: number; code: string; name: string; brand?: string; unit: string };
      transactions: PurchaseTransaction[];
      totalQuantity: number;
      totalAmount: number;
    }>();

    filteredTransactions.forEach(txn => {
      const materialId = txn.inventory_material_id!;
      if (!groups.has(materialId)) {
        groups.set(materialId, {
          material: {
            id: materialId,
            code: txn.material_code || '',
            name: txn.material_name || '',
            brand: txn.brand,
            unit: txn.unit || ''
          },
          transactions: [],
          totalQuantity: 0,
          totalAmount: 0
        });
      }
      const group = groups.get(materialId)!;
      group.transactions.push(txn);
      group.totalQuantity += txn.quantity;
      group.totalAmount += txn.total_amount;
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aLatest = Math.max(...a.transactions.map(t => new Date(t.created_at || '').getTime()));
      const bLatest = Math.max(...b.transactions.map(t => new Date(t.created_at || '').getTime()));
      return bLatest - aLatest;
    });
  }, [filteredTransactions]);

  // Pagination
  const totalPages = Math.ceil(groupedTransactions.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return groupedTransactions.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [groupedTransactions, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const toggleMaterialExpansion = (materialId: number) => {
    setExpandedMaterials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialId)) newSet.delete(materialId);
      else newSet.add(materialId);
      return newSet;
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => `AED ${amount.toFixed(2)}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ModernLoadingSpinners size="md" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <ArrowDownCircle className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock In</h1>
            <p className="text-sm text-gray-500">Record material receipts from vendors</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* Buyer Transfers Button */}
          <button
            onClick={handleOpenBuyerTransfersModal}
            className="relative flex items-center space-x-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Truck className="w-5 h-5" />
            <span>Buyer Transfers</span>
          </button>
          {/* Vendor Deliveries Button */}
          <button
            onClick={handleOpenVendorDeliveries}
            className="relative flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ClipboardCheck className="w-5 h-5" />
            <span>Vendor Deliveries</span>
            {pendingInspectionsCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pendingInspectionsCount > 9 ? '9+' : pendingInspectionsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setPrefillStockInData(null); setShowPurchaseModal(true); }}
            className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <ArrowDownCircle className="w-5 h-5" />
            <span>Record Stock In</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by material name, code, or reference number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Purchase Transactions - Grouped by Material */}
      <div className="bg-white rounded-lg shadow">
        {groupedTransactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No stock in transactions found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {paginatedGroups.map((group) => {
              const isExpanded = expandedMaterials.has(group.material.id);
              const transactionCount = group.transactions.length;

              return (
                <div key={group.material.id} className="hover:bg-gray-50">
                  {/* Material Header Row */}
                  <div
                    onClick={() => toggleMaterialExpansion(group.material.id)}
                    className="px-6 py-4 cursor-pointer select-none"
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-6 flex items-center space-x-3">
                        <ChevronDown
                          className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{group.material.name}</span>
                            {group.material.brand && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{group.material.brand}</span>
                            )}
                          </div>
                          <div className="mt-0.5">
                            <span className="text-xs font-mono text-gray-500">{group.material.code}</span>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 text-center">
                        <div className="inline-flex items-center space-x-1 bg-blue-50 px-3 py-1 rounded-full">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-sm font-medium text-blue-700">{transactionCount}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {transactionCount === 1 ? 'transaction' : 'transactions'}
                        </div>
                      </div>
                      <div className="col-span-2 text-center">
                        <div className="text-sm font-semibold text-gray-900">{group.totalQuantity.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">{group.material.unit}</div>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="text-sm font-bold text-green-600">{formatCurrency(group.totalAmount)}</div>
                        <div className="text-xs text-gray-500">Total Value</div>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Transaction Details */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delivery Note</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transport Fee</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {group.transactions.map((txn) => (
                              <tr key={txn.inventory_transaction_id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(txn.created_at)}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{txn.quantity} {txn.unit}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{formatCurrency(txn.unit_price)}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(txn.total_amount)}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{txn.reference_number || '-'}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm">
                                  {txn.delivery_note_number ? (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-gray-900 font-medium">{txn.delivery_note_number}</span>
                                      {txn.delivery_note_url && isSafeUrl(txn.delivery_note_url) && (
                                        <a href={txn.delivery_note_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:text-blue-800" title="View/Download Delivery Note File">
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  ) : txn.reference_number ? (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-gray-500 text-xs">Ref:</span>
                                      <span className="text-gray-600">{txn.reference_number}</span>
                                      {txn.delivery_note_url && isSafeUrl(txn.delivery_note_url) && (
                                        <a href={txn.delivery_note_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:text-blue-800" title="View/Download Delivery Note File">
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  ) : txn.delivery_note_url && isSafeUrl(txn.delivery_note_url) ? (
                                    <a href={txn.delivery_note_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 hover:text-blue-800" title="View/Download Delivery Note File">
                                      <ExternalLink className="w-3 h-3 mr-1" />
                                      <span className="text-xs">View File</span>
                                    </a>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{txn.dn_driver_name || txn.driver_name || '-'}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{txn.dn_vehicle_number || txn.vehicle_number || '-'}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {(() => {
                                    if (txn.delivery_batch_ref && batchDetailsMap.has(txn.delivery_batch_ref)) {
                                      const batchDetails = batchDetailsMap.get(txn.delivery_batch_ref)!;
                                      const isMultiMaterial = batchDetails.material_count > 1;
                                      if (batchDetails.transport_fee > 0) {
                                        return (
                                          <div className="flex items-center gap-1.5">
                                            <span>{formatCurrency(batchDetails.transport_fee)}</span>
                                            {isMultiMaterial && (
                                              <div className="relative group inline-block">
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                  <Package className="w-3 h-3 mr-0.5" />
                                                  {batchDetails.material_count}
                                                </span>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-[9999]">
                                                  <div className="bg-gray-900 text-white rounded-lg shadow-2xl py-2.5 px-3.5 w-[280px]">
                                                    <div className="font-semibold text-sm mb-2 pb-2 border-b border-gray-700">Batch Delivery ({batchDetails.material_count} materials)</div>
                                                    <div className="mb-2.5 text-xs"><span className="text-gray-400">Batch: </span><span className="font-medium">{batchDetails.delivery_batch_ref}</span></div>
                                                    <div className="space-y-1">
                                                      <div className="text-gray-400 text-xs mb-1">Materials delivered together:</div>
                                                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                        {batchDetails.material_names.map((name, idx) => (
                                                          <div key={idx} className="flex items-start text-xs"><span className="text-blue-400 mr-2">&#8226;</span><span className="font-medium">{name}</span></div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                    }
                                    const transportFee = txn.dn_transport_fee ?? txn.transport_fee;
                                    return transportFee ? formatCurrency(transportFee) : '-';
                                  })()}
                                </td>
                                <td className="px-6 py-3 text-sm text-gray-600 max-w-xs">
                                  {(() => {
                                    const hasTransactionNotes = !!txn.notes;
                                    let hasDeliveryNotes = false;
                                    let deliveryNotesElement = null;

                                    if (txn.delivery_batch_ref && batchDetailsMap.has(txn.delivery_batch_ref)) {
                                      const batchDetails = batchDetailsMap.get(txn.delivery_batch_ref)!;
                                      const isMultiMaterial = batchDetails.material_count > 1;
                                      if (batchDetails.transport_notes) {
                                        hasDeliveryNotes = true;
                                        deliveryNotesElement = (
                                          <div className="flex items-center gap-1.5">
                                            <div className="truncate text-blue-600" title={batchDetails.transport_notes}>
                                              <span className="font-medium">Delivery:</span> {batchDetails.transport_notes}
                                            </div>
                                            {isMultiMaterial && (
                                              <div className="relative group inline-block flex-shrink-0">
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 cursor-help">
                                                  <Package className="w-3 h-3 mr-0.5" />{batchDetails.material_count}
                                                </span>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-[9999]">
                                                  <div className="bg-gray-900 text-white rounded-lg shadow-2xl py-2.5 px-3.5 w-[280px]">
                                                    <div className="font-semibold text-sm mb-2 pb-2 border-b border-gray-700">Batch Delivery ({batchDetails.material_count} materials)</div>
                                                    <div className="mb-2.5 text-xs"><span className="text-gray-400">Batch: </span><span className="font-medium">{batchDetails.delivery_batch_ref}</span></div>
                                                    <div className="mb-2.5 text-xs"><span className="text-gray-400">Delivery Notes: </span><span className="font-medium">{batchDetails.transport_notes}</span></div>
                                                    <div className="space-y-1">
                                                      <div className="text-gray-400 text-xs mb-1">Materials in this delivery:</div>
                                                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                        {batchDetails.material_names.map((name, idx) => (
                                                          <div key={idx} className="flex items-start text-xs"><span className="text-blue-400 mr-2">&#8226;</span><span className="font-medium">{name}</span></div>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                    } else if (txn.transport_notes) {
                                      hasDeliveryNotes = true;
                                      deliveryNotesElement = (
                                        <div className="truncate text-blue-600" title={txn.transport_notes}>
                                          <span className="font-medium">Delivery:</span> {txn.transport_notes}
                                        </div>
                                      );
                                    }

                                    if (!hasTransactionNotes && !hasDeliveryNotes) {
                                      return <span className="text-gray-400">-</span>;
                                    }
                                    return (
                                      <div className="space-y-1">
                                        {hasTransactionNotes && (
                                          <div className="truncate" title={txn.notes}><span className="font-medium text-gray-700">Notes:</span> {txn.notes}</div>
                                        )}
                                        {deliveryNotesElement}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {groupedTransactions.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-600">
                Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, groupedTransactions.length)} of {groupedTransactions.length} materials
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                    <ChevronLeft className="h-4 w-4" />Previous
                  </button>
                  <span className="text-sm text-gray-600 px-2">Page {currentPage} of {totalPages}</span>
                  <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                    Next<ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stock In Modal */}
      <UnifiedStockInModal
        isOpen={showPurchaseModal}
        onClose={() => { setShowPurchaseModal(false); setPrefillStockInData(null); setActiveStockInInspectionId(null); }}
        allMaterials={allMaterials}
        recentBatches={recentBatches}
        customUnits={customUnits}
        purchaseTransactions={purchaseTransactions}
        onSaveComplete={handleStockInSaveComplete}
        onMaterialCreated={(material) => setAllMaterials(prev => [material, ...prev])}
        onCustomUnitCreated={(unit) => setCustomUnits(prev => [unit, ...prev])}
        prefillData={prefillStockInData}
        fromInspection={!!activeStockInInspectionId}
      />

      {/* Buyer Transfers Modal */}
      {showBuyerTransfersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-orange-50">
              <div className="flex items-center space-x-3">
                <Truck className="w-6 h-6 text-orange-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Buyer Transfers</h2>
                  <p className="text-sm text-gray-500">Receive materials sent by buyers to M2 Store</p>
                </div>
              </div>
              <button onClick={() => setShowBuyerTransfersModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6 bg-gray-50">
              <button
                onClick={() => setBuyerTransfersTab('pending')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  buyerTransfersTab === 'pending' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Pending ({buyerTransfers.length})
              </button>
              <button
                onClick={() => setBuyerTransfersTab('history')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  buyerTransfersTab === 'history' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                History ({buyerTransfersHistory.length})
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {loadingBuyerTransfers ? (
                <div className="flex items-center justify-center py-12">
                  <ModernLoadingSpinners size="md" />
                </div>
              ) : buyerTransfersTab === 'pending' ? (
                buyerTransfers.length === 0 ? (
                  <div className="text-center py-12">
                    <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No pending buyer transfers</p>
                    <p className="text-sm text-gray-400 mt-1">All transfers have been received</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {buyerTransfers.map((transfer) => (
                      <div key={transfer.delivery_note_id} className="border border-gray-200 rounded-lg p-4 hover:border-orange-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-orange-600">{transfer.delivery_note_number}</span>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                transfer.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' :
                                transfer.status === 'ISSUED' ? 'bg-blue-100 text-blue-700' :
                                'bg-purple-100 text-purple-700'
                              }`}>{transfer.status}</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">From: {transfer.created_by}</p>
                            {transfer.delivery_date && (
                              <p className="text-xs text-gray-400">Date: {new Date(transfer.delivery_date).toLocaleDateString()}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleReceiveBuyerTransfer(transfer.delivery_note_id)}
                            disabled={receivingTransferId === transfer.delivery_note_id}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-white transition-colors ${
                              receivingTransferId === transfer.delivery_note_id ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            {receivingTransferId === transfer.delivery_note_id ? (
                              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Receiving...</span></>
                            ) : (
                              <><CheckCircle className="w-4 h-4" /><span>Receive</span></>
                            )}
                          </button>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 mt-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">Materials ({transfer.total_items})</p>
                          <div className="space-y-1">
                            {transfer.items.map((item, idx) => (
                              <div key={item.item_id || idx} className="flex justify-between text-sm">
                                <span className="text-gray-700">{item.material_name}</span>
                                <span className="text-gray-500 font-medium">{item.quantity} {item.unit}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {(transfer.vehicle_number || transfer.driver_name) && (
                          <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
                            {transfer.vehicle_number && <span>Vehicle: {transfer.vehicle_number}</span>}
                            {transfer.driver_name && <span>Driver: {transfer.driver_name}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                buyerTransfersHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No transfer history</p>
                    <p className="text-sm text-gray-400 mt-1">Received transfers will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {buyerTransfersHistory.map((transfer) => (
                      <div key={transfer.delivery_note_id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-green-700">{transfer.delivery_note_number}</span>
                              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">RECEIVED</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">From: {transfer.created_by}</p>
                            {transfer.received_at && (
                              <p className="text-xs text-gray-500">Received: {new Date(transfer.received_at).toLocaleString()}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDownloadBuyerTransferPDF(transfer.delivery_note_id, transfer.delivery_note_number)}
                            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white border border-green-300 text-green-700 hover:bg-green-50 transition-colors text-sm"
                          >
                            <Download className="w-4 h-4" /><span>PDF</span>
                          </button>
                        </div>
                        <div className="bg-white rounded-lg p-3 mt-3 border border-green-200">
                          <p className="text-xs font-medium text-gray-600 mb-2">Materials ({transfer.total_items})</p>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {transfer.materials?.map((material: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-gray-700">{material.material_name}</span>
                                <span className="text-gray-600">{material.quantity} {material.unit}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {transfer.vehicle_number && (
                          <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-gray-500">Vehicle:</span><span className="ml-1 text-gray-700">{transfer.vehicle_number}</span></div>
                            {transfer.driver_name && (
                              <div><span className="text-gray-500">Driver:</span><span className="ml-1 text-gray-700">{transfer.driver_name}</span></div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <p className="text-sm text-gray-500">
                {buyerTransfersTab === 'pending'
                  ? `${buyerTransfers.length} pending transfer${buyerTransfers.length !== 1 ? 's' : ''}`
                  : `${buyerTransfersHistory.length} received transfer${buyerTransfersHistory.length !== 1 ? 's' : ''}`
                }
              </p>
              <button onClick={() => setShowBuyerTransfersModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Centre Modal (3 tabs: Pending / History / Held) */}
      {showVendorDeliveriesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-blue-50 flex-shrink-0">
              <div className="flex items-center space-x-3">
                {selectedIMR && (
                  <button onClick={() => setSelectedIMR(null)} className="text-blue-600 hover:text-blue-800 mr-1">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <ClipboardCheck className="w-6 h-6 text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedIMR
                      ? `Inspect Delivery — ${selectedIMR.formatted_cr_id || selectedIMR.cr_details?.formatted_cr_id || ''}`
                      : 'Inspection Centre'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedIMR
                      ? `${selectedIMR.vendor_name || selectedIMR.cr_details?.vendor_name || 'Unknown Vendor'} · ${selectedIMR.project_name || selectedIMR.cr_details?.project_name || ''}`
                      : 'Manage vendor deliveries, inspection history, and held materials'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowVendorDeliveriesModal(false); setSelectedIMR(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Tabs (hidden when inspecting a specific delivery) */}
            {!selectedIMR && (
              <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
                <button
                  onClick={() => handleInspectionCentreTabChange('pending')}
                  className={`flex items-center space-x-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    inspectionCentreTab === 'pending'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>Pending Inspections</span>
                  {pendingInspectionsCount > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-bold rounded-full px-2 py-0.5">
                      {pendingInspectionsCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handleInspectionCentreTabChange('awaiting_stockin')}
                  className={`flex items-center space-x-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    inspectionCentreTab === 'awaiting_stockin'
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  <span>Awaiting Stock In</span>
                  {awaitingStockInCount > 0 && (
                    <span className="bg-green-100 text-green-700 text-xs font-bold rounded-full px-2 py-0.5">
                      {awaitingStockInCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handleInspectionCentreTabChange('history')}
                  className={`flex items-center space-x-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    inspectionCentreTab === 'history'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Inspection History</span>
                </button>
                <button
                  onClick={() => handleInspectionCentreTabChange('held')}
                  className={`flex items-center space-x-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    inspectionCentreTab === 'held'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Held Materials</span>
                </button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* ── INSPECTION FORM VIEW (when a delivery is selected) ── */}
              {selectedIMR ? (
                loadingIMRDetails ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners size="md" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Decision Quick Actions */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-700">Quick Actions:</span>
                        <button onClick={handleAcceptAllMaterials} className="flex items-center space-x-1 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg hover:bg-green-100 transition-colors">
                          <CheckCircle className="w-3.5 h-3.5" /><span>Accept All</span>
                        </button>
                        <button onClick={handleRejectAllMaterials} className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg hover:bg-red-100 transition-colors">
                          <X className="w-3.5 h-3.5" /><span>Reject All</span>
                        </button>
                      </div>
                      {(() => {
                        const decision = computeOverallDecision();
                        const config = {
                          fully_approved: { label: 'Full Approval', cls: 'bg-green-100 text-green-800 border-green-200' },
                          partially_approved: { label: 'Partial Approval', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
                          fully_rejected: { label: 'Full Rejection', cls: 'bg-red-100 text-red-800 border-red-200' },
                        };
                        const c = config[decision];
                        return <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${c.cls}`}>Decision: {c.label}</span>;
                      })()}
                    </div>

                    {/* Materials Table */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase w-24">Ordered</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase w-28">Accepted</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase w-20">Rejected</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Rejection Reason</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {materialDecisions.map((mat, index) => (
                              /* ── STANDARD PO MATERIAL ROW ── */
                              <tr key={index} className={mat.rejected_qty > 0 ? 'bg-red-50' : 'bg-white'}>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{mat.material_name}</div>
                                  {(mat.brand || mat.size) && (
                                    <div className="text-xs text-gray-500">{[mat.brand, mat.size].filter(Boolean).join(' · ')}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center text-gray-700">{mat.ordered_qty} {mat.unit}</td>
                                <td className="px-4 py-3 text-center">
                                  <input
                                    type="number"
                                    min={0}
                                    max={mat.ordered_qty}
                                    value={mat.accepted_qty}
                                    onChange={(e) => handleMaterialQtyChange(index, parseFloat(e.target.value) || 0)}
                                    className="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  />
                                  <span className="ml-1 text-xs text-gray-400">{mat.unit}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`font-medium ${mat.rejected_qty > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                    {mat.rejected_qty}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {mat.rejected_qty > 0 ? (
                                    <select
                                      value={mat.rejection_category}
                                      onChange={(e) => handleMaterialRejectionChange(index, 'rejection_category', e.target.value)}
                                      className={`text-sm border rounded px-2 py-1 w-full focus:ring-2 focus:ring-red-400 ${!mat.rejection_category ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                                    >
                                      <option value="">Select reason *</option>
                                      {REJECTION_CATEGORIES.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {mat.rejected_qty > 0 ? (
                                    <input
                                      type="text"
                                      placeholder="Optional notes..."
                                      value={mat.rejection_notes}
                                      onChange={(e) => handleMaterialRejectionChange(index, 'rejection_notes', e.target.value)}
                                      className="text-sm border border-gray-300 rounded px-2 py-1 w-full focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Transport Details (only when not fully rejected) */}
                    {computeOverallDecision() !== 'fully_rejected' && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center space-x-1">
                          <Truck className="w-4 h-4" /><span>Transport Details (for stock-in record)</span>
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Driver Name</label>
                            <input type="text" placeholder="Enter driver name" value={vendorDriverName}
                              onChange={(e) => setVendorDriverName(e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Vehicle Number</label>
                            <input type="text" placeholder="Enter vehicle number" value={vendorVehicleNumber}
                              onChange={(e) => setVendorVehicleNumber(e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Reference / PO Number</label>
                            <input type="text" placeholder="Enter reference number" value={vendorReferenceNumber}
                              onChange={(e) => setVendorReferenceNumber(e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Overall Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Overall Inspection Notes</label>
                      <textarea
                        placeholder="Add any overall notes about this delivery..."
                        value={inspectionOverallNotes}
                        onChange={(e) => setInspectionOverallNotes(e.target.value)}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Evidence Upload — required for partial/full rejection, optional for full approval */}
                    {(() => {
                      const decision = computeOverallDecision();
                      const isRequired = decision !== 'fully_approved';
                      const uploadedCount = evidenceFiles.filter(e => e.uploaded).length;
                      return (
                        <div className={`rounded-lg p-4 border ${isRequired ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className={`text-sm font-semibold flex items-center space-x-1.5 ${isRequired ? 'text-red-700' : 'text-gray-700'}`}>
                              <span>📷</span>
                              <span>Inspection Evidence {isRequired ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(optional)</span>}</span>
                            </h4>
                            {isRequired && uploadedCount === 0 && (
                              <span className="text-xs text-red-500 font-medium">Required for rejected materials</span>
                            )}
                            {uploadedCount > 0 && (
                              <span className="text-xs text-green-600 font-medium">{uploadedCount} file{uploadedCount !== 1 ? 's' : ''} uploaded</span>
                            )}
                          </div>

                          {/* File thumbnails */}
                          {evidenceFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {evidenceFiles.map((entry, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                                  {entry.fileType === 'image' && entry.preview ? (
                                    <img src={entry.preview} alt={entry.file.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center text-gray-400 text-xs p-1 text-center">
                                      <span className="text-2xl">🎥</span>
                                      <span className="truncate w-full text-center">{entry.file.name.split('.').pop()?.toUpperCase()}</span>
                                    </div>
                                  )}
                                  {/* Overlay: uploading / error / success */}
                                  {entry.uploading && (
                                    <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  )}
                                  {entry.error && (
                                    <div className="absolute inset-0 bg-red-500 bg-opacity-60 flex items-center justify-center">
                                      <AlertTriangle className="w-5 h-5 text-white" />
                                    </div>
                                  )}
                                  {entry.uploaded && (
                                    <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                      <CheckCircle className="w-3 h-3 text-white" />
                                    </div>
                                  )}
                                  {/* Remove button */}
                                  {!entry.uploading && (
                                    <button
                                      onClick={() => handleRemoveEvidence(idx)}
                                      className="absolute top-0 left-0 w-5 h-5 bg-gray-800 bg-opacity-70 text-white rounded-br flex items-center justify-center hover:bg-opacity-90"
                                      title="Remove"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}

                              {/* Add more */}
                              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-gray-400">
                                <span className="text-xl">+</span>
                                <span className="text-xs">Add more</span>
                                <input
                                  type="file"
                                  multiple
                                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                                  className="hidden"
                                  onChange={(e) => handleEvidenceFileSelect(e.target.files)}
                                />
                              </label>
                            </div>
                          )}

                          {/* Initial upload drop zone */}
                          {evidenceFiles.length === 0 && (
                            <label className={`flex flex-col items-center justify-center w-full py-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                              isRequired ? 'border-red-300 hover:border-red-400 hover:bg-red-100' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                            }`}>
                              <span className="text-3xl mb-1">📸</span>
                              <p className="text-sm font-medium text-gray-700">Upload photos or videos</p>
                              <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WebP, GIF · MP4, MOV, WebM · Max 50MB / 200MB</p>
                              <input
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                                className="hidden"
                                onChange={(e) => handleEvidenceFileSelect(e.target.files)}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })()}

                    {/* Rejection Warning */}
                    {computeOverallDecision() !== 'fully_approved' && (
                      <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          {computeOverallDecision() === 'fully_rejected'
                            ? 'All materials will be marked as rejected. The buyer will be notified to create a return/refund request with the vendor.'
                            : 'Partially rejected materials will be held. Accepted materials will be added to inventory. The buyer will be notified to handle the return of rejected materials.'
                          }
                        </p>
                      </div>
                    )}
                  </div>
                )

              /* ── TAB: PENDING INSPECTIONS ── */
              ) : inspectionCentreTab === 'pending' ? (
                loadingInspections ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners size="md" />
                  </div>
                ) : pendingInspections.length === 0 ? (
                  <div className="text-center py-12">
                    <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No pending vendor deliveries</p>
                    <p className="text-sm text-gray-400 mt-1">All deliveries have been inspected</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingInspections.map((inspection: any) => {
                      const materials = inspection.materials_data || [];
                      const materialCount = Array.isArray(materials) ? materials.reduce((acc: number, m: any) => {
                        const subMats = m.materials || [m];
                        return acc + subMats.length;
                      }, 0) : 0;
                      return (
                        <div key={inspection.request_id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors bg-white">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="font-semibold text-blue-700">{inspection.formatted_cr_id || `IMR-${inspection.request_id}`}</span>
                                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 font-medium">Awaiting Inspection</span>
                                {inspection.is_replacement && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 font-medium flex items-center gap-1">
                                    <RotateCcw className="w-3 h-3" />
                                    Replacement
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                <span className="font-medium">{inspection.vendor_name || 'Unknown Vendor'}</span>
                                {inspection.project_name && <span className="text-gray-400"> · {inspection.project_name}</span>}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                Routed on {inspection.created_at ? new Date(inspection.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                              </p>
                              {materialCount > 0 && (
                                <p className="text-xs text-gray-500 mt-1.5">
                                  <Package className="w-3 h-3 inline mr-1" />{materialCount} material{materialCount !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleSelectIMRForInspection(inspection.request_id)}
                              className="ml-4 flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              <ClipboardCheck className="w-4 h-4" />
                              <span>Inspect</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )

              /* ── TAB: AWAITING STOCK IN ── */
              ) : inspectionCentreTab === 'awaiting_stockin' ? (
                loadingAwaitingStockIn ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners size="md" />
                  </div>
                ) : awaitingStockInInspections.length === 0 ? (
                  <div className="text-center py-12">
                    <ArrowDownCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No inspections awaiting stock-in</p>
                    <p className="text-sm text-gray-400 mt-1">Approved deliveries will appear here until stock-in is completed</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {awaitingStockInInspections.map((inspection: any) => {
                      const accepted: any[] = inspection.accepted_materials || [];
                      const statusConfig: Record<string, { label: string; cls: string }> = {
                        fully_approved: { label: 'Fully Approved', cls: 'bg-green-100 text-green-800' },
                        partially_approved: { label: 'Partially Approved', cls: 'bg-yellow-100 text-yellow-800' },
                      };
                      const sc = statusConfig[inspection.inspection_status] || { label: inspection.inspection_status, cls: 'bg-gray-100 text-gray-700' };
                      return (
                        <div key={inspection.id} className="border border-green-200 rounded-lg p-4 bg-green-50 hover:border-green-400 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="font-semibold text-green-700">{inspection.formatted_cr_id || inspection.formatted_po_id || `INS-${inspection.id}`}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${sc.cls}`}>{sc.label}</span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                <span className="font-medium">{inspection.vendor_name || 'Unknown Vendor'}</span>
                                {inspection.project_id && <span className="text-gray-400"> · Project #{inspection.project_id}</span>}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                Inspected on {inspection.inspected_at ? new Date(inspection.inspected_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                                {inspection.inspected_by_name && ` by ${inspection.inspected_by_name}`}
                              </p>
                              {accepted.length > 0 && (
                                <div className="mt-2 bg-white rounded p-2 border border-green-100">
                                  <p className="text-xs font-medium text-gray-500 mb-1">Accepted Materials ({accepted.length})</p>
                                  <div className="space-y-0.5">
                                    {accepted.map((mat: any, idx: number) => (
                                      <div key={idx} className="flex justify-between text-sm">
                                        <span className="text-gray-700">{mat.material_name}{mat.brand ? ` (${mat.brand})` : ''}</span>
                                        <span className="text-gray-500 font-medium">{mat.quantity} {mat.unit}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleStockInFromInspection(inspection)}
                              className="ml-4 flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shrink-0"
                            >
                              <ArrowDownCircle className="w-4 h-4" />
                              <span>Stock In</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )

              /* ── TAB: INSPECTION HISTORY ── */
              ) : inspectionCentreTab === 'history' ? (
                <div className="space-y-4">
                  {/* Status filter */}
                  <div className="flex items-center space-x-3">
                    <select
                      value={historyStatusFilter}
                      onChange={(e) => {
                        setHistoryStatusFilter(e.target.value);
                        vendorInspectionService.getInspectionHistory(1, 50, e.target.value || undefined)
                          .then(r => setInspectionHistory(r.data || []))
                          .catch(() => {});
                      }}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All statuses</option>
                      <option value="fully_approved">Fully Approved</option>
                      <option value="partially_approved">Partially Approved</option>
                      <option value="fully_rejected">Fully Rejected</option>
                    </select>
                    <span className="text-xs text-gray-400">{inspectionHistory.length} record{inspectionHistory.length !== 1 ? 's' : ''}</span>
                  </div>

                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-12">
                      <ModernLoadingSpinners size="md" />
                    </div>
                  ) : inspectionHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No inspection records found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {inspectionHistory.map((record: any) => {
                        const statusConfig: Record<string, { label: string; cls: string }> = {
                          fully_approved: { label: 'Fully Approved', cls: 'bg-green-100 text-green-800 border-green-200' },
                          partially_approved: { label: 'Partially Approved', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
                          fully_rejected: { label: 'Fully Rejected', cls: 'bg-red-100 text-red-800 border-red-200' },
                        };
                        const sc = statusConfig[record.inspection_status] || { label: record.inspection_status, cls: 'bg-gray-100 text-gray-700 border-gray-200' };
                        const isExpanded = expandedHistoryId === record.id;
                        const materials: any[] = record.materials_inspection || [];
                        return (
                          <div key={record.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setExpandedHistoryId(isExpanded ? null : record.id)}
                              className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
                            >
                              <div className="flex items-center space-x-3 min-w-0">
                                <span className="font-semibold text-blue-700 shrink-0">{record.formatted_cr_id || `INS-${record.id}`}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium border shrink-0 ${sc.cls}`}>{sc.label}</span>
                                <span className="text-sm text-gray-600 truncate">{record.vendor_name || '—'}</span>
                              </div>
                              <div className="flex items-center space-x-3 shrink-0 ml-3">
                                <span className="text-xs text-gray-400">
                                  {record.inspected_at ? new Date(record.inspected_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                                <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
                                  <div><span className="font-medium text-gray-700">Inspected by:</span> {record.inspected_by_name || '—'}</div>
                                  <div><span className="font-medium text-gray-700">Iteration:</span> #{record.iteration_number ?? 0}</div>
                                  {record.overall_notes && <div className="col-span-3"><span className="font-medium text-gray-700">Notes:</span> {record.overall_notes}</div>}
                                </div>
                                {materials.length > 0 && (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-500 border-b border-gray-200">
                                        <th className="text-left pb-1 font-medium">Material</th>
                                        <th className="text-center pb-1 font-medium w-20">Ordered</th>
                                        <th className="text-center pb-1 font-medium w-20">Accepted</th>
                                        <th className="text-center pb-1 font-medium w-20">Rejected</th>
                                        <th className="text-left pb-1 font-medium">Reason</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {materials.map((m: any, i: number) => (
                                        <tr key={i} className={m.rejected_qty > 0 ? 'text-red-700' : 'text-gray-700'}>
                                          <td className="py-1.5">
                                            <div>{m.material_name}</div>
                                            {(m.brand || m.size) && <div className="text-gray-400">{[m.brand, m.size].filter(Boolean).join(' · ')}</div>}
                                          </td>
                                          <td className="text-center py-1.5">{m.ordered_qty ?? '—'} {m.unit}</td>
                                          <td className="text-center py-1.5 text-green-700 font-medium">{m.accepted_qty ?? '—'}</td>
                                          <td className="text-center py-1.5">{m.rejected_qty > 0 ? <span className="text-red-600 font-medium">{m.rejected_qty}</span> : <span className="text-gray-300">—</span>}</td>
                                          <td className="py-1.5">
                                            {m.rejection_category ? (
                                              <div>
                                                <div>{m.rejection_category.replace(/_/g, ' ')}</div>
                                                {m.rejection_notes && <div className="text-gray-500 text-[10px] mt-0.5 italic">{m.rejection_notes}</div>}
                                              </div>
                                            ) : <span className="text-gray-300">—</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                                {/* Inspection Evidence — scrollable proof strip */}
                                {record.evidence_urls && record.evidence_urls.filter((e: any) => e?.url).length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-600 mb-2">
                                      Inspection Evidence ({record.evidence_urls.filter((e: any) => e?.url).length})
                                    </p>
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-200">
                                      {record.evidence_urls.filter((e: any) => e?.url).map((ev: any, ei: number) => {
                                        const isVideo = ev.file_type?.startsWith('video') || /\.(mp4|mov|webm)$/i.test(ev.file_name || '');
                                        const label = ev.file_name
                                          ? ev.file_name.length > 18 ? ev.file_name.slice(0, 15) + '…' : ev.file_name
                                          : `Evidence ${ei + 1}`;
                                        return (
                                          <button
                                            key={ei}
                                            type="button"
                                            onClick={() => { setHistoryLightboxEvidence(record.evidence_urls.filter((e: any) => e?.url)); setHistoryLightboxIndex(ei); setHistoryLightboxOpen(true); }}
                                            title={`View ${ev.file_name || 'evidence'}`}
                                            className="flex-shrink-0 flex flex-col items-center justify-between w-28 h-28 border border-gray-200 rounded-xl bg-white hover:border-blue-400 hover:shadow-md transition-all group p-2 gap-1"
                                          >
                                            <div className={`flex-1 flex items-center justify-center w-full rounded-lg ${isVideo ? 'bg-gray-900' : 'bg-blue-50'}`}>
                                              {isVideo ? (
                                                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/>
                                                </svg>
                                              ) : (
                                                <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 12V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75V17.25A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25V12z"/>
                                                </svg>
                                              )}
                                            </div>
                                            <div className="w-full flex items-center justify-between gap-1 mt-1">
                                              <span className="text-[10px] text-gray-500 truncate leading-tight">{label}</span>
                                              <Eye className="w-3 h-3 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {record.inspection_status !== 'fully_approved' && (
                                  <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>
                                      {record.inspection_status === 'fully_rejected'
                                        ? 'All materials rejected — buyer handles return/refund with vendor.'
                                        : 'Rejected materials held at store — buyer creates return request. Check Held Materials tab for status.'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              /* ── TAB: HELD MATERIALS ── */
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start space-x-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      These materials were physically rejected during inspection and are currently held at M2 Store.
                      The buyer is responsible for creating a return/refund/replacement request with the vendor.
                      Once resolved, they will no longer appear here.
                    </span>
                  </div>

                  {loadingHeld ? (
                    <div className="flex items-center justify-center py-12">
                      <ModernLoadingSpinners size="md" />
                    </div>
                  ) : heldMaterials.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No held materials</p>
                      <p className="text-sm text-gray-400 mt-1">All rejected materials have been resolved</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor / CR</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase w-24">Rejected Qty</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Rejection Reason</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Return Status</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Refund Info</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {heldMaterials.map((item: any, i: number) => {
                            const hasReturn = item.has_return_request;
                            return (
                              <tr key={i} className="bg-white hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{item.material_name}</div>
                                  {(item.brand || item.size) && (
                                    <div className="text-xs text-gray-500">{[item.brand, item.size].filter(Boolean).join(' · ')}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-gray-700">{item.vendor_name || '—'}</div>
                                  <div className="text-xs text-blue-600">{item.formatted_cr_id || `INS-${item.inspection_id}`}</div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="font-semibold text-red-600">{item.rejected_qty}</span>
                                  <span className="text-xs text-gray-400 ml-1">{item.unit}</span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-600">
                                  {item.rejection_category ? item.rejection_category.replace(/_/g, ' ') : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {hasReturn ? (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">
                                      Return: {(item.return_status || '').replace(/_/g, ' ')}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                                      Awaiting Buyer Action
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {item.credit_note_number ? (
                                    <div className="space-y-1">
                                      <div className="text-xs text-green-700 font-medium">
                                        {item.credit_note_number}
                                      </div>
                                      {item.credit_note_amount != null && (
                                        <div className="text-[10px] text-green-600">
                                          {formatCurrency(item.credit_note_amount)}
                                        </div>
                                      )}
                                      {item.refund_evidence && item.refund_evidence.length > 0 && (
                                        <div className="flex gap-1 mt-1">
                                          {item.refund_evidence.slice(0, 3).map((ev: any, ei: number) => (
                                            <button
                                              key={ei}
                                              onClick={() => {
                                                setRefundEvidenceList(item.refund_evidence);
                                                setRefundEvidenceIndex(ei);
                                                setRefundEvidenceOpen(true);
                                              }}
                                              className="relative group w-8 h-8 rounded border border-gray-200 overflow-hidden hover:border-blue-400 transition-colors"
                                              title={`View proof: ${ev.file_name || 'file'}`}
                                              aria-label={`View refund proof: ${ev.file_name || 'file'}`}
                                            >
                                              {ev.file_type?.startsWith('image') ? (
                                                <img src={ev.url} alt="" className="w-full h-full object-cover" />
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                                  <FileText className="w-3 h-3 text-gray-400" />
                                                </div>
                                              )}
                                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                                <Eye className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                              </div>
                                            </button>
                                          ))}
                                          {item.refund_evidence.length > 3 && (
                                            <span className="text-[10px] text-gray-400 self-center">
                                              +{item.refund_evidence.length - 3}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : hasReturn ? (
                                    <span className="text-[10px] text-gray-400">Pending</span>
                                  ) : (
                                    <span className="text-[10px] text-gray-300">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
              {selectedIMR ? (
                <>
                  <button onClick={() => setSelectedIMR(null)} className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="w-4 h-4" /><span>Back to list</span>
                  </button>
                  <button
                    onClick={handleSubmitInspection}
                    disabled={submittingInspection}
                    className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-white font-medium transition-colors ${
                      submittingInspection ? 'bg-gray-400 cursor-not-allowed' :
                      computeOverallDecision() === 'fully_approved' ? 'bg-green-600 hover:bg-green-700' :
                      computeOverallDecision() === 'fully_rejected' ? 'bg-red-600 hover:bg-red-700' :
                      'bg-yellow-600 hover:bg-yellow-700'
                    }`}
                  >
                    {submittingInspection ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Submitting...</span></>
                    ) : (
                      <><CheckCircle className="w-4 h-4" /><span>Submit Inspection</span></>
                    )}
                  </button>
                </>
              ) : (
                <>
                  {inspectionCentreTab === 'pending' && (
                    <p className="text-sm text-gray-500">{pendingInspections.length} pending inspection{pendingInspections.length !== 1 ? 's' : ''}</p>
                  )}
                  {inspectionCentreTab === 'awaiting_stockin' && (
                    <p className="text-sm text-gray-500">{awaitingStockInInspections.length} inspection{awaitingStockInInspections.length !== 1 ? 's' : ''} awaiting stock-in</p>
                  )}
                  {inspectionCentreTab === 'history' && (
                    <p className="text-sm text-gray-500">{inspectionHistory.length} inspection{inspectionHistory.length !== 1 ? 's' : ''} recorded</p>
                  )}
                  {inspectionCentreTab === 'held' && (
                    <p className="text-sm text-gray-500">{heldMaterials.length} material{heldMaterials.length !== 1 ? 's' : ''} held at store</p>
                  )}
                  <button onClick={() => setShowVendorDeliveriesModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">Close</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Evidence Lightbox for inspection history */}
      <EvidenceLightbox
        evidence={historyLightboxEvidence}
        isOpen={historyLightboxOpen}
        onClose={() => setHistoryLightboxOpen(false)}
        initialIndex={historyLightboxIndex}
      />

      {/* Evidence Lightbox for refund proof */}
      <EvidenceLightbox
        evidence={refundEvidenceList}
        isOpen={refundEvidenceOpen}
        onClose={() => setRefundEvidenceOpen(false)}
        initialIndex={refundEvidenceIndex}
      />
    </div>
  );
};

export default StockInPage;
