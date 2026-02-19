import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Package,
  X,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  RefreshCw,
  UserX,
  Truck,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeftRight,
  CreditCard,
  Users,
  ExternalLink,
  Camera,
  Eye,
  Upload,
  FileText,
  Trash2,
  Edit3,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { showSuccess, showError } from '@/utils/toastHelper';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import EvidenceLightbox from '@/components/ui/EvidenceLightbox';
import {
  vendorInspectionService,
  VendorReturnRequest,
} from '@/services/vendorInspectionService';
import { vendorService, Vendor } from '@/services/vendorService';
import { PAGINATION } from '@/lib/constants';
import InspectionTimelineView from '../components/InspectionTimelineView';

// ============================================================================
// Constants
// ============================================================================

type FilterTab =
  | 'all'
  | 'pending_td_approval'
  | 'td_approved'
  | 'in_progress'
  | 'completed'
  | 'rejected';

interface TabConfig {
  key: FilterTab;
  label: string;
  icon: React.ReactNode;
}

const FILTER_TABS: TabConfig[] = [
  { key: 'all', label: 'All', icon: <Package className="w-4 h-4" /> },
  {
    key: 'pending_td_approval',
    label: 'Pending Approval',
    icon: <Clock className="w-4 h-4" />,
  },
  {
    key: 'td_approved',
    label: 'TD Approved',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    icon: <Truck className="w-4 h-4" />,
  },
  {
    key: 'completed',
    label: 'Completed',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  {
    key: 'rejected',
    label: 'Rejected',
    icon: <XCircle className="w-4 h-4" />,
  },
];

// ============================================================================
// Status helpers
// ============================================================================

const getStatusBadge = (status: string): React.ReactNode => {
  const config: Record<string, { className: string; label: string }> = {
    pending_td_approval: {
      className: 'bg-amber-100 text-amber-800 border-amber-200',
      label: 'Pending TD Approval',
    },
    td_approved: {
      className: 'bg-blue-100 text-blue-800 border-blue-200',
      label: 'TD Approved',
    },
    td_rejected: {
      className: 'bg-red-100 text-red-800 border-red-200',
      label: 'TD Rejected',
    },
    return_in_progress: {
      className: 'bg-purple-100 text-purple-800 border-purple-200',
      label: 'Return In Progress',
    },
    return_initiated: {
      className: 'bg-purple-100 text-purple-800 border-purple-200',
      label: 'Return Initiated',
    },
    refund_confirmed: {
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'Refund Confirmed',
    },
    replacement_pending: {
      className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      label: 'Awaiting PM Inspection',
    },
    replacement_ordered: {
      className: 'bg-teal-100 text-teal-800 border-teal-200',
      label: 'Replacement Ordered',
    },
    new_vendor_pending: {
      className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      label: 'Vendor Pending TD Approval',
    },
    new_vendor_selected: {
      className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      label: 'New Vendor Selected',
    },
    new_vendor_approved: {
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'New Vendor Approved',
    },
    completed: {
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'Completed',
    },
    closed: {
      className: 'bg-gray-100 text-gray-800 border-gray-200',
      label: 'Closed',
    },
  };
  const c = config[status] || {
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    label: status?.replace(/_/g, ' ') || 'Unknown',
  };
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
};

const getResolutionBadge = (type: string): React.ReactNode => {
  const config: Record<
    string,
    { className: string; label: string; icon: React.ReactNode }
  > = {
    refund: {
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      label: 'Refund',
      icon: <DollarSign className="w-3 h-3 mr-1" />,
    },
    replacement: {
      className: 'bg-sky-100 text-sky-800 border-sky-200',
      label: 'Replacement',
      icon: <RefreshCw className="w-3 h-3 mr-1" />,
    },
    new_vendor: {
      className: 'bg-violet-100 text-violet-800 border-violet-200',
      label: 'New Vendor',
      icon: <UserX className="w-3 h-3 mr-1" />,
    },
  };
  const c = config[type] || {
    className: 'bg-gray-100 text-gray-800',
    label: type,
    icon: null,
  };
  return (
    <Badge variant="outline" className={c.className}>
      {c.icon}
      {c.label}
    </Badge>
  );
};

// ============================================================================
// Status filter matching
// ============================================================================

const matchesFilter = (vrr: VendorReturnRequest, filter: FilterTab): boolean => {
  if (filter === 'all') return true;
  const s = vrr.status;
  switch (filter) {
    case 'pending_td_approval':
      return s === 'pending_td_approval';
    case 'td_approved':
      return s === 'td_approved';
    case 'in_progress':
      return [
        'return_in_progress',
        'return_initiated',
        'replacement_pending',
        'replacement_ordered',
        'new_vendor_pending',
        'new_vendor_selected',
        'new_vendor_approved',
      ].includes(s);
    case 'completed':
      return ['completed', 'closed', 'refund_confirmed'].includes(s);
    case 'rejected':
      return s === 'td_rejected';
    default:
      return true;
  }
};

// ============================================================================
// Select New Vendor Modal
// ============================================================================

interface SelectNewVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnRequestId: number;
  onSuccess: () => void;
}

const SelectNewVendorModal: React.FC<SelectNewVendorModalProps> = ({
  isOpen,
  onClose,
  returnRequestId,
  onSuccess,
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchVendors();
    }
  }, [isOpen]);

  const fetchVendors = async () => {
    setLoadingVendors(true);
    try {
      const result = await vendorService.getAllVendors({ per_page: 100 });
      setVendors(result.data || []);
    } catch (error: any) {
      showError(error.message || 'Failed to load vendors');
    } finally {
      setLoadingVendors(false);
    }
  };

  const filteredVendors = useMemo(() => {
    if (!vendorSearch) return vendors;
    const lower = vendorSearch.toLowerCase();
    return vendors.filter(
      (v) =>
        v.vendor_name.toLowerCase().includes(lower) ||
        (v.category || '').toLowerCase().includes(lower),
    );
  }, [vendors, vendorSearch]);

  const handleSubmit = async () => {
    if (!selectedVendorId) {
      showError('Please select a vendor');
      return;
    }
    setSubmitting(true);
    try {
      const result = await vendorInspectionService.selectNewVendor(
        returnRequestId,
        selectedVendorId,
      );
      if (result.success) {
        showSuccess('New vendor selected successfully');
        onSuccess();
        onClose();
      } else {
        showError(result.message || 'Failed to select vendor');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to select vendor');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Select New Vendor
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search vendors..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {loadingVendors ? (
              <div className="flex justify-center py-8">
                <ModernLoadingSpinners size="md" />
              </div>
            ) : filteredVendors.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No vendors found
              </p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {filteredVendors.map((vendor) => (
                  <button
                    key={vendor.vendor_id}
                    type="button"
                    onClick={() => setSelectedVendorId(vendor.vendor_id!)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedVendorId === vendor.vendor_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-medium text-sm text-gray-900">
                      {vendor.vendor_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {vendor.category || 'No category'} &middot; {vendor.email}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedVendorId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <ModernLoadingSpinners size="xxs" />
                  <span className="ml-1">Selecting...</span>
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Select Vendor
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ============================================================================
// Confirm Refund Modal
// ============================================================================

interface UploadedEvidence {
  url: string;
  file_name: string;
  file_type: string;
}

interface ConfirmRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnRequestId: number;
  onSuccess: () => void;
}

const ConfirmRefundModal: React.FC<ConfirmRefundModalProps> = ({
  isOpen,
  onClose,
  returnRequestId,
  onSuccess,
}) => {
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedEvidence[]>([]);
  const [uploading, setUploading] = useState(false);

  // Reset state when modal closes to prevent stale data on re-open
  useEffect(() => {
    if (!isOpen) {
      setCreditNoteNumber('');
      setCreditNoteAmount('');
      setUploadedFiles([]);
    }
  }, [isOpen]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await vendorInspectionService.uploadReturnEvidence(
          file,
          returnRequestId,
        );
        if (result.success && result.data) {
          setUploadedFiles((prev) => [
            ...prev,
            {
              url: result.data!.url,
              file_name: result.data!.file_name,
              file_type: result.data!.file_type,
            },
          ]);
        } else {
          showError(`Failed to upload ${file.name}`);
        }
      }
    } catch (error: any) {
      showError(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await vendorInspectionService.confirmRefundReceived(
        returnRequestId,
        {
          credit_note_number: creditNoteNumber || undefined,
          credit_note_amount: creditNoteAmount
            ? parseFloat(creditNoteAmount)
            : undefined,
          refund_evidence: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        },
      );
      if (result.success) {
        showSuccess('Refund confirmed successfully');
        onSuccess();
        onClose();
        setCreditNoteNumber('');
        setCreditNoteAmount('');
        setUploadedFiles([]);
      } else {
        showError(result.message || 'Failed to confirm refund');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to confirm refund');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Confirm Refund Received
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Credit Note Number
              </label>
              <Input
                type="text"
                value={creditNoteNumber}
                onChange={(e) => setCreditNoteNumber(e.target.value)}
                placeholder="e.g., CN-2026-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Credit Note Amount (AED)
              </label>
              <Input
                type="number"
                value={creditNoteAmount}
                onChange={(e) => setCreditNoteAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Upload Proof (Credit Note, Receipt, etc.)
              </label>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                {uploading ? (
                  <>
                    <ModernLoadingSpinners size="xxs" />
                    <span className="text-sm text-gray-500">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">
                      Click to upload files
                    </span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading || submitting}
                />
              </label>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {uploadedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg"
                    >
                      {file.file_type?.startsWith('image') ? (
                        <Camera className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-green-600 shrink-0" />
                      )}
                      <span className="text-xs text-green-800 truncate flex-1">
                        {file.file_name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="p-0.5 hover:bg-red-100 rounded text-red-500"
                        aria-label="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || uploading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? (
                <>
                  <ModernLoadingSpinners size="xxs" />
                  <span className="ml-1">Confirming...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Confirm Refund
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ============================================================================
// Confirm Replacement Modal
// ============================================================================

interface ConfirmReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnRequestId: number;
  onSuccess: () => void;
}

const ConfirmReplacementModal: React.FC<ConfirmReplacementModalProps> = ({
  isOpen,
  onClose,
  returnRequestId,
  onSuccess,
}) => {
  const [vendorReference, setVendorReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedEvidence[]>([]);
  const [uploading, setUploading] = useState(false);

  // Reset form state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setVendorReference('');
      setUploadedFiles([]);
    }
  }, [isOpen]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await vendorInspectionService.uploadReturnEvidence(
          file,
          returnRequestId,
        );
        if (result.success && result.data) {
          setUploadedFiles((prev) => [
            ...prev,
            {
              url: result.data!.url,
              file_name: result.data!.file_name,
              file_type: result.data!.file_type,
            },
          ]);
        } else {
          showError(`Failed to upload ${file.name}`);
        }
      }
    } catch (error: any) {
      showError(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await vendorInspectionService.confirmReplacementReceived(
        returnRequestId,
        {
          vendor_return_reference: vendorReference || undefined,
          replacement_evidence: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        },
      );
      if (result.success) {
        showSuccess('Replacement materials sent for PM inspection');
        onSuccess();
        onClose();
        setVendorReference('');
        setUploadedFiles([]);
      } else {
        showError(result.message || 'Failed to confirm replacement');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to confirm replacement');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Confirm Replacement at Store
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Vendor Delivery Reference (Optional)
              </label>
              <Input
                type="text"
                value={vendorReference}
                onChange={(e) => setVendorReference(e.target.value)}
                placeholder="e.g., DN-2026-045 or vendor invoice #"
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Upload Proof <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <label className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                {uploading ? (
                  <>
                    <ModernLoadingSpinners size="xxs" />
                    <span className="text-sm text-gray-500">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">
                      Click to upload files
                    </span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading || submitting}
                />
              </label>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {uploadedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg"
                    >
                      {file.file_type?.startsWith('image') ? (
                        <Camera className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-green-600 shrink-0" />
                      )}
                      <span className="text-xs text-green-800 truncate flex-1">
                        {file.file_name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="p-0.5 hover:bg-red-100 rounded text-red-500"
                        aria-label="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || uploading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <ModernLoadingSpinners size="xxs" />
                  <span className="ml-1">Confirming...</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4" />
                  Confirm &amp; Send to Inspection
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ============================================================================
// Edit & Resubmit Modal (for TD-rejected requests)
// ============================================================================

type ResolutionType = 'refund' | 'replacement' | 'new_vendor';

const RESOLUTION_OPTIONS: Array<{ value: ResolutionType; label: string; description: string; icon: React.ReactNode }> = [
  { value: 'refund', label: 'Refund', description: 'Request a full refund from the vendor', icon: <DollarSign className="w-5 h-5" /> },
  { value: 'replacement', label: 'Replacement', description: 'Request the vendor to replace materials', icon: <RefreshCw className="w-5 h-5" /> },
  { value: 'new_vendor', label: 'New Vendor', description: 'Select a different vendor to supply materials', icon: <UserX className="w-5 h-5" /> },
];

interface EditResubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  vrr: VendorReturnRequest;
  onSuccess: () => void;
}

const EditResubmitModal: React.FC<EditResubmitModalProps> = ({ isOpen, onClose, vrr, onSuccess }) => {
  const [resolutionType, setResolutionType] = useState<ResolutionType>(vrr.resolution_type);
  const [slaDeadline, setSlaDeadline] = useState(vrr.sla_deadline ? vrr.sla_deadline.split('T')[0] : '');
  const [slaNotes, setSlaNotes] = useState(vrr.sla_notes || '');
  const [buyerNotes, setBuyerNotes] = useState(vrr.buyer_notes || '');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setResolutionType(vrr.resolution_type);
      setSlaDeadline(vrr.sla_deadline ? vrr.sla_deadline.split('T')[0] : '');
      setSlaNotes(vrr.sla_notes || '');
      setBuyerNotes(vrr.buyer_notes || '');
    }
  }, [isOpen, vrr]);

  const handleResubmit = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        resolution_type: resolutionType,
        buyer_notes: buyerNotes,
        sla_notes: slaNotes,
      };
      if (slaDeadline) payload.sla_deadline = slaDeadline;

      const result = await vendorInspectionService.updateReturnRequest(vrr.id, payload as any);
      if (result.success) {
        showSuccess(result.message || 'Return request resubmitted for TD approval');
        onClose();
        onSuccess();
      } else {
        showError(result.message || 'Failed to resubmit');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to resubmit return request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit & Resubmit</h2>
              <p className="text-xs text-gray-500 mt-0.5">{vrr.return_request_number}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* TD Rejection Reason */}
            {vrr.td_rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">TD Rejection Reason</p>
                <p className="text-sm text-red-800">{vrr.td_rejection_reason}</p>
              </div>
            )}

            {/* Resolution Type */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Resolution Type <span className="text-red-500">*</span></h3>
              <div className="grid grid-cols-3 gap-2">
                {RESOLUTION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setResolutionType(option.value)}
                    className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all text-center ${
                      resolutionType === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className={`p-1.5 rounded-full mb-1.5 ${
                      resolutionType === option.value ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {option.icon}
                    </div>
                    <span className={`text-xs font-semibold ${
                      resolutionType === option.value ? 'text-blue-700' : 'text-gray-700'
                    }`}>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* SLA */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SLA Deadline</label>
                <Input
                  type="date"
                  value={slaDeadline}
                  onChange={(e) => setSlaDeadline(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SLA Notes</label>
                <Input
                  type="text"
                  value={slaNotes}
                  onChange={(e) => setSlaNotes(e.target.value)}
                  placeholder="e.g., Urgent"
                />
              </div>
            </div>

            {/* Buyer Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={buyerNotes}
                onChange={(e) => setBuyerNotes(e.target.value)}
                placeholder="Add context for the resubmission..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              onClick={handleResubmit}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <><ModernLoadingSpinners size="xxs" /><span className="ml-1.5">Resubmitting...</span></>
              ) : (
                <><Send className="w-4 h-4 mr-1.5" />Resubmit for Approval</>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ============================================================================
// Return Request Detail Row (Expandable)
// ============================================================================

interface DetailRowProps {
  vrr: VendorReturnRequest;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}

const DetailRow: React.FC<DetailRowProps> = ({
  vrr,
  isExpanded,
  onToggle,
  onRefresh,
}) => {
  const [initiatingReturn, setInitiatingReturn] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [refundLightboxOpen, setRefundLightboxOpen] = useState(false);
  const [refundLightboxIndex, setRefundLightboxIndex] = useState(0);

  const handleInitiateReturn = async () => {
    setInitiatingReturn(true);
    try {
      const result = await vendorInspectionService.initiateVendorReturn(vrr.id);
      if (result.success) {
        showSuccess('Return initiated successfully');
        onRefresh();
      } else {
        showError(result.message || 'Failed to initiate return');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to initiate return');
    } finally {
      setInitiatingReturn(false);
    }
  };

  const canInitiateReturn =
    vrr.status === 'td_approved' &&
    (vrr.resolution_type === 'refund' || vrr.resolution_type === 'replacement');

  const canSelectNewVendor =
    vrr.status === 'td_approved' &&
    vrr.resolution_type === 'new_vendor' &&
    !vrr.new_vendor_id;

  const canConfirmRefund =
    (vrr.status === 'return_in_progress' || vrr.status === 'return_initiated') &&
    vrr.resolution_type === 'refund';

  const canConfirmReplacement =
    (vrr.status === 'return_in_progress' || vrr.status === 'returned_to_vendor') &&
    vrr.resolution_type === 'replacement';

  return (
    <>
      {/* Main row */}
      <TableRow
        className="cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
            <span className="font-semibold text-gray-900">
              {vrr.return_request_number || `VRR-${vrr.id}`}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <span className="text-sm text-gray-700">CR-{vrr.cr_id}</span>
        </TableCell>
        <TableCell>
          <span className="text-sm text-gray-700">
            {vrr.vendor_name || 'N/A'}
          </span>
        </TableCell>
        <TableCell>{getResolutionBadge(vrr.resolution_type)}</TableCell>
        <TableCell>{getStatusBadge(vrr.status)}</TableCell>
        <TableCell>
          <span className="text-sm font-medium text-gray-900">
            {formatCurrency(vrr.total_rejected_value)}
          </span>
        </TableCell>
        <TableCell>
          <span className="text-sm text-gray-500">
            {formatDate(vrr.created_at)}
          </span>
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-gray-50/50 p-0">
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-6 space-y-5"
            >
              {/* Detail Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Buyer Notes
                  </p>
                  <p className="text-sm text-gray-800">
                    {vrr.buyer_notes || 'No notes provided'}
                  </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    SLA Deadline
                  </p>
                  <p className="text-sm text-gray-800">
                    {vrr.sla_deadline
                      ? formatDate(vrr.sla_deadline)
                      : 'Not set'}
                  </p>
                  {vrr.sla_notes && (
                    <p className="text-xs text-gray-500 mt-1">{vrr.sla_notes}</p>
                  )}
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    TD Approval
                  </p>
                  {vrr.td_approved_by_name ? (
                    <div>
                      <p className="text-sm text-green-700 font-medium">
                        Approved by {vrr.td_approved_by_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(vrr.td_approval_date)}
                      </p>
                    </div>
                  ) : vrr.td_rejection_reason ? (
                    <div>
                      <p className="text-sm text-red-700 font-medium">Rejected</p>
                      <p className="text-xs text-gray-500">
                        {vrr.td_rejection_reason}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600">Awaiting approval</p>
                  )}
                </div>
              </div>

              {/* Rejected Materials */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Rejected Materials
                </h4>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs">Material</TableHead>
                        <TableHead className="text-xs">Qty</TableHead>
                        <TableHead className="text-xs">Unit Price</TableHead>
                        <TableHead className="text-xs">Total</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(vrr.rejected_materials || []).map((m, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm font-medium">
                            {m.material_name}
                            {m.brand && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({m.brand})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-red-700">
                            {m.rejected_qty} {m.unit}
                          </TableCell>
                          <TableCell className="text-sm text-gray-700">
                            {m.unit_price ? formatCurrency(m.unit_price) : '—'}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-red-700">
                            {m.unit_price
                              ? formatCurrency(m.rejected_qty * m.unit_price)
                              : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {m.rejection_category || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Inspection Evidence */}
              {vrr.inspection_evidence && vrr.inspection_evidence.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    <Camera className="w-4 h-4 inline mr-1" />
                    Inspection Evidence ({vrr.inspection_evidence.length})
                  </h4>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {vrr.inspection_evidence.map((ev: any, i: number) => {
                      const isVideo = ev.file_type?.startsWith('video') || /\.(mp4|mov|webm)$/i.test(ev.file_name || '');
                      const label = ev.file_name
                        ? ev.file_name.length > 18 ? ev.file_name.slice(0, 15) + '…' : ev.file_name
                        : `Evidence ${i + 1}`;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                          title={`View ${ev.file_name || 'evidence'}`}
                          className="flex-shrink-0 flex flex-col items-center justify-between w-24 h-24 border border-gray-200 rounded-xl bg-white hover:border-blue-400 hover:shadow-md transition-all group p-2 gap-1"
                        >
                          <div className={`flex-1 flex items-center justify-center w-full rounded-lg ${isVideo ? 'bg-gray-900' : 'bg-blue-50'}`}>
                            {isVideo ? (
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/>
                              </svg>
                            ) : (
                              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 12V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75V17.25A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25V12z"/>
                              </svg>
                            )}
                          </div>
                          <div className="w-full flex items-center justify-between gap-1">
                            <span className="text-[10px] text-gray-500 truncate leading-tight">{label}</span>
                            <Eye className="w-3 h-3 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <EvidenceLightbox
                    evidence={vrr.inspection_evidence}
                    isOpen={lightboxOpen}
                    onClose={() => setLightboxOpen(false)}
                    initialIndex={lightboxIndex}
                  />
                </div>
              )}

              {/* Credit Note Info (if completed) */}
              {vrr.credit_note_number && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">
                    Credit Note Information
                  </h4>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-green-600">Number:</span>{' '}
                      <span className="font-medium">{vrr.credit_note_number}</span>
                    </div>
                    {vrr.credit_note_amount != null && (
                      <div>
                        <span className="text-green-600">Amount:</span>{' '}
                        <span className="font-medium">
                          {formatCurrency(vrr.credit_note_amount)}
                        </span>
                      </div>
                    )}
                    {vrr.credit_note_date && (
                      <div>
                        <span className="text-green-600">Date:</span>{' '}
                        <span className="font-medium">
                          {formatDate(vrr.credit_note_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Replacement Status Info */}
              {vrr.resolution_type === 'replacement' && vrr.status === 'replacement_pending' && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-cyan-800 mb-2">
                    Replacement Delivery — Awaiting PM Inspection
                  </h4>
                  <p className="text-sm text-cyan-700">
                    Replacement materials have been delivered to M2 Store. The Production Manager will inspect them before stock-in.
                  </p>
                  {vrr.vendor_return_reference && (
                    <p className="text-sm text-cyan-600 mt-1">
                      Reference: <span className="font-medium">{vrr.vendor_return_reference}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Replacement Confirmation Info (if completed replacement) */}
              {vrr.resolution_type === 'replacement' && vrr.status === 'completed' && vrr.return_confirmed_at && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">
                    Replacement Completed
                  </h4>
                  <div className="flex gap-6 text-sm">
                    {vrr.vendor_return_reference && (
                      <div>
                        <span className="text-blue-600">Reference:</span>{' '}
                        <span className="font-medium">{vrr.vendor_return_reference}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-blue-600">Inspection Completed:</span>{' '}
                      <span className="font-medium">
                        {formatDateTime(vrr.return_confirmed_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Refund Evidence (uploaded proof) */}
              {vrr.refund_evidence && vrr.refund_evidence.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    {vrr.resolution_type === 'replacement' ? 'Replacement Proof' : 'Refund Proof'} ({vrr.refund_evidence.length})
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {vrr.refund_evidence.map((ev: any, idx: number) => {
                      const isImage = ev.file_type?.startsWith('image');
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setRefundLightboxIndex(idx);
                            setRefundLightboxOpen(true);
                          }}
                          className="relative group w-20 h-20 rounded-lg border-2 border-gray-200 overflow-hidden hover:border-blue-400 transition-colors"
                          title={ev.file_name}
                        >
                          {isImage ? (
                            <img
                              src={ev.url}
                              alt={ev.file_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 p-1">
                              <FileText className="w-6 h-6 text-gray-400" />
                              <span className="text-[9px] text-gray-500 mt-0.5 truncate w-full text-center">
                                {ev.file_name?.split('.').pop()?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                            <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <EvidenceLightbox
                    evidence={vrr.refund_evidence}
                    isOpen={refundLightboxOpen}
                    onClose={() => setRefundLightboxOpen(false)}
                    initialIndex={refundLightboxIndex}
                  />
                </div>
              )}

              {/* New Vendor Info (if selected) */}
              {vrr.new_vendor_name && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-indigo-800 mb-2">
                    New Vendor
                  </h4>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium text-indigo-900">
                      {vrr.new_vendor_name}
                    </span>
                    {vrr.new_vendor_status && (
                      <Badge variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-200 text-xs">
                        {vrr.new_vendor_status.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline toggle */}
              <div>
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  {showTimeline ? 'Hide Timeline' : 'View Full Timeline'}
                </button>
                {showTimeline && (
                  <div className="mt-3">
                    <InspectionTimelineView crId={vrr.cr_id} />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                {vrr.status === 'td_rejected' && (
                  <Button
                    onClick={() => setShowEditModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit & Resubmit
                  </Button>
                )}
                {canInitiateReturn && (
                  <Button
                    onClick={handleInitiateReturn}
                    disabled={initiatingReturn}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {initiatingReturn ? (
                      <>
                        <ModernLoadingSpinners size="xxs" />
                        <span className="ml-1">Initiating...</span>
                      </>
                    ) : (
                      <>
                        <Truck className="w-4 h-4" />
                        Initiate Return to Vendor
                      </>
                    )}
                  </Button>
                )}
                {canSelectNewVendor && (
                  <Button
                    onClick={() => setShowVendorModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Users className="w-4 h-4" />
                    Select New Vendor
                  </Button>
                )}
                {canConfirmRefund && (
                  <Button
                    onClick={() => setShowRefundModal(true)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CreditCard className="w-4 h-4" />
                    Confirm Refund Received
                  </Button>
                )}
                {canConfirmReplacement && (
                  <Button
                    onClick={() => setShowReplacementModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    Confirm Replacement at Store
                  </Button>
                )}
              </div>
            </motion.div>
          </TableCell>
        </TableRow>
      )}

      {/* Modals */}
      <EditResubmitModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        vrr={vrr}
        onSuccess={onRefresh}
      />
      <SelectNewVendorModal
        isOpen={showVendorModal}
        onClose={() => setShowVendorModal(false)}
        returnRequestId={vrr.id}
        onSuccess={onRefresh}
      />
      <ConfirmRefundModal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        returnRequestId={vrr.id}
        onSuccess={onRefresh}
      />
      <ConfirmReplacementModal
        isOpen={showReplacementModal}
        onClose={() => setShowReplacementModal(false)}
        returnRequestId={vrr.id}
        onSuccess={onRefresh}
      />
    </>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

const VendorReturnRequests: React.FC = () => {
  const [returnRequests, setReturnRequests] = useState<VendorReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchReturnRequests();
  }, []);

  const fetchReturnRequests = async () => {
    setLoading(true);
    try {
      const result = await vendorInspectionService.getReturnRequests(1, 20);
      if (result.success) {
        setReturnRequests(result.data || []);
      } else {
        showError('Failed to load return requests');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load return requests');
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests = useMemo(() => {
    let results = returnRequests.filter((vrr) =>
      matchesFilter(vrr, activeFilter),
    );
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      results = results.filter((vrr) => {
        const num = vrr.return_request_number || '';
        const vendor = vrr.vendor_name || '';
        const crLabel = `CR-${vrr.cr_id}`;
        return (
          num.toLowerCase().includes(lower) ||
          vendor.toLowerCase().includes(lower) ||
          crLabel.toLowerCase().includes(lower)
        );
      });
    }
    return results;
  }, [returnRequests, activeFilter, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(
    filteredRequests.length / PAGINATION.DEFAULT_PAGE_SIZE,
  );
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredRequests.slice(start, start + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredRequests, currentPage]);

  // Reset pagination on filter/search change
  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [activeFilter, searchTerm]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: returnRequests.length,
      pending_td_approval: 0,
      td_approved: 0,
      in_progress: 0,
      completed: 0,
      rejected: 0,
    };
    returnRequests.forEach((vrr) => {
      (Object.keys(counts) as FilterTab[]).forEach((key) => {
        if (key !== 'all' && matchesFilter(vrr, key)) {
          counts[key]++;
        }
      });
    });
    return counts;
  }, [returnRequests]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <ModernLoadingSpinners size="lg" />
          <p className="text-sm text-gray-500 mt-4">
            Loading return requests...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Vendor Return Requests
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Track and manage return requests for rejected materials across all
          inspections.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span
              className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${
                activeFilter === tab.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tabCounts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search & Refresh */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by VRR number, CR ID, or vendor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={fetchReturnRequests} className="shrink-0">
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Table */}
      {paginatedRequests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-600">
            No return requests found
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {searchTerm || activeFilter !== 'all'
              ? 'Try adjusting your filters or search terms.'
              : 'Return requests will appear here once created from rejected deliveries.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">VRR Number</TableHead>
                <TableHead className="font-semibold">CR ID</TableHead>
                <TableHead className="font-semibold">Vendor</TableHead>
                <TableHead className="font-semibold">Resolution</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Total Value</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRequests.map((vrr) => (
                <DetailRow
                  key={vrr.id}
                  vrr={vrr}
                  isExpanded={expandedId === vrr.id}
                  onToggle={() =>
                    setExpandedId(expandedId === vrr.id ? null : vrr.id)
                  }
                  onRefresh={fetchReturnRequests}
                />
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                Showing{' '}
                {(currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE + 1} -{' '}
                {Math.min(
                  currentPage * PAGINATION.DEFAULT_PAGE_SIZE,
                  filteredRequests.length,
                )}{' '}
                of {filteredRequests.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600 px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VendorReturnRequests;
