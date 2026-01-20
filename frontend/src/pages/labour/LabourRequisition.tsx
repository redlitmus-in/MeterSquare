/**
 * Labour Requisition Page
 * Site Engineer: Create and manage labour requisitions (Step 2)
 * Shows assigned projects and BOQ labour requirements
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { labourService, LabourRequisition as RequisitionType, CreateRequisitionData } from '@/services/labourService';
import { showSuccess, showError } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';
import {
  PlusIcon,
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  XMarkIcon,
  UsersIcon,
  CubeIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  CalendarIcon,
  MapPinIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  TrashIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';

// API response structure from /projects/assigned-to-me
interface Material {
  material_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

interface SubItem {
  sub_item_id: string;
  sub_item_name: string;
  materials: Material[];
  labour?: LabourItem[];
}

interface BOQItem {
  item_id: string;
  item_name: string;
  overhead_allocated: number;
  overhead_available: number;
  overhead_consumed: number;
  sub_items: SubItem[];
}

interface BOQ {
  boq_id: number;
  boq_name: string;
  items: BOQItem[];
}

interface Area {
  area_id: number;
  area_name: string;
  boqs: BOQ[];
}

interface Project {
  project_id: number;
  project_code: string;
  project_name: string;
  project_status: string;
  location?: string;
  floor_name?: string;
  area?: string;
  areas: Area[];
}

// Labour item status from existing requisitions
interface LabourItemStatus {
  requisition_id: number;
  requisition_code: string;
  status: string;
  work_status: string;
  assignment_status: string;
}

interface LabourItem {
  labour_id?: number | string;
  labour_role: string;
  labour_type?: string;
  hours?: number;
  rate_per_hour?: number;
  amount?: number;
  sub_item_name?: string;
  item_name?: string;
  // BOQ reference for tracking
  boq_id?: number;
  item_id?: string;
}

// Grouped labour by item for collapsible display
interface GroupedLabour {
  item_id: string;
  item_name: string;
  boq_id?: number;
  labours: LabourItem[];
}

// Selected labour item with workers count for multi-select
interface SelectedLabour extends LabourItem {
  workers_count?: number;
  uniqueKey: string;
  // Status tracking
  requisition_status?: 'pending' | 'approved' | 'rejected' | 'assigned' | 'completed';
}

// Tab configuration
type TabType = 'pending' | 'approved' | 'rejected' | 'assigned';

interface TabConfig {
  key: TabType;
  label: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { key: 'pending', label: 'Pending', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: ClockIcon },
  { key: 'approved', label: 'Approved', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircleIcon },
  { key: 'rejected', label: 'Rejected', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircleIcon },
  { key: 'assigned', label: 'Assigned', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: UserGroupIcon },
];

// Available skill options for labour requisitions
const skillOptions = ['Mason', 'Carpenter', 'Helper', 'Electrician', 'Plumber', 'Welder', 'Painter', 'Fitter'];

// Helper function to convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time24: string): string => {
  if (!time24) return '';

  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  return `${hour12}:${minutes} ${period}`;
};

const LabourRequisition: React.FC = () => {
  const [requisitions, setRequisitions] = useState<RequisitionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const perPage = 15;

  // Get current user role
  const [userRole, setUserRole] = useState<string>('');
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setUserRole(user.role?.toUpperCase() || '');
  }, []);

  // Tab counts
  const [tabCounts, setTabCounts] = useState<Record<TabType, number>>({
    pending: 0,
    approved: 0,
    rejected: 0,
    assigned: 0
  });

  // View details modal
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<RequisitionType | null>(null);
  const [relatedRequisitions, setRelatedRequisitions] = useState<RequisitionType[]>([]);

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmTitle, setConfirmTitle] = useState('');

  // Edit rejected requisition modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRequisition, setEditingRequisition] = useState<RequisitionType | null>(null);
  const [editFormData, setEditFormData] = useState({
    site_name: '',
    work_description: '',
    skill_required: '',
    workers_count: 1,
    required_date: '',
    start_time: '',
    end_time: '',
    preferred_workers_notes: ''
  });
  const [editLabourItems, setEditLabourItems] = useState<any[]>([]);
  const [resubmitting, setResubmitting] = useState(false);

  // Projects and BOQ data
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [groupedLabours, setGroupedLabours] = useState<GroupedLabour[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [boqLoading, setBOQLoading] = useState(false);

  // Multi-select labour items
  const [selectedLabours, setSelectedLabours] = useState<SelectedLabour[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Labour status tracking - map of labour_id to status info
  const [labourStatusMap, setLabourStatusMap] = useState<Record<string, LabourItemStatus>>({});

  // Worker selection for preferred workers
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<any[]>([]);
  const [workerSearchQuery, setWorkerSearchQuery] = useState('');

  const [formData, setFormData] = useState<CreateRequisitionData>({
    project_id: 0,
    site_name: '',
    work_description: '',
    skill_required: '',
    workers_count: 1,
    required_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    preferred_workers_notes: ''
  });

  // Fetch SE's assigned projects
  const fetchProjects = async () => {
    setProjectsLoading(true);
    try {
      const response = await apiClient.get('/projects/assigned-to-me');
      if (response.data?.projects) {
        setProjects(response.data.projects);
      }
    } catch {
      showError('Failed to load projects. Please refresh the page.');
    } finally {
      setProjectsLoading(false);
    }
  };

  // Fetch available workers based on selected labour skills
  const fetchWorkers = async () => {
    setWorkersLoading(true);
    try {
      // Get unique skills from selected labours
      // Use labour_role (from BOQ) or skill_required (from manual entry)
      const selectedSkills = Array.from(new Set(
        selectedLabours
          .map(labour => (labour as any).labour_role || labour.skill_required)
          .filter(skill => skill != null && skill !== '')
      ));

      if (selectedSkills.length === 0) {
        setAvailableWorkers([]);
        setWorkersLoading(false);
        return;
      }

      // Fetch workers for all selected skills
      const allWorkers: any[] = [];
      const workerIds = new Set<number>();

      for (const skill of selectedSkills) {
        const response = await labourService.getWorkers({
          status: 'active',
          per_page: 100,
          skill: skill
        });

        if (response.success && response.data) {
          // Add workers, avoiding duplicates
          response.data.forEach((worker: any) => {
            if (!workerIds.has(worker.worker_id)) {
              allWorkers.push(worker);
              workerIds.add(worker.worker_id);
            }
          });
        }
      }

      setAvailableWorkers(allWorkers);
    } catch (error) {
      console.error('Failed to load workers:', error);
      showError('Failed to load workers');
    } finally {
      setWorkersLoading(false);
    }
  };

  // Auto-fetch workers when selected labours change
  useEffect(() => {
    fetchWorkers();
  }, [selectedLabours]);

  // Toggle item expansion
  const toggleItemExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Extract BOQ data from project (data is already included in the response)
  const extractBOQData = (project: Project) => {
    const labourByItem: Map<string, GroupedLabour> = new Map();

    // Iterate through areas and BOQs to extract labour grouped by item
    (project.areas || []).forEach((area) => {
      (area.boqs || []).forEach((boq) => {
        (boq.items || []).forEach((item) => {
          // Extract labour from sub_items if exists
          (item.sub_items || []).forEach((subItem) => {
            if (subItem.labour && subItem.labour.length > 0) {
              subItem.labour.forEach((lab) => {
                const labourItem: LabourItem = {
                  ...lab,
                  sub_item_name: subItem.sub_item_name,
                  item_name: item.item_name
                };

                // Group by item
                const key = item.item_id;
                if (!labourByItem.has(key)) {
                  labourByItem.set(key, {
                    item_id: item.item_id,
                    item_name: item.item_name,
                    labours: []
                  });
                }
                labourByItem.get(key)!.labours.push(labourItem);
              });
            }
          });
        });
      });
    });

    // Convert map to array
    const grouped = Array.from(labourByItem.values());

    // Expand first item by default if there's data
    if (grouped.length > 0) {
      setExpandedItems(new Set([grouped[0].item_id]));
    } else {
      setExpandedItems(new Set());
    }

    setGroupedLabours(grouped);
  };

  // Generate unique key for labour item
  const getLabourKey = (labour: LabourItem, idx: number): string => {
    return `${labour.item_name}-${labour.sub_item_name}-${labour.labour_role}-${idx}`;
  };

  // Check if labour is selected
  const isLabourSelected = (labour: LabourItem, idx: number): boolean => {
    const key = getLabourKey(labour, idx);
    return selectedLabours.some(s => s.uniqueKey === key);
  };

  // Toggle labour selection
  const toggleLabourSelection = (labour: LabourItem, idx: number) => {
    const key = getLabourKey(labour, idx);
    const isSelected = selectedLabours.some(s => s.uniqueKey === key);

    if (isSelected) {
      // Remove from selection
      setSelectedLabours(prev => prev.filter(s => s.uniqueKey !== key));
    } else {
      // Add to selection with undefined workers count (will show placeholder)
      setSelectedLabours(prev => [...prev, {
        ...labour,
        workers_count: undefined,
        uniqueKey: key
      }]);
    }
  };

  // Update workers count for selected labour
  const updateWorkersCount = (uniqueKey: string, count: number) => {
    setSelectedLabours(prev => prev.map(s =>
      s.uniqueKey === uniqueKey ? { ...s, workers_count: Math.max(1, count) } : s
    ));
  };

  // Remove from selection
  const removeFromSelection = (uniqueKey: string) => {
    setSelectedLabours(prev => prev.filter(s => s.uniqueKey !== uniqueKey));
  };

  // Select all labours in an item group (only non-processed ones)
  const selectAllInGroup = (group: GroupedLabour) => {
    const newSelections: SelectedLabour[] = [];
    group.labours.forEach((labour, idx) => {
      const key = getLabourKey(labour, idx);
      // Skip already selected and processed items
      if (!selectedLabours.some(s => s.uniqueKey === key) && !isLabourItemProcessed(labour)) {
        newSelections.push({
          ...labour,
          workers_count: undefined,
          uniqueKey: key
        });
      }
    });
    setSelectedLabours(prev => [...prev, ...newSelections]);
  };

  // Check if all available (non-processed) items in group are selected
  const isGroupFullySelected = (group: GroupedLabour): boolean => {
    return group.labours.every((labour, idx) =>
      isLabourSelected(labour, idx) || isLabourItemProcessed(labour)
    );
  };

  // Count available (non-processed) items in a group
  const getGroupAvailableCount = (group: GroupedLabour): number => {
    return group.labours.filter(labour => !isLabourItemProcessed(labour)).length;
  };

  // Submit all selected requisitions (parallel execution for better performance)
  const handleBulkSubmit = async () => {
    if (selectedLabours.length === 0) {
      showError('Please select at least one labour item');
      return;
    }

    if (!formData.project_id) {
      showError('Please select a project');
      return;
    }

    if (!formData.required_date) {
      showError('Please select a required date');
      return;
    }

    setSubmitting(true);

    try {
      // Create single requisition with multiple labour items
      const labour_items = selectedLabours.map((labour) => ({
        work_description: `${labour.item_name} - ${labour.sub_item_name || labour.labour_role}`,
        skill_required: labour.labour_role,
        workers_count: labour.workers_count || 1,
        boq_id: labour.boq_id,
        item_id: labour.item_id,
        labour_id: labour.labour_id ? String(labour.labour_id) : undefined
      }));

      const requisitionData: CreateRequisitionData = {
        project_id: formData.project_id,
        site_name: formData.site_name,
        required_date: formData.required_date,
        start_time: formData.start_time || undefined,
        end_time: formData.end_time || undefined,
        preferred_worker_ids: selectedWorkers.map(w => w.worker_id),
        labour_items: labour_items
      };

      const result = await labourService.createRequisition(requisitionData);

      setSubmitting(false);

      if (result.success) {
        showSuccess(`Requisition created successfully with ${selectedLabours.length} labour item(s)`);
        fetchRequisitions();
        fetchTabCounts();
        setShowAddModal(false);
        resetForm();
      } else {
        showError(result.error || 'Failed to create requisition');
      }
    } catch (error: any) {
      setSubmitting(false);
      showError(error.message || 'Failed to create requisition');
    }
  };

  const fetchRequisitions = async () => {
    setLoading(true);
    // Map tab to API status filter
    let statusFilter: string | undefined;
    if (activeTab === 'assigned') {
      // For assigned tab, fetch approved requisitions with assignment_status = 'assigned'
      statusFilter = 'approved';
    } else if (activeTab === 'pending') {
      // For pending tab, fetch all requisitions that haven't been approved/rejected yet
      // This includes both 'pending' (not yet sent) and 'send_to_pm' (sent to PM)
      statusFilter = 'pending,send_to_pm';
    } else {
      statusFilter = activeTab;
    }

    const result = await labourService.getMyRequisitions(statusFilter, currentPage, perPage);
    if (result.success) {
      let data = result.data;
      // Additional filtering for assigned tab
      if (activeTab === 'assigned') {
        data = data.filter((req: RequisitionType) => req.assignment_status === 'assigned');
      } else if (activeTab === 'approved') {
        // For approved tab, exclude requisitions that have been assigned workers
        data = data.filter((req: RequisitionType) => req.assignment_status !== 'assigned');
      }
      setRequisitions(data);
      setPagination(result.pagination);
    } else {
      showError(result.message || 'Failed to fetch requisitions');
    }
    setLoading(false);
  };

  // Fetch counts for all tabs
  const fetchTabCounts = async () => {
    try {
      // Fetch all requisitions (use large perPage to get complete counts)
      const results = await Promise.all([
        labourService.getMyRequisitions('pending,send_to_pm', 1, 1000),
        labourService.getMyRequisitions('approved', 1, 1000),
        labourService.getMyRequisitions('rejected', 1, 1000),
        labourService.getMyRequisitions('approved', 1, 1000)
      ]);

      // Count assigned requisitions (approved with assignment_status = 'assigned')
      const assignedCount = results[3].success
        ? results[3].data.filter((req: RequisitionType) => req.assignment_status === 'assigned').length
        : 0;

      // Count approved requisitions (approved but NOT assigned)
      const approvedCount = results[1].success
        ? results[1].data.filter((req: RequisitionType) => req.assignment_status !== 'assigned').length
        : 0;

      setTabCounts({
        pending: results[0].success ? results[0].data.length : 0,
        approved: approvedCount,
        rejected: results[2].success ? results[2].data.length : 0,
        assigned: assignedCount
      });
    } catch (error) {
      console.error('Failed to fetch tab counts:', error);
    }
  };

  // View details handler
  const handleViewDetails = (requisition: RequisitionType) => {
    setSelectedRequisition(requisition);

    // Find all related requisitions created in the same batch
    // Same project, same requester, and created within the same minute
    const clickedDate = new Date(requisition.request_date);
    const related = requisitions.filter(req => {
      if (req.project_id !== requisition.project_id) return false;
      if (req.requested_by_id !== requisition.requested_by_id) return false;

      // Check if request dates are within 1 minute of each other
      const reqDate = new Date(req.request_date);
      const timeDiff = Math.abs(reqDate.getTime() - clickedDate.getTime());
      return timeDiff < 60000; // 60000ms = 1 minute
    });

    setRelatedRequisitions(related);
    setShowDetailsModal(true);
  };

  // Fetch projects only once on mount
  useEffect(() => {
    fetchProjects();
    fetchTabCounts();
  }, []);

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Fetch requisitions when tab or page changes
  useEffect(() => {
    fetchRequisitions();
  }, [activeTab, currentPage]);

  // When project is selected - auto-fill form with project data
  const handleProjectSelect = async (projectId: number) => {
    const project = projects.find(p => p.project_id === projectId);
    setSelectedProject(project || null);

    if (project) {
      // Build detailed site location from ALL project fields
      // Format: "Location, Floor Name, Area" or fallback to project name
      const locationParts: string[] = [];

      // Add location (main address/location) - e.g., "Remote", "Dubai Marina"
      if (project.location && project.location.trim()) {
        locationParts.push(project.location.trim());
      }

      // Add floor name - e.g., "2nd Floor", "Ground Floor"
      if (project.floor_name && project.floor_name.trim()) {
        locationParts.push(project.floor_name.trim());
      }

      // Add area - e.g., "Zone A", "1000 sq.ft."
      if (project.area && project.area.trim()) {
        locationParts.push(project.area.trim());
      }

      // Build site name: join all parts with comma, or use project name as fallback
      let siteName = '';
      if (locationParts.length > 0) {
        siteName = locationParts.join(', ');
      } else {
        // Fallback to project name if no location fields are set
        siteName = project.project_name || '';
      }

      setFormData(prev => ({
        ...prev,
        project_id: projectId,
        site_name: siteName
      }));

      // Extract BOQ data from the project (already included in response)
      extractBOQData(project);

      // Fetch existing requisitions for this project to show status on labour items
      try {
        const statusResult = await labourService.getRequisitionsByProject(projectId);
        if (statusResult.success && statusResult.labourStatusMap) {
          setLabourStatusMap(statusResult.labourStatusMap);
        } else {
          console.warn('Failed to fetch labour status map:', statusResult.message);
          setLabourStatusMap({});
        }
      } catch (error) {
        console.warn('Error fetching labour status map:', error);
        setLabourStatusMap({});
      }
    } else {
      setFormData(prev => ({
        ...prev,
        project_id: 0,
        site_name: ''
      }));
      setGroupedLabours([]);
      setExpandedItems(new Set());
      setSelectedLabours([]);
      setLabourStatusMap({});
    }
  };

  const resetForm = () => {
    setFormData({
      project_id: 0,
      site_name: '',
      work_description: '',
      skill_required: '',
      workers_count: 1,
      required_date: new Date().toISOString().split('T')[0],
      start_time: '',
      end_time: '',
      preferred_workers_notes: ''
    });
    setSelectedProject(null);
    setGroupedLabours([]);
    setExpandedItems(new Set());
    setSelectedLabours([]);
    setLabourStatusMap({});
    setSelectedWorkers([]);
    setWorkerSearchQuery('');
    setAvailableWorkers([]);
  };

  // Handle opening edit modal for rejected requisition
  const handleEditRequisition = (requisition: RequisitionType) => {
    setEditingRequisition(requisition);
    setEditFormData({
      site_name: requisition.site_name || '',
      work_description: requisition.work_description || '',
      skill_required: requisition.skill_required || '',
      workers_count: requisition.workers_count || 1,
      required_date: requisition.required_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      start_time: requisition.start_time || '',
      end_time: requisition.end_time || '',
      preferred_workers_notes: requisition.preferred_workers_notes || ''
    });

    // Initialize labour items for editing
    if (requisition.labour_items && requisition.labour_items.length > 0) {
      setEditLabourItems(JSON.parse(JSON.stringify(requisition.labour_items))); // Deep copy
    } else {
      // Fallback for old format
      setEditLabourItems([{
        work_description: requisition.work_description || '',
        skill_required: requisition.skill_required || '',
        workers_count: requisition.workers_count || 1,
        boq_id: requisition.boq_id,
        item_id: requisition.item_id,
        labour_id: requisition.labour_id
      }]);
    }

    setShowEditModal(true);
  };

  // Show custom confirmation dialog
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => onConfirm);
    setShowConfirmDialog(true);
  };

  // Handle confirmation
  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction();
    }
    setShowConfirmDialog(false);
    setConfirmAction(null);
  };

  // Handle delete requisition
  const handleDeleteRequisition = (requisitionId: number) => {
    showConfirm(
      'Delete Requisition',
      'Are you sure you want to delete this requisition? This action cannot be undone.',
      async () => {
        try {
          const response = await apiClient.delete(`/labour/requisitions/${requisitionId}`);
          if (response.data.success) {
            showSuccess('Requisition deleted successfully');
            fetchRequisitions();
            fetchTabCounts();
          } else {
            showError(response.data.error || 'Failed to delete requisition');
          }
        } catch (error: any) {
          showError(error.response?.data?.error || 'Failed to delete requisition');
        }
      }
    );
  };

  // Handle resend/resubmit pending requisition to PM
  const handleResendRequisition = (requisitionId: number) => {
    showConfirm(
      'Send to Project Manager',
      'Send this requisition to Project Manager for approval?',
      async () => {
        try {
          const response = await apiClient.post(`/labour/requisitions/${requisitionId}/resend`);
          if (response.data.success) {
            showSuccess('Requisition sent to Project Manager successfully');
            fetchRequisitions();
            fetchTabCounts();
          } else {
            showError(response.data.error || 'Failed to send requisition');
          }
        } catch (error: any) {
          showError(error.response?.data?.error || 'Failed to send requisition');
        }
      }
    );
  };

  // Handle send to production (PM only)
  const handleSendToProduction = (requisitionId: number) => {
    showConfirm(
      'Send to Production',
      'Send this requisition to Production Manager for worker assignment?',
      async () => {
        try {
          const result = await labourService.sendToProduction(requisitionId);
          if (result.success) {
            showSuccess(result.message || 'Requisition sent to production successfully');
            fetchRequisitions();
            fetchTabCounts();
          } else {
            showError(result.message || 'Failed to send requisition');
          }
        } catch (error: any) {
          showError('Failed to send requisition to production');
        }
      }
    );
  };

  // Update labour item field
  const updateLabourItemField = (index: number, field: string, value: any) => {
    setEditLabourItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Remove labour item from edit list
  const removeLabourItem = (index: number) => {
    if (editLabourItems.length === 1) {
      showError('Cannot remove the last labour item');
      return;
    }
    setEditLabourItems(prev => prev.filter((_, i) => i !== index));
  };

  // Handle resubmitting edited requisition
  const handleResubmit = async () => {
    if (!editingRequisition) return;

    // Client-side validation
    if (!editFormData.site_name?.trim()) {
      showError('Site/Location is required');
      return;
    }
    if (!editFormData.required_date) {
      showError('Required date is required');
      return;
    }
    // Check if date is in the past
    const selectedDate = new Date(editFormData.required_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      showError('Required date cannot be in the past');
      return;
    }

    // Validate labour items
    for (let i = 0; i < editLabourItems.length; i++) {
      const item = editLabourItems[i];
      if (!item.work_description?.trim()) {
        showError(`Work description is required for labour item ${i + 1}`);
        return;
      }
      if (!item.skill_required?.trim()) {
        showError(`Skill is required for labour item ${i + 1}`);
        return;
      }
      if (!item.workers_count || item.workers_count < 1) {
        showError(`Workers count must be at least 1 for labour item ${i + 1}`);
        return;
      }
    }

    setResubmitting(true);

    try {
      const payload = {
        site_name: editFormData.site_name,
        required_date: editFormData.required_date,
        start_time: editFormData.start_time || undefined,
        end_time: editFormData.end_time || undefined,
        preferred_workers_notes: editFormData.preferred_workers_notes || undefined,
        labour_items: editLabourItems
      };

      const response = await apiClient.put(`/labour/requisitions/${editingRequisition.requisition_id}/resubmit`, payload);

      if (response.data.success) {
        showSuccess(response.data.message || 'Requisition updated and sent to Project Manager successfully');
        setShowEditModal(false);
        setEditingRequisition(null);
        setEditLabourItems([]);
        fetchRequisitions();
        fetchTabCounts();
      } else {
        showError(response.data.error || 'Failed to update requisition');
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to update requisition');
    } finally {
      setResubmitting(false);
    }
  };

  // Get status info for a labour item
  const getLabourItemStatus = (labour: LabourItem): LabourItemStatus | null => {
    const labourId = labour.labour_id ? String(labour.labour_id) : null;
    if (labourId && labourStatusMap[labourId]) {
      return labourStatusMap[labourId];
    }
    return null;
  };

  // Check if labour item is already assigned or completed
  const isLabourItemProcessed = (labour: LabourItem): boolean => {
    // Allow all labour items to be selectable regardless of status
    return false;
  };

  // Get status badge for labour item
  const getLabourStatusBadge = (labour: LabourItem) => {
    const status = getLabourItemStatus(labour);
    if (!status) return null;

    // Determine badge color and text based on work_status
    let bgColor = 'bg-gray-100';
    let textColor = 'text-gray-700';
    let label = status.work_status || status.status;

    if (status.work_status === 'completed') {
      bgColor = 'bg-green-100';
      textColor = 'text-green-700';
      label = 'Completed';
    } else if (status.work_status === 'assigned' || status.assignment_status === 'assigned') {
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-700';
      label = 'Assigned';
    } else if (status.work_status === 'in_progress') {
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-700';
      label = 'In Progress';
    } else if (status.status === 'approved') {
      bgColor = 'bg-purple-100';
      textColor = 'text-purple-700';
      label = 'Approved';
    } else if (status.status === 'pending') {
      bgColor = 'bg-orange-100';
      textColor = 'text-orange-700';
      label = 'Pending';
    } else if (status.status === 'rejected') {
      bgColor = 'bg-red-100';
      textColor = 'text-red-700';
      label = 'Rejected';
    }

    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${bgColor} ${textColor} font-medium`}>
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1"><ClockIcon className="w-3 h-3" /> Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1"><CheckCircleIcon className="w-3 h-3" /> Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 flex items-center gap-1"><XCircleIcon className="w-3 h-3" /> Rejected</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getAssignmentBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">Assigned</span>;
      case 'unassigned':
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">Unassigned</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Labour Requisition</h1>
          <p className="text-gray-600">Create and manage labour requisitions for your projects</p>
        </div>
        <button
          onClick={() => {
            setShowAddModal(true);
            fetchWorkers();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          New Requisition
        </button>
      </div>

      {/* Status Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 overflow-x-auto pb-px" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    isActive
                      ? `border-purple-600 text-purple-600`
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-purple-600' : ''}`} />
                  {tab.label}
                  {tabCounts[tab.key] > 0 && (
                    <span className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                      isActive ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {tabCounts[tab.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Requisitions List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : requisitions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No requisitions found</h3>
          <p className="mt-1 text-sm text-gray-500">Create a new requisition to request workers.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requisitions.map((req) => (
            <motion.div
              key={req.requisition_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg border border-gray-200 px-6 py-6 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-semibold text-gray-900 text-sm">{req.requisition_code}</span>
                  {getStatusBadge(req.status)}
                  {req.status === 'approved' && getAssignmentBadge(req.assignment_status)}
                  {/* Show requester role badge */}
                  {req.requester_role && (
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      req.requester_role === 'PM'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-teal-100 text-teal-700'
                    }`}>
                      {req.requester_role === 'PM' ? 'PM Request' : 'SE Request'}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 hidden sm:inline">|</span>
                  {req.labour_items && req.labour_items.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {Array.from(new Set(req.labour_items.map((item: any) => item.skill_required))).map((skill: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">{req.skill_required}</span>
                  )}
                  <span className="text-xs text-gray-600"><UsersIcon className="w-3 h-3 inline mr-0.5" />{req.workers_count || req.total_workers_count}</span>
                  <span className="text-xs text-gray-500 hidden md:inline">
                    <CalendarIcon className="w-3 h-3 inline mr-0.5" />
                    {new Date(req.required_date).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-gray-400 truncate hidden lg:inline">{req.project_name || `#${req.project_id}`}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleViewDetails(req)}
                    className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-purple-600 border border-purple-200 rounded hover:bg-purple-50 transition-colors"
                    title="View Details"
                  >
                    <EyeIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">View</span>
                  </button>

                  {/* Actions for pending requisitions */}
                  {req.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleEditRequisition(req)}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                        title="Edit Requisition"
                      >
                        <PencilSquareIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      {/* Show "Send to Production" for PM requisitions, "Send to PM" for SE requisitions */}
                      {req.requester_role === 'PM' && userRole === 'PM' ? (
                        <button
                          onClick={() => handleSendToProduction(req.requisition_id)}
                          className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-purple-600 border border-purple-200 rounded hover:bg-purple-50 transition-colors"
                          title="Send to Production"
                        >
                          <PaperAirplaneIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Send to Production</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleResendRequisition(req.requisition_id)}
                          className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-green-600 border border-green-200 rounded hover:bg-green-50 transition-colors"
                          title="Send to PM"
                        >
                          <PaperAirplaneIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Send to PM</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteRequisition(req.requisition_id)}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                        title="Delete Requisition"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </>
                  )}

                  {/* View, Edit, and Resend buttons for rejected requisitions */}
                  {req.status === 'rejected' && (
                    <>
                      <button
                        onClick={() => handleEditRequisition(req)}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                        title="Edit Requisition"
                      >
                        <PencilSquareIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        onClick={() => handleResendRequisition(req.requisition_id)}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-green-600 border border-green-200 rounded hover:bg-green-50 transition-colors"
                        title="Resend to PM"
                      >
                        <PaperAirplaneIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Resend to PM</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Show rejection reason inline if rejected */}
              {req.status === 'rejected' && req.rejection_reason && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <span className="font-medium">Rejected:</span> {req.rejection_reason}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-between bg-white px-4 py-3 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Showing <span className="font-medium">{(currentPage - 1) * perPage + 1}</span> to{' '}
              <span className="font-medium">{Math.min(currentPage * perPage, pagination.total)}</span> of{' '}
              <span className="font-medium">{pagination.total}</span> results
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => {
                // Show first page, last page, current page, and pages around current
                const showPage =
                  page === 1 ||
                  page === pagination.pages ||
                  (page >= currentPage - 1 && page <= currentPage + 1);

                if (!showPage) {
                  // Show ellipsis
                  if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="px-2 text-gray-500">...</span>;
                  }
                  return null;
                }

                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      currentPage === page
                        ? 'bg-purple-600 text-white font-medium'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
              disabled={currentPage === pagination.pages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add Modal - Multi-select Flow */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold">Create Labour Requisition</h2>
                <p className="text-sm text-gray-500">Select project, date and labour requirements</p>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
              {/* Left Panel - Project & Date Selection */}
              <div className="p-4 space-y-4 lg:w-[280px] border-r border-gray-200 bg-gray-50">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Project *</label>
                  {projectsLoading ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                      Loading projects...
                    </div>
                  ) : (
                    <select
                      value={formData.project_id || ''}
                      onChange={(e) => handleProjectSelect(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="">Select project...</option>
                      {projects.map((project) => (
                        <option key={project.project_id} value={project.project_id}>
                          {project.project_code ? `${project.project_code} - ` : ''}{project.project_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site/Location</label>
                  <input
                    type="text"
                    value={formData.site_name}
                    onChange={(e) => setFormData({ ...formData, site_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-sm"
                    placeholder="Auto-filled from project"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Required Date *</label>
                  <input
                    type="date"
                    value={formData.required_date}
                    onChange={(e) => setFormData({ ...formData, required_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={formData.start_time || ''}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                      placeholder="HH:MM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input
                      type="time"
                      value={formData.end_time || ''}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                      placeholder="HH:MM"
                    />
                  </div>
                </div>

                <div>
                  {(() => {
                    const totalWorkersNeeded = selectedLabours.reduce((sum, labour) => sum + (labour.workers_count || 1), 0);
                    const remainingSlots = totalWorkersNeeded - selectedWorkers.length;

                    return (
                      <>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Preferred Workers
                          {totalWorkersNeeded > 0 && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({selectedWorkers.length}/{totalWorkersNeeded} selected)
                            </span>
                          )}
                        </label>

                        {/* Search input with chips inside */}
                        <div className="relative">
                          <div className="w-full min-h-[42px] max-h-[200px] overflow-y-auto px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-purple-500 bg-white">
                            {/* Selected workers as chips inside input */}
                            <div className="flex flex-wrap gap-2 items-center">
                              {selectedWorkers.map(worker => (
                                <div
                                  key={worker.worker_id}
                                  className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs"
                                >
                                  <span className="font-medium">{worker.full_name} ({worker.worker_code})</span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedWorkers(prev => prev.filter(w => w.worker_id !== worker.worker_id))}
                                    className="hover:text-purple-900"
                                  >
                                    <XMarkIcon className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <input
                                type="text"
                                placeholder={
                                  selectedWorkers.length === 0
                                    ? totalWorkersNeeded > 0
                                      ? `Select up to ${totalWorkersNeeded} workers...`
                                      : "Search workers by name or code..."
                                    : remainingSlots > 0
                                      ? `${remainingSlots} more...`
                                      : ""
                                }
                                value={workerSearchQuery}
                                onChange={(e) => setWorkerSearchQuery(e.target.value)}
                                className="flex-1 min-w-[200px] outline-none bg-transparent text-sm"
                                disabled={totalWorkersNeeded > 0 && selectedWorkers.length >= totalWorkersNeeded}
                              />
                            </div>
                          </div>

                          {/* Dropdown - only visible when typing */}
                          {workerSearchQuery && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {workersLoading ? (
                          <div className="text-sm text-gray-500 p-3 text-center">Loading workers...</div>
                        ) : (
                          <>
                            {(() => {
                              // Get unique skills from selected labour items (filter out undefined/null)
                              // Use labour_role (from BOQ) or skill_required (from manual entry)
                              const selectedSkills = selectedLabours
                                .map(labour => (labour as any).labour_role || labour.skill_required)
                                .filter(skill => skill != null && skill !== '');
                              const totalWorkersNeeded = selectedLabours.reduce((sum, labour) => sum + (labour.workers_count || 1), 0);

                              // Filter workers by search query AND selected skills
                              const filteredWorkers = availableWorkers.filter(worker => {
                                // Match search query (name or code)
                                const matchesSearch = (worker.full_name || '').toLowerCase().includes(workerSearchQuery.toLowerCase()) ||
                                  (worker.worker_code || '').toLowerCase().includes(workerSearchQuery.toLowerCase());

                                // ONLY show workers if labour is selected AND worker has matching skill
                                // Worker skills can be a string (comma-separated) or array
                                const matchesSkill = selectedSkills.length > 0 && selectedSkills.some(skill => {
                                  if (!worker.skills || !skill) return false;

                                  // Handle comma-separated skills (e.g., "Carpenter, Mason, Painter")
                                  const workerSkills = typeof worker.skills === 'string'
                                    ? worker.skills.split(',').map(s => s.trim().toLowerCase()).filter(s => s)
                                    : Array.isArray(worker.skills)
                                      ? worker.skills.map(s => String(s).toLowerCase()).filter(s => s)
                                      : [];

                                  // Check if any worker skill matches the required skill
                                  const skillLower = skill.toLowerCase();
                                  return workerSkills.some(ws =>
                                    ws.includes(skillLower) || skillLower.includes(ws)
                                  );
                                });

                                return matchesSearch && matchesSkill;
                              });

                              return (
                                <>
                                  {filteredWorkers.slice(0, 10).map(worker => {
                                    const isSelected = selectedWorkers.some(w => w.worker_id === worker.worker_id);
                                    const limitReached = totalWorkersNeeded > 0 && selectedWorkers.length >= totalWorkersNeeded;
                                    const canSelect = isSelected || !limitReached;

                                    return (
                                      <div
                                        key={worker.worker_id}
                                        onClick={() => {
                                          if (isSelected) {
                                            setSelectedWorkers(prev => prev.filter(w => w.worker_id !== worker.worker_id));
                                          } else if (canSelect) {
                                            setSelectedWorkers(prev => [...prev, worker]);
                                            setWorkerSearchQuery('');
                                          } else {
                                            showError(`Maximum ${totalWorkersNeeded} workers allowed`);
                                          }
                                        }}
                                        className={`p-3 cursor-pointer hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                                          isSelected ? 'bg-purple-100' : !canSelect ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{worker.full_name}</p>
                                            <p className="text-xs text-gray-500">Code: {worker.worker_code}</p>
                                          </div>
                                          {isSelected && (
                                            <CheckCircleIcon className="w-5 h-5 text-purple-600" />
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {filteredWorkers.length === 0 && (
                                    <div className="text-sm text-gray-500 p-3 text-center">
                                      No workers found matching "{workerSearchQuery}"
                                      {selectedLabours.length > 0 && (
                                        <span> with skills: {selectedSkills.join(', ')}</span>
                                      )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {selectedLabours.length > 0 && (
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <div className="flex items-center gap-2 text-purple-800">
                      <CheckCircleIcon className="w-5 h-5" />
                      <span className="font-medium">{selectedLabours.length} labour(s) selected</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Middle Panel - BOQ Labour Requirements with Checkboxes */}
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">Select Labour Requirements</h3>
                  </div>
                  {groupedLabours.length > 0 && selectedLabours.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedLabours([])}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {!selectedProject ? (
                  <div className="text-center py-12 text-gray-500">
                    <InformationCircleIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="font-medium">Select a project first</p>
                    <p className="text-sm">Labour requirements will appear here</p>
                  </div>
                ) : boqLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  </div>
                ) : groupedLabours.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CubeIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p className="font-medium">No labour defined in assigned items</p>
                    <p className="text-sm">Contact your PM if you need labour for this project</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedLabours.map((group) => (
                      <div key={group.item_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        {/* Item Header with Select All */}
                        <div
                          className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleItemExpand(group.item_id)}
                        >
                          <div className="flex items-center gap-2">
                            {expandedItems.has(group.item_id) ? (
                              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4 text-gray-500" />
                            )}
                            <span className="font-medium text-gray-900">{group.item_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Show available/total count */}
                            {getGroupAvailableCount(group) < group.labours.length ? (
                              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                                {getGroupAvailableCount(group)}/{group.labours.length} available
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                                {group.labours.length} labour{group.labours.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {/* Select All button - only show if there are available items */}
                            {getGroupAvailableCount(group) > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAllInGroup(group);
                                }}
                                className={`text-xs px-2 py-1 rounded ${
                                  isGroupFullySelected(group)
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-200 text-gray-600 hover:bg-purple-100 hover:text-purple-700'
                                }`}
                              >
                                {isGroupFullySelected(group) ? '✓ All Selected' : 'Select Available'}
                              </button>
                            )}
                            {/* Show "All Assigned" badge if no items available */}
                            {getGroupAvailableCount(group) === 0 && (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                                All Assigned
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Labour Items with Checkboxes */}
                        {expandedItems.has(group.item_id) && (
                          <div className="border-t border-gray-100 p-2 space-y-2">
                            {group.labours.map((labour, idx) => {
                              const isSelected = isLabourSelected(labour, idx);
                              const isProcessed = isLabourItemProcessed(labour);
                              const statusBadge = getLabourStatusBadge(labour);
                              return (
                                <div
                                  key={`${labour.labour_id}-${idx}`}
                                  className={`p-3 rounded-lg border-2 transition-all ${
                                    isProcessed
                                      ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                                      : isSelected
                                        ? 'border-purple-500 bg-purple-50 cursor-pointer'
                                        : 'border-gray-200 bg-white hover:border-purple-300 cursor-pointer'
                                  }`}
                                  onClick={() => !isProcessed && toggleLabourSelection(labour, idx)}
                                >
                                  <div className="flex items-start gap-3">
                                    {/* Checkbox - disabled if processed */}
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                                      isProcessed
                                        ? 'bg-gray-200 border-gray-300'
                                        : isSelected
                                          ? 'bg-purple-600 border-purple-600'
                                          : 'border-gray-300'
                                    }`}>
                                      {isProcessed ? (
                                        <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      ) : isSelected && (
                                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                    {/* Labour Info */}
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`font-medium ${isProcessed ? 'text-gray-500' : 'text-gray-900'}`}>
                                          {labour.labour_role || 'N/A'}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          {statusBadge}
                                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                            {labour.labour_type || 'Daily'}
                                          </span>
                                        </div>
                                      </div>
                                      {labour.sub_item_name && (
                                        <p className={`text-sm mt-1 ${isProcessed ? 'text-gray-400' : 'text-gray-500'}`}>
                                          {labour.sub_item_name}
                                        </p>
                                      )}
                                      <p className="text-xs text-gray-400 mt-1">
                                        Hours: {labour.hours || 8}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Panel - Selected Items Summary */}
              {selectedLabours.length > 0 && (
                <div className="p-4 lg:w-[320px] border-l border-gray-200 bg-gray-50 overflow-y-auto">
                  <h3 className="font-semibold text-gray-900 mb-3">Selected Labour ({selectedLabours.length})</h3>
                  <div className="space-y-2 mb-4">
                    {selectedLabours.map((labour) => (
                      <div key={labour.uniqueKey} className="bg-white p-3 rounded-lg border border-gray-200">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{labour.labour_role}</p>
                            <p className="text-xs text-gray-500 truncate">{labour.item_name}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromSelection(labour.uniqueKey)}
                            className="p-1 hover:bg-red-100 rounded text-red-500"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <label className="text-xs text-gray-600">Workers:</label>
                          <input
                            type="number"
                            min="1"
                            value={labour.workers_count || ''}
                            placeholder="1"
                            onChange={(e) => updateWorkersCount(labour.uniqueKey, parseInt(e.target.value) || 1)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer with Submit */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {selectedLabours.length > 0 ? (
                    <span>
                      <span className="font-medium">{selectedLabours.length}</span> requisition(s) will be created
                      for <span className="font-medium">{selectedLabours.reduce((sum, l) => sum + l.workers_count, 0)}</span> workers
                    </span>
                  ) : (
                    <span>Select labour items from the list above</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkSubmit}
                    disabled={selectedLabours.length === 0 || !formData.project_id || submitting}
                    className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 ${
                      selectedLabours.length === 0 || !formData.project_id || submitting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <PlusIcon className="w-5 h-5" />
                        Create {selectedLabours.length > 0 ? `${selectedLabours.length} Requisition(s)` : 'Requisition'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* View Details Modal */}
      {showDetailsModal && selectedRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <ClipboardDocumentListIcon className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Labour Requisitions
                    {relatedRequisitions.length > 1 && (
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ({relatedRequisitions.length} requisitions)
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {relatedRequisitions.length > 1 ? 'Batch created together' : 'Requisition Details'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedRequisition(null);
                  setRelatedRequisitions([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Show common project info if multiple requisitions */}
              {relatedRequisitions.length > 1 && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Project</h3>
                      <p className="text-gray-900">{selectedRequisition.project_name || `Project #${selectedRequisition.project_id}`}</p>
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Requested By</h3>
                      <p className="text-gray-900">{selectedRequisition.requested_by_name || '-'}</p>
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Request Date</h3>
                      <p className="text-gray-900">
                        {selectedRequisition.request_date ? new Date(selectedRequisition.request_date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : '-'}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Site/Location</h3>
                      <p className="text-gray-900">{selectedRequisition.site_name || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Loop through all related requisitions */}
              <div className="space-y-6">
                {relatedRequisitions.map((requisition, index) => (
                  <div key={requisition.requisition_id} className={`${index > 0 ? 'pt-6 border-t border-gray-200' : ''}`}>
                    {/* Requisition Header */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-gray-900">{requisition.requisition_code}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded ${
                          requisition.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          requisition.status === 'approved' ? 'bg-green-100 text-green-700' :
                          requisition.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {requisition.status === 'pending' && 'Pending Approval'}
                          {requisition.status === 'approved' && 'Approved'}
                          {requisition.status === 'rejected' && 'Rejected'}
                        </span>
                        {requisition.status === 'approved' && requisition.assignment_status && (
                          <span className="px-2.5 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700">
                            {requisition.assignment_status === 'assigned' ? 'Workers Assigned' : 'Pending Assignment'}
                          </span>
                        )}
                      </div>
                    </div>

                    {requisition.status === 'rejected' && requisition.rejection_reason && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">
                          <span className="font-medium">Rejection Reason:</span> {requisition.rejection_reason}
                        </p>
                      </div>
                    )}

                    {/* Requisition Details */}
                    <div className="space-y-4">
                      {/* Labour Items */}
                      <div>
                        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Labour Items</h4>
                        <div className="space-y-3">
                          {requisition.labour_items && requisition.labour_items.length > 0 ? (
                            (() => {
                              // Distribute workers among labour items based on worker count
                              let workerIndex = 0;
                              const allWorkers = requisition.assigned_workers || [];

                              return requisition.labour_items.map((item: any, idx: number) => {
                                // Get the exact number of workers for this labour item
                                const workersForThisItem = allWorkers.slice(workerIndex, workerIndex + item.workers_count);
                                workerIndex += item.workers_count;

                                return (
                                  <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="flex items-start justify-between mb-2">
                                      <p className="text-sm font-medium text-gray-900">{item.work_description}</p>
                                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                        {item.workers_count} worker{item.workers_count !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mb-2">
                                      <span className="font-medium">Skill:</span> {item.skill_required}
                                    </p>

                                    {/* Show assigned workers for this labour item */}
                                    {requisition.assignment_status === 'assigned' && workersForThisItem.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-gray-200">
                                        <p className="text-xs font-medium text-gray-500 uppercase mb-1.5">Assigned Workers ({workersForThisItem.length})</p>
                                        <div className="space-y-1.5">
                                          {workersForThisItem.map((worker: any) => (
                                            <div key={worker.worker_id} className="bg-green-50 rounded p-2 border border-green-200 flex items-center justify-between">
                                              <span className="text-xs font-medium text-gray-900">{worker.full_name}</span>
                                              <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700 font-medium">
                                                {worker.worker_code}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()
                          ) : (
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <p className="text-sm text-gray-900">{requisition.work_description}</p>
                              <p className="text-xs text-gray-600 mt-1">
                                <span className="font-medium">Skill:</span> {requisition.skill_required}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Summary Info */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3 pt-3 border-t border-gray-100">
                        {relatedRequisitions.length === 1 && (
                          <>
                            <div>
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Project</h4>
                              <p className="text-gray-900">{requisition.project_name || `Project #${requisition.project_id}`}</p>
                            </div>
                            <div>
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Site/Location</h4>
                              <p className="text-gray-900">{requisition.site_name || '-'}</p>
                            </div>
                          </>
                        )}
                        <div>
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total Workers</h4>
                          <p className="text-gray-900 font-medium">{requisition.total_workers_count || requisition.workers_count} worker(s)</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Required Date</h4>
                          <p className="text-gray-900">
                            {new Date(requisition.required_date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Work Shift</h4>
                          <p className="text-gray-900">
                            {requisition.start_time && requisition.end_time ? (
                              <span className="text-purple-600 font-medium">
                                {formatTimeTo12Hour(requisition.start_time)} - {formatTimeTo12Hour(requisition.end_time)}
                              </span>
                            ) : requisition.start_time ? (
                              <span className="text-purple-600 font-medium">
                                From {formatTimeTo12Hour(requisition.start_time)}
                              </span>
                            ) : requisition.end_time ? (
                              <span className="text-purple-600 font-medium">
                                Until {formatTimeTo12Hour(requisition.end_time)}
                              </span>
                            ) : (
                              <span className="text-gray-500">Not specified</span>
                            )}
                          </p>
                        </div>
                        {(requisition.preferred_workers && requisition.preferred_workers.length > 0) && (
                          <div className="col-span-2">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Preferred Workers</h4>
                            <div className="flex flex-wrap gap-2">
                              {requisition.preferred_workers.map((worker: any) => (
                                <div key={worker.worker_id} className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium border border-purple-200">
                                  {worker.full_name} ({worker.worker_code})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {requisition.preferred_workers_notes && (
                          <div className="col-span-2">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Preferred Workers (Additional Notes)</h4>
                            <p className="text-gray-900 text-sm whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-200">
                              {requisition.preferred_workers_notes}
                            </p>
                          </div>
                        )}
                        {relatedRequisitions.length === 1 && (
                          <>
                            <div>
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Request Date</h4>
                              <p className="text-gray-900">
                                {requisition.request_date ? new Date(requisition.request_date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                }) : '-'}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Requested By</h4>
                              <p className="text-gray-900">{requisition.requested_by_name || '-'}</p>
                            </div>
                          </>
                        )}
                        {(requisition.status === 'approved' || requisition.status === 'rejected') && requisition.approved_by_name && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                              {requisition.status === 'approved' ? 'Approved By' : 'Rejected By'}
                            </h4>
                            <p className="text-gray-900">{requisition.approved_by_name}</p>
                            {requisition.approval_date && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(requisition.approval_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedRequisition(null);
                  setRelatedRequisitions([]);
                }}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit & Resend Modal for Rejected Requisitions */}
      {showEditModal && editingRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-orange-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <PencilSquareIcon className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Edit & Resend Requisition</h2>
                  <p className="text-sm text-gray-500">{editingRequisition.requisition_code}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingRequisition(null);
                }}
                className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Rejection Reason Banner */}
            {editingRequisition.rejection_reason && (
              <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Rejection Reason:</p>
                    <p className="text-sm text-red-700 mt-1">{editingRequisition.rejection_reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Form */}
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-250px)]">
              <div className="space-y-4">
                {/* Site Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site/Location</label>
                  <input
                    type="text"
                    value={editFormData.site_name}
                    onChange={(e) => setEditFormData({ ...editFormData, site_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Enter site location"
                  />
                </div>

                {/* Required Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Required Date</label>
                  <input
                    type="date"
                    value={editFormData.required_date}
                    onChange={(e) => setEditFormData({ ...editFormData, required_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Work Shift Times */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={editFormData.start_time}
                      onChange={(e) => setEditFormData({ ...editFormData, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      placeholder="HH:MM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input
                      type="time"
                      value={editFormData.end_time}
                      onChange={(e) => setEditFormData({ ...editFormData, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      placeholder="HH:MM"
                    />
                  </div>
                </div>

                {/* Preferred Workers Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Workers (Details/Notes)</label>
                  <textarea
                    value={editFormData.preferred_workers_notes}
                    onChange={(e) => setEditFormData({ ...editFormData, preferred_workers_notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    rows={3}
                    placeholder="Enter preferred worker names with Emp. numbers or other notes"
                  />
                </div>

                {/* Labour Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Labour Items ({editLabourItems.length})</label>
                  </div>
                  <div className="space-y-3">
                    {editLabourItems.map((item, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="text-sm font-medium text-gray-900">Labour Item {index + 1}</h4>
                          {editLabourItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLabourItem(index)}
                              className="p-1 hover:bg-red-100 rounded text-red-500"
                              title="Remove this labour item"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Work Description */}
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Work Description</label>
                          <textarea
                            value={item.work_description || ''}
                            onChange={(e) => updateLabourItemField(index, 'work_description', e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                            placeholder="Describe the work"
                            autoComplete="off"
                          />
                        </div>

                        {/* Skill Required */}
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Skill Required</label>
                          <input
                            type="text"
                            value={item.skill_required || ''}
                            onChange={(e) => updateLabourItemField(index, 'skill_required', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                            placeholder="e.g., Mason, Carpenter"
                            autoComplete="off"
                          />
                        </div>

                        {/* Workers Count */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Workers Count</label>
                          <input
                            type="number"
                            min="1"
                            value={item.workers_count || 1}
                            onChange={(e) => updateLabourItemField(index, 'workers_count', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingRequisition(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResubmit}
                  disabled={resubmitting}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 ${
                    resubmitting
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  } transition-colors`}
                >
                  {resubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Updating...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-5 h-5" />
                      Update
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-purple-600 to-purple-700">
              <h3 className="text-lg font-semibold text-white">{confirmTitle}</h3>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 text-base leading-relaxed">{confirmMessage}</p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setConfirmAction(null);
                }}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-md hover:shadow-lg"
              >
                OK
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default LabourRequisition;
