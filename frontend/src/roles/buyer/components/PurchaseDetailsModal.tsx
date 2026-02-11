import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Package,
  Building2,
  MapPin,
  FileText,
  Calendar,
  User,
  CheckCircle,
  DollarSign,
  Hash,
  Store,
  AlertCircle,
  Clock,
  Truck,
  Hourglass
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { Purchase, buyerService } from '../services/buyerService';

interface PurchaseDetailsModalProps {
  purchase: Purchase;
  isOpen: boolean;
  onClose: () => void;
}

const PurchaseDetailsModal: React.FC<PurchaseDetailsModalProps> = ({
  purchase,
  isOpen,
  onClose
}) => {
  // Local purchase state to hold updated data
  const [localPurchase, setLocalPurchase] = useState<Purchase>(purchase);

  // LPO data for VAT information
  const [lpoData, setLpoData] = useState<any>(null);

  // Update local purchase when purchase changes or modal opens
  useEffect(() => {
    // Debug logging for POChild
    if ((purchase as any).po_child_id) {
      console.log('[PurchaseDetailsModal] Viewing POChild:', {
        po_child_id: (purchase as any).po_child_id,
        materials_count: purchase.materials?.length,
        first_material_has_notes: purchase.materials?.[0] ? !!(purchase.materials[0] as any).supplier_notes : false
      });
    }

    // CRITICAL FIX: When vendor is approved, calculate total_cost from materials' vendor prices
    // instead of using the BOQ total_cost that comes from backend
    let updatedPurchase = { ...purchase };

    // Enrich materials with supplier notes from material_vendor_selections OR po_children OR child_notes
    if (purchase.materials && purchase.materials.length > 0) {
      const materialVendorSelections = (purchase as any).material_vendor_selections || {};

      // Check if we have PO children (approved state)
      const poChildren = purchase.po_children || [];

      // Check if this purchase itself is a POChild with child_notes
      const purchaseChildNotes = (purchase as any).child_notes || '';

      updatedPurchase.materials = purchase.materials.map(mat => {
        const materialName = mat.material_name || '';

        // First try material_vendor_selections (parent CR notes)
        let supplierNotes = materialVendorSelections[materialName]?.supplier_notes || '';

        // If not found, check if material already has supplier_notes
        if (!supplierNotes && (mat as any).supplier_notes) {
          supplierNotes = (mat as any).supplier_notes;
        }

        // If not found and we have PO children, get notes from PO child materials or child_notes
        if (!supplierNotes && poChildren.length > 0) {
          for (const poChild of poChildren) {
            // First check materials array for per-material notes
            if (poChild.materials) {
              const poChildMaterial = poChild.materials.find((m: any) =>
                m.material_name === materialName
              );
              if (poChildMaterial?.supplier_notes) {
                supplierNotes = poChildMaterial.supplier_notes;
                break;
              }
            }
            // Then check child_notes column (format: "[material_name]: notes" or plain text)
            if (!supplierNotes && (poChild as any).child_notes) {
              const childNotes = (poChild as any).child_notes;
              // Check if child_notes contains notes for this material
              const materialPrefix = `[${materialName}]: `;
              if (childNotes.includes(materialPrefix)) {
                // Extract the note for this material (format: "[material_name]: notes")
                const startIdx = childNotes.indexOf(materialPrefix) + materialPrefix.length;
                const endIdx = childNotes.indexOf('\n\n', startIdx);
                supplierNotes = endIdx > startIdx ? childNotes.substring(startIdx, endIdx) : childNotes.substring(startIdx);
                break;
              } else if (!childNotes.includes('[')) {
                // Plain notes without prefix (legacy format) - show for all materials in this POChild
                // Check if this material belongs to this POChild
                const poChildMaterialNames = (poChild.materials || []).map((m: any) => m.material_name);
                if (poChildMaterialNames.includes(materialName)) {
                  supplierNotes = childNotes;
                  break;
                }
              }
            }
          }
        }

        // If still not found, check purchaseChildNotes (when viewing a single POChild)
        if (!supplierNotes && purchaseChildNotes) {
          const materialPrefix = `[${materialName}]: `;
          if (purchaseChildNotes.includes(materialPrefix)) {
            // Notes are in format "[material_name]: notes"
            const startIdx = purchaseChildNotes.indexOf(materialPrefix) + materialPrefix.length;
            const endIdx = purchaseChildNotes.indexOf('\n\n', startIdx);
            supplierNotes = endIdx > startIdx ? purchaseChildNotes.substring(startIdx, endIdx) : purchaseChildNotes.substring(startIdx);
          } else if (!purchaseChildNotes.includes('[') && purchase.materials && purchase.materials.length === 1) {
            // Plain notes without prefix (legacy format) - apply to single material
            supplierNotes = purchaseChildNotes;
          } else if (!purchaseChildNotes.includes('[')) {
            // Plain notes without any prefix - show for all materials
            supplierNotes = purchaseChildNotes;
          }
        }

        const enrichedMaterial = {
          ...mat,
          supplier_notes: supplierNotes
        };

        // Debug logging
        const finalNotes = enrichedMaterial.supplier_notes;
        if (finalNotes) {
          console.log(`[PurchaseDetailsModal] Material "${materialName}" has supplier notes:`, finalNotes.substring(0, 50));
        } else {
          console.log(`[PurchaseDetailsModal] Material "${materialName}" has NO supplier notes`);
        }

        return enrichedMaterial;
      });
    }

    // Always calculate total_cost from materials (for all statuses, not just approved)
    if (purchase.materials && purchase.materials.length > 0) {
      const vendorTotalCost = updatedPurchase.materials.reduce((sum, mat) => {
        return sum + (mat.total_price || (mat.unit_price * mat.quantity) || 0);
      }, 0);
      updatedPurchase.total_cost = vendorTotalCost;
    }

    setLocalPurchase(updatedPurchase);
  }, [purchase, isOpen]);

  // Fetch LPO data for VAT information when modal opens
  useEffect(() => {
    const fetchLPOData = async () => {
      if (!isOpen || !purchase || lpoData) return;

      // Only fetch if vendor is selected (has LPO customization data)
      if (purchase.selected_vendor_name || (purchase as any).vendor_name) {
        try {
          const poChildId = (purchase as any).po_child_id;
          const response = await buyerService.previewLPOPdf(purchase.cr_id, poChildId);
          const lpoDataFromResponse = response.lpo_data || response;
          setLpoData(lpoDataFromResponse);
        } catch (error) {
          console.log('LPO data not available:', error);
        }
      }
    };

    fetchLPOData();
  }, [isOpen, purchase, lpoData]);

  // Reset lpoData when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLpoData(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
  };

  // Pre-compute store requested materials array (normalized for case-insensitive matching)
  const storeRequestedMaterials = useMemo(() => {
    const materials = localPurchase.store_requested_materials || [];
    // Normalize to lowercase and trim for accurate matching
    return materials.map((name: string) => name.toLowerCase().trim());
  }, [localPurchase.store_requested_materials]);

  // Pre-compute POChild lookup map for O(1) material status lookup (vs O(n²))
  const materialToPOChildMap = useMemo(() => {
    const map = new Map<string, any>();
    const poChildren = localPurchase.po_children || [];

    poChildren.forEach(poChild => {
      poChild.materials?.forEach((m: any) => {
        if (m.material_name) {
          const key = m.material_name.toLowerCase().trim();
          map.set(key, poChild);
        }
      });
    });

    return map;
  }, [localPurchase.po_children]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-5 border-b border-blue-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {purchase.project_name}
                      </h2>
                      <Badge className="bg-blue-100 text-blue-800">
                        PO #{purchase.cr_id}
                      </Badge>
                      {purchase.status === 'completed' && (
                        <Badge className="bg-green-600 text-white">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4" />
                        {purchase.client}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {purchase.location}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        {purchase.boq_name}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* ✅ Mixed Routing Alert Banner - Show when materials are split between store and vendor */}
              {localPurchase.store_requested_materials && localPurchase.store_requested_materials.length > 0 && localPurchase.po_children && localPurchase.po_children.length > 0 && (
                <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border-b border-indigo-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-indigo-700">
                      <Store className="w-5 h-5" />
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-indigo-900 mb-1">
                        🔀 Mixed Routing - Purchase Split Between Store & Vendor
                      </div>
                      <div className="text-xs text-indigo-700 flex items-center gap-4">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Store className="w-3.5 h-3.5" />
                          {localPurchase.store_requested_materials.length} material(s) sent to M2 Store
                        </span>
                        <span className="text-indigo-400">|</span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <Package className="w-3.5 h-3.5" />
                          {localPurchase.po_children.reduce((sum: number, pc: any) => sum + (pc.materials_count || 0), 0)} material(s) sent to Vendor (PO Children created)
                        </span>
                      </div>
                    </div>
                    <Badge className="bg-indigo-600 text-white text-xs px-3 py-1 border-2 border-indigo-700 shadow-sm">
                      SPLIT PURCHASE
                    </Badge>
                  </div>
                </div>
              )}

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Package className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Materials</div>
                        <div className="text-2xl font-bold text-green-600">
                          {purchase.materials_count}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <DollarSign className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Total Cost (incl. VAT)</div>
                        <div className="text-2xl font-bold text-green-600">
                          {(() => {
                            const subtotal = localPurchase.total_cost || 0;
                            const vatPercent = lpoData?.totals?.vat_percent ?? (localPurchase as any).vat_percent ?? 0;
                            const grandTotal = subtotal + (subtotal * vatPercent / 100);
                            return formatCurrency(grandTotal);
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Hash className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Request Type</div>
                        <div className="text-sm font-semibold text-blue-900">
                          {purchase.request_type}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Item</div>
                      <div className="text-base font-semibold text-gray-900">{purchase.item_name}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Sub-Item</div>
                      <div className="text-base font-semibold text-gray-900">{purchase.sub_item_name}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Created Date</div>
                      <div className="flex items-center gap-2 text-gray-900">
                        <Calendar className="w-4 h-4" />
                        {new Date(purchase.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {purchase.approved_at && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Approved Date</div>
                        <div className="flex items-center gap-2 text-gray-900">
                          <Calendar className="w-4 h-4" />
                          {new Date(purchase.approved_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    )}
                    {purchase.status === 'completed' && purchase.purchase_completion_date && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Completion Date</div>
                        <div className="flex items-center gap-2 text-green-600 font-medium">
                          <CheckCircle className="w-4 h-4" />
                          {new Date(purchase.purchase_completion_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    )}
                    {purchase.status === 'completed' && purchase.purchase_completed_by_name && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Completed By</div>
                        <div className="flex items-center gap-2 text-gray-900">
                          <User className="w-4 h-4" />
                          {purchase.purchase_completed_by_name}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Justification */}
                {purchase.reason && (
                  <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="text-sm font-medium text-gray-700 mb-1">Justification</div>
                    <div className="text-sm text-gray-900">{purchase.reason}</div>
                  </div>
                )}

                {/* Completion Notes */}
                {purchase.status === 'completed' && purchase.purchase_notes && (
                  <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="text-sm font-medium text-gray-700 mb-1">Completion Notes</div>
                    <div className="text-sm text-gray-900">{purchase.purchase_notes}</div>
                  </div>
                )}

                {/* Vendor Details Section */}
                {purchase.vendor_id && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <Store className="w-5 h-5 text-gray-600" />
                        <h4 className="font-semibold text-gray-900 text-base">Selected Vendor Details</h4>
                      </div>
                      {purchase.vendor_selection_status === 'pending_td_approval' && (
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Awaiting TD Approval
                        </span>
                      )}
                      {purchase.vendor_selection_status === 'approved' && (
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          Approved
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                      {/* Company Info */}
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Company Name</p>
                          <p className="font-semibold text-gray-900">{purchase.vendor_name}</p>
                        </div>

                        {purchase.vendor_contact_person && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Contact Person</p>
                            <p className="text-gray-900">{purchase.vendor_contact_person}</p>
                          </div>
                        )}

                        {purchase.vendor_email && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Email</p>
                            <p className="text-gray-900 break-words">{purchase.vendor_email}</p>
                          </div>
                        )}

                        {purchase.vendor_phone && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Phone</p>
                            <p className="text-gray-900">
                              {purchase.vendor_phone_code ? `${purchase.vendor_phone_code} ` : ''}
                              {purchase.vendor_phone}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Additional Info */}
                      <div className="space-y-4">
                        {purchase.vendor_category && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Category</p>
                            <p className="text-gray-900">{purchase.vendor_category}</p>
                          </div>
                        )}

                        {(purchase.vendor_street_address || purchase.vendor_city) && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Address</p>
                            <p className="text-gray-900">
                              {[
                                purchase.vendor_street_address,
                                purchase.vendor_city,
                                purchase.vendor_state,
                                purchase.vendor_country
                              ].filter(Boolean).join(', ')}
                            </p>
                          </div>
                        )}

                        {purchase.vendor_gst_number && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">GST/TRN Number</p>
                            <p className="text-gray-900">{purchase.vendor_gst_number}</p>
                          </div>
                        )}

                        {(purchase.vendor_selected_by_name || purchase.vendor_selected_by_buyer_name) && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Selected By (Buyer)</p>
                            <p className="text-gray-900">{purchase.vendor_selected_by_buyer_name || purchase.vendor_selected_by_name}</p>
                          </div>
                        )}

                        {purchase.vendor_selection_status === 'approved' && purchase.vendor_approved_by_td_name && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Approved By TD</p>
                            <p className="text-gray-900">{purchase.vendor_approved_by_td_name}</p>
                          </div>
                        )}

                        {purchase.vendor_selection_status === 'approved' && purchase.vendor_approval_date && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Approval Date</p>
                            <p className="text-gray-900">
                              {new Date(purchase.vendor_approval_date).toLocaleDateString('en-US', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Materials Table */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Package className="w-5 h-5" />
                      Materials Breakdown
                    </h3>
                    {/* Store-sent materials indicator */}
                    {localPurchase.store_requested_materials && localPurchase.store_requested_materials.length > 0 && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 border border-purple-300 rounded-lg">
                        <Store className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-medium text-purple-800">
                          {localPurchase.store_requested_materials.length} material(s) sent to M2 Store
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold text-sm">Material Name</TableHead>
                          <TableHead className="font-semibold text-sm">Sub-Item</TableHead>
                          <TableHead className="font-semibold text-sm">Brand</TableHead>
                          <TableHead className="font-semibold text-sm">Size</TableHead>
                          <TableHead className="font-semibold text-sm">Specification</TableHead>
                          <TableHead className="font-semibold text-sm">Quantity</TableHead>
                          <TableHead className="font-semibold text-sm">Unit</TableHead>
                          <TableHead className="font-semibold text-sm">Unit Price</TableHead>
                          <TableHead className="font-semibold text-sm text-right">Total Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {localPurchase.materials.map((material, idx) => {
                          // Check if material is NEW (only show badge for truly new materials, not BOQ materials)
                          const isNewMaterial = material.master_material_id == null;
                          // Check if material is sent to store (using pre-computed array with case-insensitive matching)
                          const isSentToStore = storeRequestedMaterials.includes(material.material_name.toLowerCase().trim());

                          // Use pre-computed POChild lookup map for O(1) lookup
                          const materialNameLower = material.material_name.toLowerCase().trim();
                          const poChildWithMaterial = materialToPOChildMap.get(materialNameLower);

                          const isPendingTD = poChildWithMaterial?.vendor_selection_status === 'pending_td_approval';
                          const isApprovedByTD = poChildWithMaterial?.vendor_selection_status === 'approved' ||
                                                 poChildWithMaterial?.status === 'vendor_approved' ||
                                                 poChildWithMaterial?.status === 'purchase_completed';
                          const vendorName = poChildWithMaterial?.vendor_name;

                          // Determine row background color
                          const rowBgClass = isSentToStore ? 'bg-purple-50' :
                                            isPendingTD ? 'bg-amber-50' :
                                            isApprovedByTD ? 'bg-green-50' : '';

                          return (
                            <React.Fragment key={idx}>
                              <TableRow className={`hover:bg-gray-50 ${rowBgClass}`}>
                                <TableCell className="font-medium text-sm">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={isSentToStore ? 'text-purple-700' : isPendingTD ? 'text-amber-700' : isApprovedByTD ? 'text-green-700' : ''}>
                                      {material.material_name}
                                    </span>
                                    {isNewMaterial && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-800 border border-green-300">
                                        NEW
                                      </span>
                                    )}
                                    {isSentToStore && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                                        <Store className="w-3 h-3" />
                                        STORE
                                      </span>
                                    )}
                                    {isPendingTD && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                        <Hourglass className="w-3 h-3" />
                                        PENDING TD
                                      </span>
                                    )}
                                    {isApprovedByTD && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-800 border border-green-300">
                                        <Truck className="w-3 h-3" />
                                        VENDOR
                                      </span>
                                    )}
                                    {vendorName && (isPendingTD || isApprovedByTD) && (
                                      <span className="text-[10px] text-gray-500">
                                        ({vendorName})
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {material.sub_item_name && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      {material.sub_item_name}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">{(material as any).brand || '-'}</TableCell>
                                <TableCell className="text-sm">{(material as any).size || '-'}</TableCell>
                                <TableCell className="text-sm">{(material as any).specification || '-'}</TableCell>
                                <TableCell className="text-sm">{material.quantity}</TableCell>
                                <TableCell className="text-sm">{material.unit}</TableCell>
                                <TableCell className={`text-sm ${isSentToStore ? 'text-purple-600' : ''}`}>
                                  {isSentToStore ? 'From Store' : formatCurrency(material.unit_price)}
                                </TableCell>
                                <TableCell className={`text-right font-bold text-sm ${isSentToStore ? 'text-purple-600' : 'text-green-600'}`}>
                                  {isSentToStore ? '-' : formatCurrency(material.total_price)}
                                </TableCell>
                              </TableRow>
                              {/* Per-Material Supplier Notes Row */}
                              {(material as any).supplier_notes && (material as any).supplier_notes.trim().length > 0 && (
                                <TableRow>
                                  <TableCell colSpan={9} className="bg-blue-50/50 py-2 px-4 border-t-0">
                                    <div className="flex items-start gap-2 text-xs">
                                      <span className="font-semibold text-blue-700 whitespace-nowrap">📝 Note:</span>
                                      <span className="text-blue-800">{(material as any).supplier_notes}</span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {/* Show separate totals if there are store materials */}
                        {(() => {
                          // Using pre-computed storeRequestedMaterials with case-insensitive matching
                          const vendorMaterials = localPurchase.materials.filter(m => !storeRequestedMaterials.includes(m.material_name.toLowerCase().trim()));
                          const vendorTotal = vendorMaterials.reduce((sum, mat) => sum + (mat.total_price || 0), 0);
                          const storeMaterialsCount = storeRequestedMaterials.length;

                          if (storeMaterialsCount > 0) {
                            return (
                              <>
                                <TableRow className="bg-purple-50">
                                  <TableCell colSpan={8} className="text-right text-sm text-purple-700">
                                    Store Materials ({storeMaterialsCount}):
                                  </TableCell>
                                  <TableCell className="text-right text-purple-700 text-sm font-medium">
                                    From M2 Store
                                  </TableCell>
                                </TableRow>
                                <TableRow className="bg-blue-50 font-bold">
                                  <TableCell colSpan={8} className="text-right text-sm">Vendor Total ({vendorMaterials.length} items):</TableCell>
                                  <TableCell className="text-right text-green-700 text-base">
                                    {formatCurrency(vendorTotal)}
                                  </TableCell>
                                </TableRow>
                              </>
                            );
                          }
                          // Calculate VAT and totals
                          const subtotal = localPurchase.total_cost || 0;
                          // Get VAT from LPO data (saved customization), then purchase, then default 0
                          const vatPercent = lpoData?.totals?.vat_percent ?? (localPurchase as any).vat_percent ?? 0;
                          const vatAmount = (subtotal * vatPercent / 100);
                          const grandTotal = subtotal + vatAmount;

                          return (
                            <>
                              {/* Subtotal Row */}
                              <TableRow className="bg-gray-50">
                                <TableCell colSpan={8} className="text-right text-sm font-semibold">Subtotal:</TableCell>
                                <TableCell className="text-right text-gray-900 font-semibold">
                                  {formatCurrency(subtotal)}
                                </TableCell>
                              </TableRow>

                              {/* VAT Row */}
                              {vatPercent > 0 && (
                                <TableRow className="bg-gray-50">
                                  <TableCell colSpan={8} className="text-right text-sm font-semibold">VAT ({vatPercent}%):</TableCell>
                                  <TableCell className="text-right text-gray-900 font-semibold">
                                    {formatCurrency(vatAmount)}
                                  </TableCell>
                                </TableRow>
                              )}

                              {/* Total Row */}
                              <TableRow className="bg-blue-50 font-bold border-t-2 border-blue-300">
                                <TableCell colSpan={8} className="text-right text-sm">Total Cost:</TableCell>
                                <TableCell className="text-right text-green-700 text-base">
                                  {formatCurrency(grandTotal)}
                                </TableCell>
                              </TableRow>
                            </>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Negotiable Price Summary - Show if has new materials */}
                {localPurchase.materials.some(mat => mat.master_material_id == null) && localPurchase.overhead_analysis && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-600" />
                      Negotiable Price Summary
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 text-xs">Original Allocated</span>
                        <p className="font-semibold text-gray-900 mt-1">
                          {formatCurrency(localPurchase.overhead_analysis.original_allocated || 0)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">Already Consumed</span>
                        <p className="font-semibold text-gray-900 mt-1">
                          {formatCurrency(localPurchase.overhead_analysis.consumed_before_request || 0)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">This Purchase (incl. VAT)</span>
                        <p className="font-semibold text-gray-900 mt-1">
                          {(() => {
                            const subtotal = localPurchase.total_cost || 0;
                            const vatPercent = lpoData?.totals?.vat_percent ?? (localPurchase as any).vat_percent ?? 0;
                            const grandTotal = subtotal + (subtotal * vatPercent / 100);
                            return formatCurrency(grandTotal);
                          })()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">Remaining After</span>
                        <p className={`font-semibold mt-1 ${localPurchase.overhead_analysis.remaining_after_approval < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatCurrency(localPurchase.overhead_analysis.remaining_after_approval || 0)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Negotiable Price Consumption:</span>
                        <span className={`text-base font-semibold ${
                          ((localPurchase.overhead_analysis.consumed_before_request + localPurchase.total_cost) / localPurchase.overhead_analysis.original_allocated * 100) > 40
                            ? 'text-red-600'
                            : 'text-gray-900'
                        }`}>
                          {localPurchase.overhead_analysis.original_allocated > 0
                            ? (((localPurchase.overhead_analysis.consumed_before_request + localPurchase.total_cost) / localPurchase.overhead_analysis.original_allocated) * 100).toFixed(1)
                            : '0.0'
                          }%
                        </span>
                      </div>
                      {localPurchase.overhead_analysis.original_allocated > 0 &&
                       ((localPurchase.overhead_analysis.consumed_before_request + localPurchase.total_cost) / localPurchase.overhead_analysis.original_allocated * 100) > 40 && (
                        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          <span>Exceeds 40% threshold - TD approval was required</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (556 lines)
export default React.memo(PurchaseDetailsModal);
