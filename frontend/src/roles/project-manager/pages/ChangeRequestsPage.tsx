import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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
  Pencil
} from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import EditChangeRequestModal from '@/components/modals/EditChangeRequestModal';
import RejectionReasonModal from '@/components/modals/RejectionReasonModal';
import ExtraMaterialForm from '@/components/change-requests/ExtraMaterialForm';
import { useChangeRequestsAutoSync } from '@/hooks/useAutoSync';
import { permissions } from '@/utils/rolePermissions';

const ChangeRequestsPage: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const isExtraMaterial = location.pathname.includes('extra-material');
  const [activeTab, setActiveTab] = useState(isExtraMaterial ? 'requested' : 'pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectingCrId, setRejectingCrId] = useState<number | null>(null);
  const [showExtraForm, setShowExtraForm] = useState(false);

  // Real-time auto-sync hook - no manual polling needed
  const { data: changeRequestsData, isLoading, isFetching, refetch } = useChangeRequestsAutoSync(
    async () => {
      const response = await changeRequestService.getChangeRequests();
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Failed to load change requests');
    }
  );

  const changeRequests = useMemo(() => changeRequestsData || [], [changeRequestsData]);
  const initialLoad = isLoading;

  const handleSendForReview = async (crId: number, routeTo?: 'technical_director' | 'estimator') => {
    try {
      const response = await changeRequestService.sendForReview(crId, routeTo);
      if (response.success) {
        toast.success(response.message || 'Request sent for review');
        refetch(); // Trigger background refresh
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('Failed to send request for review');
    }
  };

  const handleSendToTD = async (crId: number) => {
    await handleSendForReview(crId, 'technical_director');
  };

  const handleSendToEstimator = async (crId: number) => {
    await handleSendForReview(crId, 'estimator');
  };

  const handleApprove = async (crId: number) => {
    try {
      // Find the request to show routing info
      const request = changeRequests.find(r => r.cr_id === crId);
      const overheadPercent = request?.percentage_of_item_overhead || 0;

      const response = await changeRequestService.approve(crId, 'Approved by PM');
      if (response.success) {
        // Enhanced message showing where request is being routed based on backend logic
        const routedTo = overheadPercent > 40 ? 'Technical Director' : 'Estimator';
        toast.success(response.message || `Approved! Forwarded to ${routedTo} (${overheadPercent.toFixed(1)}% overhead)`);
        refetch(); // Trigger background refresh
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('Failed to approve change request');
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
        toast.success('Change request rejected');
        refetch(); // Trigger background refresh
        setShowRejectionModal(false);
        setRejectingCrId(null);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('Failed to reject change request');
    }
  };

  const handleReview = async (crId: number) => {
    try {
      const response = await changeRequestService.getChangeRequestDetail(crId);
      if (response.success && response.data) {
        setSelectedChangeRequest(response.data);
        setShowDetailsModal(true);
      } else {
        toast.error(response.message || 'Failed to load details');
      }
    } catch (error) {
      console.error('Error in handleReview:', error);
      toast.error('Failed to load change request details');
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
    toast.success('Change request updated successfully');
  };

  const handleApproveFromModal = async () => {
    if (!selectedChangeRequest) return;
    await handleApprove(selectedChangeRequest.cr_id);
    setShowDetailsModal(false);
    setSelectedChangeRequest(null);
  };

  const handleRejectFromModal = () => {
    if (!selectedChangeRequest) return;
    setRejectingCrId(selectedChangeRequest.cr_id);
    setShowDetailsModal(false);
    setShowRejectionModal(true);
  };

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      under_review: 'bg-yellow-100 text-yellow-800',
      approved_by_pm: 'bg-blue-100 text-blue-800',
      approved_by_td: 'bg-blue-100 text-blue-800',
      assigned_to_buyer: 'bg-purple-100 text-purple-800',
      purchase_completed: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    // Status display based on workflow stage
    if (['pending', 'under_review'].includes(status)) {
      return 'PENDING';
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

  const filteredRequests = changeRequests.filter(req => {
    const projectName = req.project_name || req.boq_name || '';
    const matchesSearch = projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.requested_by_name.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesTab = false;
    if (isExtraMaterial) {
      // Extra Material tab filtering
      // Separate SE requests (Requested tab) from PM's own requests (Pending tab)
      const isPMRequest = req.requested_by_user_id === user?.user_id;
      const isPMApprovedAndSent = req.status === 'under_review' && ['estimator', 'technical_director'].includes(req.approval_required_from || '');

      matchesTab = (
        (activeTab === 'requested' && req.status === 'under_review' && req.approval_required_from === 'project_manager' && !isPMRequest) ||  // SE requests waiting for PM approval
        (activeTab === 'pending' && req.status === 'pending' && isPMRequest) ||  // PM's own requests only
        (activeTab === 'accepted' && (req.status === 'approved_by_pm' || isPMApprovedAndSent || req.status === 'assigned_to_buyer')) ||  // PM approved and sent to Est/TD or assigned to buyer
        (activeTab === 'completed' && req.status === 'purchase_completed') ||  // Buyer completed purchase
        (activeTab === 'rejected' && req.status === 'rejected')  // Rejected requests
      );
    } else {
      // Change Requests tab filtering - show requests that need PM action or PM created
      matchesTab = (
        (activeTab === 'pending' && ['pending', 'under_review'].includes(req.status)) ||
        (activeTab === 'approved' && ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer'].includes(req.status)) ||
        (activeTab === 'completed' && req.status === 'purchase_completed') ||
        (activeTab === 'rejected' && req.status === 'rejected')
      );
    }
    return matchesSearch && matchesTab;
  });

  const stats = {
    pending: changeRequests.filter(r => ['pending', 'under_review'].includes(r.status)).length,
    approved: changeRequests.filter(r => ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer'].includes(r.status)).length,
    completed: changeRequests.filter(r => r.status === 'purchase_completed').length,
    rejected: changeRequests.filter(r => r.status === 'rejected').length,
    // For Extra Material - separate SE requests from PM requests
    my_requests: changeRequests.filter(r => r.status === 'under_review' && r.approval_required_from === 'project_manager' && r.requested_by_user_id !== user?.user_id).length,  // SE requests waiting for PM (Requested tab)
    pending_approval: changeRequests.filter(r => r.status === 'pending' && r.requested_by_user_id === user?.user_id).length,  // PM's own requests (Pending tab)
    accepted: changeRequests.filter(r => r.status === 'approved_by_pm' || (r.status === 'under_review' && ['estimator', 'technical_director'].includes(r.approval_required_from || '')) || r.status === 'assigned_to_buyer').length,  // PM approved and sent or assigned to buyer
    completed_extra: changeRequests.filter(r => r.status === 'purchase_completed').length  // Buyer completed (Completed tab)
  };

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
            <TableHead>Additional Cost</TableHead>
            <TableHead>Increase %</TableHead>
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
                <TableCell className="font-semibold">{formatCurrency(request.materials_total_cost)}</TableCell>
                <TableCell>
                  <span className={`font-semibold ${getPercentageColor(request.budget_impact?.increase_percentage || request.percentage_of_item_overhead || 0)}`}>
                    +{(request.budget_impact?.increase_percentage || request.percentage_of_item_overhead || 0).toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(request.status)}>
                    {getStatusLabel(request.status)}
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
                          className={`${(request.percentage_of_item_overhead || 0) > 40 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                          onClick={() => {
                            const overheadPercent = request.percentage_of_item_overhead || 0;
                            const routeTo = overheadPercent > 40 ? 'technical_director' : 'estimator';
                            handleSendForReview(request.cr_id, routeTo);
                          }}
                        >
                          Send {(request.percentage_of_item_overhead || 0) > 40 ? 'TD' : 'Est'}
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
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${isExtraMaterial ? "bg-orange-500" : "bg-purple-500"}`}>
                {isExtraMaterial ? <Box className="w-8 h-8 text-white" /> : <FileText className="w-8 h-8 text-white" />}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{isExtraMaterial ? "Material Purchase" : "Change Requests"}</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {isExtraMaterial ? "Manage extra sub-items for approved BOQs" : "Material additions to existing approved projects"}
                </p>
              </div>
            </div>
            {isExtraMaterial && activeTab === 'requested' && (
              <Button
                onClick={() => setShowExtraForm(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 font-semibold"
              >
                <Plus className="w-5 h-5 mr-2" />
                NEW MATERIAL PURCHASE
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
            <TabsList className="w-full justify-start p-0 h-auto bg-transparent border-b border-gray-200 mb-6">
              {isExtraMaterial ? (
                <>
                  <TabsTrigger
                    value="requested"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <Box className="w-4 h-4 mr-2" />
                    Requested
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.my_requests})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-yellow-500 data-[state=active]:text-yellow-600 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Pending
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.pending_approval})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="accepted"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-400 data-[state=active]:text-green-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Accepted
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.accepted})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-400 data-[state=active]:text-purple-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Completed
                    <span className="ml-1 sm:ml-2 text-gray-400">({stats.completed_extra})</span>
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
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {filteredRequests.map((request, index) => (
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
                              {getStatusLabel(request.status)}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
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

                        {/* Budget Comparison - Always Visible */}
                        <div className="px-4 pb-3">
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
                        </div>

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
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleSendToTD(request.cr_id)}
                                  className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1 font-semibold"
                                >
                                  <Check className="h-4 w-4" />
                                  <span>Send to TD</span>
                                </button>
                                <button
                                  onClick={() => handleSendToEstimator(request.cr_id)}
                                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1 font-semibold"
                                >
                                  <Check className="h-4 w-4" />
                                  <span>Send to Est.</span>
                                </button>
                              </div>
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
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {filteredRequests.map((request, index) => (
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
                              {getStatusLabel(request.status)}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
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

                        <div className="px-4 pb-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Additional Cost:</span>
                            <span className="font-bold text-blue-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost Increase:</span>
                            <span className="font-semibold text-blue-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
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

            <TabsContent value="completed" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Completed Requests (Final Approval)</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No completed requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {filteredRequests.map((request, index) => (
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
                              {getStatusLabel(request.status)}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-sm text-gray-600">
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

                        <div className="px-4 pb-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Additional Cost:</span>
                            <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost Increase:</span>
                            <span className="font-semibold text-green-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
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

            <TabsContent value="rejected" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Rejected Requests</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No rejected requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {filteredRequests.map((request, index) => (
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
                        <div className="px-4 pb-3 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Additional Cost:</span>
                            <span className="font-bold text-red-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost Increase:</span>
                            <span className="font-semibold text-red-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
                          </div>
                        </div>
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
                    <RequestsTable requests={filteredRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {filteredRequests.map((request, index) => (
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
                            <span className="text-gray-600 ml-1">Extra Purchase{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>

                          <div className="px-4 pb-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-blue-600">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">% of Item Overhead:</span>
                              <span className={`font-semibold ${getPercentageColor(request.percentage_of_item_overhead || 0)}`}>
                                {(request.percentage_of_item_overhead || 0).toFixed(1)}%
                              </span>
                            </div>
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
                                className="bg-green-600 hover:bg-green-700 text-white text-xs h-9 rounded transition-all flex flex-col items-center justify-center font-semibold"
                              >
                                <div className="flex items-center gap-1">
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Approve</span>
                                </div>
                                <span className="text-[9px] opacity-80">
                                  → {(request.percentage_of_item_overhead || 0) > 40 ? 'TD' : 'Est'}
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
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No requests under review</p>
                    </div>
                  ) : viewMode === 'table' ? (
                    <RequestsTable requests={filteredRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {filteredRequests.map((request, index) => (
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
                                {request.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </div>

                            <div className="space-y-1 text-sm text-gray-600">
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
                            <span className="text-gray-600 ml-1">Extra Purchase{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>

                          <div className="px-4 pb-3 space-y-1.5 text-xs">
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
                          </div>

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
                            {/* Smart Send for Review button based on overhead percentage */}
                            <button
                              onClick={() => {
                                const overheadPercent = request.percentage_of_item_overhead || 0;
                                const routeTo = overheadPercent > 40 ? 'technical_director' : 'estimator';
                                handleSendForReview(request.cr_id, routeTo);
                              }}
                              className={`w-full text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold ${
                                (request.percentage_of_item_overhead || 0) > 40
                                  ? 'bg-orange-600 hover:bg-orange-700'
                                  : 'bg-purple-600 hover:bg-purple-700'
                              }`}
                            >
                              <Check className="h-4 w-4" />
                              <span>Send for Review {(request.percentage_of_item_overhead || 0) > 40 ? '(TD)' : '(Est.)'}</span>
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
              <TabsContent value="accepted" className="mt-0 p-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Accepted</h2>
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">No accepted requests found</p>
                    </div>
                  ) : viewMode === 'table' ? (
                    <RequestsTable requests={filteredRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {filteredRequests.map((request, index) => (
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
                            <span className="text-gray-600 ml-1">Extra Purchase{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>
                          <div className="px-4 pb-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
                          </div>
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
                    <RequestsTable requests={filteredRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {filteredRequests.map((request, index) => (
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
                            <span className="text-gray-600 ml-1">Extra Purchase{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>
                          <div className="px-4 pb-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-purple-600">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
                          </div>
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
                    <RequestsTable requests={filteredRequests} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {filteredRequests.map((request, index) => (
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
                            <span className="text-gray-600 ml-1">Extra Purchase{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
                          </div>
                          <div className="px-4 pb-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-red-600">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
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
        </div>
      </div>

      {/* Change Request Details Modal */}
      <ChangeRequestDetailsModal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedChangeRequest(null);
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

      {/* Extra Material Form Modal */}
      {showExtraForm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowExtraForm(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                  <Box className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Request Material Purchase</h2>
              </div>
              <button
                onClick={() => setShowExtraForm(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <ExtraMaterialForm
                onClose={() => {
                  setShowExtraForm(false);
                  refetch();
                }}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ChangeRequestsPage;
