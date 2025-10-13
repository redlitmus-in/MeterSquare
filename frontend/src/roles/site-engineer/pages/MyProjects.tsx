import React, { useState, useEffect } from 'react';
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
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { siteEngineerService } from '../services/siteEngineerService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import PendingRequestsSection from '@/components/boq/PendingRequestsSection';
import ApprovedExtraMaterialsSection from '@/components/boq/ApprovedExtraMaterialsSection';
import RejectedRequestsSection from '@/components/boq/RejectedRequestsSection';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';

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
  completion_requested?: boolean;
  existingPurchaseItems?: BOQItem[];
  newPurchaseItems?: BOQItem[];
}

const MyProjects: React.FC = () => {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
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
  // const [showRequestMaterialsModal, setShowRequestMaterialsModal] = useState(false); // Removed - use Change Requests page
  const [pendingChangeRequests, setPendingChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [approvedChangeRequests, setApprovedChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [rejectedChangeRequests, setRejectedChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [selectedChangeRequestId, setSelectedChangeRequestId] = useState<number | null>(null);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await siteEngineerService.getMyProjects();
      setProjects(response.projects || []);

      if (!response.projects || response.projects.length === 0) {
        toast.info('No projects assigned yet');
      }
    } catch (error: any) {
      console.error('Error loading projects:', error);
      toast.error(error?.response?.data?.error || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleViewProject = async (project: Project) => {
    try {
      setSelectedProject(project);
      setShowDetailsModal(true);
      setLoadingDetails(true);

      // Get the first BOQ ID from the project's boq_ids array
      if (!project.boq_ids || project.boq_ids.length === 0) {
        toast.error('No BOQ found for this project');
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
      toast.error(error?.response?.data?.error || 'Failed to load project details');
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
    if (filterStatus === 'ongoing') {
      return statusLower === 'in_progress' ||
             statusLower === 'active' ||
             statusLower === 'assigned' ||
             statusLower === 'pending';
    }
    if (filterStatus === 'completed') {
      return statusLower === 'completed';
    }
    return false;
  });

  const getTabCounts = () => ({
    ongoing: projects.filter(p => {
      const statusLower = p.status?.toLowerCase();
      return statusLower === 'in_progress' ||
             statusLower === 'active' ||
             statusLower === 'assigned' ||
             statusLower === 'pending';
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
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          Assigned
        </span>
      );
    }
    if (statusLower === 'in_progress' || statusLower === 'active') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          Ongoing
        </span>
      );
    }
    if (statusLower === 'completed') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
          <CheckCircleIcon className="w-3 h-3" />
          Completed
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
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
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
        </div>
      </div>

      {/* Tab Filters */}
      <div className="bg-gray-50 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setFilterStatus('ongoing')}
              className={`px-5 py-2 text-sm font-medium whitespace-nowrap transition-all rounded-lg ${
                filterStatus === 'ongoing'
                  ? 'bg-white text-purple-600 shadow-sm border-2 border-purple-200'
                  : 'bg-transparent text-gray-700 hover:bg-white/50'
              }`}
            >
              Ongoing ({tabCounts.ongoing})
            </button>

            <button
              onClick={() => setFilterStatus('completed')}
              className={`px-5 py-2 text-sm font-medium whitespace-nowrap transition-all rounded-lg ${
                filterStatus === 'completed'
                  ? 'bg-white text-green-600 shadow-sm border-2 border-green-200'
                  : 'bg-transparent text-gray-700 hover:bg-white/50'
              }`}
            >
              Completed ({tabCounts.completed})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Projects List */}
        <div className="space-y-4">
          {filteredProjects.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No projects in this category</p>
            </div>
          ) : (
            filteredProjects.map((project, index) => (
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
                          {project.priority || 'medium'} priority
                        </span>
                        {getStatusBadge(project.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <BuildingOfficeIcon className="w-4 h-4" />
                          <span>{project.client || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="w-4 h-4" />
                          <span>{formatDate(project.start_date)} - {formatDate(project.end_date)}</span>
                        </div>
                      </div>
                      {project.description && (
                        <p className="text-sm text-gray-600 mt-2">{project.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewProject(project)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                      {/* <button
                        onClick={() => {
                          setSelectedProjectForBOQ(project);
                          setShowCreateBOQModal(true);
                        }}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Create New BOQ"
                      >
                        <PlusIcon className="w-5 h-5" />
                      </button> */}
                      {!project.completion_requested && project.status?.toLowerCase() !== 'completed' && (
                        <button
                          onClick={() => {
                            setProjectToRequest(project);
                            setShowRequestModal(true);
                          }}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                          title="Request Completion"
                        >
                          <CheckCircleIcon className="w-5 h-5" />
                          Request Completion
                        </button>
                      )}
                      {project.completion_requested && project.status?.toLowerCase() !== 'completed' && (
                        <div className="px-4 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg flex items-center gap-2">
                          <ClockIcon className="w-5 h-5 text-yellow-600" />
                          <span className="text-sm font-bold text-yellow-900">Pending PM Approval</span>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700 mb-1">Location</p>
                      <p className="text-sm font-bold text-blue-900 truncate">{project.location || 'N/A'}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs text-green-700 mb-1">Status</p>
                      <p className="text-sm font-bold text-green-900 capitalize">{project.status || 'N/A'}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <p className="text-xs text-purple-700 mb-1">Start Date</p>
                      <p className="text-sm font-bold text-purple-900">{formatDate(project.start_date)}</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs text-orange-700 mb-1">End Date</p>
                      <p className="text-sm font-bold text-orange-900">{formatDate(project.end_date)}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedProject && (
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
          toast.success('Extra items added successfully!');
          setShowCreateBOQModal(false);
          const currentProject = selectedProjectForBOQ;
          setSelectedProjectForBOQ(null);

          // Reload all projects first
          await loadProjects();

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
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-full">
                  <CheckCircleIcon className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-base font-bold text-white">Request Completion</h2>
              </div>
            </div>

            {/* Content */}
            <div className="px-4 py-4">
              <p className="text-gray-700 text-sm mb-3">
                Request Project Manager to mark this project as completed?
              </p>
              <div className="bg-blue-50 border-l-3 border-blue-500 rounded-r px-3 py-2">
                <p className="text-xs font-semibold text-blue-900">{projectToRequest.project_name}</p>
                <p className="text-xs text-blue-600">{projectToRequest.client || 'N/A'}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  setProjectToRequest(null);
                }}
                disabled={requesting}
                className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setRequesting(true);
                    await siteEngineerService.requestProjectCompletion(projectToRequest.project_id);
                    toast.success('Completion request sent to Project Manager');
                    setShowRequestModal(false);
                    setProjectToRequest(null);
                    loadProjects();
                  } catch (error: any) {
                    console.error('Error requesting completion:', error);
                    toast.error(error?.response?.data?.error || 'Failed to send request');
                  } finally {
                    setRequesting(false);
                  }
                }}
                disabled={requesting}
                className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-1.5 text-sm"
              >
                {requesting ? (
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
            </div>
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
    </div>
  );
};

export default MyProjects;
