import React, { useState, useEffect } from 'react';
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
  Edit,
  Save,
  Mail,
  Phone,
  Tag,
  Clock
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { buyerVendorService, Vendor } from '../services/buyerVendorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

interface PurchaseDetailsModalProps {
  purchase: Purchase;
  isOpen: boolean;
  onClose: () => void;
  onVendorSelected?: () => void;
}

const PurchaseDetailsModal: React.FC<PurchaseDetailsModalProps> = ({
  purchase,
  isOpen,
  onClose,
  onVendorSelected
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(purchase.vendor_id || null);
  const [isSelectingVendor, setIsSelectingVendor] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedMaterials, setEditedMaterials] = useState(purchase.materials);
  const [isSaving, setIsSaving] = useState(false);

  // Local purchase state to hold updated data
  const [localPurchase, setLocalPurchase] = useState<Purchase>(purchase);

  // Reset edited materials and local purchase when purchase changes or modal opens
  useEffect(() => {
    // CRITICAL FIX: When vendor is approved, calculate total_cost from materials' vendor prices
    // instead of using the BOQ total_cost that comes from backend
    let updatedPurchase = { ...purchase };
    
    // If vendor is approved, recalculate total_cost from materials (which have vendor prices)
    if (purchase.vendor_selection_status === 'approved' && purchase.materials && purchase.materials.length > 0) {
      const vendorTotalCost = purchase.materials.reduce((sum, mat) => {
        return sum + (mat.total_price || (mat.unit_price * mat.quantity) || 0);
      }, 0);
      updatedPurchase.total_cost = vendorTotalCost;
    }
    
    setLocalPurchase(updatedPurchase);
    setEditedMaterials(purchase.materials);
    setIsEditMode(false);
  }, [purchase.cr_id, isOpen, purchase]);

  useEffect(() => {
    if (isOpen && purchase.status === 'pending') {
      loadVendors();
    }
  }, [isOpen, purchase.status]);

  // Calculate total cost from edited materials
  const calculateTotalCost = (materials: any[]) => {
    return materials.reduce((sum, mat) => sum + (mat.total_price || 0), 0);
  };

  // Handle material field changes
  const handleMaterialChange = (index: number, field: string, value: any) => {
    const updated = [...editedMaterials];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-calculate total_price when quantity or unit_price changes
    if (field === 'quantity' || field === 'unit_price') {
      const quantity = field === 'quantity' ? parseFloat(value) || 0 : updated[index].quantity;
      const unitPrice = field === 'unit_price' ? parseFloat(value) || 0 : updated[index].unit_price;
      updated[index].total_price = quantity * unitPrice;
    }

    setEditedMaterials(updated);
  };

  // Save edited purchase
  const handleSavePurchase = async () => {
    try {
      setIsSaving(true);
      const totalCost = calculateTotalCost(editedMaterials);

      await buyerService.updatePurchaseOrder({
        cr_id: purchase.cr_id,
        materials: editedMaterials,
        total_cost: totalCost
      });

      // Update local purchase state immediately to reflect changes
      setLocalPurchase({
        ...localPurchase,
        materials: editedMaterials,
        total_cost: totalCost
      });

      showSuccess('Purchase amounts updated successfully!');
      setIsEditMode(false);
      onVendorSelected?.(); // Refresh the purchase list
    } catch (error: any) {
      console.error('Error saving purchase:', error);
      showError(error.message || 'Failed to update purchase amounts');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditedMaterials(localPurchase.materials);
    setIsEditMode(false);
  };

  const loadVendors = async () => {
    try {
      setLoadingVendors(true);
      const response = await buyerVendorService.getAllVendors({
        status: 'active',
        per_page: 100
      });
      setVendors(response.vendors);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      showError('Failed to load vendors');
    } finally {
      setLoadingVendors(false);
    }
  };

  const handleSelectVendor = async () => {
    if (!selectedVendorId) {
      showError('Please select a vendor');
      return;
    }

    try {
      setIsSelectingVendor(true);
      await buyerService.selectVendor({
        cr_id: purchase.cr_id,
        vendor_id: selectedVendorId
      });
      showSuccess('Vendor selected successfully! Waiting for TD approval.');
      onVendorSelected?.();
      onClose();
    } catch (error: any) {
      console.error('Error selecting vendor:', error);
      showError(error.message || 'Failed to select vendor');
    } finally {
      setIsSelectingVendor(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

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
                        <div className="text-sm text-gray-600">Total Cost</div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency(isEditMode ? calculateTotalCost(editedMaterials) : localPurchase.total_cost)}
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
                    {/* Edit button - only show when NO vendor selected yet (before sending for approval) */}
                    {/* Hide when pending_td_approval or approved - buyer already submitted */}
                    {!purchase.vendor_selection_status && !purchase.vendor_id && !isEditMode && (
                      <Button
                        onClick={() => setIsEditMode(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Amounts
                      </Button>
                    )}
                    {/* Save/Cancel buttons when in edit mode */}
                    {isEditMode && (
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCancelEdit}
                          variant="outline"
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSavePurchase}
                          disabled={isSaving}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
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
                          <TableHead className="font-semibold text-sm">Specs</TableHead>
                          <TableHead className="font-semibold text-sm">Quantity</TableHead>
                          <TableHead className="font-semibold text-sm">Unit</TableHead>
                          <TableHead className="font-semibold text-sm">Unit Price</TableHead>
                          <TableHead className="font-semibold text-sm text-right">Total Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(isEditMode ? editedMaterials : localPurchase.materials).map((material, idx) => {
                          // Check if material is NEW (only show badge for truly new materials, not BOQ materials)
                          const isNewMaterial = material.master_material_id === null || material.master_material_id === undefined;
                          return (
                          <TableRow key={idx} className="hover:bg-gray-50">
                            <TableCell className="font-medium text-sm">
                              <div className="flex items-center gap-2">
                                <span>{material.material_name}</span>
                                {isNewMaterial && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-800 border border-green-300">
                                    NEW
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
                            <TableCell className="text-sm">{(material as any).specification || '-'}</TableCell>
                            <TableCell className="text-sm">
                              {isEditMode ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={material.quantity}
                                  onChange={(e) => handleMaterialChange(idx, 'quantity', e.target.value)}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              ) : (
                                material.quantity
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{material.unit}</TableCell>
                            <TableCell className="text-sm">
                              {isEditMode ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={material.unit_price}
                                  onChange={(e) => handleMaterialChange(idx, 'unit_price', e.target.value)}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              ) : (
                                formatCurrency(material.unit_price)
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600 text-sm">
                              {formatCurrency(material.total_price)}
                            </TableCell>
                          </TableRow>
                          );
                        })}
                        <TableRow className="bg-blue-50 font-bold">
                          <TableCell colSpan={7} className="text-right text-sm">Total Cost:</TableCell>
                          <TableCell className="text-right text-green-700 text-base">
                            {formatCurrency(isEditMode ? calculateTotalCost(editedMaterials) : localPurchase.total_cost)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Negotiable Price Summary - Show if has new materials */}
                {localPurchase.materials.some(mat => mat.master_material_id === null || mat.master_material_id === undefined) && localPurchase.overhead_analysis && (
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
                        <span className="text-gray-500 text-xs">This Purchase</span>
                        <p className="font-semibold text-gray-900 mt-1">
                          {formatCurrency(localPurchase.total_cost || 0)}
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
