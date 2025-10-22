import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Eye,
  Check,
  X,
  FileText,
  Package,
  Calendar,
  FolderOpen,
  Info,
  LayoutGrid,
  List,
  Pencil
} from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import EditChangeRequestModal from '@/components/modals/EditChangeRequestModal';
import ApprovalWithBuyerModal from '@/components/modals/ApprovalWithBuyerModal';

const ChangeRequestsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvingCrId, setApprovingCrId] = useState<number | null>(null);

  // Fetch change requests from backend
  useEffect(() => {
    loadChangeRequests();
  }, []);

  const loadChangeRequests = async () => {
    setLoading(true);
    try {
      const response = await changeRequestService.getChangeRequests();
      if (response.success) {
        setChangeRequests(response.data);
      } else {
        toast.error(response.message || 'Failed to load change requests');
      }
    } catch (error) {
      console.error('Error loading change requests:', error);
      toast.error('Failed to load change requests');
    } finally {
      setLoading(false);
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

  const handleReject = async (crId: number) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    try {
      const response = await changeRequestService.reject(crId, reason);
      if (response.success) {
        toast.success('Change request rejected');
        loadChangeRequests();
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

  const handleEdit = async (crId: number) => {
    try {
      const response = await changeRequestService.getChangeRequestDetail(crId);
      if (response.success && response.data) {
        setSelectedChangeRequest(response.data);
        setShowEditModal(true);
      } else {
        toast.error(response.message || 'Failed to load details');
      }
    } catch (error) {
      console.error('Error in handleEdit:', error);
      toast.error('Failed to load change request details');
    }
  };

  const handleEditSuccess = () => {
    loadChangeRequests();
    setShowEditModal(false);
    setSelectedChangeRequest(null);
  };

  const handleApproveFromModal = () => {
    if (!selectedChangeRequest) return;
    setShowDetailsModal(false);
    handleApprove(selectedChangeRequest.cr_id);
  };

  const handleRejectFromModal = async () => {
    if (!selectedChangeRequest) return;
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    try {
      const response = await changeRequestService.reject(selectedChangeRequest.cr_id, reason);
      if (response.success) {
        toast.success('Change request rejected');
        loadChangeRequests();
        setShowDetailsModal(false);
        setSelectedChangeRequest(null);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('Failed to reject change request');
    }
  };

  // Mock data for backwards compatibility - will be replaced with real data
  const mockRequests: ChangeRequestItem[] = [
    {
      cr_id: 1,
      project_name: 'Smart City Project',
      requested_by_name: 'PM John',
      request_date: '2025-10-07',
      status: 'pending',
      additional_cost: 150000,
      cost_increase_percentage: 25.5,
      new_items_count: 3,
      approval_type: 'td'
    },
    {
      cr_id: 2,
      project_name: 'Office Renovation',
      requested_by_name: 'PM Sarah',
      request_date: '2025-10-06',
      status: 'pending',
      additional_cost: 75000,
      cost_increase_percentage: 18.2,
      new_items_count: 2,
      approval_type: 'td'
    },
    {
      cr_id: 3,
      project_name: 'Retail Store Setup',
      requested_by_name: 'PM Mike',
      request_date: '2025-10-05',
      status: 'approved_estimator',
      additional_cost: 35000,
      cost_increase_percentage: 8.5,
      new_items_count: 1,
      approval_type: 'estimator'
    }
  ];

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
      (activeTab === 'pending' && ['under_review', 'approved_by_pm', 'pending'].includes(req.status)) ||
      (activeTab === 'approved' && req.status === 'assigned_to_buyer') ||
      (activeTab === 'completed' && req.status === 'purchase_completed') ||
      (activeTab === 'rejected' && req.status === 'rejected')
    );
    return matchesSearch && matchesTab;
  });

  const stats = {
    pending: changeRequests.filter(r => ['under_review', 'approved_by_pm', 'pending'].includes(r.status)).length,
    approved: changeRequests.filter(r => r.status === 'assigned_to_buyer').length,
    completed: changeRequests.filter(r => r.status === 'purchase_completed').length,
    rejected: changeRequests.filter(r => r.status === 'rejected').length
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="blue" />
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
            const isHighValue = request.approval_type === 'td';
            return (
              <TableRow key={request.cr_id}>
                <TableCell className="font-semibold">{request.project_name}</TableCell>
                <TableCell>{request.requested_by_name}</TableCell>
                <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{(request.materials_data?.length || 0)}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(request.materials_total_cost)}</TableCell>
                <TableCell>
                  <span className={`font-semibold ${getPercentageColor((request.budget_impact?.increase_percentage || 0))}`}>
                    +{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(request.status)}>
                    {request.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  {isHighValue && (
                    <Badge className="ml-2 bg-red-100 text-red-800">HIGH VALUE</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleReview(request.cr_id)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    {isHighValue && request.status === 'pending' && (
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
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header - Match EstimatorHub Style */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <FolderOpen className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">Change Requests</h1>
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
                <AlertTriangle className="w-4 h-4 mr-2" />
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
            </TabsList>

            <TabsContent value="pending" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Pending Approval</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No pending requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {filteredRequests.map((request, index) => {
                      return (
                        <motion.div
                          key={request.cr_id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * index }}
                          className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-all duration-200 border-2 border-yellow-300"
                        >
                          {/* Header */}
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-semibold text-gray-900 text-base flex-1">{request.project_name}</h3>
                              <Badge className="bg-yellow-100 text-yellow-800">
                                PENDING
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
                            <span className="font-bold text-yellow-600 text-lg">{(request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-1">New Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                          </div>

                          {/* Financial Impact */}
                          <div className="px-4 pb-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Additional Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Cost Increase:</span>
                              <span className={`font-semibold ${getPercentageColor((request.budget_impact?.increase_percentage || 0))}`}>
                                +{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
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
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleApprove(request.cr_id)}
                                className="text-white text-[10px] sm:text-xs h-9 rounded hover:opacity-90 transition-all flex items-center justify-center gap-1 font-semibold px-1"
                                style={{ backgroundColor: 'rgb(22, 163, 74)' }}
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Send to Est</span>
                                <span className="sm:hidden">Approve</span>
                              </button>
                              <button
                                onClick={() => handleReject(request.cr_id)}
                                className="bg-red-600 hover:bg-red-700 text-white text-[10px] sm:text-xs h-9 rounded transition-all flex items-center justify-center gap-1 font-semibold px-1"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="approved" className="mt-0 p-0">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Approved by TD (Pending Estimator)</h2>
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
                            <Badge className="bg-blue-100 text-blue-800">APPROVED BY TD</Badge>
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
                            <span className={`font-semibold ${getPercentageColor((request.budget_impact?.increase_percentage || 0))}`}>
                              +{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%
                            </span>
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
        canApprove={selectedChangeRequest?.status === 'pending' && selectedChangeRequest?.approval_required_from === 'technical_director'}
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
