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

interface Buyer {
  user_id: number;
  full_name: string;
  username: string;
}

const ChangeRequestsPage: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const isExtraMaterial = location.pathname.includes('extra-material');
  const [activeTab, setActiveTab] = useState(isExtraMaterial ? 'requested' : 'pending');
  const [pendingSubTab, setPendingSubTab] = useState<'drafts' | 'sent'>('drafts'); // Sub-tab for Pending
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
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);

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

  const changeRequests = useMemo(() => {
    const allRequests = changeRequestsData || [];
    // Filter by request_type based on current page
    if (isExtraMaterial) {
      return allRequests.filter(req => req.request_type === 'EXTRA_MATERIALS');
    }
    return allRequests.filter(req => req.request_type !== 'EXTRA_MATERIALS');
  }, [changeRequestsData, isExtraMaterial]);

  const initialLoad = isLoading;

  const handleSendForReview = async (crId: number) => {
    // Always route to Estimator for new material requests
    try {
      const response = await changeRequestService.sendForReview(crId, 'estimator');
      if (response.success) {
        toast.success(response.message || 'Request sent to Estimator for pricing');
        refetch(); // Trigger background refresh
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('Failed to send request for review');
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
        toast.success(response.message || 'Change request approved successfully');
        refetch(); // Trigger background refresh
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('Failed to approve change request');
    }
  };

  const fetchBuyers = async () => {
    try {
      const response = await changeRequestService.getBuyers();
      if (response.success && response.data) {
        setBuyers(response.data);
      }
    } catch (error) {
      console.error('Error fetching buyers:', error);
      toast.error('Failed to load buyers');
    }
  };

  const handleBuyerSelection = async () => {
    if (!selectedBuyerId || !approvingCrId) {
      toast.error('Please select a buyer');
      return;
    }

    setShowBuyerSelectionModal(false);
    await handleApprove(approvingCrId, selectedBuyerId);
    setApprovingCrId(null);
    setSelectedBuyerId(null);
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

  const getStatusLabel = (status: string, approvalFrom?: string) => {
    // Status display based on workflow stage
    console.log('getStatusLabel called with:', { status, approvalFrom });
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

  const isAdminUser = user?.role?.toLowerCase() === 'admin' || user?.role_name?.toLowerCase() === 'admin';

  const filteredRequests = changeRequests.filter(req => {
    const projectName = req.project_name || req.boq_name || '';
    const matchesSearch = projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.requested_by_name.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesTab = false;
    if (isExtraMaterial) {
      // Extra Material tab filtering
      // Separate SE requests (Requested tab) from PM's own requests (Pending tab)
      const isPMRequest = req.requested_by_user_id === user?.user_id;
      // Only SE requests that PM approved and sent forward (NOT PM's own requests)
      const isPMApprovedAndSent = !isPMRequest && req.status === 'under_review' && ['estimator', 'technical_director'].includes(req.approval_required_from || '');

      // For Admin:
      // - Pending tab shows only status='pending' (drafts not sent yet)
      // - Request tab shows ALL status='under_review' (sent for approval to PM/TD/Estimator)
      // For non-Admin PM/SE:
      // - Pending tab shows their own status='pending'
      // - Request tab shows status='under_review' where approval_required_from='project_manager'

      if (isAdminUser) {
        // Admin user logic
        matchesTab = (
          (activeTab === 'requested' && req.status === 'under_review') ||  // All under_review requests in Request tab
          (activeTab === 'pending' && isPMRequest && ['pending', 'under_review'].includes(req.status)) ||  // PM's own requests (all statuses)
          (activeTab === 'accepted' && !isPMRequest && (req.status === 'approved_by_pm' || isPMApprovedAndSent || req.status === 'assigned_to_buyer')) ||  // Only SE requests PM approved
          (activeTab === 'completed' && req.status === 'purchase_completed') ||
          (activeTab === 'rejected' && req.status === 'rejected')
        );
      } else {
        // Non-admin user logic
        matchesTab = (
          (activeTab === 'requested' && req.status === 'under_review' && req.approval_required_from === 'project_manager') ||  // Requests waiting for PM approval
          (activeTab === 'pending' && isPMRequest && ['pending', 'under_review'].includes(req.status)) ||  // User's own requests (all statuses)
          (activeTab === 'accepted' && !isPMRequest && (req.status === 'approved_by_pm' || isPMApprovedAndSent || req.status === 'assigned_to_buyer')) ||  // Only SE requests PM approved
          (activeTab === 'completed' && req.status === 'purchase_completed') ||
          (activeTab === 'rejected' && req.status === 'rejected')
        );
      }
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
    // For Extra Material - Admin vs non-Admin logic
    my_requests: isAdminUser
      ? changeRequests.filter(r => r.status === 'under_review').length  // Admin: all under_review in Request tab
      : changeRequests.filter(r => r.status === 'under_review' && r.approval_required_from === 'project_manager').length,  // Non-admin: only PM approval pending
    pending_approval: changeRequests.filter(r => r.requested_by_user_id === user?.user_id && ['pending', 'under_review'].includes(r.status)).length,  // PM's own requests (pending + under_review)
    accepted: changeRequests.filter(r => r.requested_by_user_id !== user?.user_id && (r.status === 'approved_by_pm' || (r.status === 'under_review' && ['estimator', 'technical_director'].includes(r.approval_required_from || '')) || r.status === 'assigned_to_buyer')).length,  // Only SE requests PM approved
    completed_extra: changeRequests.filter(r => r.status === 'purchase_completed').length
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
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={() => handleSendForReview(request.cr_id)}
                        >
                          Send to Estimator
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
              <div className={`p-3 rounded-lg ${isExtraMaterial ? "bg-gradient-to-br from-[#243d8a] to-[#4a5fa8]" : "bg-gradient-to-br from-[#243d8a] to-[#4a5fa8]"}`}>
                {isExtraMaterial ? <Box className="w-8 h-8 text-white" /> : <FileText className="w-8 h-8 text-white" />}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{isExtraMaterial ? "Material Purchase" : "Change Requests"}</h1>
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
            <TabsList className="w-full justify-start p-2 h-auto bg-gray-50 rounded-xl mb-6 gap-2">
              {isExtraMaterial ? (
                <>
                  <TabsTrigger
                    value="requested"
                    className="rounded-lg border-2 border-transparent data-[state=active]:border-[#243d8a] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#243d8a]/10 data-[state=active]:to-[#4a5fa8]/10 data-[state=active]:text-[#243d8a] text-gray-500 px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50"
                  >
                    <Box className="w-4 h-4 mr-2" />
                    Requested
                    <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-100 data-[state=active]:bg-[#243d8a]/20 text-xs">({stats.my_requests})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="rounded-lg border-2 border-transparent data-[state=active]:border-[#243d8a] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#243d8a]/10 data-[state=active]:to-[#4a5fa8]/10 data-[state=active]:text-[#243d8a] text-gray-500 px-3 sm:px-4 py-2.5 font-semibold text-xs sm:text-sm transition-all hover:bg-gray-50"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Pending
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
                              {getStatusLabel(request.status, request.approval_required_from)}
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
                              <button
                                onClick={() => handleSendForReview(request.cr_id)}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1 font-semibold"
                              >
                                <Check className="h-4 w-4" />
                                <span>Send to Estimator</span>
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
                              {getStatusLabel(request.status, request.approval_required_from)}
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
                              {getStatusLabel(request.status, request.approval_required_from)}
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
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
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

                                    // Debug log for troubleshooting
                                    if (request.materials_data && request.materials_data.length > 0) {
                                      console.log(`CR ${request.cr_id} materials:`, request.materials_data.map(m => ({
                                        name: m.material_name,
                                        master_id: m.master_material_id,
                                        is_new: m.master_material_id === null || m.master_material_id === undefined
                                      })));
                                    }

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
                  <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                    <button
                      onClick={() => setPendingSubTab('drafts')}
                      className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition-all ${
                        pendingSubTab === 'drafts'
                          ? 'bg-[#243d8a] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Pencil className="w-4 h-4" />
                        <span>Drafts (Not Sent)</span>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          pendingSubTab === 'drafts' ? 'bg-white/20' : 'bg-gray-200'
                        }`}>
                          ({filteredRequests.filter(r => r.status === 'pending').length})
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => setPendingSubTab('sent')}
                      className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition-all ${
                        pendingSubTab === 'sent'
                          ? 'bg-[#243d8a] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>Sent for Review</span>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          pendingSubTab === 'sent' ? 'bg-white/20' : 'bg-gray-200'
                        }`}>
                          ({filteredRequests.filter(r => r.status === 'under_review').length})
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Drafts Sub-tab Content */}
                  {pendingSubTab === 'drafts' && (
                    <>
                      {filteredRequests.filter(r => r.status === 'pending').length === 0 ? (
                        <div className="text-center py-12">
                          <Pencil className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 text-lg">No draft requests found</p>
                        </div>
                      ) : viewMode === 'table' ? (
                        <RequestsTable requests={filteredRequests.filter(r => r.status === 'pending')} />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                          {filteredRequests.filter(r => r.status === 'pending').map((request, index) => (
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

                              <div className="px-4 pb-3 space-y-1.5 text-xs">
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
                                {/* Send for Review to Estimator */}
                                <button
                                  onClick={() => handleSendForReview(request.cr_id)}
                                  className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 rounded transition-all flex items-center justify-center gap-1.5 font-semibold"
                                >
                                  <Check className="h-4 w-4" />
                                  <span>Send to Estimator</span>
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Sent for Review Sub-tab Content */}
                  {pendingSubTab === 'sent' && (
                    <>
                      {filteredRequests.filter(r => r.status === 'under_review').length === 0 ? (
                        <div className="text-center py-12">
                          <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 text-lg">No requests under review</p>
                        </div>
                      ) : viewMode === 'table' ? (
                        <RequestsTable requests={filteredRequests.filter(r => r.status === 'under_review')} />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                          {filteredRequests.filter(r => r.status === 'under_review').map((request, index) => (
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
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
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
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
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
                            <span className="text-gray-600 ml-1">Material{((request.sub_items_data?.length || request.materials_data?.length || 0) > 1) ? 's' : ''}</span>
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
            <div className="sticky top-0 bg-gradient-to-r from-[#243d8a] to-[#4a5fa8] px-6 py-4 flex items-center justify-between">
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

            {/* Content - Scrollable with hidden scrollbar */}
            <div
              className="flex-1 overflow-y-auto p-6"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              <style>{`
                div[class*="overflow-y-auto"]::-webkit-scrollbar {
                  display: none;
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

                {/* Online Status Indicator */}
                <div className="flex items-center gap-2 mb-4 text-sm">
                  <div className="flex items-center gap-1.5 text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="font-medium">ONLINE</span>
                  </div>
                </div>

                {/* Buyers List - Scrollable with hidden scrollbar */}
                <div
                  className="space-y-3 max-h-[280px] overflow-y-auto pr-2"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  }}
                >
                  {buyers.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No buyers available</p>
                    </div>
                  ) : (
                    buyers.map((buyer) => {
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
                          {/* Avatar */}
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${
                            selectedBuyerId === buyer.user_id ? 'bg-green-600' : 'bg-blue-600'
                          }`}>
                            {initials}
                          </div>

                          {/* User Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">
                                {buyer.full_name || buyer.username}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                Online
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-0.5">
                              {buyer.username}
                            </div>
                          </div>

                          {/* Radio Button */}
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
                    })
                  )}
                </div>
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
