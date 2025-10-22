import React, { useState, useEffect } from 'react';
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
  TrendingUp,
  AlertCircle,
  FileText,
  Package,
  DollarSign,
  Calendar,
  FolderOpen,
  LayoutGrid,
  List,
  Pencil
} from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import RejectionReasonModal from '@/components/modals/RejectionReasonModal';
import ApprovalWithBuyerModal from '@/components/modals/ApprovalWithBuyerModal';

const ChangeRequestsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectingCrId, setRejectingCrId] = useState<number | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvingCrId, setApprovingCrId] = useState<number | null>(null);

  // Fetch change requests from backend
  useEffect(() => {
    console.log('[ChangeRequestsPage] Component mounted');
    loadChangeRequests();
  }, []);

  const loadChangeRequests = async () => {
    try {
      console.log('[ChangeRequests] Fetching change requests...');
      const response = await changeRequestService.getChangeRequests();
      console.log('[ChangeRequests] Response:', response);

      if (response.success) {
        console.log('[ChangeRequests] Setting data:', response.data);
        setChangeRequests(response.data);
        if (response.data.length > 0) {
          toast.success(`Loaded ${response.data.length} change request(s)`);
        }
      } else {
        console.error('[ChangeRequests] Failed:', response.message);
        toast.error(response.message || 'Failed to load change requests');
      }
    } catch (error) {
      console.error('[ChangeRequests] Error loading change requests:', error);
      toast.error('Failed to load change requests');
    } finally {
      console.log('[ChangeRequests] Setting loading to false');
      setInitialLoad(false);
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
        toast.success('Change request rejected');
        loadChangeRequests();
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

  const handleApproveFromModal = () => {
    if (!selectedChangeRequest) return;
    setShowDetailsModal(false);
    handleApprove(selectedChangeRequest.cr_id);
  };

  const handleRejectFromModal = () => {
    if (!selectedChangeRequest) return;
    setRejectingCrId(selectedChangeRequest.cr_id);
    setShowDetailsModal(false);
    setShowRejectionModal(true);
  };

  const handleEdit = (crId: number) => {
    // Find the change request and open it in the details modal with edit mode
    const request = changeRequests.find(r => r.cr_id === crId);
    if (request) {
      setSelectedChangeRequest(request);
      setShowDetailsModal(true);
      // The modal will handle edit mode based on the request status and user role
    }
  };

  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved_estimator: 'bg-green-100 text-green-800',
      approved_td: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || colors.pending;
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
    const matchesTab = (
      (activeTab === 'pending' && req.approval_required_from === 'estimator' && req.status !== 'approved' && req.status !== 'rejected') ||
      (activeTab === 'approved' && req.status === 'approved') ||
      (activeTab === 'escalated' && req.approval_required_from === 'technical_director' && req.status !== 'approved' && req.status !== 'rejected') ||
      (activeTab === 'rejected' && req.status === 'rejected')
    );
    return matchesSearch && matchesTab;
  });

  const stats = {
    pending: changeRequests.filter(r => r.approval_required_from === 'estimator' && r.status !== 'approved' && r.status !== 'rejected').length,
    approved: changeRequests.filter(r => r.status === 'approved').length,
    escalated: changeRequests.filter(r => r.approval_required_from === 'technical_director' && r.status !== 'approved' && r.status !== 'rejected').length,
    rejected: changeRequests.filter(r => r.status === 'rejected').length
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
            <TableHead>New Items</TableHead>
            <TableHead>Additional Cost</TableHead>
            <TableHead>Increase %</TableHead>
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
              <TableCell className="font-semibold">{formatCurrency(request.materials_total_cost)}</TableCell>
              <TableCell>
                <span className={`font-semibold ${getPercentageColor(request.budget_impact?.increase_percentage || 0)}`}>
                  +{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%
                </span>
              </TableCell>
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
                  {request.approval_required_from === 'estimator' && request.status !== 'approved' && request.status !== 'rejected' && (
                    <>
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
      {/* Header - Purple theme for Change Requests */}
      <div className="bg-gradient-to-r from-purple-500/5 to-purple-600/10 shadow-sm border-b-2 border-purple-200">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-purple-700">Change Requests</h1>
              <p className="text-sm text-purple-600">Material additions to existing approved projects</p>
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
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-400 data-[state=active]:text-purple-500 text-gray-500 px-2 sm:px-4 py-3 font-semibold text-xs sm:text-sm"
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
                            className="w-full text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span>Review</span>
                          </button>
                          {request.approval_required_from === 'estimator' && request.status !== 'approved' && request.status !== 'rejected' && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleApprove(request.cr_id)}
                                className="text-white text-[10px] sm:text-xs h-8 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 sm:gap-1 font-semibold px-1"
                                style={{ backgroundColor: 'rgb(22, 163, 74)' }}
                              >
                                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                <span>Approve</span>
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

            <TabsContent value="escalated" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Completed Requests</h2>
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
                        className="bg-white rounded-lg border-2 border-blue-300 shadow-sm hover:shadow-lg transition-all duration-200"
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                            <Badge className="bg-blue-100 text-blue-800">HIGH VALUE</Badge>
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
        canApprove={selectedChangeRequest?.approval_required_from === 'estimator' && selectedChangeRequest?.status !== 'approved' && selectedChangeRequest?.status !== 'rejected'}
      />

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
    </div>
  );
};

export default ChangeRequestsPage;
