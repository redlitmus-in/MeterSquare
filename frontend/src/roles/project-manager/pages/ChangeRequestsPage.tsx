import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Eye,
  Check,
  X,
  AlertCircle,
  FileText,
  Package,
  DollarSign,
  Calendar,
  FolderOpen,
  LayoutGrid,
  List,
  Plus,
  Box,
  Pencil,
  GitBranch,
  MapPin
} from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { PAGINATION } from '@/lib/constants';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import EditChangeRequestModal from '@/components/modals/EditChangeRequestModal';
import RejectionReasonModal from '@/components/modals/RejectionReasonModal';
import ExtraMaterialForm from '@/components/change-requests/ExtraMaterialForm';
import PreliminaryPurchaseForm from '@/components/change-requests/PreliminaryPurchaseForm';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';
import { permissions } from '@/utils/rolePermissions';

interface Buyer {
  user_id: number;
  full_name: string;
  username: string;
  is_active: boolean;
}

// Purchase Request Modal Component with Materials and Preliminaries tabs
interface PurchaseRequestModalProps {
  onClose: () => void;
}

const PurchaseRequestModal: React.FC<PurchaseRequestModalProps> = ({ onClose }) => {
  const [purchaseTab, setPurchaseTab] = useState<'materials' | 'preliminaries'>('materials');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <Box className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Request Purchase</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex">
            <button
              onClick={() => setPurchaseTab('materials')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${
                purchaseTab === 'materials'
                  ? 'text-[#243d8a] bg-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Package className="w-4 h-4" />
                <span>Materials</span>
              </div>
              {purchaseTab === 'materials' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#243d8a]" />
              )}
            </button>
            <button
              onClick={() => setPurchaseTab('preliminaries')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${
                purchaseTab === 'preliminaries'
                  ? 'text-[#243d8a] bg-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" />
                <span>Preliminaries</span>
              </div>
              {purchaseTab === 'preliminaries' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#243d8a]" />
              )}
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] custom-scrollbar" style={{ scrollBehavior: 'smooth' }}>
          {purchaseTab === 'materials' ? (
            <ExtraMaterialForm onClose={onClose} />
          ) : (
            <PreliminaryPurchaseForm onClose={onClose} />
          )}
        </div>
      </motion.div>
    </div>
  );
};

const ChangeRequestsPage: React.FC = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const isExtraMaterial = location.pathname.includes('extra-material');

  // Get tab and cr_id from URL query parameters (for notification redirects)
  const urlTab = searchParams.get('tab');
  const urlCrId = searchParams.get('cr_id');

  const [activeTab, setActiveTab] = useState(() => {
    // Priority: URL tab param > default based on route
    if (urlTab) {
      // Map URL tab values to valid tab values for this page
      // For Extra Material: requested, pending, accepted, completed, rejected
      // For Change Requests: pending, approved, completed, rejected
      const validTabs = ['pending', 'approved', 'completed', 'rejected', 'requested', 'accepted'];
      if (validTabs.includes(urlTab)) {
        return urlTab;
      }
    }
    // Default to 'pending' for both routes - PM's own drafts should be shown first
    return 'pending';
  });
  const [pendingSubTab, setPendingSubTab] = useState<'drafts' | 'sent_to_estimator' | 'sent_to_buyer'>('drafts'); // Sub-tab for Pending
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectingCrId, setRejectingCrId] = useState<number | null>(null);
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [showBuyerSelectionModal, setShowBuyerSelectionModal] = useState(false);
  const [approvingCrId, setApprovingCrId] = useState<number | null>(null);
  const [sendingCrId, setSendingCrId] = useState<number | null>(null);
  const [processingCrId, setProcessingCrId] = useState<number | null>(null); // Prevents double-clicks
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);

  // Track if we've already auto-opened modal from URL (to prevent reopening on close)
  const hasAutoOpenedRef = useRef<string | null>(null);

  // ✅ PERFORMANCE: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<{
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  } | null>(null);
  const perPage = PAGINATION.DEFAULT_PAGE_SIZE;

  // State for data loading
  const [changeRequestsData, setChangeRequestsData] = useState<ChangeRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  // Lock body scroll when modals are open
  React.useEffect(() => {
    if (showBuyerSelectionModal || showExtraForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showBuyerSelectionModal, showExtraForm]);

  // ✅ LISTEN TO REAL-TIME UPDATES
  const changeRequestUpdateTimestamp = useRealtimeUpdateStore(state => state.changeRequestUpdateTimestamp);

  // Load change requests with pagination
  const loadChangeRequests = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) setIsLoading(true);
    setIsFetching(true);
    try {
      const response = await changeRequestService.getChangeRequests(currentPage, perPage);
      if (response.success) {
        setChangeRequestsData(response.data);
        if (response.pagination) {
          setPagination(response.pagination);
        }
      }
    } catch (error) {
      console.error('Failed to load change requests:', error);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadChangeRequests(true);
  }, []);

  // Reload when page changes
  useEffect(() => {
    if (!isLoading) {
      loadChangeRequests(false);
    }
  }, [currentPage]);

  // Reload on real-time updates
  useEffect(() => {
    if (changeRequestUpdateTimestamp === 0) return;
    loadChangeRequests(false);
  }, [changeRequestUpdateTimestamp]);

  // Reset page when main tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Reset page when sub-tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [pendingSubTab]);

  const refetch = () => loadChangeRequests(false);

  const changeRequests = useMemo(() => {
    const allRequests = changeRequestsData || [];
    // Filter by request_type based on current page
    if (isExtraMaterial) {
      return allRequests.filter(req => req.request_type === 'EXTRA_MATERIALS');
    }
    return allRequests.filter(req => req.request_type !== 'EXTRA_MATERIALS');
  }, [changeRequestsData, isExtraMaterial]);

  // Auto-open change request details when cr_id is in URL (from notification redirect)
  useEffect(() => {
    // Only auto-open if we haven't already opened for this specific urlCrId
    if (urlCrId && changeRequests.length > 0 && !showDetailsModal && hasAutoOpenedRef.current !== urlCrId) {
      const crIdNum = parseInt(urlCrId, 10);
      const targetCr = changeRequests.find((cr: ChangeRequestItem) => cr.cr_id === crIdNum);
      if (targetCr) {
        setSelectedChangeRequest(targetCr);
        setShowDetailsModal(true);
        // Mark this urlCrId as already opened
        hasAutoOpenedRef.current = urlCrId;
      }
    }
    // Reset the ref when urlCrId is cleared
    if (!urlCrId) {
      hasAutoOpenedRef.current = null;
    }
  }, [urlCrId, changeRequests, showDetailsModal]);

  const initialLoad = isLoading;

  const handleSendForReview = async (crId: number, buyerId?: number) => {
    // Prevent double-clicks
    if (processingCrId === crId) {
      return;
    }

    // Check if materials are new or existing to determine routing
    const request = changeRequests.find(r => r.cr_id === crId);
    if (!request) {
      showError('PO not found');
      return;
    }

    // Check if there are any new materials (without master_material_id)
    const hasNewMaterials = request.materials_data?.some(mat => mat.master_material_id === null || mat.master_material_id === undefined);

    // Route to Estimator if there are new materials, otherwise to Buyer for existing materials
    const routeTo = hasNewMaterials ? 'estimator' : 'buyer';
    const destination = hasNewMaterials ? 'Estimator' : 'Buyer';

    // If routing to buyer and no buyer selected yet, show buyer selection modal
    if (routeTo === 'buyer' && !buyerId) {
      setSendingCrId(crId);
      await fetchBuyers();
      setShowBuyerSelectionModal(true);
      return;
    }

    setProcessingCrId(crId);
    try {
      const response = await changeRequestService.sendForReview(crId, routeTo, buyerId);
      if (response.success) {
        showSuccess(response.message || `Request sent to ${destination}`);
        refetch(); // Trigger background refresh
      } else {
        showError(response.message);
      }
    } catch (error) {
      showError('Failed to send request for review');
    } finally {
      setProcessingCrId(null);
    }
  };

  const handleApprove = async (crId: number, buyerId?: number) => {
    // Check if this is an external buy request (all materials have master_material_id)
    const request = changeRequests.find(r => r.cr_id === crId);
    if (request) {
      const allExternal = request.materials_data?.every(mat => mat.master_material_id !== null && mat.master_material_id !== undefined);

      if (allExternal && !buyerId) {
        // External buy - need to select buyer first
        setApprovingCrId(crId);
        await fetchBuyers();
        setShowBuyerSelectionModal(true);
        return;
      }
    }

    // Proceed with approval
    try {
      const response = await changeRequestService.approve(crId, 'Approved by PM', buyerId);
      if (response.success) {
        showSuccess(response.message || 'PO approved successfully');
        refetch(); // Trigger background refresh
      } else {
        showError(response.message);
      }
    } catch (error) {
      showError('Failed to approve PO');
    }
  };

  const fetchBuyers = async () => {
    try {
      const response = await changeRequestService.getBuyers();
      if (response.success && response.data) {
        setBuyers(response.data as Buyer[]);
      }
    } catch (error) {
      console.error('Error fetching buyers:', error);
      showError('Failed to load buyers');
    }
  };

  const handleBuyerSelection = async () => {
    if (!selectedBuyerId) {
      showError('Please select a buyer');
      return;
    }

    // Check if we're approving or sending
    if (approvingCrId) {
      setShowBuyerSelectionModal(false);
      await handleApprove(approvingCrId, selectedBuyerId);
      setApprovingCrId(null);
      setSelectedBuyerId(null);
    } else if (sendingCrId) {
      setShowBuyerSelectionModal(false);
      await handleSendForReview(sendingCrId, selectedBuyerId);
      setSendingCrId(null);
      setSelectedBuyerId(null);
    }
  };

  const handleReject = (crId: number) => {
    setRejectingCrId(crId);
    setShowRejectionModal(true);
  };

  const handleRejectSubmit = async (reason: string) => {
    if (!rejectingCrId) return;

    try {
      const response = await changeRequestService.reject(rejectingCrId, reason);
      if (response.success) {
        showSuccess('PO rejected');
        refetch(); // Trigger background refresh
        setShowRejectionModal(false);
        setRejectingCrId(null);
      } else {
        showError(response.message);
      }
    } catch (error) {
      showError('Failed to reject PO');
    }
  };

  const handleReview = async (crId: number) => {
    try {
      const response = await changeRequestService.getChangeRequestDetail(crId);
      if (response.success && response.data) {
        setSelectedChangeRequest(response.data);
        setShowDetailsModal(true);
      } else {
        showError(response.message || 'Failed to load details');
      }
    } catch (error) {
      console.error('Error in handleReview:', error);
      showError('Failed to load PO details');
    }
  };

  const handleEdit = (crId: number) => {
    // Find the change request and open it in the edit modal
    const request = changeRequests.find(r => r.cr_id === crId);
    if (request) {
      setSelectedChangeRequest(request);
      setShowEditModal(true);
    }
  };

  const handleEditSuccess = () => {
    // Trigger background refresh after successful edit
    refetch();
    setShowEditModal(false);
    setSelectedChangeRequest(null);
    showSuccess('PO updated successfully');
  };

  const handleApproveFromModal = async () => {
    if (!selectedChangeRequest) return;
    await handleApprove(selectedChangeRequest.cr_id);
    setShowDetailsModal(false);
    setSelectedChangeRequest(null);
    // Clear URL parameters to prevent auto-reopen
    setSearchParams({});
  };

  const handleRejectFromModal = () => {
    if (!selectedChangeRequest) return;
    setRejectingCrId(selectedChangeRequest.cr_id);
    setShowDetailsModal(false);
    setShowRejectionModal(true);
    // Clear URL parameters to prevent auto-reopen
    setSearchParams({});
  };

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      under_review: 'bg-yellow-100 text-yellow-800',
      send_to_est: 'bg-blue-100 text-blue-800',
      send_to_buyer: 'bg-purple-100 text-purple-800',
      approved_by_pm: 'bg-blue-100 text-blue-800',
      approved_by_td: 'bg-blue-100 text-blue-800',
      assigned_to_buyer: 'bg-purple-100 text-purple-800',
      purchase_completed: 'bg-green-100 text-green-800',
      routed_to_store: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      split_to_sub_crs: 'bg-indigo-100 text-indigo-800'
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const getStatusLabel = (status: string, approvalFrom?: string) => {
    // Status display based on workflow stage
    if (status === 'pending') {
      return 'Pending';
    }
    if (status === 'under_review') {
      // Show specific approval stage for under_review status
      if (approvalFrom === 'project_manager') {
        return 'PM Approval Pending';
      } else if (approvalFrom === 'technical_director') {
        return 'TD Approval Pending';
      } else if (approvalFrom === 'estimator') {
        return 'Estimator Approval Pending';
      }
      return 'Under Review';
    }
    if (status === 'send_to_est') {
      return 'SENT TO ESTIMATOR';
    }
    if (status === 'send_to_buyer') {
      return 'SENT TO BUYER';
    }
    if (status === 'approved_by_pm') {
      return 'APPROVED BY PM';
    }
    if (status === 'approved_by_td') {
      return 'APPROVED BY TD';
    }
    if (status === 'assigned_to_buyer') {
      return 'ASSIGNED TO BUYER';
    }
    if (status === 'purchase_completed') {
      return 'PURCHASE COMPLETED';
    }
    if (status === 'routed_to_store') {
      return 'ROUTED TO M2 STORE';
    }
    if (status === 'rejected') {
      return 'REJECTED';
    }
    return status.replace('_', ' ').toUpperCase();
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage <= 10) return 'text-green-600';
    if (percentage <= 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Helper to render POChildren (vendor splits) info
  const renderPOChildrenInfo = (request: ChangeRequestItem) => {
    if (!request.has_po_children || !request.po_children || request.po_children.length === 0) {
      return null;
    }

    const getChildStatusColor = (status: string) => {
      switch (status) {
        case 'purchase_completed':
        case 'routed_to_store': return 'bg-green-100 text-green-700';
        case 'vendor_approved': return 'bg-blue-100 text-blue-700';
        case 'pending_td_approval': return 'bg-yellow-100 text-yellow-700';
        case 'rejected': return 'bg-red-100 text-red-700';
        default: return 'bg-gray-100 text-gray-700';
      }
    };

    const getChildStatusLabel = (status: string) => {
      switch (status) {
        case 'purchase_completed':
        case 'routed_to_store': return 'Completed';
        case 'vendor_approved': return 'Vendor Approved';
        case 'pending_td_approval': return 'Pending TD';
        case 'rejected': return 'Rejected';
        default: return status;
      }
    };

    return (
      <div className="px-4 pb-3">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-3 border border-indigo-200">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-semibold text-indigo-700">Split into {request.po_children.length} Vendor{request.po_children.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1.5">
            {request.po_children.map((child) => (
              <div key={child.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700">{child.formatted_id}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-gray-600 truncate max-w-[100px]">{child.vendor_name || 'No vendor'}</span>
                </div>
                <Badge className={`text-[10px] px-1.5 py-0.5 ${getChildStatusColor(child.status)}`}>
                  {getChildStatusLabel(child.status)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const isAdminUser = user?.role?.toLowerCase() === 'admin' || user?.role_name?.toLowerCase() === 'admin';

  const filteredRequests = changeRequests.filter(req => {
    const projectName = req.project_name || req.boq_name || '';
    const searchLower = searchTerm.toLowerCase().trim();
    // ✅ Search by ID (CR-123, 123), project code (MSQ26), project name, or requester name
    const idString = `cr-${req.cr_id}`;
    const matchesSearch = !searchTerm ||
                         projectName.toLowerCase().includes(searchLower) ||
                         req.requested_by_name.toLowerCase().includes(searchLower) ||
                         req.project_code?.toLowerCase().includes(searchLower) ||
                         idString.includes(searchLower) ||
                         req.cr_id.toString().includes(searchTerm.trim());

    let matchesTab = false;
    if (isExtraMaterial) {
      // Extra Material tab filtering
      // Separate SE requests (Requested tab) from PM's own requests (Pending tab)
      const isPMRequest = req.requested_by_user_id === user?.user_id;
      // Only SE requests that PM approved and sent forward (NOT PM's own requests)
      // Include both under_review (waiting for EST/TD) AND assigned_to_buyer (EST approved)
      const isPMApprovedAndSent = !isPMRequest && (
        (req.status === 'under_review' && ['estimator', 'technical_director'].includes(req.approval_required_from || '')) ||
        (req.status === 'assigned_to_buyer' && req.pm_approved_by_user_id != null)  // EST approved after PM sent
      );

      // For Admin:
      // - Pending tab shows ALL status='pending' (drafts not sent yet) - regardless of who created
      // - Request tab shows ALL status='under_review' (sent for approval to PM/TD/Estimator)
      // For non-Admin PM/SE:
      // - Pending tab shows their own status='pending'
      // - Request tab shows status='under_review' where approval_required_from='project_manager'

      // Role-based statuses: pm_request, ss_request, mep_request, admin_request
      const isDraftStatus = ['pending', 'pm_request', 'ss_request', 'mep_request', 'admin_request'].includes(req.status);

      // For Pending tab: include all statuses that appear in sub-tabs (drafts, sent_to_estimator, sent_to_buyer)
      const isPendingTabStatus =
        isDraftStatus ||  // Drafts sub-tab (all role-based statuses)
        (req.status === 'under_review' && req.approval_required_from === 'estimator') ||  // Sent to Estimator sub-tab
        (req.status === 'under_review' && req.approval_required_from === 'buyer') ||  // Sent to Buyer sub-tab
        req.status === 'assigned_to_buyer';  // Sent to Buyer sub-tab

      // Check if this is a PM-created request (should NOT appear in Requested tab)
      // PM requests have status 'pending' or 'pm_request' and should only show in Pending→Drafts
      const requestedByRoleLower = req.requested_by_role?.toLowerCase() || '';
      const isPMCreatedRequest = requestedByRoleLower.includes('project') ||
                                  requestedByRoleLower.includes('manager') ||
                                  requestedByRoleLower === 'pm' ||
                                  ['pending', 'pm_request'].includes(req.status);  // Also filter by status

      matchesTab = (
        (activeTab === 'requested' && !isPMCreatedRequest && (req.status === 'send_to_pm' || (req.status === 'under_review' && req.approval_required_from === 'project_manager'))) ||  // Requests needing PM approval (send_to_pm or under_review) - EXCLUDE PM's own requests
        (activeTab === 'pending' && isPendingTabStatus) ||  // ALL requests for pending sub-tabs
        (activeTab === 'accepted' && (req.status === 'approved_by_pm' || req.status === 'send_to_est' || req.status === 'send_to_buyer' || req.status === 'pending_td_approval' || req.status === 'split_to_sub_crs' || req.status === 'sent_to_store')) ||  // approved_by_pm, send_to_est, send_to_buyer, pending_td_approval, split_to_sub_crs and sent_to_store status
        (activeTab === 'completed' && (req.status === 'purchase_completed' || req.status === 'routed_to_store')) ||
        (activeTab === 'rejected' && req.status === 'rejected')
      );
    } else {
      // Change Requests tab filtering - show requests that need PM action or PM created
      matchesTab = (
        (activeTab === 'pending' && ['pending', 'under_review'].includes(req.status)) ||
        (activeTab === 'approved' && ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer', 'send_to_est', 'send_to_buyer', 'pending_td_approval', 'split_to_sub_crs', 'sent_to_store'].includes(req.status)) ||
        (activeTab === 'completed' && (req.status === 'purchase_completed' || req.status === 'routed_to_store')) ||
        (activeTab === 'rejected' && req.status === 'rejected')
      );
    }
    return matchesSearch && matchesTab;
  });

  const stats = {
    pending: changeRequests.filter(r => ['pending', 'under_review'].includes(r.status)).length,
    approved: changeRequests.filter(r => ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer', 'send_to_est', 'send_to_buyer', 'pending_td_approval', 'split_to_sub_crs'].includes(r.status)).length,
    completed: changeRequests.filter(r => r.status === 'purchase_completed' || r.status === 'routed_to_store').length,
    rejected: changeRequests.filter(r => r.status === 'rejected').length,
    // For Extra Material - Requested tab count (send_to_pm or under_review with PM approval) - EXCLUDE PM's own requests
    my_requests: changeRequests.filter(r => {
      const requestedByRoleLower = r.requested_by_role?.toLowerCase() || '';
      const isPMCreatedRequest = requestedByRoleLower.includes('project') ||
                                  requestedByRoleLower.includes('manager') ||
                                  requestedByRoleLower === 'pm' ||
                                  ['pending', 'pm_request'].includes(r.status);  // Also filter by status
      return !isPMCreatedRequest && (r.status === 'send_to_pm' || (r.status === 'under_review' && r.approval_required_from === 'project_manager'));
    }).length,
    pending_approval: changeRequests.filter(r =>
        ['pending', 'pm_request', 'ss_request', 'mep_request', 'admin_request'].includes(r.status) ||  // Drafts (all role-based statuses)
        (r.status === 'under_review' && r.approval_required_from === 'estimator') ||  // Sent to Estimator
        (r.status === 'under_review' && r.approval_required_from === 'buyer') ||  // Sent to Buyer
        r.status === 'assigned_to_buyer'  // Assigned to Buyer
      ).length,  // ALL requests for pending tab sub-tabs (backend already filters by project)
    accepted: changeRequests.filter(r => r.status === 'approved_by_pm' || r.status === 'send_to_est' || r.status === 'send_to_buyer' || r.status === 'pending_td_approval' || r.status === 'split_to_sub_crs').length,  // approved_by_pm, send_to_est, send_to_buyer, pending_td_approval and split_to_sub_crs status
    completed_extra: changeRequests.filter(r => r.status === 'purchase_completed' || r.status === 'routed_to_store').length
  };

  // Sub-tab specific filtered data for "My Requests" (pending) tab
  const draftsRequests = useMemo(() =>
    filteredRequests.filter(r => ['pending', 'pm_request', 'ss_request', 'mep_request', 'admin_request'].includes(r.status)),
    [filteredRequests]
  );

  const sentToEstimatorRequests = useMemo(() =>
    filteredRequests.filter(r => r.status === 'under_review' && r.approval_required_from === 'estimator'),
    [filteredRequests]
  );

  const sentToBuyerRequests = useMemo(() =>
    filteredRequests.filter(r => (r.status === 'under_review' && r.approval_required_from === 'buyer') || r.status === 'assigned_to_buyer'),
    [filteredRequests]
  );

  // Get the correct data based on active tab and sub-tab
  const currentTabData = useMemo(() => {
    if (isExtraMaterial && activeTab === 'pending') {
      // For "My Requests" tab with sub-tabs
      switch (pendingSubTab) {
        case 'drafts': return draftsRequests;
        case 'sent_to_estimator': return sentToEstimatorRequests;
        case 'sent_to_buyer': return sentToBuyerRequests;
        default: return draftsRequests;
      }
    }
    // For other tabs, use the full filtered requests
    return filteredRequests;
  }, [isExtraMaterial, activeTab, pendingSubTab, filteredRequests, draftsRequests, sentToEstimatorRequests, sentToBuyerRequests]);

  // Paginated data for current tab/sub-tab
  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * perPage;
    const endIndex = startIndex + perPage;
    return currentTabData.slice(startIndex, endIndex);
  }, [currentTabData, currentPage, perPage]);

  if (initialLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="purple" />
      </div>
    );
  }

  // Table View Component
  const RequestsTable = ({ requests }: { requests: ChangeRequestItem[] }) => (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project Name</TableHead>
            <TableHead>Requested By</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>New Items</TableHead>
            {/* Hidden for PM role */}
            {/* <TableHead>Additional Cost</TableHead> */}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => {
            const isPMRequest = request.requested_by_user_id === user?.user_id;
            const showEditApproveReject = isExtraMaterial && activeTab === 'requested' && request.approval_required_from === 'project_manager';
            const showEditAndSend = isExtraMaterial && activeTab === 'pending' && isPMRequest && request.status === 'pending';
            const showOnlyView = (isExtraMaterial && (activeTab === 'accepted' || activeTab === 'completed' || activeTab === 'rejected')) || (!isExtraMaterial && (activeTab === 'approved' || activeTab === 'completed' || activeTab === 'rejected'));

            return (
              <TableRow key={request.cr_id}>
                <TableCell className="font-semibold">{request.project_name || request.boq_name}</TableCell>
                <TableCell>{request.requested_by_name}</TableCell>
                <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{request.materials_data?.length || 0}</TableCell>
                {/* Hidden for PM role */}
                {/* <TableCell className="font-semibold">{formatCurrency(request.materials_total_cost)}</TableCell> */}
                <TableCell>
                  <Badge className={getStatusColor(request.status)}>
                    {getStatusLabel(request.status, request.approval_required_from)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleReview(request.cr_id)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>

                    {/* Requested tab: Show Edit, Approve, Reject */}
                    {showEditApproveReject && (
                      <>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleEdit(request.cr_id)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApprove(request.cr_id)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleReject(request.cr_id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}

                    {/* Pending tab: Show Edit and Send buttons */}
                    {showEditAndSend && (
                      <>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleEdit(request.cr_id)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          className={request.materials_data?.some(mat => mat.master_material_id === null || mat.master_material_id === undefined)
                            ? "bg-blue-600 hover:bg-blue-700"
                            : "bg-green-600 hover:bg-green-700"}
                          onClick={() => handleSendForReview(request.cr_id)}
                          disabled={processingCrId === request.cr_id}
                        >
                          {processingCrId === request.cr_id ? 'Sending...' : (
                            request.materials_data?.some(mat => mat.master_material_id === null || mat.master_material_id === undefined)
                              ? 'Send to Estimator'
                              : 'Send to Buyer'
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Conditional theme */}
      <div className="bg-white border-b border-gray-200 shadow-sm mb-8">
        <div className="max-w-7xl mx-auto px-6 py-6 pr-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${isExtraMaterial ? "bg-gradient-to-br from-[#243d8a] to-[#4a5fa8]" : "bg-gradient-to-br from-[#243d8a] to-[#4a5fa8]"}`}>
                {isExtraMaterial ? <Box className="w-8 h-8 text-white" /> : <FileText className="w-8 h-8 text-white" />}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{isExtraMaterial ? "Material Purchase" : "Purchase Orders"}</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {isExtraMaterial ? "Manage extra sub-items for approved BOQs" : "Material additions to existing approved projects"}
                </p>
              </div>
            </div>
            {isExtraMaterial && (
              <Button
                onClick={() => setShowExtraForm(true)}
                className="bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] hover:from-[#1e3270] hover:to-[#3d4f8a] text-white px-6 py-3 font-semibold shadow-md"
              >
                <Plus className="w-5 h-5 mr-2" />
                MATERIAL PURCHASE
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Search Bar with Controls */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by project name or PM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-gray-200 focus:border-gray-300 focus:ring-0 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <Button
                size="sm"
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                className={`h-8 px-2 sm:px-3 ${viewMode === 'cards' ? 'text-white hover:opacity-90' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}
                style={viewMode === 'cards' ? { backgroundColor: 'rgb(36, 61, 138)' } : {}}
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Cards</span>
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                className={`h-8 px-2 sm:px-3 ${viewMode === 'table' ? 'text-white hover:opacity-90' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}
                style={viewMode === 'table' ? { backgroundColor: 'rgb(36, 61, 138)' } : {}}
                onClick={() => setViewMode('table')}
              >
                <List className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Table</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Content Tabs - Conditional based on Extra Material */}
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start p-2 h-auto bg-gray-50 rounded-xl mb-6 gap-2">
              {isExtraMaterial ? (
                <>
                  <TabsTrigger
                    value="requested"
                    className="rounded-lg border-2 border-transparent data-[state=active]:border-[#243d8a] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#243d8a]/10 data-[state=active]:to-[#4a5fa8]/10 data-[state=active]:text-[#243d8a] text-gray-500 px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50"
                  >
                    <Box className="w-4 h-4 mr-2" />
                    SE Requested
                    <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-100 data-[state=active]:bg-[#243d8a]/20 text-xs">({stats.my_requests})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="rounded-lg border-2 border-transparent data-[state=active]:border-[#243d8a] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#243d8a]/10 data-[state=active]:to-[#4a5fa8]/10 data-[state=active]:text-[#243d8a] text-gray-500 px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    My Requests
                    <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-100 data-[state=active]:bg-[#243d8a]/20 text-xs">({stats.pending_approval})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="accepted"
                    className="rounded-lg border-2 border-transparent data-[state=active]:border-[#243d8a] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#243d8a]/10 data-[state=active]:to-[#4a5fa8]/10 data-[state=active]:text-[#243d8a] text-gray-500 px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Accepted
                    <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-100 data-[state=active]:bg-[#243d8a]/20 text-xs">({stats.accepted})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="rounded-lg border-2 border-transparent data-[state=active]:border-[#243d8a] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#243d8a]/10 data-[state=active]:to-[#4a5fa8]/10 data-[state=active]:text-[#243d8a] text-gray-500 px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Completed
                    <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-100 data-[state=active]:bg-[#243d8a]/20 text-xs">({stats.completed_extra})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="rejected"
                    className="rounded-lg border-2 border-transparent data-[state=active]:border-red-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-50 data-[state=active]:to-red-100 data-[state=active]:text-red-600 text-gray-500 px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Rejected
                    <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-100 data-[state=active]:bg-red-100 text-xs">({stats.rejected})</span>
                  </TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger
                    value="pending"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-yellow-500 data-[state=active]:text-yellow-600 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Pending
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.pending})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="approved"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:text-blue-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approved
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.approved})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-400 data-[state=active]:text-green-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Completed
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.completed})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="rejected"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-400 data-[state=active]:text-red-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Rejected
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.rejected})</span>
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            {!isExtraMaterial && (
            <>
            <TabsContent value="pending" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Pending Review</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No change requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={paginatedRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {paginatedRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * index }}
                        className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200"
                      >
                        {/* Header */}
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                            <Badge className={getStatusColor(request.status)}>
                              {getStatusLabel(request.status, request.approval_required_from)}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
                            {request.project_code && (
                              <div className="flex items-center gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                            </div>
                            {request.area && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-medium text-emerald-600">{request.area}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">By: {request.requested_by_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="px-4 pb-3 text-center text-sm">
                          <span className="font-bold text-blue-600 text-lg">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-1">New Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>

                        {/* Budget Comparison - Hidden for PM role */}
                        {/* <div className="px-4 pb-3">
                          <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-3 border border-purple-200">
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-purple-700 font-medium">Original Budget:</span>
                                <span className="font-bold text-purple-900">{formatCurrency(request.budget_impact?.original_total)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-purple-700 font-medium">New Total:</span>
                                <span className="font-bold text-purple-900">{formatCurrency(request.budget_impact?.new_total_if_approved)}</span>
                              </div>
                              <div className="border-t border-purple-300 pt-2 flex justify-between">
                                <span className="text-red-600 font-semibold">Additional Cost:</span>
                                <span className="font-bold text-red-600">{formatCurrency(request.materials_total_cost)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Increase:</span>
                                <span className={`font-bold ${getPercentageColor((request.budget_impact?.increase_percentage || 0))}`}>
                                  +{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%
                                </span>
                              </div>
                              {((request.budget_impact?.increase_percentage || 0) > 15) && (
                                <div className="mt-2 pt-2 border-t border-purple-300">
                                  <div className="flex items-center gap-1 text-orange-600">
                                    <AlertCircle className="h-3 w-3" />
                                    <span className="text-xs font-semibold">Client Approval Needed (&gt;15%)</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div> */}

                        {/* POChildren (Vendor Splits) Info */}
                        {renderPOChildrenInfo(request)}

                        {/* Actions */}
                        <div className="border-t border-gray-200 p-2 sm:p-3 flex flex-col gap-2">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-4 w-4" />
                            <span>Review</span>
                          </button>

                          {request.status === 'pending' && (
                            <div className="space-y-2">
                              <button
                                onClick={() => handleEdit(request.cr_id)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold"
                              >
                                <Pencil className="h-4 w-4" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleSendForReview(request.cr_id)}
                                disabled={processingCrId === request.cr_id}
                                className={`w-full ${request.materials_data?.some(mat => mat.master_material_id === null || mat.master_material_id === undefined)
                                  ? 'bg-blue-600 hover:bg-blue-700'
                                  : 'bg-green-600 hover:bg-green-700'} text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1 font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                <Check className="h-4 w-4" />
                                <span>
                                  {processingCrId === request.cr_id ? 'Sending...' : (
                                    request.materials_data?.some(mat => mat.master_material_id === null || mat.master_material_id === undefined)
                                      ? 'Send to Estimator'
                                      : 'Send to Buyer'
                                  )}
                                </span>
                              </button>
                            </div>
                          )}

                          {request.status === 'under_review' && request.approval_required_from === 'project_manager' && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleApprove(request.cr_id)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold"
                              >
                                <Check className="h-4 w-4" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleReject(request.cr_id)}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold"
                              >
                                <X className="h-4 w-4" />
                                <span>Reject</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="approved" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Approved Requests (Pending Estimator)</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No approved requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={paginatedRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {paginatedRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * index }}
                        className="bg-white rounded-lg border border-blue-200 shadow-sm hover:shadow-lg transition-all duration-200"
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                            <Badge className={getStatusColor(request.status)}>
                              {getStatusLabel(request.status, request.approval_required_from)}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
                            {request.project_code && (
                              <div className="flex items-center gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                            </div>
                            {request.area && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-medium text-emerald-600">{request.area}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">By: {request.requested_by_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="px-4 pb-3 text-center text-sm">
                          <span className="font-bold text-blue-600 text-lg">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-1">New Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>

                        {/* Hidden for PM role */}
                        {/* <div className="px-4 pb-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Additional Cost:</span>
                            <span className="font-bold text-blue-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost Increase:</span>
                            <span className="font-semibold text-blue-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
                          </div>
                        </div> */}

                        {/* POChildren (Vendor Splits) Info */}
                        {renderPOChildrenInfo(request)}

                        <div className="border-t border-gray-200 p-2 sm:p-3">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="w-full text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span>View Details</span>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Completed Requests (Final Approval)</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No completed requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={paginatedRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {paginatedRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * index }}
                        className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-lg transition-all duration-200"
                      >
                        {/* Same card structure as pending */}
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                            <Badge className={getStatusColor(request.status)}>
                              {getStatusLabel(request.status, request.approval_required_from)}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
                            {request.project_code && (
                              <div className="flex items-center gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                            </div>
                            {request.area && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-medium text-emerald-600">{request.area}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">By: {request.requested_by_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="px-4 pb-3 text-center text-sm">
                          <span className="font-bold text-green-600 text-lg">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-1">New Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>

                        {/* Hidden for PM role */}
                        {/* <div className="px-4 pb-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Additional Cost:</span>
                            <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost Increase:</span>
                            <span className="font-semibold text-green-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
                          </div>
                        </div> */}

                        {/* POChildren (Vendor Splits) Info */}
                        {renderPOChildrenInfo(request)}

                        <div className="border-t border-gray-200 p-2 sm:p-3">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="w-full text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span>View Details</span>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="rejected" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Rejected Requests</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No rejected requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={paginatedRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {paginatedRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * index }}
                        className="bg-white rounded-lg border border-red-200 shadow-sm hover:shadow-lg transition-all duration-200 opacity-75"
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                            <Badge className={getStatusColor(request.status)}>REJECTED</Badge>
                          </div>
                          <div className="space-y-1 text-sm text-gray-600">
                            {request.project_code && (
                              <div className="flex items-center gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                            </div>
                            {request.area && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-medium text-emerald-600">{request.area}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">By: {request.requested_by_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="px-4 pb-3 text-center text-sm">
                          <span className="font-bold text-red-600 text-lg">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-1">New Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>
                        {/* Hidden for PM role */}
                        {/* <div className="px-4 pb-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Additional Cost:</span>
                            <span className="font-bold text-red-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost Increase:</span>
                            <span className="font-semibold text-red-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
                          </div>
                        </div> */}

                        {/* POChildren (Vendor Splits) Info */}
                        {renderPOChildrenInfo(request)}

                        <div className="border-t border-gray-200 p-2 sm:p-3">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="w-full text-white text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-4 w-4" />
                            <span>View Details</span>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            </>
            )}

            {/* Extra Material Tab Contents */}
            {isExtraMaterial && (
              <TabsContent value="requested" className="mt-0 p-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Requested</h2>
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No requests found</p>
                    </div>
                  ) : viewMode === 'table' ? (
                    <RequestsTable requests={paginatedRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {paginatedRequests.map((request, index) => (
                        <motion.div
                          key={request.cr_id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * index }}
                          className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200"
                        >
                          {/* Card content similar to pending */}
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                              <Badge className={getStatusColor(request.status)}>
                                {request.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </div>

                            <div className="space-y-1 text-sm text-gray-600">
                              {request.project_code && (
                                <div className="flex items-center gap-1.5">
                                  <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                              </div>
                              {request.area && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-medium text-emerald-600">{request.area}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">By: {request.requested_by_name}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="px-4 pb-3 text-center text-sm">
                            <span className="font-bold text-blue-600 text-lg">{(request.sub_items_data?.length || request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>

                          <div className="border-t border-gray-200 p-2 sm:p-3 flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleReview(request.cr_id)}
                                className="text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                                style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                              >
                                <Eye className="h-4 w-4" />
                                <span>Review Details</span>
                              </button>
                              <button
                                onClick={() => handleEdit(request.cr_id)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold"
                              >
                                <Pencil className="h-4 w-4" />
                                <span>Edit</span>
                              </button>
                            </div>
                            {/* SE requests: Show Approve/Reject buttons */}
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleApprove(request.cr_id)}
                                className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1 font-semibold"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>
                                  {/* Dynamic text based on material types */}
                                  {(() => {
                                    // Check if ANY material is new (has no master_material_id)
                                    const hasNewMaterials = request.materials_data?.some(mat =>
                                      mat.master_material_id === null ||
                                      mat.master_material_id === undefined ||
                                      mat.master_material_id === ''
                                    );

                                    return hasNewMaterials ? 'Approve & Send to Estimator' : 'Approve & Send to Buyer';
                                  })()}
                                </span>
                              </button>
                              <button
                                onClick={() => handleReject(request.cr_id)}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold"
                              >
                                <X className="h-4 w-4" />
                                <span>Reject</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {isExtraMaterial && (
              <TabsContent value="pending" className="mt-0 p-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Pending</h2>

                  {/* Sub-tabs for Pending */}
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl mb-4">
                    <button
                      onClick={() => setPendingSubTab('drafts')}
                      className={`rounded-lg border-2 border-transparent px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50 ${
                        pendingSubTab === 'drafts'
                          ? 'border-[#243d8a] bg-gradient-to-r from-[#243d8a]/10 to-[#4a5fa8]/10 text-[#243d8a]'
                          : 'text-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Pencil className="w-4 h-4" />
                        <span>Drafts (Not Sent)</span>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          pendingSubTab === 'drafts' ? 'bg-[#243d8a]/20' : 'bg-gray-100'
                        }`}>
                          ({draftsRequests.length})
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => setPendingSubTab('sent_to_estimator')}
                      className={`rounded-lg border-2 border-transparent px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50 ${
                        pendingSubTab === 'sent_to_estimator'
                          ? 'border-[#243d8a] bg-gradient-to-r from-[#243d8a]/10 to-[#4a5fa8]/10 text-[#243d8a]'
                          : 'text-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>Sent to Estimator</span>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          pendingSubTab === 'sent_to_estimator' ? 'bg-[#243d8a]/20' : 'bg-gray-100'
                        }`}>
                          ({sentToEstimatorRequests.length})
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => setPendingSubTab('sent_to_buyer')}
                      className={`rounded-lg border-2 border-transparent px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50 ${
                        pendingSubTab === 'sent_to_buyer'
                          ? 'border-[#243d8a] bg-gradient-to-r from-[#243d8a]/10 to-[#4a5fa8]/10 text-[#243d8a]'
                          : 'text-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>Sent to Buyer</span>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          pendingSubTab === 'sent_to_buyer' ? 'bg-[#243d8a]/20' : 'bg-gray-100'
                        }`}>
                          ({sentToBuyerRequests.length})
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Drafts Sub-tab Content */}
                  {pendingSubTab === 'drafts' && (
                    <>
                      {draftsRequests.length === 0 ? (
                        <div className="text-center py-12">
                          <Pencil className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 text-lg">No draft requests found</p>
                        </div>
                      ) : viewMode === 'table' ? (
                        <RequestsTable requests={paginatedRequests} />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedRequests.map((request, index) => (
                            <motion.div
                              key={request.cr_id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.05 * index }}
                              className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200"
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                                  <Badge className="bg-gray-100 text-gray-800">DRAFT</Badge>
                                </div>

                                <div className="space-y-1 text-sm text-gray-600">
                                  {request.project_code && (
                                    <div className="flex items-center gap-1.5">
                                      <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                                  </div>
                                  {request.area && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="truncate font-medium text-emerald-600">{request.area}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate">By: {request.requested_by_name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 pb-3 text-center text-sm">
                                <span className="font-bold text-gray-600 text-lg">{(request.sub_items_data?.length || request.materials_data?.length || 0)}</span>
                                <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                              </div>

                              {/* Hidden for PM role */}
                              {/* <div className="px-4 pb-3 space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Additional Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(request.materials_total_cost)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">% of Item Overhead:</span>
                                  <span className={`font-semibold ${getPercentageColor(request.percentage_of_item_overhead || 0)}`}>
                                    {(request.percentage_of_item_overhead || 0).toFixed(1)}%
                                  </span>
                                </div>
                              </div> */}

                              <div className="border-t border-gray-200 p-2 sm:p-3 flex flex-col gap-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => handleReview(request.cr_id)}
                                    className="text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                                    style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                                  >
                                    <Eye className="h-4 w-4" />
                                    <span>Review</span>
                                  </button>
                                  <button
                                    onClick={() => handleEdit(request.cr_id)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold"
                                  >
                                    <Pencil className="h-4 w-4" />
                                    <span>Edit</span>
                                  </button>
                                </div>
                                {/* Send for Review to Estimator or Buyer */}
                                <button
                                  onClick={() => handleSendForReview(request.cr_id)}
                                  disabled={processingCrId === request.cr_id}
                                  className={`w-full ${request.materials_data?.some(mat => mat.master_material_id === null || mat.master_material_id === undefined)
                                    ? 'bg-blue-600 hover:bg-blue-700'
                                    : 'bg-green-600 hover:bg-green-700'} text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                  <Check className="h-4 w-4" />
                                  <span>
                                    {processingCrId === request.cr_id ? 'Sending...' : (
                                      request.materials_data?.some(mat => mat.master_material_id === null || mat.master_material_id === undefined)
                                        ? 'Send to Estimator'
                                        : 'Send to Buyer'
                                    )}
                                  </span>
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Sent to Estimator Sub-tab Content */}
                  {pendingSubTab === 'sent_to_estimator' && (
                    <>
                      {sentToEstimatorRequests.length === 0 ? (
                        <div className="text-center py-12">
                          <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 text-lg">No requests sent to estimator</p>
                        </div>
                      ) : viewMode === 'table' ? (
                        <RequestsTable requests={paginatedRequests} />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedRequests.map((request, index) => (
                            <motion.div
                              key={request.cr_id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.05 * index }}
                              className="bg-white rounded-lg border border-yellow-200 shadow-sm hover:shadow-lg transition-all duration-200"
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                                  <Badge className={getStatusColor(request.status)}>
                                    {getStatusLabel(request.status, request.approval_required_from)}
                                  </Badge>
                                </div>

                                <div className="space-y-1 text-sm text-gray-600">
                                  {request.project_code && (
                                    <div className="flex items-center gap-1.5">
                                      <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                                  </div>
                                  {request.area && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="truncate font-medium text-emerald-600">{request.area}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate">By: {request.requested_by_name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 pb-3 text-center text-sm">
                                <span className="font-bold text-yellow-600 text-lg">{(request.sub_items_data?.length || request.materials_data?.length || 0)}</span>
                                <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                              </div>

                              {/* Hidden for PM role */}
                              {/* <div className="px-4 pb-3 space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Additional Cost:</span>
                                  <span className="font-bold text-yellow-600">{formatCurrency(request.materials_total_cost)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">% of Item Overhead:</span>
                                  <span className={`font-semibold ${getPercentageColor(request.percentage_of_item_overhead || 0)}`}>
                                    {(request.percentage_of_item_overhead || 0).toFixed(1)}%
                                  </span>
                                </div>
                              </div> */}

                              {/* POChildren (Vendor Splits) Info */}
                              {renderPOChildrenInfo(request)}

                              {/* View-only: Only show Review button */}
                              <div className="border-t border-gray-200 p-2 sm:p-3">
                                <button
                                  onClick={() => handleReview(request.cr_id)}
                                  className="w-full text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                                  style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                                >
                                  <Eye className="h-4 w-4" />
                                  <span>View Details</span>
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Sent to Buyer Sub-tab Content */}
                  {pendingSubTab === 'sent_to_buyer' && (
                    <>
                      {sentToBuyerRequests.length === 0 ? (
                        <div className="text-center py-12">
                          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 text-lg">No requests sent to buyer</p>
                        </div>
                      ) : viewMode === 'table' ? (
                        <RequestsTable requests={paginatedRequests} />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                          {paginatedRequests.map((request, index) => (
                            <motion.div
                              key={request.cr_id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.05 * index }}
                              className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-lg transition-all duration-200"
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                                  <Badge className="bg-purple-100 text-purple-800">ASSIGNED TO BUYER</Badge>
                                </div>

                                <div className="space-y-1 text-sm text-gray-600">
                                  {request.project_code && (
                                    <div className="flex items-center gap-1.5">
                                      <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                                  </div>
                                  {request.area && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                      <span className="truncate font-medium text-emerald-600">{request.area}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate">By: {request.requested_by_name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="px-4 pb-3 text-center text-sm">
                                <span className="font-bold text-purple-600 text-lg">{(request.materials_data?.length || 0)}</span>
                                <span className="text-gray-600 ml-1">Material{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                              </div>

                              {/* Hidden for PM role */}
                              {/* <div className="px-4 pb-3">
                                <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
                                  <div className="flex justify-between items-center">
                                    <span className="text-green-700 text-xs font-medium">Total Cost:</span>
                                    <span className="font-bold text-green-900">{formatCurrency(request.materials_total_cost)}</span>
                                  </div>
                                </div>
                              </div> */}

                              {/* POChildren (Vendor Splits) Info */}
                              {renderPOChildrenInfo(request)}

                              <div className="border-t border-gray-200 p-3">
                                <button
                                  onClick={() => handleReview(request.cr_id)}
                                  className="w-full text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                                  style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                                >
                                  <Eye className="h-4 w-4" />
                                  <span>View Details</span>
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>
            )}

            {isExtraMaterial && (
              <TabsContent value="accepted" className="mt-0 p-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Accepted</h2>
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No accepted requests found</p>
                    </div>
                  ) : viewMode === 'table' ? (
                    <RequestsTable requests={paginatedRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {paginatedRequests.map((request, index) => (
                        <motion.div
                          key={request.cr_id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * index }}
                          className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-lg transition-all duration-200"
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                              <Badge className="bg-green-100 text-green-800">ACCEPTED</Badge>
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                              {request.project_code && (
                                <div className="flex items-center gap-1.5">
                                  <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                              </div>
                              {request.area && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-medium text-emerald-600">{request.area}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">By: {request.requested_by_name}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-3 text-center text-sm">
                            <span className="font-bold text-green-600 text-lg">{(request.sub_items_data?.length || request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>
                          {/* Hidden for PM role */}
                          {/* <div className="px-4 pb-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
                          </div> */}

                          {/* POChildren (Vendor Splits) Info */}
                          {renderPOChildrenInfo(request)}

                          <div className="border-t border-gray-200 p-2 sm:p-3">
                            <button
                              onClick={() => handleReview(request.cr_id)}
                              className="w-full text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                              style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                            >
                              <Eye className="h-4 w-4" />
                              <span>View Details</span>
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {isExtraMaterial && (
              <TabsContent value="completed" className="mt-0 p-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Completed</h2>
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No completed requests found</p>
                    </div>
                  ) : viewMode === 'table' ? (
                    <RequestsTable requests={paginatedRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {paginatedRequests.map((request, index) => (
                        <motion.div
                          key={request.cr_id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * index }}
                          className="bg-white rounded-lg border border-purple-200 shadow-sm hover:shadow-lg transition-all duration-200"
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                              <Badge className="bg-purple-100 text-purple-800">COMPLETED</Badge>
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                              {request.project_code && (
                                <div className="flex items-center gap-1.5">
                                  <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                              </div>
                              {request.area && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-medium text-emerald-600">{request.area}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">By: {request.requested_by_name}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-3 text-center text-sm">
                            <span className="font-bold text-purple-600 text-lg">{(request.sub_items_data?.length || request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>
                          {/* Hidden for PM role */}
                          {/* <div className="px-4 pb-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-purple-600">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
                          </div> */}

                          {/* POChildren (Vendor Splits) Info */}
                          {renderPOChildrenInfo(request)}

                          <div className="border-t border-gray-200 p-2 sm:p-3">
                            <button
                              onClick={() => handleReview(request.cr_id)}
                              className="w-full text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                              style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                            >
                              <Eye className="h-4 w-4" />
                              <span>View Details</span>
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {isExtraMaterial && (
              <TabsContent value="rejected" className="mt-0 p-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Rejected Requests</h2>
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No rejected requests found</p>
                    </div>
                  ) : viewMode === 'table' ? (
                    <RequestsTable requests={paginatedRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {paginatedRequests.map((request, index) => (
                        <motion.div
                          key={request.cr_id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * index }}
                          className="bg-white rounded-lg border border-red-200 shadow-sm hover:shadow-lg transition-all duration-200 opacity-75"
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                              <Badge className="bg-red-100 text-red-800">REJECTED</Badge>
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                              {request.project_code && (
                                <div className="flex items-center gap-1.5">
                                  <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-semibold">Project Code: {request.project_code}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate font-semibold text-indigo-600">PO-{request.cr_id}</span>
                              </div>
                              {request.area && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="truncate font-medium text-emerald-600">{request.area}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">By: {request.requested_by_name}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-3 text-center text-sm">
                            <span className="font-bold text-red-600 text-lg">{(request.sub_items_data?.length || request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>
                          <div className="px-4 pb-3 space-y-1.5 text-xs">
                            {/* Hidden for PM role */}
                            {/* <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-red-600">{formatCurrency(request.materials_total_cost)}</span>
                            </div> */}
                            {request.rejection_reason && (
                              <div className="pt-2 border-t border-red-200">
                                <p className="text-xs font-medium text-red-900">Rejection Reason:</p>
                                <p className="text-xs text-red-700 mt-1 line-clamp-2">{request.rejection_reason}</p>
                              </div>
                            )}
                            {request.rejected_by_name && (
                              <div className="text-xs text-gray-500">
                                <p>Rejected by: <span className="font-medium text-red-700">{request.rejected_by_name}</span></p>
                              </div>
                            )}
                          </div>

                          {/* POChildren (Vendor Splits) Info */}
                          {renderPOChildrenInfo(request)}

                          <div className="border-t border-gray-200 p-2 sm:p-3">
                            <button
                              onClick={() => handleReview(request.cr_id)}
                              className="w-full text-white text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1.5 font-semibold"
                              style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                            >
                              <Eye className="h-4 w-4" />
                              <span>View Details</span>
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>

          {/* ✅ PERFORMANCE: Pagination Controls - Based on current tab/sub-tab data */}
          {(() => {
            const totalFilteredCount = currentTabData.length;
            const totalFilteredPages = Math.ceil(totalFilteredCount / perPage);
            const startItem = totalFilteredCount > 0 ? (currentPage - 1) * perPage + 1 : 0;
            const endItem = Math.min(currentPage * perPage, totalFilteredCount);

            if (totalFilteredCount === 0) return null;

            return (
              <div className="flex items-center justify-between bg-white border-t border-gray-200 rounded-b-lg p-4 mt-6">
                <div className="text-sm text-gray-700">
                  Showing {startItem} to {endItem} of {totalFilteredCount} results
                  {totalFilteredPages > 1 && (
                    <span className="text-gray-500 ml-2">(Page {currentPage} of {totalFilteredPages})</span>
                  )}
                </div>
                {totalFilteredPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalFilteredPages }, (_, i) => i + 1).map(page => {
                        const showPage =
                          page === 1 ||
                          page === totalFilteredPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1);

                        if (!showPage) {
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
                                ? 'text-white font-medium'
                                : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                            style={currentPage === page ? { backgroundColor: 'rgb(36, 61, 138)' } : {}}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalFilteredPages, prev + 1))}
                      disabled={currentPage === totalFilteredPages}
                      className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Change Request Details Modal */}
      <ChangeRequestDetailsModal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedChangeRequest(null);
          // Clear URL parameters to prevent auto-reopen
          setSearchParams({});
        }}
        changeRequest={selectedChangeRequest}
        onApprove={handleApproveFromModal}
        onReject={handleRejectFromModal}
        canApprove={permissions.canApproveChangeRequest(user) && selectedChangeRequest?.status !== 'approved' && selectedChangeRequest?.status !== 'rejected'}
      />

      {/* Edit Change Request Modal */}
      {selectedChangeRequest && (
        <EditChangeRequestModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedChangeRequest(null);
            // Clear URL parameters to prevent auto-reopen
            setSearchParams({});
          }}
          changeRequest={selectedChangeRequest}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Rejection Reason Modal */}
      <RejectionReasonModal
        isOpen={showRejectionModal}
        onClose={() => {
          setShowRejectionModal(false);
          setRejectingCrId(null);
        }}
        onSubmit={handleRejectSubmit}
        title="Reject Change Request"
      />

      {/* Purchase Request Modal - with Materials and Preliminaries tabs */}
      {showExtraForm && (
        <PurchaseRequestModal
          onClose={() => {
            setShowExtraForm(false);
            refetch();
          }}
        />
      )}

      {/* Buyer Selection Modal */}
      {showBuyerSelectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Approve Change Request</h3>
                    <p className="text-green-50 text-sm">CR-{approvingCrId}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowBuyerSelectionModal(false);
                    setApprovingCrId(null);
                    setSelectedBuyerId(null);
                  }}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content - Scrollable with visible styled scrollbar */}
            <div
              className="flex-1 overflow-y-auto p-6 custom-scrollbar"
              style={{
                scrollBehavior: 'smooth',
              }}
            >
              <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                  width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: #f1f5f9;
                  border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: #cbd5e1;
                  border-radius: 10px;
                  transition: background 0.2s;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: #94a3b8;
                }
                .custom-scrollbar {
                  scrollbar-width: thin;
                  scrollbar-color: #cbd5e1 #f1f5f9;
                }
              `}</style>
              {/* Assign to Procurement Section */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-5 h-5 text-gray-700" />
                  <label className="text-sm font-semibold text-gray-900">
                    Assign to Procurement <span className="text-red-500">*</span>
                  </label>
                </div>

                {/* Buyers List - Scrollable */}
                <div
                  className="space-y-4 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar"
                  style={{ scrollBehavior: 'smooth' }}
                >
                  {buyers.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No buyers available</p>
                    </div>
                  ) : (
                    <>
                      {/* Online Buyers */}
                      {buyers.filter(b => b.is_active === true).length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Online</span>
                            <div className="flex-1 h-px bg-green-200"></div>
                          </div>
                          <div className="space-y-3">
                            {buyers.filter(b => b.is_active === true).map((buyer) => {
                              const initials = buyer.full_name
                                ? buyer.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                                : buyer.username.slice(0, 2).toUpperCase();
                              return (
                                <label
                                  key={buyer.user_id}
                                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    selectedBuyerId === buyer.user_id
                                      ? 'border-green-500 bg-green-50 shadow-sm'
                                      : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                                  }`}
                                  onClick={() => setSelectedBuyerId(buyer.user_id)}
                                >
                                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg relative ${
                                    selectedBuyerId === buyer.user_id ? 'bg-green-600' : 'bg-blue-600'
                                  }`}>
                                    {initials}
                                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-gray-900">{buyer.full_name || buyer.username}</span>
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                        Online
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-500 mt-0.5">{buyer.username}</div>
                                  </div>
                                  <input
                                    type="radio"
                                    name="buyer"
                                    value={buyer.user_id}
                                    checked={selectedBuyerId === buyer.user_id}
                                    onChange={() => setSelectedBuyerId(buyer.user_id)}
                                    className="w-5 h-5 text-green-600 focus:ring-green-500"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Offline Buyers */}
                      {buyers.filter(b => b.is_active !== true).length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Offline</span>
                            <div className="flex-1 h-px bg-gray-200"></div>
                          </div>
                          <div className="space-y-3">
                            {buyers.filter(b => b.is_active !== true).map((buyer) => {
                              const initials = buyer.full_name
                                ? buyer.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                                : buyer.username.slice(0, 2).toUpperCase();
                              return (
                                <label
                                  key={buyer.user_id}
                                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    selectedBuyerId === buyer.user_id
                                      ? 'border-gray-400 bg-gray-100 shadow-sm'
                                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                  }`}
                                  onClick={() => setSelectedBuyerId(buyer.user_id)}
                                >
                                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg bg-gray-400 relative">
                                    {initials}
                                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-gray-400 rounded-full border-2 border-white" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-gray-700">{buyer.full_name || buyer.username}</span>
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                                        Offline
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-500 mt-0.5">{buyer.username}</div>
                                  </div>
                                  <input
                                    type="radio"
                                    name="buyer"
                                    value={buyer.user_id}
                                    checked={selectedBuyerId === buyer.user_id}
                                    onChange={() => setSelectedBuyerId(buyer.user_id)}
                                    className="w-5 h-5 text-gray-500 focus:ring-gray-400"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Offline email hint */}
                {(() => {
                  const selBuyer = buyers.find(b => b.user_id === selectedBuyerId);
                  return selBuyer && selBuyer.is_active !== true ? (
                    <p className="text-xs mt-2 text-amber-600 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      This buyer is offline. An email notification will be sent to notify them.
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Comments Section */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Comments (Optional)
                </label>
                <textarea
                  placeholder="Add any approval notes..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none"
                  rows={3}
                />
              </div>

              {/* Info Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Note:</span> Approving this request will assign it to the selected procurement team for purchase and merge the materials into the BOQ.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => {
                  setShowBuyerSelectionModal(false);
                  setApprovingCrId(null);
                  setSelectedBuyerId(null);
                }}
                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleBuyerSelection}
                disabled={!selectedBuyerId}
                className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
              >
                <Check className="w-5 h-5" />
                Approve & Assign
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ✅ PERFORMANCE FIX: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(ChangeRequestsPage);
