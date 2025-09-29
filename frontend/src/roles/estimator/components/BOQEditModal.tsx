import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Save,
  Plus,
  Trash2,
  FileText,
  Package,
  Users,
  Calculator,
  AlertCircle,
  Loader2,
  Wrench,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { BOQ, BOQItemDetailed, BOQUpdatePayload, BOQMaterial, BOQLabour } from '../types';
import { estimatorService } from '../services/estimatorService';

interface BOQEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  boq: BOQ | null;
  onSave: () => void;
}

const BOQEditModal: React.FC<BOQEditModalProps> = ({
  isOpen,
  onClose,
  boq,
  onSave
}) => {
  const [editedBoq, setEditedBoq] = useState<BOQUpdatePayload | null>(null);
  const [originalBoq, setOriginalBoq] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'summary'>('items');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (boq && boq.boq_id) {
      fetchBOQDetails();
    }
  }, [boq]);

  const fetchBOQDetails = async () => {
    if (!boq?.boq_id) return;

    setIsLoading(true);
    try {
      const response = await estimatorService.getBOQById(boq.boq_id);
      if (response.success && response.data) {
        setOriginalBoq(response.data);

        // Convert to editable format
        const editableBoq: BOQUpdatePayload = {
          project_id: response.data.project_id,
          boq_id: response.data.boq_id,
          boq_name: response.data.boq_name || boq.boq_name || boq.title || '',
          status: response.data.status,
          items: (response.data.items || []).map((item: BOQItemDetailed) => ({
            item_id: item.master_item_id,
            item_name: item.item_name,
            description: item.description || '',
            overhead_percentage: item.overhead_percentage || 8,
            profit_margin_percentage: item.profit_margin_percentage || 12,
            status: 'Active',
            materials: (item.materials || []).map(mat => ({
              material_id: mat.master_material_id,
              material_name: mat.material_name,
              quantity: mat.quantity,
              unit: mat.unit,
              unit_price: mat.unit_price,
              total_price: mat.total_price
            })),
            labour: (item.labour || []).map(lab => ({
              labour_id: lab.master_labour_id,
              labour_role: lab.labour_role,
              hours: lab.hours,
              rate_per_hour: lab.rate_per_hour,
              total_cost: lab.total_cost,
              work_type: 'contract'
            }))
          }))
        };

        setEditedBoq(editableBoq);
        // Expand first item by default
        if (editableBoq.items.length > 0) {
          setExpandedItems(new Set([0]));
        }
      }
    } catch (error) {
      console.error('Error fetching BOQ details:', error);
      toast.error('Failed to load BOQ details');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !editedBoq) return null;

  const toggleItemExpansion = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleItemChange = (itemIndex: number, field: string, value: any) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      [field]: value
    };
    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const handleMaterialChange = (itemIndex: number, materialIndex: number, field: string, value: any) => {
    const updatedItems = [...editedBoq.items];
    const updatedMaterials = [...updatedItems[itemIndex].materials];

    updatedMaterials[materialIndex] = {
      ...updatedMaterials[materialIndex],
      [field]: value
    };

    // Recalculate total_price if quantity or unit_price changed
    if (field === 'quantity' || field === 'unit_price') {
      updatedMaterials[materialIndex].total_price =
        updatedMaterials[materialIndex].quantity * updatedMaterials[materialIndex].unit_price;
    }

    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      materials: updatedMaterials
    };

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const handleLabourChange = (itemIndex: number, labourIndex: number, field: string, value: any) => {
    const updatedItems = [...editedBoq.items];
    const updatedLabour = [...updatedItems[itemIndex].labour];

    updatedLabour[labourIndex] = {
      ...updatedLabour[labourIndex],
      [field]: value
    };

    // Recalculate total_cost if hours or rate_per_hour changed
    if (field === 'hours' || field === 'rate_per_hour') {
      updatedLabour[labourIndex].total_cost =
        updatedLabour[labourIndex].hours * updatedLabour[labourIndex].rate_per_hour;
    }

    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      labour: updatedLabour
    };

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const addItem = () => {
    const newItem = {
      item_name: 'New Item',
      description: 'Item description',
      overhead_percentage: 8,
      profit_margin_percentage: 12,
      status: 'Active',
      materials: [],
      labour: []
    };

    setEditedBoq({
      ...editedBoq,
      items: [...editedBoq.items, newItem]
    });

    // Expand the new item
    setExpandedItems(new Set([...expandedItems, editedBoq.items.length]));
  };

  const removeItem = (itemIndex: number) => {
    const updatedItems = editedBoq.items.filter((_, index) => index !== itemIndex);
    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const addMaterial = (itemIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].materials.push({
      material_name: 'New Material',
      quantity: 1,
      unit: 'nos',
      unit_price: 0,
      total_price: 0
    });

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const removeMaterial = (itemIndex: number, materialIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].materials = updatedItems[itemIndex].materials.filter(
      (_, index) => index !== materialIndex
    );

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const addLabour = (itemIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].labour.push({
      labour_role: 'Worker',
      hours: 8,
      rate_per_hour: 100,
      total_cost: 800,
      work_type: 'contract'
    });

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const removeLabour = (itemIndex: number, labourIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].labour = updatedItems[itemIndex].labour.filter(
      (_, index) => index !== labourIndex
    );

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const calculateItemTotals = (item: any) => {
    const materialTotal = item.materials.reduce((sum: number, mat: any) => sum + (mat.total_price || 0), 0);
    const labourTotal = item.labour.reduce((sum: number, lab: any) => sum + (lab.total_cost || 0), 0);
    const baseTotal = materialTotal + labourTotal;
    const overheadAmount = baseTotal * (item.overhead_percentage || 0) / 100;
    const profitAmount = baseTotal * (item.profit_margin_percentage || 0) / 100;
    const sellingPrice = baseTotal + overheadAmount + profitAmount;

    return {
      materialTotal,
      labourTotal,
      baseTotal,
      overheadAmount,
      profitAmount,
      sellingPrice
    };
  };

  const calculateGrandTotal = () => {
    return editedBoq.items.reduce((total, item) => {
      const itemTotals = calculateItemTotals(item);
      return total + itemTotals.sellingPrice;
    }, 0);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (!editedBoq.boq_id) {
        toast.error('BOQ ID is missing');
        return;
      }

      // Send the update payload to backend
      const result = await estimatorService.updateBOQ(editedBoq.boq_id, editedBoq);

      if (result.success) {
        toast.success('BOQ updated successfully');

        // Send update email notification
        await estimatorService.sendBOQEmail(editedBoq.boq_id, 'updated');

        onSave();
        onClose();
      } else {
        toast.error(result.message || 'Failed to update BOQ');
      }
    } catch (error) {
      toast.error('Failed to save BOQ changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-200 rounded-xl">
                  <FileText className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-blue-900">Edit BOQ</h2>
                  <p className="text-sm text-blue-700">
                    {editedBoq.boq_name || `BOQ #${editedBoq.boq_id}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-600 hover:bg-blue-200 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <p className="text-gray-600">Loading BOQ details...</p>
                </div>
              </div>
            ) : (
              <>
                {/* BOQ Info */}
                <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-xl p-6 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">BOQ Name</label>
                      <input
                        type="text"
                        value={editedBoq.boq_name}
                        onChange={(e) => setEditedBoq({ ...editedBoq, boq_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <select
                        value={editedBoq.status}
                        onChange={(e) => setEditedBoq({ ...editedBoq, status: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="Draft">Draft</option>
                        <option value="In_Review">In Review</option>
                        <option value="Sent_for_Confirmation">Sent for Confirmation</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setActiveTab('items')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'items'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Package className="w-4 h-4 inline mr-2" />
                    BOQ Items
                  </button>
                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'summary'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Calculator className="w-4 h-4 inline mr-2" />
                    Summary
                  </button>
                </div>

                {activeTab === 'items' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">BOQ Items</h3>
                      <button
                        onClick={addItem}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add Item
                      </button>
                    </div>

                    {editedBoq.items.map((item, itemIndex) => {
                      const totals = calculateItemTotals(item);
                      const isExpanded = expandedItems.has(itemIndex);

                      return (
                        <motion.div
                          key={itemIndex}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                        >
                          {/* Item Header */}
                          <div
                            className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 cursor-pointer"
                            onClick={() => toggleItemExpansion(itemIndex)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <input
                                  type="text"
                                  value={item.item_name}
                                  onChange={(e) => handleItemChange(itemIndex, 'item_name', e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-3 py-2 border border-blue-300 rounded-lg bg-white"
                                  placeholder="Item name"
                                />
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => handleItemChange(itemIndex, 'description', e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-3 py-2 border border-blue-300 rounded-lg bg-white"
                                  placeholder="Description"
                                />
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-blue-700">
                                    Total: ₹{totals.sellingPrice.toLocaleString()}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeItem(itemIndex);
                                    }}
                                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="p-4 space-y-6">
                              {/* Margins */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Overhead Percentage (%)
                                  </label>
                                  <input
                                    type="number"
                                    value={item.overhead_percentage}
                                    onChange={(e) => handleItemChange(itemIndex, 'overhead_percentage', Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    step="0.1"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Profit Margin (%)
                                  </label>
                                  <input
                                    type="number"
                                    value={item.profit_margin_percentage}
                                    onChange={(e) => handleItemChange(itemIndex, 'profit_margin_percentage', Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    step="0.1"
                                  />
                                </div>
                              </div>

                              {/* Materials Section */}
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-blue-600" />
                                    Materials
                                  </h4>
                                  <button
                                    onClick={() => addMaterial(itemIndex)}
                                    className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Add Material
                                  </button>
                                </div>

                                {item.materials.length === 0 ? (
                                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                                    No materials added
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-gray-50">
                                        <tr>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Material</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Qty</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Unit</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Rate</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Total</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.materials.map((material, matIndex) => (
                                          <tr key={matIndex} className="border-t border-gray-100">
                                            <td className="p-2">
                                              <input
                                                type="text"
                                                value={material.material_name}
                                                onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'material_name', e.target.value)}
                                                className="w-full px-2 py-1 border border-gray-300 rounded"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <input
                                                type="number"
                                                value={material.quantity}
                                                onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'quantity', Number(e.target.value))}
                                                className="w-20 px-2 py-1 border border-gray-300 rounded"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <input
                                                type="text"
                                                value={material.unit}
                                                onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'unit', e.target.value)}
                                                className="w-20 px-2 py-1 border border-gray-300 rounded"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <input
                                                type="number"
                                                value={material.unit_price}
                                                onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'unit_price', Number(e.target.value))}
                                                className="w-24 px-2 py-1 border border-gray-300 rounded"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <span className="font-medium">₹{material.total_price.toLocaleString()}</span>
                                            </td>
                                            <td className="p-2">
                                              <button
                                                onClick={() => removeMaterial(itemIndex, matIndex)}
                                                className="p-1 text-red-600 hover:bg-red-100 rounded"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Labour Section */}
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <Users className="w-4 h-4 text-blue-600" />
                                    Labour
                                  </h4>
                                  <button
                                    onClick={() => addLabour(itemIndex)}
                                    className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Add Labour
                                  </button>
                                </div>

                                {item.labour.length === 0 ? (
                                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                                    No labour added
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-gray-50">
                                        <tr>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Role</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Hours</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Rate/Hr</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Type</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600">Total</th>
                                          <th className="text-left p-2 text-xs font-semibold text-gray-600"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.labour.map((labour, labIndex) => (
                                          <tr key={labIndex} className="border-t border-gray-100">
                                            <td className="p-2">
                                              <input
                                                type="text"
                                                value={labour.labour_role}
                                                onChange={(e) => handleLabourChange(itemIndex, labIndex, 'labour_role', e.target.value)}
                                                className="w-full px-2 py-1 border border-gray-300 rounded"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <input
                                                type="number"
                                                value={labour.hours}
                                                onChange={(e) => handleLabourChange(itemIndex, labIndex, 'hours', Number(e.target.value))}
                                                className="w-20 px-2 py-1 border border-gray-300 rounded"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <input
                                                type="number"
                                                value={labour.rate_per_hour}
                                                onChange={(e) => handleLabourChange(itemIndex, labIndex, 'rate_per_hour', Number(e.target.value))}
                                                className="w-24 px-2 py-1 border border-gray-300 rounded"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <select
                                                value={labour.work_type}
                                                onChange={(e) => handleLabourChange(itemIndex, labIndex, 'work_type', e.target.value)}
                                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                                              >
                                                <option value="contract">Contract</option>
                                                <option value="daily_wages">Daily</option>
                                                <option value="piece_rate">Piece</option>
                                              </select>
                                            </td>
                                            <td className="p-2">
                                              <span className="font-medium">₹{labour.total_cost.toLocaleString()}</span>
                                            </td>
                                            <td className="p-2">
                                              <button
                                                onClick={() => removeLabour(itemIndex, labIndex)}
                                                className="p-1 text-red-600 hover:bg-red-100 rounded"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Item Summary */}
                              <div className="bg-gray-50 rounded-lg p-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-600">Material Cost:</span>
                                    <span className="ml-2 font-medium">₹{totals.materialTotal.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Labour Cost:</span>
                                    <span className="ml-2 font-medium">₹{totals.labourTotal.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Base Cost:</span>
                                    <span className="ml-2 font-medium">₹{totals.baseTotal.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Overhead:</span>
                                    <span className="ml-2 font-medium">₹{totals.overheadAmount.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Profit:</span>
                                    <span className="ml-2 font-medium">₹{totals.profitAmount.toLocaleString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600 font-semibold">Selling Price:</span>
                                    <span className="ml-2 font-bold text-blue-600">₹{totals.sellingPrice.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}

                    {editedBoq.items.length === 0 && (
                      <div className="text-center py-12 bg-gray-50 rounded-xl">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No items in this BOQ</p>
                        <button
                          onClick={addItem}
                          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Add First Item
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Summary Tab */
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-blue-900 mb-6 flex items-center gap-2">
                      <Calculator className="w-5 h-5" />
                      BOQ Summary
                    </h3>

                    <div className="space-y-4">
                      {editedBoq.items.map((item, index) => {
                        const totals = calculateItemTotals(item);
                        return (
                          <div key={index} className="bg-white rounded-lg p-4">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-medium text-gray-900">{item.item_name}</span>
                              <span className="font-bold text-blue-600">₹{totals.sellingPrice.toLocaleString()}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm text-gray-600">
                              <div>Materials: ₹{totals.materialTotal.toLocaleString()}</div>
                              <div>Labour: ₹{totals.labourTotal.toLocaleString()}</div>
                              <div>Margins: ₹{(totals.overheadAmount + totals.profitAmount).toLocaleString()}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-6 pt-6 border-t border-blue-200">
                      <div className="flex justify-between items-center text-xl font-bold text-blue-900">
                        <span>Grand Total:</span>
                        <span>₹{calculateGrandTotal().toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BOQEditModal;