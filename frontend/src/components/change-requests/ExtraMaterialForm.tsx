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
  onSuccess?: () => void;  // Called after successful create/update
  initialData?: any;  // For editing existing change requests
}

const ExtraMaterialForm: React.FC<ExtraMaterialFormProps> = ({ onSubmit, onCancel, onClose, onSuccess, initialData }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInProgressRef = React.useRef(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // Check if user is Site Engineer
  const isSiteEngineer = useMemo(() => {
    const role = (user as any)?.role?.toLowerCase() || '';
    return role === 'site engineer' || role === 'site_engineer' || role === 'siteengineer';
  }, [user]);

  // Dynamic field states
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedSubItems, setSelectedSubItems] = useState<SubItem[]>([]);  // Changed to array for multiple selection

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

  // Handle editing mode - pre-fill form with initialData
  useEffect(() => {
    if (initialData && initialData.editMode && projects.length > 0) {
      console.log('Edit mode - initialData:', initialData);

      // Find and select the project
      const project = projects.find(p => p.project_id === initialData.project_id);
      if (project) {
        setSelectedProject(project);

        // Find the area and BOQ - need to search through all areas
        let foundArea = null;
        let foundBoq = null;

        for (const area of project.areas || []) {
          const boq = area.boqs?.find(b => b.boq_id === initialData.boq_id);
          if (boq) {
            foundArea = area;
            foundBoq = boq;
            break;
          }
        }

        if (foundArea && foundBoq) {
          setSelectedArea(foundArea);
          setSelectedBoq(foundBoq);

          // Find and select the item
          const item = foundBoq.items?.find(i => String(i.item_id) === String(initialData.item_id));
          if (item) {
            setSelectedItem(item);

            // Find all unique sub-items from sub_items_data
            if (initialData.sub_items_data && initialData.sub_items_data.length > 0) {
              const uniqueSubItemIds = [...new Set(initialData.sub_items_data.map((d: any) => d.sub_item_id))];
              const subItems = item.sub_items?.filter(si =>
                uniqueSubItemIds.includes(si.sub_item_id)
              ) || [];
              setSelectedSubItems(subItems);
            }

            // Pre-fill justification and remarks
            setJustification(initialData.justification || '');
            setRemarks(initialData.remarks || '');

            // Pre-fill materials using sub_items_data
            if (initialData.sub_items_data && Array.isArray(initialData.sub_items_data)) {
              const transformedMaterials = initialData.sub_items_data.map((mat: any, index: number) => ({
                id: `material-edit-${index}`,
                isNew: mat.is_new || mat.master_material_id === null,
                subItemId: mat.sub_item_id || '',
                subItemName: mat.sub_item_name || mat.material_name || '',
                materialId: mat.master_material_id,
                materialName: mat.material_name,
                quantity: mat.quantity || 0,
                unit: mat.unit || 'nos',
                unitRate: mat.unit_price || 0,
                reasonForNew: mat.reason || '',
                justification: mat.justification || initialData.justification || ''
              }));
              setMaterials(transformedMaterials);
            }
          }
        }
      }
    }
  }, [initialData, projects]);

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
  // These functions are now handled inline in the UI since we support multiple sub-items

  const updateMaterial = (id: string, updates: Partial<MaterialItem>) => {
    setMaterials(materials.map(m =>
      m.id === id ? { ...m, ...updates } : m
    ));
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  // Computed fields - Simplified routing without calculations
  const calculations = useMemo(() => {
    // Simple linear routing: All requests → Estimator → Buyer → TD
    return {
      routingPath: isSiteEngineer
        ? 'SE → PM → Estimator → Buyer → TD'
        : 'PM → Estimator → Buyer → TD'
    };
  }, [isSiteEngineer]);

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
            setSelectedSubItems([]);
            setMaterials([]);
          } else {
            setSelectedItem(null);
            setSelectedSubItems([]);
            setMaterials([]);
          }
        } else {
          setSelectedBoq(null);
          setSelectedItem(null);
          setSelectedSubItems([]);
          setMaterials([]);
        }
      } else {
        // Reset downstream selections if multiple areas
        setSelectedArea(null);
        setSelectedBoq(null);
        setSelectedItem(null);
        setSelectedSubItems([]);
        setMaterials([]);
      }
    } else {
      // Reset all if no project
      setSelectedArea(null);
      setSelectedBoq(null);
      setSelectedItem(null);
      setSelectedSubItems([]);
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
    setSelectedSubItems([]);
    setMaterials([]);
    setItemOverhead(null);
  };

  const handleBoqChange = (boqId: number) => {
    if (!selectedArea) return;
    const boq = selectedArea.boqs.find(b => b.boq_id === boqId);
    setSelectedBoq(boq || null);
    // Reset downstream selections
    setSelectedItem(null);
    setSelectedSubItems([]);
    setMaterials([]);
    setItemOverhead(null);
  };

  const handleItemChange = (itemId: string) => {
    if (!selectedBoq) return;
    const item = selectedBoq.items.find(i => i.item_id === itemId);
    setSelectedItem(item || null);
    setSelectedSubItems([]);  // Reset sub-items selection
    setMaterials([]);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // CRITICAL: Prevent double submission
    if (isSubmitting || submissionInProgressRef.current) {
      console.warn('Submission already in progress, ignoring duplicate submit');
      return;
    }

    // Validation
    if (!selectedProject || !selectedArea || !selectedBoq || !selectedItem) {
      toast.error('Please select project, area, BOQ, and BOQ item');
      return;
    }

    if (materials.length === 0) {
      toast.error('Please add at least one sub-item');
      return;
    }

    // Validate each material
    for (const material of materials) {
      if (!material.materialName) {
        toast.error('All materials must have a name');
        return;
      }

      if (material.quantity <= 0) {
        toast.error(`Material "${material.materialName}" must have positive quantity`);
        return;
      }
    }

    // Overall justification is required
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
        material_name: mat.materialName,  // Actual material name like "Bubble Wrap"
        sub_item_id: mat.isNew ? null : mat.subItemId,  // Sub-item ID
        sub_item_name: mat.subItemName,  // Sub-item name like "Protection"
        quantity: mat.quantity,
        unit: mat.unit,
        unit_rate: mat.isNew ? 0 : mat.unitRate,  // Set to 0 for new materials (no rate field)
        master_material_id: mat.isNew ? null : mat.materialId,  // Material ID
        reason: mat.isNew ? mat.reasonForNew : null,
        justification: mat.justification  // Per-material justification
      })),
      justification,
      remarks
    };

    // Set submission guards
    setIsSubmitting(true);
    submissionInProgressRef.current = true;

    try {
      setLoading(true);

      // Check if we're in edit mode
      const isEditMode = initialData && initialData.editMode && initialData.cr_id;

      // SINGLE submission path - use onSubmit if provided, otherwise direct API call
      if (onSubmit) {
        await onSubmit(payload);
      } else if (isEditMode) {
        // Edit mode - update existing change request
        const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const token = localStorage.getItem('access_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const updatePayload = {
          boq_id: selectedBoq.boq_id,
          item_id: selectedItem?.item_id || null,
          item_name: selectedItem?.item_name || null,
          justification: justification || remarks,
          remarks: remarks,
          materials: materials.map(mat => ({
            material_name: mat.materialName,
            sub_item_id: mat.subItemId,
            sub_item_name: mat.subItemName,
            quantity: mat.quantity,
            unit: mat.unit,
            unit_price: mat.unitRate,
            master_material_id: mat.isNew ? null : mat.materialId,
            reason: mat.isNew ? mat.reasonForNew : null,
            justification: mat.justification
          }))
        };

        const response = await axios.put(
          `${API_URL}/change-request/${initialData.cr_id}`,
          updatePayload,
          { headers }
        );

        if (response.data.success || response.data.data) {
          toast.success('Change request updated successfully');
          if (onSuccess) onSuccess();
          if (onCancel) onCancel();
          if (onClose) onClose();
        }
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
      // Release submission guards
      setIsSubmitting(false);
      submissionInProgressRef.current = false;
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
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

      {/* Sub-Item Selection - Multiple Selection */}
      {selectedItem && selectedItem.sub_items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sub-Items (Scopes) <span className="text-red-500">*</span>
            <span className="text-xs text-gray-500 font-normal ml-2">Select one or more sub-items</span>
          </label>
          <div className="border border-gray-300 rounded-lg p-3 bg-white max-h-60 overflow-y-auto space-y-2">
            {selectedItem.sub_items.map(subItem => {
              const isSelected = selectedSubItems.some(si => si.sub_item_id === subItem.sub_item_id);
              return (
                <label
                  key={subItem.sub_item_id}
                  className={`flex items-center p-3 rounded-lg cursor-pointer transition-all border-2 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSubItems([...selectedSubItems, subItem]);
                      } else {
                        // Remove this sub-item and its materials
                        setSelectedSubItems(selectedSubItems.filter(si => si.sub_item_id !== subItem.sub_item_id));
                        setMaterials(materials.filter(m => m.subItemId !== subItem.sub_item_id));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-900">{subItem.sub_item_name}</span>
                  {subItem.materials && subItem.materials.length > 0 && (
                    <span className="ml-auto text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                      {subItem.materials.length} material{subItem.materials.length > 1 ? 's' : ''}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {selectedSubItems.length > 0 && (
            <p className="text-xs text-green-600 mt-2">
              {selectedSubItems.length} sub-item{selectedSubItems.length > 1 ? 's' : ''} selected
            </p>
          )}
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
            <div className={`grid ${isSiteEngineer ? 'grid-cols-3' : 'grid-cols-4'} gap-3 text-sm`}>
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
              {!isSiteEngineer && (
                <div>
                  <p className="text-blue-700 text-xs">Total Cost</p>
                  <p className="font-semibold text-blue-900">
                    AED {existingRequests.filter(r => r.status !== 'rejected').reduce((sum, r) => sum + (r.materials_total_cost || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">(excl. rejected)</p>
                </div>
              )}
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
                        request.status === 'approved' || request.status === 'approved_by_estimator' || request.status === 'completed' ? 'bg-green-100 text-green-700' :
                        request.status === 'rejected' || request.status === 'rejected_by_pm' || request.status === 'rejected_by_td' || request.status === 'rejected_by_estimator' ? 'bg-red-100 text-red-700' :
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {request.status === 'pending' ? 'Pending' :
                         request.status === 'under_review' ? 'Under Review' :
                         request.status === 'approved_by_pm' ? 'PM Approved' :
                         request.status === 'approved_by_td' ? 'TD Approved' :
                         request.status === 'approved_by_estimator' ? 'Estimator Approved' :
                         request.status === 'approved' ? 'Approved' :
                         request.status === 'completed' ? 'Completed' :
                         request.status === 'rejected' || request.status === 'rejected_by_pm' || request.status === 'rejected_by_td' || request.status === 'rejected_by_estimator' ? 'Rejected' :
                         request.status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
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
                              {!isSiteEngineer && (
                                <span className="font-medium text-gray-900">
                                  AED {((material.quantity || 0) * (material.unit_price || 0)).toLocaleString()}
                                </span>
                              )}
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
                        {!isSiteEngineer && (
                          <div className="text-right">
                            <p className="text-gray-600 text-xs">Total Cost</p>
                            <p className="font-semibold text-gray-900">AED {(request.materials_total_cost || 0).toLocaleString()}</p>
                          </div>
                        )}
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

      {/* Materials Section - Grouped by Sub-Item */}
      {selectedSubItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-900">Materials Purchase Request</h3>
          </div>

          {/* Material selection for each selected sub-item */}
          {selectedSubItems.map(subItem => (
            <div key={subItem.sub_item_id} className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                  {subItem.sub_item_name}
                </h4>
                <div className="flex gap-2">
                  {subItem.materials && subItem.materials.length > 0 && (
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          const material = subItem.materials.find(m => m.material_id === e.target.value);
                          if (material) {
                            // Check for duplicates - prevent adding same material twice for this sub-item
                            const isDuplicate = materials.some(
                              m => !m.isNew &&
                                   m.materialId === material.material_id &&
                                   m.subItemId === subItem.sub_item_id
                            );

                            if (isDuplicate) {
                              toast.error(`"${material.material_name}" is already added for this sub-item. Please remove it first if you want to modify it.`);
                              e.target.value = "";
                              return;
                            }

                            // Pass the specific subItem to addExistingMaterial
                            const newMaterialItem: MaterialItem = {
                              id: `material-${Date.now()}-${Math.random()}`,
                              isNew: false,
                              subItemId: subItem.sub_item_id,
                              subItemName: subItem.sub_item_name,
                              materialId: material.material_id,
                              materialName: material.material_name,
                              quantity: material.quantity || 0,
                              unit: material.unit,
                              unitRate: material.unit_price || 0,
                              justification: ''
                            };
                            setMaterials([...materials, newMaterialItem]);
                            // Reset dropdown
                            e.target.value = "";
                          }
                        }}
                        className="pl-3 pr-10 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                        value=""
                      >
                        <option value="">Select Material</option>
                        {subItem.materials.map(material => {
                          // Check if this material is already added for this sub-item
                          const isAlreadyAdded = materials.some(
                            m => !m.isNew &&
                                 m.materialId === material.material_id &&
                                 m.subItemId === subItem.sub_item_id
                          );

                          return (
                            <option
                              key={material.material_id}
                              value={material.material_id}
                              disabled={isAlreadyAdded}
                              className={isAlreadyAdded ? 'text-gray-400 italic' : ''}
                            >
                              {material.material_name}{isAlreadyAdded ? ' (Already added)' : ''}{isSiteEngineer ? '' : ` - AED${material.unit_price}/${material.unit}`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      // Add new material for this specific sub-item
                      const newMaterial: MaterialItem = {
                        id: `material-${Date.now()}-${Math.random()}`,
                        isNew: true,
                        subItemId: subItem.sub_item_id,
                        subItemName: subItem.sub_item_name,
                        materialName: '',
                        quantity: 0,
                        unit: '',
                        unitRate: 0,
                        reasonForNew: '',
                        justification: ''
                      };
                      setMaterials([...materials, newMaterial]);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] text-white rounded-lg hover:from-[#1e3270] hover:to-[#3d4f8a] shadow-md transition-all"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    Add New
                  </button>
                </div>
              </div>

              {/* Materials for this sub-item */}
              <div className="space-y-2">
                {materials.filter(m => m.subItemId === subItem.sub_item_id).length === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-4">
                    No materials added for this sub-item yet
                  </p>
                ) : (
                  materials.filter(m => m.subItemId === subItem.sub_item_id).map((material, index) => (
                    <div key={material.id} className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h5 className="font-medium text-gray-900 text-xs">Material #{materials.indexOf(material) + 1}</h5>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {!material.isNew && `${material.materialName}`}
                            {!material.isNew && !isSiteEngineer && ` | AED${material.unitRate}/${material.unit}`}
                            {material.isNew && <span className="text-green-600 font-medium">New Material</span>}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMaterial(material.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>

                      {material.isNew ? (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              New Material Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={material.materialName}
                              onChange={(e) => updateMaterial(material.id, { materialName: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                              placeholder="Enter material name"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mb-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
                          <p className="text-[10px] font-medium text-blue-900 mb-0.5">Selected Material</p>
                          <p className="text-xs font-semibold text-blue-900">{material.materialName}</p>
                          <div className="mt-1 flex gap-3 text-[10px] text-blue-700">
                            <span>Unit: {material.unit}</span>
                            {!isSiteEngineer && <span>Rate: AED{material.unitRate.toLocaleString()}/{material.unit}</span>}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Quantity <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={material.quantity}
                            onChange={(e) => updateMaterial(material.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                            min="0.01"
                            step="0.01"
                            placeholder="Qty"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Unit {material.isNew && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="text"
                            value={material.unit}
                            onChange={(e) => material.isNew && updateMaterial(material.id, { unit: e.target.value })}
                            className={`w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg ${
                              material.isNew ? 'bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]' : 'bg-gray-100 cursor-not-allowed'
                            }`}
                            placeholder={material.isNew ? "Unit" : ""}
                            readOnly={!material.isNew}
                            disabled={!material.isNew}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

        </motion.div>
      )}

      {/* Justification */}
      {selectedSubItems.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Justification <span className="text-red-500">*</span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a] ${
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
          rows={2}
          placeholder="Additional notes or comments"
        />
      </div>

      {/* Approval Routing Information */}
      {selectedSubItems.length > 0 && materials.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 p-4 rounded-lg border border-blue-200"
        >
          <div className="flex items-center gap-2 mb-2">
            <InformationCircleIcon className="w-5 h-5 text-blue-600" />
            <h3 className="font-medium text-blue-900">Approval Routing</h3>
          </div>
          <p className="text-sm text-gray-700">
            This request will follow the standard approval flow: <span className="font-semibold text-blue-900">{calculations.routingPath}</span>
          </p>
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
          disabled={loading || isSubmitting || !selectedItem || selectedSubItems.length === 0 || materials.length === 0}
          className="px-6 py-2.5 bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] text-white rounded-lg hover:from-[#1e3270] hover:to-[#3d4f8a] transition-all shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none font-semibold"
          title={isSubmitting ? (initialData?.editMode ? 'Updating...' : 'Creating purchase request...') : ''}
        >
          {loading || isSubmitting ? (initialData?.editMode ? 'Updating...' : 'Creating...') : (initialData?.editMode ? 'Update Purchase Request' : 'Create Purchase Request')}
        </button>
      </div>
    </form>
  );
};

export default ExtraMaterialForm;