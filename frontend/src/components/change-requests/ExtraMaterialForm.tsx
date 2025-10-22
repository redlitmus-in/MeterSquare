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
  sub_item_name: string;
  materials: Material[];
}

interface Material {
  material_id: string;
  material_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
}

interface MaterialItem {
  id: string;
  isNew: boolean;
  subItemId?: string;  // The sub-item (scope) ID like "Protection"
  subItemName: string;  // The sub-item (scope) name like "Protection"
  materialId?: string;  // The actual material ID like "Bubble Wrap"
  materialName: string;  // The actual material name like "Bubble Wrap"
  quantity: number;
  unit: string;
  unitRate: number;
  reasonForNew?: string;
  justification: string;  // Per-material justification (required for all materials)
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
  const [selectedSubItem, setSelectedSubItem] = useState<SubItem | null>(null);

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

  // Existing change requests for this item
  const [existingRequests, setExistingRequests] = useState<any[]>([]);
  const [showExistingRequests, setShowExistingRequests] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('access_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Fetch assigned projects on mount
  useEffect(() => {
    fetchAssignedProjects();
  }, []);

  // Fetch item overhead and existing requests when item is selected
  useEffect(() => {
    if (selectedBoq && selectedItem) {
      fetchItemOverhead();
      fetchExistingRequests();
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

    // Use the overhead values from the selectedItem
    // These come from the /api/projects/assigned-to-me endpoint
    if (selectedItem) {
      setItemOverhead({
        allocated: selectedItem.overhead_allocated || 0,
        consumed: selectedItem.overhead_consumed || 0,
        available: selectedItem.overhead_available || 0
      });
    }
  };

  const fetchExistingRequests = async () => {
    if (!selectedBoq || !selectedItem) return;

    try {
      setLoadingRequests(true);
      // Fetch ALL change requests for this BOQ (not filtered by user)
      const response = await axios.get(
        `${API_URL}/change-requests`,
        { headers }
      );

      const allRequests = response.data.data || response.data || [];

      // Filter to get ALL requests for this specific BOQ and item
      // INCLUDING rejected requests (so users can see what was rejected)
      const itemRequests = allRequests.filter((req: any) =>
        req.boq_id === selectedBoq.boq_id &&
        req.item_id === selectedItem.item_id
        // Don't exclude rejected - show all requests
      );

      console.log('Fetched change requests:', {
        total: allRequests.length,
        forThisItem: itemRequests.length,
        boqId: selectedBoq.boq_id,
        itemId: selectedItem.item_id
      });

      setExistingRequests(itemRequests);
    } catch (error) {
      console.error('Error fetching existing requests:', error);
      // Don't show error toast - this is optional information
      setExistingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Add material functions
  const addExistingMaterial = (material: Material) => {
    if (!selectedSubItem) return;

    const newMaterialItem: MaterialItem = {
      id: `material-${Date.now()}-${Math.random()}`,
      isNew: false,
      subItemId: selectedSubItem.sub_item_id,  // The sub-item (scope) ID like "Protection"
      subItemName: selectedSubItem.sub_item_name,  // The sub-item (scope) name like "Protection"
      materialId: material.material_id,  // The material ID like "Bubble Wrap's ID"
      materialName: material.material_name,  // The material name like "Bubble Wrap"
      quantity: 0,  // Empty for user to fill
      unit: material.unit,  // Fixed from material
      unitRate: material.unit_price || 0,  // Fixed from material
      justification: ''  // Empty for user to fill
    };
    setMaterials([...materials, newMaterialItem]);
  };

  const handleSubItemChange = (subItemId: string) => {
    if (!selectedItem) return;
    const subItem = selectedItem.sub_items.find(si => si.sub_item_id === subItemId);
    setSelectedSubItem(subItem || null);
    setMaterials([]);  // Reset materials when sub-item changes
  };

  const addNewMaterial = () => {
    if (!selectedSubItem) return;

    const newMaterial: MaterialItem = {
      id: `material-${Date.now()}-${Math.random()}`,
      isNew: true,
      subItemId: selectedSubItem.sub_item_id,  // The sub-item (scope) ID
      subItemName: selectedSubItem.sub_item_name,  // The sub-item (scope) name
      materialName: '',  // New material name (to be filled by user)
      quantity: 0,  // Empty for user to fill
      unit: '',
      unitRate: 0,
      reasonForNew: '',
      justification: ''  // Empty for user to fill
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

    if (project) {
      // Auto-fill Area if only one area exists
      if (project.areas && project.areas.length === 1) {
        const singleArea = project.areas[0];
        setSelectedArea(singleArea);

        // Auto-fill BOQ if area has only one BOQ
        if (singleArea.boqs && singleArea.boqs.length === 1) {
          const singleBoq = singleArea.boqs[0];
          setSelectedBoq(singleBoq);

          // Auto-select BOQ Item if only one item exists
          if (singleBoq.items && singleBoq.items.length === 1) {
            const singleItem = singleBoq.items[0];
            setSelectedItem(singleItem);
            setSelectedSubItem(null);
            setMaterials([]);
          } else {
            setSelectedItem(null);
            setSelectedSubItem(null);
            setMaterials([]);
          }
        } else {
          setSelectedBoq(null);
          setSelectedItem(null);
          setSelectedSubItem(null);
          setMaterials([]);
        }
      } else {
        // Reset downstream selections if multiple areas
        setSelectedArea(null);
        setSelectedBoq(null);
        setSelectedItem(null);
        setSelectedSubItem(null);
        setMaterials([]);
      }
    } else {
      // Reset all if no project
      setSelectedArea(null);
      setSelectedBoq(null);
      setSelectedItem(null);
      setSelectedSubItem(null);
      setMaterials([]);
    }

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
    setMaterials([]);
    setItemOverhead(null);
  };

  const handleBoqChange = (boqId: number) => {
    if (!selectedArea) return;
    const boq = selectedArea.boqs.find(b => b.boq_id === boqId);
    setSelectedBoq(boq || null);
    // Reset downstream selections
    setSelectedItem(null);
    setSelectedSubItem(null);
    setMaterials([]);
    setItemOverhead(null);
  };

  const handleItemChange = (itemId: string) => {
    if (!selectedBoq) return;
    const item = selectedBoq.items.find(i => i.item_id === itemId);
    setSelectedItem(item || null);
    setSelectedSubItem(null);  // Reset sub-item selection
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

    // Budget validation - prevent submission if budget exceeded
    if (calculations.availableAfter < 0) {
      toast.error(`Cannot submit: Request exceeds budget by AED${Math.abs(calculations.availableAfter).toLocaleString()}. Please reduce materials or contact Technical Director.`);
      return;
    }

    // Validate each material
    for (const material of materials) {
      if (!material.materialName) {
        toast.error('All materials must have a name');
        return;
      }

      if (material.isNew && (!material.reasonForNew || material.reasonForNew.length < 10)) {
        toast.error(`New material "${material.materialName}" requires a reason (min 10 characters)`);
        return;
      }

      // Validate per-material justification (required for ALL materials)
      if (!material.justification || material.justification.trim().length < 20) {
        toast.error(`Material "${material.materialName}" requires a justification (minimum 20 characters)`);
        return;
      }

      if (material.quantity <= 0 || material.unitRate <= 0) {
        toast.error(`Material "${material.materialName}" must have positive quantity and unit rate`);
        return;
      }
    }

    // Overall justification is now optional (since we have per-material justifications)
    if (!justification || justification.trim().length < 20) {
      toast.error('Please provide an overall justification (minimum 20 characters)');
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
        reason: mat.isNew ? mat.reasonForNew : null,
        justification: mat.justification  // Per-material justification
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
          item_id: selectedItem?.item_id || null,
          item_name: selectedItem?.item_name || null,
          justification: justification || remarks,
          materials: materials.map(mat => ({
            material_name: mat.materialName,  // The actual material name like "Bubble Wrap"
            sub_item_id: mat.subItemId,  // The sub-item (scope) ID like "subitem_331_1_3"
            sub_item_name: mat.subItemName,  // The sub-item (scope) name like "Protection"
            quantity: mat.quantity,
            unit: mat.unit,
            unit_price: mat.unitRate,
            master_material_id: mat.isNew ? null : mat.materialId,  // The material ID like "mat_331_1_3_1"
            reason: mat.isNew ? mat.reasonForNew : null,
            justification: mat.justification  // Per-material justification
          }))
        };

        const response = await axios.post(
          `${API_URL}/boq/change-request`,
          changeRequestPayload,
          { headers }
        );

        if (response.data.success) {
          // All users must manually send for review - no auto-send
          toast.success('Extra material request created successfully. Click "Send for Review" to submit for approval.');
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

      {/* Sub-Item Selection */}
      {selectedItem && selectedItem.sub_items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sub-Item (Scope) <span className="text-red-500">*</span>
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
                {subItem.sub_item_name}
              </option>
            ))}
          </select>
        </motion.div>
      )}


      {/* Miscellaneous Display */}
      {itemOverhead && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200"
        >
          <div className="flex items-center gap-2 mb-3">
            <CalculatorIcon className="w-5 h-5 text-purple-600" />
            <h3 className="font-medium text-purple-900">Item Miscellaneous Budget</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Allocated</p>
              <p className="font-semibold text-gray-900">AED{itemOverhead.allocated.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Consumed</p>
              <p className="font-semibold text-gray-900">AED{itemOverhead.consumed.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                From approved/pending requests
              </p>
            </div>
            <div>
              <p className="text-gray-600">Available</p>
              <p className="font-semibold text-green-600">AED{itemOverhead.available.toLocaleString()}</p>
            </div>
          </div>

          {/* Threshold Information */}
          <div className="mt-3 pt-3 border-t border-purple-200">
            <div className="flex items-start gap-2">
              <InformationCircleIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="text-purple-900">
                  <span className="font-medium">40% Threshold:</span> AED{(itemOverhead.allocated * 0.4).toLocaleString()}
                </p>
                <p className="text-gray-600">
                  Any request exceeding 40% of allocated miscellaneous (AED{(itemOverhead.allocated * 0.4).toLocaleString()}) will <span className="font-medium">always be sent to Technical Director</span> for approval
                </p>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Consumed: {((itemOverhead.consumed / itemOverhead.allocated) * 100).toFixed(1)}%</span>
                <span>Available: {((itemOverhead.available / itemOverhead.allocated) * 100).toFixed(1)}%</span>
              </div>
              <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
                {/* Consumed portion */}
                <div
                  className="absolute left-0 top-0 h-full bg-orange-400"
                  style={{ width: `${Math.min((itemOverhead.consumed / itemOverhead.allocated) * 100, 100)}%` }}
                />
                {/* 40% threshold marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-red-600"
                  style={{ left: '40%' }}
                >
                  <span className="absolute -top-5 -left-3 text-xs text-red-600 font-medium">40%</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0</span>
                <span>AED{itemOverhead.allocated.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Existing Requests Section */}
      {selectedItem && existingRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <InformationCircleIcon className="w-5 h-5 text-blue-600" />
              <h3 className="font-medium text-blue-900">
                Existing Requests for this Item ({existingRequests.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowExistingRequests(!showExistingRequests)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showExistingRequests ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {!showExistingRequests ? (
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-blue-700 text-xs">Pending</p>
                <p className="font-semibold text-blue-900">
                  {existingRequests.filter(r => r.status === 'pending').length}
                </p>
              </div>
              <div>
                <p className="text-blue-700 text-xs">Under Review</p>
                <p className="font-semibold text-blue-900">
                  {existingRequests.filter(r => r.status === 'under_review' || r.status === 'approved_by_pm' || r.status === 'approved_by_td').length}
                </p>
              </div>
              <div>
                <p className="text-blue-700 text-xs">Rejected</p>
                <p className="font-semibold text-red-600">
                  {existingRequests.filter(r => r.status === 'rejected').length}
                </p>
              </div>
              <div>
                <p className="text-blue-700 text-xs">Total Cost</p>
                <p className="font-semibold text-blue-900">
                  AED {existingRequests.filter(r => r.status !== 'rejected').reduce((sum, r) => sum + (r.materials_total_cost || 0), 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">(excl. rejected)</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {existingRequests.map((request) => {
                // Helper function to format role display
                const getRoleBadge = (role: string) => {
                  const roleMap: Record<string, { label: string; color: string }> = {
                    'siteEngineer': { label: 'SE', color: 'bg-purple-100 text-purple-700' },
                    'projectManager': { label: 'PM', color: 'bg-indigo-100 text-indigo-700' },
                    'site_engineer': { label: 'SE', color: 'bg-purple-100 text-purple-700' },
                    'project_manager': { label: 'PM', color: 'bg-indigo-100 text-indigo-700' },
                  };
                  return roleMap[role] || { label: role.substring(0, 2).toUpperCase(), color: 'bg-gray-100 text-gray-700' };
                };

                const roleBadge = getRoleBadge(request.requested_by_role || '');

                return (
                  <div key={request.cr_id} className="bg-white rounded p-3 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">CR-{request.cr_id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${roleBadge.color}`}>
                          {roleBadge.label}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        request.status === 'approved' ? 'bg-green-100 text-green-700' :
                        request.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {request.status === 'pending' ? 'Pending' :
                         request.status === 'under_review' ? 'Under Review' :
                         request.status === 'approved_by_pm' ? 'PM Approved' :
                         request.status === 'approved_by_td' ? 'TD Approved' :
                         request.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      {/* Sub-items list */}
                      <div>
                        <p className="text-gray-600 text-xs mb-1">Items Requested:</p>
                        <div className="space-y-1">
                          {(request.materials_data || []).map((material: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs bg-gray-50 px-2 py-1 rounded">
                              <span className="text-gray-700">
                                {material.material_name || material.sub_item_name}
                                <span className="text-gray-500 ml-1">
                                  ({material.quantity} {material.unit})
                                </span>
                              </span>
                              <span className="font-medium text-gray-900">
                                AED {((material.quantity || 0) * (material.unit_price || 0)).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Summary row */}
                      <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                        <div>
                          <span className="text-gray-600 text-xs">By: </span>
                          <span className="text-gray-900 font-medium text-xs">{request.requested_by_name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-600 text-xs">Total Cost</p>
                          <p className="font-semibold text-gray-900">AED {(request.materials_total_cost || 0).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500">
                        <span>Created: {request.created_at ? new Date(request.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        }) : 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="text-xs text-blue-700">
              <InformationCircleIcon className="w-4 h-4 inline mr-1" />
              Review existing requests before creating new ones to avoid duplicates and stay within budget.
            </p>
          </div>
        </motion.div>
      )}

      {/* Materials Section */}
      {selectedSubItem && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-900">Materials Purchase Request</h3>
            <div className="flex gap-2">
              {selectedSubItem && selectedSubItem.materials.length > 0 && (
                <div className="relative">
                  <select
                    onChange={(e) => {
                      const material = selectedSubItem.materials.find(m => m.material_id === e.target.value);
                      if (material) {
                        addExistingMaterial(material);
                        // Reset dropdown
                        e.target.value = "";
                      }
                    }}
                    className="pl-3 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    value=""
                  >
                    <option value="">Select Material</option>
                    {selectedSubItem.materials.map(material => (
                      <option key={material.material_id} value={material.material_id}>
                        {material.material_name} - AED{material.unit_price}/{material.unit}
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
              <p className="text-gray-500">No materials selected yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Select a Sub-Item (Scope) from existing materials or add a new one
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {materials.map((material, index) => (
                <div key={material.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">Purchase Request #{index + 1}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Scope: {material.subItemName}
                        {!material.isNew && ` | Material: ${material.materialName}`}
                        {!material.isNew && ` | Unit Rate: AED${material.unitRate}/${material.unit}`}
                      </p>
                    </div>
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
                          New Material Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={material.materialName}
                          onChange={(e) => updateMaterial(material.id, { materialName: e.target.value })}
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
                    <div className="mb-3 space-y-2">
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-purple-900 mb-1">Scope (Sub-Item)</p>
                        <p className="text-sm font-semibold text-purple-900">{material.subItemName}</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-900 mb-1">Selected Material</p>
                        <p className="text-sm font-semibold text-blue-900">{material.materialName}</p>
                        <div className="mt-2 flex gap-4 text-xs text-blue-700">
                          <span>Unit: {material.unit}</span>
                          <span>Rate: AED{material.unitRate.toLocaleString()}/{material.unit}</span>
                        </div>
                      </div>
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

                  {/* Per-Material Justification - REQUIRED FOR ALL MATERIALS */}
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Justification / Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={material.justification}
                      onChange={(e) => updateMaterial(material.id, { justification: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                        material.justification.trim().length > 0 && material.justification.trim().length < 20
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      rows={2}
                      placeholder="Why is this material needed? (minimum 20 characters)"
                      required
                    />
                    {material.justification.trim().length > 0 && material.justification.trim().length < 20 && (
                      <p className="text-sm text-red-600 mt-1">
                        Justification must be at least 20 characters ({20 - material.justification.trim().length} more needed)
                      </p>
                    )}
                  </div>

                  <div className="mt-2 text-right">
                    <span className="text-sm text-gray-600">
                      Subtotal: <span className="font-medium text-gray-900">
                        AED{(material.quantity * material.unitRate).toLocaleString()}
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
      {selectedSubItem && (
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
      {selectedSubItem && materials.length > 0 && (
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
                      {idx + 1}. {mat.materialName} ({mat.quantity} {mat.unit})
                    </span>
                    <span className="text-gray-900">AED{(mat.quantity * mat.unitRate).toLocaleString()}</span>
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
              <p className="text-gray-600">Miscellaneous Usage</p>
              <p className={`font-semibold ${calculations.exceeds40Percent ? 'text-red-600' : 'text-green-600'}`}>
                {calculations.overheadPercentage.toFixed(2)}% of AED{itemOverhead?.allocated.toLocaleString() || '0'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {calculations.exceeds40Percent ? '> 40% threshold' : '≤ 40% threshold'}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Available After Approval</p>
              <p className={`font-semibold ${calculations.availableAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                AED{calculations.availableAfter.toLocaleString()}
              </p>
              {itemOverhead && (
                <p className="text-xs text-gray-500 mt-0.5">
                  from AED{itemOverhead.available.toLocaleString()}
                </p>
              )}
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
              <p className="text-sm">This request will exceed the available miscellaneous budget</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Budget Exceeded Warning - Prevents Submission */}
      {selectedSubItem && materials.length > 0 && calculations.availableAfter < 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-50 border-2 border-red-300 rounded-lg p-4"
        >
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Budget Limit Reached</h4>
              <p className="text-sm text-red-800 mb-2">
                This purchase request exceeds the allocated miscellaneous budget by{' '}
                <span className="font-semibold">AED{Math.abs(calculations.availableAfter).toLocaleString()}</span>.
              </p>
              <p className="text-sm text-red-700">
                You cannot submit this request until the budget is adjusted or materials are reduced.
                Please contact the Technical Director for budget approval or modify your request.
              </p>
            </div>
          </div>
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
          disabled={loading || !selectedItem || !selectedSubItem || materials.length === 0 || calculations.availableAfter < 0}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          title={calculations.availableAfter < 0 ? 'Cannot submit - Budget exceeded' : ''}
        >
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
};

export default ExtraMaterialForm;