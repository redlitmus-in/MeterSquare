import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CalculatorIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

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
  sub_items: SubItem[];
}

interface SubItem {
  sub_item_id: string;
  name: string;
  unit: string;
  unit_price: number;
  default_qty: number;
}

interface ExtraMaterialFormProps {
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

const ExtraMaterialForm: React.FC<ExtraMaterialFormProps> = ({ onSubmit, onCancel }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // Dynamic field states
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedSubItem, setSelectedSubItem] = useState<SubItem | null>(null);

  // Form fields
  const [isNewSubItem, setIsNewSubItem] = useState(false);
  const [subItemName, setSubItemName] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState('');
  const [unitRate, setUnitRate] = useState(0);
  const [reasonForNew, setReasonForNew] = useState('');
  const [remarks, setRemarks] = useState('');

  // Overhead calculations
  const [itemOverhead, setItemOverhead] = useState<{
    allocated: number;
    consumed: number;
    available: number;
  } | null>(null);

  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('access_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Fetch assigned projects on mount
  useEffect(() => {
    fetchAssignedProjects();
  }, []);

  // Fetch item overhead when item is selected
  useEffect(() => {
    if (selectedBoq && selectedItem) {
      fetchItemOverhead();
    }
  }, [selectedBoq, selectedItem]);

  const fetchAssignedProjects = async () => {
    try {
      setLoading(true);
      console.log('Fetching projects with token:', token);
      console.log('API URL:', `${API_URL}/projects/assigned-to-me`);

      const response = await axios.get(`${API_URL}/projects/assigned-to-me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Projects response:', response.data);
      setProjects(response.data.projects || []);

      if (!response.data.projects || response.data.projects.length === 0) {
        toast.info('No projects assigned to you yet');
      }
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      if (error.response?.status === 401) {
        toast.error('Authentication failed. Please login again.');
      } else if (error.response?.status === 500) {
        toast.error('Server error. Please try again later.');
      } else {
        toast.error('Failed to load assigned projects');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchItemOverhead = async () => {
    if (!selectedBoq || !selectedItem) return;

    try {
      const response = await axios.get(
        `${API_URL}/boq/${selectedBoq.boq_id}/item-overhead/${selectedItem.item_id}`,
        { headers }
      );
      setItemOverhead({
        allocated: response.data.overhead_allocated,
        consumed: response.data.overhead_consumed,
        available: response.data.overhead_available
      });
    } catch (error) {
      console.error('Error fetching item overhead:', error);
    }
  };

  // Computed fields
  const calculations = useMemo(() => {
    const totalCost = quantity * unitRate;
    const overheadPercentage = itemOverhead && itemOverhead.allocated > 0
      ? (totalCost / itemOverhead.allocated * 100)
      : 0;
    const availableAfter = itemOverhead
      ? itemOverhead.available - totalCost
      : 0;
    const exceeds40Percent = overheadPercentage > 40;

    return {
      totalCost,
      overheadPercentage,
      availableAfter,
      exceeds40Percent,
      routingPath: exceeds40Percent
        ? 'PM → Purchase → TD → Approved'
        : 'PM → Estimator → Approved'
    };
  }, [quantity, unitRate, itemOverhead]);

  const handleProjectChange = (projectId: number) => {
    const project = projects.find(p => p.project_id === projectId);
    setSelectedProject(project || null);
    // Reset downstream selections
    setSelectedArea(null);
    setSelectedBoq(null);
    setSelectedItem(null);
    setSelectedSubItem(null);
    setItemOverhead(null);
  };

  const handleAreaChange = (areaId: number) => {
    if (!selectedProject) return;
    const area = selectedProject.areas.find(a => a.area_id === areaId);
    setSelectedArea(area || null);
    // Reset downstream selections
    setSelectedBoq(null);
    setSelectedItem(null);
    setSelectedSubItem(null);
    setItemOverhead(null);
  };

  const handleBoqChange = (boqId: number) => {
    if (!selectedArea) return;
    const boq = selectedArea.boqs.find(b => b.boq_id === boqId);
    setSelectedBoq(boq || null);
    // Reset downstream selections
    setSelectedItem(null);
    setSelectedSubItem(null);
    setItemOverhead(null);
  };

  const handleItemChange = (itemId: string) => {
    if (!selectedBoq) return;
    const item = selectedBoq.items.find(i => i.item_id === itemId);
    setSelectedItem(item || null);
    setSelectedSubItem(null);
  };

  const handleSubItemChange = (subItemId: string) => {
    if (!selectedItem) return;
    const subItem = selectedItem.sub_items.find(si => si.sub_item_id === subItemId);
    setSelectedSubItem(subItem || null);

    if (subItem && !isNewSubItem) {
      // Populate defaults for existing sub-item
      setSubItemName(subItem.name);
      setUnit(subItem.unit);
      setUnitRate(subItem.unit_price);
      setQuantity(subItem.default_qty);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!selectedProject || !selectedArea || !selectedItem) {
      toast.error('Please select project, area, and BOQ item');
      return;
    }

    if (!isNewSubItem && !selectedSubItem) {
      toast.error('Please select a sub-item or add a new one');
      return;
    }

    if (isNewSubItem) {
      if (!subItemName || !reasonForNew || reasonForNew.length < 10) {
        toast.error('New sub-item requires name and reason (min 10 characters)');
        return;
      }
    }

    if (quantity <= 0 || unitRate <= 0) {
      toast.error('Quantity and unit rate must be positive');
      return;
    }

    const payload = {
      project_id: selectedProject.project_id,
      area_id: selectedArea.area_id,
      boq_item_id: selectedItem.item_id,
      sub_item_id: isNewSubItem ? null : selectedSubItem?.sub_item_id,
      sub_item_name: isNewSubItem ? subItemName : selectedSubItem?.name,
      quantity,
      unit,
      unit_rate: unitRate,
      reason: isNewSubItem ? reasonForNew : null,
      remarks,
      overhead_percent: calculations.overheadPercentage
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
          Project Name <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedProject?.project_id || ''}
          onChange={(e) => handleProjectChange(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
            onChange={(e) => handleAreaChange(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
            onChange={(e) => handleBoqChange(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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

      {/* BOQ Item Selection */}
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
            onChange={(e) => handleItemChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            required
          >
            <option value="">Select BOQ Item</option>
            {selectedBoq.items.map(item => (
              <option key={item.item_id} value={item.item_id}>
                {item.item_name}
              </option>
            ))}
          </select>
        </motion.div>
      )}

      {/* Overhead Display */}
      {itemOverhead && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200"
        >
          <div className="flex items-center gap-2 mb-3">
            <CalculatorIcon className="w-5 h-5 text-purple-600" />
            <h3 className="font-medium text-purple-900">Item Overhead Budget</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Allocated</p>
              <p className="font-semibold text-gray-900">₹{itemOverhead.allocated.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Consumed</p>
              <p className="font-semibold text-gray-900">₹{itemOverhead.consumed.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Available</p>
              <p className="font-semibold text-green-600">₹{itemOverhead.available.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Sub-Item Selection */}
      {selectedItem && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Add New Sub-Item Toggle */}
          <div className="mb-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isNewSubItem}
                onChange={(e) => {
                  setIsNewSubItem(e.target.checked);
                  if (e.target.checked) {
                    setSelectedSubItem(null);
                    setSubItemName('');
                    setUnit('');
                    setUnitRate(0);
                    setQuantity(0);
                  }
                }}
                className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">Add New Sub-Item</span>
            </label>
          </div>

          {!isNewSubItem ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sub-Item <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSubItem?.sub_item_id || ''}
                onChange={(e) => handleSubItemChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                required
              >
                <option value="">Select Sub-Item</option>
                {selectedItem.sub_items.map(subItem => (
                  <option key={subItem.sub_item_id} value={subItem.sub_item_id}>
                    {subItem.name} ({subItem.unit})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sub-Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subItemName}
                  onChange={(e) => setSubItemName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  required
                />
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for New Sub-Item <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reasonForNew}
                  onChange={(e) => setReasonForNew(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  rows={2}
                  placeholder="Minimum 10 characters"
                  required
                />
              </div>
            </>
          )}

          {/* Quantity, Unit, and Rate */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                min="0.01"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                disabled={!isNewSubItem && selectedSubItem}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Rate (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={unitRate}
                onChange={(e) => setUnitRate(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                min="0.01"
                step="0.01"
                disabled={!isNewSubItem && selectedSubItem}
                required
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Remarks */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Remarks <span className="text-gray-400">(Optional)</span>
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          rows={2}
          placeholder="Additional notes or comments"
        />
      </div>

      {/* Calculations Summary */}
      {selectedItem && quantity > 0 && unitRate > 0 && (
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
              <p className="text-gray-600">Overhead Percentage</p>
              <p className={`font-semibold ${calculations.exceeds40Percent ? 'text-red-600' : 'text-green-600'}`}>
                {calculations.overheadPercentage.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-gray-600">Available After</p>
              <p className={`font-semibold ${calculations.availableAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                ₹{calculations.availableAfter.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Approval Routing</p>
              <p className="font-semibold text-gray-900 text-xs">
                {calculations.routingPath}
              </p>
            </div>
          </div>

          {/* Warnings */}
          {calculations.exceeds40Percent && (
            <div className="mt-3 flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">This request exceeds 40% threshold and will route through Purchase to Technical Director</p>
            </div>
          )}
          {calculations.availableAfter < 0 && (
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
          disabled={loading || !selectedItem || quantity <= 0 || unitRate <= 0}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
};

export default ExtraMaterialForm;