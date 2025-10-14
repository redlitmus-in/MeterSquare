import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle } from 'lucide-react';
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

interface EditFormData {
  quantity: number;
  unit_rate: number;
  justification: string;
  remarks: string;
  reason: string;
}

const EditChangeRequestModal: React.FC<EditChangeRequestModalProps> = ({
  isOpen,
  onClose,
  changeRequest,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);

  // Extract first material/sub-item data from the change request
  const getMaterialData = () => {
    // Check if data is in sub_items_data or materials_data
    const items = changeRequest.sub_items_data || changeRequest.materials_data || [];
    const firstItem = items.length > 0 ? items[0] : null;

    return {
      quantity: firstItem?.quantity || firstItem?.qty || changeRequest.quantity || 0,
      unit_rate: firstItem?.unit_price || firstItem?.unit_rate || changeRequest.unit_rate || 0,
      sub_item_name: firstItem?.sub_item_name || firstItem?.material_name || changeRequest.sub_item_name || '',
      unit: firstItem?.unit || changeRequest.unit || '',
      location: firstItem?.location || changeRequest.project_location || '',
      area: changeRequest.area || '',
      reason: firstItem?.reason || changeRequest.new_sub_item_reason || ''
    };
  };

  const materialData = getMaterialData();

  const [formData, setFormData] = useState<EditFormData>({
    quantity: materialData.quantity,
    unit_rate: materialData.unit_rate,
    justification: changeRequest.justification || '',
    remarks: changeRequest.remarks || '',
    reason: materialData.reason || ''
  });

  useEffect(() => {
    if (changeRequest) {
      const matData = getMaterialData();
      setFormData({
        quantity: matData.quantity,
        unit_rate: matData.unit_rate,
        justification: changeRequest.justification || '',
        remarks: changeRequest.remarks || '',
        reason: matData.reason || ''
      });
    }
  }, [changeRequest]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.quantity || formData.quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (!formData.unit_rate || formData.unit_rate <= 0) {
      toast.error('Please enter a valid unit rate');
      return;
    }

    if (!formData.justification.trim()) {
      toast.error('Please provide justification for the change');
      return;
    }

    if (!formData.reason.trim()) {
      toast.error('Please provide a reason for this change');
      return;
    }

    setLoading(true);
    try {
      const response = await changeRequestService.updateChangeRequest(changeRequest.cr_id, {
        quantity: formData.quantity,
        unit_rate: formData.unit_rate,
        justification: formData.justification,
        remarks: formData.remarks,
        reason: formData.reason
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
      toast.error(error.response?.data?.message || 'Failed to update change request');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalAmount = formData.quantity * formData.unit_rate;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
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
              className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium leading-6 text-white">
                    Edit Change Request
                  </h3>
                  <button
                    onClick={onClose}
                    className="text-white hover:text-gray-200 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="px-6 py-4">
                {/* Material Info (Read-only) */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Material Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Project:</span>
                      <p className="font-medium">{changeRequest.project_name || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Location:</span>
                      <p className="font-medium">{materialData.location || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Area:</span>
                      <p className="font-medium">{materialData.area || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">BOQ:</span>
                      <p className="font-medium">{changeRequest.boq_name || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Item:</span>
                      <p className="font-medium">{changeRequest.item_name || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Sub Item Name:</span>
                      <p className="font-medium">{materialData.sub_item_name || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Unit:</span>
                      <p className="font-medium">{materialData.unit || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Editable Fields */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit Rate (AED) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData.unit_rate}
                      onChange={(e) => setFormData({ ...formData, unit_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Total Amount Display */}
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total Amount:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Justification */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Justification <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.justification}
                    onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Explain why this change is necessary..."
                    required
                    disabled={loading}
                  />
                </div>

                {/* Reason */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Explain the reason for this change request..."
                    required
                    disabled={loading}
                  />
                </div>

                {/* Remarks - Only show if data exists */}
                {(changeRequest.remarks || formData.remarks) && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Additional Remarks
                    </label>
                    <textarea
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Any additional notes or comments..."
                      disabled={loading}
                    />
                  </div>
                )}

                {/* Warning Message */}
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                    <p className="text-sm text-yellow-800">
                      Changes will need to be reviewed and approved again based on your role hierarchy.
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <ModernLoadingSpinners size="sm" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Update Request</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EditChangeRequestModal;