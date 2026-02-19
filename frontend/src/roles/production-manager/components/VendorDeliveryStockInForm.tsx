import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Upload,
  Trash2,
  FileText,
  Loader2,
  Building2,
  MapPin,
  Layers,
  Package,
  Image as ImageIcon,
  Film,
} from 'lucide-react';
import {
  vendorInspectionService,
  type SubmitInspectionData,
} from '@/services/vendorInspectionService';
import { showError, showWarning, showSuccess } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingDelivery {
  request_id: number;
  cr_id: number;
  formatted_cr_id?: string;
  formatted_po_id?: string;
  project_name?: string;
  vendor_name?: string;
  created_at?: string;
  materials_data?: Array<{
    material_name?: string;
    name?: string;
    brand?: string;
    quantity?: number;
    qty?: number;
    unit?: string;
  }>;
}

/** Accepted material info passed to Manual Entry after inspection */
export interface AcceptedMaterialInfo {
  material_name: string;
  brand?: string;
  size?: string;
  unit?: string;
  accepted_qty: number;
  /** Vendor details carried from the inspection — same for all materials in one delivery */
  vendor_name?: string;
  vendor_email?: string;
  vendor_phone?: string;
}

interface VendorDeliveryStockInFormProps {
  pendingDeliveries: PendingDelivery[];
  onInspectionComplete: (acceptedMaterials?: AcceptedMaterialInfo[]) => void;
  onClose: () => void;
}

interface InspectionDetail {
  imr_id: number;
  cr_id: number;
  /** Backend key is vendor_details (not vendor) */
  vendor_details?: {
    company_name?: string;
    contact_person_name?: string;
    email?: string;
    phone?: string;
    phone_code?: string;
  };
  cr_details?: { vendor_name?: string };
  project: { project_name: string; project_code?: string };
  materials: InspectionMaterial[];
  materials_for_inspection?: InspectionMaterial[];
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

type WizardStep = 'select_delivery' | 'inspection';

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
const ACCEPTED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
];

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (type.startsWith('video/')) return <Film className="w-4 h-4 text-purple-500" />;
  return <FileText className="w-4 h-4 text-gray-500" />;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VendorDeliveryStockInForm: React.FC<VendorDeliveryStockInFormProps> = ({
  pendingDeliveries,
  onInspectionComplete,
  onClose,
}) => {
  const [wizardStep, setWizardStep] = useState<WizardStep>('select_delivery');
  const [selectedImrId, setSelectedImrId] = useState<number | null>(null);

  // Inspection state
  const [details, setDetails] = useState<InspectionDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [entries, setEntries] = useState<Record<number, MaterialInspectionEntry>>({});
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [overallNotes, setOverallNotes] = useState('');
  const [overallRejectionCategory, setOverallRejectionCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------------------------
  // Load inspection details
  // -------------------------------------------------------------------------

  const loadDetails = useCallback(async () => {
    if (!selectedImrId) return;
    setLoadingDetails(true);
    setDetails(null);
    setEntries({});
    uploadedFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setUploadedFiles([]);
    setOverallNotes('');
    setOverallRejectionCategory('');

    try {
      const response = await vendorInspectionService.getInspectionDetails(selectedImrId);
      const raw = response as any;
      const parsed: InspectionDetail = raw?.data ?? raw;
      const detailData = { ...parsed };
      const materialsList = detailData.materials_for_inspection || detailData.materials || [];
      if (!detailData.materials || detailData.materials.length === 0) {
        detailData.materials = materialsList;
      }
      setDetails(detailData);

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
      setEntries(initialEntries);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load inspection details';
      showError(message);
    } finally {
      setLoadingDetails(false);
    }
  }, [selectedImrId]);

  useEffect(() => {
    if (selectedImrId) loadDetails();
  }, [selectedImrId, loadDetails]);

  // Cleanup previews on unmount
  const uploadedFilesRef = useRef<UploadedFile[]>([]);
  uploadedFilesRef.current = uploadedFiles;
  useEffect(() => {
    return () => {
      uploadedFilesRef.current.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
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
  // Evidence file upload
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
      const maxSizeMB = file.type.startsWith('video/') ? 200 : MAX_IMAGE_SIZE_MB;
      if (file.size > maxSizeMB * 1024 * 1024) {
        showWarning(`"${file.name}" exceeds the ${maxSizeMB}MB size limit`);
        return;
      }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file, preview, uploading: false, uploaded: false,
      });
    });
    if (newFiles.length > 0) setUploadedFiles((prev) => [...prev, ...newFiles]);
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
      if (uf.uploaded && uf.url) { urls.push(uf.url); continue; }
      setUploadedFiles((prev) => prev.map((f) => (f.id === uf.id ? { ...f, uploading: true, error: undefined } : f)));
      try {
        const response = await vendorInspectionService.uploadInspectionEvidence(uf.file, details!.cr_id);
        const uploadResult = response as any;
        const url = uploadResult?.data?.url ?? uploadResult?.url ?? '';
        urls.push(url);
        setUploadedFiles((prev) => prev.map((f) => (f.id === uf.id ? { ...f, uploading: false, uploaded: true, url } : f)));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setUploadedFiles((prev) => prev.map((f) => (f.id === uf.id ? { ...f, uploading: false, error: msg } : f)));
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
    if (!selectedImrId || !details) return;
    const validationError = validate();
    if (validationError) { showWarning(validationError); return; }

    setSubmitting(true);
    try {
      // Upload evidence if any
      let evidenceUrls: string[] = [];
      if (uploadedFiles.length > 0) {
        evidenceUrls = await uploadAllEvidence();
      }

      const overallStatus = computeOverallStatus();

      // Submit inspection only (no stock-in details)
      const payload: SubmitInspectionData = {
        decision: overallStatus,
        overall_notes: overallNotes.trim() || undefined,
        overall_rejection_category:
          overallStatus !== 'fully_approved' ? overallRejectionCategory || undefined : undefined,
        evidence_urls: evidenceUrls.length > 0
          ? evidenceUrls.map((u) => ({ url: u, file_name: u.split('/').pop() || 'file', file_type: 'image' }))
          : undefined,
        materials_inspection: Object.values(entries).map((entry) => {
          const mat = details?.materials.find((m) => m.material_id === entry.material_id);
          return {
            material_name: mat?.material_name || '',
            brand: mat?.brand,
            size: mat?.size,
            unit: mat?.unit || '',
            ordered_qty: mat?.ordered_qty || 0,
            accepted_qty: entry.accepted_qty,
            rejected_qty: entry.rejected_qty,
            rejection_category: entry.rejected_qty > 0 ? entry.rejection_category : undefined,
            rejection_notes: entry.rejected_qty > 0 && entry.rejection_notes.trim() ? entry.rejection_notes.trim() : undefined,
          };
        }),
      };

      await vendorInspectionService.submitInspection(selectedImrId, payload);
      showSuccess('Inspection submitted — redirecting to Stock In');

      // Build accepted materials list and pass to parent for auto-fill
      const vendorInfo = {
        vendor_name:
          details?.vendor_details?.company_name ||
          details?.vendor_details?.contact_person_name ||
          details?.cr_details?.vendor_name,
        vendor_email: details?.vendor_details?.email,
        vendor_phone: details?.vendor_details?.phone
          ? `${details.vendor_details.phone_code || ''}${details.vendor_details.phone}`.trim()
          : undefined,
      };

      const acceptedMaterials: AcceptedMaterialInfo[] = Object.values(entries)
        .filter((e) => e.accepted_qty > 0)
        .map((entry) => {
          const mat = details?.materials.find((m) => m.material_id === entry.material_id);
          return {
            material_name: mat?.material_name || '',
            brand: mat?.brand,
            size: mat?.size,
            unit: mat?.unit,
            accepted_qty: entry.accepted_qty,
            ...vendorInfo,
          };
        });

      onInspectionComplete(acceptedMaterials);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit inspection';
      showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  const handleSelectDelivery = (imrId: number) => {
    setSelectedImrId(imrId);
    setWizardStep('inspection');
  };

  const handleBackToDeliveries = () => {
    setSelectedImrId(null);
    setDetails(null);
    setWizardStep('select_delivery');
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const hasAnyRejection = Object.values(entries).some((e) => e.rejected_qty > 0);
  const totalAccepted = Object.values(entries).reduce((s, e) => s + e.accepted_qty, 0);
  const totalRejected = Object.values(entries).reduce((s, e) => s + e.rejected_qty, 0);
  const totalOrdered = details?.materials.reduce((s, m) => s + m.ordered_qty, 0) ?? 0;
  const vendorName =
    details?.vendor_details?.company_name ||
    details?.vendor_details?.contact_person_name ||
    details?.cr_details?.vendor_name;
  const isStoreRoute = !vendorName || vendorName === 'Unknown Vendor' || vendorName === 'M2 Store';
  const overallStatus = computeOverallStatus();

  // =========================================================================
  // STEP 1: Delivery Selection List
  // =========================================================================

  if (wizardStep === 'select_delivery') {
    return (
      <div className="p-6">
        {pendingDeliveries.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-500">No pending vendor deliveries</p>
            <p className="text-sm text-gray-400 mt-1">All deliveries have been inspected</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-4">
              Select a delivery to inspect. {pendingDeliveries.length} pending{' '}
              {pendingDeliveries.length === 1 ? 'delivery' : 'deliveries'}.
            </p>
            {pendingDeliveries.map((delivery) => (
              <div
                key={delivery.request_id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer"
                onClick={() => handleSelectDelivery(delivery.request_id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-semibold text-blue-600">
                        {delivery.formatted_cr_id || `CR-${delivery.cr_id}`}
                      </span>
                      {delivery.formatted_po_id && (
                        <span className="text-xs text-gray-500">({delivery.formatted_po_id})</span>
                      )}
                      <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                        Awaiting Inspection
                      </span>
                    </div>
                    {delivery.project_name && <p className="text-sm text-gray-500">Project: {delivery.project_name}</p>}
                    {delivery.vendor_name && <p className="text-sm text-gray-500">Vendor: {delivery.vendor_name}</p>}
                    {delivery.created_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Routed: {new Date(delivery.created_at).toLocaleDateString()}
                      </p>
                    )}
                    {delivery.materials_data && Array.isArray(delivery.materials_data) && (
                      <div className="bg-gray-50 rounded-lg p-2 mt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Materials ({delivery.materials_data.length})</p>
                        <div className="space-y-0.5">
                          {delivery.materials_data.slice(0, 3).map((mat, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-gray-600">{mat.material_name || mat.name}{mat.brand ? ` (${mat.brand})` : ''}</span>
                              <span className="text-gray-500 font-medium">{mat.quantity || mat.qty} {mat.unit || 'pcs'}</span>
                            </div>
                          ))}
                          {delivery.materials_data.length > 3 && (
                            <p className="text-xs text-gray-400">+{delivery.materials_data.length - 3} more...</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <button className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors ml-3 flex-shrink-0">
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Inspect</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // STEP 2: Inspection (Accept / Reject / Partial)
  // =========================================================================

  return (
    <div>
      {/* Back link */}
      <div className="px-6 pt-4 pb-2">
        <button onClick={handleBackToDeliveries} className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to deliveries
        </button>
      </div>

      {loadingDetails ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <ModernLoadingSpinners size="lg" />
          <p className="text-sm text-gray-500">Loading inspection details...</p>
        </div>
      ) : !details ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <AlertTriangle className="w-12 h-12 text-amber-400" />
          <p className="text-gray-600 font-medium">Could not load inspection details</p>
          <button onClick={loadDetails} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Retry</button>
        </div>
      ) : (
        <>
          <div className="px-6 py-4 space-y-5 overflow-y-auto max-h-[calc(80vh-200px)]">
            {/* Context Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <div className="w-9 h-9 rounded-lg bg-slate-200/70 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Source</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{isStoreRoute ? 'M2 Store' : vendorName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-blue-50/60 rounded-xl px-4 py-3 border border-blue-100/60">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Project</p>
                  <p className="text-sm font-semibold text-blue-900 truncate">{details.project?.project_name || 'Unknown'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-emerald-50/60 rounded-xl px-4 py-3 border border-emerald-100/60">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Materials</p>
                  <p className="text-sm font-semibold text-emerald-900">{details.materials.length} item{details.materials.length !== 1 ? 's' : ''}</p>
                  <p className="text-[10px] text-emerald-500">{totalOrdered} total units ordered</p>
                </div>
              </div>
            </div>

            {/* Acceptance Summary */}
            <div className="flex items-center gap-2 flex-wrap">
              {totalAccepted > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {totalAccepted} accepted
                </div>
              )}
              {totalRejected > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium border border-red-100">
                  <XCircle className="w-3.5 h-3.5" /> {totalRejected} rejected
                </div>
              )}
            </div>

            {/* Materials Inspection */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Inspect Materials</h3>
              <div className="space-y-3">
                {details.materials.map((mat, idx) => {
                  const entry = entries[mat.material_id];
                  if (!entry) return null;
                  const hasRejection = entry.rejected_qty > 0;

                  return (
                    <div key={mat.material_id} className={`rounded-xl border transition-all ${hasRejection ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <div className="px-4 pt-3.5 pb-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-xs font-bold text-slate-500">{idx + 1}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 leading-tight">{mat.material_name}</p>
                              {(mat.brand || mat.size || mat.unit) && (
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {mat.brand && <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">{mat.brand}</span>}
                                  {mat.size && <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">{mat.size}</span>}
                                  {mat.unit && <span className="text-[10px] text-gray-400">{mat.unit}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Ordered</span>
                            <p className="text-lg font-bold text-slate-800 leading-tight">{mat.ordered_qty}</p>
                          </div>
                        </div>
                      </div>

                      {/* Accepted / Rejected inputs */}
                      <div className="px-4 pb-3.5 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Accepted</label>
                          <input type="number" min={0} max={mat.ordered_qty} value={entry.accepted_qty}
                            onChange={(e) => updateEntry(mat.material_id, 'accepted_qty', Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Rejected</label>
                          <input type="number" readOnly value={entry.rejected_qty} tabIndex={-1}
                            className={`w-full px-3 py-2 border rounded-lg text-sm font-medium cursor-not-allowed ${hasRejection ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-100 bg-gray-50 text-gray-400'}`} />
                        </div>
                      </div>

                      {/* Rejection details */}
                      {hasRejection && (
                        <div className="mx-4 mb-3.5 p-3 bg-red-50 rounded-lg border border-red-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">Rejection Reason *</label>
                            <div className="relative">
                              <select value={entry.rejection_category}
                                onChange={(e) => updateEntry(mat.material_id, 'rejection_category', e.target.value)}
                                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 bg-white appearance-none cursor-pointer">
                                <option value="">Select reason...</option>
                                {REJECTION_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">Notes</label>
                            <textarea value={entry.rejection_notes}
                              onChange={(e) => updateEntry(mat.material_id, 'rejection_notes', e.target.value)}
                              placeholder="Describe the issue..." rows={2}
                              className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 resize-none" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Evidence Upload (optional) */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Evidence <span className="text-slate-300 font-normal ml-1">(optional)</span>
              </h3>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:border-blue-300 transition-colors group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_FILE_TYPES.join(',')} onChange={handleFileSelect} className="hidden" />
                <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-blue-50 flex items-center justify-center mx-auto transition-colors">
                  <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <p className="text-sm font-medium text-gray-600 mt-2">Upload photos or videos</p>
                <p className="text-[10px] text-gray-400 mt-0.5">JPEG, PNG, WebP, MP4, MOV — up to {MAX_IMAGE_SIZE_MB}MB each</p>
              </div>
              {uploadedFiles.length > 0 && (
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {uploadedFiles.map((uf) => (
                    <div key={uf.id} className={`relative group rounded-lg border overflow-hidden aspect-square ${uf.error ? 'border-red-300 bg-red-50' : uf.uploaded ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                      {uf.preview ? (
                        <img src={uf.preview} alt={uf.file.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 gap-1">
                          {getFileIcon(uf.file.type)}
                          <p className="text-[9px] text-gray-400 px-1 truncate max-w-full">{uf.file.name}</p>
                        </div>
                      )}
                      {uf.uploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Loader2 className="w-5 h-5 text-blue-600 animate-spin" /></div>}
                      {uf.uploaded && !uf.uploading && <div className="absolute top-1 right-1"><CheckCircle2 className="w-4 h-4 text-emerald-500 drop-shadow" /></div>}
                      {uf.error && <div className="absolute top-1 right-1" title={uf.error}><AlertTriangle className="w-4 h-4 text-red-500 drop-shadow" /></div>}
                      <button onClick={() => removeFile(uf.id)} className="absolute top-1 left-1 p-0.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70" aria-label={`Remove ${uf.file.name}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overall Rejection Category */}
            {hasAnyRejection && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Overall Rejection Category</h3>
                <div className="relative max-w-sm">
                  <select value={overallRejectionCategory} onChange={(e) => setOverallRejectionCategory(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white appearance-none cursor-pointer">
                    <option value="">Select overall category (optional)</option>
                    {REJECTION_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Notes <span className="text-slate-300 font-normal ml-1">(optional)</span>
              </h3>
              <textarea value={overallNotes} onChange={(e) => setOverallNotes(e.target.value)}
                placeholder="Overall observations, instructions, or comments..." rows={3}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-300" />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/70">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm">
                {overallStatus === 'fully_approved' ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" /> All materials will be approved</span>
                ) : overallStatus === 'fully_rejected' ? (
                  <span className="flex items-center gap-1.5 text-red-600 font-medium"><XCircle className="w-4 h-4" /> All materials will be rejected</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-600 font-medium"><AlertTriangle className="w-4 h-4" /> Partial: {totalAccepted} accepted, {totalRejected} rejected</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleBackToDeliveries} disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors">
                  Back
                </button>
                <button onClick={handleApproveAll} disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                  Approve All
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className={`inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-lg focus:ring-2 focus:ring-offset-2 disabled:opacity-50 transition-colors shadow-sm ${
                    overallStatus === 'fully_rejected'
                      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                      : 'bg-blue-700 hover:bg-blue-800 focus:ring-blue-500'
                  }`}>
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                  ) : overallStatus === 'fully_rejected' ? (
                    <><XCircle className="w-4 h-4" /> Submit Rejection</>
                  ) : (
                    <><Package className="w-4 h-4" /> Submit &amp; Stock In</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VendorDeliveryStockInForm;
