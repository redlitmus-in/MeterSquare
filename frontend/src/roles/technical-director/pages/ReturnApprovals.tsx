import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  RefreshCw,
  UserX,
  Clock,
  CheckCircle,
  XCircle,
  Shield,
  Eye,
  Users,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Mail,
  Phone,
  MapPin,
  Building2,
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
import {
  vendorInspectionService,
  VendorReturnRequest,
  EvidenceFile,
} from '@/services/vendorInspectionService';
import { PAGINATION } from '@/lib/constants';

// ============================================================================
// Helpers
// ============================================================================

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

const getStatusBadge = (status: string): React.ReactNode => {
  const config: Record<string, { className: string; label: string }> = {
    pending_td_approval: {
      className: 'bg-amber-100 text-amber-800 border-amber-200',
      label: 'Pending Your Approval',
    },
    td_approved: {
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'Approved',
    },
    td_rejected: {
      className: 'bg-red-100 text-red-800 border-red-200',
      label: 'Rejected',
    },
    new_vendor_selected: {
      className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      label: 'New Vendor Pending Approval',
    },
    new_vendor_approved: {
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'New Vendor Approved',
    },
    new_vendor_pending: {
      className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      label: 'New Vendor Pending',
    },
    return_in_progress: {
      className: 'bg-blue-100 text-blue-800 border-blue-200',
      label: 'Return In Progress',
    },
    returned_to_vendor: {
      className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      label: 'Returned to Vendor',
    },
    replacement_pending: {
      className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      label: 'Awaiting PM Inspection',
    },
    completed: {
      className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      label: 'Completed',
    },
  };
  const c = config[status] || {
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    label: status?.replace(/_/g, ' ') || 'Unknown',
  };
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
};

// ============================================================================
// Evidence Lightbox
// ============================================================================

interface EvidenceLightboxProps {
  evidence: EvidenceFile[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

const EvidenceLightbox: React.FC<EvidenceLightboxProps> = ({
  evidence,
  isOpen,
  onClose,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  if (!isOpen || evidence.length === 0) return null;

  const current = evidence[currentIndex];
  const isImage = current?.file_type?.startsWith('image');
  const isVideo = current?.file_type?.startsWith('video');

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative max-w-4xl max-h-[85vh] w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300"
            aria-label="Close lightbox"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex items-center justify-center bg-black rounded-xl overflow-hidden">
            {isImage && (
              <img
                src={current.url}
                alt={current.file_name}
                className="max-h-[80vh] object-contain"
              />
            )}
            {isVideo && (
              <video
                src={current.url}
                controls
                className="max-h-[80vh]"
              />
            )}
            {!isImage && !isVideo && (
              <div className="p-12 text-center text-white">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-60" />
                <p className="text-lg">{current.file_name}</p>
                <a
                  href={current.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 mt-2 inline-block"
                >
                  Open file
                </a>
              </div>
            )}
          </div>

          {/* Navigation */}
          {evidence.length > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() =>
                  setCurrentIndex((i) =>
                    i === 0 ? evidence.length - 1 : i - 1,
                  )
                }
                className="p-2 text-white hover:text-gray-300"
                aria-label="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <span className="text-white text-sm">
                {currentIndex + 1} / {evidence.length}
              </span>
              <button
                onClick={() =>
                  setCurrentIndex((i) =>
                    i === evidence.length - 1 ? 0 : i + 1,
                  )
                }
                className="p-2 text-white hover:text-gray-300"
                aria-label="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ============================================================================
// Reject Return Modal
// ============================================================================

interface RejectReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnRequestId: number;
  vrrNumber: string;
  onSuccess: () => void;
}

const RejectReturnModal: React.FC<RejectReturnModalProps> = ({
  isOpen,
  onClose,
  returnRequestId,
  vrrNumber,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReject = async () => {
    if (!reason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }
    setSubmitting(true);
    try {
      const result = await vendorInspectionService.tdRejectReturn(
        returnRequestId,
        reason.trim(),
      );
      if (result.success) {
        showSuccess('Return request rejected');
        onSuccess();
        onClose();
        setReason('');
      } else {
        showError(result.message || 'Failed to reject return request');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to reject return request');
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
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Reject Return Request
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{vrrNumber}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide the reason for rejecting this return request..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={submitting || !reason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? (
                <>
                  <ModernLoadingSpinners size="xxs" />
                  <span className="ml-1">Rejecting...</span>
                </>
              ) : (
                <>
                  <ThumbsDown className="w-4 h-4" />
                  Reject Return Request
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
// Approval Detail Row
// ============================================================================

interface ApprovalDetailRowProps {
  vrr: VendorReturnRequest;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}

const ApprovalDetailRow: React.FC<ApprovalDetailRowProps> = ({
  vrr,
  isExpanded,
  onToggle,
  onRefresh,
}) => {
  const [approving, setApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showRefundLightbox, setShowRefundLightbox] = useState(false);
  const [refundLightboxIndex, setRefundLightboxIndex] = useState(0);
  const [approvingNewVendor, setApprovingNewVendor] = useState(false);
  const [vendorDetailsExpanded, setVendorDetailsExpanded] = useState(false);

  const evidence: EvidenceFile[] = vrr.inspection_evidence || [];
  const isPendingApproval = vrr.status === 'pending_td_approval';
  const isPendingNewVendorApproval = vrr.status === 'new_vendor_selected';

  const handleApprove = async () => {
    setApproving(true);
    try {
      const result = await vendorInspectionService.tdApproveReturn(vrr.id);
      if (result.success) {
        showSuccess('Return request approved');
        onRefresh();
      } else {
        showError(result.message || 'Failed to approve return request');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to approve return request');
    } finally {
      setApproving(false);
    }
  };

  const handleApproveNewVendor = async () => {
    setApprovingNewVendor(true);
    try {
      const result = await vendorInspectionService.tdApproveNewVendor(vrr.id);
      if (result.success) {
        showSuccess('New vendor approved');
        onRefresh();
      } else {
        showError(result.message || 'Failed to approve new vendor');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to approve new vendor');
    } finally {
      setApprovingNewVendor(false);
    }
  };

  const handleRejectNewVendor = () => {
    setShowRejectModal(true);
  };

  return (
    <>
      {/* Main row */}
      <TableRow
        className="cursor-pointer"
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
            {vrr.created_by_buyer_name || 'Unknown'}
          </span>
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

      {/* Expanded details */}
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-gray-50/50 p-0">
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-6 space-y-5"
            >
              {/* Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    Inspection Info
                  </p>
                  <p className="text-sm text-gray-800">
                    {vrr.inspection_category || 'General rejection'}
                  </p>
                  {vrr.inspection_notes && (
                    <p className="text-xs text-gray-500 mt-1">
                      {vrr.inspection_notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Rejected Materials */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Rejected Materials ({(vrr.rejected_materials || []).length})
                </h4>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-red-50/50">
                        <TableHead className="text-xs font-semibold">
                          Material
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Qty Rejected
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Unit Price
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Total
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Category
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(vrr.rejected_materials || []).map((m, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm font-medium text-gray-900">
                            {m.material_name}
                            {m.brand && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({m.brand}
                                {m.size ? `, ${m.size}` : ''})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-red-700 font-medium">
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
              {evidence.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    Inspection Evidence ({evidence.length})
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {evidence.map((ev, idx) => {
                      const isImage = ev.file_type?.startsWith('image');
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setLightboxIndex(idx);
                            setShowLightbox(true);
                          }}
                          className="relative group w-24 h-24 rounded-lg border-2 border-gray-200 overflow-hidden hover:border-blue-400 transition-colors"
                          aria-label={`View evidence: ${ev.file_name}`}
                        >
                          {isImage ? (
                            <img
                              src={ev.url}
                              alt={ev.file_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <FileText className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* New Vendor Info for legacy TD vendor approval */}
              {isPendingNewVendorApproval && vrr.new_vendor_name && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                  {/* Header row — always visible, clickable to toggle */}
                  <button
                    type="button"
                    onClick={() => setVendorDetailsExpanded((v) => !v)}
                    className="w-full flex items-center justify-between"
                  >
                    <h4 className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      New Vendor Selected by Buyer
                    </h4>
                    {vendorDetailsExpanded ? (
                      <ChevronUp className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-indigo-400" />
                    )}
                  </button>

                  {/* Summary — always visible */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-bold text-indigo-900">
                        {vrr.new_vendor_details?.company_name || vrr.new_vendor_name}
                      </p>
                      {vrr.new_vendor_details?.category && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700">
                          {vrr.new_vendor_details.category}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">Rejected Value</p>
                      <p className="text-lg font-bold text-red-700">{formatCurrency(vrr.total_rejected_value)}</p>
                    </div>
                  </div>

                  {/* Collapsible contact details */}
                  <AnimatePresence initial={false}>
                    {vendorDetailsExpanded && vrr.new_vendor_details && (
                      <motion.div
                        key="legacy-vendor-details"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                        className="space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-200/60">
                          {vrr.new_vendor_details.contact_person_name && (
                            <div className="flex items-start gap-2">
                              <Users className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">Contact Person</p>
                                <p className="text-sm font-medium text-gray-900">{vrr.new_vendor_details.contact_person_name}</p>
                              </div>
                            </div>
                          )}
                          {vrr.new_vendor_details.email && (
                            <div className="flex items-start gap-2">
                              <Mail className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs text-indigo-500">Email</p>
                                <p className="text-sm font-medium text-gray-900 truncate">{vrr.new_vendor_details.email}</p>
                              </div>
                            </div>
                          )}
                          {vrr.new_vendor_details.phone && (
                            <div className="flex items-start gap-2">
                              <Phone className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">Phone</p>
                                <p className="text-sm font-medium text-gray-900">{vrr.new_vendor_details.phone_code || ''}{vrr.new_vendor_details.phone}</p>
                              </div>
                            </div>
                          )}
                          {(vrr.new_vendor_details.city || vrr.new_vendor_details.country) && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">Location</p>
                                <p className="text-sm font-medium text-gray-900">
                                  {[vrr.new_vendor_details.city, vrr.new_vendor_details.state, vrr.new_vendor_details.country].filter(Boolean).join(', ')}
                                </p>
                              </div>
                            </div>
                          )}
                          {vrr.new_vendor_details.gst_number && (
                            <div className="flex items-start gap-2">
                              <Building2 className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">GST / TRN</p>
                                <p className="text-sm font-medium text-gray-900">{vrr.new_vendor_details.gst_number}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {vrr.vendor_name && (
                          <div className="pt-2 border-t border-indigo-200/60">
                            <p className="text-xs text-indigo-500 mb-1">Replacing Original Vendor</p>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500 line-through">{vrr.vendor_name}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-sm font-semibold text-indigo-700">{vrr.new_vendor_details?.company_name || vrr.new_vendor_name}</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-3 pt-2 border-t border-indigo-200/60">
                    <Button
                      onClick={handleApproveNewVendor}
                      disabled={approvingNewVendor}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                    >
                      {approvingNewVendor ? (
                        <>
                          <ModernLoadingSpinners size="xxs" />
                          <span className="ml-1">Approving...</span>
                        </>
                      ) : (
                        <>
                          <ThumbsUp className="w-4 h-4" />
                          Approve Vendor
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleRejectNewVendor}
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <ThumbsDown className="w-4 h-4" />
                      Reject Vendor
                    </Button>
                  </div>
                </div>
              )}

              {/* Full vendor details for new_vendor VRRs pending approval */}
              {isPendingApproval && vrr.resolution_type === 'new_vendor' && vrr.new_vendor_name && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                  {/* Header row — always visible, clickable to toggle */}
                  <button
                    type="button"
                    onClick={() => setVendorDetailsExpanded((v) => !v)}
                    className="w-full flex items-center justify-between"
                  >
                    <h4 className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      New Vendor Selected by Buyer
                    </h4>
                    <div className="flex items-center gap-2">
                      {vrr.new_vendor_details?.status && (
                        <Badge variant="outline" className={
                          vrr.new_vendor_details.status === 'active'
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }>
                          {vrr.new_vendor_details.status}
                        </Badge>
                      )}
                      {vendorDetailsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-indigo-400" />
                      )}
                    </div>
                  </button>

                  {/* Summary — always visible */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-bold text-indigo-900">
                        {vrr.new_vendor_details?.company_name || vrr.new_vendor_name}
                      </p>
                      {vrr.new_vendor_details?.category && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700">
                          {vrr.new_vendor_details.category}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">Rejected Value</p>
                      <p className="text-lg font-bold text-red-700">
                        {formatCurrency(vrr.total_rejected_value)}
                      </p>
                    </div>
                  </div>

                  {/* Collapsible contact details */}
                  <AnimatePresence initial={false}>
                    {vendorDetailsExpanded && vrr.new_vendor_details && (
                      <motion.div
                        key="new-vendor-details"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden' }}
                        className="space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-200/60">
                          {vrr.new_vendor_details.contact_person_name && (
                            <div className="flex items-start gap-2">
                              <Users className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">Contact Person</p>
                                <p className="text-sm font-medium text-gray-900">{vrr.new_vendor_details.contact_person_name}</p>
                              </div>
                            </div>
                          )}
                          {vrr.new_vendor_details.email && (
                            <div className="flex items-start gap-2">
                              <Mail className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs text-indigo-500">Email</p>
                                <p className="text-sm font-medium text-gray-900 truncate">{vrr.new_vendor_details.email}</p>
                              </div>
                            </div>
                          )}
                          {vrr.new_vendor_details.phone && (
                            <div className="flex items-start gap-2">
                              <Phone className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">Phone</p>
                                <p className="text-sm font-medium text-gray-900">
                                  {vrr.new_vendor_details.phone_code || ''}{vrr.new_vendor_details.phone}
                                </p>
                              </div>
                            </div>
                          )}
                          {(vrr.new_vendor_details.city || vrr.new_vendor_details.country) && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">Location</p>
                                <p className="text-sm font-medium text-gray-900">
                                  {[vrr.new_vendor_details.city, vrr.new_vendor_details.state, vrr.new_vendor_details.country].filter(Boolean).join(', ')}
                                </p>
                              </div>
                            </div>
                          )}
                          {vrr.new_vendor_details.gst_number && (
                            <div className="flex items-start gap-2">
                              <Building2 className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-indigo-500">GST / TRN</p>
                                <p className="text-sm font-medium text-gray-900">{vrr.new_vendor_details.gst_number}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Original vendor comparison */}
                        {vrr.vendor_name && (
                          <div className="pt-2 border-t border-indigo-200/60">
                            <p className="text-xs text-indigo-500 mb-1">Replacing Original Vendor</p>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500 line-through">{vrr.vendor_name}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-sm font-semibold text-indigo-700">{vrr.new_vendor_details?.company_name || vrr.new_vendor_name}</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Action Buttons for pending approval */}
              {isPendingApproval && (
                <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                  <Button
                    onClick={handleApprove}
                    disabled={approving}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {approving ? (
                      <>
                        <ModernLoadingSpinners size="xxs" />
                        <span className="ml-1">Approving...</span>
                      </>
                    ) : (
                      <>
                        <ThumbsUp className="w-4 h-4" />
                        {vrr.resolution_type === 'new_vendor' && vrr.new_vendor_name
                          ? 'Approve Return & New Vendor'
                          : 'Approve Return Request'}
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => setShowRejectModal(true)}
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Reject
                  </Button>
                </div>
              )}

              {/* Credit Note + Refund Evidence (shown for completed returns) */}
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

              {/* Refund Proof */}
              {vrr.refund_evidence && vrr.refund_evidence.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    Refund Proof ({vrr.refund_evidence.length})
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {vrr.refund_evidence.map((ev: any, idx: number) => {
                      const isImg = ev.file_type?.startsWith('image');
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setRefundLightboxIndex(idx);
                            setShowRefundLightbox(true);
                          }}
                          className="relative group w-24 h-24 rounded-lg border-2 border-gray-200 overflow-hidden hover:border-blue-400 transition-colors"
                          aria-label={`View proof: ${ev.file_name}`}
                        >
                          {isImg ? (
                            <img src={ev.url} alt={ev.file_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100">
                              <FileText className="w-8 h-8 text-gray-400" />
                              <span className="text-[9px] text-gray-500 mt-0.5">
                                {ev.file_name?.split('.').pop()?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Already-approved / rejected notice */}
              {vrr.status === 'td_approved' && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <CheckCircle className="w-4 h-4" />
                  Approved by {vrr.td_approved_by_name || 'TD'} on{' '}
                  {formatDateTime(vrr.td_approval_date)}
                </div>
              )}
              {vrr.status === 'td_rejected' && vrr.td_rejection_reason && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="font-semibold flex items-center gap-2 mb-1">
                    <XCircle className="w-4 h-4" />
                    Rejected
                  </p>
                  <p>{vrr.td_rejection_reason}</p>
                </div>
              )}
            </motion.div>
          </TableCell>
        </TableRow>
      )}

      {/* Reject Modal */}
      <RejectReturnModal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        returnRequestId={vrr.id}
        vrrNumber={vrr.return_request_number || `VRR-${vrr.id}`}
        onSuccess={onRefresh}
      />

      {/* Evidence Lightbox (inspection) */}
      <EvidenceLightbox
        evidence={evidence}
        isOpen={showLightbox}
        onClose={() => setShowLightbox(false)}
        initialIndex={lightboxIndex}
      />

      {/* Evidence Lightbox (refund proof) */}
      <EvidenceLightbox
        evidence={vrr.refund_evidence || []}
        isOpen={showRefundLightbox}
        onClose={() => setShowRefundLightbox(false)}
        initialIndex={refundLightboxIndex}
      />
    </>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

type ViewTab = 'pending' | 'new_vendor' | 'history';
type HistorySubTab = 'all' | 'td_approved' | 'td_rejected' | 'return_in_progress' | 'completed';

const ReturnApprovals: React.FC = () => {
  const [pendingData, setPendingData] = useState<VendorReturnRequest[]>([]);
  const [allData, setAllData] = useState<VendorReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('pending');
  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pendingResult, allResult] = await Promise.all([
        vendorInspectionService.getPendingReturnApprovals(1, 50),
        vendorInspectionService.getAllTdReturnRequests(1, 50),
      ]);
      if (pendingResult.success) {
        setPendingData(pendingResult.data || []);
      }
      if (allResult.success) {
        setAllData(allResult.data || []);
      }
      if (!pendingResult.success && !allResult.success) {
        showError('Failed to load return approvals');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load return approvals');
    } finally {
      setLoading(false);
    }
  };

  // Categorize from pending endpoint (only pending items)
  const pendingRequests = useMemo(
    () => pendingData.filter((r) => r.status === 'pending_td_approval'),
    [pendingData],
  );
  const newVendorRequests = useMemo(
    () => pendingData.filter((r) =>
      r.status === 'new_vendor_selected' || r.status === 'new_vendor_pending'
    ),
    [pendingData],
  );

  // History from all-data endpoint (exclude pending statuses)
  const historyRequests = useMemo(
    () =>
      allData.filter(
        (r) =>
          r.status !== 'pending_td_approval' &&
          r.status !== 'new_vendor_selected' &&
          r.status !== 'new_vendor_pending',
      ),
    [allData],
  );

  // History sub-tab filtering
  const filteredHistory = useMemo(() => {
    if (historySubTab === 'all') return historyRequests;
    if (historySubTab === 'return_in_progress') {
      return historyRequests.filter((r) =>
        r.status === 'return_in_progress' || r.status === 'returned_to_vendor' || r.status === 'replacement_pending'
      );
    }
    return historyRequests.filter((r) => r.status === historySubTab);
  }, [historyRequests, historySubTab]);

  // History sub-tab counts
  const historyCounts = useMemo(() => ({
    all: historyRequests.length,
    td_approved: historyRequests.filter((r) => r.status === 'td_approved').length,
    td_rejected: historyRequests.filter((r) => r.status === 'td_rejected').length,
    return_in_progress: historyRequests.filter(
      (r) => r.status === 'return_in_progress' || r.status === 'returned_to_vendor' || r.status === 'replacement_pending'
    ).length,
    completed: historyRequests.filter((r) => r.status === 'completed').length,
  }), [historyRequests]);

  const activeList = useMemo(() => {
    let list: VendorReturnRequest[];
    switch (activeTab) {
      case 'pending':
        list = pendingRequests;
        break;
      case 'new_vendor':
        list = newVendorRequests;
        break;
      case 'history':
        list = filteredHistory;
        break;
      default:
        list = pendingRequests;
    }
    if (!searchTerm) return list;
    const lower = searchTerm.toLowerCase();
    return list.filter((r) => {
      const num = r.return_request_number || '';
      const vendor = r.vendor_name || '';
      const buyer = r.created_by_buyer_name || '';
      return (
        num.toLowerCase().includes(lower) ||
        vendor.toLowerCase().includes(lower) ||
        buyer.toLowerCase().includes(lower) ||
        `CR-${r.cr_id}`.toLowerCase().includes(lower)
      );
    });
  }, [activeTab, pendingRequests, newVendorRequests, filteredHistory, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(
    activeList.length / PAGINATION.DEFAULT_PAGE_SIZE,
  );
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return activeList.slice(start, start + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [activeList, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [activeTab, searchTerm, historySubTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <ModernLoadingSpinners size="lg" />
          <p className="text-sm text-gray-500 mt-4">
            Loading return approvals...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Shield className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Return Request Approvals
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and approve or reject vendor return requests from buyers.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {pendingRequests.length}
              </p>
              <p className="text-xs text-gray-500">Pending Return Approvals</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {newVendorRequests.length}
              </p>
              <p className="text-xs text-gray-500">New Vendor Approvals</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {historyRequests.length}
              </p>
              <p className="text-xs text-gray-500">Reviewed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          {
            key: 'pending' as ViewTab,
            label: 'Pending Return Approvals',
            count: pendingRequests.length,
            icon: <Clock className="w-4 h-4" />,
          },
          {
            key: 'new_vendor' as ViewTab,
            label: 'New Vendor Approvals',
            count: newVendorRequests.length,
            icon: <Users className="w-4 h-4" />,
          },
          {
            key: 'history' as ViewTab,
            label: 'History',
            count: historyRequests.length,
            icon: <FileText className="w-4 h-4" />,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span
              className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${
                activeTab === tab.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* History Sub-Tabs */}
      {activeTab === 'history' && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {([
            { key: 'all' as HistorySubTab, label: 'All', count: historyCounts.all },
            { key: 'td_approved' as HistorySubTab, label: 'Approved', count: historyCounts.td_approved },
            { key: 'td_rejected' as HistorySubTab, label: 'Rejected', count: historyCounts.td_rejected },
            { key: 'return_in_progress' as HistorySubTab, label: 'In Progress', count: historyCounts.return_in_progress },
            { key: 'completed' as HistorySubTab, label: 'Completed', count: historyCounts.completed },
          ] as const).map((sub) => (
            <button
              key={sub.key}
              onClick={() => setHistorySubTab(sub.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                historySubTab === sub.key
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {sub.label}
              <span className={`ml-1 text-[10px] ${
                historySubTab === sub.key ? 'text-gray-300' : 'text-gray-400'
              }`}>
                {sub.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search & Refresh */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by VRR number, CR ID, vendor, or buyer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={fetchData} className="shrink-0">
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Table */}
      {paginatedList.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-600">
            {activeTab === 'pending'
              ? 'No pending return approvals'
              : activeTab === 'new_vendor'
                ? 'No new vendor approvals pending'
                : 'No reviewed return requests'}
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {searchTerm
              ? 'Try adjusting your search terms.'
              : activeTab === 'pending'
                ? 'All return requests have been reviewed.'
                : 'Items will appear here as they are processed.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">VRR Number</TableHead>
                <TableHead className="font-semibold">CR ID</TableHead>
                <TableHead className="font-semibold">Buyer</TableHead>
                <TableHead className="font-semibold">Vendor</TableHead>
                <TableHead className="font-semibold">Resolution</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Total Value</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedList.map((vrr) => (
                <ApprovalDetailRow
                  key={vrr.id}
                  vrr={vrr}
                  isExpanded={expandedId === vrr.id}
                  onToggle={() =>
                    setExpandedId(expandedId === vrr.id ? null : vrr.id)
                  }
                  onRefresh={fetchData}
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
                  activeList.length,
                )}{' '}
                of {activeList.length}
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

export default ReturnApprovals;
