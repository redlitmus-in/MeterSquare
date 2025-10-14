import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle, Plus, Trash2, Package } from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';

interface EditChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeRequest: ChangeRequestItem;
  onSuccess?: () => void;
}

interface MaterialItem {
  id: string;
  material_name: string;
  sub_item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  reason: string;
  master_material_id?: string | null;
}

const EditChangeRequestModal: React.FC<EditChangeRequestModalProps> = ({
  isOpen,
  onClose,
  changeRequest,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [justification, setJustification] = useState('');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);

  // Initialize form data when modal opens
  useEffect(() => {
    if (changeRequest && isOpen) {
      setJustification(changeRequest.justification || '');

      // Load existing materials from sub_items_data or materials_data
      const existingMaterials = changeRequest.sub_items_data || changeRequest.materials_data || [];

      if (existingMaterials.length > 0) {
        const loadedMaterials: MaterialItem[] = existingMaterials.map((item: any, index: number) => ({
          id: `existing-${index}`,
          material_name: item.material_name || item.sub_item_name || '',
          sub_item_name: item.sub_item_name || item.material_name || '',
          quantity: parseFloat(item.quantity || item.qty || 0),
          unit: item.unit || 'nos',
          unit_price: parseFloat(item.unit_price || item.unit_rate || 0),
          total_price: parseFloat(item.total_price || (item.quantity * item.unit_price) || 0),
          reason: item.reason || '',
          master_material_id: item.master_material_id || null
        }));
        setMaterials(loadedMaterials);
      } else {
        // Fallback - create one empty material
        setMaterials([createEmptyMaterial()]);
      }
    }
  }, [changeRequest, isOpen]);

  const createEmptyMaterial = (): MaterialItem => ({
    id: `new-${Date.now()}-${Math.random()}`,
    material_name: '',
    sub_item_name: '',
    quantity: 0,
    unit: 'nos',
    unit_price: 0,
    total_price: 0,
    reason: ''
  });

  const handleAddMaterial = () => {
    setMaterials([...materials, createEmptyMaterial()]);
  };

  const handleRemoveMaterial = (id: string) => {
    if (materials.length === 1) {
      toast.error('At least one material is required');
      return;
    }
    setMaterials(materials.filter(m => m.id !== id));
  };

  const handleMaterialChange = (id: string, field: keyof MaterialItem, value: any) => {
    setMaterials(materials.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value };

        // Auto-calculate total_price when quantity or unit_price changes
        if (field === 'quantity' || field === 'unit_price') {
          updated.total_price = updated.quantity * updated.unit_price;
        }

        // Sync material_name and sub_item_name
        if (field === 'material_name') {
          updated.sub_item_name = value;
        }
        if (field === 'sub_item_name') {
          updated.material_name = value;
        }

        return updated;
      }
      return m;
    }));
  };

  const calculateTotals = () => {
    const totalCost = materials.reduce((sum, m) => sum + m.total_price, 0);
    return { totalCost };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!justification.trim()) {
      toast.error('Please provide justification for the change');
      return;
    }

    const invalidMaterial = materials.find(m =>
      !m.material_name.trim() ||
      m.quantity <= 0 ||
      m.unit_price <= 0 ||
      !m.reason.trim()
    );

    if (invalidMaterial) {
      toast.error('Please fill all material fields correctly (name, quantity > 0, unit price > 0, reason)');
      return;
    }

    setLoading(true);
    try {
      // Prepare materials data for API
      const materialsData = materials.map(m => ({
        material_name: m.material_name,
        sub_item_name: m.sub_item_name,
        quantity: m.quantity,
        unit: m.unit,
        unit_price: m.unit_price,
        total_price: m.total_price,
        reason: m.reason,
        master_material_id: m.master_material_id || null
      }));

      const response = await changeRequestService.updateChangeRequest(changeRequest.cr_id, {
        justification: justification,
        materials: materialsData
      });

      if (response.success) {
        toast.success('Change request updated successfully');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast.error(response.message || 'Failed to update change request');
      }
    } catch (error: any) {
      console.error('Error updating change request:', error);
      toast.error(error.response?.data?.error || 'Failed to update change request');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const { totalCost } = calculateTotals();

  // Calculate overhead info
  const overheadInfo = {
    originalAllocated: changeRequest.original_overhead_allocated || 0,
    consumed: changeRequest.overhead_consumed || 0,
    newRequest: totalCost,
    totalConsumedAfterEdit: (changeRequest.overhead_consumed || 0) - (changeRequest.materials_total_cost || 0) + totalCost,
    available: (changeRequest.original_overhead_allocated || 0) - (changeRequest.overhead_consumed || 0) + (changeRequest.materials_total_cost || 0) - totalCost,
    percentageOfOverhead: ((changeRequest.original_overhead_allocated || 0) > 0)
      ? (((changeRequest.overhead_consumed || 0) - (changeRequest.materials_total_cost || 0) + totalCost) / (changeRequest.original_overhead_allocated || 0) * 100)
      : 0
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={onClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all w-full max-w-6xl max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                      <Package className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      Edit Change Request #{changeRequest.cr_id}
                    </h3>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                    disabled={loading}
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <form onSubmit={handleSubmit} id="edit-form">
                  {/* Project/BOQ Info */}
                  <div className="mb-6 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Project & BOQ Information
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 text-xs">Project:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.project_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">BOQ:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.boq_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">Item:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.item_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">Requested By:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.requested_by_name || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Overhead Summary */}
                  <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                    <h4 className="text-sm font-semibold text-purple-900 mb-3">Overhead Budget Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-purple-700 text-xs">Original Allocated:</span>
                        <p className="font-bold text-purple-900">{formatCurrency(overheadInfo.originalAllocated)}</p>
                      </div>
                      <div>
                        <span className="text-purple-700 text-xs">Already Consumed:</span>
                        <p className="font-bold text-orange-600">{formatCurrency(overheadInfo.consumed)}</p>
                      </div>
                      <div>
                        <span className="text-purple-700 text-xs">New Request Total:</span>
                        <p className="font-bold text-blue-600">{formatCurrency(overheadInfo.newRequest)}</p>
                      </div>
                      <div>
                        <span className="text-purple-700 text-xs">Available After Edit:</span>
                        <p className={`font-bold ${overheadInfo.available < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(overheadInfo.available)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-purple-300">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-purple-700">Total Overhead Consumption After Edit:</span>
                        <span className={`text-lg font-bold ${overheadInfo.percentageOfOverhead > 40 ? 'text-red-600' : 'text-green-600'}`}>
                          {overheadInfo.percentageOfOverhead.toFixed(1)}%
                        </span>
                      </div>
                      {overheadInfo.percentageOfOverhead > 40 && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Exceeds 40% threshold - TD approval required</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Justification */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Justification <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Explain why this change request is necessary..."
                      required
                      disabled={loading}
                    />
                  </div>

                  {/* Materials List */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-700">
                        Materials / Sub-Items <span className="text-red-500">*</span>
                      </h4>
                      <button
                        type="button"
                        onClick={handleAddMaterial}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                        disabled={loading}
                      >
                        <Plus className="w-4 h-4" />
                        Add Material
                      </button>
                    </div>

                    <div className="space-y-4">
                      {materials.map((material, index) => (
                        <div key={material.id} className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                          <div className="flex items-start justify-between mb-3">
                            <h5 className="text-sm font-medium text-gray-700">Material #{index + 1}</h5>
                            {materials.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMaterial(material.id)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                                disabled={loading}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Material Name */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Material / Sub-Item Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={material.material_name}
                                onChange={(e) => handleMaterialChange(material.id, 'material_name', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Enter material or sub-item name"
                                required
                                disabled={loading}
                              />
                            </div>

                            {/* Quantity */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Quantity <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={material.quantity || ''}
                                onChange={(e) => handleMaterialChange(material.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="0.00"
                                required
                                disabled={loading}
                              />
                            </div>

                            {/* Unit */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Unit <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={material.unit}
                                onChange={(e) => handleMaterialChange(material.id, 'unit', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                                placeholder="nos, sqm, etc."
                                required
                                disabled={loading}
                                readOnly
                              />
                            </div>

                            {/* Unit Price */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Unit Price (AED) <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={material.unit_price || ''}
                                onChange={(e) => handleMaterialChange(material.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="0.00"
                                required
                                disabled={loading}
                              />
                            </div>

                            {/* Total Price (Auto-calculated, read-only) */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Total Amount
                              </label>
                              <input
                                type="text"
                                value={formatCurrency(material.total_price)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-blue-50 text-sm font-semibold text-blue-700"
                                readOnly
                                disabled
                              />
                            </div>

                            {/* Reason */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Reason <span className="text-red-500">*</span>
                              </label>
                              <textarea
                                value={material.reason}
                                onChange={(e) => handleMaterialChange(material.id, 'reason', e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Why is this material needed?"
                                required
                                disabled={loading}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Total Summary */}
                  <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold text-blue-900">Total Request Amount:</span>
                      <span className="text-2xl font-bold text-blue-600">
                        {formatCurrency(totalCost)}
                      </span>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">
                      {materials.length} material{materials.length !== 1 ? 's' : ''} • Original: {formatCurrency(changeRequest.materials_total_cost || 0)} • Change: {formatCurrency(totalCost - (changeRequest.materials_total_cost || 0))}
                    </p>
                  </div>

                  {/* Warning Message */}
                  <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-900">Important Notes:</p>
                        <ul className="text-xs text-yellow-800 mt-2 space-y-1 list-disc list-inside">
                          <li>Changes will reset the approval workflow based on the new overhead percentage</li>
                          <li>Unit field is fixed and cannot be changed</li>
                          <li>Total amount is automatically calculated from quantity × unit price</li>
                          <li>All approvers will need to review the updated request</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              {/* Footer Actions */}
              <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-form"
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <ModernLoadingSpinners size="sm" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Update Change Request</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EditChangeRequestModal;
