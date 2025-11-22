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
import { apiClient } from '@/api/config';
import { useAuthStore } from '@/store/authStore';
import { useAdminViewStore } from '@/store/adminViewStore';

interface Project {
  project_id: number;
  project_name: string;
  status?: string;  // Project status (e.g., "ongoing", "completed")
  areas: Area[];
  assigned_items_details?: any[];  // For Site Engineers - contains items assigned to them
  boqs_with_items?: any[];  // For Site Engineers - BOQs with assigned items
  my_work_confirmed?: boolean;  // SE's work confirmation status
  my_completion_requested?: boolean;  // SE's completion request status
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
  originalBoqQuantity?: number;  // Original BOQ quantity (for validation)
  unit: string;
  unitRate: number;
  reasonForNew?: string;
  justification: string;  // Per-material justification (required for all materials)
  brand?: string;  // Brand for materials
  specification?: string;  // Specification for materials
  size?: string;  // Size for materials
}

interface ExtraMaterialFormProps {
  onSubmit?: (data: any) => Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;  // Support for PM's ChangeRequestsPage
  onSuccess?: () => void;  // Called after successful create/update
  initialData?: any;  // For editing existing change requests
}

// Universal units for dropdown - Comprehensive list for all construction/engineering needs
const COMMON_UNITS = [
  // --- COUNTING UNITS ---
  'nos',
  'pcs',
  'each',
  'unit',
  'pair',
  'set',
  'lot',
  'dozen',
  'gross',

  // --- LENGTH/LINEAR UNITS ---
  // Metric
  'm',
  'cm',
  'mm',
  'km',
  'lm',
  'rmt',
  'running meter',
  // Imperial
  'ft',
  'in',
  'yd',
  'mile',
  'running feet',

  // --- AREA UNITS ---
  // Metric
  'sqm',
  'sqcm',
  'sqmm',
  'hectare',
  'acre',
  // Imperial
  'sqft',
  'sqyd',
  'sqin',

  // --- VOLUME UNITS ---
  // Metric
  'cum',
  'cbm',
  'liters',
  'ml',
  'cc',
  // Imperial
  'cft',
  'cuft',
  'cuyd',
  'cuin',
  'gallons',
  'quarts',

  // --- WEIGHT/MASS UNITS ---
  // Metric
  'kg',
  'grams',
  'mg',
  'ton',
  'tonnes',
  'mt',
  'quintal',
  // Imperial
  'lbs',
  'oz',
  'cwt',

  // --- PACKAGING UNITS ---
  'bags',
  'boxes',
  'cartons',
  'bundles',
  'rolls',
  'sheets',
  'drums',
  'cans',
  'bottles',
  'packets',
  'pallets',
  'crates',
  'sacks',
  'bales',
  'reels',
  'coils',

  // --- CONSTRUCTION SPECIFIC ---
  'brass',
  'bags(50kg)',
  'bags(25kg)',
  'bags(40kg)',
  'length',
  'panel',
  'board',
  'tile',
  'block',
  'brick',
  'slab',
  'plate',
  'beam',
  'rod',
  'bar',
  'pipe',
  'tube',
  'pole',
  'post',

  // --- ELECTRICAL/PLUMBING ---
  'watt',
  'kw',
  'ampere',
  'volt',
  'points',
  'circuits',
  'fixtures',

  // --- PAINT/COATING ---
  'liters',
  'gallons',
  'coat',
  'layer',

  // --- TIME ---
  'hour',
  'day',
  'week',
  'month',
  'year',
  'shift',

  // --- SPECIAL UNITS ---
  'trip',
  'load',
  'batch',
  'run',
  'cycle',
  'service',
  'job',
  'task',
  'activity',

  // --- CUSTOM ---
  'Custom (Type below)'
];

const ExtraMaterialForm: React.FC<ExtraMaterialFormProps> = ({ onSubmit, onCancel, onClose, onSuccess, initialData }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInProgressRef = React.useRef(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // Get admin viewing context
  const { viewingAsRole } = useAdminViewStore();

  // Check actual user role
  const actualUserRole = useMemo(() => {
    return (user as any)?.role?.toLowerCase().replace(/[_\s]/g, '') || '';
  }, [user]);

  // Check if admin is viewing as another role
  const isAdminViewingAs = useMemo(() => {
    return actualUserRole === 'admin' && viewingAsRole !== null;
  }, [actualUserRole, viewingAsRole]);

  // Check if user is Site Engineer or Site Supervisor (including admin viewing as SE)
  const isSiteEngineer = useMemo(() => {
    // Check if admin is viewing as SE
    if (actualUserRole === 'admin' && viewingAsRole) {
      const effectiveRole = viewingAsRole.toLowerCase().replace(/[_\s]/g, '');
      return effectiveRole === 'siteengineer' || effectiveRole === 'sitesupervisor';
    }
    return actualUserRole === 'siteengineer' || actualUserRole === 'sitesupervisor';
  }, [actualUserRole, viewingAsRole]);

  // Check if this is an ACTUAL SE (not admin viewing as SE) - for item restrictions
  const isActualSiteEngineer = useMemo(() => {
    return actualUserRole === 'siteengineer' || actualUserRole === 'sitesupervisor';
  }, [actualUserRole]);

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
    console.log('📋 Form initialData check:', {
      hasInitialData: !!initialData,
      editMode: initialData?.editMode,
      projectsLength: projects.length
    });

    if (initialData && initialData.editMode && projects.length > 0) {
      console.log('🔄 EDIT MODE DETECTED - Pre-filling form with data:', {
        editMode: initialData.editMode,
        cr_id: initialData.cr_id,
        project_id: initialData.project_id,
        boq_id: initialData.boq_id,
        item_id: initialData.item_id,
        materials_count: initialData.sub_items_data?.length
      });

      // Find and select the project
      const project = projects.find(p => p.project_id === initialData.project_id);
      if (project) {
        console.log('✅ Found project for editing:', project.project_name);
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
          console.log('✅ Found area and BOQ:', { area: foundArea.area_name, boq: foundBoq.boq_name });
          console.log('📊 Available items in BOQ:', foundBoq.items?.map(i => ({ id: i.item_id, name: i.item_name })));
          setSelectedArea(foundArea);
          setSelectedBoq(foundBoq);

          // Find and select the item - try multiple field name possibilities
          const itemIdToFind = initialData.item_id || initialData.master_item_id || initialData.boq_item_id;
          console.log('🔍 Looking for item with ID:', itemIdToFind, 'from initialData:', {
            item_id: initialData.item_id,
            master_item_id: initialData.master_item_id,
            boq_item_id: initialData.boq_item_id
          });

          const item = foundBoq.items?.find(i => String(i.item_id) === String(itemIdToFind));
          if (item) {
            console.log('✅ Found item:', item.item_name, 'with ID:', item.item_id);
            setSelectedItem(item);

            // Find all unique sub-items from sub_items_data
            if (initialData.sub_items_data && initialData.sub_items_data.length > 0) {
              const uniqueSubItemIds = [...new Set(initialData.sub_items_data.map((d: any) => d.sub_item_id))];
              const subItems = item.sub_items?.filter(si =>
                uniqueSubItemIds.includes(si.sub_item_id)
              ) || [];
              console.log('✅ Found sub-items:', subItems.map(si => si.sub_item_name));
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
                originalBoqQuantity: mat.original_boq_quantity || mat.boq_quantity || undefined,  // Store original BOQ qty if available
                unit: mat.unit || 'nos',
                unitRate: mat.unit_price || 0,
                reasonForNew: mat.reason || '',
                justification: mat.justification || initialData.justification || '',
                brand: mat.brand || '',
                specification: mat.specification || ''
              }));
              console.log('✅ Pre-filled materials:', transformedMaterials.length);
              setMaterials(transformedMaterials);
            }

            console.log('🎉 Edit mode pre-fill completed successfully!');
          } else {
            console.error('❌ Item not found in BOQ:', { looking_for: initialData.item_id, available: foundBoq?.items?.map(i => i.item_id) });
          }
        } else {
          console.error('❌ Area or BOQ not found:', { area: !!foundArea, boq: !!foundBoq });
        }
      } else {
        console.error('❌ Project not found:', { looking_for: initialData.project_id, available: projects.map(p => p.project_id) });
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
      // Debug log removed

      // For Site Engineers, use sitesupervisor_boq endpoint to get projects with item assignments
      // Use apiClient to include admin viewing context headers
      const endpoint = isSiteEngineer
        ? `/sitesupervisor_boq`
        : `/projects/assigned-to-me`;

      const response = await apiClient.get(endpoint);

      // Debug log removed

      // Extract projects from response
      const projectsList = response.data.projects || [];

      // For Site Engineers: Filter out projects where work is confirmed/completed
      let filteredProjects = projectsList;
      if (isSiteEngineer && projectsList.length > 0) {
        // Debug: Log project structure to verify completion status fields
        console.log('🔍 All projects received:', projectsList.map(p => ({
          name: p.project_name,
          id: p.project_id,
          my_work_confirmed: p.my_work_confirmed,
          completion_requested: p.completion_requested,
          my_completion_requested: p.my_completion_requested
        })));

        // Filter out completed/confirmed projects (only show active work)
        filteredProjects = projectsList.filter(project => {
          // Only hide projects where THIS SE's work is confirmed or THIS SE requested completion
          // Also hide projects with "completed" or "Completed" status
          const isCompleted =
            project.my_work_confirmed === true ||
            project.my_completion_requested === true ||
            project.status?.toLowerCase() === 'completed';

          console.log(`Project "${project.project_name}": isCompleted=${isCompleted}, status=${project.status}, my_work_confirmed=${project.my_work_confirmed}, my_completion_requested=${project.my_completion_requested}`);

          return !isCompleted; // Only include non-completed projects
        });

        console.log(`✅ Filtered projects: ${filteredProjects.length} active out of ${projectsList.length} total`);
      }

      setProjects(filteredProjects);

      if (!filteredProjects || filteredProjects.length === 0) {
        toast.info(isSiteEngineer
          ? 'No active projects available for material requests'
          : 'No projects assigned to you yet'
        );
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
      const response = await apiClient.get(`/change-requests`);

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

  // Material type validation - Check if materials are mixed
  const materialTypeInfo = useMemo(() => {
    const hasNewMaterials = materials.some(m => m.isNew);
    const hasExistingMaterials = materials.some(m => !m.isNew);
    const isMixed = hasNewMaterials && hasExistingMaterials;

    // Determine current material type
    let currentType: 'new' | 'existing' | null = null;
    if (hasNewMaterials && !hasExistingMaterials) currentType = 'new';
    if (hasExistingMaterials && !hasNewMaterials) currentType = 'existing';

    return {
      hasNewMaterials,
      hasExistingMaterials,
      isMixed,
      currentType
    };
  }, [materials]);

  // Computed fields - Dynamic routing based on material types
  const calculations = useMemo(() => {
    // Check if request contains any new (custom) materials
    const hasNewMaterials = materials.some(m => m.isNew);

    // Routing logic:
    // - Existing materials only: PM → Buyer → TD (skip Estimator)
    // - New materials (or mixed): PM → Estimator → Buyer → TD
    let routingPath: string;

    if (hasNewMaterials) {
      // Include Estimator for new materials
      routingPath = isSiteEngineer
        ? 'SE → PM → Estimator → Buyer → TD'
        : 'PM → Estimator → Buyer → TD';
    } else {
      // Skip Estimator for existing materials only
      routingPath = isSiteEngineer
        ? 'SE → PM → Buyer → TD'
        : 'PM → Buyer → TD';
    }

    return { routingPath };
  }, [isSiteEngineer, materials]);

  // Memoized set of already-added materials to avoid closure stale state issues
  const addedMaterialsSet = useMemo(() => {
    const set = new Set<string>();
    materials.forEach(m => {
      if (!m.isNew) {
        // Create composite key: use materialId OR materialName as fallback + subItemId
        // Backend sometimes doesn't return material_id, so use name as fallback
        const materialKey = m.materialId || m.materialName;
        const key = `${materialKey}_${m.subItemId}`;
        console.log('🔑 Adding to set:', {
          materialName: m.materialName,
          materialId: m.materialId,
          materialKey,
          subItemId: m.subItemId,
          key: key
        });
        set.add(key);
      }
    });
    console.log('📋 Complete addedMaterialsSet:', Array.from(set));
    return set;
  }, [materials]);

  // Helper function to reset downstream selections
  const resetDownstreamSelections = (fromLevel: 'project' | 'area' | 'boq' | 'item') => {
    if (fromLevel === 'project') setSelectedArea(null);
    if (['project', 'area'].includes(fromLevel)) setSelectedBoq(null);
    if (['project', 'area', 'boq'].includes(fromLevel)) setSelectedItem(null);
    if (['project', 'area', 'boq', 'item'].includes(fromLevel)) {
      setSelectedSubItems([]);
      setMaterials([]);
    }
    setItemOverhead(null);
  };

  // Helper function to transform materials for API payload
  const transformMaterialsForPayload = (materials: MaterialItem[]) => {
    return materials.map(mat => ({
      material_name: mat.materialName,
      sub_item_id: mat.subItemId || null,
      sub_item_name: mat.subItemName,
      quantity: mat.quantity,
      unit: mat.unit,
      unit_rate: mat.isNew ? 0 : mat.unitRate,
      unit_price: mat.unitRate,
      master_material_id: mat.isNew ? null : mat.materialId,
      reason: mat.isNew ? mat.reasonForNew : null,
      justification: mat.justification,
      brand: mat.isNew ? mat.brand : null,
      specification: mat.isNew ? mat.specification : null,
      size: mat.size || null
    }));
  };

  // Helper function to map items to standardized structure
  const mapItemsToStructure = (items: any[]) => {
    const mapped = items.map((item: any, index: number) => ({
      item_id: item.item_id || item.master_item_id || item.id || `item_${index}`,
      item_name: item.item_name || item.name || `Unnamed Item`,
      overhead_allocated: item.overhead_allocated || 0,
      overhead_consumed: item.overhead_consumed || 0,
      overhead_available: item.overhead_available || 0,
      sub_items: item.sub_items || []
    }));

    console.log('📋 Mapped Items:', mapped.map(m => ({ id: m.item_id, name: m.item_name, sub_items_count: m.sub_items?.length || 0 })));
    return mapped;
  };

  // Helper function to get assigned items for Site Engineers
  // Only applies to ACTUAL SE users, not admin viewing as SE
  const getAssignedItemsForBoq = (boqId: number): any[] | null => {
    if (!isActualSiteEngineer || !selectedProject?.boqs_with_items) {
      return null;
    }

    const boqWithAssignedItems = selectedProject.boqs_with_items.find(
      (b: any) => b.boq_id === boqId
    );

    return boqWithAssignedItems?.assigned_items || null;
  };

  // Helper function to validate form inputs
  const validateFormInputs = (): boolean => {
    // Check required selections
    if (!selectedProject || !selectedArea || !selectedBoq || !selectedItem) {
      toast.error('Please select project, area, BOQ, and BOQ item');
      return false;
    }

    // Check materials exist
    if (materials.length === 0) {
      toast.error('Please add at least one sub-item');
      return false;
    }

    // Validate each material
    for (const material of materials) {
      if (!material.materialName) {
        toast.error('All materials must have a name');
        return false;
      }

      if (material.quantity <= 0) {
        toast.error(`Material "${material.materialName}" must have positive quantity`);
        return false;
      }

      // Validate that existing materials don't exceed BOQ quantity
      if (!material.isNew && material.originalBoqQuantity && material.quantity > material.originalBoqQuantity) {
        toast.error(`Material "${material.materialName}" quantity (${material.quantity}) exceeds BOQ allocated quantity (${material.originalBoqQuantity} ${material.unit})`);
        return false;
      }
    }

    // Validate justification
    if (!justification || justification.trim().length < 20) {
      toast.error('Please provide a justification (minimum 20 characters)');
      return false;
    }

    return true;
  };

  // Helper function to build submission payload
  const buildSubmissionPayload = () => {
    console.log('📦 Materials before payload creation:', materials.map(m => ({
      materialName: m.materialName,
      subItemId: m.subItemId,
      subItemName: m.subItemName,
      isNew: m.isNew,
      materialId: m.materialId,
      type: typeof m.subItemId
    })));

    const transformedMaterials = transformMaterialsForPayload(materials);

    console.log('📤 SUBMISSION PAYLOAD - Materials being sent to backend:', transformedMaterials.map(m => ({
      material_name: m.material_name,
      master_material_id: m.master_material_id,
      is_new: m.master_material_id === null
    })));

    return {
      project_id: selectedProject!.project_id,
      area_id: selectedArea!.area_id,
      boq_id: selectedBoq!.boq_id,
      boq_item_id: selectedItem!.item_id,
      boq_item_name: selectedItem!.item_name,
      materials: transformedMaterials,
      justification,
      remarks
    };
  };

  // Helper function to handle update (edit mode)
  const handleUpdateChangeRequest = async (crId: number) => {
    const updatePayload = {
      boq_id: selectedBoq!.boq_id,
      item_id: selectedItem?.item_id || null,
      item_name: selectedItem?.item_name || null,
      justification: justification || remarks,
      remarks: remarks,
      materials: transformMaterialsForPayload(materials)
    };

    const response = await apiClient.put(
      `/change-request/${crId}`,
      updatePayload
    );

    if (response.data.success || response.data.data) {
      toast.success('Change request updated successfully');
      if (onSuccess) onSuccess();
      if (onCancel) onCancel();
      if (onClose) onClose();
    }
  };

  // Helper function to handle new change request creation
  const handleCreateChangeRequest = async () => {
    const changeRequestPayload = {
      boq_id: selectedBoq!.boq_id,
      item_id: selectedItem?.item_id || null,
      item_name: selectedItem?.item_name || null,
      justification: justification || remarks,
      materials: transformMaterialsForPayload(materials)
    };

    const response = await apiClient.post(
      `/boq/change-request`,
      changeRequestPayload
    );

    if (response.data.success) {
      toast.success('Extra material request created successfully. Click "Send for Review" to submit for approval.');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    }
  };

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
          // Call handleBoqChange to fetch/populate items
          handleBoqChange(singleBoq.boq_id);
        } else {
          resetDownstreamSelections('area');
        }
      } else {
        // Reset downstream selections if multiple areas
        resetDownstreamSelections('project');
      }
    } else {
      // Reset all if no project
      resetDownstreamSelections('project');
    }
  };

  const handleAreaChange = (areaId: number) => {
    if (!selectedProject || !selectedProject.areas) return;
    const area = selectedProject.areas.find(a => a.area_id === areaId);
    setSelectedArea(area || null);
    resetDownstreamSelections('area');
  };

  const handleBoqChange = async (boqId: number) => {
    if (!selectedArea) {
      return;
    }

    const boq = selectedArea.boqs.find(b => b.boq_id === boqId);

    // Reset downstream selections immediately
    resetDownstreamSelections('boq');

    if (!boq) {
      setSelectedBoq(null);
      return;
    }

    // For Site Engineers, try to use assigned items directly (skip API fetch)
    const assignedItems = getAssignedItemsForBoq(boqId);

    if (assignedItems) {
      // Site Engineer has assigned items - use them directly
      const mappedItems = mapItemsToStructure(assignedItems);

      console.log('✅ Using assigned items for Site Engineer:', {
        total: mappedItems.length,
        items: mappedItems
      });

      setSelectedBoq({ ...boq, items: mappedItems });
      return; // Exit early, skip API fetch
    }

    // ACTUAL Site Engineer with no assigned items (not admin viewing as SE)
    if (isActualSiteEngineer) {
      console.log('⚠️ No assigned items found for this BOQ');
      toast.warning('No items assigned to you for this BOQ');
      setSelectedBoq({ ...boq, items: [] });
      return;
    }

    // For non-Site Engineers, fetch all items from API if needed
    if (!boq.items || boq.items.length === 0) {
      try {
        setLoading(true);

        // Fetch the full BOQ details with items
        const response = await apiClient.get(`/boq/${boqId}`);
        const boqDetails = response.data;

        // Extract items from existing_purchase and new_purchase sections
        const existingItems = boqDetails.existing_purchase?.items || [];
        const newPurchaseItems = boqDetails.new_purchase?.items || [];

        // Combine both arrays to get all items
        const allItems = [...existingItems, ...newPurchaseItems];

        console.log('Extracted items:', {
          existing: existingItems.length,
          newPurchase: newPurchaseItems.length,
          total: allItems.length,
          sampleItem: allItems[0]
        });

        // Map items to standardized structure
        const mappedItems = mapItemsToStructure(allItems);

        console.log('Mapped items:', {
          total: mappedItems.length,
          sampleMappedItem: mappedItems[0]
        });

        // Update the BOQ object with the fetched items
        setSelectedBoq({ ...boq, items: mappedItems });
      } catch (error) {
        console.error('Error fetching BOQ items:', error);
        toast.error('Failed to load BOQ items');
        setSelectedBoq(boq); // Set BOQ anyway, even if items failed to load
      } finally {
        setLoading(false);
      }
    } else {
      setSelectedBoq(boq);
    }
  };

  const handleItemChange = (itemId: string) => {
    if (!selectedBoq) return;

    console.log('🔍 Searching for item:', itemId, 'Type:', typeof itemId);
    console.log('📋 Available items:', selectedBoq.items?.map(i => ({ id: i.item_id, type: typeof i.item_id, name: i.item_name })));

    // Handle both string and number comparisons
    const item = selectedBoq.items.find(i => String(i.item_id) === String(itemId));

    console.log('✅ Found item:', item ? { id: item.item_id, name: item.item_name } : 'NOT FOUND');

    setSelectedItem(item || null);
    resetDownstreamSelections('item');
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submission
    if (isSubmitting || submissionInProgressRef.current) {
      console.warn('Submission already in progress, ignoring duplicate submit');
      return;
    }

    // Validate form inputs
    if (!validateFormInputs()) {
      return;
    }

    // Build payload
    const payload = buildSubmissionPayload();

    // Set submission guards
    setIsSubmitting(true);
    submissionInProgressRef.current = true;

    try {
      setLoading(true);

      // Determine submission path
      const isEditMode = initialData && initialData.editMode && initialData.cr_id;

      if (onSubmit) {
        // Custom submit handler provided
        await onSubmit(payload);
      } else if (isEditMode) {
        // Edit mode - update existing change request
        await handleUpdateChangeRequest(initialData.cr_id);
      } else if (onClose) {
        // Create new change request
        await handleCreateChangeRequest();
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
            {selectedProject.areas?.map(area => (
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a] text-sm"
            required
          >
            <option value="">Select BOQ Item</option>
            {selectedBoq.items && selectedBoq.items.length > 0 ? (
              selectedBoq.items.map((item, index) => (
                <option key={item.item_id || index} value={item.item_id}>
                  {item.item_name || `Item ${item.item_id}`}
                </option>
              ))
            ) : (
              <option value="" disabled>No items available</option>
            )}
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
                        console.log('🟢 Selected sub-item:', {
                          sub_item_id: subItem.sub_item_id,
                          sub_item_name: subItem.sub_item_name,
                          type: typeof subItem.sub_item_id
                        });
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

          {/* Warning banner for material type restriction */}
          {materialTypeInfo.currentType && (
            <div className={`p-3 rounded-lg border ${
              materialTypeInfo.currentType === 'existing'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-start gap-2">
                <InformationCircleIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  materialTypeInfo.currentType === 'existing'
                    ? 'text-blue-600'
                    : 'text-green-600'
                }`} />
                <div className="text-sm">
                  <p className={`font-medium ${
                    materialTypeInfo.currentType === 'existing'
                      ? 'text-blue-900'
                      : 'text-green-900'
                  }`}>
                    {materialTypeInfo.currentType === 'existing'
                      ? 'Existing Materials Selected'
                      : 'New Materials Selected'}
                  </p>
                  <p className={`text-xs mt-1 ${
                    materialTypeInfo.currentType === 'existing'
                      ? 'text-blue-700'
                      : 'text-green-700'
                  }`}>
                    {materialTypeInfo.currentType === 'existing'
                      ? 'You can only add existing BOQ materials in this request. To add new materials, create a separate request.'
                      : 'You can only add new materials in this request. To add existing BOQ materials, create a separate request.'}
                  </p>
                </div>
              </div>
            </div>
          )}

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
                          const selectedValue = e.target.value;

                          // Guard: Ignore empty selection
                          if (!selectedValue || selectedValue === "") {
                            return;
                          }

                          // Prevent adding existing materials if new materials already exist
                          if (materialTypeInfo.currentType === 'new') {
                            toast.error('Cannot mix existing and new materials. Please create separate requests for each type.');
                            e.target.value = ""; // Reset dropdown
                            return;
                          }

                          // Debug: Log what we're searching for and what's available
                          console.log('🔍 Material Selection Debug:', {
                            selectedValue,
                            availableMaterials: subItem.materials.map(m => ({
                              material_id: m.material_id,
                              material_name: m.material_name,
                              id_type: typeof m.material_id
                            }))
                          });

                          // Robust find: Try by ID first, fallback to name
                          let material = subItem.materials.find(m => m.material_id === selectedValue);

                          // Fallback: If not found by ID, try by name (handles backend mismatch)
                          if (!material) {
                            material = subItem.materials.find(m => m.material_name === selectedValue);
                            console.log('⚠️ Material found by name fallback:', material ? 'Success' : 'Failed');
                          }

                          if (!material) {
                            console.error('❌ Material not found for value:', selectedValue, {
                              searchedById: true,
                              searchedByName: true,
                              availableIds: subItem.materials.map(m => m.material_id),
                              availableNames: subItem.materials.map(m => m.material_name)
                            });
                            toast.error('Material not found. Please try again.');
                            return;
                          }

                          console.log('✅ Material found:', {
                            sub_item_id: subItem.sub_item_id,
                            sub_item_name: subItem.sub_item_name,
                            material_name: material.material_name,
                            material_id: material.material_id
                          });

                          // Use functional update to check duplicates and add material with current state
                          setMaterials(currentMaterials => {
                            // Check for duplicates using composite key (handles missing material_id)
                            const materialKey = material.material_id || material.material_name;
                            const isDuplicate = currentMaterials.some(
                              m => !m.isNew &&
                                   m.materialId === materialKey &&
                                   m.subItemId === subItem.sub_item_id
                            );

                            if (isDuplicate) {
                              toast.error(`"${material.material_name}" is already added for this sub-item.`);
                              return currentMaterials; // Return unchanged
                            }

                            // Create new material item
                            const newMaterialItem: MaterialItem = {
                              id: `material-${Date.now()}-${Math.random()}`,
                              isNew: false,
                              subItemId: subItem.sub_item_id,
                              subItemName: subItem.sub_item_name,
                              // Use material_id OR material_name as fallback (backend sometimes doesn't return material_id)
                              materialId: material.material_id || material.material_name,
                              materialName: material.material_name,
                              quantity: 0,  // Start with 0, user must enter requested quantity
                              originalBoqQuantity: material.quantity || 0,  // Store BOQ quantity for validation
                              unit: material.unit,
                              unitRate: material.unit_price || 0,
                              justification: ''
                            };

                            // Debug log removed
                            return [...currentMaterials, newMaterialItem];
                          });

                          // Reset dropdown to default
                          e.target.value = "";
                        }}
                        disabled={materialTypeInfo.currentType === 'new'}
                        className={`pl-3 pr-10 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a] ${
                          materialTypeInfo.currentType === 'new'
                            ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                            : 'bg-white border-gray-300'
                        }`}
                        defaultValue=""
                        title={materialTypeInfo.currentType === 'new' ? 'Cannot add existing materials when new materials are selected' : ''}
                      >
                        <option value="">Select Material</option>
                        {subItem.materials.map(material => {
                          // Check if this material is already added using memoized set (fixes closure stale state bug)
                          // Use material_id OR material_name as fallback (backend sometimes doesn't return material_id)
                          const materialKey = material.material_id || material.material_name;
                          const compositeKey = `${materialKey}_${subItem.sub_item_id}`;
                          const isAlreadyAdded = addedMaterialsSet.has(compositeKey);

                          console.log('🔍 Checking material in dropdown:', {
                            materialName: material.material_name,
                            materialId: material.material_id,
                            materialKey,
                            subItemId: subItem.sub_item_id,
                            compositeKey,
                            isAlreadyAdded,
                            setContents: Array.from(addedMaterialsSet)
                          });

                          return (
                            <option
                              key={material.material_id || material.material_name}
                              value={material.material_id || material.material_name}
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
                      // Prevent adding new materials if existing materials already exist
                      if (materialTypeInfo.currentType === 'existing') {
                        toast.error('Cannot mix existing and new materials. Please create separate requests for each type.');
                        return;
                      }

                      // Add new material for this specific sub-item
                      console.log('🟡 Creating new material for sub-item:', {
                        sub_item_id: subItem.sub_item_id,
                        sub_item_name: subItem.sub_item_name,
                        type: typeof subItem.sub_item_id
                      });
                      const newMaterial: MaterialItem = {
                        id: `material-${Date.now()}-${Math.random()}`,
                        isNew: true,
                        subItemId: subItem.sub_item_id,
                        subItemName: subItem.sub_item_name,
                        materialName: '',
                        quantity: 0,
                        unit: 'nos',
                        unitRate: 0,
                        reasonForNew: '',
                        justification: '',
                        brand: '',
                        specification: ''
                      };
                      // Use functional update to avoid stale state
                      setMaterials(prevMaterials => [...prevMaterials, newMaterial]);
                    }}
                    disabled={materialTypeInfo.currentType === 'existing'}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg shadow-md transition-all ${
                      materialTypeInfo.currentType === 'existing'
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] text-white hover:from-[#1e3270] hover:to-[#3d4f8a]'
                    }`}
                    title={materialTypeInfo.currentType === 'existing' ? 'Cannot add new materials when existing materials are selected' : ''}
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
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Brand
                              </label>
                              <input
                                type="text"
                                value={material.brand || ''}
                                onChange={(e) => updateMaterial(material.id, { brand: e.target.value })}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                                placeholder="Enter brand"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Size
                              </label>
                              <input
                                type="text"
                                value={material.size || ''}
                                onChange={(e) => updateMaterial(material.id, { size: e.target.value })}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                                placeholder="Enter size"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Specification
                              </label>
                              <input
                                type="text"
                                value={material.specification || ''}
                                onChange={(e) => updateMaterial(material.id, { specification: e.target.value })}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                                placeholder="Enter spec"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
                          <p className="text-[10px] font-medium text-blue-900 mb-0.5">Selected Material</p>
                          <p className="text-xs font-semibold text-blue-900">{material.materialName}</p>
                          <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-blue-700">
                            <div>
                              <span className="font-medium">BOQ Qty:</span> {material.originalBoqQuantity || 0} {material.unit}
                            </div>
                            {!isSiteEngineer && (
                              <div>
                                <span className="font-medium">Rate:</span> AED{material.unitRate.toLocaleString()}/{material.unit}
                              </div>
                            )}
                          </div>
                          {(() => {
                            // Calculate already purchased quantity from existing requests
                            const alreadyPurchased = existingRequests
                              .filter(req => req.status !== 'rejected')
                              .reduce((total, req) => {
                                const matchingMaterial = (req.materials_data || []).find(
                                  (m: any) => (m.material_name === material.materialName || m.master_material_id === material.materialId) &&
                                              m.sub_item_id === material.subItemId
                                );
                                return total + (matchingMaterial ? (matchingMaterial.quantity || 0) : 0);
                              }, 0);

                            return alreadyPurchased > 0 ? (
                              <div className="mt-2 pt-2 border-t border-blue-300">
                                <div className="flex items-center gap-1.5">
                                  <InformationCircleIcon className="w-3.5 h-3.5 text-orange-600" />
                                  <div>
                                    <p className="text-[10px] font-medium text-orange-700">Already Purchased</p>
                                    <p className="text-xs font-bold text-orange-900">{alreadyPurchased} {material.unit}</p>
                                  </div>
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {/* Quantity and Unit - Now Editable for ALL materials (both new and existing) */}
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Request Quantity <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={material.quantity}
                            onChange={(e) => {
                              const newQty = parseFloat(e.target.value) || 0;
                              // For existing materials, validate against BOQ quantity
                              if (!material.isNew && material.originalBoqQuantity && newQty > material.originalBoqQuantity) {
                                toast.error(`Quantity cannot exceed BOQ allocated quantity of ${material.originalBoqQuantity} ${material.unit}`);
                                return;
                              }
                              updateMaterial(material.id, { quantity: newQty });
                            }}
                            className={`w-full px-2 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a] ${
                              !material.isNew && material.originalBoqQuantity && material.quantity > material.originalBoqQuantity
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-300'
                            }`}
                            min="0.01"
                            max={!material.isNew && material.originalBoqQuantity ? material.originalBoqQuantity : undefined}
                            step="0.01"
                            placeholder="Qty"
                          />
                          {!material.isNew && material.originalBoqQuantity && material.quantity > material.originalBoqQuantity && (
                            <p className="text-[10px] text-red-600 mt-0.5">
                              Exceeds BOQ limit of {material.originalBoqQuantity} {material.unit}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Unit <span className="text-red-500">*</span>
                          </label>
                          {material.isNew ? (
                            <div className="space-y-1">
                              <select
                                value={material.unit === 'Custom (Type below)' || !COMMON_UNITS.includes(material.unit) ? 'Custom (Type below)' : material.unit}
                                onChange={(e) => {
                                  if (e.target.value === 'Custom (Type below)') {
                                    updateMaterial(material.id, { unit: '' });
                                  } else {
                                    updateMaterial(material.id, { unit: e.target.value });
                                  }
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                                required
                              >
                                <option value="">Select unit</option>
                                {COMMON_UNITS.map(unit => (
                                  <option key={unit} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                              {(material.unit === 'Custom (Type below)' || (material.unit && !COMMON_UNITS.includes(material.unit))) && (
                                <input
                                  type="text"
                                  value={material.unit === 'Custom (Type below)' ? '' : material.unit}
                                  onChange={(e) => updateMaterial(material.id, { unit: e.target.value })}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
                                  placeholder="Enter custom unit"
                                  required
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={material.unit}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                              readOnly
                              disabled
                            />
                          )}
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

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (1,217 lines)
export default React.memo(ExtraMaterialForm);