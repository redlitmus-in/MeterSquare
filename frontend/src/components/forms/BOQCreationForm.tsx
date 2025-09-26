import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Plus,
  Trash2,
  Save,
  FileText,
  Package,
  DollarSign,
  Users,
  Calculator,
  ChevronDown,
  ChevronRight,
  Upload,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface BOQItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  materials: Material[];
  labor: Labor[];
  overheadPercent: number;
  profitPercent: number;
}

interface Material {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

interface Labor {
  id: string;
  type: string;
  hours: number;
  rate: number;
}

interface BOQCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: any) => void;
}

const BOQCreationForm: React.FC<BOQCreationFormProps> = ({ isOpen, onClose, onSubmit }) => {
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [items, setItems] = useState<BOQItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [overallOverhead, setOverallOverhead] = useState(10);
  const [overallProfit, setOverallProfit] = useState(15);

  const addItem = () => {
    const newItem: BOQItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unit: 'nos',
      materials: [],
      labor: [],
      overheadPercent: overallOverhead,
      profitPercent: overallProfit
    };
    setItems([...items, newItem]);
    setExpandedItems([...expandedItems, newItem.id]);
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
    setExpandedItems(expandedItems.filter(id => id !== itemId));
  };

  const toggleItemExpanded = (itemId: string) => {
    if (expandedItems.includes(itemId)) {
      setExpandedItems(expandedItems.filter(id => id !== itemId));
    } else {
      setExpandedItems([...expandedItems, itemId]);
    }
  };

  const updateItem = (itemId: string, field: keyof BOQItem, value: any) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const addMaterial = (itemId: string) => {
    const newMaterial: Material = {
      id: Date.now().toString(),
      name: '',
      quantity: 1,
      unit: 'nos',
      unitPrice: 0
    };

    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, materials: [...item.materials, newMaterial] }
        : item
    ));
  };

  const removeMaterial = (itemId: string, materialId: string) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, materials: item.materials.filter(m => m.id !== materialId) }
        : item
    ));
  };

  const updateMaterial = (itemId: string, materialId: string, field: keyof Material, value: any) => {
    setItems(items.map(item =>
      item.id === itemId
        ? {
            ...item,
            materials: item.materials.map(m =>
              m.id === materialId ? { ...m, [field]: value } : m
            )
          }
        : item
    ));
  };

  const addLabor = (itemId: string) => {
    const newLabor: Labor = {
      id: Date.now().toString(),
      type: '',
      hours: 1,
      rate: 0
    };

    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, labor: [...item.labor, newLabor] }
        : item
    ));
  };

  const removeLabor = (itemId: string, laborId: string) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, labor: item.labor.filter(l => l.id !== laborId) }
        : item
    ));
  };

  const updateLabor = (itemId: string, laborId: string, field: keyof Labor, value: any) => {
    setItems(items.map(item =>
      item.id === itemId
        ? {
            ...item,
            labor: item.labor.map(l =>
              l.id === laborId ? { ...l, [field]: value } : l
            )
          }
        : item
    ));
  };

  const calculateItemCost = (item: BOQItem) => {
    const materialCost = item.materials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
    const laborCost = item.labor.reduce((sum, l) => sum + (l.hours * l.rate), 0);
    const subtotal = materialCost + laborCost;
    const overheadAmount = subtotal * (item.overheadPercent / 100);
    const profitAmount = (subtotal + overheadAmount) * (item.profitPercent / 100);
    return subtotal + overheadAmount + profitAmount;
  };

  const calculateTotalCost = () => {
    return items.reduce((sum, item) => sum + calculateItemCost(item), 0);
  };

  const handleSubmit = () => {
    if (!projectName || !clientName || !location) {
      toast.error('Please fill in all project details');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one BOQ item');
      return;
    }

    const boqData = {
      projectName,
      clientName,
      location,
      items: items.map(item => ({
        ...item,
        totalCost: calculateItemCost(item)
      })),
      totalValue: calculateTotalCost(),
      createdAt: new Date().toISOString()
    };

    if (onSubmit) {
      onSubmit(boqData);
    }

    toast.success('BOQ created successfully');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6" />
              <h2 className="text-xl font-semibold">Create New BOQ</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
            {/* Project Details */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter project name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter client name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location *
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter project location"
                  />
                </div>
              </div>
            </div>

            {/* Default Overhead & Profit */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-semibold text-blue-900">Default Overhead & Profit</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-blue-700 mb-1">Overhead %</label>
                  <input
                    type="number"
                    value={overallOverhead}
                    onChange={(e) => setOverallOverhead(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-blue-700 mb-1">Profit Margin %</label>
                  <input
                    type="number"
                    value={overallProfit}
                    onChange={(e) => setOverallProfit(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* BOQ Items */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">BOQ Items</h3>
                <button
                  onClick={addItem}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg">
                    {/* Item Header */}
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          onClick={() => toggleItemExpanded(item.id)}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          {expandedItems.includes(item.id) ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <span className="text-sm font-medium text-gray-700">Item #{index + 1}</span>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                          placeholder="Item description"
                        />
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                          placeholder="Qty"
                        />
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 rounded"
                        >
                          <option value="nos">Nos</option>
                          <option value="sqft">Sqft</option>
                          <option value="rft">Rft</option>
                          <option value="kg">Kg</option>
                          <option value="ltr">Ltr</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-sm font-medium text-gray-900">
                          ₹{calculateItemCost(item).toLocaleString()}
                        </span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Item Details (Expandable) */}
                    {expandedItems.includes(item.id) && (
                      <div className="p-4 space-y-4">
                        {/* Materials Section */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              Raw Materials
                            </h4>
                            <button
                              onClick={() => addMaterial(item.id)}
                              className="text-xs text-indigo-600 hover:text-indigo-700"
                            >
                              + Add Material
                            </button>
                          </div>
                          <div className="space-y-2">
                            {item.materials.map((material) => (
                              <div key={material.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={material.name}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'name', e.target.value)}
                                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Material name"
                                />
                                <input
                                  type="number"
                                  value={material.quantity}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'quantity', Number(e.target.value))}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Qty"
                                />
                                <select
                                  value={material.unit}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'unit', e.target.value)}
                                  className="px-2 py-1 text-sm border border-gray-300 rounded"
                                >
                                  <option value="nos">Nos</option>
                                  <option value="kg">Kg</option>
                                  <option value="ltr">Ltr</option>
                                  <option value="mtr">Mtr</option>
                                </select>
                                <input
                                  type="number"
                                  value={material.unitPrice}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'unitPrice', Number(e.target.value))}
                                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Unit price"
                                />
                                <button
                                  onClick={() => removeMaterial(item.id, material.id)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Labor Section */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Labor
                            </h4>
                            <button
                              onClick={() => addLabor(item.id)}
                              className="text-xs text-indigo-600 hover:text-indigo-700"
                            >
                              + Add Labor
                            </button>
                          </div>
                          <div className="space-y-2">
                            {item.labor.map((labor) => (
                              <div key={labor.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={labor.type}
                                  onChange={(e) => updateLabor(item.id, labor.id, 'type', e.target.value)}
                                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Labor type"
                                />
                                <input
                                  type="number"
                                  value={labor.hours}
                                  onChange={(e) => updateLabor(item.id, labor.id, 'hours', Number(e.target.value))}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Hours"
                                />
                                <input
                                  type="number"
                                  value={labor.rate}
                                  onChange={(e) => updateLabor(item.id, labor.id, 'rate', Number(e.target.value))}
                                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Rate/hour"
                                />
                                <button
                                  onClick={() => removeLabor(item.id, labor.id)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Overhead & Profit for this item */}
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Overhead %</label>
                            <input
                              type="number"
                              value={item.overheadPercent}
                              onChange={(e) => updateItem(item.id, 'overheadPercent', Number(e.target.value))}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Profit %</label>
                            <input
                              type="number"
                              value={item.profitPercent}
                              onChange={(e) => updateItem(item.id, 'profitPercent', Number(e.target.value))}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {items.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">No items added yet</p>
                  <p className="text-sm text-gray-400 mt-1">Click "Add Item" to start building your BOQ</p>
                </div>
              )}
            </div>

            {/* Total Summary */}
            {items.length > 0 && (
              <div className="bg-gradient-to-r from-indigo-50 to-indigo-100 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-indigo-900">Total Project Value</h3>
                  <span className="text-2xl font-bold text-indigo-900">
                    ₹{calculateTotalCost().toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Upload className="w-4 h-4" />
                Import Template
              </button>
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                Create BOQ
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default BOQCreationForm;