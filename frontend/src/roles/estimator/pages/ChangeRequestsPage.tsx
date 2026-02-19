import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  FileText,
  Package,
  Calendar,
  LayoutGrid,
  List,
  Pencil,
  MapPin
} from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import RejectionReasonModal from '@/components/modals/RejectionReasonModal';
import ApprovalWithBuyerModal from '@/components/modals/ApprovalWithBuyerModal';
import EditChangeRequestModal from '@/components/modals/EditChangeRequestModal';
import { useAuthStore } from '@/store/authStore';
import { permissions } from '@/utils/rolePermissions';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';

const ChangeRequestsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get tab and cr_id from URL query parameters (for notification redirects)
  const urlTab = searchParams.get('tab');
  const urlCrId = searchParams.get('cr_id');

  const [activeTab, setActiveTab] = useState(() => {
    // Priority: URL tab param > default
    if (urlTab) {
      const validTabs = ['pending', 'approved', 'completed', 'rejected'];
      if (validTabs.includes(urlTab)) {
        return urlTab;
      }
    }
    return 'pending';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // ✅ PERFORMANCE: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<{
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  } | null>(null);
  const perPage = 20;
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectingCrId, setRejectingCrId] = useState<number | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvingCrId, setApprovingCrId] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Track if we've already auto-opened modal from URL (to prevent reopening on close)
  const hasAutoOpenedRef = useRef<string | null>(null);

  // ✅ LISTEN TO REAL-TIME UPDATES - This makes data reload automatically!
  const changeRequestUpdateTimestamp = useRealtimeUpdateStore(state => state.changeRequestUpdateTimestamp);

  // Fetch purchase requests from backend - real-time subscriptions handle updates
  useEffect(() => {
    // Initial load with toasts
    loadChangeRequests(true);

    // NO POLLING! Real-time subscriptions in realtimeSubscriptions.ts
    // automatically invalidate queries when change_requests table changes.
    // This eliminates 30 requests/min per user and provides instant updates.
  }, []);

  // ✅ RELOAD change requests when real-time update is received
  useEffect(() => {
    // Skip initial mount
    if (changeRequestUpdateTimestamp === 0) return;

    loadChangeRequests(false); // Silent reload without toasts
  }, [changeRequestUpdateTimestamp]); // Reload whenever timestamp changes

  // ✅ PERFORMANCE: Reload when page changes
  useEffect(() => {
    if (!initialLoad) {
      loadChangeRequests(false);
    }
  }, [currentPage]);

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

  const loadChangeRequests = async (showToasts = false) => {
    try {
      // ✅ PERFORMANCE: Use pagination to reduce data load
      const response = await changeRequestService.getChangeRequests(currentPage, perPage);

      if (response.success) {
        setChangeRequests(response.data);
        if (response.pagination) {
          setPagination(response.pagination);
        }
        // Only show success toast on initial load to avoid spam
        if (showToasts && response.data.length > 0) {
          showSuccess(`Loaded ${response.data.length} purchase request(s)`);
        }
      } else {
        // Only show error toast on initial load to avoid spam
        if (showToasts) {
          showError(response.message || 'Failed to load purchase requests');
        }
      }
    } catch (error) {
      console.error('[ChangeRequests] Error loading change requests:', error);
      // Only show error toast on initial load to avoid spam
      if (showToasts) {
        showError('Failed to load purchase requests');
      }
    } finally {
      if (initialLoad) {
        setInitialLoad(false);
      }
    }
  };

  const handleApprove = (crId: number) => {
    // Show buyer selection modal before approving
    setApprovingCrId(crId);
    setShowApprovalModal(true);
  };

  const handleApprovalSuccess = () => {
    loadChangeRequests();
    setShowApprovalModal(false);
    setApprovingCrId(null);
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
        showSuccess('Purchase request rejected');
        loadChangeRequests();
        setShowRejectionModal(false);
        setRejectingCrId(null);
      } else {
        showError(response.message);
      }
    } catch (error) {
      showError('Failed to reject purchase request');
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
      showError('Failed to load purchase request details');
    }
  };

  const handleApproveFromModal = () => {
    if (!selectedChangeRequest) return;

    // Store edited materials if available (from price editing in details modal)
    const editedMaterials = (selectedChangeRequest as any)._editedMaterials;
    if (editedMaterials) {
      // Store in a ref or state that ApprovalWithBuyerModal can access
      (window as any).__editedMaterials = editedMaterials;
    }

    setShowDetailsModal(false);
    handleApprove(selectedChangeRequest.cr_id);
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

  const handleEdit = async (crId: number) => {
    try {
      // Fetch full change request details including negotiable_margin_analysis
      const response = await changeRequestService.getChangeRequestDetail(crId);
      if (response.success && response.data) {
        setSelectedChangeRequest(response.data);
        setShowEditModal(true);
      } else {
        showError(response.message || 'Failed to load PO details');
      }
    } catch (error) {
      console.error('Error loading PO for edit:', error);
      showError('Failed to load PO details');
    }
  };

  // Format currency for display
  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return 'AED 0';
    return `AED ${amount.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      send_to_est: 'bg-yellow-100 text-yellow-800',
      pending_td_approval: 'bg-amber-100 text-amber-800',
      approved_estimator: 'bg-green-100 text-green-800',
      approved_by_pm: 'bg-green-100 text-green-800',
      send_to_buyer: 'bg-green-100 text-green-800',
      assigned_to_buyer: 'bg-purple-100 text-purple-800',
      approved_td: 'bg-blue-100 text-blue-800',
      purchase_completed: 'bg-green-100 text-green-800',
      routed_to_store: 'bg-teal-100 text-teal-800',
      rejected: 'bg-red-100 text-red-800',
      split_to_sub_crs: 'bg-indigo-100 text-indigo-800',
      vendor_approved: 'bg-teal-100 text-teal-800'
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };



  const filteredRequests = changeRequests.filter(req => {
    const projectName = req.project_name || req.boq_name || '';
    const searchLower = searchTerm.toLowerCase().trim();
    // ✅ Search by ID (PO-123, 123), project code (MSQ26), project name, or requester name
    const idString = `po-${req.cr_id}`;
    const matchesSearch = !searchTerm ||
                         projectName.toLowerCase().includes(searchLower) ||
                         req.requested_by_name.toLowerCase().includes(searchLower) ||
                         req.project_code?.toLowerCase().includes(searchLower) ||
                         idString.includes(searchLower) ||
                         req.cr_id.toString().includes(searchTerm.trim());
    const matchesTab = (
      (activeTab === 'pending' && (req.status === 'send_to_est' || req.status === 'under_review' || (req.approval_required_from === 'estimator' && req.status !== 'assigned_to_buyer' && req.status !== 'approved_by_pm' && req.status !== 'rejected' && req.status !== 'purchase_completed' && req.status !== 'routed_to_store' && req.status !== 'sent_to_store' && req.status !== 'pending_td_approval'))) ||
      (activeTab === 'approved' && (req.status === 'assigned_to_buyer' || req.status === 'approved_by_pm' || req.status === 'send_to_buyer' || req.status === 'pending_td_approval' || req.status === 'split_to_sub_crs' || req.status === 'sent_to_store' || req.status === 'vendor_approved')) ||
      (activeTab === 'escalated' && (req.status === 'purchase_completed' || req.status === 'routed_to_store')) ||
      (activeTab === 'rejected' && req.status === 'rejected')
    );
    return matchesSearch && matchesTab;
  });

  const stats = {
    pending: changeRequests.filter(r => r.status === 'send_to_est' || r.status === 'under_review' || (r.approval_required_from === 'estimator' && r.status !== 'assigned_to_buyer' && r.status !== 'approved_by_pm' && r.status !== 'rejected' && r.status !== 'purchase_completed' && r.status !== 'routed_to_store' && r.status !== 'sent_to_store' && r.status !== 'pending_td_approval')).length,
    approved: changeRequests.filter(r => r.status === 'assigned_to_buyer' || r.status === 'approved_by_pm' || r.status === 'send_to_buyer' || r.status === 'pending_td_approval' || r.status === 'split_to_sub_crs' || r.status === 'sent_to_store' || r.status === 'vendor_approved').length,
    escalated: changeRequests.filter(r => r.status === 'purchase_completed' || r.status === 'routed_to_store').length,
    rejected: changeRequests.filter(r => r.status === 'rejected').length
  };

  // ✅ Client-side pagination per tab
  const tabItemsPerPage = 20;
  const [tabPage, setTabPage] = useState(1);

  // Reset page when tab changes
  useEffect(() => {
    setTabPage(1);
  }, [activeTab]);

  // Get paginated items for current tab
  const paginatedRequests = useMemo(() => {
    const startIndex = (tabPage - 1) * tabItemsPerPage;
    return filteredRequests.slice(startIndex, startIndex + tabItemsPerPage);
  }, [filteredRequests, tabPage, tabItemsPerPage]);

  // Get pagination info for current tab
  const getTabPaginationInfo = () => {
    const totalItems = filteredRequests.length;
    const totalPages = Math.ceil(totalItems / tabItemsPerPage) || 1;
    const startIndex = (tabPage - 1) * tabItemsPerPage;
    return {
      totalItems,
      totalPages,
      startIndex,
      hasNext: tabPage < totalPages,
      hasPrev: tabPage > 1
    };
  };

  if (initialLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
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
            <TableHead>Materials</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.cr_id}>
              <TableCell className="font-semibold">{request.project_name || request.boq_name}</TableCell>
              <TableCell>{request.requested_by_name}</TableCell>
              <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
              <TableCell>{request.materials_data?.length || 0}</TableCell>
              <TableCell>
                <Badge className={getStatusColor(request.status)}>
                  {request.status.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleReview(request.cr_id)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  {(request.status === 'send_to_est' || (request.approval_required_from === 'estimator' && request.status !== 'approved_by_pm' && request.status !== 'send_to_buyer' && request.status !== 'assigned_to_buyer' && request.status !== 'rejected')) && (
                    <>
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 hover:bg-blue-50" onClick={() => handleEdit(request.cr_id)}>
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
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header - Blue theme for Purchase Requests */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#4a5fa8]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <FileText className="w-6 h-6 text-[#243d8a]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#243d8a]">Purchase Requests</h1>
              <p className="text-sm text-gray-600">Material additions to existing approved projects</p>
            </div>
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

        {/* Content Tabs - Match EstimatorHub Style */}
        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start p-0 h-auto bg-transparent border-b border-gray-200 mb-6">
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
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-400 data-[state=active]:text-green-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approved
                <span className="ml-1 sm:ml-2 text-gray-400">({stats.approved})</span>
              </TabsTrigger>
              <TabsTrigger
                value="escalated"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#243d8a] data-[state=active]:text-[#243d8a] text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Completed
                <span className="ml-1 sm:ml-2 text-gray-400">({stats.escalated})</span>
              </TabsTrigger>
              <TabsTrigger
                value="rejected"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-400 data-[state=active]:text-red-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Rejected
                <span className="ml-1 sm:ml-2 text-gray-400">({stats.rejected})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Pending Review</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No purchase requests found</p>
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
                              {request.status.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
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
                        <div className="px-4 pb-3 flex justify-center gap-4 text-sm">
                          <div className="text-center">
                            <span className="font-bold text-blue-600 text-lg">{(request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">{(request.materials_data?.length || 0) === 1 ? 'material' : 'materials'}</span>
                          </div>
                          <div className="text-center border-l pl-4">
                            <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="border-t border-gray-200 p-2 sm:p-3 flex flex-col gap-2">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="w-full text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span>Review</span>
                          </button>
                          {(request.status === 'send_to_est' || (request.approval_required_from === 'estimator' && request.status !== 'approved_by_pm' && request.status !== 'send_to_buyer' && request.status !== 'assigned_to_buyer' && request.status !== 'rejected')) && (
                            <>
                              <button
                                onClick={() => handleEdit(request.cr_id)}
                                className="w-full border-2 border-blue-300 text-blue-600 text-[10px] sm:text-xs h-8 rounded hover:bg-blue-50 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                              >
                                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                <span>Edit</span>
                              </button>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleApprove(request.cr_id)}
                                  className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                                  style={{ backgroundColor: 'rgb(22, 163, 74)' }}
                                >
                                  <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  <span className="hidden sm:inline">Approve & Send to Buyer</span>
                                  <span className="sm:hidden">Approve</span>
                                </button>
                                <button
                                  onClick={() => handleReject(request.cr_id)}
                                  className="bg-red-600 hover:bg-red-700 text-white text-[10px] sm:text-xs h-8 rounded transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                                >
                                  <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  <span className="hidden sm:inline">Reject</span>
                                  <span className="sm:hidden">No</span>
                                </button>
                              </div>
                            </>
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
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Approved Requests</h2>
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
                        className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-lg transition-all duration-200"
                      >
                        {/* Same card structure as pending */}
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                            <Badge className={getStatusColor(request.status)}>
                              {request.status.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
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

                        <div className="px-4 pb-3 flex justify-center gap-4 text-sm">
                          <div className="text-center">
                            <span className="font-bold text-green-600 text-lg">{(request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">{(request.materials_data?.length || 0) === 1 ? 'material' : 'materials'}</span>
                          </div>
                          <div className="text-center border-l pl-4">
                            <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                        </div>

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

            <TabsContent value="escalated" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Completed Requests</h2>
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
                        className="bg-white rounded-lg border-2 border-green-300 shadow-sm hover:shadow-lg transition-all duration-200"
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                            <Badge className="bg-green-100 text-green-800">COMPLETED</Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
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

                        <div className="px-4 pb-3 flex justify-center gap-4 text-sm">
                          <div className="text-center">
                            <span className="font-bold text-green-600 text-lg">{(request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">{(request.materials_data?.length || 0) === 1 ? 'material' : 'materials'}</span>
                          </div>
                          <div className="text-center border-l pl-4">
                            <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                        </div>

                        {/* POChildren hidden - Estimator doesn't need vendor split details */}

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

                        <div className="px-4 pb-3 flex justify-center gap-4 text-sm">
                          <div className="text-center">
                            <span className="font-bold text-red-600 text-lg">{(request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">{(request.materials_data?.length || 0) === 1 ? 'material' : 'materials'}</span>
                          </div>
                          <div className="text-center border-l pl-4">
                            <span className="font-bold text-red-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                        </div>

                        {/* POChildren hidden - Estimator doesn't need vendor split details */}

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
          </Tabs>

          {/* ✅ PERFORMANCE: Pagination Controls - Per Tab */}
          {(() => {
            const tabPagination = getTabPaginationInfo();
            const { totalItems, totalPages, startIndex, hasNext, hasPrev } = tabPagination;

            return (
              <div className="flex items-center justify-between bg-white border-t border-gray-200 rounded-b-lg p-4 mt-6">
                <div className="text-sm text-gray-600 font-medium">
                  Showing {totalItems > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + tabItemsPerPage, totalItems)} of {totalItems} results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTabPage(prev => Math.max(1, prev - 1))}
                    disabled={!hasPrev}
                    className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ color: 'rgb(36, 61, 138)' }}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setTabPage(page)}
                      className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                        tabPage === page
                          ? 'border-[rgb(36,61,138)] bg-blue-50'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                      style={{ color: tabPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setTabPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={!hasNext}
                    className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ color: 'rgb(36, 61, 138)' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Purchase Request Details Modal */}
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

      {/* Rejection Reason Modal */}
      <RejectionReasonModal
        isOpen={showRejectionModal}
        onClose={() => {
          setShowRejectionModal(false);
          setRejectingCrId(null);
        }}
        onSubmit={handleRejectSubmit}
        title="Reject Purchase Request"
      />

      {/* Approval with Buyer Selection Modal */}
      {approvingCrId && (
        <ApprovalWithBuyerModal
          isOpen={showApprovalModal}
          onClose={() => {
            setShowApprovalModal(false);
            setApprovingCrId(null);
          }}
          crId={approvingCrId}
          crName={`CR-${approvingCrId}`}
          onSuccess={handleApprovalSuccess}
        />
      )}

      {/* Edit Purchase Request Modal */}
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
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedChangeRequest(null);
            loadChangeRequests(true);
            showSuccess('Purchase request updated successfully');
            // Clear URL parameters to prevent auto-reopen
            setSearchParams({});
          }}
        />
      )}
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (718 lines)
export default React.memo(ChangeRequestsPage);
