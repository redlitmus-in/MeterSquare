import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  CubeIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FunnelIcon,
  TableCellsIcon,
  Squares2X2Icon,
  PencilIcon,
  PaperAirplaneIcon,
  CheckBadgeIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import ExtraMaterialForm from '@/components/change-requests/ExtraMaterialForm';
import { useExtraMaterialsAutoSync } from '@/hooks/useAutoSync';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';

interface ExtraMaterialRequest {
  id: number;
  project_id: number;
  project_name: string;
  project_code?: string; // Project code like MS001, MS002, etc.
  area_id: number;
  area_name: string;
  boq_item_id: string;
  boq_item_name: string;
  sub_item_id: string;
  sub_item_name: string;
  quantity: number;
  unit_rate: number;
  total_cost: number;
  reason_for_new_sub_item?: string;
  requested_by: string;
  overhead_percent: number;
  status: string;
  created_at: string;
  remarks?: string;
  rejection_reason?: string;
  rejected_by?: string;
  rejected_at?: string;
  materials_count?: number;
  all_materials?: any[];
  purchase_completed_by?: string;
  purchase_completion_date?: string;
}

const ExtraMaterialPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'pending' | 'request' | 'approved' | 'rejected' | 'complete'>('pending');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('card');
  const [showForm, setShowForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteRequestId, setDeleteRequestId] = useState<number | null>(null);

  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('access_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Real-time auto-sync for extra materials
  const { data: materialsData, isLoading: loading, refetch } = useExtraMaterialsAutoSync(
    async () => {
      const response = await axios.get(`${API_URL}/change-requests`, { headers });

      // Filter based on role:
      // - Admin sees all requests
      // - Site Engineers see their own requests + requests created by admin
      const isAdmin = user?.role?.toLowerCase() === 'admin';
      const seRequests = (response.data.data || [])
        .filter((cr: any) => {
          // Admin sees everything
          if (isAdmin) return true;
          // SE sees their own requests OR requests created by admin
          return cr.requested_by_user_id === user?.user_id || cr.requested_by_role?.toLowerCase() === 'admin';
        });

      console.log('🔍 User Role:', user?.role, 'Is Admin:', isAdmin);
      console.log('🔍 Total Requests After Filter:', seRequests.length);
      console.log('🔍 Request Details:', seRequests.map((r: any) => ({ cr_id: r.cr_id, status: r.status, requested_by: r.requested_by_user_id, requested_by_role: r.requested_by_role, requested_by_name: r.requested_by_name })));

      // Transform pending materials (status: 'pending' - not yet sent to PM)
      const filteredPending = seRequests
        .filter((cr: any) => cr.status === 'pending')
        .filter((cr: any) => !filterProject || cr.project_id === parseInt(filterProject))
        .filter((cr: any) => !filterArea || cr.area_id === parseInt(filterArea));

      const transformedPending = filteredPending.map((cr: any) => {
        const materials = cr.materials_data || [];
        // Get first material for display, but keep all materials in the object
        const firstMat = materials[0] || {};
        return {
          id: cr.cr_id,
          project_id: cr.project_id,
          project_name: cr.project_name,
          area_id: cr.area_id,
          area_name: cr.area_name,
          boq_item_id: cr.item_id,
          boq_item_name: cr.item_name,
          sub_item_id: firstMat.master_material_id,
          sub_item_name: firstMat.material_name,
          quantity: firstMat.quantity,
          unit_rate: firstMat.unit_price,
          total_cost: materials.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0),
          reason_for_new_sub_item: firstMat.reason,
          requested_by: cr.requested_by_name,
          overhead_percent: cr.percentage_of_item_overhead,
          status: cr.status,
          created_at: cr.created_at,
          remarks: cr.justification,
          materials_count: materials.length,
          all_materials: materials
        };
      });

      // Transform under review materials (status: 'under_review' - sent to PM, waiting for approval)
      const filteredUnderReview = seRequests
        .filter((cr: any) => cr.status === 'under_review')
        .filter((cr: any) => !filterProject || cr.project_id === parseInt(filterProject))
        .filter((cr: any) => !filterArea || cr.area_id === parseInt(filterArea));

      const transformedUnderReview = filteredUnderReview.map((cr: any) => {
        const materials = cr.materials_data || [];
        const firstMat = materials[0] || {};
        return {
          id: cr.cr_id,
          project_id: cr.project_id,
          project_name: cr.project_name,
          project_code: cr.project_code,
          area_id: cr.area_id,
          area_name: cr.area_name,
          boq_item_id: cr.item_id,
          boq_item_name: cr.item_name,
          sub_item_id: firstMat.master_material_id,
          sub_item_name: firstMat.material_name,
          quantity: firstMat.quantity,
          unit_rate: firstMat.unit_price,
          total_cost: materials.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0),
          reason_for_new_sub_item: firstMat.reason,
          requested_by: cr.requested_by_name,
          overhead_percent: cr.percentage_of_item_overhead,
          status: cr.status,
          created_at: cr.created_at,
          remarks: cr.justification,
          materials_count: materials.length,
          all_materials: materials
        };
      });

      // Transform approved materials (only SE's own approved requests WITHOUT purchase completion)
      const filteredApproved = seRequests
        .filter((cr: any) => {
          const approvedStatuses = ['approved', 'approved_by_pm', 'approved_by_estimator', 'approved_by_td', 'assigned_to_buyer'];
          return approvedStatuses.includes(cr.status) && !cr.purchase_completion_date;
        })
        .filter((cr: any) => !filterProject || cr.project_id === parseInt(filterProject))
        .filter((cr: any) => !filterArea || cr.area_id === parseInt(filterArea))
        .filter((cr: any) => !filterItem || cr.item_id === filterItem);

      const transformedApproved = filteredApproved.map((cr: any) => {
        const materials = cr.materials_data || [];
        const firstMat = materials[0] || {};
        return {
          id: cr.cr_id,
          project_id: cr.project_id,
          project_name: cr.project_name,
          project_code: cr.project_code,
          area_id: cr.area_id,
          area_name: cr.area_name,
          boq_item_id: cr.item_id,
          boq_item_name: cr.item_name,
          sub_item_id: firstMat.master_material_id,
          sub_item_name: firstMat.material_name,
          quantity: firstMat.quantity,
          unit_rate: firstMat.unit_price,
          total_cost: materials.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0),
          reason_for_new_sub_item: firstMat.reason,
          requested_by: cr.requested_by_name,
          overhead_percent: cr.percentage_of_item_overhead,
          status: cr.status,
          created_at: cr.created_at,
          remarks: cr.justification,
          materials_count: materials.length,
          all_materials: materials
        };
      });

      // Transform rejected materials (only SE's own rejected requests)
      const filteredRejected = seRequests
        .filter((cr: any) => cr.status === 'rejected')
        .filter((cr: any) => !filterProject || cr.project_id === parseInt(filterProject))
        .filter((cr: any) => !filterArea || cr.area_id === parseInt(filterArea));

      const transformedRejected = filteredRejected.map((cr: any) => {
        const materials = cr.materials_data || [];
        const firstMat = materials[0] || {};
        return {
          id: cr.cr_id,
          project_id: cr.project_id,
          project_name: cr.project_name,
          project_code: cr.project_code,
          area_id: cr.area_id,
          area_name: cr.area_name,
          boq_item_id: cr.item_id,
          boq_item_name: cr.item_name,
          sub_item_id: firstMat.master_material_id,
          sub_item_name: firstMat.material_name,
          quantity: firstMat.quantity,
          unit_rate: firstMat.unit_price,
          total_cost: materials.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0),
          reason_for_new_sub_item: firstMat.reason,
          requested_by: cr.requested_by_name,
          overhead_percent: cr.percentage_of_item_overhead,
          status: cr.status,
          created_at: cr.created_at,
          remarks: cr.justification,
          rejection_reason: cr.rejection_reason,
          rejected_by: cr.rejected_by_name,
          rejected_at: cr.rejected_at_stage,
          materials_count: materials.length,
          all_materials: materials
        };
      });

      // Transform completed materials (purchase completed by buyer - status is 'purchase_completed')
      const filteredCompleted = seRequests
        .filter((cr: any) => cr.status === 'purchase_completed')
        .filter((cr: any) => !filterProject || cr.project_id === parseInt(filterProject))
        .filter((cr: any) => !filterArea || cr.area_id === parseInt(filterArea));

      const transformedCompleted = filteredCompleted.map((cr: any) => {
        const materials = cr.materials_data || [];
        const firstMat = materials[0] || {};
        return {
          id: cr.cr_id,
          project_id: cr.project_id,
          project_name: cr.project_name,
          project_code: cr.project_code,
          area_id: cr.area_id,
          area_name: cr.area_name,
          boq_item_id: cr.item_id,
          boq_item_name: cr.item_name,
          sub_item_id: firstMat.master_material_id,
          sub_item_name: firstMat.material_name,
          quantity: firstMat.quantity,
          unit_rate: firstMat.unit_price,
          total_cost: materials.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0),
          reason_for_new_sub_item: firstMat.reason,
          requested_by: cr.requested_by_name,
          overhead_percent: cr.percentage_of_item_overhead,
          status: cr.status,
          created_at: cr.created_at,
          remarks: cr.justification,
          purchase_completed_by: cr.purchase_completed_by_name,
          purchase_completion_date: cr.purchase_completion_date,
          materials_count: materials.length,
          all_materials: materials
        };
      });

      return {
        pending: transformedPending,
        underReview: transformedUnderReview,
        approved: transformedApproved,
        rejected: transformedRejected,
        completed: transformedCompleted
      };
    }
  );

  const pendingMaterials = useMemo(() => materialsData?.pending || [], [materialsData]);
  const underReviewMaterials = useMemo(() => materialsData?.underReview || [], [materialsData]);
  const approvedMaterials = useMemo(() => materialsData?.approved || [], [materialsData]);
  const rejectedMaterials = useMemo(() => materialsData?.rejected || [], [materialsData]);
  const completedMaterials = useMemo(() => materialsData?.completed || [], [materialsData]);

  useEffect(() => {
    refetch();
  }, [activeTab, filterProject, filterArea, filterItem, filterStatus]);

  const handleSubmitExtraMaterial = async (data: any) => {
    try {
      // Use the main change request API endpoint with proper structure
      const changeRequestPayload = {
        boq_id: data.boq_id,
        item_id: data.boq_item_id,  // Include item_id
        item_name: data.boq_item_name,  // Include item_name
        justification: data.justification || data.remarks || 'Extra materials required',
        materials: data.materials.map((mat: any) => ({
          material_name: mat.materialName || mat.material_name,  // Actual material name like "Bubble Wrap"
          sub_item_id: mat.subItemId || mat.sub_item_id,  // Sub-item ID like "subitem_331_1_3"
          sub_item_name: mat.subItemName || mat.sub_item_name,  // Sub-item name like "Protection"
          quantity: mat.quantity,
          unit: mat.unit,
          unit_price: mat.unit_rate || mat.unitRate,
          master_material_id: mat.materialId || mat.master_material_id || null,  // Material ID
          reason: mat.reason || mat.reasonForNew || null
        }))
      };

      const response = await axios.post(
        `${API_URL}/boq/change-request`,
        changeRequestPayload,
        { headers }
      );

      if (response.data.success || response.data.cr_id) {
        toast.success('Extra material request created successfully. Review and send to PM when ready.');
        setShowForm(false);
        refetch();
      }
    } catch (error: any) {
      console.error('Error submitting extra material request:', error);
      toast.error(error.response?.data?.error || 'Failed to submit request');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { color: string; icon: React.ReactNode; label: string } } = {
      pending: {
        color: 'bg-gray-100 text-gray-700 border-gray-300',
        icon: <ClockIcon className="w-4 h-4" />,
        label: 'Pending'
      },
      under_review: {
        color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
        icon: <ClockIcon className="w-4 h-4" />,
        label: 'PM Approval Pending'
      },
      approved_by_pm: {
        color: 'bg-blue-100 text-blue-700 border-blue-300',
        icon: <ClockIcon className="w-4 h-4" />,
        label: 'PM Approved - Under Review'
      },
      approved_by_td: {
        color: 'bg-indigo-100 text-indigo-700 border-indigo-300',
        icon: <ClockIcon className="w-4 h-4" />,
        label: 'TD Approved - Final Review'
      },
      approved: {
        color: 'bg-green-100 text-green-700 border-green-300',
        icon: <CheckCircleIcon className="w-4 h-4" />,
        label: 'Approved'
      },
      rejected: {
        color: 'bg-red-100 text-red-700 border-red-300',
        icon: <XCircleIcon className="w-4 h-4" />,
        label: 'Rejected'
      }
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  const handleViewDetails = async (requestId: number) => {
    try {
      const response = await axios.get(`${API_URL}/change-request/${requestId}`, { headers });
      // Backend returns {success: true, data: {...}} - we need response.data.data
      if (response.data && response.data.data) {
        setSelectedRequest(response.data.data);
        setShowViewModal(true);
      } else {
        toast.error('Failed to load request details');
      }
    } catch (error) {
      console.error('Error fetching request details:', error);
      toast.error('Failed to load request details');
    }
  };

  const handleEdit = async (requestId: number) => {
    try {
      // Fetch the change request details
      const response = await axios.get(`${API_URL}/change-request/${requestId}`, { headers });

      if (response.data && response.data.data) {
        const cr = response.data.data;

        // Set the selected request for editing
        setSelectedRequest({
          ...cr,
          editMode: true,
          cr_id: requestId
        });

        // Open the form
        setShowForm(true);

        toast.info('Loading change request for editing...');
      } else {
        toast.error('Failed to load change request');
      }
    } catch (error) {
      console.error('Error loading change request for edit:', error);
      toast.error('Failed to load change request');
    }
  };

  const handleSendToPM = async (requestId: number) => {
    try {
      await axios.post(
        `${API_URL}/change-request/${requestId}/send-for-review`,
        {},
        { headers }
      );
      toast.success('Request sent to PM for approval');
      refetch();
    } catch (error: any) {
      console.error('Error sending request to PM:', error);
      toast.error(error.response?.data?.error || 'Failed to send request to PM');
    }
  };

  const handleDelete = (requestId: number) => {
    // Show custom confirmation modal
    setDeleteRequestId(requestId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteRequestId) return;

    try {
      await axios.delete(
        `${API_URL}/change-request/${deleteRequestId}`,
        { headers }
      );
      toast.success('Request deleted successfully');
      setShowDeleteModal(false);
      setDeleteRequestId(null);
      refetch();
    } catch (error: any) {
      console.error('Error deleting request:', error);
      toast.error(error.response?.data?.error || 'Failed to delete request');
      setShowDeleteModal(false);
      setDeleteRequestId(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteRequestId(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 rounded-2xl p-6 shadow-sm border border-red-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Material Purchase</h1>
                <p className="text-gray-600">Request additional sub-items for assigned projects</p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center px-4 py-2 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors shadow-md"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                NEW MATERIAL PURCHASE
              </button>
            </div>
          </div>
        </motion.div>

        {/* Tabs and View Toggle */}
        <div className="mb-6 bg-white rounded-xl border border-gray-200">
          <div className="flex justify-between items-center px-6 pt-4">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('pending')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'pending'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <PlusIcon className="w-5 h-5" />
                  Pending ({pendingMaterials.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('request')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'request'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-5 h-5" />
                  Request ({underReviewMaterials.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('approved')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'approved'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-5 h-5" />
                  Approved ({approvedMaterials.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('rejected')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'rejected'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <XCircleIcon className="w-5 h-5" />
                  Rejected ({rejectedMaterials.length})
                </div>
              </button>
              <button
                onClick={() => setActiveTab('complete')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'complete'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckBadgeIcon className="w-5 h-5" />
                  Complete ({completedMaterials.length})
                </div>
              </button>
            </nav>

            {/* View Mode Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setViewMode('card')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'card'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Card View"
              >
                <Squares2X2Icon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'table'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Table View"
              >
                <TableCellsIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'pending' ? (
          <motion.div
            key="pending"
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Pending Requests</h2>
            {/* Pending List */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#243d8a]"></div>
              </div>
            ) : pendingMaterials.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <CubeIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Requests</h3>
                <p className="text-gray-500">Click "NEW MATERIAL PURCHASE" to create your first request</p>
              </div>
            ) : viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingMaterials.map((request: ExtraMaterialRequest) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-base">EM-{request.id}</h3>
                          {request.project_code && (
                            <span className="text-xs font-semibold text-black">
                              {request.project_code}
                            </span>
                          )}
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div>
                          <p className="font-medium text-gray-900">{request.project_name}</p>
                          <p className="text-xs text-gray-500">{request.area_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">BOQ Item</p>
                          <p className="font-medium">{request.boq_item_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Sub-Item</p>
                          <p className="font-medium">{request.sub_item_name}</p>
                          {request.materials_count && request.materials_count > 1 && (
                            <p className="text-xs text-purple-600 mt-1">+ {request.materials_count - 1} more material(s)</p>
                          )}
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <div>
                            <p className="text-xs text-gray-500">Quantity</p>
                            <p className="font-semibold">{request.quantity}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => handleViewDetails(request.id)}
                          className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2"
                        >
                          <EyeIcon className="w-4 h-4" />
                          View Details
                        </button>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => handleEdit(request.id)}
                            className="bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <PencilIcon className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleSendToPM(request.id)}
                            className="bg-[#243d8a] hover:bg-[#1e3270] text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <PaperAirplaneIcon className="w-4 h-4" />
                            Send
                          </button>
                          <button
                            onClick={() => handleDelete(request.id)}
                            className="bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <TrashIcon className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Request ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Project / Area
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          BOQ Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sub-Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {pendingMaterials.map((request: ExtraMaterialRequest) => (
                        <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-black">
                              {request.project_code || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            EM-{request.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            <div>
                              <p className="font-medium">{request.project_name}</p>
                              <p className="text-xs text-gray-500">{request.area_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.boq_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.sub_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.quantity}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleViewDetails(request.id)}
                                className="text-red-600 hover:text-red-700 font-medium"
                              >
                                <EyeIcon className="w-4 h-4 inline mr-1" />
                                View
                              </button>
                              <button
                                onClick={() => handleEdit(request.id)}
                                className="text-green-600 hover:text-green-800 font-medium"
                              >
                                <PencilIcon className="w-4 h-4 inline mr-1" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleSendToPM(request.id)}
                                className="text-[#243d8a] hover:text-[#1e3270] font-medium"
                              >
                                <PaperAirplaneIcon className="w-4 h-4 inline mr-1" />
                                Send
                              </button>
                              <button
                                onClick={() => handleDelete(request.id)}
                                className="text-red-600 hover:text-red-800 font-medium"
                              >
                                <TrashIcon className="w-4 h-4 inline mr-1" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'request' ? (
          <motion.div
            key="request"
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Sent for PM Approval</h2>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#243d8a]"></div>
              </div>
            ) : underReviewMaterials.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <ClockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Requests Under Review</h3>
                <p className="text-gray-500">Requests sent to PM will appear here</p>
              </div>
            ) : viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {underReviewMaterials.map((request: ExtraMaterialRequest) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-base">EM-{request.id}</h3>
                          {request.project_code && (
                            <span className="text-xs font-semibold text-black">
                              {request.project_code}
                            </span>
                          )}
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div>
                          <p className="font-medium text-gray-900">{request.project_name}</p>
                          <p className="text-xs text-gray-500">{request.area_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">BOQ Item</p>
                          <p className="font-medium">{request.boq_item_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Sub-Item</p>
                          <p className="font-medium">{request.sub_item_name}</p>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <div>
                            <p className="text-xs text-gray-500">Quantity</p>
                            <p className="font-semibold">{request.quantity}</p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 pt-2">
                          Created: {new Date(request.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <button
                        onClick={() => handleViewDetails(request.id)}
                        className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2"
                      >
                        <EyeIcon className="w-4 h-4" />
                        View Details
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Request ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Project / Area
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          BOQ Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sub-Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {underReviewMaterials.map((request: ExtraMaterialRequest) => (
                        <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-black">
                              {request.project_code || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            EM-{request.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            <div>
                              <p className="font-medium">{request.project_name}</p>
                              <p className="text-xs text-gray-500">{request.area_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.boq_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.sub_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.quantity}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(request.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(request.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => handleViewDetails(request.id)}
                              className="text-red-600 hover:text-red-700 font-medium"
                            >
                              <EyeIcon className="w-4 h-4 inline mr-1" />
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'approved' ? (
          <motion.div
            key="approved"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Filters for Approved Tab */}
            <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FunnelIcon className="w-5 h-5 text-gray-500" />
                <h3 className="font-medium text-gray-900">Filters</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                  <select
                    value={filterProject}
                    onChange={(e) => setFilterProject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#243d8a]"
                  >
                    <option value="">All Projects</option>
                    {/* Projects will be populated from API */}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
                  <select
                    value={filterArea}
                    onChange={(e) => setFilterArea(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#243d8a]"
                    disabled={!filterProject}
                  >
                    <option value="">All Areas</option>
                    {/* Areas will be populated based on selected project */}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                  <select
                    value={filterItem}
                    onChange={(e) => setFilterItem(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#243d8a]"
                  >
                    <option value="">All Items</option>
                    {/* Items will be populated from API */}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#243d8a]"
                  >
                    <option value="">All Status</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Approved List */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#243d8a]"></div>
              </div>
            ) : approvedMaterials.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <CheckCircleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Approved Materials</h3>
                <p className="text-gray-500">Approved extra material requests will appear here</p>
              </div>
            ) : viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {approvedMaterials.map((request: ExtraMaterialRequest) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-lg transition-all duration-200"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-base">EM-{request.id}</h3>
                          {request.project_code && (
                            <span className="text-xs font-semibold text-black">
                              {request.project_code}
                            </span>
                          )}
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="space-y-2 text-sm text-gray-600">
                        <div>
                          <p className="font-medium text-gray-900">{request.project_name}</p>
                          <p className="text-xs text-gray-500">{request.area_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">BOQ Item</p>
                          <p className="font-medium">{request.boq_item_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Sub-Item</p>
                          <p className="font-medium">{request.sub_item_name}</p>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <div>
                            <p className="text-xs text-gray-500">Quantity</p>
                            <p className="font-semibold">{request.quantity}</p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 pt-2">
                          Approved: {new Date(request.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Request ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Project / Area
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          BOQ Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sub-Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Approved Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {approvedMaterials.map((request: ExtraMaterialRequest) => (
                        <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-black">
                              {request.project_code || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            EM-{request.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            <div>
                              <p className="font-medium">{request.project_name}</p>
                              <p className="text-xs text-gray-500">{request.area_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.boq_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.sub_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.quantity}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(request.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'rejected' ? (
          <motion.div
            key="rejected"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Rejected Requests</h2>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#243d8a]"></div>
              </div>
            ) : rejectedMaterials.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <XCircleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Rejected Requests</h3>
                <p className="text-gray-500">Rejected extra material requests will appear here</p>
              </div>
            ) : viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rejectedMaterials.map((request: ExtraMaterialRequest) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg border border-red-200 shadow-sm hover:shadow-lg transition-all duration-200"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-base">EM-{request.id}</h3>
                          {request.project_code && (
                            <span className="text-xs font-semibold text-black">
                              {request.project_code}
                            </span>
                          )}
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div>
                          <p className="font-medium text-gray-900">{request.project_name}</p>
                          <p className="text-xs text-gray-500">{request.area_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">BOQ Item</p>
                          <p className="font-medium">{request.boq_item_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Sub-Item</p>
                          <p className="font-medium">{request.sub_item_name}</p>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <div>
                            <p className="text-xs text-gray-500">Quantity</p>
                            <p className="font-semibold">{request.quantity}</p>
                          </div>
                        </div>

                        {/* Rejection Details */}
                        {request.rejection_reason && (
                          <div className="pt-2 border-t bg-red-50 -mx-4 px-4 py-2 mt-3">
                            <p className="text-xs font-medium text-red-900">Rejection Reason:</p>
                            <p className="text-xs text-red-700 mt-1">{request.rejection_reason}</p>
                          </div>
                        )}
                        {request.rejected_by && (
                          <div className="text-xs text-gray-500">
                            <p>Rejected by: <span className="font-medium text-red-700">{request.rejected_by}</span></p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => handleViewDetails(request.id)}
                          className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2"
                        >
                          <EyeIcon className="w-4 h-4" />
                          View Details
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleEdit(request.id)}
                            className="bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <PencilIcon className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(request.id)}
                            className="bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <TrashIcon className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Request ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Project / Area
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          BOQ Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sub-Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rejection Reason
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rejected By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rejectedMaterials.map((request: ExtraMaterialRequest) => (
                        <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-black">
                              {request.project_code || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            EM-{request.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            <div>
                              <p className="font-medium">{request.project_name}</p>
                              <p className="text-xs text-gray-500">{request.area_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.boq_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.sub_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.quantity}
                          </td>
                          <td className="px-6 py-4 text-sm text-red-700 max-w-xs">
                            <div className="truncate" title={request.rejection_reason}>
                              {request.rejection_reason || 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.rejected_by || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleViewDetails(request.id)}
                                className="text-red-600 hover:text-red-700 font-medium"
                              >
                                <EyeIcon className="w-4 h-4 inline mr-1" />
                                View
                              </button>
                              <button
                                onClick={() => handleEdit(request.id)}
                                className="text-green-600 hover:text-green-800 font-medium"
                              >
                                <PencilIcon className="w-4 h-4 inline mr-1" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(request.id)}
                                className="text-red-600 hover:text-red-800 font-medium"
                              >
                                <TrashIcon className="w-4 h-4 inline mr-1" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'complete' ? (
          <motion.div
            key="complete"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Completed Purchases</h2>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#243d8a]"></div>
              </div>
            ) : completedMaterials.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <CheckBadgeIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Completed Purchases</h3>
                <p className="text-gray-500">Purchases completed by buyer will appear here</p>
              </div>
            ) : viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedMaterials.map((request: ExtraMaterialRequest) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg border border-blue-200 shadow-sm hover:shadow-lg transition-all duration-200"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 text-base">EM-{request.id}</h3>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-blue-100 text-blue-700 border-blue-300">
                          <CheckBadgeIcon className="w-4 h-4" />
                          Complete
                        </span>
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div>
                          <p className="font-medium text-gray-900">{request.project_name}</p>
                          <p className="text-xs text-gray-500">{request.area_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">BOQ Item</p>
                          <p className="font-medium">{request.boq_item_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Sub-Item</p>
                          <p className="font-medium">{request.sub_item_name}</p>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <div>
                            <p className="text-xs text-gray-500">Quantity</p>
                            <p className="font-semibold">{request.quantity}</p>
                          </div>
                        </div>

                        {/* Purchase Completion Details */}
                        <div className="pt-2 border-t bg-blue-50 -mx-4 px-4 py-2 mt-3">
                          <p className="text-xs font-medium text-blue-900">Purchase Completed</p>
                          {request.purchase_completed_by && (
                            <p className="text-xs text-blue-700 mt-1">
                              By: <span className="font-medium">{request.purchase_completed_by}</span>
                            </p>
                          )}
                          {request.purchase_completion_date && (
                            <p className="text-xs text-blue-600 mt-0.5">
                              {new Date(request.purchase_completion_date).toLocaleString('en-US', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleViewDetails(request.id)}
                        className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2"
                      >
                        <EyeIcon className="w-4 h-4" />
                        View Details
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Request ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Project / Area
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          BOQ Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sub-Item
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Completed By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Completed Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {completedMaterials.map((request: ExtraMaterialRequest) => (
                        <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-black">
                              {request.project_code || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            EM-{request.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            <div>
                              <p className="font-medium">{request.project_name}</p>
                              <p className="text-xs text-gray-500">{request.area_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.boq_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.sub_item_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.quantity}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {request.purchase_completed_by || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {request.purchase_completion_date
                              ? new Date(request.purchase_completion_date).toLocaleDateString()
                              : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => handleViewDetails(request.id)}
                              className="text-red-600 hover:text-red-700 font-medium"
                            >
                              <EyeIcon className="w-4 h-4 inline mr-1" />
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
         ) : null}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b px-6 py-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedRequest?.editMode ? 'Edit Material Purchase Request' : 'Request Material Purchase'}
                </h2>
              </div>
              <div className="p-6">
                <ExtraMaterialForm
                  onSubmit={selectedRequest?.editMode ? undefined : handleSubmitExtraMaterial}
                  onCancel={() => {
                    setShowForm(false);
                    setSelectedRequest(null);
                  }}
                  onSuccess={() => {
                    setShowForm(false);
                    setSelectedRequest(null);
                    refetch();
                  }}
                  initialData={selectedRequest}
                />
              </div>
            </motion.div>
          </div>
        )}

        {/* View Details Modal */}
        <ChangeRequestDetailsModal
          isOpen={showViewModal}
          onClose={() => {
            setShowViewModal(false);
            setSelectedRequest(null);
          }}
          changeRequest={selectedRequest}
          canApprove={false}
        />

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Confirm Delete</h3>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-700 text-base mb-2">
                  Are you sure you want to delete this request?
                </p>
                <p className="text-sm text-gray-500">
                  This action cannot be undone. The request will be permanently removed from the system.
                </p>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end">
                <button
                  onClick={cancelDelete}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

// ✅ PERFORMANCE FIX: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(ExtraMaterialPage);