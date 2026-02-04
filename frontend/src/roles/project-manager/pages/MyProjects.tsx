import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { useAuthStore } from '@/store/authStore';
import { projectManagerService } from '../services/projectManagerService';
import { mepService } from '../services/mepService';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import BOQDetailsModal from '@/roles/estimator/components/BOQDetailsModal';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import { ArrowRight, UserCheck } from 'lucide-react';
import PendingRequestsSection from '@/components/boq/PendingRequestsSection';
import ApprovedExtraMaterialsSection from '@/components/boq/ApprovedExtraMaterialsSection';
import RejectedRequestsSection from '@/components/boq/RejectedRequestsSection';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';
import DayExtensionRequestModal from '../components/DayExtensionRequestModal';
import AssignItemToSEModal from '@/components/modals/AssignItemToSEModal';
import { API_BASE_URL } from '@/api/config';

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
  project_code?: string;
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
  boqItems?: BOQItem[];
  existingPurchaseItems?: BOQItem[];
  newPurchaseItems?: BOQItem[];
  boq_ids?: number[];
  completion_requested?: boolean;
  duration_days?: number;
  // Completion confirmation tracking
  total_se_assignments?: number;
  confirmed_completions?: number;
  // Day extension status
  hasPendingDayExtension?: boolean;
  pendingDayExtensionCount?: number;
  hasApprovedExtension?: boolean;
  // Item assignment tracking (from backend API response)
  total_boq_items?: number; // Total items in BOQ
  total_items_assigned?: number; // Items assigned to Site Engineers
  items_assigned?: string; // Formatted string "assigned/total" e.g. "1/2"
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

  // ROLE-AWARE: Determine page title based on URL path (for admin viewing different roles) or user role
  const currentPath = window.location.pathname;
  const isMEPRoute = currentPath.includes('/mep/');

  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const isUserMEP = userRoleLower === 'mep' || userRoleLower === 'mep supervisor' || userRoleLower === 'mep_supervisor';

  // Use route to determine page type (allows admin to view MEP projects page)
  const isMEP = isMEPRoute || isUserMEP;
  const pageTitle = isMEP ? 'My Projects (MEP Manager)' : 'My Projects';

  // Modal states - declared first to use in auto-refresh condition
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showEditBOQModal, setShowEditBOQModal] = useState(false);
  const [showFullScreenBOQ, setShowFullScreenBOQ] = useState(false);
  const [fullScreenBoqMode, setFullScreenBoqMode] = useState<'view' | 'edit'>('view');
  const [editingBoq, setEditingBoq] = useState<any>(null);
  const [isLoadingBoqForEdit, setIsLoadingBoqForEdit] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCreateBOQModal, setShowCreateBOQModal] = useState(false);
  const [showItemAssignmentModal, setShowItemAssignmentModal] = useState(false);
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([]);
  const [selectedItemsInfo, setSelectedItemsInfo] = useState<Array<{ item_code: string; description: string }>>([]);
  const [itemAssignmentRefreshTrigger, setItemAssignmentRefreshTrigger] = useState(0);

  // Tab filter state - must be declared before useProjectsAutoSync
  const [filterStatus, setFilterStatus] = useState<'for_approval' | 'pending' | 'assigned' | 'completed' | 'approved' | 'rejected'>('for_approval');
  const [tabCounts, setTabCounts] = useState({
    for_approval: 0,
    pending: 0,
    assigned: 0,
    approved: 0,
    rejected: 0,
    completed: 0
  });

  // Pause auto-refresh when any modal is open to prevent flickering during editing
  const isAnyModalOpen = showEditBOQModal || showAssignModal || showCreateBOQModal || showItemAssignmentModal;

  // Real-time auto-sync for projects - Use specific APIs for each tab
  const { data: projectsData, isLoading: loading, refetch } = useAutoSync({
    queryKey: ['pm-my-projects', filterStatus],
    fetchFn: async () => {
      let response: any;
      let dataList: any[] = [];

      // ROLE-AWARE: Use MEP service for MEP route or MEP role, PM service for PM route/role
      // Check URL path to handle admin viewing MEP routes
      const currentPath = window.location.pathname;
      const isMEPRoute = currentPath.includes('/mep/');
      const isMEP = isMEPRoute || userRole.toLowerCase() === 'mep';

      // Call specific API based on active tab
      switch (filterStatus) {
        case 'for_approval':
          response = isMEP
            ? await mepService.getMEPApprovalBOQs()
            : await projectManagerService.getPMApprovalBOQs();
          break;
        case 'pending':
          response = isMEP
            ? await mepService.getMEPPendingBOQs()
            : await projectManagerService.getPMPendingBOQs();
          break;
        case 'assigned':
          response = isMEP
            ? await mepService.getMEPAssignedProjects()
            : await projectManagerService.getPMAssignedProjects();
          break;
        case 'approved':
          response = isMEP
            ? await mepService.getMEPApprovedBOQs()
            : await projectManagerService.getPMApprovedBOQs();
          break;
        case 'rejected':
          response = isMEP
            ? await mepService.getMEPRejectedBOQs()
            : await projectManagerService.getPMRejectedBOQs();
          break;
        case 'completed':
          response = isMEP
            ? await mepService.getMEPCompletedProjects()
            : await projectManagerService.getPMCompletedProjects();
          break;
        default:
          response = isMEP
            ? await mepService.getMEPApprovalBOQs()
            : await projectManagerService.getPMApprovalBOQs();
      }

      dataList = response.data || [];

      // Update tab count for the current tab only (not all tabs)
      // The response should contain count information
      const currentCount = (response.data || []).length;
      setTabCounts(prevCounts => ({
        ...prevCounts,
        [filterStatus]: currentCount
      }));

      // Map ALL projects with unified data structure
      const enrichedProjects = dataList.map((item: any) => {
        const siteSupervisorId = item.site_supervisor_id || item.project_details?.site_supervisor_id;

        return {
          project_id: item.project_id,
          project_name: item.project_name,
          project_code: item.project_code,
          client: item.client,
          location: item.location,
          area: item.floor || item.area || item.working_hours,
          start_date: item.start_date,
          end_date: item.end_date,
          duration_days: item.duration_days,
          status: item.project_status || item.status,
          description: item.description,
          site_supervisor_id: siteSupervisorId,
          site_supervisor_name: item.site_supervisor_name || null,
          completion_requested: item.completion_requested === true,
          total_se_assignments: item.total_se_assignments || 0,
          confirmed_completions: item.confirmed_completions || 0,
          user_id: item.user_id || null,
          boq_id: item.boq_id,
          boq_name: item.boq_name,
          boq_status: item.boq_status,
          boq_details: undefined,
          created_at: item.created_at,
          total_boq_items: item.total_boq_items || 0,
          total_items_assigned: item.total_items_assigned || 0,
          items_assigned: item.items_assigned || '0/0',
          hasPendingDayExtension: item.has_pending_day_extension || item.hasPendingDayExtension || false,
          pendingDayExtensionCount: item.pending_day_extension_count || item.pendingDayExtensionCount || 0,
          hasApprovedExtension: item.has_approved_extension || item.hasApprovedExtension || false,
          last_pm_user_id: item.last_pm_user_id
        };
      });

      return enrichedProjects;
    },
    realtimeTables: ['boqs', 'projects', 'project_assignments'],
    staleTime: 30000, // 30 seconds
    enabled: !isAnyModalOpen // Disable auto-refresh when modal is open
  });

  const allProjects = useMemo(() => projectsData || [], [projectsData]);

  // No client-side filtering needed - each tab fetches its own filtered data from backend
  const projects = useMemo(() => allProjects, [allProjects]);

  // Other state variables
  const [availableSEs, setAvailableSEs] = useState<SiteEngineer[]>([]);
  const [loadingSEs, setLoadingSEs] = useState(false);
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
  // ✅ PERFORMANCE: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [seToDelete, setSeToDelete] = useState<{ id: number; name: string } | null>(null);

  // Completion confirmation tracking states
  const [showCompletionDetails, setShowCompletionDetails] = useState<number | null>(null);
  const [completionDetails, setCompletionDetails] = useState<any>(null);
  const [loadingCompletionDetails, setLoadingCompletionDetails] = useState(false);

  useEffect(() => {
    if (showAssignModal) {
      loadAvailableSEs();
      // loadAvailableBuyers(); // Removed - Buyer assignment not needed
    }
  }, [showAssignModal]);

  // Removed loadProjects - now handled by useProjectsAutoSync hook

  // ✅ LISTEN TO REAL-TIME UPDATES - This makes BOQs reload automatically when changes occur
  const boqUpdateTimestamp = useRealtimeUpdateStore(state => state.boqUpdateTimestamp);

  // Track if this is the initial mount to skip first render refetch
  const isInitialMount = useRef(true);

  // ✅ RELOAD data when real-time update is received (e.g., Estimator sends BOQ to PM)
  useEffect(() => {
    // Skip initial mount - useProjectsAutoSync already fetches on mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Silent reload without loading spinner when timestamp changes
    refetch().catch(err => console.error('Refetch error (non-critical):', err));
  }, [boqUpdateTimestamp, refetch]);

  // ✅ TRIGGER API CALL when tab (filterStatus) changes
  useEffect(() => {
    // Refetch data whenever the tab changes
    refetch().catch(err => console.error('Tab change refetch error:', err));
  }, [filterStatus, refetch]);

  // Fetch all tab counts once on component mount (not on every tab change)
  useEffect(() => {
    const fetchTabCounts = async () => {
      try {
        const currentPath = window.location.pathname;
        const isMEPRoute = currentPath.includes('/mep/');
        const isMEP = isMEPRoute || userRoleLower === 'mep' || userRoleLower === 'mep supervisor' || userRoleLower === 'mep_supervisor';

        // Fetch counts from all tabs in parallel (only once on mount)
        const [forApprovalRes, pendingRes, assignedRes, approvedRes, rejectedRes, completedRes] = await Promise.all([
          isMEP ? mepService.getMEPApprovalBOQs() : projectManagerService.getPMApprovalBOQs(),
          isMEP ? mepService.getMEPPendingBOQs() : projectManagerService.getPMPendingBOQs(),
          isMEP ? mepService.getMEPAssignedProjects() : projectManagerService.getPMAssignedProjects(),
          isMEP ? mepService.getMEPApprovedBOQs() : projectManagerService.getPMApprovedBOQs(),
          isMEP ? mepService.getMEPRejectedBOQs() : projectManagerService.getPMRejectedBOQs(),
          isMEP ? mepService.getMEPCompletedProjects() : projectManagerService.getPMCompletedProjects(),
        ]);

        // Update all tab counts at once
        setTabCounts({
          for_approval: (forApprovalRes.data || []).length,
          pending: (pendingRes.data || []).length,
          assigned: (assignedRes.data || []).length,
          approved: (approvedRes.data || []).length,
          rejected: (rejectedRes.data || []).length,
          completed: (completedRes.data || []).length,
        });
      } catch (error) {
        console.error('Error fetching tab counts:', error);
      }
    };

    fetchTabCounts();
  }, []); // Empty dependency array - run only once on mount

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
      showError('Failed to load site engineers');
    } finally {
      setLoadingSEs(false);
    }
  };

  const loadCompletionDetails = async (projectId: number) => {
    try {
      setLoadingCompletionDetails(true);
      const response = await projectManagerService.getProjectCompletionDetails(projectId);
      setCompletionDetails(response);
      setShowCompletionDetails(projectId);
    } catch (error) {
      console.error('Error loading completion details:', error);
      showError('Failed to load completion details');
    } finally {
      setLoadingCompletionDetails(false);
    }
  };

  const confirmSECompletion = async (projectId: number, seUserId: number) => {
    try {
      setCompleting(true);
      const response = await projectManagerService.confirmSECompletion(projectId, seUserId);
      if (response.success) {
        showSuccess(response.message || 'Completion confirmed successfully');
        if (response.project_completed) {
          showSuccess('Project automatically marked as complete!', {
            duration: 5000,
            icon: '🎉'
          });
        }
        // Reload completion details and project list
        await loadCompletionDetails(projectId);
        refetch();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to confirm completion';
      showError(errorMessage);
      console.error('Error confirming completion:', error);
    } finally {
      setCompleting(false);
    }
  };

  const loadAvailableBuyers = async () => {
    try {
      const API_URL = API_BASE_URL;
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
      showError('Failed to load buyers');
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

        setShowFullScreenBOQ(true);
        setFullScreenBoqMode('view');
      } else {
        showError('Failed to load BOQ details');
      }
    } catch (error) {
      console.error('Error loading BOQ details:', error);
      showError('Failed to load BOQ details');
    } finally {
      setLoadingBOQDetails(false);
    }
  };

  const handleCreateSE = async () => {
    if (!newSEData.full_name || !newSEData.email || !newSEData.phone) {
      showError('Please fill all required fields');
      return;
    }

    try {
      setCreatingNewSE(true);
      await projectManagerService.createSiteSupervisor({
        ...newSEData,
        project_ids: []
      });
      showSuccess('Site Engineer created successfully');
      setNewSEData({ full_name: '', email: '', phone: '' });
      await loadAvailableSEs();
      setAssignMode('existing');
    } catch (error: any) {
      console.error('Error creating SE:', error);
      showError(error?.response?.data?.error || 'Failed to create Site Engineer');
    } finally {
      setCreatingNewSE(false);
    }
  };

  const handleEditSE = async () => {
    if (!editingSE || !editSEData.full_name || !editSEData.email || !editSEData.phone) {
      showError('Please fill all required fields');
      return;
    }

    try {
      await projectManagerService.updateSiteSupervisor(editingSE.user_id, {
        full_name: editSEData.full_name,
        email: editSEData.email,
        phone: editSEData.phone
      });
      showSuccess('Site Engineer updated successfully');
      setShowEditModal(false);
      setEditingSE(null);
      await loadAvailableSEs();
    } catch (error: any) {
      console.error('Error updating SE:', error);
      showError(error?.response?.data?.error || 'Failed to update Site Engineer');
    }
  };

  const handleDeleteSE = async () => {
    if (!seToDelete) return;

    try {
      await projectManagerService.deleteSE(seToDelete.id);
      showSuccess('Site Engineer deleted successfully');
      setShowDeleteConfirm(false);
      setSeToDelete(null);
      loadAvailableSEs();
      refetch();
    } catch (error: any) {
      showError(error?.response?.data?.error || 'Failed to delete Site Engineer');
    }
  };

  const handleAssignSE = async () => {
    if (!selectedSE || !selectedProject) {
      showError('Please select a Site Engineer');
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

      showSuccess(assignmentMessage);
      setSelectedSE(null);
      setSelectedBuyer(null);
      setBuyerSearchQuery('');
      setShowAssignModal(false);
      await refetch();
      setFilterStatus('assigned');
    } catch (error: any) {
      console.error('Error assigning SE:', error);
      showError(error?.response?.data?.error || 'Failed to assign Site Engineer');
    } finally {
      setAssigning(false);
    }
  };

  const handleEditBOQ = (project: Project) => {
    setSelectedProject(project);
    setShowEditBOQModal(true);
    // BOQCreationForm will fetch full BOQ details using the boq_id from existingBoqData
  };

  // Item Assignment Handlers
  const handleAssignItems = (itemIndices: number[], itemsInfo: Array<{ item_code: string; description: string }>) => {
    setSelectedItemIndices(itemIndices);
    setSelectedItemsInfo(itemsInfo);
    setShowItemAssignmentModal(true);
  };

  const handleItemAssignmentSuccess = () => {
    setShowItemAssignmentModal(false);
    setItemAssignmentRefreshTrigger(prev => prev + 1);
    refetch();
    showSuccess('Items assigned successfully');
  };

  // Backend now handles tab filtering, so we only need to filter by search query
  const filteredProjects = projects.filter(project => {
    // Apply search filter only
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        project.project_name?.toLowerCase().includes(query) ||
        project.client?.toLowerCase().includes(query) ||
        project.location?.toLowerCase().includes(query) ||
        project.boq_name?.toLowerCase().includes(query);

      return matchesSearch;
    }

    // If no search query, return all projects (backend already filtered by tab)
    return true;
  });

  // ✅ PERFORMANCE: Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchQuery]);

  // ✅ PERFORMANCE: Paginated projects
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProjects.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProjects, currentPage, itemsPerPage]);

  // Tab counts are now managed via state and updated by API responses

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusBadge = (project: Project) => {
    // Check if items have been assigned to site engineers
    if (project.total_items_assigned && project.total_items_assigned > 0) {
      return {
        text: 'items_assigned',
        color: 'bg-blue-100 text-blue-700'
      };
    }

    // Check if there are items pending assignment
    // Items pending = total_boq_items - total_items_assigned
    const itemsPending = (project.total_boq_items || 0) - (project.total_items_assigned || 0);
    if (itemsPending > 0) {
      return {
        text: 'pending_assignment',
        color: 'bg-orange-100 text-orange-700'
      };
    }

    // Default to showing BOQ status (for top badge)
    return {
      text: project.boq_status,
      color: 'bg-blue-100 text-blue-700'
    };
  };

  const filteredSEs = availableSEs.filter(se =>
    se.sitesupervisor_name.toLowerCase().includes(seSearchQuery.toLowerCase()) ||
    se.email.toLowerCase().includes(seSearchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Loading overlay when loading BOQ for edit */}
      {isLoadingBoqForEdit && (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <ModernLoadingSpinners variant="pulse-wave" />
            <p className="mt-4 text-gray-600 font-medium">Loading BOQ for editing...</p>
          </div>
        </div>
      )}

      {!showFullScreenBOQ && (
        <>
          {/* Header - Match Estimator/TD Style */}
          <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
            <div className="max-w-7xl mx-auto px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                  <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
                </div>
                <h1 className={`text-2xl font-bold ${isMEP ? 'text-cyan-700' : 'text-[#243d8a]'}`}>
                  {pageTitle}
                </h1>
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
          <div className="flex items-start justify-start gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
            <button
              onClick={() => setFilterStatus('for_approval')}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                filterStatus === 'for_approval'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              For Approval ({tabCounts.for_approval})
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
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <ModernLoadingSpinners variant="pulse-wave" />
            </div>
          ) : paginatedProjects.length === 0 ? (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
              <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No projects in this category</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="space-y-4">
              {paginatedProjects.map((project, index) => (
              <motion.div
                key={project.project_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 relative"
              >
                {/* Floating Day Extension Request Indicator - Show only in 'assigned' tab */}
                {filterStatus === 'assigned' &&
                 (project.site_supervisor_id ||
                  (project.total_items_assigned && project.total_items_assigned > 0)) && (() => {
                  const hasRequests = project.hasPendingDayExtension;
                  const requestCount = project.pendingDayExtensionCount || 0;

                  return (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                      className="absolute -top-2 -right-2 z-10"
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProject(project);
                            setShowDayExtensionModal(true);
                          }}
                          className={`rounded-full p-2 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:scale-105 ${
                            hasRequests
                              ? 'bg-blue-500 text-white animate-pulse'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                          title={hasRequests ? `${requestCount} pending day extension request${requestCount > 1 ? 's' : ''}` : 'No pending day extension requests'}
                        >
                          <ClockIcon className="w-5 h-5" />
                        </button>
                        {hasRequests && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                          </span>
                        )}
                        {/* Tooltip on hover */}
                        <div className="absolute top-full right-0 mt-2 bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-[100]">
                          {hasRequests
                            ? `${requestCount} Day Extension Request${requestCount > 1 ? 's' : ''}`
                            : 'No Pending Requests'
                          }
                          <div className="absolute -top-1 right-3 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}

                <div className="p-6">
                  {/* Project Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{project.project_name}</h3>
                        {project.project_code && (
                          <span className="px-3 py-1.5 rounded-md text-sm font-bold bg-[#243d8a] text-white">
                            {project.project_code}
                          </span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(project).color} flex items-center gap-1`}>
                          <ClockIcon className="w-3 h-3" />
                          {getStatusBadge(project).text}
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
                            {/* Hide edit/delete buttons in Approved tab - view only */}
                            {filterStatus !== 'approved' && (
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
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          setSelectedProject(project);
                          if (project.boq_id) {
                            await loadBOQDetails(project.boq_id);
                            setFullScreenBoqMode('view');
                            setShowFullScreenBOQ(true);
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                        title="View Details"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>

                      {/* Show assign button for projects with approved BOQ (works in Pending and Assigned tabs, NOT in Approved tab) */}
                      {project.boq_id &&
                       project.user_id !== null &&
                       filterStatus !== 'approved' &&
                       (project.boq_status?.toLowerCase() === 'approved' ||
                        project.boq_status?.toLowerCase() === 'pm_approved' ||
                        project.boq_status?.toLowerCase() === 'client_confirmed' ||
                        project.boq_status?.toLowerCase() === 'items_assigned') && (() => {
                        // Check if all items are already assigned
                        const allItemsAssigned = project.total_boq_items &&
                                                project.total_items_assigned === project.total_boq_items;

                        return (
                          <button
                            onClick={() => {
                              if (allItemsAssigned) return; // Prevent click when all items assigned
                              setSelectedProject(project);
                              // Open modal with empty items array - modal will fetch items itself
                              setSelectedItemIndices([]);
                              setShowItemAssignmentModal(true);
                            }}
                            disabled={allItemsAssigned}
                            className={`p-2 rounded transition-all ${
                              allItemsAssigned
                                ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title={allItemsAssigned ? "All items already assigned" : "Assign Items to Site Engineer"}
                          >
                            <UserPlusIcon className="w-5 h-5" />
                          </button>
                        );
                      })()}
                      {/* Show completion confirmation tracking - hide in Approved tab */}
                      {filterStatus !== 'approved' &&
                       (project.site_supervisor_id ||
                        (project.total_items_assigned && project.total_items_assigned > 0)) &&
                       project.status?.toLowerCase() !== 'completed' && (
                        <div className="flex items-center gap-2">
                          {/* Confirmation counter badge - always show count */}
                          <button
                            onClick={() => loadCompletionDetails(project.project_id)}
                            className={`
                              px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-sm
                              ${project.total_se_assignments && project.confirmed_completions === project.total_se_assignments && project.total_se_assignments > 0
                                ? 'bg-green-100 text-green-700 border border-green-300'
                                : project.completion_requested
                                ? 'bg-orange-100 text-orange-700 border border-orange-300 animate-pulse'
                                : 'bg-gray-100 text-gray-700 border border-gray-300'
                              }
                            `}
                            title={project.completion_requested ? "Click to view completion details" : "Waiting for SE completion request"}
                          >
                            <span className="font-bold">
                              {project.confirmed_completions || 0}/{project.total_se_assignments || 0}
                            </span>
                            <span>confirmations</span>
                            {project.total_se_assignments && project.confirmed_completions === project.total_se_assignments && project.total_se_assignments > 0 && (
                              <CheckCircleIcon className="w-5 h-5 text-green-600" />
                            )}
                          </button>
                        </div>
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
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700 mb-1">Location</p>
                      <p className="text-lg font-bold text-blue-900">{project.location || 'N/A'}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs text-green-700 mb-1">Status</p>
                      <p className="text-lg font-bold text-green-900 capitalize">{project.status}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <p className="text-xs text-purple-700 mb-1">Start Date</p>
                      <p className="text-lg font-bold text-purple-900">
                        {project.start_date ? new Date(project.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs text-orange-700 mb-1 flex items-center gap-1">
                        End Date
                        {project.hasApprovedExtension && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">Extended</span>
                        )}
                      </p>
                      <p className="text-lg font-bold text-orange-900">
                        {project.end_date ? new Date(project.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                    {/* Item Assignment Count */}
                    {filterStatus === 'assigned' && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                        <p className="text-xs text-indigo-700 mb-1">Items Assigned</p>
                        <p className="text-lg font-bold text-indigo-900">
                          {project.items_assigned || `${project.total_items_assigned || 0}/${project.total_boq_items || 0}`}
                        </p>
                      </div>
                    )}
                    {filterStatus === 'pending' && (project.total_items || 0) > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-xs text-yellow-700 mb-1">Items Pending</p>
                        <p className="text-lg font-bold text-yellow-900">
                          {project.total_items || 0}
                        </p>
                      </div>
                    )}
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
                      Code
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    {filterStatus !== 'approved' && filterStatus !== 'completed' && filterStatus !== 'rejected' && (
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Site Engineer
                      </th>
                    )}
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedProjects.map((project) => (
                    <tr key={project.project_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-semibold text-black">
                          {project.project_code || '-'}
                        </span>
                      </td>
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
                          {project.boq_status}
                        </span>
                      </td>
                      {filterStatus !== 'approved' && filterStatus !== 'completed' && filterStatus !== 'rejected' && (
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          {project.total_se_assignments && project.total_se_assignments > 0 ? (
                            <button
                              onClick={() => loadCompletionDetails(project.project_id)}
                              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-md w-fit max-w-full hover:bg-purple-100 hover:border-purple-300 transition-all cursor-pointer"
                              title="Click to view site engineers"
                            >
                              <UserIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-600 flex-shrink-0" />
                              <span className="text-[10px] sm:text-xs font-medium text-purple-900 truncate">
                                {project.total_se_assignments} {project.total_se_assignments === 1 ? 'Site Engineer' : 'Site Engineers'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs sm:text-sm text-gray-400">Not assigned</span>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(project.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              setSelectedProject(project);
                              if (project.boq_id) {
                                await loadBOQDetails(project.boq_id);
                                setFullScreenBoqMode('view');
                                setShowFullScreenBOQ(true);
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                            title="View Details"
                          >
                            <EyeIcon className="w-5 h-5" />
                          </button>
                          {/* Hide assign button in Approved tab - view only */}
                          {!project.site_supervisor_id &&
                           project.user_id !== null &&
                           filterStatus !== 'approved' &&
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
                          {/* Hide completion confirmation in Approved tab - view only */}
                          {filterStatus !== 'approved' && project.site_supervisor_id && project.status?.toLowerCase() !== 'completed' && (
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

          {/* ✅ PERFORMANCE: Pagination Controls */}
          <div className="flex items-center justify-between bg-white border-t border-gray-200 rounded-b-lg p-4 mt-6">
            <div className="text-sm text-gray-600 font-medium">
              Showing {filteredProjects.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredProjects.length)} of {filteredProjects.length} projects
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: 'rgb(36, 61, 138)' }}
              >
                Previous
              </button>
              {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                    currentPage === page
                      ? 'border-[rgb(36,61,138)] bg-blue-50'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                  style={{ color: currentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: 'rgb(36, 61, 138)' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

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
                              const isMaxCapacity = projectCount >= 3;

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
                                          <span>{projectCount}/3 projects</span>
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
                              const isMaxCapacity = projectCount >= 3;

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
                                          <span>{projectCount}/3 projects</span>
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
                        Each Site Engineer can be assigned to a maximum of 3 projects. The assigned SE will gain full access to manage this project.
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
                        <ModernLoadingSpinners size="xs" />
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
          showSuccess('Extra items added successfully!');
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
                    showSuccess(projectToComplete.completion_requested ? 'Completion request approved' : 'Project marked as completed');
                    setShowCompleteModal(false);
                    setProjectToComplete(null);
                    refetch();
                  } catch (error: any) {
                    console.error('Error completing project:', error);
                    showError(error?.response?.data?.error || 'Failed to complete project');
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
                    <ModernLoadingSpinners size="xxs" />
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
              showSuccess('PO approved');
              setShowChangeRequestModal(false);
              setSelectedChangeRequest(null);
              if (selectedProject?.boq_id) {
                await loadBOQDetails(selectedProject.boq_id);
              }
            } else {
              showError(response.message || 'Failed to approve');
            }
          }
        }}
        onReject={async () => {
          if (selectedChangeRequest) {
            const reason = prompt('Please provide a reason for rejection:');
            if (!reason) return;

            const response = await changeRequestService.reject(selectedChangeRequest.cr_id, reason);
            if (response.success) {
              showSuccess('PO rejected');
              setShowChangeRequestModal(false);
              setSelectedChangeRequest(null);
              if (selectedProject?.boq_id) {
                await loadBOQDetails(selectedProject.boq_id);
              }
            } else {
              showError(response.message || 'Failed to reject');
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
                      showError('Please provide a rejection reason');
                      return;
                    }

                    setProcessingBOQ(true);

                    try {
                      const response = await projectManagerService.sendBOQToEstimator({
                        boq_id: selectedProject.boq_id,
                        boq_status: 'rejected',
                        rejection_reason: rejectionReason,
                      });

                      // Check backend response
                      if (!response || response.success === false) {
                        showError(response?.message || 'Failed to reject BOQ');
                        setProcessingBOQ(false);
                        return;
                      }

                      // Success - show toast and close modals
                      showSuccess(response.message || 'BOQ rejected and sent to estimator');

                      setShowRejectModal(false);
                      setRejectionReason('');
                      setProcessingBOQ(false);

                      // Immediately refetch data to update UI
                      await refetch();

                      // Trigger realtime update for other components (e.g., Estimator page)
                      useRealtimeUpdateStore.getState().triggerBOQUpdate();

                    } catch (error: any) {
                      console.error('Rejection error:', error);
                      setProcessingBOQ(false);
                      showError(error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to reject BOQ');
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
                  onClick={async () => {
                    setProcessingBOQ(true);

                    try {
                      const response = await projectManagerService.sendBOQToEstimator({
                        boq_id: selectedProject.boq_id,
                        boq_status: 'approved',
                        comments: approvalComments || '',
                      });

                      // Check backend response
                      if (!response || response.success === false) {
                        showError(response?.message || 'Failed to approve BOQ');
                        setProcessingBOQ(false);
                        return;
                      }

                      // Success - show toast and close modals
                      showSuccess(response.message || 'BOQ approved and sent to estimator');

                      setShowApproveModal(false);
                      setApprovalComments('');
                      setProcessingBOQ(false);

                      // Immediately refetch data to update UI
                      await refetch();

                      // Trigger realtime update for other components (e.g., Estimator page)
                      useRealtimeUpdateStore.getState().triggerBOQUpdate();

                    } catch (error: any) {
                      console.error('Approval error:', error);
                      setProcessingBOQ(false);
                      showError(error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to approve BOQ');
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
                        <div key={item.item_id || `item-${idx}`} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                          <h4 className="font-semibold text-gray-900 mb-2">{idx + 1}. {item.description}</h4>

                          <div className="ml-2">
                            <div className="text-xs mb-2">
                              <p className="font-medium text-gray-700 mb-1">+ RAW MATERIALS</p>
                              <div className="ml-2 space-y-1">
                                {item.materials?.map((mat) => (
                                  <div key={mat.material_id || mat.name} className="flex justify-between text-gray-600">
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
                                {item.labour?.map((lab) => (
                                  <div key={lab.labour_id || lab.type} className="flex justify-between text-gray-600">
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
                        <div key={item.item_id || `client-item-${idx}`} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                          <h4 className="font-semibold text-gray-900 mb-2">{idx + 1}. {item.description}</h4>

                          <div className="ml-2">
                            <div className="text-xs mb-2">
                              <p className="font-medium text-gray-700 mb-1">+ RAW MATERIALS</p>
                              <div className="ml-2 space-y-1">
                                {item.materials?.map((mat) => {
                                  const clientPrice = mat.amount * (1 + totalMarkupPct / 100);
                                  return (
                                    <div key={mat.material_id || mat.name} className="flex justify-between text-gray-600">
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
                                {item.labour?.map((lab) => {
                                  const clientPrice = lab.amount * (1 + totalMarkupPct / 100);
                                  return (
                                    <div key={lab.labour_id || lab.type} className="flex justify-between text-gray-600">
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

                    showSuccess('BOQ approved and sent to estimator');
                    setShowComparisonModal(false);
                    setApprovalComments('');
                    refetch();
                  } catch (error: any) {
                    showError(error.response?.data?.error || 'Failed to approve BOQ');
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
          setShowFullScreenBOQ(true);
          setFullScreenBoqMode('view');
        }}
        onSubmit={async (data: any) => {
          setShowEditBOQModal(false);
          showSuccess('BOQ updated successfully');

          // Reload BOQ details to show updated data
          if (selectedProject?.boq_id) {
            await loadBOQDetails(selectedProject.boq_id);
          }

          // Refresh projects list in background
          refetch();

          // Return to full-screen view
          setShowFullScreenBOQ(true);
          setFullScreenBoqMode('view');
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
        </>
      )}

      {/* Full Screen BOQ View */}
      {showFullScreenBOQ && selectedProject && fullScreenBoqMode === 'view' && (
        <BOQDetailsModal
          isOpen={showFullScreenBOQ}
          fullScreen={true}
          onClose={() => {
            setShowFullScreenBOQ(false);
            setSelectedProject(null);
          }}
          boq={{
            boq_id: selectedProject.boq_id,
            boq_name: selectedProject.projectName
          }}
          onEdit={selectedProject?.boq_status?.toLowerCase() === 'pending_pm_approval' || selectedProject?.boq_status?.toLowerCase() === 'pending' ? async () => {
            // Load full BOQ data and switch to full-screen edit mode (like Estimator)
            if (selectedProject?.boq_id) {
              setIsLoadingBoqForEdit(true);
              try {
                const result = await estimatorService.getBOQById(selectedProject.boq_id);
                if (result.success && result.data) {
                  setEditingBoq(result.data);
                  setFullScreenBoqMode('edit');
                  // Keep showFullScreenBOQ true to show the full-screen edit
                } else {
                  showError('Failed to load BOQ details for editing');
                }
              } catch (error) {
                console.error('Error loading BOQ for edit:', error);
                showError('Failed to load BOQ details');
              } finally {
                setIsLoadingBoqForEdit(false);
              }
            }
          } : undefined}
          onApprove={selectedProject?.boq_status?.toLowerCase() === 'pending_pm_approval' || selectedProject?.boq_status?.toLowerCase() === 'pending' ? async () => {
            if (selectedProject?.boq_id) {
              await loadBOQDetails(selectedProject.boq_id);
            }
            setShowApproveModal(true);
            setShowFullScreenBOQ(false);
          } : undefined}
          onReject={selectedProject?.boq_status?.toLowerCase() === 'pending_pm_approval' || selectedProject?.boq_status?.toLowerCase() === 'pending' ? () => {
            setShowRejectModal(true);
            setShowFullScreenBOQ(false);
          } : undefined}
          onRequestExtension={selectedProject?.boq_status?.toLowerCase() === 'approved' ? () => {
            setShowDayExtensionModal(true);
            setShowFullScreenBOQ(false);
          } : undefined}
        />
      )}

      {/* Full Screen BOQ Edit Mode - Same as Estimator */}
      {showFullScreenBOQ && fullScreenBoqMode === 'edit' && editingBoq && (
        <div className="w-full min-h-screen relative">
          {/* Header for Edit Mode */}
          <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
            <div className="max-w-7xl mx-auto px-6 py-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setFullScreenBoqMode('view');
                    setEditingBoq(null);
                  }}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ArrowRight className="w-6 h-6 text-gray-600 transform rotate-180" />
                </button>
                <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                  <PencilIcon className="w-6 h-6 text-blue-600" />
                </div>
                <h1 className="text-2xl font-bold text-[#243d8a]">Edit BOQ</h1>
              </div>
            </div>
          </div>

          {/* Custom wrapper to override modal styling for full-screen */}
          <style>{`
            .full-screen-boq-wrapper .fixed.inset-0.z-50 {
              position: relative !important;
              z-index: auto !important;
              min-height: 100vh !important;
            }
            .full-screen-boq-wrapper .fixed.inset-0 {
              position: relative !important;
              min-height: 100vh !important;
            }
            .full-screen-boq-wrapper .bg-black\\/50,
            .full-screen-boq-wrapper .bg-black\\/60 {
              display: none !important;
            }
            .full-screen-boq-wrapper .max-w-6xl,
            .full-screen-boq-wrapper .max-w-7xl {
              max-width: 100% !important;
              min-height: 100vh !important;
            }
            .full-screen-boq-wrapper .max-h-\\[90vh\\],
            .full-screen-boq-wrapper .max-h-\\[95vh\\] {
              max-height: none !important;
              min-height: 100vh !important;
            }
            .full-screen-boq-wrapper .rounded-xl,
            .full-screen-boq-wrapper .rounded-2xl {
              border-radius: 0 !important;
            }
            .full-screen-boq-wrapper > div > div:first-child {
              align-items: flex-start !important;
              min-height: 100vh !important;
              padding: 0 !important;
            }
            .full-screen-boq-wrapper > div > div:first-child > div:last-child {
              position: relative !important;
              margin: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              max-height: none !important;
              min-height: 100vh !important;
              box-shadow: none !important;
            }
            /* Hide internal form header - keep only main page header */
            .full-screen-boq-wrapper [class*="bg-gradient-to-r"][class*="border-b"][class*="border-blue-100"] {
              display: flex !important;
              justify-content: flex-end !important;
              background: transparent !important;
              border: none !important;
              padding: 1rem !important;
            }
            /* Hide the BOQ title and icon in header, but keep action buttons */
            .full-screen-boq-wrapper [class*="bg-gradient-to-r"][class*="border-b"] > div:first-child > div:first-child {
              display: none !important;
            }
            /* Hide the close (X) button in header */
            .full-screen-boq-wrapper [class*="bg-gradient-to-r"][class*="border-b"] button[title="Close"] {
              display: none !important;
            }
            /* Also hide by direct structure - flex-shrink-0 for form headers */
            .full-screen-boq-wrapper .flex-shrink-0:first-of-type:not([aria-label="Drag to reorder"]) {
              display: none !important;
            }
            /* Hide the close (X) button in top-right corner for forms */
            .full-screen-boq-wrapper button.absolute[class*="top-4"][class*="right-4"] {
              display: none !important;
            }
            .full-screen-boq-wrapper [aria-label="Close dialog"] {
              display: none !important;
            }
            /* Ensure content fills full height */
            .full-screen-boq-wrapper .overflow-y-auto {
              padding-top: 0 !important;
              min-height: 100vh !important;
            }
            /* Make wrapper fill height */
            .full-screen-boq-wrapper {
              min-height: 100vh !important;
            }
          `}</style>

          <div className="full-screen-boq-wrapper">
            <BOQCreationForm
              isOpen={true}
              onClose={() => {
                setFullScreenBoqMode('view');
                setEditingBoq(null);
              }}
              editMode={true}
              existingBoqData={editingBoq}
              selectedProject={editingBoq?.project ? {
                project_id: editingBoq.project.project_id || editingBoq.project_id,
                project_name: editingBoq.project.name || editingBoq.project.project_name || '',
                client_name: editingBoq.project.client || '',
                location: editingBoq.project.location || '',
                area: editingBoq.project.area || '',
              } : selectedProject ? {
                project_id: selectedProject.project_id,
                project_name: selectedProject.project_name,
                client_name: selectedProject.client || '',
                location: selectedProject.location || '',
                area: selectedProject.area || '',
              } : null}
              onSubmit={async (boqId) => {
                const savedBoqId = boqId || editingBoq?.boq_id;

                showSuccess('BOQ updated successfully');

                // Reload BOQ details to show updated data
                if (savedBoqId) {
                  await loadBOQDetails(savedBoqId);
                }

                // Refresh projects list
                refetch();

                // Clear edit state and go back to view mode
                setEditingBoq(null);
                setFullScreenBoqMode('view');
              }}
              hideTemplate={true}
            />
          </div>
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

      {/* Item Assignment Modal */}
      {showItemAssignmentModal && selectedProject && (
        <AssignItemToSEModal
          isOpen={showItemAssignmentModal}
          onClose={() => setShowItemAssignmentModal(false)}
          boqId={selectedProject.boq_id || 0}
          boqName={selectedProject.boq_name || `BOQ-${selectedProject.boq_id}`}
          projectName={selectedProject.project_name || selectedProject.project_name || 'Project'}
          selectedItemIndices={selectedItemIndices}
          onSuccess={handleItemAssignmentSuccess}
        />
      )}

      {/* Completion Details Modal */}
      {showCompletionDetails && completionDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Completion Confirmation Details</h2>
                  <p className="text-gray-600 mt-1">{completionDetails.project_name}</p>
                </div>
                <button
                  onClick={() => {
                    setShowCompletionDetails(null);
                    setCompletionDetails(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Summary Section */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-700">Confirmation Status</h3>
                  <span className={`px-4 py-2 rounded-lg font-bold ${
                    completionDetails.summary?.all_confirmed
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {completionDetails.confirmation_status}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-500">Total Assignments</p>
                    <p className="text-xl font-bold text-gray-800">
                      {completionDetails.summary?.total_assignments || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-500">Confirmed</p>
                    <p className="text-xl font-bold text-green-600">
                      {completionDetails.summary?.confirmed_completions || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-500">Pending</p>
                    <p className="text-xl font-bold text-orange-600">
                      {completionDetails.summary?.pending_confirmations || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-500">Awaiting SE</p>
                    <p className="text-xl font-bold text-gray-600">
                      {completionDetails.summary?.awaiting_se_requests || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Assignment Details */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">PM-SE Assignment Details</h3>
                <div className="space-y-3">
                  {completionDetails.assignment_pairs?.map((pair: any, index: number) => (
                    <div key={pair.assignment_id || `${pair.pm_name}-${pair.se_name}`} className="bg-white border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-gray-800">{pair.pm_name}</span>
                            <ArrowRight className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-gray-800">{pair.se_name}</span>
                            <span className="text-sm text-gray-500">({pair.items_count} items)</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            {pair.completion_requested ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckIcon className="w-4 h-4" />
                                SE requested completion
                                {pair.request_date && (
                                  <span className="text-gray-500">
                                    on {new Date(pair.request_date).toLocaleDateString()}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-400">
                                Awaiting SE completion request
                              </span>
                            )}
                            {pair.pm_confirmed && (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircleIcon className="w-4 h-4" />
                                PM confirmed
                                {pair.confirmation_date && (
                                  <span className="text-gray-500">
                                    on {new Date(pair.confirmation_date).toLocaleDateString()}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          {pair.can_confirm && (
                            <button
                              onClick={() => confirmSECompletion(showCompletionDetails, pair.se_id)}
                              disabled={completing}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {completing ? 'Confirming...' : 'Confirm Complete'}
                            </button>
                          )}
                          {pair.completion_requested && !pair.pm_confirmed && !pair.can_confirm && (
                            <span className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm">
                              Awaiting {pair.pm_name}'s confirmation
                            </span>
                          )}
                          {pair.pm_confirmed && (
                            <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
                              <CheckCircleIcon className="w-5 h-5" />
                              Confirmed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-complete message */}
              {completionDetails.summary?.all_confirmed && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircleIcon className="w-6 h-6" />
                    <span className="font-semibold">
                      All confirmations received! Project has been automatically marked as complete.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ✅ PERFORMANCE FIX: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(MyProjects);
