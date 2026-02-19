import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
  FileText,
  Film,
  Building2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  XCircle,
  MapPin,
  Layers,
  Truck,
  DollarSign,
  Receipt,
} from 'lucide-react';
import { vendorInspectionService, type SubmitInspectionData, type StockInDetails } from '@/services/vendorInspectionService';
import { showError, showWarning, showSuccess } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InspectionFormProps {
  isOpen: boolean;
  onClose: () => void;
  imrId: number | null;
  onInspectionComplete: () => void;
}

interface InspectionDetail {
  imr_id: number;
  cr_id: number;
  vendor: {
    name: string;
    email?: string;
    company_name?: string;
  };
  project: {
    project_name: string;
    project_code?: string;
  };
  materials: InspectionMaterial[];
  materials_for_inspection?: InspectionMaterial[];
  delivery_date?: string;
  notes?: string;
}

interface InspectionMaterial {
  material_id: number;
  material_name: string;
  brand?: string;
  size?: string;
  unit?: string;
  ordered_qty: number;
  unit_price?: number;
}

interface MaterialInspectionEntry {
  material_id: number;
  accepted_qty: number;
  rejected_qty: number;
  rejection_category: string;
  rejection_notes: string;
}

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  uploading: boolean;
  uploaded: boolean;
  url?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REJECTION_CATEGORIES = [
  'Quality Defect',
  'Wrong Specification',
  'Quantity Shortage',
  'Damaged in Transit',
  'Expired',
  'Other',
] as const;

const MAX_IMAGE_SIZE_MB = 50;
const MAX_VIDEO_SIZE_MB = 200;
const MAX_FILE_SIZE_MB = MAX_IMAGE_SIZE_MB;
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (type.startsWith('video/')) return <Film className="w-4 h-4 text-purple-500" />;
  return <FileText className="w-4 h-4 text-gray-500" />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const InspectionForm: React.FC<InspectionFormProps> = ({
  isOpen,
  onClose,
  imrId,
  onInspectionComplete,
}) => {
  const [details, setDetails] = useState<InspectionDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [entries, setEntries] = useState<Record<number, MaterialInspectionEntry>>({});
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [overallNotes, setOverallNotes] = useState('');
  const [overallRejectionCategory, setOverallRejectionCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Stock-in fields
  const [stockInExpanded, setStockInExpanded] = useState(true);
  const [actualPrices, setActualPrices] = useState<Record<string, number>>({});
  const [driverName, setDriverName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [perUnitTransportFee, setPerUnitTransportFee] = useState<number>(1);
  const [deliveryBatchRef, setDeliveryBatchRef] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [deliveryNoteFile, setDeliveryNoteFile] = useState<File | null>(null);
  const [deliveryNoteUrl, setDeliveryNoteUrl] = useState('');
  const [uploadingDeliveryNote, setUploadingDeliveryNote] = useState(false);
  const deliveryNoteInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Fetch inspection details
  // -------------------------------------------------------------------------

  const loadDetails = useCallback(async () => {
    if (!imrId) return;

    setLoadingDetails(true);
    setDetails(null);
    setEntries({});
    setUploadedFiles([]);
    setOverallNotes('');
    setOverallRejectionCategory('');
    // Reset stock-in fields
    setActualPrices({});
    setDriverName('');
    setVehicleNumber('');
    setPerUnitTransportFee(1);
    setDeliveryBatchRef('');
    setReferenceNumber('');
    setDeliveryNoteFile(null);
    setDeliveryNoteUrl('');
    setStockInExpanded(true);

    try {
      const response = await vendorInspectionService.getInspectionDetails(imrId);
      const raw = response as any;
      const data: InspectionDetail = raw?.data ?? raw;
      setDetails(data);

      const materialsList = data.materials_for_inspection || data.materials || [];
      const initialEntries: Record<number, MaterialInspectionEntry> = {};
      materialsList.forEach((mat, index) => {
        const id = mat.material_id ?? index;
        initialEntries[id] = {
          material_id: id,
          accepted_qty: mat.ordered_qty ?? (mat as any).quantity ?? 0,
          rejected_qty: 0,
          rejection_category: '',
          rejection_notes: '',
        };
      });
      if (!data.materials || data.materials.length === 0) {
        data.materials = materialsList;
      }
      setEntries(initialEntries);

      // Initialize actual prices from ordered unit_price
      const prices: Record<string, number> = {};
      materialsList.forEach((mat) => {
        if (mat.material_name && mat.unit_price != null) {
          prices[mat.material_name] = mat.unit_price;
        }
      });
      setActualPrices(prices);

      // Auto-generate delivery batch ref suggestion
      const now = new Date();
      const batchSuffix = String(now.getTime()).slice(-4);
      setDeliveryBatchRef(`DB-${now.getFullYear()}-${batchSuffix}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load inspection details';
      showError(message);
    } finally {
      setLoadingDetails(false);
    }
  }, [imrId]);

  useEffect(() => {
    if (isOpen && imrId) loadDetails();
  }, [isOpen, imrId, loadDetails]);

  const uploadedFilesRef = useRef<UploadedFile[]>([]);
  uploadedFilesRef.current = uploadedFiles;

  useEffect(() => {
    return () => {
      uploadedFilesRef.current.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, []);

  // -------------------------------------------------------------------------
  // Entry handlers
  // -------------------------------------------------------------------------

  const updateEntry = (materialId: number, field: keyof MaterialInspectionEntry, value: string | number) => {
    setEntries((prev) => {
      const current = prev[materialId];
      if (!current) return prev;

      const material = details?.materials.find((m) => m.material_id === materialId);
      const orderedQty = material?.ordered_qty ?? 0;

      let updated = { ...current, [field]: value };

      if (field === 'accepted_qty') {
        const acceptedNum = Math.max(0, Math.min(Number(value), orderedQty));
        updated.accepted_qty = acceptedNum;
        updated.rejected_qty = orderedQty - acceptedNum;
      }

      if (updated.rejected_qty === 0) {
        updated.rejection_category = '';
        updated.rejection_notes = '';
      }

      return { ...prev, [materialId]: updated };
    });
  };

  const handleApproveAll = () => {
    if (!details) return;
    const newEntries: Record<number, MaterialInspectionEntry> = {};
    details.materials.forEach((mat) => {
      newEntries[mat.material_id] = {
        material_id: mat.material_id,
        accepted_qty: mat.ordered_qty,
        rejected_qty: 0,
        rejection_category: '',
        rejection_notes: '',
      };
    });
    setEntries(newEntries);
    setOverallRejectionCategory('');
  };

  // -------------------------------------------------------------------------
  // File upload handlers
  // -------------------------------------------------------------------------

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: UploadedFile[] = [];

    Array.from(files).forEach((file) => {
      if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
        showWarning(`"${file.name}" is not a supported file type`);
        return;
      }
      const maxSizeMB = file.type.startsWith('video/') ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
      if (file.size > maxSizeMB * 1024 * 1024) {
        showWarning(`"${file.name}" exceeds the ${maxSizeMB}MB size limit`);
        return;
      }

      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        preview,
        uploading: false,
        uploaded: false,
      });
    });

    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== fileId);
    });
  };

  const uploadAllEvidence = async (): Promise<string[]> => {
    const urls: string[] = [];

    for (const uf of uploadedFiles) {
      if (uf.uploaded && uf.url) {
        urls.push(uf.url);
        continue;
      }

      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === uf.id ? { ...f, uploading: true, error: undefined } : f)),
      );

      try {
        const response = await vendorInspectionService.uploadInspectionEvidence(uf.file, details!.cr_id);
        const uploadResult = response as any;
        const url = uploadResult?.data?.url ?? uploadResult?.url ?? '';
        urls.push(url);

        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === uf.id ? { ...f, uploading: false, uploaded: true, url } : f)),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === uf.id ? { ...f, uploading: false, error: msg } : f)),
        );
        throw new Error(`Failed to upload "${uf.file.name}": ${msg}`);
      }
    }

    return urls;
  };

  // -------------------------------------------------------------------------
  // Compute / Validate / Submit
  // -------------------------------------------------------------------------

  const computeOverallStatus = (): 'fully_approved' | 'partially_approved' | 'fully_rejected' => {
    const entryList = Object.values(entries);
    const totalRej = entryList.reduce((sum, e) => sum + e.rejected_qty, 0);
    const totalAcc = entryList.reduce((sum, e) => sum + e.accepted_qty, 0);
    if (totalRej === 0) return 'fully_approved';
    if (totalAcc === 0) return 'fully_rejected';
    return 'partially_approved';
  };

  const validate = (): string | null => {
    for (const entry of Object.values(entries)) {
      if (entry.rejected_qty > 0 && !entry.rejection_category) {
        const mat = details?.materials.find((m) => m.material_id === entry.material_id);
        return `Please select a rejection category for "${mat?.material_name ?? 'Unknown'}"`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!imrId || !details) return;

    const validationError = validate();
    if (validationError) {
      showWarning(validationError);
      return;
    }

    setSubmitting(true);

    try {
      let evidenceUrls: string[] = [];
      if (uploadedFiles.length > 0) {
        evidenceUrls = await uploadAllEvidence();
      }

      // Upload delivery note file if provided
      let dnUrl = deliveryNoteUrl;
      if (deliveryNoteFile && !dnUrl) {
        setUploadingDeliveryNote(true);
        try {
          const uploadResult = await vendorInspectionService.uploadInspectionEvidence(deliveryNoteFile, details.cr_id);
          const resultData = uploadResult as any;
          dnUrl = resultData?.data?.url ?? resultData?.url ?? '';
          setDeliveryNoteUrl(dnUrl);
        } finally {
          setUploadingDeliveryNote(false);
        }
      }

      const overallStatus = computeOverallStatus();
      const hasAcceptedMaterials = overallStatus !== 'fully_rejected';

      // Build stock-in details for accepted materials
      let stockInPayload: StockInDetails | undefined;
      if (hasAcceptedMaterials) {
        stockInPayload = {
          actual_unit_prices: Object.keys(actualPrices).length > 0 ? actualPrices : undefined,
          driver_name: driverName.trim() || undefined,
          vehicle_number: vehicleNumber.trim() || undefined,
          per_unit_transport_fee: perUnitTransportFee > 0 ? perUnitTransportFee : undefined,
          delivery_batch_ref: deliveryBatchRef.trim() || undefined,
          reference_number: referenceNumber.trim() || undefined,
          delivery_note_url: dnUrl || undefined,
        };
      }

      const payload: SubmitInspectionData = {
        decision: overallStatus,
        overall_notes: overallNotes.trim() || undefined,
        overall_rejection_category:
          overallStatus !== 'fully_approved' ? overallRejectionCategory || undefined : undefined,
        evidence_urls: evidenceUrls.filter(Boolean).length > 0
          ? evidenceUrls.filter(Boolean).map((u) => ({ url: u, file_name: u.split('/').pop() || 'file', file_type: 'image' }))
          : undefined,
        stock_in_details: stockInPayload,
        materials_inspection: Object.values(entries).map((entry) => {
          const mat = details?.materials.find((m) => m.material_id === entry.material_id);
          return {
            material_name: mat?.material_name || '',
            brand: mat?.brand,
            size: mat?.size,
            unit: mat?.unit || '',
            ordered_qty: mat?.ordered_qty || 0,
            unit_price: actualPrices[mat?.material_name || ''] ?? mat?.unit_price ?? 0,
            accepted_qty: entry.accepted_qty,
            rejected_qty: entry.rejected_qty,
            rejection_category: entry.rejected_qty > 0 ? entry.rejection_category : undefined,
            rejection_notes: entry.rejected_qty > 0 && entry.rejection_notes.trim()
              ? entry.rejection_notes.trim()
              : undefined,
          };
        }),
      };

      await vendorInspectionService.submitInspection(imrId, payload);
      showSuccess('Inspection submitted successfully');
      onInspectionComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit inspection';
      showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const hasAnyRejection = Object.values(entries).some((e) => e.rejected_qty > 0);
  const totalAccepted = Object.values(entries).reduce((s, e) => s + e.accepted_qty, 0);
  const totalRejected = Object.values(entries).reduce((s, e) => s + e.rejected_qty, 0);
  const totalOrdered = details?.materials.reduce((s, m) => s + m.ordered_qty, 0) ?? 0;

  const vendorName = details?.vendor?.company_name || details?.vendor?.name;
  const isStoreRoute = !vendorName || vendorName === 'Unknown Vendor' || vendorName === 'M2 Store';
  const overallStatus = computeOverallStatus();
  const showStockInSection = overallStatus !== 'fully_rejected';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-3xl mx-4 my-8"
          >
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">

              {/* ============ HEADER ============ */}
              <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
                      <ShieldCheck className="w-5.5 h-5.5 text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white tracking-tight">
                        Delivery Inspection
                      </h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
                          IMR #{imrId}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-xs font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
                          CR-{details?.cr_id}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-white/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* ============ BODY ============ */}
              <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
                {loadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <ModernLoadingSpinners size="lg" />
                    <p className="text-sm text-gray-500">Loading inspection details...</p>
                  </div>
                ) : !details ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <AlertTriangle className="w-12 h-12 text-amber-400" />
                    <p className="text-gray-600 font-medium">Could not load inspection details</p>
                    <button
                      onClick={loadDetails}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="px-6 py-5 space-y-5">

                    {/* ---- Context Info Bar ---- */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Source */}
                      <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                        <div className="w-9 h-9 rounded-lg bg-slate-200/70 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4.5 h-4.5 text-slate-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Source</p>
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {isStoreRoute ? 'M2 Store' : vendorName}
                          </p>
                          {isStoreRoute ? (
                            <p className="text-[10px] text-slate-400">Internal Route</p>
                          ) : details.vendor?.email ? (
                            <p className="text-[10px] text-slate-400 truncate">{details.vendor.email}</p>
                          ) : null}
                        </div>
                      </div>

                      {/* Project */}
                      <div className="flex items-center gap-3 bg-blue-50/60 rounded-xl px-4 py-3 border border-blue-100/60">
                        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-4.5 h-4.5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Project</p>
                          <p className="text-sm font-semibold text-blue-900 truncate">
                            {details.project?.project_name || 'Unknown'}
                          </p>
                          {details.project?.project_code && (
                            <p className="text-[10px] text-blue-400">{details.project.project_code}</p>
                          )}
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="flex items-center gap-3 bg-emerald-50/60 rounded-xl px-4 py-3 border border-emerald-100/60">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <Layers className="w-4.5 h-4.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Materials</p>
                          <p className="text-sm font-semibold text-emerald-900">
                            {details.materials.length} item{details.materials.length !== 1 ? 's' : ''}
                          </p>
                          <p className="text-[10px] text-emerald-500">
                            {totalOrdered} total units ordered
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* ---- Acceptance Summary Strip ---- */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {totalAccepted > 0 && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {totalAccepted} accepted
                        </div>
                      )}
                      {totalRejected > 0 && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium border border-red-100">
                          <XCircle className="w-3.5 h-3.5" />
                          {totalRejected} rejected
                        </div>
                      )}
                    </div>

                    {/* ---- Materials Inspection ---- */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Inspect Materials
                      </h3>
                      <div className="space-y-3">
                        {details.materials.map((mat, idx) => {
                          const entry = entries[mat.material_id];
                          if (!entry) return null;
                          const hasRejection = entry.rejected_qty > 0;

                          return (
                            <div
                              key={mat.material_id}
                              className={`rounded-xl border transition-all ${
                                hasRejection
                                  ? 'border-red-200 bg-red-50/40 shadow-sm shadow-red-100/50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              {/* Material header */}
                              <div className="px-4 pt-3.5 pb-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                      <span className="text-xs font-bold text-slate-500">{idx + 1}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-gray-900 leading-tight">
                                        {mat.material_name}
                                      </p>
                                      {(mat.brand || mat.size || mat.unit) && (
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                          {mat.brand && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
                                              {mat.brand}
                                            </span>
                                          )}
                                          {mat.size && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
                                              {mat.size}
                                            </span>
                                          )}
                                          {mat.unit && (
                                            <span className="text-[10px] text-gray-400">{mat.unit}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex-shrink-0 text-right">
                                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                                      Ordered
                                    </span>
                                    <p className="text-lg font-bold text-slate-800 leading-tight">
                                      {mat.ordered_qty}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Quantity inputs */}
                              <div className="px-4 pb-3.5 grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                                    Accepted
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={mat.ordered_qty}
                                    value={entry.accepted_qty}
                                    onChange={(e) =>
                                      updateEntry(mat.material_id, 'accepted_qty', Number(e.target.value))
                                    }
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                                    Rejected
                                  </label>
                                  <input
                                    type="number"
                                    readOnly
                                    value={entry.rejected_qty}
                                    className={`w-full px-3 py-2 border rounded-lg text-sm font-medium cursor-not-allowed ${
                                      hasRejection
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : 'border-gray-100 bg-gray-50 text-gray-400'
                                    }`}
                                    tabIndex={-1}
                                  />
                                </div>
                              </div>

                              {/* Rejection details */}
                              <AnimatePresence>
                                {hasRejection && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mx-4 mb-3.5 p-3 bg-red-50 rounded-lg border border-red-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">
                                          Rejection Reason *
                                        </label>
                                        <div className="relative">
                                          <select
                                            value={entry.rejection_category}
                                            onChange={(e) =>
                                              updateEntry(mat.material_id, 'rejection_category', e.target.value)
                                            }
                                            className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 bg-white appearance-none cursor-pointer"
                                          >
                                            <option value="">Select reason...</option>
                                            {REJECTION_CATEGORIES.map((cat) => (
                                              <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                          </select>
                                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">
                                          Notes
                                        </label>
                                        <textarea
                                          value={entry.rejection_notes}
                                          onChange={(e) =>
                                            updateEntry(mat.material_id, 'rejection_notes', e.target.value)
                                          }
                                          placeholder="Describe the issue..."
                                          rows={2}
                                          className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none"
                                        />
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ---- Evidence Upload ---- */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Evidence
                        <span className="text-slate-300 font-normal ml-1">(optional)</span>
                      </h3>
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:border-indigo-300 transition-colors group cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept={ACCEPTED_FILE_TYPES.join(',')}
                          onChange={handleFileSelect}
                          className="hidden"
                          id="evidence-upload"
                        />
                        <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-indigo-50 flex items-center justify-center mx-auto transition-colors">
                          <Upload className="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                        </div>
                        <p className="text-sm font-medium text-gray-600 mt-2">
                          Upload photos or videos
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          JPEG, PNG, WebP, MP4, MOV — up to {MAX_FILE_SIZE_MB}MB each
                        </p>
                      </div>

                      {/* Uploaded thumbnails */}
                      {uploadedFiles.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                          {uploadedFiles.map((uf) => (
                            <div
                              key={uf.id}
                              className={`relative group rounded-lg border overflow-hidden aspect-square ${
                                uf.error
                                  ? 'border-red-300 bg-red-50'
                                  : uf.uploaded
                                  ? 'border-emerald-300 bg-emerald-50'
                                  : 'border-gray-200 bg-white'
                              }`}
                            >
                              {uf.preview ? (
                                <img
                                  src={uf.preview}
                                  alt={uf.file.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 gap-1">
                                  {getFileIcon(uf.file.type)}
                                  <p className="text-[9px] text-gray-400 px-1 truncate max-w-full">{uf.file.name}</p>
                                </div>
                              )}

                              {uf.uploading && (
                                <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                                  <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                                </div>
                              )}

                              {uf.uploaded && !uf.uploading && (
                                <div className="absolute top-1 right-1">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 drop-shadow" />
                                </div>
                              )}

                              {uf.error && (
                                <div className="absolute top-1 right-1" title={uf.error}>
                                  <AlertTriangle className="w-4 h-4 text-red-500 drop-shadow" />
                                </div>
                              )}

                              <button
                                onClick={() => removeFile(uf.id)}
                                className="absolute top-1 left-1 p-0.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                                aria-label={`Remove ${uf.file.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ---- Overall Rejection Category ---- */}
                    {hasAnyRejection && (
                      <div>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Overall Rejection Category
                        </h3>
                        <div className="relative max-w-sm">
                          <select
                            value={overallRejectionCategory}
                            onChange={(e) => setOverallRejectionCategory(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white appearance-none cursor-pointer"
                          >
                            <option value="">Select overall category (optional)</option>
                            {REJECTION_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {/* ---- Overall Notes ---- */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Notes
                        <span className="text-slate-300 font-normal ml-1">(optional)</span>
                      </h3>
                      <textarea
                        value={overallNotes}
                        onChange={(e) => setOverallNotes(e.target.value)}
                        placeholder="Overall observations, instructions, or comments..."
                        rows={3}
                        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none placeholder:text-gray-300"
                      />
                    </div>

                    {/* ---- Stock-In Details ---- */}
                    {showStockInSection && (
                      <div className="border border-blue-200 rounded-xl overflow-hidden bg-blue-50/30">
                        {/* Section header (collapsible) */}
                        <button
                          type="button"
                          onClick={() => setStockInExpanded(!stockInExpanded)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                              <Truck className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-semibold text-blue-900">Stock-In Details</p>
                              <p className="text-[10px] text-blue-500">Purchase price, transport & delivery info</p>
                            </div>
                          </div>
                          {stockInExpanded
                            ? <ChevronUp className="w-4 h-4 text-blue-400" />
                            : <ChevronDown className="w-4 h-4 text-blue-400" />
                          }
                        </button>

                        <AnimatePresence>
                          {stockInExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 py-4 space-y-4">

                                {/* -- Actual Purchase Prices -- */}
                                <div>
                                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-1.5">
                                    <DollarSign className="w-3.5 h-3.5" />
                                    Actual Purchase Price per Material
                                  </h4>
                                  <div className="space-y-2">
                                    {details.materials
                                      .filter((mat) => {
                                        const entry = entries[mat.material_id];
                                        return entry && entry.accepted_qty > 0;
                                      })
                                      .map((mat) => (
                                        <div key={mat.material_id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-blue-100">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 truncate">
                                              {mat.material_name}
                                            </p>
                                            <p className="text-[10px] text-gray-400">
                                              {entries[mat.material_id]?.accepted_qty} {mat.unit || 'pcs'} accepted
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-gray-400">AED</span>
                                            <input
                                              type="number"
                                              min={0}
                                              step="0.01"
                                              value={actualPrices[mat.material_name] ?? mat.unit_price ?? 0}
                                              onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setActualPrices((prev) => ({ ...prev, [mat.material_name]: val }));
                                              }}
                                              className="w-28 px-2.5 py-1.5 border border-blue-200 rounded-lg text-sm text-right font-medium focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                            />
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>

                                {/* -- Transport & Delivery -- */}
                                <div>
                                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-1.5">
                                    <Truck className="w-3.5 h-3.5" />
                                    Transport & Delivery
                                  </h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Driver Name</label>
                                      <input
                                        type="text"
                                        value={driverName}
                                        onChange={(e) => setDriverName(e.target.value)}
                                        placeholder="e.g. Ahmed Khan"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-300"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Vehicle Number</label>
                                      <input
                                        type="text"
                                        value={vehicleNumber}
                                        onChange={(e) => setVehicleNumber(e.target.value)}
                                        placeholder="e.g. DXB-12345"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-300"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Per-Unit Transport Fee (AED)</label>
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.5"
                                        value={perUnitTransportFee}
                                        onChange={(e) => setPerUnitTransportFee(parseFloat(e.target.value) || 0)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                      />
                                      <p className="text-[10px] text-gray-400 mt-0.5">
                                        Total: AED {(perUnitTransportFee * totalAccepted).toFixed(2)} ({totalAccepted} units)
                                      </p>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-medium text-gray-500 mb-1">Delivery Batch Ref</label>
                                      <input
                                        type="text"
                                        value={deliveryBatchRef}
                                        onChange={(e) => setDeliveryBatchRef(e.target.value)}
                                        placeholder="e.g. DB-2026-001"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-300"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* -- Reference Number -- */}
                                <div>
                                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-1.5">
                                    <Receipt className="w-3.5 h-3.5" />
                                    Reference / Invoice
                                  </h4>
                                  <input
                                    type="text"
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    placeholder="Invoice number, GRN, or purchase reference..."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-300"
                                  />
                                </div>

                                {/* -- Delivery Note Upload -- */}
                                <div>
                                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" />
                                    Delivery Note
                                    <span className="text-blue-300 font-normal">(optional)</span>
                                  </h4>
                                  <input
                                    ref={deliveryNoteInputRef}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        setDeliveryNoteFile(file);
                                        setDeliveryNoteUrl('');
                                      }
                                    }}
                                    className="hidden"
                                  />
                                  {deliveryNoteFile ? (
                                    <div className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-blue-100">
                                      <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{deliveryNoteFile.name}</p>
                                        <p className="text-[10px] text-gray-400">{formatFileSize(deliveryNoteFile.size)}</p>
                                      </div>
                                      {uploadingDeliveryNote ? (
                                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                      ) : deliveryNoteUrl ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDeliveryNoteFile(null);
                                          setDeliveryNoteUrl('');
                                          if (deliveryNoteInputRef.current) deliveryNoteInputRef.current.value = '';
                                        }}
                                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                        aria-label="Remove delivery note"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => deliveryNoteInputRef.current?.click()}
                                      className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-dashed border-blue-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                                    >
                                      <Upload className="w-4 h-4" />
                                      <span>Upload delivery note (PDF, JPEG, PNG)</span>
                                    </button>
                                  )}
                                </div>

                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ============ FOOTER ============ */}
              {details && (
                <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/70">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    {/* Status preview */}
                    <div className="text-sm">
                      {overallStatus === 'fully_approved' ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          All materials will be approved
                        </span>
                      ) : overallStatus === 'fully_rejected' ? (
                        <span className="flex items-center gap-1.5 text-red-600 font-medium">
                          <XCircle className="w-4 h-4" />
                          All materials will be rejected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                          <AlertTriangle className="w-4 h-4" />
                          Partial: {totalAccepted} accepted, {totalRejected} rejected
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleApproveAll}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                      >
                        Approve All
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            Submit Inspection
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InspectionForm;
