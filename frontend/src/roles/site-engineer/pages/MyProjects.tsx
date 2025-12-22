import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  EyeIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  PlusIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { useAuthStore } from '@/store/authStore';
import { siteEngineerService } from '../services/siteEngineerService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import SimplifiedBOQView from '../components/SimplifiedBOQView';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import PendingRequestsSection from '@/components/boq/PendingRequestsSection';
import ApprovedExtraMaterialsSection from '@/components/boq/ApprovedExtraMaterialsSection';
import RejectedRequestsSection from '@/components/boq/RejectedRequestsSection';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import AssignBuyerModal from '@/components/sitesupervisor/AssignBuyerModal';

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
  totalLabourCost?: number;
  totalMaterialCost?: number;
  estimatedSellingPrice: number;
  selling_price?: number;
  base_cost?: number;
  overhead_percentage?: number;
  overhead_amount?: number;
  profit_margin_percentage?: number;
  profit_margin_amount?: number;
  discount_percentage?: number;
  discount_amount?: number;
  selling_price_before_discount?: number;
  vat_percentage?: number;
  vat_amount?: number;
  purchaseType?: 'existing' | 'new';
}

interface Project {
  project_id: number;
  project_name: string;
  project_code?: string;
  client?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  description?: string;
  created_at?: string;
  priority?: 'high' | 'medium' | 'low';
  boq_ids?: number[];
  boq_id?: number;
  boq_name?: string;
  boq_summary?: {
    total_cost: number;
    total_items: number;
    total_materials_cost: number;
    total_labour_cost: number;
  };
  completion_requested?: boolean;  // PROJECT-LEVEL: true if ANY SE requested
  my_completion_requested?: boolean;  // SE-SPECIFIC: true if THIS SE requested
  my_work_confirmed?: boolean;  // SE-specific: true if all SE's work is PM-confirmed
  items_assigned_to_me?: number;  // Count of items assigned to this SE by PM
  total_items?: number;  // Total items in project
  existingPurchaseItems?: BOQItem[];
  newPurchaseItems?: BOQItem[];
  boq_assigned_to_buyer?: boolean;
  assigned_buyer_name?: string;
  boqs_with_items?: Array<{
    boq_id: number;
    boq_name: string;
    items_count: number;
    assigned_items: any[];
  }>;
}

// Request Completion Modal Content Component
const RequestCompletionModalContent: React.FC<{
  project: Project;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ project, onClose, onSuccess }) => {
  const [validating, setValidating] = useState(true);
  const [validationData, setValidationData] = useState<any>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Check validation when modal opens
    const checkValidation = async () => {
      try {
        setValidating(true);
        await siteEngineerService.requestProjectCompletion(project.project_id);
        // If successful, no blocking items
        setValidationData({ canProceed: true, blocking_items: null });
      } catch (error: any) {
        const errorData = error?.response?.data;
        if (errorData?.blocking_items) {
          setValidationData({
            canProceed: false,
            blocking_items: errorData.blocking_items,
            message: errorData.message
          });
        } else {
          setValidationData({
            canProceed: false,
            error: errorData?.error || 'Failed to check completion status'
          });
        }
      } finally {
        setValidating(false);
      }
    };

    checkValidation();
  }, [project.project_id]);

  const handleSendRequest = async () => {
    try {
      setSending(true);
      await siteEngineerService.requestProjectCompletion(project.project_id);
      onSuccess();
    } catch (error: any) {
      showError(error?.response?.data?.error || 'Failed to send request');
    } finally {
      setSending(false);
    }
  };

  const purchases = validationData?.blocking_items?.purchases || [];
  const returns = validationData?.blocking_items?.returns || [];
  const canProceed = validationData?.canProceed === true;

  return (
    <>
      {/* Content */}
      <div className="px-4 py-4">
        {validating ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-3 border-[#243d8a] border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-gray-600 text-sm">Checking validation...</span>
          </div>
        ) : (
          <>
            {canProceed ? (
              <>
                <p className="text-gray-700 text-sm mb-3">
                  Request Project Manager to mark this project as completed?
                </p>
                <div className="bg-[#243d8a]/5 border-l-4 border-[#243d8a] rounded-r px-3 py-2">
                  <p className="text-xs font-semibold text-[#243d8a]">{project.project_name}</p>
                  <p className="text-xs text-gray-700">{project.client || 'N/A'}</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-red-50 border-l-4 border-red-500 rounded-r px-4 py-3 mb-4">
                  <div className="flex items-start">
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-red-800 text-sm">Cannot Request Completion</h3>
                      <p className="text-red-700 text-xs mt-1">
                        Please complete all purchases and asset returns before requesting project completion.
                      </p>
                    </div>
                  </div>
                </div>

                {purchases.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      Incomplete Purchases ({purchases.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {purchases.map((p: any, idx: number) => (
                        <div key={idx} className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-xs font-medium text-gray-900">{p.item_name}</p>
                              <p className="text-xs text-gray-600 mt-0.5">Status: <span className="font-medium">{p.status}</span></p>
                              <p className="text-xs text-gray-600">Requested by: {p.requested_by}</p>
                            </div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {returns.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      Incomplete Returns ({returns.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {returns.map((r: any, idx: number) => (
                        <div key={idx} className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-xs font-medium text-gray-900">{r.category}</p>
                              <p className="text-xs text-gray-600 mt-0.5">Quantity: {r.quantity}</p>
                            </div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {r.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={sending || validating}
          className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {canProceed ? 'Cancel' : 'Close'}
        </button>
        {canProceed && (
          <button
            onClick={handleSendRequest}
            disabled={sending || validating}
            className="px-4 py-2 bg-[#243d8a] hover:bg-[#1e3270] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-1.5 text-sm"
          >
            {sending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Sending...
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-4 h-4" />
                Send Request
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
};

const MyProjects: React.FC = () => {
  const { user } = useAuthStore();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ongoing' | 'completed'>('ongoing');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [projectDetails, setProjectDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showCreateBOQModal, setShowCreateBOQModal] = useState(false);
  const [selectedProjectForBOQ, setSelectedProjectForBOQ] = useState<Project | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [projectToRequest, setProjectToRequest] = useState<Project | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [validationData, setValidationData] = useState<any>(null);
  const [checkingValidation, setCheckingValidation] = useState(false);
  const [pendingChangeRequests, setPendingChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [approvedChangeRequests, setApprovedChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [rejectedChangeRequests, setRejectedChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [selectedChangeRequestId, setSelectedChangeRequestId] = useState<number | null>(null);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [showAssignBuyerModal, setShowAssignBuyerModal] = useState(false);
  const [projectToAssign, setProjectToAssign] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // ✅ PERFORMANCE: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Real-time auto-sync for projects
  const { data: projectsData, isLoading: loading, refetch } = useProjectsAutoSync(
    async () => {
      const response = await siteEngineerService.getMyProjects();
      const projectsList = response.projects || [];

      if (projectsList.length === 0) {
        showInfo('No projects assigned yet');
      }

      return projectsList;
    }
  );

  const projects = useMemo(() => projectsData || [], [projectsData]);

  const handleViewProject = async (project: Project) => {
    try {
      setSelectedProject(project);
      setShowDetailsModal(true);
      setLoadingDetails(true);

      // Get the first BOQ ID from the project's boq_ids array
      if (!project.boq_ids || project.boq_ids.length === 0) {
        showError('No BOQ found for this project');
        setShowDetailsModal(false);
        return;
      }

      const boqId = project.boq_ids[0]; // Get the first BOQ ID
      const details = await siteEngineerService.getProjectDetails(boqId);

      // Helper function to process item
      const processItem = (item: any, purchaseType: 'existing' | 'new'): BOQItem => ({
        id: item.master_item_id || item.id,
        description: item.item_name || item.description || item.item_description,
        briefDescription: item.brief_description || item.description,
        unit: 'unit',
        quantity: 1,
        rate: item.base_cost || item.rate || 0,
        amount: item.total_cost || item.amount || 0,
        materials: item.materials?.map((mat: any) => ({
          name: mat.material_name,
          quantity: mat.quantity,
          unit: mat.unit,
          rate: mat.unit_price,
          amount: mat.total_price
        })) || [],
        labour: item.labour?.map((lab: any) => ({
          type: lab.labour_role,
          quantity: lab.hours,
          unit: 'hours',
          rate: lab.rate_per_hour,
          amount: lab.total_cost
        })) || [],
        laborCost: item.totalLabourCost || item.labor_cost || 0,
        totalLabourCost: item.totalLabourCost,
        totalMaterialCost: item.totalMaterialCost,
        estimatedSellingPrice: item.selling_price || item.estimatedSellingPrice || item.estimated_selling_price || item.amount,
        selling_price: item.selling_price,
        base_cost: item.base_cost,
        overhead_percentage: item.overhead_percentage,
        overhead_amount: item.overhead_amount,
        profit_margin_percentage: item.profit_margin_percentage,
        profit_margin_amount: item.profit_margin_amount,
        discount_percentage: item.discount_percentage,
        discount_amount: item.discount_amount,
        selling_price_before_discount: item.selling_price_before_discount,
        vat_percentage: item.vat_percentage,
        vat_amount: item.vat_amount,
        purchaseType
      });

      // Process existing purchase items
      const existingItems: BOQItem[] = details.existing_purchase?.items?.map((item: any) =>
        processItem(item, 'existing')
      ) || [];

      // Process new purchase items - combine from new_purchase.items AND root items array
      let newItems: BOQItem[] = [];

      // Add items from new_purchase section
      if (details.new_purchase?.items) {
        newItems = details.new_purchase.items.map((item: any) => processItem(item, 'new'));
      }

      // Also check root items array for additional new purchases (when multiple new purchases are added)
      if (details.items && Array.isArray(details.items)) {
        const rootNewItems = details.items
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

      // Update project details with separated items
      setProjectDetails({
        ...details,
        existingPurchaseItems: existingItems,
        newPurchaseItems: newItems
      });

      // Update selected project
      setSelectedProject({
        ...project,
        boq_id: boqId,
        boq_name: details.boq_name || `BOQ-${boqId}`,
        existingPurchaseItems: existingItems,
        newPurchaseItems: newItems
      });

      // Load change requests for this BOQ - DISABLED for SE role
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
    } catch (error: any) {
      console.error('Error loading project details:', error);
      showError(error?.response?.data?.error || 'Failed to load project details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseModal = () => {
    setShowDetailsModal(false);
    setSelectedProject(null);
    setProjectDetails(null);
  };

  const filteredProjects = projects.filter(project => {
    const statusLower = project.status?.toLowerCase();
    let statusMatch = false;

    if (filterStatus === 'ongoing') {
      statusMatch = statusLower === 'in_progress' ||
                   statusLower === 'active' ||
                   statusLower === 'assigned' ||
                   statusLower === 'pending' ||
                   statusLower === 'items_assigned';
    }
    if (filterStatus === 'completed') {
      statusMatch = statusLower === 'completed';
    }

    // Search filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      const searchMatch = project.project_name?.toLowerCase().includes(query) ||
                         project.client?.toLowerCase().includes(query) ||
                         project.location?.toLowerCase().includes(query) ||
                         project.description?.toLowerCase().includes(query);
      return statusMatch && searchMatch;
    }

    return statusMatch;
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

  const getTabCounts = () => ({
    ongoing: projects.filter(p => {
      const statusLower = p.status?.toLowerCase();
      return statusLower === 'in_progress' ||
             statusLower === 'active' ||
             statusLower === 'assigned' ||
             statusLower === 'pending' ||
             statusLower === 'items_assigned';
    }).length,
    completed: projects.filter(p => p.status?.toLowerCase() === 'completed').length
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

  const getStatusBadge = (status?: string) => {
    const statusLower = status?.toLowerCase();
    if (statusLower === 'assigned' || statusLower === 'pending') {
      return (
        <span className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-red-100 text-red-700 flex items-center gap-0.5 sm:gap-1">
          <ClockIcon className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
          Assigned
        </span>
      );
    }
    if (statusLower === 'in_progress' || statusLower === 'active' || statusLower === 'items_assigned') {
      return (
        <span className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-indigo-100 text-indigo-700 flex items-center gap-0.5 sm:gap-1">
          <ClockIcon className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
          Ongoing
        </span>
      );
    }
    if (statusLower === 'completed') {
      return (
        <span className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-green-100 text-green-700 flex items-center gap-0.5 sm:gap-1">
          <CheckCircleIcon className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
          Completed
        </span>
      );
    }
    return (
      <span className="px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-700">
        {status || 'Unknown'}
      </span>
    );
  };

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
      {/* Header - Red Soft Gradient */}
      <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
                <BuildingOfficeIcon className="w-5 sm:w-6 h-5 sm:h-6 text-red-600" />
              </div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900">My Projects</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Filters and Search - TD Style */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          {/* Tabs - TD Style */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 inline-flex gap-1 w-full sm:w-auto">
            <button
              onClick={() => setFilterStatus('ongoing')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all ${
                filterStatus === 'ongoing'
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Ongoing ({tabCounts.ongoing})
            </button>

            <button
              onClick={() => setFilterStatus('completed')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all ${
                filterStatus === 'completed'
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Completed ({tabCounts.completed})
            </button>
          </div>

          {/* Search - TD Style */}
          <div className="relative w-full sm:w-auto sm:min-w-[250px] lg:min-w-[300px]">
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 pl-9 sm:pl-10 pr-3 sm:pr-4 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            <svg
              className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Projects List */}
        <div className="space-y-3 sm:space-y-4">
          {paginatedProjects.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-12 text-center">
              <BuildingOfficeIcon className="w-12 sm:w-16 h-12 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <p className="text-gray-500 text-base sm:text-lg">No projects in this category</p>
            </div>
          ) : (
            paginatedProjects.map((project, index) => (
              <motion.div
                key={project.project_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 cursor-pointer sm:cursor-default"
                onClick={() => {
                  // Only trigger on mobile (< 640px)
                  if (window.innerWidth < 640) {
                    handleViewProject(project);
                  }
                }}
              >
                <div className="p-3 sm:p-6">
                  {/* Project Header - Compact on mobile */}
                  <div className="mb-3 sm:mb-4">
                    {/* Row 1: Project name, code, eye icon, and action buttons */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                        <h3 className="text-sm sm:text-xl font-bold text-gray-900 truncate">{project.project_name}</h3>
                        {project.project_code && (
                          <span className="px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded text-[10px] sm:text-sm font-bold bg-[#243d8a] text-white whitespace-nowrap flex-shrink-0">
                            {project.project_code}
                          </span>
                        )}
                      </div>
                      {/* Action buttons inline with title */}
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        {/* Eye icon hidden on mobile - card is clickable instead */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewProject(project);
                          }}
                          className="hidden sm:block p-2 text-[#243d8a] hover:bg-[#243d8a]/10 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <EyeIcon className="w-5 h-5" />
                        </button>
                        {!project.my_completion_requested && project.status?.toLowerCase() !== 'completed' && (project.items_assigned_to_me || 0) > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToRequest(project);
                              setShowRequestModal(true);
                            }}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#243d8a] hover:bg-[#1e3270] text-white rounded-md transition-colors flex items-center gap-1 text-[10px] sm:text-xs font-medium shadow-sm whitespace-nowrap"
                            title="Request Completion"
                          >
                            <CheckCircleIcon className="w-3 sm:w-4 h-3 sm:h-4" />
                            <span className="hidden sm:inline">Request</span> Completion
                          </button>
                        )}
                        {!project.my_completion_requested && project.status?.toLowerCase() !== 'completed' && (project.items_assigned_to_me || 0) === 0 && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-100 border border-gray-300 rounded-md flex items-center gap-1"
                            title="No items assigned yet - PM needs to assign items first"
                          >
                            <ClockIcon className="w-3 sm:w-4 h-3 sm:h-4 text-gray-500 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-medium text-gray-600">Awaiting Items</span>
                          </div>
                        )}
                        {project.my_completion_requested && !project.my_work_confirmed && project.status?.toLowerCase() !== 'completed' && (
                          <div onClick={(e) => e.stopPropagation()} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-yellow-100 border border-yellow-400 rounded-md flex items-center gap-1">
                            <ClockIcon className="w-3 sm:w-4 h-3 sm:h-4 text-yellow-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-bold text-yellow-900">Pending</span>
                          </div>
                        )}
                        {project.my_work_confirmed && project.status?.toLowerCase() !== 'completed' && (
                          <div onClick={(e) => e.stopPropagation()} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-green-100 border border-green-400 rounded-md flex items-center gap-1">
                            <CheckCircleIcon className="w-3 sm:w-4 h-3 sm:h-4 text-green-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-bold text-green-900">Confirmed</span>
                          </div>
                        )}
                        {project.status?.toLowerCase() === 'completed' && (
                          <div onClick={(e) => e.stopPropagation()} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-green-100 border border-green-400 rounded-md flex items-center gap-1">
                            <CheckCircleIcon className="w-3 sm:w-4 h-3 sm:h-4 text-green-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-bold text-green-900">Done</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Row 2: Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                      <span className={`px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap ${getPriorityColor(project.priority)}`}>
                        {project.priority || 'medium'}
                      </span>
                      {getStatusBadge(project.status)}
                    </div>
                    {/* Row 3: Info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs sm:text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <BuildingOfficeIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">{project.client || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span>{formatDate(project.start_date)} - {formatDate(project.end_date)}</span>
                      </div>
                    </div>
                    {project.description && (
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 sm:mt-2 line-clamp-1 sm:line-clamp-2">{project.description}</p>
                    )}
                  </div>

                  {/* Project Stats - Compact grid */}
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded p-1.5 sm:p-3">
                      <p className="text-[8px] sm:text-xs text-blue-700 mb-0.5">Location</p>
                      <p className="text-[10px] sm:text-sm font-bold text-blue-900 truncate">{project.location || 'N/A'}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded p-1.5 sm:p-3">
                      <p className="text-[8px] sm:text-xs text-green-700 mb-0.5">Status</p>
                      <p className="text-[10px] sm:text-sm font-bold text-green-900 capitalize truncate">{project.status || 'N/A'}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 rounded p-1.5 sm:p-3">
                      <p className="text-[8px] sm:text-xs text-indigo-700 mb-0.5">Start</p>
                      <p className="text-[10px] sm:text-sm font-bold text-indigo-900 truncate">{formatDate(project.start_date)}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded p-1.5 sm:p-3">
                      <p className="text-[8px] sm:text-xs text-red-700 mb-0.5">End</p>
                      <p className="text-[10px] sm:text-sm font-bold text-red-900 truncate">{formatDate(project.end_date)}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

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

      {/* BOQ Details Modal - Using simplified view for Site Engineer */}
      <SimplifiedBOQView
        isOpen={showDetailsModal}
        onClose={handleCloseModal}
        boq={selectedProject ? {
          boq_id: selectedProject.boq_id,
          boq_name: selectedProject.boq_name,
          project_name: selectedProject.project_name
        } : null}
        assignedItems={selectedProject?.boqs_with_items?.find(b => b.boq_id === selectedProject.boq_id)?.assigned_items || []}
      />

      {/* OLD Details Modal - REMOVED - Replaced with BOQDetailsModal */}
      {false && showDetailsModal && selectedProject && (
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
                    {projectDetails?.project_details?.client || selectedProject.client} • {projectDetails?.project_details?.location || selectedProject.location}
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Close"
                >
                  <XMarkIcon className="w-6 h-6 text-blue-900" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[75vh]">
              {loadingDetails ? (
                <div className="text-center py-12">
                  <ModernLoadingSpinners variant="pulse-wave" />
                </div>
              ) : (
                <>
                  {/* Pending Change Requests */}
                  <PendingRequestsSection
                    requests={pendingChangeRequests}
                    onViewDetails={(crId) => {
                      setSelectedChangeRequestId(crId);
                      setShowChangeRequestModal(true);
                    }}
                    onStatusUpdate={async () => {
                      if (selectedProject) {
                        await handleViewProject(selectedProject);
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
                    onViewDetails={(crId) => {
                      setSelectedChangeRequestId(crId);
                      setShowChangeRequestModal(true);
                    }}
                  />

                  {/* Existing Purchase Section */}
                  {projectDetails?.existingPurchaseItems && projectDetails.existingPurchaseItems.length > 0 && (
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-t-lg px-4 py-3 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5" />
                          Existing Purchase Items
                        </h3>
                        <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
                          {projectDetails.existingPurchaseItems.length} item{projectDetails.existingPurchaseItems.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="border-2 border-purple-200 rounded-b-lg p-4 bg-purple-50/30">
                        <div className="space-y-4">
                          {projectDetails.existingPurchaseItems.map((item, idx) => (
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
                                    Total Materials: AED{(item.totalMaterialCost || item.materials.reduce((sum, m) => sum + (m.amount || 0), 0)).toLocaleString()}
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
                                    Total Labour: AED{(item.totalLabourCost || item.laborCost || 0).toLocaleString()}
                                  </p>
                                </div>
                              )}

                              {/* Cost Breakdown */}
                              <div className="mb-3 bg-gray-50 border border-gray-300 rounded-lg p-3">
                                <p className="text-sm font-medium text-gray-900 mb-2">Cost Breakdown</p>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between text-gray-700">
                                    <span>Base Cost:</span>
                                    <span className="font-medium">AED{(item.base_cost || 0).toLocaleString()}</span>
                                  </div>
                                  {item.overhead_percentage !== undefined && (
                                    <div className="flex justify-between text-orange-700">
                                      <span>+ Overhead ({item.overhead_percentage}%):</span>
                                      <span className="font-medium">AED{(item.overhead_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.profit_margin_percentage !== undefined && (
                                    <div className="flex justify-between text-purple-700">
                                      <span>+ Profit Margin ({item.profit_margin_percentage}%):</span>
                                      <span className="font-medium">AED{(item.profit_margin_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.selling_price_before_discount && (
                                    <div className="flex justify-between text-gray-600 pt-1 border-t">
                                      <span>Price before Discount:</span>
                                      <span className="font-medium">AED{(item.selling_price_before_discount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.discount_percentage !== undefined && item.discount_percentage > 0 && (
                                    <div className="flex justify-between text-red-700">
                                      <span>- Discount ({item.discount_percentage}%):</span>
                                      <span className="font-medium">AED{(item.discount_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.vat_percentage !== undefined && item.vat_percentage > 0 && (
                                    <div className="flex justify-between text-indigo-700">
                                      <span>+ VAT ({item.vat_percentage}%):</span>
                                      <span className="font-medium">AED{(item.vat_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-green-900">Estimated Selling Price:</span>
                                  <span className="text-xl font-bold text-green-900">AED{(item.selling_price || item.estimatedSellingPrice || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Existing Purchase Summary */}
                        {projectDetails.existing_purchase?.summary && (
                          <div className="mt-4 bg-white border-2 border-purple-300 rounded-lg p-4">
                            <h4 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
                              <DocumentTextIcon className="w-4 h-4" />
                              Existing Purchase Summary
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-blue-700">Total Material Cost:</span>
                                <span className="font-bold text-blue-900">
                                  AED{(projectDetails.existing_purchase.summary.total_material_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-green-700">Total Labour Cost:</span>
                                <span className="font-bold text-green-900">
                                  AED{(projectDetails.existing_purchase.summary.total_labour_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between pt-2 mt-2 border-t-2 border-purple-300">
                                <span className="text-purple-900 font-bold">Existing Purchase Total:</span>
                                <span className="font-bold text-purple-900">
                                  AED{(projectDetails.existing_purchase.summary.total_cost || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* New Purchase Section */}
                  {projectDetails?.newPurchaseItems && projectDetails.newPurchaseItems.length > 0 && (
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-t-lg px-4 py-3 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5" />
                          New Purchase Items
                        </h3>
                        <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
                          {projectDetails.newPurchaseItems.length} item{projectDetails.newPurchaseItems.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="border-2 border-emerald-200 rounded-b-lg p-4 bg-emerald-50/30">
                        <div className="space-y-4">
                          {projectDetails.newPurchaseItems.map((item, idx) => (
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
                                    Total Materials: AED{(item.totalMaterialCost || item.materials.reduce((sum, m) => sum + (m.amount || 0), 0)).toLocaleString()}
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
                                    Total Labour: AED{(item.totalLabourCost || item.laborCost || 0).toLocaleString()}
                                  </p>
                                </div>
                              )}

                              {/* Cost Breakdown */}
                              <div className="mb-3 bg-gray-50 border border-gray-300 rounded-lg p-3">
                                <p className="text-sm font-medium text-gray-900 mb-2">Cost Breakdown</p>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between text-gray-700">
                                    <span>Base Cost:</span>
                                    <span className="font-medium">AED{(item.base_cost || 0).toLocaleString()}</span>
                                  </div>
                                  {item.overhead_percentage !== undefined && (
                                    <div className="flex justify-between text-orange-700">
                                      <span>+ Overhead ({item.overhead_percentage}%):</span>
                                      <span className="font-medium">AED{(item.overhead_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.profit_margin_percentage !== undefined && (
                                    <div className="flex justify-between text-purple-700">
                                      <span>+ Profit Margin ({item.profit_margin_percentage}%):</span>
                                      <span className="font-medium">AED{(item.profit_margin_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.selling_price_before_discount && (
                                    <div className="flex justify-between text-gray-600 pt-1 border-t">
                                      <span>Price before Discount:</span>
                                      <span className="font-medium">AED{(item.selling_price_before_discount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.discount_percentage !== undefined && item.discount_percentage > 0 && (
                                    <div className="flex justify-between text-red-700">
                                      <span>- Discount ({item.discount_percentage}%):</span>
                                      <span className="font-medium">AED{(item.discount_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {item.vat_percentage !== undefined && item.vat_percentage > 0 && (
                                    <div className="flex justify-between text-indigo-700">
                                      <span>+ VAT ({item.vat_percentage}%):</span>
                                      <span className="font-medium">AED{(item.vat_amount || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-green-900">Estimated Selling Price:</span>
                                  <span className="text-xl font-bold text-green-900">AED{(item.selling_price || item.estimatedSellingPrice || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* New Purchase Summary */}
                        {projectDetails.new_purchase?.summary && (
                          <div className="mt-4 bg-white border-2 border-emerald-300 rounded-lg p-4">
                            <h4 className="font-bold text-emerald-900 mb-3 flex items-center gap-2">
                              <DocumentTextIcon className="w-4 h-4" />
                              New Purchase Summary
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-blue-700">Total Material Cost:</span>
                                <span className="font-bold text-blue-900">
                                  AED{(projectDetails.new_purchase.summary.total_material_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-green-700">Total Labour Cost:</span>
                                <span className="font-bold text-green-900">
                                  AED{(projectDetails.new_purchase.summary.total_labour_cost || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between pt-2 mt-2 border-t-2 border-emerald-300">
                                <span className="text-emerald-900 font-bold">New Purchase Total:</span>
                                <span className="font-bold text-emerald-900">
                                  AED{(projectDetails.new_purchase.summary.total_cost || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Combined Cost Summary */}
                  {projectDetails?.combined_summary && (
                    <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-5 shadow-md">
                      <h3 className="font-bold text-blue-900 mb-4 text-lg flex items-center gap-2">
                        <DocumentTextIcon className="w-5 h-5" />
                        Combined Cost Summary
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-700">Total Material Cost:</span>
                          <span className="font-bold text-blue-900">AED{(projectDetails.combined_summary.total_material_cost || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-green-700">Total Labour Cost:</span>
                          <span className="font-bold text-green-900">AED{(projectDetails.combined_summary.total_labour_cost || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between pt-3 mt-3 border-t-2 border-blue-400">
                          <span className="text-blue-900 font-bold text-lg">Grand Total:</span>
                          <span className="font-bold text-blue-900 text-xl">AED{(projectDetails.combined_summary.total_cost || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 text-sm text-gray-600">
                    Submitted by: {projectDetails?.created_by || 'Estimator'} on {formatDate(projectDetails?.created_at)}
                  </div>
                </>
              )}
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
          const currentProject = selectedProjectForBOQ;
          setSelectedProjectForBOQ(null);

          // Reload all projects first
          await refetch();

          // If there was a details modal open, reload its details
          if (selectedProject && currentProject?.boq_ids?.[0]) {
            await handleViewProject(selectedProject);
          }
        }}
        selectedProject={selectedProjectForBOQ}
        hideBulkUpload={true}
        hideTemplate={true}
        isNewPurchase={true}
        existingBoqId={selectedProjectForBOQ?.boq_ids?.[0]}
      />

      {/* Request Completion Confirmation Modal */}
      {showRequestModal && projectToRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowRequestModal(false);
          setProjectToRequest(null);
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
            <div className="bg-[#243d8a] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-full">
                  <CheckCircleIcon className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-base font-bold text-white">Request Completion</h2>
              </div>
            </div>

            {/* Content */}
            <RequestCompletionModalContent
              project={projectToRequest}
              onClose={() => {
                setShowRequestModal(false);
                setProjectToRequest(null);
                setValidationData(null);
              }}
              onSuccess={() => {
                showSuccess('Completion request sent to Project Manager');
                setShowRequestModal(false);
                setProjectToRequest(null);
                setValidationData(null);
                refetch();
              }}
            />
          </motion.div>
        </div>
      )}

      {/* Request Extra Materials Modal - Removed, use Change Requests page instead */}
      {/* Note: The RequestExtraMaterialsModal has been removed.
          Users should now use the Change Requests page from the navigation menu
          to request extra sub-items for BOQ items. */}

      {/* Change Request Details Modal */}
      {selectedChangeRequestId && (
        <ChangeRequestDetailsModal
          isOpen={showChangeRequestModal}
          onClose={() => {
            setShowChangeRequestModal(false);
            setSelectedChangeRequestId(null);
          }}
          changeRequestId={selectedChangeRequestId}
          onStatusUpdate={async () => {
            setShowChangeRequestModal(false);
            setSelectedChangeRequestId(null);
            if (selectedProject) {
              await handleViewProject(selectedProject);
            }
          }}
        />
      )}

      {/* Assign to Buyer Modal */}
      {projectToAssign && (
        <AssignBuyerModal
          isOpen={showAssignBuyerModal}
          onClose={() => {
            setShowAssignBuyerModal(false);
            setProjectToAssign(null);
          }}
          boqId={projectToAssign.boq_ids?.[0] || 0}
          boqName={projectToAssign.boq_name}
          projectName={projectToAssign.project_name}
          onSuccess={() => {
            showSuccess('BOQ assigned to buyer successfully!');
            setShowAssignBuyerModal(false);
            setProjectToAssign(null);
            refetch();
          }}
        />
      )}
    </div>
  );
};

// ✅ PERFORMANCE FIX: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(MyProjects);
