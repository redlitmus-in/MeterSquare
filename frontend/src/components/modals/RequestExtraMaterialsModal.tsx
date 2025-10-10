import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Package, AlertCircle, DollarSign, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { changeRequestService } from '@/services/changeRequestService';

interface Material {
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  related_item: string; // Which BOQ item this material is for
}

interface RequestExtraMaterialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boqId: number;
  boqName: string;
  boqItems?: Array<{ id: number; description: string }>;
  overheadBudget?: {
    totalAllocated: number;
    alreadyConsumed: number;
    available: number;
  };
  onSuccess?: () => void;
}

const RequestExtraMaterialsModal: React.FC<RequestExtraMaterialsModalProps> = ({
  isOpen,
  onClose,
  boqId,
  boqName,
  boqItems = [],
  overheadBudget,
  onSuccess
}) => {
  const [justification, setJustification] = useState('');
  const [materials, setMaterials] = useState<Material[]>([
    { material_name: '', quantity: 0, unit: 'nos', unit_price: 0, related_item: '' }
  ]);
  const [loading, setLoading] = useState(false);

  const handleAddMaterial = () => {
    setMaterials([...materials, { material_name: '', quantity: 0, unit: 'nos', unit_price: 0, related_item: '' }]);
  };

  const handleRemoveMaterial = (index: number) => {
    if (materials.length === 1) {
      toast.error('At least one material is required');
      return;
    }
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const handleMaterialChange = (index: number, field: keyof Material, value: string | number) => {
    const updated = [...materials];
    updated[index] = { ...updated[index], [field]: value };
    setMaterials(updated);
  };

  const calculateTotal = () => {
    return materials.reduce((sum, mat) => sum + (mat.quantity * mat.unit_price), 0);
  };

  const handleSubmit = async () => {
    // Validation
    if (!justification.trim()) {
      toast.error('Justification is required');
      return;
    }

    const validMaterials = materials.filter(
      m => m.material_name.trim() && m.quantity > 0 && m.unit_price > 0
    );

    if (validMaterials.length === 0) {
      toast.error('At least one valid material is required');
      return;
    }

    setLoading(true);
    try {
      const response = await changeRequestService.createChangeRequest({
        boq_id: boqId,
        justification: justification.trim(),
        materials: validMaterials
      });

      if (response.success) {
        toast.success('Change request submitted successfully');
        onSuccess?.();
        handleClose();
      } else {
        toast.error(response.message || 'Failed to create change request');
      }
    } catch (error) {
      console.error('Error submitting change request:', error);
      toast.error('Failed to submit change request');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setJustification('');
    setMaterials([{ material_name: '', quantity: 0, unit: 'nos', unit_price: 0, related_item: '' }]);
    onClose();
  };

  if (!isOpen) return null;

  const totalCost = calculateTotal();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Request Extra Materials</h2>
                    <p className="text-sm text-purple-100">BOQ: {boqName}</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {/* Justification */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Justification *
                  </label>
                  <textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Explain why these additional materials are needed..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>

                {/* Materials List */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Materials *
                    </label>
                    <Button
                      size="sm"
                      onClick={handleAddMaterial}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Material
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {materials.map((material, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-12 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        {/* Related BOQ Item */}
                        <div className="col-span-12">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Related BOQ Item *
                          </label>
                          <div className="relative">
                            <select
                              value={material.related_item}
                              onChange={(e) => handleMaterialChange(index, 'related_item', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                              <option value="">Select BOQ Item or Add New</option>
                              {boqItems.length > 0 && <optgroup label="Existing BOQ Items">
                                {boqItems.map((item) => (
                                  <option key={item.id} value={item.description}>
                                    {item.description}
                                  </option>
                                ))}
                              </optgroup>}
                              <option value="__new__">+ Add New Item</option>
                            </select>
                          </div>
                          {material.related_item === '__new__' && (
                            <Input
                              value=""
                              onChange={(e) => handleMaterialChange(index, 'related_item', e.target.value)}
                              placeholder="Enter new BOQ item name"
                              className="text-sm mt-2"
                              autoFocus
                            />
                          )}
                          <p className="text-[10px] text-gray-500 mt-1">Select existing BOQ item or add a new one</p>
                        </div>

                        {/* Material Name with Flexible Input */}
                        <div className="col-span-4">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Material Name *
                          </label>
                          <Input
                            value={material.material_name}
                            onChange={(e) => handleMaterialChange(index, 'material_name', e.target.value)}
                            placeholder="Type or select material"
                            list={`materials-list-${index}`}
                            className="text-sm"
                          />
                          <datalist id={`materials-list-${index}`}>
                            <option value="Cement" />
                            <option value="Steel Bars" />
                            <option value="Sand" />
                            <option value="Aggregate" />
                            <option value="Bricks" />
                            <option value="Tiles" />
                            <option value="Paint" />
                            <option value="Wood" />
                            <option value="Glass" />
                            <option value="Plumbing Pipes" />
                            <option value="Electrical Wires" />
                            <option value="Concrete Blocks" />
                            <option value="Marble" />
                            <option value="Granite" />
                            <option value="Gypsum Board" />
                            <option value="Aluminum" />
                          </datalist>
                          <p className="text-[10px] text-gray-500 mt-1">Type any material or select from suggestions</p>
                        </div>

                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Quantity *
                          </label>
                          <Input
                            type="number"
                            value={material.quantity || ''}
                            onChange={(e) => handleMaterialChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="text-sm"
                            min="0"
                            step="0.01"
                          />
                        </div>

                        {/* Unit with Flexible Input */}
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Unit *
                          </label>
                          <Input
                            value={material.unit}
                            onChange={(e) => handleMaterialChange(index, 'unit', e.target.value)}
                            placeholder="Select or type"
                            list={`units-list-${index}`}
                            className="text-sm"
                          />
                          <datalist id={`units-list-${index}`}>
                            <option value="nos" />
                            <option value="kg" />
                            <option value="bags" />
                            <option value="sqm" />
                            <option value="sqft" />
                            <option value="m" />
                            <option value="ft" />
                            <option value="cu.m" />
                            <option value="cu.ft" />
                            <option value="liters" />
                            <option value="tons" />
                            <option value="boxes" />
                            <option value="rolls" />
                            <option value="sheets" />
                          </datalist>
                        </div>

                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Unit Price (AED) *
                          </label>
                          <Input
                            type="number"
                            value={material.unit_price || ''}
                            onChange={(e) => handleMaterialChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="text-sm"
                            min="0"
                            step="0.01"
                          />
                        </div>

                        <div className="col-span-1 flex items-end">
                          <button
                            onClick={() => handleRemoveMaterial(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={materials.length === 1}
                            title={materials.length === 1 ? "At least one material required" : "Remove material"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Total for this material */}
                        <div className="col-span-12 text-right text-sm font-semibold text-gray-700 border-t border-gray-300 pt-2">
                          Item Total: AED {(material.quantity * material.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total Cost Summary */}
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border-2 border-purple-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                      <span className="text-lg font-bold text-purple-900">Total Materials Cost:</span>
                    </div>
                    <span className="text-2xl font-bold text-purple-600">
                      AED {totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Overhead Budget Impact */}
                {overheadBudget && totalCost > 0 && (() => {
                  const remainingAfterRequest = overheadBudget.available - totalCost;
                  const isWithinBudget = remainingAfterRequest >= 0;

                  return (
                    <div className={`border-2 rounded-lg p-4 ${
                      isWithinBudget
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          isWithinBudget ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          <TrendingUp className={`w-5 h-5 ${
                            isWithinBudget ? 'text-green-600' : 'text-red-600'
                          }`} />
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-semibold mb-3 ${
                            isWithinBudget ? 'text-green-900' : 'text-red-900'
                          }`}>
                            Overhead Budget Analysis
                          </p>
                          <div className={`space-y-2 text-sm ${
                            isWithinBudget ? 'text-green-800' : 'text-red-800'
                          }`}>
                            <div className="flex justify-between">
                              <span className="font-medium">Available Overhead Budget:</span>
                              <span className="font-bold">
                                AED {overheadBudget.available.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-medium">Requested Amount:</span>
                              <span className="font-bold">
                                AED {totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className={`pt-2 border-t flex justify-between ${
                              isWithinBudget ? 'border-green-300' : 'border-red-300'
                            }`}>
                              <span className="font-semibold">
                                {isWithinBudget ? 'Remaining After Request:' : 'Over Budget By:'}
                              </span>
                              <span className="font-bold">
                                AED {Math.abs(remainingAfterRequest).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className={`mt-3 px-3 py-2 rounded-lg text-center ${
                            isWithinBudget
                              ? 'bg-green-100 border border-green-300'
                              : 'bg-red-100 border border-red-300'
                          }`}>
                            <p className={`text-sm font-bold ${
                              isWithinBudget ? 'text-green-800' : 'text-red-800'
                            }`}>
                              {isWithinBudget ? '✓ Within Overhead Budget' : '⚠ Exceeds Overhead Budget'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Warning */}
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">Please Note:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>This request will consume from the project overhead budget</li>
                      <li>Requests over AED 50,000 require Technical Director approval</li>
                      <li>You'll be notified once the request is reviewed</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !justification.trim() || materials.every(m => !m.material_name.trim())}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {loading ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default RequestExtraMaterialsModal;
