import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CalculatorIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

interface SubItem {
  sub_item_id?: string | null;
  name: string;
  qty: number;
  unit: string;
  unit_price: number;
  is_new: boolean;
  new_reason?: string;
}

interface Project {
  project_id: number;
  project_name: string;
  areas: Area[];
}

interface Area {
  area_id: number;
  area_name: string;
  boqs: BOQ[];
}

interface BOQ {
  boq_id: number;
  boq_name: string;
  items: Item[];
}

interface Item {
  item_id: string;
  item_name: string;
  overhead_allocated: number;
  overhead_consumed: number;
  overhead_available: number;
  sub_items: ExistingSubItem[];
}

interface ExistingSubItem {
  sub_item_id: string;
  name: string;
  unit: string;
  unit_price: number;
  default_qty: number;
}

interface ItemOverhead {
  item_id: string;
  item_name: string;
  overhead_allocated: number;
  overhead_consumed: number;
  overhead_available: number;
}

interface ExtraSubItemsFormProps {
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

const ExtraSubItemsForm: React.FC<ExtraSubItemsFormProps> = ({ onSubmit, onCancel }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemOverhead, setItemOverhead] = useState<ItemOverhead | null>(null);
  const [subItems, setSubItems] = useState<SubItem[]>([{
    sub_item_id: null,
    name: '',
    qty: 0,
    unit: '',
    unit_price: 0,
    is_new: false,
    new_reason: ''
  }]);
  const [justification, setJustification] = useState('');
  const [fetchingOverhead, setFetchingOverhead] = useState(false);

  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('access_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Fetch assigned projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/projects/assigned-to-me`, { headers });
        setProjects(response.data.projects || []);
      } catch (error) {
        console.error('Error fetching projects:', error);
        toast.error('Failed to load assigned projects');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // Fetch item overhead when an item is selected
  useEffect(() => {
    if (selectedBoq && selectedItem) {
      const fetchItemOverhead = async () => {
        try {
          setFetchingOverhead(true);
          const response = await axios.get(
            `${API_URL}/boq/${selectedBoq.boq_id}/item-overhead/${selectedItem.item_id}`,
            { headers }
          );
          setItemOverhead(response.data);
        } catch (error) {
          console.error('Error fetching item overhead:', error);
          toast.error('Failed to load item overhead data');
        } finally {
          setFetchingOverhead(false);
        }
      };

      fetchItemOverhead();
    }
  }, [selectedBoq, selectedItem]);

  // Calculate totals
  const calculations = useMemo(() => {
    const totalCost = subItems.reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
    const percentageOfOverhead = itemOverhead
      ? (totalCost / itemOverhead.overhead_allocated * 100)
      : 0;
    const remainingAfter = itemOverhead
      ? itemOverhead.overhead_available - totalCost
      : 0;
    const exceeds40Percent = percentageOfOverhead > 40;

    return {
      totalCost,
      percentageOfOverhead,
      remainingAfter,
      exceeds40Percent
    };
  }, [subItems, itemOverhead]);

  const handleAddSubItem = () => {
    setSubItems([...subItems, {
      sub_item_id: null,
      name: '',
      qty: 0,
      unit: '',
      unit_price: 0,
      is_new: false,
      new_reason: ''
    }]);
  };

  const handleRemoveSubItem = (index: number) => {
    if (subItems.length > 1) {
      setSubItems(subItems.filter((_, i) => i !== index));
    }
  };

  const handleSubItemChange = (index: number, field: string, value: any) => {
    const updated = [...subItems];
    updated[index] = { ...updated[index], [field]: value };

    // If selecting an existing sub-item, populate defaults
    if (field === 'sub_item_id' && value && selectedItem) {
      const existingSubItem = selectedItem.sub_items.find(si => si.sub_item_id === value);
      if (existingSubItem) {
        updated[index] = {
          ...updated[index],
          sub_item_id: value,
          name: existingSubItem.name,
          unit: existingSubItem.unit,
          unit_price: existingSubItem.unit_price,
          qty: existingSubItem.default_qty,
          is_new: false,
          new_reason: ''
        };
      }
    }

    // If toggling to new sub-item
    if (field === 'is_new' && value === true) {
      updated[index] = {
        ...updated[index],
        sub_item_id: null,
        is_new: true
      };
    }

    setSubItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!selectedProject || !selectedArea || !selectedBoq || !selectedItem) {
      toast.error('Please select project, area, BOQ, and item');
      return;
    }

    if (subItems.length === 0) {
      toast.error('Please add at least one sub-item');
      return;
    }

    // Validate each sub-item
    for (const item of subItems) {
      if (!item.name || item.qty <= 0 || !item.unit || item.unit_price <= 0) {
        toast.error('Please fill all sub-item fields with valid values');
        return;
      }
      if (item.is_new && (!item.new_reason || item.new_reason.length < 10)) {
        toast.error('Please provide a reason (min 10 characters) for new sub-items');
        return;
      }
    }

    if (!justification || justification.length < 15) {
      toast.error('Please provide justification (min 15 characters)');
      return;
    }

    const payload = {
      requester_id: user?.user_id,
      project_id: selectedProject.project_id,
      area_id: selectedArea.area_id,
      boq_id: selectedBoq.boq_id,
      item_id: selectedItem.item_id,
      item_name: selectedItem.item_name,
      sub_items: subItems,
      justification
    };

    try {
      setLoading(true);
      await onSubmit(payload);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Project Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedProject?.project_id || ''}
          onChange={(e) => {
            const project = projects.find(p => p.project_id === parseInt(e.target.value));
            setSelectedProject(project || null);
            setSelectedArea(null);
            setSelectedBoq(null);
            setSelectedItem(null);
            setItemOverhead(null);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={loading}
          required
        >
          <option value="">Select Project</option>
          {projects.map(project => (
            <option key={project.project_id} value={project.project_id}>
              {project.project_name}
            </option>
          ))}
        </select>
      </div>

      {/* Area Selection */}
      {selectedProject && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Area <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedArea?.area_id || ''}
            onChange={(e) => {
              const area = selectedProject.areas.find(a => a.area_id === parseInt(e.target.value));
              setSelectedArea(area || null);
              setSelectedBoq(null);
              setSelectedItem(null);
              setItemOverhead(null);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          >
            <option value="">Select Area</option>
            {selectedProject.areas.map(area => (
              <option key={area.area_id} value={area.area_id}>
                {area.area_name}
              </option>
            ))}
          </select>
        </motion.div>
      )}

      {/* BOQ Selection */}
      {selectedArea && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            BOQ <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedBoq?.boq_id || ''}
            onChange={(e) => {
              const boq = selectedArea.boqs.find(b => b.boq_id === parseInt(e.target.value));
              setSelectedBoq(boq || null);
              setSelectedItem(null);
              setItemOverhead(null);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          >
            <option value="">Select BOQ</option>
            {selectedArea.boqs.map(boq => (
              <option key={boq.boq_id} value={boq.boq_id}>
                {boq.boq_name}
              </option>
            ))}
          </select>
        </motion.div>
      )}

      {/* Item Selection */}
      {selectedBoq && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            BOQ Item <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedItem?.item_id || ''}
            onChange={(e) => {
              const item = selectedBoq.items.find(i => i.item_id === e.target.value);
              setSelectedItem(item || null);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          >
            <option value="">Select Item</option>
            {selectedBoq.items.map(item => (
              <option key={item.item_id} value={item.item_id}>
                {item.item_name}
              </option>
            ))}
          </select>
        </motion.div>
      )}

      {/* Item Overhead Display */}
      {itemOverhead && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200"
        >
          <div className="flex items-center gap-2 mb-3">
            <CalculatorIcon className="w-5 h-5 text-blue-600" />
            <h3 className="font-medium text-blue-900">Item Overhead Budget</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Allocated</p>
              <p className="font-semibold text-gray-900">₹{itemOverhead.overhead_allocated.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Consumed</p>
              <p className="font-semibold text-gray-900">₹{itemOverhead.overhead_consumed.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Available</p>
              <p className="font-semibold text-green-600">₹{itemOverhead.overhead_available.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Sub-Items Section */}
      {selectedItem && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-medium text-gray-900">Sub-Items</h3>
            <button
              type="button"
              onClick={handleAddSubItem}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="w-4 h-4 mr-1" />
              Add Sub-Item
            </button>
          </div>

          <div className="space-y-4">
            <AnimatePresence>
              {subItems.map((subItem, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-gray-50 p-4 rounded-lg border border-gray-200"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium text-gray-900">Sub-Item #{index + 1}</h4>
                    {subItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSubItem(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {/* New Sub-Item Toggle */}
                  <div className="mb-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={subItem.is_new}
                        onChange={(e) => handleSubItemChange(index, 'is_new', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Add New Sub-Item</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Sub-Item Selection or Name */}
                    {!subItem.is_new ? (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select Sub-Item <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={subItem.sub_item_id || ''}
                          onChange={(e) => handleSubItemChange(index, 'sub_item_id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        >
                          <option value="">Select Sub-Item</option>
                          {selectedItem.sub_items.map(si => (
                            <option key={si.sub_item_id} value={si.sub_item_id}>
                              {si.name} ({si.unit})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Sub-Item Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={subItem.name}
                            onChange={(e) => handleSubItemChange(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Reason for New Sub-Item <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={subItem.new_reason || ''}
                            onChange={(e) => handleSubItemChange(index, 'new_reason', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            rows={2}
                            placeholder="Min 10 characters"
                            required
                          />
                        </div>
                      </>
                    )}

                    {/* Quantity */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={subItem.qty}
                        onChange={(e) => handleSubItemChange(index, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0.01"
                        step="0.01"
                        required
                      />
                    </div>

                    {/* Unit */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={subItem.unit}
                        onChange={(e) => handleSubItemChange(index, 'unit', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={!subItem.is_new}
                        required
                      />
                    </div>

                    {/* Unit Price */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit Price (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={subItem.unit_price}
                        onChange={(e) => handleSubItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0.01"
                        step="0.01"
                        disabled={!subItem.is_new}
                        required
                      />
                    </div>

                    {/* Total */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total (₹)
                      </label>
                      <input
                        type="text"
                        value={(subItem.qty * subItem.unit_price).toLocaleString()}
                        className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg"
                        disabled
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Justification */}
      {selectedItem && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Justification <span className="text-red-500">*</span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            placeholder="Explain why these additional sub-items are needed (min 15 characters)"
            required
          />
        </motion.div>
      )}

      {/* Calculations Summary */}
      {selectedItem && subItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-50 p-4 rounded-lg border border-gray-200"
        >
          <h3 className="font-medium text-gray-900 mb-3">Request Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Cost</p>
              <p className="font-semibold text-gray-900">₹{calculations.totalCost.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">% of Item Overhead</p>
              <p className={`font-semibold ${calculations.exceeds40Percent ? 'text-red-600' : 'text-green-600'}`}>
                {calculations.percentageOfOverhead.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-gray-600">Remaining After</p>
              <p className={`font-semibold ${calculations.remainingAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                ₹{calculations.remainingAfter.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Approval Route</p>
              <p className="font-semibold text-gray-900">
                {calculations.exceeds40Percent ? 'Technical Director' : 'Estimator'}
              </p>
            </div>
          </div>

          {/* Warnings */}
          {calculations.exceeds40Percent && (
            <div className="mt-3 flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">This request exceeds 40% of item overhead and will route to Technical Director</p>
            </div>
          )}
          {calculations.remainingAfter < 0 && (
            <div className="mt-3 flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">This request will exceed the available overhead budget</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !selectedItem || subItems.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
};

export default ExtraSubItemsForm;