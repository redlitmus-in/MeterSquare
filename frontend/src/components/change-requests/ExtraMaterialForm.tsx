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

interface MaterialItem {
  id: string;
  isNew: boolean;
  subItemId?: string;
  subItemName: string;
  quantity: number;
  unit: string;
  unitRate: number;
  reasonForNew?: string;
}

interface ExtraMaterialFormProps {
  onSubmit?: (data: any) => Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;  // Support for PM's ChangeRequestsPage
}

const ExtraMaterialForm: React.FC<ExtraMaterialFormProps> = ({ onSubmit, onCancel, onClose }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // Dynamic field states
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // Multiple materials support
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [remarks, setRemarks] = useState('');
  const [justification, setJustification] = useState('');

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
      console.log('Projects details:', JSON.stringify(response.data.projects, null, 2));
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
    if (!selectedBoq || !selectedItem || !selectedItem.item_id) return;

    // Set overhead from selectedItem directly - no need for API call
    // The overhead data is already present in the selectedItem from projects/assigned-to-me API
    if (selectedItem) {
      setItemOverhead({
        allocated: selectedItem.overhead_allocated || 0,
        consumed: selectedItem.overhead_consumed || 0,
        available: selectedItem.overhead_available || 0
      });
    }

    // Commenting out API call as it's returning 404 and we already have the data
    // try {
    //   const itemId = selectedItem.item_id;
    //   const response = await axios.get(
    //     `${API_URL}/boq/${selectedBoq.boq_id}/item-overhead/${itemId}`,
    //     { headers }
    //   );
    //   if (response.data) {
    //     setItemOverhead({
    //       allocated: response.data.overhead_allocated || selectedItem.overhead_allocated || 0,
    //       consumed: response.data.overhead_consumed || selectedItem.overhead_consumed || 0,
    //       available: response.data.overhead_available || selectedItem.overhead_available || 0
    //     });
    //   }
    // } catch (error) {
    //   console.error('Error fetching item overhead:', error);
    // }
  };

  // Add material functions
  const addExistingMaterial = (subItem: SubItem) => {
    const newMaterial: MaterialItem = {
      id: `material-${Date.now()}-${Math.random()}`,
      isNew: false,
      subItemId: subItem.sub_item_id,
      subItemName: subItem.name,
      quantity: 0,  // Empty for user to fill
      unit: subItem.unit,  // Fixed from subItem
      unitRate: subItem.unit_price || 0  // Fixed from subItem
    };
    setMaterials([...materials, newMaterial]);
  };

  const addNewMaterial = () => {
    const newMaterial: MaterialItem = {
      id: `material-${Date.now()}-${Math.random()}`,
      isNew: true,
      subItemName: '',
      quantity: 0,  // Empty for user to fill
      unit: '',
      unitRate: 0,
      reasonForNew: ''
    };
    setMaterials([...materials, newMaterial]);
  };

  const updateMaterial = (id: string, updates: Partial<MaterialItem>) => {
    setMaterials(materials.map(m =>
      m.id === id ? { ...m, ...updates } : m
    ));
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  // Computed fields
  const calculations = useMemo(() => {
    // Only calculate cost for newly added materials, not existing sub-items
    const totalCost = materials.reduce((sum, mat) =>
      sum + (mat.quantity * mat.unitRate), 0
    );

    // For overhead calculation, we need to consider what's already consumed
    // and only add the new materials cost
    const newMaterialsCost = totalCost;

    // Calculate the overhead percentage based on the new materials only
    // This represents the additional overhead consumption
    const overheadPercentage = itemOverhead && itemOverhead.allocated > 0
      ? (newMaterialsCost / itemOverhead.allocated * 100)
      : 0;

    // Available after should consider current available minus new materials cost
    const availableAfter = itemOverhead
      ? itemOverhead.available - newMaterialsCost
      : 0;

    const exceeds40Percent = overheadPercentage > 40;

    return {
      totalCost: newMaterialsCost,
      overheadPercentage,
      availableAfter,
      exceeds40Percent,
      routingPath: exceeds40Percent
        ? 'PM → TD → Approved'
        : 'PM → Estimator → Approved'
    };
  }, [materials, itemOverhead]);

  const handleProjectChange = (projectId: number) => {
    const project = projects.find(p => p.project_id === projectId);
    setSelectedProject(project || null);
    // Reset downstream selections
    setSelectedArea(null);
    setSelectedBoq(null);
    setSelectedItem(null);
    setMaterials([]);
    setItemOverhead(null);
  };

  const handleAreaChange = (areaId: number) => {
    if (!selectedProject) return;
    const area = selectedProject.areas.find(a => a.area_id === areaId);
    setSelectedArea(area || null);
    // Reset downstream selections
    setSelectedBoq(null);
    setSelectedItem(null);
    setMaterials([]);
    setItemOverhead(null);
  };

  const handleBoqChange = (boqId: number) => {
    if (!selectedArea) return;
    const boq = selectedArea.boqs.find(b => b.boq_id === boqId);
    setSelectedBoq(boq || null);
    // Reset downstream selections
    setSelectedItem(null);
    setMaterials([]);
    setItemOverhead(null);
  };

  const handleItemChange = (itemId: string) => {
    if (!selectedBoq) return;
    const item = selectedBoq.items.find(i => i.item_id === itemId);
    setSelectedItem(item || null);
    setMaterials([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!selectedProject || !selectedArea || !selectedItem) {
      toast.error('Please select project, area, and BOQ item');
      return;
    }

    if (materials.length === 0) {
      toast.error('Please add at least one sub-item');
      return;
    }

    // Validate each material
    for (const material of materials) {
      if (!material.subItemName) {
        toast.error('All materials must have a name');
        return;
      }

      if (material.isNew && (!material.reasonForNew || material.reasonForNew.length < 10)) {
        toast.error(`New material "${material.subItemName}" requires a reason (min 10 characters)`);
        return;
      }

      if (material.quantity <= 0 || material.unitRate <= 0) {
        toast.error(`Material "${material.subItemName}" must have positive quantity and unit rate`);
        return;
      }
    }

    if (!justification || justification.trim().length < 20) {
      toast.error('Please provide a justification (minimum 20 characters)');
      return;
    }

    const payload = {
      project_id: selectedProject.project_id,
      area_id: selectedArea.area_id,
      boq_id: selectedBoq.boq_id,  // Send the actual BOQ ID
      boq_item_id: selectedItem.item_id,  // Also send item_id for reference
      boq_item_name: selectedItem.item_name,  // Send item name
      materials: materials.map(mat => ({
        sub_item_id: mat.isNew ? null : mat.subItemId,
        sub_item_name: mat.subItemName,
        quantity: mat.quantity,
        unit: mat.unit,
        unit_rate: mat.unitRate,
        reason: mat.isNew ? mat.reasonForNew : null
      })),
      justification,
      remarks,
      total_cost: calculations.totalCost,
      overhead_percent: calculations.overheadPercentage
    };

    try {
      setLoading(true);
      if (onSubmit) {
        await onSubmit(payload);
      } else if (onClose) {
        // For PM's ChangeRequestsPage - submit directly here
        const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const token = localStorage.getItem('access_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // Use the main change request API endpoint instead of extra_materials wrapper
        const changeRequestPayload = {
          boq_id: selectedBoq.boq_id,
          justification: justification || remarks,
          materials: materials.map(mat => ({
            material_name: mat.subItemName,
            quantity: mat.quantity,
            unit: mat.unit,
            unit_price: mat.unitRate,
            master_material_id: mat.isNew ? null : mat.subItemId,
            reason: mat.isNew ? mat.reasonForNew : null
          }))
        };

        const response = await axios.post(
          `${API_URL}/boq/change-request`,
          changeRequestPayload,
          { headers }
        );

        if (response.data.success) {
          // For Site Engineers, automatically send for review to PM
          const userRole = (user as any)?.role || '';
          const userRoleLower = userRole.toLowerCase();

          if (userRoleLower === 'site engineer' || userRoleLower === 'site_engineer' ||
              userRoleLower === 'siteengineer' || userRole === 'siteEngineer') {
            // Get the created CR ID from response (if available)
            const crId = response.data.cr_id;
            if (crId) {
              // Send for review to PM
              try {
                await axios.post(
                  `${API_URL}/change-request/${crId}/send-for-review`,
                  {},
                  { headers }
                );
                toast.success('Extra material request submitted and sent to PM for approval');
              } catch (sendError) {
                console.error('Error sending for review:', sendError);
                toast.success('Extra material request created. Please send for review manually.');
              }
            } else {
              toast.success('Extra material request submitted successfully');
            }
          } else {
            toast.success('Extra material request submitted successfully');
          }
          onClose();
        }
      }
    } catch (error: any) {
      console.error('Error submitting extra material request:', error);
      toast.error(error.response?.data?.error || 'Failed to submit request');
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
                {item.item_name || `Item ${item.item_id}`}
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
              <p className="font-semibold text-gray-900">AED{itemOverhead.allocated.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Consumed</p>
              <p className="font-semibold text-gray-900">AED{itemOverhead.consumed.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Available</p>
              <p className="font-semibold text-green-600">AED{itemOverhead.available.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Materials Section */}
      {selectedItem && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-900">Sub-Items / Materials</h3>
            <div className="flex gap-2">
              {selectedItem.sub_items.length > 0 && (
                <div className="relative">
                  <select
                    onChange={(e) => {
                      const subItem = selectedItem.sub_items.find(si => si.sub_item_id === e.target.value);
                      if (subItem) {
                        addExistingMaterial(subItem);
                      }
                    }}
                    className="pl-3 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    value=""
                  >
                    <option value="">Add Existing Material</option>
                    {selectedItem.sub_items.map(subItem => (
                      <option key={subItem.sub_item_id} value={subItem.sub_item_id}>
                        {subItem.name} ({subItem.unit})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={addNewMaterial}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <PlusIcon className="w-4 h-4" />
                Add New Material
              </button>
            </div>
          </div>

          {/* Materials List */}
          {materials.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500">No materials added yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Click "Add Existing Material" or "Add New Material" to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {materials.map((material, index) => (
                <div key={material.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium text-gray-900">Material #{index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeMaterial(material.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {material.isNew ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Material Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={material.subItemName}
                          onChange={(e) => updateMaterial(material.id, { subItemName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                          placeholder="Enter material name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Reason for New Material <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={material.reasonForNew}
                          onChange={(e) => updateMaterial(material.id, { reasonForNew: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                          rows={2}
                          placeholder="Why is this new material needed? (min 10 chars)"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-700">Selected Material</p>
                      <p className="text-gray-900">{material.subItemName}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={material.quantity}
                        onChange={(e) => updateMaterial(material.id, { quantity: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        min="0.01"
                        step="0.01"
                        placeholder="Enter quantity"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit {material.isNew && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        value={material.unit}
                        onChange={(e) => material.isNew && updateMaterial(material.id, { unit: e.target.value })}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
                          material.isNew ? 'focus:ring-2 focus:ring-purple-500' : 'bg-gray-100 cursor-not-allowed'
                        }`}
                        placeholder={material.isNew ? "e.g., kg, m²" : ""}
                        readOnly={!material.isNew}
                        disabled={!material.isNew}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit Rate (AED) {material.isNew && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="number"
                        value={material.unitRate}
                        onChange={(e) => material.isNew && updateMaterial(material.id, { unitRate: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${
                          material.isNew ? 'focus:ring-2 focus:ring-purple-500' : 'bg-gray-100 cursor-not-allowed'
                        }`}
                        min="0.01"
                        step="0.01"
                        readOnly={!material.isNew}
                        disabled={!material.isNew}
                      />
                    </div>
                  </div>

                  <div className="mt-2 text-right">
                    <span className="text-sm text-gray-600">
                      Subtotal: <span className="font-medium text-gray-900">
                        ₹{(material.quantity * material.unitRate).toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Justification */}
      {selectedItem && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Justification <span className="text-red-500">*</span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
              justification.trim().length > 0 && justification.trim().length < 20
                ? 'border-red-500'
                : 'border-gray-300'
            }`}
            rows={3}
            placeholder="Please provide a detailed justification for this extra material request (minimum 20 characters)"
            required
          />
          {justification.trim().length > 0 && justification.trim().length < 20 && (
            <p className="text-sm text-red-600 mt-1">
              Justification must be at least 20 characters ({20 - justification.trim().length} more needed)
            </p>
          )}
        </div>
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
      {selectedItem && materials.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-50 p-4 rounded-lg border border-gray-200"
        >
          <h3 className="font-medium text-gray-900 mb-3">Request Summary (New Materials Only)</h3>

          {/* Materials breakdown if multiple */}
          {materials.length > 1 && (
            <div className="mb-3 pb-3 border-b border-gray-200">
              <p className="text-sm text-gray-600 mb-2">New Materials to be Added:</p>
              <div className="space-y-1">
                {materials.map((mat, idx) => (
                  <div key={mat.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {idx + 1}. {mat.subItemName} ({mat.quantity} {mat.unit})
                    </span>
                    <span className="text-gray-900">₹{(mat.quantity * mat.unitRate).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Additional Cost</p>
              <p className="font-semibold text-gray-900">AED{calculations.totalCost.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Additional Overhead %</p>
              <p className={`font-semibold ${calculations.exceeds40Percent ? 'text-red-600' : 'text-green-600'}`}>
                {calculations.overheadPercentage.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-gray-600">Available After</p>
              <p className={`font-semibold ${calculations.availableAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                AED{calculations.availableAfter.toLocaleString()}
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
              <p className="text-sm">This request exceeds 40% threshold and will route to Technical Director for approval</p>
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
          onClick={onCancel || onClose}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !selectedItem || materials.length === 0}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
};

export default ExtraMaterialForm;