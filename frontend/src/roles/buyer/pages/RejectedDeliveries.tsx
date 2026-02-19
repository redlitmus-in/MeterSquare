import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Package,
  AlertTriangle,
  X,
  Calendar,
  ArrowLeftRight,
  DollarSign,
  RefreshCw,
  UserX,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  ExternalLink,
  Camera,
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
import { formatDate, formatCurrency } from '@/utils/formatters';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import EvidenceLightbox from '@/components/ui/EvidenceLightbox';
import {
  vendorInspectionService,
  VendorDeliveryInspection,
  MaterialInspectionItem,
  CreateReturnRequestData,
} from '@/services/vendorInspectionService';
import { vendorService, MatchingVendor } from '@/services/vendorService';
import { PAGINATION } from '@/lib/constants';

// ============================================================================
// Types
// ============================================================================

type ResolutionType = 'refund' | 'replacement' | 'new_vendor';

interface ResolutionOption {
  value: ResolutionType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const RESOLUTION_OPTIONS: ResolutionOption[] = [
  {
    value: 'refund',
    label: 'Refund',
    description: 'Request a full refund from the vendor for rejected materials',
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    value: 'replacement',
    label: 'Replacement',
    description: 'Request the vendor to replace rejected materials with new ones',
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    value: 'new_vendor',
    label: 'New Vendor',
    description: 'Select a different vendor to supply the rejected materials',
    icon: <UserX className="w-5 h-5" />,
  },
];

// ============================================================================
// Status Badge Helper
// ============================================================================

const getInspectionStatusBadge = (status: string): React.ReactNode => {
  const config: Record<string, { className: string; label: string }> = {
    fully_rejected: {
      className: 'bg-red-100 text-red-800 border-red-200',
      label: 'Fully Rejected',
    },
    partially_approved: {
      className: 'bg-amber-100 text-amber-800 border-amber-200',
      label: 'Partially Approved',
    },
    fully_approved: {
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'Fully Approved',
    },
    pending: {
      className: 'bg-gray-100 text-gray-800 border-gray-200',
      label: 'Pending',
    },
  };
  const c = config[status] || config.pending;
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
};

// ============================================================================
// Create Return Request Modal
// ============================================================================

interface CreateReturnRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  inspection: VendorDeliveryInspection;
  onSuccess: () => void;
}

const CreateReturnRequestModal: React.FC<CreateReturnRequestModalProps> = ({
  isOpen,
  onClose,
  inspection,
  onSuccess,
}) => {
  const [resolutionType, setResolutionType] = useState<ResolutionType>('refund');
  const [slaDeadline, setSlaDeadline] = useState('');
  const [slaNotes, setSlaNotes] = useState('');
  const [buyerNotes, setBuyerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // New vendor selection state
  const [vendors, setVendors] = useState<MatchingVendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [expandedVendorId, setExpandedVendorId] = useState<number | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setResolutionType('refund');
      setSlaDeadline('');
      setSlaNotes('');
      setBuyerNotes('');
      setSelectedVendorId(null);
      setVendorSearch('');
      setExpandedVendorId(null);
    }
  }, [isOpen]);

  // Fetch vendors matching rejected materials when resolution type is new_vendor
  useEffect(() => {
    if (resolutionType === 'new_vendor') {
      const materialNames = (inspection.materials_inspection || [])
        .filter((m) => m.rejected_qty > 0)
        .map((m) => m.material_name)
        .filter(Boolean);
      if (materialNames.length === 0) return;
      setLoadingVendors(true);
      vendorService.getMatchingVendors(materialNames, inspection.vendor_id)
        .then((result) => setVendors(result || []))
        .catch(() => showError('Failed to load matching vendors'))
        .finally(() => setLoadingVendors(false));
    }
    if (resolutionType !== 'new_vendor') {
      setSelectedVendorId(null);
      setVendorSearch('');
      setVendors([]);
    }
  }, [resolutionType, inspection.materials_inspection, inspection.vendor_id]);

  const filteredVendors = useMemo(() => {
    // Exclude the original vendor that was rejected
    let list = vendors.filter((v) => v.vendor_id !== inspection.vendor_id);
    if (!vendorSearch) return list;
    const lower = vendorSearch.toLowerCase();
    return list.filter(
      (v) =>
        v.vendor_name.toLowerCase().includes(lower) ||
        (v.category || '').toLowerCase().includes(lower),
    );
  }, [vendors, vendorSearch, inspection.vendor_id]);

  // Filter to rejected materials only
  const rejectedMaterials = useMemo(() => {
    return (inspection.materials_inspection || []).filter(
      (m) => m.rejected_qty > 0,
    );
  }, [inspection.materials_inspection]);

  const handleSubmit = async () => {
    if (!resolutionType) {
      showError('Please select a resolution type');
      return;
    }
    if (resolutionType === 'new_vendor' && !selectedVendorId) {
      showError('Please select a new vendor');
      return;
    }
    if (rejectedMaterials.length === 0) {
      showError('No rejected materials found for this inspection');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateReturnRequestData = {
        inspection_id: inspection.id,
        resolution_type: resolutionType,
        rejected_materials: rejectedMaterials.map((m) => ({
          material_name: m.material_name,
          brand: m.brand,
          size: m.size,
          unit: m.unit,
          unit_price: m.unit_price || 0,
          rejected_qty: m.rejected_qty,
          rejection_category: m.rejection_category,
          rejection_notes: m.rejection_notes,
        })),
        sla_deadline: slaDeadline || undefined,
        sla_notes: slaNotes || undefined,
        buyer_notes: buyerNotes || undefined,
        ...(resolutionType === 'new_vendor' && selectedVendorId
          ? { new_vendor_id: selectedVendorId }
          : {}),
      };

      const result = await vendorInspectionService.createReturnRequest(payload);

      if (result.success) {
        showSuccess('Return request created successfully');
        onSuccess();
        onClose();
      } else {
        showError(result.message || 'Failed to create return request');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to create return request');
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
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Create Return Request
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {inspection.formatted_cr_id || `CR-${inspection.cr_id}`} &middot;{' '}
                {inspection.vendor_name || 'Unknown Vendor'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Rejected Materials Summary */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Rejected Materials ({rejectedMaterials.length})
                </h3>
                {rejectedMaterials.some((m) => m.unit_price) && (
                  <span className="text-sm font-semibold text-red-700">
                    Total: {formatCurrency(
                      rejectedMaterials.reduce(
                        (sum, m) => sum + (m.rejected_qty || 0) * (m.unit_price || 0),
                        0,
                      ),
                    )}
                  </span>
                )}
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-100/50">
                      <TableHead className="text-xs font-semibold text-red-800">
                        Material
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-red-800">
                        Qty Rejected
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-red-800">
                        Unit Price
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-red-800">
                        Total
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-red-800">
                        Reason
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rejectedMaterials.map((m, idx) => (
                      <TableRow key={idx} className="border-red-100">
                        <TableCell className="text-sm font-medium text-gray-900">
                          {m.material_name}
                          {m.brand && (
                            <span className="text-xs text-gray-500 ml-1">
                              ({m.brand})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-red-700 font-medium">
                          {m.rejected_qty} {m.unit}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {m.unit_price != null && m.unit_price > 0 ? formatCurrency(m.unit_price) : '—'}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-red-700">
                          {m.unit_price != null && m.unit_price > 0
                            ? formatCurrency(m.rejected_qty * m.unit_price)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {m.rejection_category || 'Not specified'}
                          {m.rejection_notes && (
                            <span className="block text-xs text-gray-400 mt-0.5">
                              {m.rejection_notes}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Inspection Evidence */}
            {inspection.evidence_urls && inspection.evidence_urls.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  <Camera className="w-4 h-4 inline mr-1" />
                  Inspection Evidence ({inspection.evidence_urls.length})
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {inspection.evidence_urls.map((ev: any, i: number) => {
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
              </div>
            )}
            <EvidenceLightbox
              evidence={inspection.evidence_urls || []}
              isOpen={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              initialIndex={lightboxIndex}
            />

            {/* Resolution Type */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Resolution Type <span className="text-red-500">*</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {RESOLUTION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setResolutionType(option.value)}
                    className={`relative flex flex-col items-center p-4 rounded-lg border-2 transition-all text-center ${
                      resolutionType === option.value
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-full mb-2 ${
                        resolutionType === option.value
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {option.icon}
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        resolutionType === option.value
                          ? 'text-blue-700'
                          : 'text-gray-800'
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="text-xs text-gray-500 mt-1 leading-tight">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* New Vendor Selection (shown only when new_vendor is selected) */}
            {resolutionType === 'new_vendor' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">
                    Select New Vendor <span className="text-red-500">*</span>
                  </h3>
                  {filteredVendors.length > 0 && (
                    <span className="text-xs text-gray-400">{filteredVendors.length} matching vendors</span>
                  )}
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search vendors by name or category..."
                    value={vendorSearch}
                    onChange={(e) => setVendorSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {loadingVendors ? (
                  <div className="flex justify-center py-6">
                    <ModernLoadingSpinners size="md" />
                  </div>
                ) : filteredVendors.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">
                    No vendors found with matching materials
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {filteredVendors.map((vendor) => {
                      const isSelected = selectedVendorId === vendor.vendor_id;
                      const isExpanded = expandedVendorId === vendor.vendor_id;
                      return (
                        <div key={vendor.vendor_id}>
                          <div
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-indigo-50'
                                : 'bg-white hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedVendorId(vendor.vendor_id!)}
                          >
                            {/* Radio indicator */}
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>

                            {/* Vendor info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-medium truncate ${
                                  isSelected ? 'text-indigo-700' : 'text-gray-900'
                                }`}>
                                  {vendor.vendor_name}
                                </p>
                                {vendor.matching_products_count > 0 && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                                    {vendor.matching_products_count} match{vendor.matching_products_count !== 1 ? 'es' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {vendor.category && (
                                  <span className="text-xs text-gray-500 truncate">{vendor.category}</span>
                                )}
                                {vendor.city && (
                                  <span className="text-xs text-gray-400 truncate">{vendor.city}</span>
                                )}
                              </div>
                            </div>

                            {/* View details button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedVendorId(isExpanded ? null : vendor.vendor_id!);
                              }}
                              className="p-1.5 rounded-md hover:bg-gray-200 transition-colors flex-shrink-0"
                              title="View vendor details"
                            >
                              <Eye className={`w-3.5 h-3.5 ${isExpanded ? 'text-indigo-600' : 'text-gray-400'}`} />
                            </button>
                          </div>

                          {/* Expanded vendor details */}
                          {isExpanded && (
                            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-3">
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                {vendor.contact_person_name && (
                                  <div>
                                    <span className="text-gray-400">Contact</span>
                                    <p className="text-gray-700 font-medium">{vendor.contact_person_name}</p>
                                  </div>
                                )}
                                {vendor.email && (
                                  <div>
                                    <span className="text-gray-400">Email</span>
                                    <p className="text-gray-700 font-medium truncate">{vendor.email}</p>
                                  </div>
                                )}
                                {vendor.phone && (
                                  <div>
                                    <span className="text-gray-400">Phone</span>
                                    <p className="text-gray-700 font-medium">{vendor.phone_code || ''}{vendor.phone}</p>
                                  </div>
                                )}
                                {vendor.city && (
                                  <div>
                                    <span className="text-gray-400">Location</span>
                                    <p className="text-gray-700 font-medium">
                                      {[vendor.city, vendor.state, vendor.country].filter(Boolean).join(', ')}
                                    </p>
                                  </div>
                                )}
                                {vendor.gst_number && (
                                  <div>
                                    <span className="text-gray-400">GST / TRN</span>
                                    <p className="text-gray-700 font-medium">{vendor.gst_number}</p>
                                  </div>
                                )}
                                {vendor.category && (
                                  <div>
                                    <span className="text-gray-400">Category</span>
                                    <p className="text-gray-700 font-medium">{vendor.category}</p>
                                  </div>
                                )}
                              </div>

                              {/* Matching Products with Prices */}
                              {vendor.matching_products && vendor.matching_products.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                    Matching Materials ({vendor.matching_products.length})
                                  </p>
                                  <div className="space-y-1">
                                    {vendor.matching_products.map((product) => (
                                      <div
                                        key={product.product_id}
                                        className="flex items-center justify-between bg-white rounded-md px-2.5 py-1.5 border border-gray-200"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-gray-800 truncate">{product.product_name}</p>
                                          {product.unit && (
                                            <span className="text-[10px] text-gray-400">per {product.unit}</span>
                                          )}
                                        </div>
                                        {product.unit_price != null && product.unit_price > 0 && (
                                          <span className="text-xs font-semibold text-green-700 ml-2 whitespace-nowrap">
                                            AED {product.unit_price.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
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
            )}

            {/* SLA Deadline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  SLA Deadline (optional)
                </label>
                <Input
                  type="date"
                  value={slaDeadline}
                  onChange={(e) => setSlaDeadline(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  SLA Notes (optional)
                </label>
                <Input
                  type="text"
                  value={slaNotes}
                  onChange={(e) => setSlaNotes(e.target.value)}
                  placeholder="e.g., Urgent replacement needed"
                  className="w-full"
                />
              </div>
            </div>

            {/* Buyer Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Notes (optional)
              </label>
              <textarea
                value={buyerNotes}
                onChange={(e) => setBuyerNotes(e.target.value)}
                placeholder="Add any additional notes or context for the return request..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || rejectedMaterials.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <ModernLoadingSpinners size="xxs" />
                  <span className="ml-1">Submitting...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Return Request
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
// Main Page Component
// ============================================================================

const RejectedDeliveries: React.FC = () => {
  const [inspections, setInspections] = useState<VendorDeliveryInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInspection, setSelectedInspection] =
    useState<VendorDeliveryInspection | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchRejectedDeliveries();
  }, []);

  const fetchRejectedDeliveries = async () => {
    setLoading(true);
    try {
      const result = await vendorInspectionService.getRejectedDeliveries();
      if (result.success) {
        setInspections(result.data || []);
      } else {
        showError('Failed to load rejected deliveries');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load rejected deliveries');
    } finally {
      setLoading(false);
    }
  };

  // Derived data
  const filteredInspections = useMemo(() => {
    if (!searchTerm) return inspections;
    const lower = searchTerm.toLowerCase();
    return inspections.filter((insp) => {
      const crLabel = insp.formatted_cr_id || `CR-${insp.cr_id}`;
      const vendorName = insp.vendor_name || '';
      return (
        crLabel.toLowerCase().includes(lower) ||
        vendorName.toLowerCase().includes(lower)
      );
    });
  }, [inspections, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(
    filteredInspections.length / PAGINATION.DEFAULT_PAGE_SIZE,
  );
  const paginatedInspections = useMemo(() => {
    const start = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return filteredInspections.slice(start, start + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [filteredInspections, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const getRejectedSummary = (
    materials: MaterialInspectionItem[],
  ): { count: number; totalQty: number } => {
    const rejected = (materials || []).filter((m) => m.rejected_qty > 0);
    return {
      count: rejected.length,
      totalQty: rejected.reduce((sum, m) => sum + m.rejected_qty, 0),
    };
  };

  const handleCreateReturn = (inspection: VendorDeliveryInspection) => {
    setSelectedInspection(inspection);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedInspection(null);
  };

  const handleReturnCreated = () => {
    fetchRejectedDeliveries();
  };

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <ModernLoadingSpinners size="lg" />
          <p className="text-sm text-gray-500 mt-4">
            Loading rejected deliveries...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rejected Deliveries</h1>
        <p className="text-sm text-gray-500 mt-1">
          View deliveries where materials were rejected during inspection and
          create return requests for resolution.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {inspections.length}
              </p>
              <p className="text-xs text-gray-500">Rejected Inspections</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Package className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {inspections.filter(
                  (i) => !i.has_return_request,
                ).length}
              </p>
              <p className="text-xs text-gray-500">Awaiting Return Request</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {inspections.filter(
                  (i) => i.has_return_request,
                ).length}
              </p>
              <p className="text-xs text-gray-500">Return Requests Created</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by CR ID or vendor name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={fetchRejectedDeliveries}
          className="shrink-0"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Table */}
      {paginatedInspections.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-600">
            No rejected deliveries found
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {searchTerm
              ? 'Try adjusting your search terms.'
              : 'All inspections have been resolved or no rejections recorded.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">CR ID</TableHead>
                <TableHead className="font-semibold">Vendor</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">
                  Rejected Materials
                </TableHead>
                <TableHead className="font-semibold text-right">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedInspections.map((insp) => {
                const summary = getRejectedSummary(insp.materials_inspection);
                const hasReturn = insp.has_return_request;

                return (
                  <TableRow key={insp.id} className="group">
                    <TableCell>
                      <span className="font-semibold text-gray-900">
                        {insp.formatted_cr_id || `CR-${insp.cr_id}`}
                      </span>
                      {insp.formatted_po_id && (
                        <span className="block text-xs text-gray-400">
                          {insp.formatted_po_id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-700">
                        {insp.vendor_name || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getInspectionStatusBadge(insp.inspection_status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(insp.inspected_at || insp.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium text-red-700">
                          {summary.count} material{summary.count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-gray-400 ml-1">
                          ({summary.totalQty} units)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {hasReturn ? (
                        <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                          <Eye className="w-3 h-3 mr-1" />
                          {insp.return_request_status || 'Created'}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleCreateReturn(insp)}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Create Return Request
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                Showing{' '}
                {(currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE + 1}
                {' '}-{' '}
                {Math.min(
                  currentPage * PAGINATION.DEFAULT_PAGE_SIZE,
                  filteredInspections.length,
                )}{' '}
                of {filteredInspections.length}
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

      {/* Create Return Request Modal */}
      {selectedInspection && (
        <CreateReturnRequestModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          inspection={selectedInspection}
          onSuccess={handleReturnCreated}
        />
      )}
    </div>
  );
};

export default RejectedDeliveries;
