import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  EyeIcon,
  UserPlusIcon,
  CheckCircleIcon,
  UserIcon,
  CalendarIcon,
  XMarkIcon,
  ClockIcon,
  CheckIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  PencilIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/solid';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { projectManagerService } from '../services/projectManagerService';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import BOQDetailsModal from '@/roles/estimator/components/BOQDetailsModal';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import PendingRequestsSection from '@/components/boq/PendingRequestsSection';
import ApprovedExtraMaterialsSection from '@/components/boq/ApprovedExtraMaterialsSection';
import RejectedRequestsSection from '@/components/boq/RejectedRequestsSection';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import DayExtensionRequestModal from '../components/DayExtensionRequestModal';

interface BOQDetails {
  boq_detail_id?: number;
  total_cost: number;
  total_items: number;
  total_materials: number;
  total_labour: number;
  file_name?: string;
  boq_details?: any;
  overhead_percentage?: number;
  profit_margin_percentage?: number;
}

interface BOQItem {
  id: number;
  description: string;
  briefDescription?: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  materials: {
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  labour: {
    type: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  laborCost: number;
  estimatedSellingPrice: number;
  purchaseType?: 'existing' | 'new';
}

interface Project {
  project_id: number;
  project_name: string;
  client?: string;
  location?: string;
  area?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  description?: string;
  site_supervisor_id?: number;
  site_supervisor_name?: string;
  boq_id?: number;
  boq_name?: string;
  boq_status?: string;
  boq_details?: BOQDetails;
  created_at?: string;
  priority?: 'high' | 'medium' | 'low';
  boqItems?: BOQItem[];
  existingPurchaseItems?: BOQItem[];
  newPurchaseItems?: BOQItem[];
  boq_ids?: number[];
  completion_requested?: boolean;
}

interface SiteEngineer {
  user_id: number;
  sitesupervisor_name: string;
  email: string;
  phone: string;
  project_id?: number | null;
  project_name?: string | null;
  projects?: Array<{
    project_id: number;
    project_name: string;
    status?: string;
  }>;
  project_count: number;
  total_projects?: number;
  completed_projects_count?: number;
  user_status?: string;
}

interface Buyer {
  user_id: number;
  buyer_name: string;
  full_name: string;
  email: string;
  phone: string;
  project_id?: number | null;
  project_name?: string | null;
}

const MyProjects: React.FC = () => {
  const { user } = useAuthStore();

  // Modal states - declared first to use in auto-refresh condition
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showEditBOQModal, setShowEditBOQModal] = useState(false);
  const [showBOQModal, setShowBOQModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCreateBOQModal, setShowCreateBOQModal] = useState(false);

  // Pause auto-refresh when any modal is open to prevent flickering during editing
  const isAnyModalOpen = showEditBOQModal || showBOQModal || showAssignModal || showCreateBOQModal;

  // Real-time auto-sync for projects - disabled when editing
  const { data: projectsData, isLoading: loading, refetch } = useProjectsAutoSync(
    async () => {
      const boqsResponse = await projectManagerService.getMyBOQs();
      const boqsList = boqsResponse.boqs || [];

      // Map projects with data from backend response
      const enrichedProjects = boqsList.map((boq: any) => {
        const siteSupervisorId = boq.project_details?.site_supervisor_id;
        const hasSiteSupervisor = siteSupervisorId !== null &&
                                  siteSupervisorId !== undefined &&
                                  siteSupervisorId !== 0;

        return {
          project_id: boq.project_details?.project_id || boq.project_id,
          project_name: boq.project_details?.project_name || boq.project_name,
          client: boq.project_details?.client,
          location: boq.project_details?.location,
          area: boq.project_details?.working_hours,
          start_date: boq.project_details?.start_date,
          end_date: boq.project_details?.end_date,
          status: boq.project_details?.project_status || 'active',
          description: boq.project_details?.description,
          site_supervisor_id: siteSupervisorId,
          site_supervisor_name: boq.project_details?.site_supervisor_name || null,
          completion_requested: boq.project_details?.completion_requested === true,
          user_id: boq.project_details?.user_id || null,
          boq_id: boq.boq_id,
          boq_name: boq.boq_name,
          boq_status: boq.boq_status,
          boq_details: undefined,
          created_at: boq.created_at,
          priority: boq.priority || 'medium'
        };
      });

      if (enrichedProjects.length === 0) {
        toast.info('No projects assigned yet');
      }

      return enrichedProjects;
    },
    !isAnyModalOpen // Disable auto-refresh when modal is open
  );

  const projects = useMemo(() => projectsData || [], [projectsData]);

  // Other state variables
  const [availableSEs, setAvailableSEs] = useState<SiteEngineer[]>([]);
  const [loadingSEs, setLoadingSEs] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'review' | 'pending' | 'assigned' | 'completed' | 'approved' | 'rejected'>('review');
  const [selectedSE, setSelectedSE] = useState<SiteEngineer | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [seSearchQuery, setSeSearchQuery] = useState('');

  // Buyer-related states
  const [availableBuyers, setAvailableBuyers] = useState<Buyer[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null);
  const [buyerSearchQuery, setBuyerSearchQuery] = useState('');
  const [loadingBOQDetails, setLoadingBOQDetails] = useState(false);
  const [assignMode, setAssignMode] = useState<'existing' | 'create'>('existing');
  const [newSEData, setNewSEData] = useState({ full_name: '', email: '', phone: '' });
  const [editingSE, setEditingSE] = useState<SiteEngineer | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSEData, setEditSEData] = useState({ full_name: '', email: '', phone: '' });
  const [creatingNewSE, setCreatingNewSE] = useState(false);
  const [showSEDetailsModal, setShowSEDetailsModal] = useState(false);
  const [selectedSEDetails, setSelectedSEDetails] = useState<SiteEngineer | null>(null);
  const [selectedProjectForBOQ, setSelectedProjectForBOQ] = useState<Project | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  // const [showRequestMaterialsModal, setShowRequestMaterialsModal] = useState(false); // Removed - use Change Requests page
  const [pendingChangeRequests, setPendingChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [approvedChangeRequests, setApprovedChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [rejectedChangeRequests, setRejectedChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestItem | null>(null);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [showDayExtensionModal, setShowDayExtensionModal] = useState(false);
  const [projectToComplete, setProjectToComplete] = useState<Project | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalComments, setApprovalComments] = useState('');
  const [processingBOQ, setProcessingBOQ] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [seToDelete, setSeToDelete] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (showAssignModal) {
      loadAvailableSEs();
      // loadAvailableBuyers(); // Removed - Buyer assignment not needed
    }
  }, [showAssignModal]);

  // Removed loadProjects - now handled by useProjectsAutoSync hook

  const loadAvailableSEs = async () => {
    try {
      setLoadingSEs(true);
      const response = await projectManagerService.getAllSiteSupervisors();
      const allSEs = [
        ...(response.assigned_project_managers || []),
        ...(response.unassigned_project_managers || [])
      ];
      setAvailableSEs(allSEs);
    } catch (error) {
      console.error('Error loading site engineers:', error);
      toast.error('Failed to load site engineers');
    } finally {
      setLoadingSEs(false);
    }
  };

  const loadAvailableBuyers = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      // Updated to use PM route - PM manages buyers
      const response = await fetch(`${API_URL}/all_buyers`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        const allBuyers = [
          ...(data.assigned_buyers || []),
          ...(data.unassigned_buyers || [])
        ];
        setAvailableBuyers(allBuyers);
      }
    } catch (error) {
      console.error('Error loading buyers:', error);
      toast.error('Failed to load buyers');
    }
  };

  const loadBOQDetails = async (boqId: number) => {
    setLoadingBOQDetails(true);
    try {
      const response = await estimatorService.getBOQById(boqId);
      if (response.success && response.data) {
        const boqData = response.data;

        // Helper function to process item
        const processItem = (item: any, purchaseType: 'existing' | 'new'): BOQItem => ({
          id: item.master_item_id || item.id,
          description: item.item_name || item.description || item.item_description,
          briefDescription: item.brief_description || item.description,
          unit: 'unit',
          quantity: 1,
          rate: item.base_cost || item.rate || 0,
          amount: item.total_cost || item.amount || 0,
          sub_items: item.sub_items || [],
          materials: item.sub_items?.length > 0
            ? item.sub_items.flatMap((si: any) => si.materials?.map((mat: any) => ({
                name: mat.material_name,
                quantity: mat.quantity,
                unit: mat.unit,
                rate: mat.unit_price,
                amount: mat.total_price,
                sub_item_name: si.scope || si.sub_item_name
              })) || [])
            : item.materials?.map((mat: any) => ({
                name: mat.material_name,
                quantity: mat.quantity,
                unit: mat.unit,
                rate: mat.unit_price,
                amount: mat.total_price
              })) || [],
          labour: item.sub_items?.length > 0
            ? item.sub_items.flatMap((si: any) => si.labour?.map((lab: any) => ({
                type: lab.labour_role,
                quantity: lab.hours,
                unit: 'hours',
                rate: lab.rate_per_hour,
                amount: lab.total_cost || (lab.hours * lab.rate_per_hour),
                sub_item_name: si.scope || si.sub_item_name
              })) || [])
            : item.labour?.map((lab: any) => ({
                type: lab.labour_role,
                quantity: lab.hours,
                unit: 'hours',
                rate: lab.rate_per_hour,
                amount: lab.total_cost
              })) || [],
          laborCost: item.sub_items?.length > 0
            ? item.sub_items.reduce((sum: number, si: any) =>
                sum + (si.labour?.reduce((lSum: number, l: any) =>
                  lSum + (l.total_cost || (l.hours * l.rate_per_hour) || 0), 0) || 0), 0)
            : item.totalLabourCost || item.labor_cost || 0,
          estimatedSellingPrice: item.selling_price || item.estimatedSellingPrice || item.estimated_selling_price || item.amount,
          purchaseType
        });

        // Process existing purchase items
        const existingItems: BOQItem[] = boqData.existing_purchase?.items?.map((item: any) =>
          processItem(item, 'existing')
        ) || [];

        // Process new purchase items - combine from new_purchase.items AND root items array
        let newItems: BOQItem[] = [];

        // Add items from new_purchase section
        if (boqData.new_purchase?.items) {
          newItems = boqData.new_purchase.items.map((item: any) => processItem(item, 'new'));
        }

        // Also check root items array for additional new purchases (when multiple new purchases are added)
        if (boqData.items && Array.isArray(boqData.items)) {
          const rootNewItems = boqData.items
            .filter((item: any) => {
              // Only include items that are not already in existing or new purchase
              const itemId = item.master_item_id || item.id;
              const existingIds = existingItems.map(i => i.id);
              const newIds = newItems.map(i => i.id);
              return !existingIds.includes(itemId) && !newIds.includes(itemId);
            })
            .map((item: any) => processItem(item, 'new'));

          newItems = [...newItems, ...rootNewItems];
        }

        const boqDataAny: any = boqData;
        // Use combined_summary if available (for BOQs with new purchases), otherwise use summary
        const summaryData = boqDataAny.combined_summary || boqDataAny.summary || boqDataAny;
        const boqDetails: BOQDetails = {
          boq_detail_id: boqId,
          total_cost: summaryData.total_cost || boqDataAny.total_cost || 0,
          total_items: summaryData.total_items || boqDataAny.items?.length || 0,
          total_materials: summaryData.total_material_cost || boqDataAny.total_material_cost || 0,
          total_labour: summaryData.total_labour_cost || boqDataAny.total_labour_cost || 0,
          overhead_percentage: boqDataAny.overhead_percentage || 10,
          profit_margin_percentage: boqDataAny.profit_margin_percentage || boqDataAny.profit_margin || 15,
          boq_details: boqDataAny
        };

        // Update selected project
        setSelectedProject(prev => prev ? {
          ...prev,
          boqItems: [...existingItems, ...newItems],
          existingPurchaseItems: existingItems,
          newPurchaseItems: newItems,
          boq_details: boqDetails
        } : null);

        // Trigger background refresh to update the projects list
        refetch();

        // Load change requests for this BOQ - DISABLED for PM role
        // const crResponse = await changeRequestService.getBOQChangeRequests(boqId);
        // if (crResponse.success) {
        //   const pending = crResponse.data.filter(cr => cr.status === 'pending');
        //   const approved = crResponse.data.filter(cr => cr.status === 'approved');
        //   const rejected = crResponse.data.filter(cr => cr.status === 'rejected');
        //   setPendingChangeRequests(pending);
        //   setApprovedChangeRequests(approved);
        //   setRejectedChangeRequests(rejected);
        // }

        // Set empty arrays for now
        setPendingChangeRequests([]);
        setApprovedChangeRequests([]);
        setRejectedChangeRequests([]);

        setShowBOQModal(true);
      } else {
        toast.error('Failed to load BOQ details');
      }
    } catch (error) {
      console.error('Error loading BOQ details:', error);
      toast.error('Failed to load BOQ details');
    } finally {
      setLoadingBOQDetails(false);
    }
  };

  const handleCreateSE = async () => {
    if (!newSEData.full_name || !newSEData.email || !newSEData.phone) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      setCreatingNewSE(true);
      await projectManagerService.createSiteSupervisor({
        ...newSEData,
        project_ids: []
      });
      toast.success('Site Engineer created successfully');
      setNewSEData({ full_name: '', email: '', phone: '' });
      await loadAvailableSEs();
      setAssignMode('existing');
    } catch (error: any) {
      console.error('Error creating SE:', error);
      toast.error(error?.response?.data?.error || 'Failed to create Site Engineer');
    } finally {
      setCreatingNewSE(false);
    }
  };

  const handleEditSE = async () => {
    if (!editingSE || !editSEData.full_name || !editSEData.email || !editSEData.phone) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      await projectManagerService.updateSiteSupervisor(editingSE.user_id, {
        full_name: editSEData.full_name,
        email: editSEData.email,
        phone: editSEData.phone
      });
      toast.success('Site Engineer updated successfully');
      setShowEditModal(false);
      setEditingSE(null);
      await loadAvailableSEs();
    } catch (error: any) {
      console.error('Error updating SE:', error);
      toast.error(error?.response?.data?.error || 'Failed to update Site Engineer');
    }
  };

  const handleDeleteSE = async () => {
    if (!seToDelete) return;

    try {
      await projectManagerService.deleteSE(seToDelete.id);
      toast.success('Site Engineer deleted successfully');
      setShowDeleteConfirm(false);
      setSeToDelete(null);
      loadAvailableSEs();
      refetch();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to delete Site Engineer');
    }
  };

  const handleAssignSE = async () => {
    if (!selectedSE || !selectedProject) {
      toast.error('Please select a Site Engineer');
      return;
    }

    try {
      setAssigning(true);
      const assignmentData: any = {
        site_supervisor_id: selectedSE.user_id,
        project_ids: [selectedProject.project_id]
      };

      // Add buyer if selected
      if (selectedBuyer) {
        assignmentData.buyer_id = selectedBuyer.user_id;
      }

      await projectManagerService.assignProjectsToSiteSupervisor(assignmentData);

      const assignmentMessage = selectedBuyer
        ? `Assigned ${selectedSE.sitesupervisor_name} (SE) and ${selectedBuyer.full_name} (Buyer) to ${selectedProject.project_name}`
        : `Assigned ${selectedSE.sitesupervisor_name} to ${selectedProject.project_name}`;

      toast.success(assignmentMessage);
      setSelectedSE(null);
      setSelectedBuyer(null);
      setBuyerSearchQuery('');
      setShowAssignModal(false);
      await refetch();
      setFilterStatus('assigned');
    } catch (error: any) {
      console.error('Error assigning SE:', error);
      toast.error(error?.response?.data?.error || 'Failed to assign Site Engineer');
    } finally {
      setAssigning(false);
    }
  };

  const handleEditBOQ = (project: Project) => {
    setSelectedProject(project);
    setShowBOQModal(false);
    setShowEditBOQModal(true);
    // BOQCreationForm will fetch full BOQ details using the boq_id from existingBoqData
  };

  const filteredProjects = projects.filter(project => {
    const hasSiteSupervisor = project.site_supervisor_id !== null &&
                              project.site_supervisor_id !== undefined &&
                              project.site_supervisor_id !== 0;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        project.project_name?.toLowerCase().includes(query) ||
        project.client?.toLowerCase().includes(query) ||
        project.location?.toLowerCase().includes(query) ||
        project.boq_name?.toLowerCase().includes(query);

      if (!matchesSearch) return false;
    }

    if (filterStatus === 'review') {
      const status = project.boq_status?.toLowerCase() || '';
      // Review tab: BOQs sent by EST for PM review (including edited ones)
      const reviewStatuses = [
        'pending_pm_approval',
        'draft',
        'pending_revision',
        'under_revision'
      ];
      return (!hasSiteSupervisor && project.status?.toLowerCase() !== 'completed') &&
             reviewStatuses.includes(status) &&
             status !== 'pm_rejected' && status !== 'rejected';
    }
    if (filterStatus === 'pending') {
      const status = project.boq_status?.toLowerCase() || '';
      // Pending tab: Projects assigned by TD, waiting for SE assignment
      return (!hasSiteSupervisor && project.status?.toLowerCase() !== 'completed') &&
             (status === 'approved' || status === 'pm_approved' || status === 'client_confirmed') &&
             project.user_id !== null;
    }
    if (filterStatus === 'assigned') {
      return hasSiteSupervisor && project.status?.toLowerCase() !== 'completed';
    }
    if (filterStatus === 'completed') {
      return project.status?.toLowerCase() === 'completed';
    }
    if (filterStatus === 'approved') {
      const status = project.boq_status?.toLowerCase() || '';
      // Show BOQs that THIS PM has approved
      // Stay here until TD assigns PM to the project (user_id is null)
      // Once TD assigns PM (user_id is set), it moves to Pending tab
      // Include revision statuses too
      const pmOnlyApprovedStatuses = ['pm_approved', 'pending_td_approval', 'approved', 'sent_for_confirmation', 'client_confirmed', 'pending_revision', 'under_revision', 'revision_approved'];
      return pmOnlyApprovedStatuses.includes(status) && project.user_id === null && !hasSiteSupervisor && project.status?.toLowerCase() !== 'completed';
    }
    if (filterStatus === 'rejected') {
      const status = project.boq_status?.toLowerCase() || '';
      return status === 'rejected' || status === 'pm_rejected';
    }
    return false;
  });

  const getTabCounts = () => ({
    review: projects.filter(p => {
      const hasSS = p.site_supervisor_id !== null && p.site_supervisor_id !== undefined && p.site_supervisor_id !== 0;
      const status = p.boq_status?.toLowerCase() || '';
      const reviewStatuses = [
        'pending_pm_approval',
        'draft',
        'pending_revision',
        'under_revision'
      ];
      return (!hasSS && p.status?.toLowerCase() !== 'completed') &&
             reviewStatuses.includes(status) &&
             status !== 'pm_rejected' && status !== 'rejected';
    }).length,
    pending: projects.filter(p => {
      const hasSS = p.site_supervisor_id !== null && p.site_supervisor_id !== undefined && p.site_supervisor_id !== 0;
      const status = p.boq_status?.toLowerCase() || '';
      return (!hasSS && p.status?.toLowerCase() !== 'completed') &&
             (status === 'approved' || status === 'pm_approved' || status === 'client_confirmed') &&
             p.user_id !== null;
    }).length,
    assigned: projects.filter(p => {
      const hasSS = p.site_supervisor_id !== null && p.site_supervisor_id !== undefined && p.site_supervisor_id !== 0;
      return hasSS && p.status?.toLowerCase() !== 'completed';
    }).length,
    completed: projects.filter(p => p.status?.toLowerCase() === 'completed').length,
    approved: projects.filter(p => {
      const hasSS = p.site_supervisor_id !== null && p.site_supervisor_id !== undefined && p.site_supervisor_id !== 0;
      const status = p.boq_status?.toLowerCase() || '';
      const pmOnlyApprovedStatuses = ['pm_approved', 'pending_td_approval', 'approved', 'sent_for_confirmation', 'client_confirmed', 'pending_revision', 'under_revision', 'revision_approved'];
      return pmOnlyApprovedStatuses.includes(status) && p.user_id === null && !hasSS && p.status?.toLowerCase() !== 'completed';
    }).length,
    rejected: projects.filter(p => {
      const status = p.boq_status?.toLowerCase() || '';
      return status === 'rejected' || status === 'pm_rejected';
    }).length
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'low': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredSEs = availableSEs.filter(se =>
    se.sitesupervisor_name.toLowerCase().includes(seSearchQuery.toLowerCase()) ||
    se.email.toLowerCase().includes(seSearchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  const tabCounts = getTabCounts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header - Match Estimator/TD Style */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">My Projects</h1>
          </div>
        </div>
      </div>

      {/* Search Bar and Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search projects, client, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:border-gray-300 focus:ring-0 text-sm"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`h-8 px-3 rounded-md transition-all flex items-center gap-1.5 text-sm font-medium ${
                viewMode === 'cards'
                  ? 'bg-[#243d8a] text-white hover:opacity-90'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`h-8 px-3 rounded-md transition-all flex items-center gap-1.5 text-sm font-medium ${
                viewMode === 'table'
                  ? 'bg-[#243d8a] text-white hover:opacity-90'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <ListBulletIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6">
          <div className="flex items-start justify-start gap-0 border-b border-gray-200 mb-6">
            <button
              onClick={() => setFilterStatus('review')}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                filterStatus === 'review'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Review ({tabCounts.review})
            </button>

            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                filterStatus === 'pending'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Pending ({tabCounts.pending})
            </button>

            <button
              onClick={() => setFilterStatus('assigned')}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                filterStatus === 'assigned'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Assigned ({tabCounts.assigned})
            </button>

            <button
              onClick={() => setFilterStatus('approved')}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                filterStatus === 'approved'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Approved ({tabCounts.approved})
            </button>

            <button
              onClick={() => setFilterStatus('rejected')}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                filterStatus === 'rejected'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Rejected ({tabCounts.rejected})
            </button>

            <button
              onClick={() => setFilterStatus('completed')}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                filterStatus === 'completed'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Completed ({tabCounts.completed})
            </button>
          </div>

          {/* Projects List */}
          {filteredProjects.length === 0 ? (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
              <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No projects in this category</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="space-y-4">
              {filteredProjects.map((project, index) => (
              <motion.div
                key={project.project_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200"
              >
                <div className="p-6">
                  {/* Project Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{project.project_name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(project.priority)}`}>
                          {project.priority} priority
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" />
                          {project.boq_status || 'pending'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <BuildingOfficeIcon className="w-4 h-4" />
                          <span>{project.client || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="w-4 h-4" />
                          <span>{formatDate(project.created_at)}</span>
                        </div>
                        {project.site_supervisor_id && project.site_supervisor_name && (
                          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-md">
                            <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-medium text-purple-900 truncate">{project.site_supervisor_name}</span>
                            <div className="flex items-center gap-0.5 sm:gap-1 ml-auto">
                              <button
                                onClick={async () => {
                                  const se = availableSEs.find(s => s.user_id === project.site_supervisor_id);
                                  if (se) {
                                    setEditingSE(se);
                                    setEditSEData({
                                      full_name: se.sitesupervisor_name,
                                      email: se.email || '',
                                      phone: se.phone || ''
                                    });
                                    setShowEditModal(true);
                                  } else {
                                    await loadAvailableSEs();
                                    const refreshedSE = availableSEs.find(s => s.user_id === project.site_supervisor_id);
                                    if (refreshedSE) {
                                      setEditingSE(refreshedSE);
                                      setEditSEData({
                                        full_name: refreshedSE.sitesupervisor_name,
                                        email: refreshedSE.email || '',
                                        phone: refreshedSE.phone || ''
                                      });
                                      setShowEditModal(true);
                                    }
                                  }
                                }}
                                className="p-0.5 sm:p-1 text-purple-600 hover:text-blue-600 hover:bg-blue-100 rounded transition-all flex-shrink-0"
                                title="Edit Site Engineer Details"
                              >
                                <PencilIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setSeToDelete({
                                    id: project.site_supervisor_id,
                                    name: project.site_supervisor_name
                                  });
                                  setShowDeleteConfirm(true);
                                }}
                                className="p-0.5 sm:p-1 text-purple-600 hover:text-red-600 hover:bg-red-100 rounded transition-all flex-shrink-0"
                                title="Delete Site Engineer"
                              >
                                <XMarkIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedProject(project);
                          if (project.boq_id) {
                            loadBOQDetails(project.boq_id);
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                        title="View Details"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                      {!project.site_supervisor_id &&
                       project.user_id !== null &&
                       (project.boq_status?.toLowerCase() === 'client_confirmed' ||
                        project.boq_status?.toLowerCase() === 'approved') && (
                        <button
                          onClick={() => {
                            setSelectedProject(project);
                            setShowAssignModal(true);
                          }}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-all"
                          title="Assign Site Engineer"
                        >
                          <UserPlusIcon className="w-5 h-5" />
                        </button>
                      )}
                      {project.site_supervisor_id && project.status?.toLowerCase() !== 'completed' && (
                        <>
                          {project.completion_requested ? (
                            <button
                              onClick={() => {
                                setProjectToComplete(project);
                                setShowCompleteModal(true);
                              }}
                              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium shadow-sm relative animate-pulse"
                              title="SE Requested Completion - Click to Approve"
                            >
                              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                              </span>
                              <CheckCircleIcon className="w-5 h-5" />
                              Confirm Complete
                            </button>
                          ) : (
                            <button
                              disabled
                              className="px-4 py-2 bg-gray-300 text-gray-500 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm cursor-not-allowed opacity-60"
                              title="Waiting for SE completion request"
                            >
                              <CheckCircleIcon className="w-5 h-5" />
                              Complete
                            </button>
                          )}
                        </>
                      )}
                      {project.status?.toLowerCase() === 'completed' && (
                        <div className="px-4 py-2 bg-green-100 border-2 border-green-400 rounded-lg flex items-center gap-2">
                          <CheckCircleIcon className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-bold text-green-900">Completed</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Project Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700 mb-1">Location</p>
                      <p className="text-lg font-bold text-blue-900">{project.location || 'N/A'}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs text-green-700 mb-1">Status</p>
                      <p className="text-lg font-bold text-green-900 capitalize">{project.status || 'Active'}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <p className="text-xs text-purple-700 mb-1">Start Date</p>
                      <p className="text-lg font-bold text-purple-900">
                        {project.start_date ? new Date(project.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs text-orange-700 mb-1">End Date</p>
                      <p className="text-lg font-bold text-orange-900">
                        {project.end_date ? new Date(project.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                  </div>

                </div>
              </motion.div>
              ))}
            </div>
          ) : (
            /* Table View */
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priority
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Site Engineer
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProjects.map((project) => (
                    <tr key={project.project_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{project.project_name}</div>
                        <div className="text-xs text-gray-500">{project.location || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{project.client || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1 w-fit">
                          <ClockIcon className="w-3 h-3" />
                          {project.boq_status || 'pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(project.priority)}`}>
                          {project.priority}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        {project.site_supervisor_name ? (
                          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-md w-fit max-w-full">
                            <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-medium text-purple-900 truncate">{project.site_supervisor_name}</span>
                            <div className="flex items-center gap-0.5 sm:gap-1 ml-auto flex-shrink-0">
                              <button
                                onClick={async () => {
                                  const se = availableSEs.find(s => s.user_id === project.site_supervisor_id);
                                  if (se) {
                                    setEditingSE(se);
                                    setEditSEData({
                                      full_name: se.sitesupervisor_name,
                                      email: se.email || '',
                                      phone: se.phone || ''
                                    });
                                    setShowEditModal(true);
                                  } else {
                                    await loadAvailableSEs();
                                    const refreshedSE = availableSEs.find(s => s.user_id === project.site_supervisor_id);
                                    if (refreshedSE) {
                                      setEditingSE(refreshedSE);
                                      setEditSEData({
                                        full_name: refreshedSE.sitesupervisor_name,
                                        email: refreshedSE.email || '',
                                        phone: refreshedSE.phone || ''
                                      });
                                      setShowEditModal(true);
                                    }
                                  }
                                }}
                                className="p-0.5 sm:p-1 text-purple-600 hover:text-blue-600 hover:bg-blue-100 rounded transition-all"
                                title="Edit Site Engineer Details"
                              >
                                <PencilIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setSeToDelete({
                                    id: project.site_supervisor_id,
                                    name: project.site_supervisor_name
                                  });
                                  setShowDeleteConfirm(true);
                                }}
                                className="p-0.5 sm:p-1 text-purple-600 hover:text-red-600 hover:bg-red-100 rounded transition-all"
                                title="Delete Site Engineer"
                              >
                                <XMarkIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs sm:text-sm text-gray-400">Not assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(project.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedProject(project);
                              if (project.boq_id) {
                                loadBOQDetails(project.boq_id);
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                            title="View Details"
                          >
                            <EyeIcon className="w-5 h-5" />
                          </button>
                          {!project.site_supervisor_id &&
                           project.user_id !== null &&
                           (project.boq_status?.toLowerCase() === 'client_confirmed' ||
                            project.boq_status?.toLowerCase() === 'approved') && (
                            <button
                              onClick={() => {
                                setSelectedProject(project);
                                setShowAssignModal(true);
                              }}
                              className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-all"
                              title="Assign Site Engineer"
                            >
                              <UserPlusIcon className="w-5 h-5" />
                            </button>
                          )}
                          {project.site_supervisor_id && project.status?.toLowerCase() !== 'completed' && (
                            <>
                              {project.completion_requested ? (
                                <button
                                  onClick={() => {
                                    setProjectToComplete(project);
                                    setShowCompleteModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium shadow-sm relative"
                                  title="SE Requested Completion - Click to Approve"
                                >
                                  <CheckCircleIcon className="w-4 h-4" />
                                  Confirm
                                </button>
                              ) : null}
                            </>
                          )}
                          {project.status?.toLowerCase() === 'completed' && (
                            <div className="px-3 py-1 bg-green-100 border border-green-400 rounded-lg flex items-center gap-1.5">
                              <CheckCircleIcon className="w-4 h-4 text-green-600" />
                              <span className="text-xs font-bold text-green-900">Completed</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* BOQ Details Modal - Using shared component */}
      <BOQDetailsModal
        isOpen={showBOQModal}
        onClose={() => setShowBOQModal(false)}
        boq={selectedProject ? { boq_id: selectedProject.boq_id, boq_name: selectedProject.projectName } : null}
        onEdit={selectedProject?.boq_status?.toLowerCase() === 'pending_pm_approval' || selectedProject?.boq_status?.toLowerCase() === 'pending' ? () => {
          setShowEditBOQModal(true);
          setShowBOQModal(false);
        } : undefined}
        onApprove={selectedProject?.boq_status?.toLowerCase() === 'pending_pm_approval' || selectedProject?.boq_status?.toLowerCase() === 'pending' ? async () => {
          // Reload BOQ details before showing approve modal to ensure fresh data
          if (selectedProject?.boq_id) {
            await loadBOQDetails(selectedProject.boq_id);
          }
          setShowApproveModal(true);
          setShowBOQModal(false);
        } : undefined}
        onReject={selectedProject?.boq_status?.toLowerCase() === 'pending_pm_approval' || selectedProject?.boq_status?.toLowerCase() === 'pending' ? () => {
          setShowRejectModal(true);
          setShowBOQModal(false);
        } : undefined}
        onRequestExtension={selectedProject?.boq_status?.toLowerCase() === 'approved' && selectedProject?.site_supervisor_id && selectedProject?.status?.toLowerCase() !== 'completed' ? () => {
          setShowDayExtensionModal(true);
          setShowBOQModal(false);
        } : undefined}
        showNewPurchaseItems={true}
      />

      {/* OLD BOQ Modal - TO BE REMOVED - keeping temporarily for reference */}
      {false && showBOQModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-blue-900">BOQ Details - {selectedProject.project_name}</h2>
                  <p className="text-sm text-blue-700 mt-1">
                    {selectedProject.client} • {selectedProject.location} • {selectedProject.area}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">Working Hours: {selectedProject.area || 'N/A'}</p>
                </div>
                <button
                  onClick={() => setShowBOQModal(false)}
                  className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-blue-900" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[75vh]">
              {loadingBOQDetails ? (
                <div className="text-center py-12">
                  <ModernLoadingSpinners variant="pulse-wave" />
                </div>
              ) : (
                <>
                  {/* Overhead Budget Overview */}
                  {(() => {
                    const allRequests = [...pendingChangeRequests, ...approvedChangeRequests, ...rejectedChangeRequests];
                    const sampleRequest = allRequests.find(r => r.overhead_analysis);
                    if (!sampleRequest?.overhead_analysis) return null;

                    const totalConsumedFromApproved = approvedChangeRequests.reduce((sum, req) => sum + (req.materials_total_cost || 0), 0);
                    const overheadAnalysis = sampleRequest.overhead_analysis;
                    const totalAllocated = overheadAnalysis.original_allocated || 0;
                    const availableBudget = totalAllocated - totalConsumedFromApproved;
                    const isOverBudget = availableBudget < 0;

                    return (
                      <div className="mb-6">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-lg px-4 py-3">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            Overhead Budget Overview
                          </h3>
                        </div>
                        <div className="border-2 border-blue-200 rounded-b-lg p-4 bg-blue-50/30">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
                              <p className="text-xs text-gray-600 mb-1 font-medium">Total Overhead Allocated</p>
                              <p className="text-xl font-bold text-blue-900">
                                AED {totalAllocated.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                ({overheadAnalysis.overhead_percentage || 0}% of base cost)
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-orange-200 shadow-sm">
                              <p className="text-xs text-gray-600 mb-1 font-medium">Already Consumed</p>
                              <p className="text-xl font-bold text-orange-600">
                                AED {totalConsumedFromApproved.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                From {approvedChangeRequests.length} approved request(s)
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
                              <p className="text-xs text-gray-600 mb-1 font-medium">Available Overhead Budget</p>
                              <p className={`text-xl font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                                AED {availableBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">Remaining for extra materials</p>
                            </div>
                            <div className={`bg-white rounded-lg p-4 border shadow-sm ${isOverBudget ? 'border-red-200' : 'border-green-200'}`}>
                              <p className="text-xs text-gray-600 mb-1 font-medium">Budget Status</p>
                              <p className={`text-xl font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                                {!isOverBudget ? '✓ Healthy' : '⚠ Over Budget'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {!isOverBudget ? 'Sufficient funds available' : 'Exceeds allocated budget'}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 p-3 bg-blue-100 border border-blue-300 rounded-lg">
                            <p className="text-xs text-blue-800">
                              <strong>Note:</strong> The overhead budget is used to cover additional material costs for change requests.
                              Each approved extra material request will consume from this allocated budget.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Pending Change Requests */}
                  <PendingRequestsSection
                    requests={pendingChangeRequests}
                    onViewDetails={async (crId) => {
                      const response = await changeRequestService.getChangeRequestById(crId);
                      if (response.success && response.data) {
                        setSelectedChangeRequest(response.data);
                        setShowChangeRequestModal(true);
                      } else {
                        toast.error('Failed to load change request details');
                      }
                    }}
                    onStatusUpdate={async () => {
                      if (selectedProject?.boq_id) {
                        await loadBOQDetails(selectedProject.boq_id);
                      }
                    }}
                  />

                  {/* Approved Extra Materials */}
                  {approvedChangeRequests.length > 0 && (
                    <ApprovedExtraMaterialsSection
                      materials={approvedChangeRequests.flatMap(cr =>
                        cr.materials_data.map(mat => ({
                          id: cr.cr_id,
                          item_name: mat.material_name,
                          quantity: mat.quantity,
                          unit: mat.unit,
                          unit_price: mat.unit_price,
                          total_price: mat.total_price,
                          change_request_id: cr.cr_id,
                          related_item: mat.related_item,
                          approval_date: cr.approval_date,
                          approved_by_name: cr.approved_by_name
                        }))
                      )}
                      onViewChangeRequest={(crId) => {
                        setSelectedChangeRequestId(crId);
                        setShowChangeRequestModal(true);
                      }}
                    />
                  )}

                  {/* Rejected Requests */}
                  <RejectedRequestsSection
                    requests={rejectedChangeRequests}
                    onViewDetails={async (crId) => {
                      const response = await changeRequestService.getChangeRequestById(crId);
                      if (response.success && response.data) {
                        setSelectedChangeRequest(response.data);
                        setShowChangeRequestModal(true);
                      } else {
                        toast.error('Failed to load change request details');
                      }
                    }}
                  />

                  {/* Existing Purchase Section */}
                  {selectedProject.existingPurchaseItems && selectedProject.existingPurchaseItems.length > 0 && (
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-t-lg px-4 py-3 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5" />
                          Existing Purchase Items
                        </h3>
                        <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
                          {selectedProject.existingPurchaseItems.length} item{selectedProject.existingPurchaseItems.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="border-2 border-purple-200 rounded-b-lg p-4 bg-purple-50/30">
                        <div className="space-y-4">
                          {selectedProject.existingPurchaseItems.map((item, idx) => (
                            <div key={`existing-${item.id}-${idx}`} className="bg-white border-2 border-purple-200 rounded-lg p-4 shadow-sm">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-gray-900 text-lg">{item.description}</h4>
                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">Existing</span>
                                  </div>
                                  {item.briefDescription && (
                                    <p className="text-sm text-gray-600 mt-1">{item.briefDescription}</p>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <p className="text-sm text-gray-500">Qty: {item.quantity} {item.unit}</p>
                                  <p className="text-sm text-gray-500">Rate: AED{(item.rate || 0).toLocaleString()}/{item.unit}</p>
                                </div>
                              </div>

                              {item.materials?.length > 0 && (
                                <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <p className="text-sm font-medium text-blue-900 mb-2">+ Raw Materials</p>
                                  <div className="space-y-1">
                                    {item.materials.map((mat, matIdx) => (
                                      <div key={matIdx} className="flex justify-between text-sm text-blue-800">
                                        <span>{mat.name} ({mat.quantity} {mat.unit})</span>
                                        <span className="font-medium">AED{(mat.amount || 0).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-sm font-bold text-blue-900 mt-2 pt-2 border-t border-blue-200">
                                    Total Materials: AED{item.materials.reduce((sum, m) => sum + (m.amount || 0), 0).toLocaleString()}
                                  </p>
                                </div>
                              )}

                              {item.labour?.length > 0 && (
                                <div className="mb-3 bg-green-50 border border-green-200 rounded-lg p-3">
                                  <p className="text-sm font-medium text-green-900 mb-2">+ Labour</p>
                                  <div className="space-y-1">
                                    {item.labour.map((lab, labIdx) => (
                                      <div key={labIdx} className="flex justify-between text-sm text-green-800">
                                        <span>{lab.type} ({lab.quantity} {lab.unit})</span>
                                        <span className="font-medium">AED{(lab.amount || 0).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-sm font-bold text-green-900 mt-2 pt-2 border-t border-green-200">
                                    Total Labour: AED{(item.laborCost || 0).toLocaleString()}
                                  </p>
                                </div>
                              )}

                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                                <p className="text-sm font-medium text-orange-900 mb-2">+ Overheads & Profit</p>
                                <div className="space-y-1 text-sm text-orange-800">
                                  <div className="flex justify-between">
                                    <span>Overhead ({selectedProject.boq_details?.overhead_percentage || 10}%)</span>
                                    <span>AED{(item.amount * ((selectedProject.boq_details?.overhead_percentage || 10) / 100)).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Profit Margin ({selectedProject.boq_details?.profit_margin_percentage || 15}%)</span>
                                    <span>AED{(item.amount * ((selectedProject.boq_details?.profit_margin_percentage || 15) / 100)).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-green-900">Estimated Selling Price:</span>
                                  <span className="text-xl font-bold text-green-900">AED{(item.estimatedSellingPrice || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Existing Purchase Summary */}
                        {selectedProject.boq_details?.boq_details?.existing_purchase?.summary && (
                          <div className="mt-4 bg-white border-2 border-purple-300 rounded-lg p-4">
                            <h4 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
                              <DocumentTextIcon className="w-4 h-4" />
                              Existing Purchase Summary
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-blue-700">Total Material Cost:</span>
                                <span className="font-bold text-blue-900">
                                  AED{(selectedProject.boq_details.boq_details.existing_purchase.summary.total_material_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-green-700">Total Labour Cost:</span>
                                <span className="font-bold text-green-900">
                                  AED{(selectedProject.boq_details.boq_details.existing_purchase.summary.total_labour_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between pt-2 mt-2 border-t-2 border-purple-300">
                                <span className="text-purple-900 font-bold">Existing Purchase Total:</span>
                                <span className="font-bold text-purple-900">
                                  AED{(selectedProject.boq_details.boq_details.existing_purchase.summary.total_cost || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* New Purchase Section */}
                  {selectedProject.newPurchaseItems && selectedProject.newPurchaseItems.length > 0 && (
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-t-lg px-4 py-3 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5" />
                          New Purchase Items
                        </h3>
                        <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
                          {selectedProject.newPurchaseItems.length} item{selectedProject.newPurchaseItems.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="border-2 border-emerald-200 rounded-b-lg p-4 bg-emerald-50/30">
                        <div className="space-y-4">
                          {selectedProject.newPurchaseItems.map((item, idx) => (
                            <div key={`new-${item.id}-${idx}`} className="bg-white border-2 border-emerald-200 rounded-lg p-4 shadow-sm">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-gray-900 text-lg">{item.description}</h4>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">New</span>
                                  </div>
                                  {item.briefDescription && (
                                    <p className="text-sm text-gray-600 mt-1">{item.briefDescription}</p>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <p className="text-sm text-gray-500">Qty: {item.quantity} {item.unit}</p>
                                  <p className="text-sm text-gray-500">Rate: AED{(item.rate || 0).toLocaleString()}/{item.unit}</p>
                                </div>
                              </div>

                              {item.materials?.length > 0 && (
                                <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <p className="text-sm font-medium text-blue-900 mb-2">+ Raw Materials</p>
                                  <div className="space-y-1">
                                    {item.materials.map((mat, matIdx) => (
                                      <div key={matIdx} className="flex justify-between text-sm text-blue-800">
                                        <span>{mat.name} ({mat.quantity} {mat.unit})</span>
                                        <span className="font-medium">AED{(mat.amount || 0).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-sm font-bold text-blue-900 mt-2 pt-2 border-t border-blue-200">
                                    Total Materials: AED{item.materials.reduce((sum, m) => sum + (m.amount || 0), 0).toLocaleString()}
                                  </p>
                                </div>
                              )}

                              {item.labour?.length > 0 && (
                                <div className="mb-3 bg-green-50 border border-green-200 rounded-lg p-3">
                                  <p className="text-sm font-medium text-green-900 mb-2">+ Labour</p>
                                  <div className="space-y-1">
                                    {item.labour.map((lab, labIdx) => (
                                      <div key={labIdx} className="flex justify-between text-sm text-green-800">
                                        <span>{lab.type} ({lab.quantity} {lab.unit})</span>
                                        <span className="font-medium">AED{(lab.amount || 0).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-sm font-bold text-green-900 mt-2 pt-2 border-t border-green-200">
                                    Total Labour: AED{(item.laborCost || 0).toLocaleString()}
                                  </p>
                                </div>
                              )}

                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                                <p className="text-sm font-medium text-orange-900 mb-2">+ Overheads & Profit</p>
                                <div className="space-y-1 text-sm text-orange-800">
                                  <div className="flex justify-between">
                                    <span>Overhead ({selectedProject.boq_details?.boq_details?.new_purchase?.items?.[idx]?.overhead_percentage || 8}%)</span>
                                    <span>AED{(selectedProject.boq_details?.boq_details?.new_purchase?.items?.[idx]?.overhead_amount || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Profit Margin ({selectedProject.boq_details?.boq_details?.new_purchase?.items?.[idx]?.profit_margin_percentage || 12}%)</span>
                                    <span>AED{(selectedProject.boq_details?.boq_details?.new_purchase?.items?.[idx]?.profit_margin_amount || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-green-900">Estimated Selling Price:</span>
                                  <span className="text-xl font-bold text-green-900">AED{(item.estimatedSellingPrice || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* New Purchase Summary */}
                        {selectedProject.boq_details?.boq_details?.new_purchase?.summary && (
                          <div className="mt-4 bg-white border-2 border-emerald-300 rounded-lg p-4">
                            <h4 className="font-bold text-emerald-900 mb-3 flex items-center gap-2">
                              <DocumentTextIcon className="w-4 h-4" />
                              New Purchase Summary
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-blue-700">Total Material Cost:</span>
                                <span className="font-bold text-blue-900">
                                  AED{(selectedProject.boq_details.boq_details.new_purchase.summary.total_material_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-green-700">Total Labour Cost:</span>
                                <span className="font-bold text-green-900">
                                  AED{(selectedProject.boq_details.boq_details.new_purchase.summary.total_labour_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between pt-2 mt-2 border-t-2 border-emerald-300">
                                <span className="text-emerald-900 font-bold">New Purchase Total:</span>
                                <span className="font-bold text-emerald-900">
                                  AED{(selectedProject.boq_details.boq_details.new_purchase.summary.total_cost || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Combined Cost Summary */}
                  <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-5 shadow-md">
                    <h3 className="font-bold text-blue-900 mb-4 text-lg flex items-center gap-2">
                      <DocumentTextIcon className="w-5 h-5" />
                      Combined Cost Summary
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-blue-700">Total Material Cost:</span>
                        <span className="font-bold text-blue-900">AED{(selectedProject.boq_details?.total_materials || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-700">Total Labour Cost:</span>
                        <span className="font-bold text-green-900">AED{(selectedProject.boq_details?.total_labour || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-700">Overhead ({selectedProject.boq_details?.overhead_percentage || 10}%):</span>
                        <span className="font-bold text-orange-900">
                          AED{(selectedProject.boq_details?.boq_details?.combined_summary?.total_material_cost && selectedProject.boq_details?.boq_details?.combined_summary?.total_labour_cost
                            ? ((selectedProject.boq_details.boq_details.combined_summary.total_material_cost + selectedProject.boq_details.boq_details.combined_summary.total_labour_cost) * ((selectedProject.boq_details?.overhead_percentage || 10) / 100))
                            : (((selectedProject.boq_details?.total_materials || 0) + (selectedProject.boq_details?.total_labour || 0)) * ((selectedProject.boq_details?.overhead_percentage || 10) / 100))
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-700">Profit Margin ({selectedProject.boq_details?.profit_margin_percentage || 15}%):</span>
                        <span className="font-bold text-orange-900">
                          AED{(selectedProject.boq_details?.boq_details?.combined_summary?.total_material_cost && selectedProject.boq_details?.boq_details?.combined_summary?.total_labour_cost
                            ? ((selectedProject.boq_details.boq_details.combined_summary.total_material_cost + selectedProject.boq_details.boq_details.combined_summary.total_labour_cost) * ((selectedProject.boq_details?.profit_margin_percentage || 15) / 100))
                            : (((selectedProject.boq_details?.total_materials || 0) + (selectedProject.boq_details?.total_labour || 0)) * ((selectedProject.boq_details?.profit_margin_percentage || 15) / 100))
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between pt-3 mt-3 border-t-2 border-blue-400">
                        <span className="text-blue-900 font-bold text-lg">Grand Total:</span>
                        <span className="font-bold text-blue-900 text-xl">AED{(selectedProject.boq_details?.total_cost || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Submitted by: Estimator on {formatDate(selectedProject.created_at)}
                    </div>

                    {/* Status Badge or Approve/Reject/Edit Buttons */}
                    <div className="flex items-center gap-3">
                      {selectedProject.boq_status?.toLowerCase() === 'approved' ? (
                        <>
                          <div className="px-6 py-2.5 bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-500 rounded-lg flex items-center gap-2">
                            <CheckCircleIcon className="w-5 h-5 text-green-600" />
                            <span className="font-semibold text-green-700">Approved</span>
                          </div>
                          {/* Show Request Extension button for assigned/active projects */}
                          {selectedProject.site_supervisor_id && selectedProject.status?.toLowerCase() !== 'completed' && (
                            <button
                              onClick={() => setShowDayExtensionModal(true)}
                              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-medium transition-all shadow-sm flex items-center gap-1.5 text-sm"
                            >
                              <CalendarIcon className="w-4 h-4" />
                              Request Extension
                            </button>
                          )}
                        </>
                      ) : selectedProject.boq_status?.toLowerCase() === 'rejected' ? (
                        <div className="px-6 py-2.5 bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-500 rounded-lg flex items-center gap-2">
                          <XMarkIcon className="w-5 h-5 text-red-600" />
                          <span className="font-semibold text-red-700">Rejected</span>
                        </div>
                      ) : selectedProject.boq_status?.toLowerCase() === 'assigned' ? (
                        <div className="px-6 py-2.5 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg flex items-center gap-2">
                          <UserPlusIcon className="w-5 h-5 text-blue-600" />
                          <span className="font-semibold text-blue-700">Assigned</span>
                        </div>
                      ) : selectedProject.boq_status?.toLowerCase() === 'completed' ? (
                        <div className="px-6 py-2.5 bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-500 rounded-lg flex items-center gap-2">
                          <CheckCircleIcon className="w-5 h-5 text-purple-600" />
                          <span className="font-semibold text-purple-700">Completed</span>
                        </div>
                      ) : (['pending', 'pending_pm_approval', 'draft', 'pending_revision', 'under_revision'].includes(selectedProject.boq_status?.toLowerCase() || '')) ? (
                        <>
                          <button
                            onClick={() => handleEditBOQ(selectedProject)}
                            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all shadow-sm flex items-center gap-1.5 text-sm"
                          >
                            <PencilIcon className="w-4 h-4" />
                            Edit BOQ
                          </button>
                          <button
                            onClick={async () => {
                              // Reload BOQ details before showing approve modal to ensure fresh data
                              if (selectedProject?.boq_id) {
                                await loadBOQDetails(selectedProject.boq_id);
                              }
                              setShowApproveModal(true);
                            }}
                            className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all shadow-sm flex items-center gap-1.5 text-sm"
                          >
                            <CheckCircleIcon className="w-4 h-4" />
                            Approve BOQ
                          </button>
                          <button
                            onClick={() => setShowDayExtensionModal(true)}
                            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-medium transition-all shadow-sm flex items-center gap-1.5 text-sm"
                          >
                            <CalendarIcon className="w-4 h-4" />
                            Request Extension
                          </button>
                        </>
                      ) : (
                        <div className="px-6 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-500 rounded-lg flex items-center gap-2">
                          <ClockIcon className="w-5 h-5 text-gray-600" />
                          <span className="font-semibold text-gray-700">{selectedProject.boq_status || 'Unknown'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Assign SE Modal - TD Style */}
      {showAssignModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="bg-blue-600 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/20 rounded-lg">
                    <UserPlusIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Assign Site Engineer</h2>
                    <p className="text-xs text-blue-100 mt-0.5">{selectedProject.project_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedSE(null);
                    setSeSearchQuery('');
                    setAssignMode('existing');
                  }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-50 border-b border-gray-200">
              <button
                onClick={() => setAssignMode('existing')}
                className={`flex-1 px-4 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  assignMode === 'existing'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                Select Existing SE
              </button>
              <button
                onClick={() => setAssignMode('create')}
                className={`flex-1 px-4 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  assignMode === 'create'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <UserPlusIcon className="w-3.5 h-3.5" />
                Create New SE
              </button>
            </div>

            {assignMode === 'existing' ? (
              <>
                {/* Search */}
                <div className="p-3 border-b border-gray-200">
                  <input
                    type="text"
                    placeholder="Search SE..."
                    value={seSearchQuery}
                    onChange={(e) => setSeSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* SE List */}
                <div className="p-3 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 280px)' }}>
                  {loadingSEs ? (
                    <div className="text-center py-12">
                      <ModernLoadingSpinners variant="pulse-wave" />
                    </div>
                  ) : filteredSEs.length === 0 ? (
                    <div className="text-center py-12">
                      <UserIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No site engineers found</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Online Users Section */}
                      {filteredSEs.filter(se => se.user_status === 'online').length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2 px-1">
                            <UserIcon className="w-4 h-4 text-green-600" />
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <h3 className="text-xs font-bold text-green-700 uppercase tracking-wide">Online</h3>
                            <div className="flex-1 h-px bg-green-200"></div>
                          </div>
                          <div className="space-y-2">
                            {filteredSEs.filter(se => se.user_status === 'online').map((se) => {
                              const isSelected = selectedSE?.user_id === se.user_id;
                              const projectCount = se.project_count || 0;
                              const isMaxCapacity = projectCount >= 2;

                              return (
                                <div
                                  key={se.user_id}
                                  onClick={() => !isMaxCapacity && setSelectedSE(se)}
                                  className={`border-2 rounded-lg p-2.5 transition-all ${
                                    isMaxCapacity
                                      ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-60'
                                      : isSelected
                                      ? 'border-blue-500 bg-blue-50 cursor-pointer'
                                      : 'border-gray-200 hover:border-gray-300 bg-white cursor-pointer'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 flex-1">
                                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                                        <span className="text-white font-bold text-sm">
                                          {se.sitesupervisor_name.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <p className="font-bold text-sm text-gray-900 truncate">{se.sitesupervisor_name}</p>
                                          {/* Online/Offline Status */}
                                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 flex items-center gap-1 bg-green-100 text-green-700">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                            Online
                                          </span>
                                          {/* Availability Status */}
                                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                                            isMaxCapacity
                                              ? 'bg-red-100 text-red-700'
                                              : projectCount > 0
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-green-100 text-green-700'
                                          }`}>
                                            {isMaxCapacity ? 'Busy' : projectCount > 0 ? 'Busy' : 'Available'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-600 mt-0.5">
                                          <span className="truncate">{se.email}</span>
                                          <span className="flex-shrink-0">{se.phone}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                                          <BuildingOfficeIcon className="w-3 h-3 flex-shrink-0" />
                                          <span>{projectCount}/2 projects</span>
                                          {se.projects && se.projects.length > 0 && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSEDetails(se);
                                                setShowSEDetailsModal(true);
                                              }}
                                              className="text-blue-600 hover:text-blue-800 underline"
                                            >
                                              View Projects
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                                      {/* Edit Icon */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingSE(se);
                                          setEditSEData({
                                            full_name: se.sitesupervisor_name,
                                            email: se.email || '',
                                            phone: se.phone || ''
                                          });
                                          setShowEditModal(true);
                                        }}
                                        className="p-1 sm:p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded transition-all"
                                        title="Edit Site Engineer"
                                      >
                                        <PencilIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      </button>
                                      {/* Delete Icon */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSeToDelete({
                                            id: se.user_id,
                                            name: se.sitesupervisor_name
                                          });
                                          setShowDeleteConfirm(true);
                                        }}
                                        className="p-1 sm:p-1.5 text-red-600 hover:text-red-700 hover:bg-red-100 rounded transition-all"
                                        title="Delete Site Engineer"
                                      >
                                        <XMarkIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      </button>
                                      {isSelected && !isMaxCapacity && (
                                        <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Offline Users Section */}
                      {filteredSEs.filter(se => se.user_status !== 'online').length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2 px-1">
                            <UserIcon className="w-4 h-4 text-gray-500" />
                            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Offline</h3>
                            <div className="flex-1 h-px bg-gray-200"></div>
                          </div>
                          <div className="space-y-2">
                            {filteredSEs.filter(se => se.user_status !== 'online').map((se) => {
                              const projectCount = se.project_count || 0;
                              const isMaxCapacity = projectCount >= 2;

                              return (
                                <div
                                  key={se.user_id}
                                  className="border-2 border-gray-200 bg-gray-50 rounded-lg p-2.5 cursor-not-allowed opacity-60"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 flex-1">
                                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center flex-shrink-0">
                                        <span className="text-white font-bold text-sm">
                                          {se.sitesupervisor_name.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <p className="font-bold text-sm text-gray-700 truncate">{se.sitesupervisor_name}</p>
                                          {/* Offline Status */}
                                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 flex items-center gap-1 bg-gray-200 text-gray-700">
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                            Offline
                                          </span>
                                          {/* Availability Status */}
                                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                                            isMaxCapacity
                                              ? 'bg-red-100 text-red-700'
                                              : projectCount > 0
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-green-100 text-green-700'
                                          }`}>
                                            {isMaxCapacity ? 'Busy' : projectCount > 0 ? 'Busy' : 'Available'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                                          <span className="truncate">{se.email}</span>
                                          <span className="flex-shrink-0">{se.phone}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                          <BuildingOfficeIcon className="w-3 h-3 flex-shrink-0" />
                                          <span>{projectCount}/2 projects</span>
                                          {se.projects && se.projects.length > 0 && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSEDetails(se);
                                                setShowSEDetailsModal(true);
                                              }}
                                              className="text-gray-500 hover:text-gray-700 underline"
                                            >
                                              View Projects
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                                      {/* Edit Icon */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingSE(se);
                                          setEditSEData({
                                            full_name: se.sitesupervisor_name,
                                            email: se.email || '',
                                            phone: se.phone || ''
                                          });
                                          setShowEditModal(true);
                                        }}
                                        className="p-1 sm:p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded transition-all"
                                        title="Edit Site Engineer"
                                      >
                                        <PencilIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      </button>
                                      {/* Delete Icon */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSeToDelete({
                                            id: se.user_id,
                                            name: se.sitesupervisor_name
                                          });
                                          setShowDeleteConfirm(true);
                                        }}
                                        className="p-1 sm:p-1.5 text-red-600 hover:text-red-700 hover:bg-red-100 rounded transition-all"
                                        title="Delete Site Engineer"
                                      >
                                        <XMarkIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Info Box */}
                <div className="p-2.5 bg-blue-50 border-t border-blue-200">
                  <div className="flex items-start gap-1.5">
                    <BuildingOfficeIcon className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] text-blue-900">
                      <p className="font-medium">Project Assignment Limit</p>
                      <p className="text-blue-700 mt-0.5">
                        Each Site Engineer can be assigned to a maximum of 2 projects. The assigned SE will gain full access to manage this project.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Buyer Selection (Optional) - COMMENTED OUT FOR NOW */}
                {/* <div className="px-3 py-3 border-t border-gray-200 bg-orange-50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                      Assign Buyer (Optional)
                    </h3>
                    {selectedBuyer && (
                      <button
                        onClick={() => setSelectedBuyer(null)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Search buyer..."
                    value={buyerSearchQuery}
                    onChange={(e) => setBuyerSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 mb-2"
                  />

                  <div className="max-h-32 overflow-y-auto space-y-1.5">
                    {availableBuyers
                      .filter(buyer =>
                        buyer.full_name.toLowerCase().includes(buyerSearchQuery.toLowerCase()) ||
                        buyer.email.toLowerCase().includes(buyerSearchQuery.toLowerCase())
                      )
                      .map((buyer) => (
                        <div
                          key={buyer.user_id}
                          onClick={() => setSelectedBuyer(buyer)}
                          className={`border-2 rounded-lg p-2 transition-all cursor-pointer ${
                            selectedBuyer?.user_id === buyer.user_id
                              ? 'border-orange-500 bg-orange-100'
                              : 'border-orange-200 hover:border-orange-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-xs">
                                {buyer.full_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-gray-900 truncate">{buyer.full_name}</p>
                              <p className="text-xs text-gray-600 truncate">{buyer.email}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    {availableBuyers.filter(buyer =>
                      buyer.full_name.toLowerCase().includes(buyerSearchQuery.toLowerCase()) ||
                      buyer.email.toLowerCase().includes(buyerSearchQuery.toLowerCase())
                    ).length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-3">No buyers found</p>
                    )}
                  </div>
                </div> */}

                {/* Footer - Fixed */}
                <div className="px-3 py-2.5 bg-white border-t border-gray-200 flex items-center justify-between gap-2 sticky bottom-0">
                  <button
                    onClick={() => {
                      setShowAssignModal(false);
                      setSelectedSE(null);
                      setSelectedBuyer(null);
                      setSeSearchQuery('');
                      setBuyerSearchQuery('');
                    }}
                    className="px-4 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssignSE}
                    disabled={!selectedSE || assigning}
                    className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                      selectedSE && !assigning
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {assigning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Assigning...
                      </>
                    ) : (
                      <>
                        <CheckIcon className="w-4 h-4" />
                        {selectedBuyer ? 'Assign SE & Buyer' : 'Confirm Assignment'}
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Create New SE Form */}
                <div className="p-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={newSEData.full_name}
                        onChange={(e) => setNewSEData({ ...newSEData, full_name: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter full name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={newSEData.email}
                        onChange={(e) => setNewSEData({ ...newSEData, email: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter email address"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone *
                      </label>
                      <input
                        type="tel"
                        value={newSEData.phone}
                        onChange={(e) => setNewSEData({ ...newSEData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowAssignModal(false);
                      setNewSEData({ full_name: '', email: '', phone: '' });
                      setAssignMode('existing');
                    }}
                    className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateSE}
                    disabled={creatingNewSE}
                    className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckIcon className="w-5 h-5" />
                    {creatingNewSE ? 'Creating...' : 'Create Site Engineer'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* SE Details Modal */}
      {showSEDetailsModal && selectedSEDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
          >
            <div className="bg-blue-600 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/20 rounded-lg">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Assigned Site Engineer</h2>
                    <p className="text-xs text-blue-100 mt-0.5">SE Details and Workload</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowSEDetailsModal(false);
                    setSelectedSEDetails(null);
                  }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4">
              {/* SE Info Card */}
              <div className="border-2 border-yellow-300 bg-yellow-50 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">
                      {selectedSEDetails.sitesupervisor_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <h3 className="text-base font-bold text-gray-900 truncate">{selectedSEDetails.sitesupervisor_name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                        selectedSEDetails.project_count >= 2
                          ? 'bg-red-200 text-red-800'
                          : selectedSEDetails.project_count > 0
                          ? 'bg-yellow-200 text-yellow-800'
                          : 'bg-green-200 text-green-800'
                      }`}>
                        {selectedSEDetails.project_count >= 2 ? 'Busy' : selectedSEDetails.project_count > 0 ? 'Busy' : 'Available'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 truncate">Email: {selectedSEDetails.email}</p>
                    <p className="text-xs text-gray-600">Phone: {selectedSEDetails.phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-gray-700 mb-2">
                  <BuildingOfficeIcon className="w-4 h-4" />
                  <span className="font-bold">{selectedSEDetails.project_count}</span>
                  <span>ongoing project{selectedSEDetails.project_count !== 1 ? 's' : ''} assigned</span>
                  {selectedSEDetails.completed_projects_count ? (
                    <span className="text-xs text-gray-500">
                      ({selectedSEDetails.completed_projects_count} completed)
                    </span>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">Workload Capacity</span>
                    <span className={`font-bold ${
                      selectedSEDetails.project_count >= 2
                        ? 'text-red-700'
                        : selectedSEDetails.project_count > 0
                        ? 'text-yellow-700'
                        : 'text-green-700'
                    }`}>
                      {(selectedSEDetails.project_count / 2 * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        selectedSEDetails.project_count >= 2
                          ? 'bg-gradient-to-r from-red-400 to-red-500'
                          : selectedSEDetails.project_count > 0
                          ? 'bg-gradient-to-r from-yellow-400 to-yellow-500'
                          : 'bg-gradient-to-r from-green-400 to-green-500'
                      }`}
                      style={{ width: `${(selectedSEDetails.project_count / 2 * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Assigned Projects */}
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <DocumentTextIcon className="w-4 h-4 text-gray-600" />
                  <h3 className="text-sm font-bold text-gray-900">Assigned Projects</h3>
                </div>

                <div className="space-y-1.5">
                  {selectedSEDetails.projects && selectedSEDetails.projects.length > 0 ? (
                    selectedSEDetails.projects.map((project) => (
                      <div key={project.project_id} className="bg-white border border-gray-200 rounded-lg p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <BuildingOfficeIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <p className="text-sm font-medium text-gray-900 truncate">{project.project_name}</p>
                          </div>
                          {project.status && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                              project.status.toLowerCase() === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {project.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500">No projects assigned</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  setShowSEDetailsModal(false);
                  setSelectedSEDetails(null);
                }}
                className="w-full py-2 text-sm bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create BOQ Modal */}
      <BOQCreationForm
        isOpen={showCreateBOQModal}
        onClose={() => {
          setShowCreateBOQModal(false);
          setSelectedProjectForBOQ(null);
        }}
        onSubmit={async () => {
          toast.success('Extra items added successfully!');
          setShowCreateBOQModal(false);
          const projectId = selectedProjectForBOQ?.project_id;
          setSelectedProjectForBOQ(null);

          // Reload all projects first
          await refetch();

          // If there was a BOQ modal open, reload its details
          if (selectedProject && selectedProject.boq_id) {
            await loadBOQDetails(selectedProject.boq_id);
          }
        }}
        selectedProject={selectedProjectForBOQ}
        hideBulkUpload={true}
        hideTemplate={true}
        isNewPurchase={true}
        existingBoqId={selectedProjectForBOQ?.boq_ids?.[0]}
      />

      {/* Complete Project Confirmation Modal */}
      {showCompleteModal && projectToComplete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowCompleteModal(false);
          setProjectToComplete(null);
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
          >
            {/* Header */}
            <div className={`bg-gradient-to-r ${
              projectToComplete.completion_requested
                ? 'from-orange-500 to-orange-600'
                : 'from-green-500 to-emerald-600'
            } px-4 py-3`}>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-full">
                  <CheckCircleIcon className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-base font-bold text-white">
                  {projectToComplete.completion_requested ? 'Approve Completion Request' : 'Complete Project'}
                </h2>
              </div>
            </div>

            {/* Content */}
            <div className="px-4 py-4">
              {projectToComplete.completion_requested && (
                <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-xs text-orange-800 font-medium">
                    Site Engineer has requested project completion
                  </p>
                </div>
              )}
              <p className="text-gray-700 text-sm mb-3">
                {projectToComplete.completion_requested
                  ? 'Approve completion request and mark this project as completed?'
                  : 'Mark this project as completed?'}
              </p>
              <div className="bg-blue-50 border-l-3 border-blue-500 rounded-r px-3 py-2">
                <p className="text-xs font-semibold text-blue-900">{projectToComplete.project_name}</p>
                <p className="text-xs text-blue-600">{projectToComplete.client || 'N/A'}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setProjectToComplete(null);
                }}
                disabled={completing}
                className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setCompleting(true);
                    await projectManagerService.updateProject(projectToComplete.project_id, { status: 'completed' });
                    toast.success(projectToComplete.completion_requested ? 'Completion request approved' : 'Project marked as completed');
                    setShowCompleteModal(false);
                    setProjectToComplete(null);
                    refetch();
                  } catch (error: any) {
                    console.error('Error completing project:', error);
                    toast.error(error?.response?.data?.error || 'Failed to complete project');
                  } finally {
                    setCompleting(false);
                  }
                }}
                disabled={completing}
                className={`px-4 py-2 bg-gradient-to-r ${
                  projectToComplete.completion_requested
                    ? 'from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800'
                    : 'from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                } text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-1.5 text-sm`}
              >
                {completing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    {projectToComplete.completion_requested ? 'Confirm Complete' : 'Complete'}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Request Extra Materials Modal - Removed, use Change Requests page instead */}
      {/* Note: The RequestExtraMaterialsModal has been removed.
          Users should now use the Change Requests page from the navigation menu
          to request extra sub-items for BOQ items. */}

      {/* Change Request Details Modal */}
      <ChangeRequestDetailsModal
        isOpen={showChangeRequestModal}
        onClose={() => {
          setShowChangeRequestModal(false);
          setSelectedChangeRequest(null);
        }}
        changeRequest={selectedChangeRequest}
        onApprove={async () => {
          if (selectedChangeRequest) {
            const response = await changeRequestService.approve(selectedChangeRequest.cr_id);
            if (response.success) {
              toast.success('Change request approved');
              setShowChangeRequestModal(false);
              setSelectedChangeRequest(null);
              if (selectedProject?.boq_id) {
                await loadBOQDetails(selectedProject.boq_id);
              }
            } else {
              toast.error(response.message || 'Failed to approve');
            }
          }
        }}
        onReject={async () => {
          if (selectedChangeRequest) {
            const reason = prompt('Please provide a reason for rejection:');
            if (!reason) return;

            const response = await changeRequestService.reject(selectedChangeRequest.cr_id, reason);
            if (response.success) {
              toast.success('Change request rejected');
              setShowChangeRequestModal(false);
              setSelectedChangeRequest(null);
              if (selectedProject?.boq_id) {
                await loadBOQDetails(selectedProject.boq_id);
              }
            } else {
              toast.error(response.message || 'Failed to reject');
            }
          }
        }}
        canApprove={selectedChangeRequest?.approval_required_from === 'project_manager' && selectedChangeRequest?.status !== 'approved' && selectedChangeRequest?.status !== 'rejected'}
      />

      {/* Reject BOQ Modal */}
      {showRejectModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-gradient-to-br from-red-50 to-red-100 px-6 py-4 border-b border-red-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500 rounded-lg">
                    <XMarkIcon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Reject BOQ</h3>
                </div>
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectionReason('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Please provide a detailed reason for rejecting this BOQ. This will be sent to the estimator.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter the reason for rejection..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  rows={4}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectionReason('');
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!rejectionReason.trim()) {
                      toast.error('Please provide a rejection reason');
                      return;
                    }

                    try {
                      setProcessingBOQ(true);
                      await projectManagerService.sendBOQToEstimator({
                        boq_id: selectedProject.boq_id,
                        boq_status: 'rejected',
                        rejection_reason: rejectionReason,
                      });

                      toast.success('BOQ rejected and sent to estimator');
                      setShowRejectModal(false);
                      setShowBOQModal(false);
                      setRejectionReason('');
                      refetch();
                    } catch (error: any) {
                      toast.error(error.response?.data?.error || 'Failed to reject BOQ');
                    } finally {
                      setProcessingBOQ(false);
                    }
                  }}
                  disabled={processingBOQ || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-medium transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingBOQ ? 'Rejecting...' : 'Reject BOQ'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Approve BOQ Modal */}
      {showApproveModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-gradient-to-br from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500 rounded-lg">
                    <CheckCircleIcon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Approve BOQ</h3>
                </div>
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setApprovalComments('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                You are about to approve this BOQ. You can optionally add comments that will be sent to the estimator.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comments (Optional)
                </label>
                <textarea
                  value={approvalComments}
                  onChange={(e) => setApprovalComments(e.target.value)}
                  placeholder="Add any comments or notes..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  rows={4}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setApprovalComments('');
                  }}
                  className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setShowRejectModal(true);
                  }}
                  disabled={processingBOQ}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-medium transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XMarkIcon className="w-5 h-5" />
                  Reject
                </button>
                <button
                  onClick={async () => {
                    try {
                      setProcessingBOQ(true);
                      await projectManagerService.sendBOQToEstimator({
                        boq_id: selectedProject.boq_id,
                        boq_status: 'approved',
                        comments: approvalComments || '',
                      });

                      toast.success('BOQ approved and sent to estimator');
                      setShowApproveModal(false);
                      setShowBOQModal(false);
                      setApprovalComments('');
                      refetch();
                    } catch (error: any) {
                      toast.error(error.response?.data?.error || 'Failed to approve BOQ');
                    } finally {
                      setProcessingBOQ(false);
                    }
                  }}
                  disabled={processingBOQ}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircleIcon className="w-5 h-5" />
                  {processingBOQ ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* BOQ Comparison Modal */}
      {showComparisonModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">BOQ Comparison - {selectedProject.project_name}</h2>
                  <p className="text-sm text-gray-600 mt-1">Compare what PM sees vs what Client will receive</p>
                </div>
                <button
                  onClick={() => setShowComparisonModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="grid grid-cols-2 gap-6">
                {/* Internal Version (What PM sees) */}
                <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1 bg-orange-500 text-white text-sm font-bold rounded-lg">INTERNAL VERSION</span>
                    <span className="text-sm text-gray-600">(What PM sees)</span>
                  </div>

                  <div className="space-y-3 mb-4">
                    {selectedProject.boqItems?.map((item, idx) => {
                      const materialTotal = item.materials?.reduce((sum, m) => sum + (m.amount || 0), 0) || 0;
                      const labourTotal = item.labour?.reduce((sum, l) => sum + (l.amount || 0), 0) || 0;

                      return (
                        <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                          <h4 className="font-semibold text-gray-900 mb-2">{idx + 1}. {item.description}</h4>

                          <div className="ml-2">
                            <div className="text-xs mb-2">
                              <p className="font-medium text-gray-700 mb-1">+ RAW MATERIALS</p>
                              <div className="ml-2 space-y-1">
                                {item.materials?.map((mat, i) => (
                                  <div key={i} className="flex justify-between text-gray-600">
                                    <span>{mat.name} ({mat.quantity} {mat.unit})</span>
                                    <span>AED{mat.amount?.toFixed(2) || '0.00'}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                                  <span>Total Materials:</span>
                                  <span>AED{materialTotal.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-xs">
                              <p className="font-medium text-gray-700 mb-1">+ LABOUR</p>
                              <div className="ml-2 space-y-1">
                                {item.labour?.map((lab, i) => (
                                  <div key={i} className="flex justify-between text-gray-600">
                                    <span>{lab.type} ({lab.quantity} {lab.unit})</span>
                                    <span>AED{lab.amount?.toFixed(2) || '0.00'}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                                  <span>Total Labour:</span>
                                  <span>AED{labourTotal.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cost Summary - Internal */}
                  <div className="bg-white rounded-lg shadow-sm border-2 border-orange-300 p-4">
                    <h3 className="font-bold text-gray-900 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Material Cost:</span>
                        <span className="font-semibold">AED{(selectedProject.boq_details?.total_materials || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Labour Cost:</span>
                        <span className="font-semibold">AED{(selectedProject.boq_details?.total_labour || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600">Base Cost:</span>
                        <span className="font-semibold">AED{((selectedProject.boq_details?.total_materials || 0) + (selectedProject.boq_details?.total_labour || 0)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between bg-orange-50 p-2 rounded">
                        <span className="text-orange-800 font-medium">Overhead ({selectedProject.boq_details?.overhead_percentage || 0}%):</span>
                        <span className="font-bold text-orange-800">AED{(((selectedProject.boq_details?.total_materials || 0) + (selectedProject.boq_details?.total_labour || 0)) * (selectedProject.boq_details?.overhead_percentage || 0) / 100).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between bg-orange-50 p-2 rounded">
                        <span className="text-orange-800 font-medium">Profit Margin ({selectedProject.boq_details?.profit_margin_percentage || 0}%):</span>
                        <span className="font-bold text-orange-800">AED{(((selectedProject.boq_details?.total_materials || 0) + (selectedProject.boq_details?.total_labour || 0)) * (selectedProject.boq_details?.profit_margin_percentage || 0) / 100).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-3 border-t-2 border-orange-300 mt-2">
                        <span className="text-lg font-bold text-gray-900">Total:</span>
                        <span className="text-lg font-bold text-green-600">AED{(selectedProject.boq_details?.total_cost || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Client Version (What Client sees) */}
                <div className="bg-blue-50/30 p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="px-3 py-1 bg-blue-100 border border-blue-300 rounded-lg">
                      <span className="text-sm font-bold text-blue-800">CLIENT VERSION</span>
                    </div>
                    <span className="text-xs text-gray-600">(What Client sees)</span>
                  </div>

                  {/* BOQ Items - Client */}
                  <div className="space-y-3 mb-4">
                    {selectedProject.boqItems?.map((item, idx) => {
                      const materialTotal = item.materials?.reduce((sum, m) => sum + (m.amount || 0), 0) || 0;
                      const labourTotal = item.labour?.reduce((sum, l) => sum + (l.amount || 0), 0) || 0;
                      const itemBaseCost = materialTotal + labourTotal;

                      // Calculate markup to include overhead and profit
                      const overheadPct = selectedProject.boq_details?.overhead_percentage || 0;
                      const profitPct = selectedProject.boq_details?.profit_margin_percentage || 0;
                      const totalMarkupPct = overheadPct + profitPct;
                      const itemTotal = itemBaseCost * (1 + totalMarkupPct / 100);

                      return (
                        <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                          <h4 className="font-semibold text-gray-900 mb-2">{idx + 1}. {item.description}</h4>

                          <div className="ml-2">
                            <div className="text-xs mb-2">
                              <p className="font-medium text-gray-700 mb-1">+ RAW MATERIALS</p>
                              <div className="ml-2 space-y-1">
                                {item.materials?.map((mat, i) => {
                                  const clientPrice = mat.amount * (1 + totalMarkupPct / 100);
                                  return (
                                    <div key={i} className="flex justify-between text-gray-600">
                                      <span>{mat.name} ({mat.quantity} {mat.unit})</span>
                                      <span>AED{clientPrice?.toFixed(2) || '0.00'}</span>
                                    </div>
                                  );
                                })}
                                <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                                  <span>Total Materials:</span>
                                  <span>AED{(materialTotal * (1 + totalMarkupPct / 100)).toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-xs">
                              <p className="font-medium text-gray-700 mb-1">+ LABOUR</p>
                              <div className="ml-2 space-y-1">
                                {item.labour?.map((lab, i) => {
                                  const clientPrice = lab.amount * (1 + totalMarkupPct / 100);
                                  return (
                                    <div key={i} className="flex justify-between text-gray-600">
                                      <span>{lab.type} ({lab.quantity} {lab.unit})</span>
                                      <span>AED{clientPrice?.toFixed(2) || '0.00'}</span>
                                    </div>
                                  );
                                })}
                                <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                                  <span>Total Labour:</span>
                                  <span>AED{(labourTotal * (1 + totalMarkupPct / 100)).toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cost Summary - Client */}
                  <div className="bg-white rounded-lg shadow-sm border-2 border-blue-300 p-4">
                    <h3 className="font-bold text-gray-900 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Material Cost:</span>
                        <span className="font-semibold">AED{(selectedProject.boq_details?.total_materials || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Labour Cost:</span>
                        <span className="font-semibold">AED{(selectedProject.boq_details?.total_labour || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-3 border-t-2 border-blue-300 mt-2">
                        <span className="text-lg font-bold text-gray-900">Total:</span>
                        <span className="text-lg font-bold text-blue-600">AED{(selectedProject.boq_details?.total_cost || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Key Difference:</strong> Internal version shows overhead & profit breakdown, Client version shows final price only
                </p>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setShowComparisonModal(false)}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setProcessingBOQ(true);
                    await projectManagerService.sendBOQToEstimator({
                      boq_id: selectedProject.boq_id,
                      boq_status: 'approved',
                      comments: approvalComments || '',
                    });

                    toast.success('BOQ approved and sent to estimator');
                    setShowComparisonModal(false);
                    setShowBOQModal(false);
                    setApprovalComments('');
                    refetch();
                  } catch (error: any) {
                    toast.error(error.response?.data?.error || 'Failed to approve BOQ');
                  } finally {
                    setProcessingBOQ(false);
                  }
                }}
                disabled={processingBOQ}
                className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircleIcon className="w-5 h-5" />
                {processingBOQ ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit BOQ Modal - Now using latest BOQCreationForm */}
      <BOQCreationForm
        isOpen={showEditBOQModal}
        onClose={() => {
          setShowEditBOQModal(false);
          setShowBOQModal(true);
        }}
        onSubmit={async (data: any) => {
          setShowEditBOQModal(false);
          toast.success('BOQ updated successfully');

          // Reload BOQ details to show updated data
          if (selectedProject?.boq_id) {
            await loadBOQDetails(selectedProject.boq_id);
          }

          // Refresh projects list in background
          refetch();

          // Reopen view modal with fresh data
          setShowBOQModal(true);
        }}
        editMode={true}
        selectedProject={selectedProject ? {
          project_id: selectedProject.project_id,
          project_name: selectedProject.project_name,
          client_name: selectedProject.client || '',
          location: selectedProject.location || '',
          area: selectedProject.area || '',
        } : null}
        existingBoqData={selectedProject && selectedProject.boq_id ? {
          boq_id: selectedProject.boq_id,
          boq_name: selectedProject.boq_name || '',
          project_id: selectedProject.project_id,
          // Don't pass items - let the form fetch full details via getBOQById
        } : undefined}
        hideTemplate={true}
      />

      {/* Edit Site Engineer Modal */}
      {showEditModal && editingSE && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
          >
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl">
              <h2 className="text-xl font-bold text-white">Edit Site Engineer</h2>
              <p className="text-sm text-blue-100 mt-1">Update details for {editingSE.sitesupervisor_name}</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                <input
                  type="text"
                  value={editSEData.full_name}
                  onChange={(e) => setEditSEData({ ...editSEData, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={editSEData.email}
                  onChange={(e) => setEditSEData({ ...editSEData, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
                <input
                  type="tel"
                  value={editSEData.phone}
                  onChange={(e) => setEditSEData({ ...editSEData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingSE(null);
                }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSE}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium transition-all shadow-md flex items-center gap-2"
              >
                <CheckIcon className="w-5 h-5" />
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && seToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
          >
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white bg-opacity-20 flex items-center justify-center">
                  <XMarkIcon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Delete Site Engineer</h2>
                  <p className="text-sm text-red-100 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-700 text-base">
                Are you sure you want to delete Site Engineer{' '}
                <span className="font-bold text-gray-900">"{seToDelete.name}"</span>?
              </p>
              <p className="text-sm text-gray-600 mt-3">
                This will permanently remove the user from the system.
              </p>
            </div>

            <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSeToDelete(null);
                }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSE}
                className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-medium transition-all shadow-md flex items-center gap-2"
              >
                <XMarkIcon className="w-5 h-5" />
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Day Extension Request Modal */}
      {showDayExtensionModal && selectedProject && (
        <DayExtensionRequestModal
          isOpen={showDayExtensionModal}
          onClose={() => setShowDayExtensionModal(false)}
          onSuccess={() => refetch()}
          boqId={selectedProject.boq_id || 0}
          projectName={selectedProject.project_name || selectedProject.projectName || 'Project'}
          currentDuration={selectedProject.duration_days}
          startDate={selectedProject.start_date}
          endDate={selectedProject.end_date}
        />
      )}
    </div>
  );
};

export default MyProjects;
