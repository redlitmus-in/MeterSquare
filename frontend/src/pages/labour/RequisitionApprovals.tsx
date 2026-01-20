/**
 * Requisition Approvals Page
 * Project Manager: Approve or reject labour requisitions (Step 3)
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { labourService, LabourRequisition, CreateRequisitionData } from '@/services/labourService';
import { showSuccess, showError } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
  EyeIcon,
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  UsersIcon,
  PlusIcon,
  CubeIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

// Tab configuration
// Status Flow for Labour Requisitions:
// 1. SE creates requisition -> status: 'pending' (draft on SE side)
// 2. SE sends to PM -> status: 'send_to_pm' (shows in PM's "SE Pending" tab)
// 3. PM approves/rejects -> status: 'approved' or 'rejected'
// 4. PM creates requisition -> status: 'pending' (draft in PM's "My Pending" tab)
// 5. PM manually sends to Production Manager (no auto-approval)
type TabType = 'my_pending' | 'pending' | 'approved' | 'rejected';

interface TabConfig {
  key: TabType;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { key: 'my_pending', label: 'My Pending', color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-500', icon: UserIcon },
  { key: 'pending', label: 'SE Pending', color: 'text-yellow-700', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500', icon: ClockIcon },
  { key: 'approved', label: 'Approved', color: 'text-green-700', bgColor: 'bg-green-100', borderColor: 'border-green-500', icon: CheckCircleIcon },
  { key: 'rejected', label: 'Rejected', color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-500', icon: XCircleIcon },
];

// Helper function to convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time24: string): string => {
  if (!time24) return '';

  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  return `${hour12}:${minutes} ${period}`;
};

const RequisitionApprovals: React.FC = () => {
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<LabourRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('my_pending');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<LabourRequisition | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const perPage = 15;
  const [showAddModal, setShowAddModal] = useState(false);

  // Tab counts state
  const [tabCounts, setTabCounts] = useState<Record<TabType, number>>({
    my_pending: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });

  // Add Modal - Labour Requisition Form State (copied from LabourRequisition.tsx)
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

  interface Area {
    area_id: number;
    area_name: string;
    boqs: BOQ[];
  }

  interface BOQ {
    boq_id: number;
    boq_name: string;
    items: BOQItem[];
  }

  interface BOQItem {
    item_id: string;
    item_name: string;
    overhead_allocated: number;
    overhead_available: number;
    overhead_consumed: number;
    sub_items: SubItem[];
  }

  interface SubItem {
    sub_item_id: string;
    sub_item_name: string;
    materials: Material[];
    labour?: LabourItem[];
  }

  interface Material {
    material_id: string;
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
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
    boq_id?: number;
    item_id?: string;
  }

  interface GroupedLabour {
    item_id: string;
    item_name: string;
    boq_id?: number;
    labours: LabourItem[];
  }

  interface SelectedLabour extends LabourItem {
    workers_count?: number;
    uniqueKey: string;
  }

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [groupedLabours, setGroupedLabours] = useState<GroupedLabour[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedLabours, setSelectedLabours] = useState<SelectedLabour[]>([]);
  const [submitting, setSubmitting] = useState(false);
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

  // Worker selection state
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<any[]>([]);
  const [workerSearchQuery, setWorkerSearchQuery] = useState('');

  // Fetch counts for all tabs
  const fetchTabCounts = async () => {
    try {
      const results = await Promise.all([
        labourService.getMyRequisitions('pending'), // PM's own pending drafts
        labourService.getPendingRequisitions('pending'), // SE pending
        labourService.getPendingRequisitions('approved'),
        labourService.getPendingRequisitions('rejected')
      ]);

      setTabCounts({
        my_pending: results[0].success ? results[0].data.length : 0,
        pending: results[1].success ? results[1].data.length : 0,
        approved: results[2].success ? results[2].data.length : 0,
        rejected: results[3].success ? results[3].data.length : 0
      });
    } catch (error) {
      console.error('Failed to fetch tab counts:', error);
    }
  };

  const fetchRequisitions = async () => {
    setLoading(true);
    try {
      let result;
      if (activeTab === 'my_pending') {
        // Fetch PM's own pending requisitions (drafts that need to be sent to Production Manager)
        result = await labourService.getMyRequisitions('pending', currentPage, perPage);
      } else {
        // Fetch SE requisitions for approval
        result = await labourService.getPendingRequisitions(activeTab, undefined, currentPage, perPage);
      }

      if (result.success) {
        setRequisitions(result.data);
        setPagination(result.pagination);
      } else {
        showError(result.message || 'Failed to fetch requisitions');
      }
    } catch {
      showError('Failed to fetch requisitions');
    } finally {
      setLoading(false);
    }
  };

  // Fetch tab counts only on initial mount
  useEffect(() => {
    fetchTabCounts();
  }, []);

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when changing tabs
  }, [activeTab]);

  useEffect(() => {
    fetchRequisitions();
  }, [activeTab, currentPage]);

  const handleSendToProduction = async (requisitionId: number) => {
    setProcessing(requisitionId);
    const result = await labourService.sendToProduction(requisitionId);
    if (result.success) {
      showSuccess('Requisition sent to Production Manager successfully');
      fetchRequisitions();
      fetchTabCounts(); // Refresh counts
    } else {
      showError(result.message || 'Failed to send requisition to production');
    }
    setProcessing(null);
  };

  const handleApprove = async (requisitionId: number) => {
    setProcessing(requisitionId);
    const result = await labourService.approveRequisition(requisitionId);
    if (result.success) {
      showSuccess('Requisition approved successfully');
      fetchRequisitions();
      fetchTabCounts(); // Refresh counts
    } else {
      showError(result.message || 'Failed to approve requisition');
    }
    setProcessing(null);
  };

  const handleReject = async () => {
    if (!rejectingId || !rejectionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }

    setProcessing(rejectingId);
    const result = await labourService.rejectRequisition(rejectingId, rejectionReason);
    if (result.success) {
      showSuccess('Requisition rejected');
      setShowRejectModal(false);
      setRejectingId(null);
      setRejectionReason('');
      fetchRequisitions();
      fetchTabCounts(); // Refresh counts
    } else {
      showError(result.message || 'Failed to reject requisition');
    }
    setProcessing(null);
  };

  const openRejectModal = (requisitionId: number) => {
    setRejectingId(requisitionId);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleViewDetails = (req: LabourRequisition) => {
    setSelectedRequisition(req);
    setShowDetailsModal(true);
  };

  // Labour Requisition Form Helper Functions
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

  const extractBOQData = (project: Project) => {
    const labourByItem: Map<string, GroupedLabour> = new Map();

    (project.areas || []).forEach((area) => {
      (area.boqs || []).forEach((boq) => {
        (boq.items || []).forEach((item) => {
          (item.sub_items || []).forEach((subItem) => {
            if (subItem.labour && subItem.labour.length > 0) {
              subItem.labour.forEach((lab) => {
                const labourItem: LabourItem = {
                  ...lab,
                  sub_item_name: subItem.sub_item_name,
                  item_name: item.item_name
                };

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

    const grouped = Array.from(labourByItem.values());
    if (grouped.length > 0) {
      setExpandedItems(new Set([grouped[0].item_id]));
    } else {
      setExpandedItems(new Set());
    }
    setGroupedLabours(grouped);
  };

  const getLabourKey = (labour: LabourItem, idx: number): string => {
    return `${labour.item_name}-${labour.sub_item_name}-${labour.labour_role}-${idx}`;
  };

  const isLabourSelected = (labour: LabourItem, idx: number): boolean => {
    const key = getLabourKey(labour, idx);
    return selectedLabours.some(s => s.uniqueKey === key);
  };

  const toggleLabourSelection = (labour: LabourItem, idx: number) => {
    const key = getLabourKey(labour, idx);
    const isSelected = selectedLabours.some(s => s.uniqueKey === key);

    if (isSelected) {
      setSelectedLabours(prev => prev.filter(s => s.uniqueKey !== key));
    } else {
      setSelectedLabours(prev => [...prev, {
        ...labour,
        workers_count: undefined,
        uniqueKey: key
      }]);
    }
  };

  const updateWorkersCount = (uniqueKey: string, count: number) => {
    setSelectedLabours(prev => prev.map(s =>
      s.uniqueKey === uniqueKey ? { ...s, workers_count: Math.max(1, count) } : s
    ));
  };

  const removeFromSelection = (uniqueKey: string) => {
    setSelectedLabours(prev => prev.filter(s => s.uniqueKey !== uniqueKey));
  };

  const selectAllInGroup = (group: GroupedLabour) => {
    const newSelections: SelectedLabour[] = [];
    group.labours.forEach((labour, idx) => {
      const key = getLabourKey(labour, idx);
      if (!selectedLabours.some(s => s.uniqueKey === key)) {
        newSelections.push({
          ...labour,
          workers_count: undefined,
          uniqueKey: key
        });
      }
    });
    setSelectedLabours(prev => [...prev, ...newSelections]);
  };

  const isGroupFullySelected = (group: GroupedLabour): boolean => {
    return group.labours.every((labour, idx) => isLabourSelected(labour, idx));
  };

  const handleProjectSelect = async (projectId: number) => {
    const project = projects.find(p => p.project_id === projectId);
    setSelectedProject(project || null);

    if (project) {
      const locationParts: string[] = [];
      if (project.location && project.location.trim()) {
        locationParts.push(project.location.trim());
      }
      if (project.floor_name && project.floor_name.trim()) {
        locationParts.push(project.floor_name.trim());
      }
      if (project.area && project.area.trim()) {
        locationParts.push(project.area.trim());
      }

      let siteName = '';
      if (locationParts.length > 0) {
        siteName = locationParts.join(', ');
      } else {
        siteName = project.project_name || '';
      }

      setFormData(prev => ({
        ...prev,
        project_id: projectId,
        site_name: siteName
      }));

      extractBOQData(project);
    } else {
      setFormData(prev => ({
        ...prev,
        project_id: 0,
        site_name: ''
      }));
      setGroupedLabours([]);
      setExpandedItems(new Set());
      setSelectedLabours([]);
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
    setSelectedWorkers([]);
    setWorkerSearchQuery('');
    setAvailableWorkers([]);
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
    if (selectedLabours.length > 0) {
      fetchWorkers();
    } else {
      setAvailableWorkers([]);
    }
  }, [selectedLabours]);

  const toggleWorkerSelection = (worker: any) => {
    setSelectedWorkers(prev => {
      const isSelected = prev.some(w => w.worker_id === worker.worker_id);
      if (isSelected) {
        return prev.filter(w => w.worker_id !== worker.worker_id);
      } else {
        return [...prev, worker];
      }
    });
  };

  const removeWorker = (workerId: number) => {
    setSelectedWorkers(prev => prev.filter(w => w.worker_id !== workerId));
  };

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
        // Note: requester_role is determined by backend from user session for security
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

  // Fetch projects and workers when modal opens
  useEffect(() => {
    if (showAddModal) {
      fetchProjects();
      fetchWorkers();
    }
  }, [showAddModal]);

  const getStatusBadge = (status: string, assignmentStatus?: string, showAsPMDraft: boolean = false) => {
    // Show assignment status badge when approved and workers are assigned
    if (status === 'approved' && assignmentStatus === 'assigned') {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
          <UsersIcon className="w-3 h-3" /> Workers Assigned
        </span>
      );
    }

    switch (status) {
      case 'pending':
        // Different label depending on context (PM's own vs SE's)
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700 flex items-center gap-1">
            <ClockIcon className="w-3 h-3" /> {showAsPMDraft ? 'PM Draft' : 'Draft'}
          </span>
        );
      case 'send_to_pm':
        // PM side: Requisition sent to PM for approval
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
            <ClockIcon className="w-3 h-3" /> Pending PM Approval
          </span>
        );
      case 'approved':
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" /> Approved by PM
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 flex items-center gap-1">
            <XCircleIcon className="w-3 h-3" /> Rejected by PM
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Labour Requisition Approvals</h1>
          <p className="text-gray-600">Create, review and approve labour requisitions. Send to Production Manager for worker assignment.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="font-medium">New Requisition</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                isActive
                  ? `${tab.bgColor} ${tab.color} border-b-2 ${tab.borderColor}`
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                  isActive ? 'bg-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Requisitions List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : requisitions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {activeTab === 'my_pending' && 'No pending requisitions'}
            {activeTab === 'pending' && 'No SE pending requisitions'}
            {activeTab === 'approved' && 'No approved requisitions'}
            {activeTab === 'rejected' && 'No rejected requisitions'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'my_pending' && 'You have not created any requisitions yet. Click "New Requisition" to create one.'}
            {activeTab === 'pending' && 'No requisitions from Site Engineers are waiting for your approval.'}
            {activeTab === 'approved' && 'No requisitions have been approved yet.'}
            {activeTab === 'rejected' && 'No requisitions have been rejected yet.'}
          </p>
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
                  {getStatusBadge(req.status, req.assignment_status, activeTab === 'my_pending')}
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
                    className="flex items-center justify-center gap-1 px-2 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    <EyeIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">View</span>
                  </button>
                  {activeTab === 'my_pending' && req.status === 'pending' && (
                    <button
                      onClick={() => handleSendToProduction(req.requisition_id)}
                      disabled={processing === req.requisition_id}
                      className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors disabled:opacity-50"
                    >
                      {processing === req.requisition_id ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      ) : (
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Send to Production</span>
                    </button>
                  )}
                  {activeTab === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(req.requisition_id)}
                        disabled={processing === req.requisition_id}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {processing === req.requisition_id ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        ) : (
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">Approve</span>
                      </button>
                      <button
                        onClick={() => openRejectModal(req.requisition_id)}
                        disabled={processing === req.requisition_id}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <XCircleIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Reject</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
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
                        ? 'bg-teal-600 text-white font-medium'
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

      {/* View Details Modal */}
      {showDetailsModal && selectedRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedRequisition.requisition_code}</h2>
                <p className="text-sm text-gray-500">Requisition Details</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Status Row */}
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                <span className="text-sm text-gray-500">Status:</span>
                <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                  {selectedRequisition.status === 'pending' && (activeTab === 'my_pending' ? 'PM Draft' : 'Draft')}
                  {selectedRequisition.status === 'send_to_pm' && 'Pending PM Approval'}
                  {selectedRequisition.status === 'approved' && 'Approved by PM'}
                  {selectedRequisition.status === 'rejected' && 'Rejected by PM'}
                  {!['pending', 'send_to_pm', 'approved', 'rejected'].includes(selectedRequisition.status) && selectedRequisition.status}
                </span>
                {selectedRequisition.assignment_status === 'assigned' && (
                  <span className="px-2.5 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700">
                    Workers Assigned
                  </span>
                )}
              </div>

              {selectedRequisition.rejection_reason && (
                <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Rejection Reason:</span> {selectedRequisition.rejection_reason}
                  </p>
                </div>
              )}

              {/* Details Grid */}
              <div className="space-y-6">
                {/* Work Description Section */}
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Work Description</h3>
                  <p className="text-sm text-gray-900">{selectedRequisition.work_description}</p>
                </div>

                {/* Labour Items Section - Only show if multiple items exist */}
                {selectedRequisition.labour_items && selectedRequisition.labour_items.length > 0 && (
                  <div className="border-b border-gray-100 pb-6">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Labour Items</h3>
                    <div className="space-y-3">
                      {selectedRequisition.labour_items.map((item: any, idx: number) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm font-medium text-gray-900">{item.work_description}</p>
                            <span className="ml-3 px-3 py-1 bg-blue-50 text-blue-600 text-sm font-semibold rounded-md whitespace-nowrap">
                              {item.workers_count} workers
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="font-medium">Skill:</span> {item.skill_required}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Project</h3>
                    <p className="text-gray-900">{selectedRequisition.project_name || `#${selectedRequisition.project_id}`}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Site</h3>
                    <p className="text-gray-900">{selectedRequisition.site_name}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total Workers</h3>
                    <p className="text-gray-900 font-medium">{selectedRequisition.total_workers_count || selectedRequisition.workers_count} worker(s)</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Required Date</h3>
                    <p className="text-gray-900">
                      {new Date(selectedRequisition.required_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Work Shift</h3>
                    <p className="text-gray-900">
                      {selectedRequisition.start_time && selectedRequisition.end_time ? (
                        <span className="text-teal-600 font-medium">
                          {formatTimeTo12Hour(selectedRequisition.start_time)} - {formatTimeTo12Hour(selectedRequisition.end_time)}
                        </span>
                      ) : selectedRequisition.start_time ? (
                        <span className="text-teal-600 font-medium">
                          From {formatTimeTo12Hour(selectedRequisition.start_time)}
                        </span>
                      ) : selectedRequisition.end_time ? (
                        <span className="text-teal-600 font-medium">
                          Until {formatTimeTo12Hour(selectedRequisition.end_time)}
                        </span>
                      ) : (
                        <span className="text-gray-500">Not specified</span>
                      )}
                    </p>
                  </div>
                  {(selectedRequisition.preferred_workers && selectedRequisition.preferred_workers.length > 0) && (
                    <div className="col-span-2">
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Preferred Workers</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedRequisition.preferred_workers.map((worker: any) => (
                          <div key={worker.worker_id} className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium border border-purple-200">
                            {worker.full_name} ({worker.worker_code})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedRequisition.preferred_workers_notes && (
                    <div className="col-span-2">
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Preferred Workers (Additional Notes)</h3>
                      <p className="text-gray-900 text-sm whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-200">
                        {selectedRequisition.preferred_workers_notes}
                      </p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Request Date</h3>
                    <p className="text-gray-900">{new Date(selectedRequisition.request_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Requested By</h3>
                    <p className="text-gray-900">{selectedRequisition.requested_by_name}</p>
                  </div>
                  {selectedRequisition.status !== 'pending' && selectedRequisition.approved_by_name && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        {selectedRequisition.status === 'approved' ? 'Approved By' : 'Rejected By'}
                      </h3>
                      <p className="text-gray-900">{selectedRequisition.approved_by_name}</p>
                      {selectedRequisition.approval_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(selectedRequisition.approval_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedRequisition.assignment_status === 'assigned' && selectedRequisition.assignment_date && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Assignment Date</h3>
                      <p className="text-gray-900">{new Date(selectedRequisition.assignment_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 p-4 border-t border-gray-200 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Close
              </button>
              {/* Show "Send to Production" for PM's own pending requisitions */}
              {activeTab === 'my_pending' && selectedRequisition.status === 'pending' && (
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    handleSendToProduction(selectedRequisition.requisition_id);
                  }}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Send to Production
                </button>
              )}
              {/* Show "Approve/Reject" for SE requisitions sent to PM */}
              {selectedRequisition.status === 'send_to_pm' && (
                <>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      handleApprove(selectedRequisition.requisition_id);
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      openRejectModal(selectedRequisition.requisition_id);
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Add New Requisition Modal - PM Labour Requisition Form */}
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
                <p className="text-sm text-gray-500">Select project, date and labour requirements. Send to Production Manager for assignment.</p>
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white text-sm"
                    placeholder="Auto-filled from project"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Required Date *</label>
                  <input
                    type="date"
                    value={formData.required_date}
                    onChange={(e) => setFormData({ ...formData, required_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={formData.start_time || ''}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white"
                      placeholder="HH:MM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input
                      type="time"
                      value={formData.end_time || ''}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white"
                      placeholder="HH:MM"
                    />
                  </div>
                </div>

                {/* Preferred Workers Selection */}
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
                          <div className="w-full min-h-[42px] max-h-[200px] overflow-y-auto px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-teal-500 bg-white">
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
                                    onClick={() => removeWorker(worker.worker_id)}
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
                                            toggleWorkerSelection(worker);
                                            setWorkerSearchQuery('');
                                          } else if (canSelect) {
                                            toggleWorkerSelection(worker);
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
                  <div className="p-3 bg-teal-100 rounded-lg">
                    <div className="flex items-center gap-2 text-teal-800">
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
                    <UsersIcon className="w-5 h-5 text-teal-600" />
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
                            <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">
                              {group.labours.length} labour{group.labours.length > 1 ? 's' : ''}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectAllInGroup(group);
                              }}
                              className={`text-xs px-2 py-1 rounded ${
                                isGroupFullySelected(group)
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-200 text-gray-600 hover:bg-teal-100 hover:text-teal-700'
                              }`}
                            >
                              {isGroupFullySelected(group) ? '✓ All Selected' : 'Select All'}
                            </button>
                          </div>
                        </div>

                        {/* Labour Items with Checkboxes */}
                        {expandedItems.has(group.item_id) && (
                          <div className="border-t border-gray-100 p-2 space-y-2">
                            {group.labours.map((labour, idx) => {
                              const isSelected = isLabourSelected(labour, idx);
                              return (
                                <div
                                  key={`${labour.labour_id}-${idx}`}
                                  className={`p-3 rounded-lg border-2 transition-all ${
                                    isSelected
                                      ? 'border-teal-500 bg-teal-50 cursor-pointer'
                                      : 'border-gray-200 bg-white hover:border-teal-300 cursor-pointer'
                                  }`}
                                  onClick={() => toggleLabourSelection(labour, idx)}
                                >
                                  <div className="flex items-start gap-3">
                                    {/* Checkbox */}
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                                      isSelected
                                        ? 'bg-teal-600 border-teal-600'
                                        : 'border-gray-300'
                                    }`}>
                                      {isSelected && (
                                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                    {/* Labour Info */}
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium text-gray-900">
                                          {labour.labour_role || 'N/A'}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                          {labour.labour_type || 'Daily'}
                                        </span>
                                      </div>
                                      {labour.sub_item_name && (
                                        <p className="text-sm mt-1 text-gray-500">
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
                            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500"
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
                        : 'bg-teal-600 text-white hover:bg-teal-700'
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

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-md w-full"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-red-600">Reject Requisition</h2>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                placeholder="Please provide a reason for rejection..."
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectionReason.trim() || processing !== null}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Reject Requisition
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default RequisitionApprovals;
