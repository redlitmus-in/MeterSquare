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
  Pencil,
  Store,
  ShoppingCart
} from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { buyerService, Purchase } from '@/roles/buyer/services/buyerService';
import { buyerVendorService, Vendor, VendorProduct } from '@/roles/buyer/services/buyerVendorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import EditChangeRequestModal from '@/components/modals/EditChangeRequestModal';
import ApprovalWithBuyerModal from '@/components/modals/ApprovalWithBuyerModal';
import RejectionReasonModal from '@/components/modals/RejectionReasonModal';
import MaterialVendorSelectionModal from '@/roles/buyer/components/MaterialVendorSelectionModal';
import { useAuthStore } from '@/store/authStore';
import { permissions } from '@/utils/rolePermissions';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';

const ChangeRequestsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('pending');
  const [approvedSubTab, setApprovedSubTab] = useState<'purchase_approved' | 'vendor_approved'>('purchase_approved');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [vendorApprovals, setVendorApprovals] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<ChangeRequestItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvingCrId, setApprovingCrId] = useState<number | null>(null);
  const [approvingVendorId, setApprovingVendorId] = useState<number | null>(null);
  const [showVendorInfoModal, setShowVendorInfoModal] = useState(false);
  const [selectedVendorPurchase, setSelectedVendorPurchase] = useState<Purchase | null>(null);
  const [showVendorSelectionModal, setShowVendorSelectionModal] = useState(false);
  const [vendorDetails, setVendorDetails] = useState<Vendor | null>(null);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [loadingVendorDetails, setLoadingVendorDetails] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectingCrId, setRejectingCrId] = useState<number | null>(null);

  // ✅ LISTEN TO REAL-TIME UPDATES - This makes data reload automatically!
  const changeRequestUpdateTimestamp = useRealtimeUpdateStore(state => state.changeRequestUpdateTimestamp);

  // Fetch change requests and vendor approvals - real-time subscriptions handle updates
  useEffect(() => {
    // Initial load with loading spinner
    loadChangeRequests(true);
    loadVendorApprovals();

    // NO POLLING! Real-time subscriptions in realtimeSubscriptions.ts
    // automatically invalidate queries when change_requests table changes.
    // This provides instant updates across all roles without server load.
  }, []);

  // ✅ RELOAD change requests when real-time update is received
  useEffect(() => {
    // Skip initial mount
    if (changeRequestUpdateTimestamp === 0) return;

    loadChangeRequests(false); // Silent reload without loading spinner
    loadVendorApprovals(); // Also reload vendor approvals
  }, [changeRequestUpdateTimestamp]); // Reload whenever timestamp changes

  const loadChangeRequests = async (showLoadingSpinner = false) => {
    // Only show loading spinner on initial load, not on auto-refresh
    if (showLoadingSpinner) {
      setLoading(true);
    }
    try {
      const response = await changeRequestService.getChangeRequests();
      if (response.success) {
        setChangeRequests(response.data);
      } else {
        // Only show error toast on initial load to avoid spam
        if (showLoadingSpinner) {
          showError(response.message || 'Failed to load change requests');
        }
      }
    } catch (error) {
      console.error('Error loading change requests:', error);
      // Only show error toast on initial load to avoid spam
      if (showLoadingSpinner) {
        showError('Failed to load change requests');
      }
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
    }
  };

  const loadVendorApprovals = async () => {
    try {
      // Fetch all change requests and filter for vendor approvals
      const response = await changeRequestService.getChangeRequests();
      if (response.success && response.data) {
        console.log('🔍 All change requests:', response.data);
        console.log('📊 Total change requests:', response.data.length);

        // Filter for change requests with vendor selection pending TD approval
        // Include both regular CRs (status='assigned_to_buyer') and sub-CRs (status='pending_td_approval', is_sub_cr=true)
        const pendingVendorApprovals = response.data.filter(
          (cr: ChangeRequestItem) => {
<<<<<<< HEAD
            const status = cr.status?.trim(); // Trim to handle trailing spaces
            const isRegularCRPending = cr.status === 'assigned_to_buyer' && cr.vendor_selection_status === 'pending_td_approval';
            const isSubCRPending = cr.is_sub_cr && cr.status === 'pending_td_approval' && vendor_selection_status === 'pending_td_approval';
=======
            const status = cr.status?.trim(); // Trim to handle trailing spaces
            const hasStatus = status === 'assigned_to_buyer' || status === 'send_to_buyer' || status === 'send_to_buyer';
            const hasVendorPending = cr.vendor_selection_status === 'pending_td_approval';
>>>>>>> 2fc9424dab306cbac4c709fa79541efdefba0387

            console.log(`CR-${cr.cr_id}:`, {
              status: cr.status,
              trimmedStatus: status,
              vendor_selection_status: cr.vendor_selection_status,
              selected_vendor_name: cr.selected_vendor_name,
              is_sub_cr: cr.is_sub_cr,
              formatted_cr_id: cr.formatted_cr_id,
              isRegularCRPending,
              isSubCRPending,
              matches: isRegularCRPending || isSubCRPending
            });

            return isRegularCRPending || isSubCRPending;
          }
        );

        console.log('✅ Filtered vendor approvals:', pendingVendorApprovals.length);

        // Map to Purchase format for compatibility
        const mappedApprovals: Purchase[] = pendingVendorApprovals.map((cr: ChangeRequestItem) => ({
          cr_id: cr.cr_id,
          formatted_cr_id: cr.formatted_cr_id || `CR-${cr.cr_id}`,  // Include formatted CR ID for sub-CRs
          is_sub_cr: cr.is_sub_cr || false,
          parent_cr_id: cr.parent_cr_id,
          cr_number_suffix: cr.cr_number_suffix,
          project_id: cr.project_id,
          project_name: cr.project_name || cr.boq_name || 'Unknown Project',
          client: cr.project_client || '',
          item_name: cr.item_name || '',
          materials_count: cr.materials_data?.length || 0,
          total_cost: cr.materials_total_cost || 0,
          vendor_name: cr.selected_vendor_name || 'No Vendor',
          vendor_id: cr.selected_vendor_id || 0,
          created_at: cr.created_at,
          status: cr.status,
          vendor_selection_pending_td_approval: true,
          vendor_selection_status: cr.vendor_selection_status,
          // Map materials_data to materials array format expected by VendorSelectionModal
          materials: (cr.materials_data || []).map(mat => ({
            material_name: mat.material_name || '',
            quantity: mat.quantity || 0,
            unit: mat.unit || '',
            unit_price: mat.unit_price || 0,
            total_price: mat.total_price || 0
          })),
          // Add missing required fields from Purchase interface
          boq_id: cr.boq_id,
          boq_name: cr.boq_name || '',
          location: cr.project_location || '',
          sub_item_name: '',
          request_type: cr.request_type || '',
          reason: cr.justification || '',
          approved_by: 0,
          approved_at: null
        }));

        setVendorApprovals(mappedApprovals);
      }
    } catch (error) {
      console.error('Error loading vendor approvals:', error);
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
    setRejectingCrId(crId);
    setShowRejectionModal(true);
  };

  const handleRejectionSubmit = async (reason: string) => {
    if (!rejectingCrId) return;

    try {
      const response = await changeRequestService.reject(rejectingCrId, reason);
      if (response.success) {
        showSuccess('Change request rejected');
        loadChangeRequests();
        setShowRejectionModal(false);
        setRejectingCrId(null);
      } else {
        showError(response.message);
      }
    } catch (error) {
      showError('Failed to reject change request');
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
      showError('Failed to load change request details');
    }
  };

  const handleEdit = async (crId: number) => {
    try {
      const response = await changeRequestService.getChangeRequestDetail(crId);
      if (response.success && response.data) {
        setSelectedChangeRequest(response.data);
        setShowEditModal(true);
      } else {
        showError(response.message || 'Failed to load details');
      }
    } catch (error) {
      console.error('Error in handleEdit:', error);
      showError('Failed to load change request details');
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
    setShowDetailsModal(false);
    setRejectingCrId(selectedChangeRequest.cr_id);
    setShowRejectionModal(true);
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

    let matchesTab = false;
    const status = req.status?.trim(); // Trim to handle trailing spaces

    if (activeTab === 'pending') {
      matchesTab = ['under_review', 'approved_by_pm', 'pending'].includes(status);
    } else if (activeTab === 'approved') {
      // Filter by sub-tab when in approved tab
      if (approvedSubTab === 'purchase_approved') {
        // Purchase approved: TD approved purchase, buyer needs to select vendor
        matchesTab = (status === 'assigned_to_buyer' || status === 'send_to_buyer') && !req.selected_vendor_id;
      } else if (approvedSubTab === 'vendor_approved') {
        // Vendor approved: TD approved vendor selection, buyer hasn't completed purchase yet
        // Once purchase is completed (status = purchase_completed), it moves to Completed tab
        matchesTab = (status === 'assigned_to_buyer' || status === 'send_to_buyer') &&
                     !!req.selected_vendor_id && (!!req.vendor_approval_date || !!req.vendor_approved_by_td_id);
      }
    } else if (activeTab === 'completed') {
      // Only show truly completed purchases (purchase_completed status)
      matchesTab = status === 'purchase_completed';
    } else if (activeTab === 'rejected') {
      matchesTab = status === 'rejected';
    }

    return matchesSearch && matchesTab;
  });

  const handleApproveVendor = async (crId: number) => {
    setApprovingVendorId(crId);
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('access_token');

      const response = await fetch(`${apiUrl}/buyer/purchase/${crId}/td-approve-vendor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve vendor');
      }

      showSuccess('Vendor selection approved successfully! Buyer has been notified.');

      // Reload data from database to get the latest state
      await Promise.all([
        loadVendorApprovals(),
        loadChangeRequests()
      ]);

      // Switch to approved tab and vendor_approved sub-tab to show the updated item
      setActiveTab('approved');
      setApprovedSubTab('vendor_approved');
    } catch (error: any) {
      console.error('Error approving vendor:', error);
      showError(error.message || 'Failed to approve vendor');
    } finally {
      setApprovingVendorId(null);
    }
  };

  const handleReviewVendorApproval = async (crId: number) => {
    try {
      const response = await changeRequestService.getChangeRequestDetail(crId);
      if (response.success && response.data) {
        setSelectedChangeRequest(response.data);
        setShowDetailsModal(true);
      } else {
        showError(response.message || 'Failed to load details');
      }
    } catch (error) {
      console.error('Error loading vendor approval details:', error);
      showError('Failed to load change request details');
    }
  };

  const handleViewVendorInfo = async (purchase: Purchase) => {
    setSelectedVendorPurchase(purchase);
    setShowVendorInfoModal(true);

    // Fetch full vendor details
    if (purchase.vendor_id) {
      try {
        setLoadingVendorDetails(true);
        const [vendor, products] = await Promise.all([
          buyerVendorService.getVendorById(purchase.vendor_id),
          buyerVendorService.getVendorProducts(purchase.vendor_id)
        ]);
        setVendorDetails(vendor);
        setVendorProducts(products);
      } catch (error) {
        console.error('Error loading vendor details:', error);
        showError('Failed to load vendor details');
      } finally {
        setLoadingVendorDetails(false);
      }
    }
  };

  const stats = {
    pending: changeRequests.filter(r => ['under_review', 'approved_by_pm', 'pending'].includes(r.status?.trim())).length,
    approved: changeRequests.filter(r =>
      (r.status?.trim() === 'assigned_to_buyer' || r.status?.trim() === 'send_to_buyer') // Count items in assigned_to_buyer or send_to_buyer status
    ).length,
    purchaseApproved: changeRequests.filter(r => (r.status?.trim() === 'assigned_to_buyer' || r.status?.trim() === 'send_to_buyer') && !r.selected_vendor_id).length,
    vendorApproved: changeRequests.filter(r =>
      (r.status?.trim() === 'assigned_to_buyer' || r.status?.trim() === 'send_to_buyer') && // Must be assigned_to_buyer or send_to_buyer, not purchase_completed
      !!r.selected_vendor_id && (!!r.vendor_approval_date || !!r.vendor_approved_by_td_id)
    ).length,
    completed: changeRequests.filter(r => r.status?.trim() === 'purchase_completed').length,
    rejected: changeRequests.filter(r => r.status?.trim() === 'rejected').length,
    vendorApprovals: vendorApprovals.length
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
      {/* Header - Compact */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <FolderOpen className="w-4 h-4 text-red-600" />
            </div>
            <h1 className="text-lg font-bold text-[#243d8a]">Change Requests</h1>
          </div>
        </div>
      </div>

      {/* Main Content - Compact */}
      <div className="max-w-7xl mx-auto px-3 py-3">
        {/* Search Bar with Controls - Compact */}
        <div className="mb-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
            <Input
              placeholder="Search by project name or PM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 border-gray-200 focus:border-gray-300 focus:ring-0 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle - Compact */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded p-0.5">
              <Button
                size="sm"
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                className={`h-7 px-2 text-xs ${viewMode === 'cards' ? 'text-white hover:opacity-90' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}
                style={viewMode === 'cards' ? { backgroundColor: 'rgb(36, 61, 138)' } : {}}
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid className="h-3 w-3 sm:mr-1" />
                <span className="hidden sm:inline text-xs">Cards</span>
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                className={`h-7 px-2 text-xs ${viewMode === 'table' ? 'text-white hover:opacity-90' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}
                style={viewMode === 'table' ? { backgroundColor: 'rgb(36, 61, 138)' } : {}}
                onClick={() => setViewMode('table')}
              >
                <List className="h-3 w-3 sm:mr-1" />
                <span className="hidden sm:inline text-xs">Table</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Content Tabs - Compact */}
        <div className="bg-white rounded-xl shadow border border-blue-100 p-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start p-0 h-auto bg-transparent border-b border-gray-200 mb-3">
              <TabsTrigger
                value="pending"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-yellow-500 data-[state=active]:text-yellow-600 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Pending
                <span className="ml-1 text-gray-400">({stats.pending})</span>
              </TabsTrigger>
              <TabsTrigger
                value="vendor-approvals"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-600 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <Store className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Vendor Approvals</span>
                <span className="sm:hidden">Vendors</span>
                <span className="ml-1 text-gray-400">({stats.vendorApprovals})</span>
              </TabsTrigger>
              <TabsTrigger
                value="approved"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:text-blue-500 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Approved
                <span className="ml-1 text-gray-400">({stats.approved})</span>
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-400 data-[state=active]:text-green-500 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Completed
                <span className="ml-1 text-gray-400">({stats.completed})</span>
              </TabsTrigger>
              <TabsTrigger
                value="rejected"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-400 data-[state=active]:text-red-500 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <XCircle className="w-3 h-3 mr-1" />
                Rejected
                <span className="ml-1 text-gray-400">({stats.rejected})</span>
              </TabsTrigger>
            </TabsList>
            {/* Sub-tabs for Approved */}
            {activeTab === 'approved' && (
              <div className="mb-2 p-2 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setApprovedSubTab('purchase_approved')}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      approvedSubTab === 'purchase_approved'
                        ? 'bg-blue-600 text-white'
                        : 'text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <ShoppingCart className="w-3 h-3 inline mr-1" />
                    Purchase Approved ({stats.purchaseApproved})
                  </button>
                  <button
                    onClick={() => setApprovedSubTab('vendor_approved')}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      approvedSubTab === 'vendor_approved'
                        ? 'bg-blue-600 text-white'
                        : 'text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <Store className="w-3 h-3 inline mr-1" />
                    Vendor Approved ({stats.vendorApproved})
                  </button>
                </div>
                <div className="text-[10px] text-gray-600 mt-1">
                  {approvedSubTab === 'purchase_approved'
                    ? 'Approved purchases. Buyers will select vendors.'
                    : 'Vendor selections approved. Buyers can complete purchases.'}
                </div>
              </div>
            )}

            <TabsContent value="pending" className="mt-0 p-0">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-900">Pending Approval</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No pending requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {filteredRequests.map((request, index) => {
                      return (
                        <motion.div
                          key={request.cr_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.02 * index }}
                          className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-yellow-300"
                        >
                          {/* Header - Compact */}
                          <div className="p-2">
                            <div className="flex items-start justify-between mb-1">
                              <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{request.project_name}</h3>
                              <Badge className="bg-yellow-100 text-yellow-800 text-[9px] px-1 py-0">
                                PENDING
                              </Badge>
                            </div>

                            <div className="space-y-0.5 text-[10px] text-gray-600">
                              <div className="flex items-center gap-1">
                                <Package className="h-2.5 w-2.5 text-gray-400" />
                                <span className="truncate">By: {request.requested_by_name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5 text-gray-400" />
                                <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Stats - Compact */}
                          <div className="px-2 pb-1 text-center text-[10px]">
                            <span className="font-bold text-yellow-600 text-sm">{(request.materials_data?.length || 0)}</span>
                            <span className="text-gray-600 ml-0.5">Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                          </div>

                          {/* Financial Impact - Compact */}
                          <div className="px-2 pb-2 space-y-0.5 text-[9px]">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Total Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(request.materials_total_cost)}</span>
                            </div>
                          </div>

                          {/* Actions - Compact */}
                          <div className="border-t border-gray-200 p-1.5 flex flex-col gap-1">
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                onClick={() => handleReview(request.cr_id)}
                                className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                                style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                              >
                                <Eye className="h-3 w-3" />
                                <span>Review</span>
                              </button>
                              <button
                                onClick={() => handleEdit(request.cr_id)}
                                disabled={request.status === 'pending_td_approval' || request.vendor_selection_status === 'pending_td_approval' || request.is_sub_cr}
                                className={`text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold ${
                                  request.status === 'pending_td_approval' || request.vendor_selection_status === 'pending_td_approval' || request.is_sub_cr
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                                title={request.status === 'pending_td_approval' || request.vendor_selection_status === 'pending_td_approval' ? 'Cannot edit - Sent for approval' : 'Edit request'}
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                onClick={() => handleApprove(request.cr_id)}
                                className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                                style={{ backgroundColor: 'rgb(22, 163, 74)' }}
                              >
                                <Check className="h-3 w-3" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleReject(request.cr_id)}
                                className="bg-red-600 hover:bg-red-700 text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold"
                              >
                                <X className="h-3 w-3" />
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

            <TabsContent value="vendor-approvals" className="mt-0 p-0">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-900">Vendor Selection Approvals</h2>
                {vendorApprovals.length === 0 ? (
                  <div className="text-center py-8">
                    <Store className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No vendor approvals pending</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {vendorApprovals.map((purchase, index) => (
                      <motion.div
                        key={purchase.cr_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-orange-300"
                      >
                        {/* Header - Compact */}
                        <div className="p-2">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{purchase.project_name}</h3>
                            <Badge className={`text-[9px] px-1 py-0 ${
                              purchase.is_sub_cr
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                              {purchase.formatted_cr_id || `CR-${purchase.cr_id}`}
                            </Badge>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-gray-600">
                            <div className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{purchase.client}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{new Date(purchase.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Store className="h-2.5 w-2.5 text-orange-500" />
                              <span className="truncate font-semibold text-orange-900">{purchase.vendor_name}</span>
                            </div>
                          </div>
                        </div>

                        {/* Stats - Compact */}
                        <div className="px-2 pb-1 text-center text-[10px]">
                          <span className="font-bold text-orange-600 text-sm">{purchase.materials_count}</span>
                          <span className="text-gray-600 ml-0.5">Material{purchase.materials_count > 1 ? 's' : ''}</span>
                        </div>

                        {/* Financial Impact - Compact */}
                        <div className="px-2 pb-2 space-y-0.5 text-[9px]">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Total Cost:</span>
                            <span className="font-bold text-gray-900">AED {purchase.total_cost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Item:</span>
                            <span className="font-semibold text-gray-700 truncate ml-1">{purchase.item_name}</span>
                          </div>
                        </div>

                        {/* Actions - Compact */}
                        <div className="border-t border-gray-200 p-1.5 flex flex-col gap-1">
                          {/* First Row: View Details and Vendor Info */}
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              onClick={() => handleReviewVendorApproval(purchase.cr_id)}
                              className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                              style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                            >
                              <Eye className="h-3 w-3" />
                              <span>Details</span>
                            </button>
                            <button
                              onClick={() => handleViewVendorInfo(purchase)}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold"
                            >
                              <Store className="h-3 w-3" />
                              <span>Vendor</span>
                            </button>
                          </div>

                          {/* Second Row: Approve Vendor (Full Width) */}
                          <button
                            onClick={() => handleApproveVendor(purchase.cr_id)}
                            disabled={approvingVendorId === purchase.cr_id}
                            className="w-full text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {approvingVendorId === purchase.cr_id ? (
                              <>
                                <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span className="text-[8px]">Approving...</span>
                              </>
                            ) : (
                              <>
                                <Check className="h-3 w-3" />
                                <span>Approve Vendor</span>
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="approved" className="mt-0 p-0">
              <div className="space-y-2">
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No approved requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {filteredRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg border border-blue-200 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="p-2">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{request.project_name}</h3>
                            <Badge className="bg-blue-100 text-blue-800 text-[9px] px-1 py-0">APPROVED</Badge>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-gray-600">
                            <div className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">By: {request.requested_by_name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="px-2 pb-1 text-center text-[10px]">
                          <span className="font-bold text-blue-600 text-sm">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-0.5">Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>

                        <div className="px-2 pb-2 space-y-0.5 text-[9px]">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost:</span>
                            <span className="font-bold text-blue-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Increase:</span>
                            <span className={`font-semibold ${getPercentageColor((request.budget_impact?.increase_percentage || 0))}`}>
                              +{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 p-1.5">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="w-full text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3" />
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
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-900">Completed Requests (Final Approval)</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No completed requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {filteredRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="p-2">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{request.project_name}</h3>
                            <Badge className="bg-green-100 text-green-800 text-[9px] px-1 py-0">
                              COMPLETED
                            </Badge>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-gray-600">
                            <div className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">By: {request.requested_by_name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="px-2 pb-1 text-center text-[10px]">
                          <span className="font-bold text-green-600 text-sm">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-0.5">Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>

                        <div className="px-2 pb-2 space-y-0.5 text-[9px]">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost:</span>
                            <span className="font-bold text-green-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Increase:</span>
                            <span className="font-semibold text-green-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 p-1.5">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="w-full text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3" />
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
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-900">Rejected Requests</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No rejected requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {filteredRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg border border-red-200 shadow-sm hover:shadow-md transition-all duration-200 opacity-75"
                      >
                        <div className="p-2">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{request.project_name}</h3>
                            <Badge className="bg-red-100 text-red-800 text-[9px] px-1 py-0">REJECTED</Badge>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-gray-600">
                            <div className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">By: {request.requested_by_name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="px-2 pb-1 text-center text-[10px]">
                          <span className="font-bold text-red-600 text-sm">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-0.5">Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>

                        <div className="px-2 pb-2 space-y-0.5 text-[9px]">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Cost:</span>
                            <span className="font-bold text-red-600">{formatCurrency(request.materials_total_cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Increase:</span>
                            <span className="font-semibold text-red-600">+{(request.budget_impact?.increase_percentage || 0).toFixed(1)}%</span>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 p-1.5">
                          <button
                            onClick={() => handleReview(request.cr_id)}
                            className="w-full text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3" />
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
        canApprove={permissions.canApproveChangeRequest(user) && selectedChangeRequest?.status === 'pending'}
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

      {/* Enhanced Vendor Info Modal */}
      {showVendorInfoModal && selectedVendorPurchase && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => {
              setShowVendorInfoModal(false);
              setVendorDetails(null);
              setVendorProducts([]);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-5 border-b border-purple-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-purple-500 rounded-full">
                        <Store className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">Vendor Details</h3>
                        <p className="text-sm text-gray-600 mt-0.5">{selectedVendorPurchase.formatted_cr_id || `CR-${selectedVendorPurchase.cr_id}`} - {selectedVendorPurchase.project_name}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowVendorInfoModal(false);
                      setVendorDetails(null);
                      setVendorProducts([]);
                    }}
                    className="p-2 hover:bg-purple-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
                {loadingVendorDetails ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="ml-3 text-gray-600">Loading vendor details...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Vendor Company Information */}
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                      <h4 className="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2">
                        <Store className="w-5 h-5" />
                        {vendorDetails?.company_name || selectedVendorPurchase.vendor_name}
                      </h4>

                      {vendorDetails && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          {vendorDetails.contact_person_name && (
                            <div>
                              <span className="text-purple-700 font-medium">Contact Person:</span>
                              <p className="text-gray-900 mt-1">{vendorDetails.contact_person_name}</p>
                            </div>
                          )}
                          {vendorDetails.email && (
                            <div>
                              <span className="text-purple-700 font-medium">Email:</span>
                              <p className="text-gray-900 mt-1">{vendorDetails.email}</p>
                            </div>
                          )}
                          {vendorDetails.phone && (
                            <div>
                              <span className="text-purple-700 font-medium">Phone:</span>
                              <p className="text-gray-900 mt-1">{vendorDetails.phone_code} {vendorDetails.phone}</p>
                            </div>
                          )}
                          {vendorDetails.category && (
                            <div>
                              <span className="text-purple-700 font-medium">Category:</span>
                              <Badge className="ml-2 bg-purple-200 text-purple-900">{vendorDetails.category}</Badge>
                            </div>
                          )}
                          {(vendorDetails.street_address || vendorDetails.city || vendorDetails.country) && (
                            <div className="md:col-span-2">
                              <span className="text-purple-700 font-medium">Address:</span>
                              <p className="text-gray-900 mt-1">
                                {[vendorDetails.street_address, vendorDetails.city, vendorDetails.state, vendorDetails.country, vendorDetails.pin_code]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            </div>
                          )}
                          {vendorDetails.gst_number && (
                            <div>
                              <span className="text-purple-700 font-medium">GST Number:</span>
                              <p className="text-gray-900 mt-1">{vendorDetails.gst_number}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Requested Materials */}
                    <div>
                      <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <Package className="w-5 h-5 text-blue-600" />
                        Requested Materials ({selectedVendorPurchase.materials_count})
                      </h4>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-blue-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900">Material</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-blue-900">Quantity</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-blue-900">Unit Price</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-blue-900">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-200">
                            {selectedVendorPurchase.materials?.map((material, idx) => (
                              <tr key={idx} className="hover:bg-blue-100/50 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-900 font-medium">{material.material_name}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 text-right">{material.quantity} {material.unit}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 text-right">AED {material.unit_price?.toLocaleString()}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">AED {material.total_price?.toLocaleString()}</td>
                              </tr>
                            ))}
                            <tr className="bg-blue-100 font-bold">
                              <td colSpan={3} className="px-4 py-3 text-sm text-blue-900 text-right">Grand Total:</td>
                              <td className="px-4 py-3 text-lg text-blue-900 text-right">AED {selectedVendorPurchase.total_cost.toLocaleString()}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Vendor Products/Services Table */}
                    {vendorProducts.length > 0 && (
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                          <Package className="w-5 h-5 text-green-600" />
                          Vendor Products/Services ({vendorProducts.length})
                        </h4>
                        <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
                          <table className="w-full">
                            <thead className="bg-green-100">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-green-900">Product Name</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-green-900">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-green-900">Description</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-green-900">Price</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-green-200">
                              {vendorProducts.map((product, idx) => (
                                <tr key={product.product_id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-green-50/30'} hover:bg-green-100/50 transition-colors`}>
                                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{product.product_name}</td>
                                  <td className="px-4 py-3 text-sm">
                                    {product.category ? (
                                      <Badge className="bg-green-200 text-green-900 text-[10px]">{product.category}</Badge>
                                    ) : (
                                      <span className="text-gray-400 text-xs">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                                    {product.description ? (
                                      <span className="line-clamp-2">{product.description}</span>
                                    ) : (
                                      <span className="text-gray-400 text-xs">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {product.unit_price ? (
                                      <div className="text-sm">
                                        <div className="font-semibold text-green-900">AED {product.unit_price.toLocaleString()}</div>
                                        <div className="text-xs text-gray-600">per {product.unit || 'unit'}</div>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Project Information */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Project Information</h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-gray-500">Project:</span>
                          <p className="font-semibold text-gray-900 mt-1">{selectedVendorPurchase.project_name}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Client:</span>
                          <p className="font-semibold text-gray-900 mt-1">{selectedVendorPurchase.client}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Item:</span>
                          <p className="font-semibold text-gray-900 mt-1">{selectedVendorPurchase.item_name}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Created:</span>
                          <p className="font-semibold text-gray-900 mt-1">{new Date(selectedVendorPurchase.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between gap-3">
                <Button
                  onClick={() => {
                    setShowVendorInfoModal(false);
                    setShowVendorSelectionModal(true);
                  }}
                  className="px-6 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Store className="w-4 h-4 mr-2" />
                  Change Vendor
                </Button>
                <Button
                  onClick={() => {
                    setShowVendorInfoModal(false);
                    setVendorDetails(null);
                    setVendorProducts([]);
                  }}
                  variant="outline"
                  className="px-6"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* Material Vendor Selection Modal - For changing vendor per material */}
      {selectedVendorPurchase && (
        <MaterialVendorSelectionModal
          purchase={selectedVendorPurchase}
          isOpen={showVendorSelectionModal}
          onClose={() => setShowVendorSelectionModal(false)}
          onVendorSelected={() => {
            setShowVendorSelectionModal(false);
            loadVendorApprovals();
            loadChangeRequests();
            showSuccess('Vendor selection updated!');
          }}
        />
      )}

      {/* Rejection Reason Modal */}
      <RejectionReasonModal
        isOpen={showRejectionModal}
        onClose={() => {
          setShowRejectionModal(false);
          setRejectingCrId(null);
          setSelectedChangeRequest(null);
        }}
        onSubmit={handleRejectionSubmit}
        title="Reject Change Request"
      />
    </div>
  );
};

// ✅ PERFORMANCE FIX: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(ChangeRequestsPage);
