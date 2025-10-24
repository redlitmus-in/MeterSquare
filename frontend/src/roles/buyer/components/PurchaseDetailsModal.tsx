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
  Save
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
import { toast } from 'sonner';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editedMaterials, setEditedMaterials] = useState(purchase.materials);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && purchase.status === 'pending') {
      loadVendors();
      // Check if should open in edit mode
      const shouldEdit = sessionStorage.getItem('purchaseEditMode') === 'true';
      if (shouldEdit && purchase.status === 'pending') {
        setIsEditing(true);
        sessionStorage.removeItem('purchaseEditMode'); // Clear after use
      }
    }
  }, [isOpen, purchase.status]);

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
      toast.error('Failed to load vendors');
    } finally {
      setLoadingVendors(false);
    }
  };

  const handleSelectVendor = async () => {
    if (!selectedVendorId) {
      toast.error('Please select a vendor');
      return;
    }

    try {
      setIsSelectingVendor(true);
      await buyerService.selectVendor({
        cr_id: purchase.cr_id,
        vendor_id: selectedVendorId
      });
      toast.success('Vendor selected successfully! Waiting for TD approval.');
      onVendorSelected?.();
      onClose();
    } catch (error: any) {
      console.error('Error selecting vendor:', error);
      toast.error(error.message || 'Failed to select vendor');
    } finally {
      setIsSelectingVendor(false);
    }
  };

  const handleSavePurchase = async () => {
    try {
      setIsSaving(true);
      // Calculate total cost
      const totalCost = editedMaterials.reduce((sum, mat) => sum + mat.total_price, 0);

      await buyerService.updatePurchaseOrder({
        cr_id: purchase.cr_id,
        materials: editedMaterials,
        total_cost: totalCost
      });
      toast.success('Purchase order updated successfully!');
      setIsEditing(false);
      onVendorSelected?.(); // Refetch data
    } catch (error: any) {
      console.error('Error saving purchase order:', error);
      toast.error(error.message || 'Failed to update purchase order');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedMaterials(purchase.materials);
    setIsEditing(false);
  };

  const handleClose = () => {
    setIsEditing(false);
    setEditedMaterials(purchase.materials);
    sessionStorage.removeItem('purchaseEditMode');
    onClose();
  };

  const handleMaterialChange = (index: number, field: string, value: any) => {
    const updated = [...editedMaterials];
    updated[index] = { ...updated[index], [field]: value };

    // Recalculate total price if quantity or unit_price changed
    if (field === 'quantity' || field === 'unit_price') {
      updated[index].total_price = updated[index].quantity * updated[index].unit_price;
    }

    setEditedMaterials(updated);
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
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-5 border-b border-purple-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {purchase.project_name}
                      </h2>
                      <Badge className="bg-purple-100 text-purple-800">
                        CR #{purchase.cr_id}
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
                    className="p-2 hover:bg-purple-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Package className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Materials</div>
                        <div className="text-2xl font-bold text-purple-600">
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
                          {formatCurrency(purchase.total_cost)}
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
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="text-sm font-semibold text-blue-800 mb-2">Justification</div>
                    <div className="text-sm text-blue-900">{purchase.reason}</div>
                  </div>
                )}

                {/* Completion Notes */}
                {purchase.status === 'completed' && purchase.purchase_notes && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="text-sm font-semibold text-green-800 mb-2">Completion Notes</div>
                    <div className="text-sm text-green-900">{purchase.purchase_notes}</div>
                  </div>
                )}

                {/* Materials Table */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Package className="w-5 h-5" />
                      Materials Breakdown
                    </h3>
                    {purchase.status === 'pending' && (
                      !isEditing ? (
                        <Button
                          onClick={() => setIsEditing(true)}
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs px-3"
                        >
                          <Edit className="w-3.5 h-3.5 mr-1.5" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={handleCancelEdit}
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs px-3"
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSavePurchase}
                            size="sm"
                            className="h-8 text-xs px-3 bg-green-600 hover:bg-green-700 text-white"
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <>
                                <div className="w-3.5 h-3.5 mr-1.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                                Save Changes
                              </>
                            )}
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold text-sm">Material Name</TableHead>
                          <TableHead className="font-semibold text-sm">Sub-Item</TableHead>
                          <TableHead className="font-semibold text-sm">Quantity</TableHead>
                          <TableHead className="font-semibold text-sm">Unit</TableHead>
                          <TableHead className="font-semibold text-sm">Unit Price</TableHead>
                          <TableHead className="font-semibold text-sm text-right">Total Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(isEditing ? editedMaterials : purchase.materials).map((material, idx) => (
                          <TableRow key={idx} className="hover:bg-gray-50">
                            <TableCell className="font-medium text-sm">{material.material_name}</TableCell>
                            <TableCell className="text-sm">
                              {material.sub_item_name && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {material.sub_item_name}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={material.quantity}
                                  onChange={(e) => handleMaterialChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  min="0"
                                  step="0.01"
                                />
                              ) : (
                                material.quantity
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{material.unit}</TableCell>
                            <TableCell className="text-sm">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={material.unit_price}
                                  onChange={(e) => handleMaterialChange(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  min="0"
                                  step="0.01"
                                />
                              ) : (
                                formatCurrency(material.unit_price)
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-purple-600 text-sm">
                              {formatCurrency(material.total_price)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-purple-50 font-bold">
                          <TableCell colSpan={5} className="text-right text-sm">Total Cost:</TableCell>
                          <TableCell className="text-right text-purple-700 text-base">
                            {formatCurrency(
                              isEditing
                                ? editedMaterials.reduce((sum, mat) => sum + mat.total_price, 0)
                                : purchase.total_cost
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
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

export default PurchaseDetailsModal;
