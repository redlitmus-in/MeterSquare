import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  ShoppingCart,
  CheckCircle,
  Clock,
  Building2,
  MapPin,
  FileText,
  Package,
  Calendar,
  Eye,
  Check,
  DollarSign,
  LayoutGrid,
  Table as TableIcon,
  Store,
  Edit,
  Mail,
  TruckIcon,
  XCircleIcon,
  Phone,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAutoSync } from '@/hooks/useAutoSync';
import { buyerService, Purchase, PurchaseListResponse } from '../services/buyerService';
import PurchaseDetailsModal from '../components/PurchaseDetailsModal';
import VendorSelectionModal from '../components/VendorSelectionModal';
import VendorEmailModal from '../components/VendorEmailModal';
import { BOQAssignment, getSEBoqAssignments, selectVendorForSEBoq, completeSEBoqPurchase } from '@/services/boqAssignmentService';
import { buyerVendorService, Vendor as BuyerVendor } from '../services/buyerVendorService';

const PurchaseOrders: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ongoing' | 'pending_approval' | 'completed' | 'se_boq_assignments'>('ongoing');
  const [ongoingSubTab, setOngoingSubTab] = useState<'pending_purchase' | 'vendor_approved'>('pending_purchase');
  const [seBoqSubTab, setSeBoqSubTab] = useState<'pending_vendor' | 'pending_td_approval' | 'vendor_approved' | 'completed'>('pending_vendor');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isVendorSelectionModalOpen, setIsVendorSelectionModalOpen] = useState(false);
  const [isVendorEmailModalOpen, setIsVendorEmailModalOpen] = useState(false);
  const [completingPurchaseId, setCompletingPurchaseId] = useState<number | null>(null);
  const [selectedSEBoqAssignment, setSelectedSEBoqAssignment] = useState<BOQAssignment | null>(null);
  const [seBoqAssignments, setSeBoqAssignments] = useState<BOQAssignment[]>([]);
  const [loadingSEBoq, setLoadingSEBoq] = useState(false);
  const [showSEBoqVendorModal, setShowSEBoqVendorModal] = useState(false);
  const [completingSEBoqId, setCompletingSEBoqId] = useState<number | null>(null);
  const [seBoqVendors, setSeBoqVendors] = useState<BuyerVendor[]>([]);
  const [selectedSeBoqVendorId, setSelectedSeBoqVendorId] = useState<number | null>(null);
  const [isSelectingSeBoqVendor, setIsSelectingSeBoqVendor] = useState(false);
  const [isInitialSEBoqLoad, setIsInitialSEBoqLoad] = useState(true);
  const [showSEBoqDetailsModal, setShowSEBoqDetailsModal] = useState(false);
  const [selectedSEBoqForDetails, setSelectedSEBoqForDetails] = useState<BOQAssignment | null>(null);
  const [sendingSeBoqEmailId, setSendingSeBoqEmailId] = useState<number | null>(null);

  // Fetch SE BOQ assignments
  const fetchSEBoqAssignments = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoadingSEBoq(true);
      }
      const data = await getSEBoqAssignments();
      setSeBoqAssignments(data);
    } catch (error) {
      console.error('Failed to load SE BOQ assignments:', error);
    } finally {
      if (isInitialLoad) {
        setLoadingSEBoq(false);
        setIsInitialSEBoqLoad(false);
      }
    }
  };

  // Fetch SE BOQ assignments when tab is active
  React.useEffect(() => {
    if (activeTab === 'se_boq_assignments') {
      fetchSEBoqAssignments(isInitialSEBoqLoad);
      // Auto-refresh every 5 seconds when on this tab (silent refresh)
      const interval = setInterval(() => fetchSEBoqAssignments(false), 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Load vendors when SE BOQ vendor modal opens
  React.useEffect(() => {
    const loadVendors = async () => {
      if (showSEBoqVendorModal) {
        try {
          const response = await buyerVendorService.getAllVendors({
            status: 'active',
            per_page: 100
          });
          setSeBoqVendors(response.vendors);
        } catch (error) {
          console.error('Error loading vendors:', error);
          toast.error('Failed to load vendors');
        }
      }
    };
    loadVendors();
  }, [showSEBoqVendorModal]);

  // Fetch pending purchases - Auto-refresh every 2 seconds
  const { data: pendingData, isLoading: isPendingLoading, refetch: refetchPending } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-pending-purchases'],
    fetchFn: () => buyerService.getPendingPurchases(),
    staleTime: 2000,
    refetchInterval: 2000,
  });

  // Fetch completed purchases - Auto-refresh every 2 seconds
  const { data: completedData, isLoading: isCompletedLoading, refetch: refetchCompleted } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-completed-purchases'],
    fetchFn: () => buyerService.getCompletedPurchases(),
    staleTime: 2000,
    refetchInterval: 2000,
  });

  const pendingPurchases: Purchase[] = useMemo(() => {
    return (pendingData?.pending_purchases || []).map(p => ({ ...p, status: 'pending' as const }));
  }, [pendingData]);

  const completedPurchases: Purchase[] = useMemo(() => {
    return (completedData?.completed_purchases || []).map(p => ({ ...p, status: 'completed' as const }));
  }, [completedData]);

  // Separate purchases by vendor approval status
  const pendingPurchaseItems = useMemo(() => {
    // No vendor selected yet or vendor pending TD approval
    return pendingPurchases.filter(p => !p.vendor_id || p.vendor_selection_pending_td_approval);
  }, [pendingPurchases]);

  const vendorApprovedItems = useMemo(() => {
    // Vendor selected and approved by TD (no longer pending approval)
    return pendingPurchases.filter(p => p.vendor_id && !p.vendor_selection_pending_td_approval);
  }, [pendingPurchases]);

  const pendingApprovalPurchases = useMemo(() => {
    return pendingPurchases.filter(p => p.vendor_selection_pending_td_approval);
  }, [pendingPurchases]);

  // Filter SE BOQ assignments by sub-tab
  const filteredSEBoqAssignments = useMemo(() => {
    if (seBoqSubTab === 'pending_vendor') {
      return seBoqAssignments.filter(a => !a.selected_vendor_id);
    } else if (seBoqSubTab === 'pending_td_approval') {
      return seBoqAssignments.filter(a => a.vendor_selection_status === 'pending_td_approval');
    } else if (seBoqSubTab === 'vendor_approved') {
      return seBoqAssignments.filter(a => a.vendor_selection_status === 'approved' && a.status !== 'purchase_completed');
    } else {
      return seBoqAssignments.filter(a => a.status === 'purchase_completed');
    }
  }, [seBoqAssignments, seBoqSubTab]);

  // Determine which purchases to show based on active tab and sub-tab
  const currentPurchases = useMemo(() => {
    if (activeTab === 'ongoing') {
      return ongoingSubTab === 'pending_purchase' ? pendingPurchaseItems : vendorApprovedItems;
    } else if (activeTab === 'pending_approval') {
      return pendingApprovalPurchases;
    } else if (activeTab === 'se_boq_assignments') {
      return []; // SE BOQ assignments are handled separately
    } else {
      return completedPurchases;
    }
  }, [activeTab, ongoingSubTab, pendingPurchaseItems, vendorApprovedItems, pendingApprovalPurchases, completedPurchases]);

  const filteredPurchases = useMemo(() => {
    return currentPurchases.filter(purchase => {
      const matchesSearch =
        purchase.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        purchase.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        purchase.item_name.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    });
  }, [currentPurchases, searchTerm]);

  const stats = useMemo(() => {
    const seBoqPendingVendor = seBoqAssignments.filter(a => !a.selected_vendor_id).length;
    const seBoqPendingTDApproval = seBoqAssignments.filter(a => a.vendor_selection_status === 'pending_td_approval').length;
    const seBoqVendorApproved = seBoqAssignments.filter(a => a.vendor_selection_status === 'approved' && a.status !== 'purchase_completed').length;
    const seBoqCompleted = seBoqAssignments.filter(a => a.status === 'purchase_completed').length;

    return {
      ongoing: pendingPurchaseItems.length + vendorApprovedItems.length,
      pendingPurchase: pendingPurchaseItems.length,
      vendorApproved: vendorApprovedItems.length,
      pendingApproval: pendingApprovalPurchases.length,
      completed: completedPurchases.length,
      seBoqTotal: seBoqAssignments.length,
      seBoqPendingVendor,
      seBoqPendingTDApproval,
      seBoqVendorApproved,
      seBoqCompleted
    };
  }, [pendingPurchaseItems, vendorApprovedItems, pendingApprovalPurchases, completedPurchases, seBoqAssignments]);

  const handleViewDetails = (purchase: Purchase, openInEditMode: boolean = false) => {
    setSelectedPurchase(purchase);
    setIsDetailsModalOpen(true);
    // Store edit mode preference
    if (openInEditMode) {
      sessionStorage.setItem('purchaseEditMode', 'true');
    } else {
      sessionStorage.removeItem('purchaseEditMode');
    }
  };

  const handleEditPurchase = (purchase: Purchase) => {
    handleViewDetails(purchase, true);
  };

  const handleSelectVendor = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsVendorSelectionModalOpen(true);
  };

  const handleSendEmailToVendor = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setIsVendorEmailModalOpen(true);
  };

  const handleMarkAsComplete = async (crId: number) => {
    try {
      setCompletingPurchaseId(crId);
      await buyerService.completePurchase({ cr_id: crId });

      toast.success('Purchase marked as complete successfully!');

      // Refetch both lists
      refetchPending();
      refetchCompleted();
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete purchase');
    } finally {
      setCompletingPurchaseId(null);
    }
  };

  const handleSEBoqVendorSelect = async () => {
    if (!selectedSEBoqAssignment || !selectedSeBoqVendorId) {
      toast.error('Please select a vendor');
      return;
    }

    try {
      setIsSelectingSeBoqVendor(true);
      await selectVendorForSEBoq(selectedSEBoqAssignment.assignment_id, selectedSeBoqVendorId);
      toast.success('Vendor selected. Awaiting TD approval.');
      setShowSEBoqVendorModal(false);
      setSelectedSEBoqAssignment(null);
      setSelectedSeBoqVendorId(null);
      fetchSEBoqAssignments(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to select vendor';
      toast.error(errorMessage);
      console.error(error);
    } finally {
      setIsSelectingSeBoqVendor(false);
    }
  };

  const handleCompleteSEBoqPurchase = async (assignmentId: number) => {
    try {
      setCompletingSEBoqId(assignmentId);
      await completeSEBoqPurchase(assignmentId);
      toast.success('Purchase completed successfully');
      fetchSEBoqAssignments(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to complete purchase';
      toast.error(errorMessage);
      console.error(error);
    } finally {
      setCompletingSEBoqId(null);
    }
  };

  const handleSendSeBoqVendorEmail = async (assignmentId: number, vendorEmail: string) => {
    try {
      setSendingSeBoqEmailId(assignmentId);
      const response = await buyerService.sendSeBoqVendorEmail(assignmentId, vendorEmail);
      toast.success('Email sent to vendor successfully!');
      fetchSEBoqAssignments(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to send email to vendor';
      toast.error(errorMessage);
      console.error(error);
    } finally {
      setSendingSeBoqEmailId(null);
    }
  };

  const isLoading = isPendingLoading || isCompletedLoading;

  if (isLoading && currentPurchases.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" color="purple" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm mb-8">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-500">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Approved extra materials and change requests
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Total Purchases</div>
              <div className="text-2xl font-bold text-purple-600">{stats.ongoing + stats.pendingApproval + stats.completed}</div>
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
              placeholder="Search by project, client, or item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-gray-200 focus:border-gray-300 focus:ring-0 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('card')}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  viewMode === 'card'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Card view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Table view"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tab Toggle Buttons */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('ongoing')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'ongoing'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Clock className="w-3 h-3 inline mr-1" />
                Ongoing ({stats.ongoing})
              </button>
              <button
                onClick={() => setActiveTab('pending_approval')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'pending_approval'
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Store className="w-3 h-3 inline mr-1" />
                Pending Approval ({stats.pendingApproval})
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'completed'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <CheckCircle className="w-3 h-3 inline mr-1" />
                Completed ({stats.completed})
              </button>
              <button
                onClick={() => setActiveTab('se_boq_assignments')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeTab === 'se_boq_assignments'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Package className="w-3 h-3 inline mr-1" />
                SE BOQ
              </button>
            </div>
          </div>
        </div>

        {/* Sub-tabs for Ongoing - Only show when Ongoing tab is active */}
        {activeTab === 'ongoing' && (
          <div className="mb-4 flex justify-center">
            <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setOngoingSubTab('pending_purchase')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                  ongoingSubTab === 'pending_purchase'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <ShoppingCart className="w-3 h-3 inline mr-1" />
                Pending Purchase ({stats.pendingPurchase})
              </button>
              <button
                onClick={() => setOngoingSubTab('vendor_approved')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                  ongoingSubTab === 'vendor_approved'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <CheckCircle className="w-3 h-3 inline mr-1" />
                Vendor Approved ({stats.vendorApproved})
              </button>
            </div>
          </div>
        )}

        {/* Sub-tabs for SE BOQ Assignments - Only show when SE BOQ tab is active */}
        {activeTab === 'se_boq_assignments' && (
          <div className="mb-4 flex justify-center">
            <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setSeBoqSubTab('pending_vendor')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                  seBoqSubTab === 'pending_vendor'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <TruckIcon className="w-3 h-3 inline mr-1" />
                Pending Vendor ({stats.seBoqPendingVendor})
              </button>
              <button
                onClick={() => setSeBoqSubTab('pending_td_approval')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                  seBoqSubTab === 'pending_td_approval'
                    ? 'bg-yellow-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Clock className="w-3 h-3 inline mr-1" />
                Pending TD ({stats.seBoqPendingTDApproval})
              </button>
              <button
                onClick={() => setSeBoqSubTab('vendor_approved')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                  seBoqSubTab === 'vendor_approved'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <CheckCircle className="w-3 h-3 inline mr-1" />
                Approved ({stats.seBoqVendorApproved})
              </button>
              <button
                onClick={() => setSeBoqSubTab('completed')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                  seBoqSubTab === 'completed'
                    ? 'bg-green-700 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <CheckCircle className="w-3 h-3 inline mr-1" />
                Completed ({stats.seBoqCompleted})
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="space-y-4">
          {/* SE BOQ Assignments Tab Content */}
          {activeTab === 'se_boq_assignments' ? (
            loadingSEBoq ? (
              <div className="flex items-center justify-center py-12">
                <ModernLoadingSpinners variant="pulse-wave" color="blue" />
              </div>
            ) : filteredSEBoqAssignments.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">
                  No SE BOQ assignments in this category
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSEBoqAssignments.map((assignment, index) => (
                  <motion.div
                    key={assignment.assignment_id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Card Header */}
                    <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-base font-bold text-gray-900 line-clamp-1">
                          {assignment.boq?.boq_name || `BOQ-${assignment.boq_id}`}
                        </h3>
                        <Badge className="bg-blue-100 text-blue-800 text-xs whitespace-nowrap">
                          {assignment.status === 'purchase_completed' ? (
                            <>
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              Completed
                            </>
                          ) : assignment.vendor_selection_status === 'approved' ? (
                            <>
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              Approved
                            </>
                          ) : assignment.vendor_selection_status === 'pending_td_approval' ? (
                            <>
                              <Clock className="w-3 h-3 inline mr-1" />
                              Pending TD
                            </>
                          ) : (
                            <>
                              <TruckIcon className="w-3 h-3 inline mr-1" />
                              Pending Vendor
                            </>
                          )}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{assignment.project?.project_name}</span>
                        </div>
                        {assignment.project?.client && (
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{assignment.project.client}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">Assigned by: {assignment.assigned_by_name}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="space-y-3 mb-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
                            <div className="text-xs text-purple-700 mb-0.5">Materials</div>
                            <div className="text-sm font-medium flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              {assignment.materials?.length || 0} items
                            </div>
                          </div>
                          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                            <div className="text-xs text-green-700 mb-0.5">Total Cost</div>
                            <div className="text-sm font-medium flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {formatCurrency(assignment.total_cost || 0)}
                            </div>
                          </div>
                        </div>

                        {/* Vendor Info */}
                        {assignment.vendor && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                            <div className="text-xs text-gray-700 mb-1 font-medium">Selected Vendor</div>
                            <div className="text-sm font-bold text-gray-900">{assignment.vendor.company_name}</div>
                            <div className="text-xs text-gray-600">{assignment.vendor.email}</div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-1.5 mt-auto">
                        {/* Select Vendor - Only show if no vendor selected */}
                        {!assignment.selected_vendor_id && (
                          <Button
                            onClick={() => {
                              setSelectedSEBoqAssignment(assignment);
                              setShowSEBoqVendorModal(true);
                            }}
                            size="sm"
                            className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1"
                          >
                            <TruckIcon className="w-3 h-3 mr-1" />
                            Select Vendor
                          </Button>
                        )}

                        {/* View Details Button - Always show */}
                        <Button
                          onClick={() => {
                            setSelectedSEBoqForDetails(assignment);
                            setShowSEBoqDetailsModal(true);
                          }}
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50 px-2 py-1"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View Details
                        </Button>

                        {/* Send to Vendor - Only show if vendor approved and not completed */}
                        {assignment.vendor_selection_status === 'approved' && assignment.status !== 'purchase_completed' && (
                          assignment.vendor_email_sent ? (
                            <div className="w-full h-7 bg-green-50 border border-green-200 rounded flex items-center justify-center text-xs font-medium text-green-700 px-2 py-1">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Sent to Vendor
                            </div>
                          ) : (
                            <Button
                              onClick={() => handleSendSeBoqVendorEmail(assignment.assignment_id, assignment.vendor?.email || '')}
                              disabled={sendingSeBoqEmailId === assignment.assignment_id || !assignment.vendor?.email}
                              size="sm"
                              className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1"
                            >
                              {sendingSeBoqEmailId === assignment.assignment_id ? (
                                <>
                                  <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Mail className="w-3 h-3 mr-1" />
                                  Send to Vendor
                                </>
                              )}
                            </Button>
                          )
                        )}

                        {/* Complete Purchase - Only show if vendor approved and not completed */}
                        {assignment.vendor_selection_status === 'approved' && assignment.status !== 'purchase_completed' && (
                          <Button
                            onClick={() => handleCompleteSEBoqPurchase(assignment.assignment_id)}
                            disabled={completingSEBoqId === assignment.assignment_id}
                            size="sm"
                            className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                          >
                            {completingSEBoqId === assignment.assignment_id ? (
                              <>
                                <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Completing...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Complete Purchase
                              </>
                            )}
                          </Button>
                        )}

                        {/* Pending TD Approval Status */}
                        {assignment.vendor_selection_status === 'pending_td_approval' && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-yellow-600" />
                              <div>
                                <div className="text-xs font-semibold text-yellow-900">Awaiting TD Approval</div>
                                <div className="text-xs text-yellow-700">Vendor selection pending</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          ) : filteredPurchases.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg border border-purple-100 p-12 text-center">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                {activeTab === 'ongoing'
                  ? `No ${ongoingSubTab === 'pending_purchase' ? 'pending purchase' : 'vendor approved'} items found`
                  : `No ${activeTab === 'pending_approval' ? 'pending approval' : 'completed'} purchases found`
                }
              </p>
            </div>
          ) : viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPurchases.map((purchase) => (
                <motion.div
                  key={purchase.cr_id}
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col ${
                    purchase.status === 'completed'
                      ? 'border-green-200'
                      : purchase.vendor_selection_pending_td_approval
                        ? 'border-orange-200'
                        : 'border-purple-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`px-4 py-3 border-b ${
                    purchase.status === 'completed'
                      ? 'bg-gradient-to-r from-green-50 to-green-100 border-green-200'
                      : purchase.vendor_selection_pending_td_approval
                        ? 'bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200'
                        : 'bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">{purchase.project_name}</h3>
                      <Badge className={`${
                        purchase.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : purchase.vendor_selection_pending_td_approval
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-purple-100 text-purple-800'
                      } text-xs whitespace-nowrap`}>
                        CR #{purchase.cr_id}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.client}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{purchase.boq_name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="space-y-3 mb-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Item</div>
                        <div className="font-medium text-gray-900 text-sm line-clamp-1">{purchase.item_name}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Created</div>
                          <div className="text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(purchase.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Materials</div>
                          <div className="text-sm font-medium flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {purchase.materials_count} items
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      {/* Pending Approval Status */}
                      {purchase.vendor_selection_pending_td_approval && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-orange-600" />
                            <div>
                              <div className="text-xs font-semibold text-orange-900">Vendor Selection Pending</div>
                              <div className="text-xs text-orange-700">Waiting for TD approval</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* First Row: Select Vendor - Only show if no vendor selected and not pending approval */}
                      {purchase.status === 'pending' && !purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (
                        <Button
                          onClick={() => handleSelectVendor(purchase)}
                          size="sm"
                          className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1"
                        >
                          <Store className="w-3 h-3 mr-1" />
                          Select Vendor
                        </Button>
                      )}

                      {/* Send Email to Vendor - Only show if vendor is approved by TD */}
                      {purchase.status === 'pending' && purchase.vendor_id && !purchase.vendor_selection_pending_td_approval && (
                        purchase.vendor_email_sent ? (
                          <div className="w-full h-7 bg-green-50 border border-green-200 rounded flex items-center justify-center text-xs font-medium text-green-700 px-2 py-1">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Sent to Vendor
                          </div>
                        ) : (
                          <Button
                            onClick={() => handleSendEmailToVendor(purchase)}
                            size="sm"
                            className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1"
                          >
                            <Mail className="w-3 h-3 mr-1" />
                            Send Email to Vendor
                          </Button>
                        )
                      )}

                      {/* Second Row: View and Edit */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button
                          onClick={() => handleViewDetails(purchase, false)}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-gray-300 hover:bg-gray-50 px-2 py-1"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button
                          onClick={() => handleEditPurchase(purchase)}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-gray-300 hover:bg-gray-50 px-2 py-1"
                          disabled={purchase.status === 'completed' || purchase.vendor_selection_pending_td_approval}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>

                      {/* Third Row: Mark as Complete - Only for ongoing, not pending approval */}
                      {purchase.status === 'pending' && !purchase.vendor_selection_pending_td_approval && (
                        <Button
                          onClick={() => handleMarkAsComplete(purchase.cr_id)}
                          disabled={completingPurchaseId === purchase.cr_id}
                          size="sm"
                          className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1"
                        >
                          {completingPurchaseId === purchase.cr_id ? (
                            <>
                              <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Completing...
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Mark as Complete
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">CR #</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Project</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden md:table-cell">Client</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">Location</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Item</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden sm:table-cell">Materials</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden xl:table-cell">Total Cost</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">Created</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredPurchases.map((purchase) => (
                      <motion.tr
                        key={purchase.cr_id}
                        initial={false}
                        animate={{ opacity: 1 }}
                        className={`hover:bg-gray-50 transition-colors ${
                          purchase.status === 'completed'
                            ? 'bg-green-50/30'
                            : purchase.vendor_selection_pending_td_approval
                              ? 'bg-orange-50/30'
                              : ''
                        }`}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Badge className={`${
                            purchase.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : purchase.vendor_selection_pending_td_approval
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-purple-100 text-purple-800'
                          } text-xs`}>
                            #{purchase.cr_id}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900 max-w-[200px] truncate">{purchase.project_name}</div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <div className="text-gray-600 max-w-[150px] truncate">{purchase.client}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="text-gray-600 max-w-[150px] truncate">{purchase.location}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-gray-900 max-w-[180px] truncate">{purchase.item_name}</div>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Package className="w-3.5 h-3.5" />
                            {purchase.materials_count}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell">
                          <div className="font-medium text-gray-900">{formatCurrency(purchase.total_cost)}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <div className="text-xs text-gray-600">
                            {new Date(purchase.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              onClick={() => handleViewDetails(purchase)}
                              variant="outline"
                              size="sm"
                              className="px-2 py-1 h-auto text-xs border-gray-300"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              <span className="hidden sm:inline">View</span>
                            </Button>
                            {purchase.status === 'pending' && (
                              <Button
                                onClick={() => handleMarkAsComplete(purchase.cr_id)}
                                disabled={completingPurchaseId === purchase.cr_id}
                                size="sm"
                                className="px-2 py-1 h-auto text-xs bg-green-600 hover:bg-green-700 text-white"
                              >
                                {completingPurchaseId === purchase.cr_id ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-3 h-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Complete</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Purchase Details Modal */}
      {selectedPurchase && (
        <PurchaseDetailsModal
          purchase={selectedPurchase}
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedPurchase(null);
          }}
          onVendorSelected={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}

      {/* Vendor Selection Modal */}
      {selectedPurchase && (
        <VendorSelectionModal
          purchase={selectedPurchase}
          isOpen={isVendorSelectionModalOpen}
          onClose={() => {
            setIsVendorSelectionModalOpen(false);
            setSelectedPurchase(null);
          }}
          onVendorSelected={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}

      {/* Vendor Email Modal */}
      {selectedPurchase && (
        <VendorEmailModal
          purchase={selectedPurchase}
          isOpen={isVendorEmailModalOpen}
          onClose={() => {
            setIsVendorEmailModalOpen(false);
            setSelectedPurchase(null);
          }}
          onEmailSent={() => {
            refetchPending();
            refetchCompleted();
          }}
        />
      )}

      {/* SE BOQ Vendor Selection Modal - Custom simplified modal */}
      {selectedSEBoqAssignment && showSEBoqVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Store className="w-6 h-6 text-blue-600" />
                  Select Vendor
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedSEBoqAssignment.boq?.boq_name} - {selectedSEBoqAssignment.materials?.length || 0} materials
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSEBoqVendorModal(false);
                  setSelectedSEBoqAssignment(null);
                  setSelectedSeBoqVendorId(null);
                }}
                className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {seBoqVendors.length === 0 ? (
                <div className="text-center py-12">
                  <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No vendors available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {seBoqVendors.map((vendor) => (
                    <div
                      key={vendor.vendor_id}
                      onClick={() => setSelectedSeBoqVendorId(vendor.vendor_id!)}
                      className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedSeBoqVendorId === vendor.vendor_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1">{vendor.company_name}</h4>
                          <div className="space-y-1 text-xs text-gray-600">
                            {vendor.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {vendor.email}
                              </div>
                            )}
                            {vendor.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {vendor.phone_code} {vendor.phone}
                              </div>
                            )}
                            {vendor.category && (
                              <Badge className="bg-purple-100 text-purple-800 text-xs mt-1">
                                {vendor.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedSeBoqVendorId === vendor.vendor_id
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedSeBoqVendorId === vendor.vendor_id && (
                            <CheckCircle className="w-4 h-4 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <Button
                onClick={() => {
                  setShowSEBoqVendorModal(false);
                  setSelectedSEBoqAssignment(null);
                  setSelectedSeBoqVendorId(null);
                }}
                variant="outline"
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSEBoqVendorSelect}
                disabled={!selectedSeBoqVendorId || isSelectingSeBoqVendor}
                className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSelectingSeBoqVendor ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Selecting...
                  </>
                ) : (
                  <>
                    <Store className="w-4 h-4 mr-2" />
                    Send to TD for Approval
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* SE BOQ Details Modal */}
      <AnimatePresence>
        {showSEBoqDetailsModal && selectedSEBoqForDetails && (
          <>
            {/* Backdrop */}
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowSEBoqDetailsModal(false);
              setSelectedSEBoqForDetails(null);
            }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-5 border-b border-blue-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {selectedSEBoqForDetails.boq?.boq_name || `BOQ-${selectedSEBoqForDetails.boq_id}`}
                      </h2>
                      <Badge className={`${
                        selectedSEBoqForDetails.status === 'purchase_completed'
                          ? 'bg-green-600 text-white'
                          : selectedSEBoqForDetails.vendor_selection_status === 'approved'
                            ? 'bg-blue-600 text-white'
                            : selectedSEBoqForDetails.vendor_selection_status === 'pending_td_approval'
                              ? 'bg-yellow-600 text-white'
                              : 'bg-gray-600 text-white'
                      }`}>
                        {selectedSEBoqForDetails.status === 'purchase_completed' ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Completed
                          </>
                        ) : selectedSEBoqForDetails.vendor_selection_status === 'approved' ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Approved
                          </>
                        ) : selectedSEBoqForDetails.vendor_selection_status === 'pending_td_approval' ? (
                          <>
                            <Clock className="w-3 h-3 mr-1" />
                            Pending TD
                          </>
                        ) : (
                          <>
                            <TruckIcon className="w-3 h-3 mr-1" />
                            Pending Vendor
                          </>
                        )}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4" />
                        {selectedSEBoqForDetails.project?.project_name}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4" />
                        {selectedSEBoqForDetails.project?.client || 'N/A'}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {selectedSEBoqForDetails.project?.location || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowSEBoqDetailsModal(false);
                      setSelectedSEBoqForDetails(null);
                    }}
                    className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

            {/* Body */}
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Package className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Total Materials</div>
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedSEBoqForDetails.materials?.length || 0}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Total Cost</div>
                      <div className="text-2xl font-bold text-green-600">
                        {formatCurrency(selectedSEBoqForDetails.total_cost || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Assigned By</div>
                      <div className="text-lg font-bold text-blue-600">
                        {selectedSEBoqForDetails.assigned_by_name}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vendor Info (if selected) */}
              {selectedSEBoqForDetails.vendor && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Store className="w-5 h-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-900">Selected Vendor</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Company Name</div>
                      <div className="font-medium text-gray-900">{selectedSEBoqForDetails.vendor.company_name}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Email</div>
                      <div className="font-medium text-gray-900">{selectedSEBoqForDetails.vendor.email}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Materials Table */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                  <h4 className="font-bold text-gray-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    Materials Details
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Item</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Sub-Item</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Material</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedSEBoqForDetails.materials?.map((material, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                            {material.item_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {material.sub_item_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {material.material_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right">
                            {material.quantity} {material.unit}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right">
                            {formatCurrency(material.unit_price || 0)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                            {formatCurrency(material.total_price || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          Grand Total:
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          {formatCurrency(selectedSEBoqForDetails.total_cost || 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end">
              <Button
                onClick={() => {
                  setShowSEBoqDetailsModal(false);
                  setSelectedSEBoqForDetails(null);
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
      </AnimatePresence>
    </div>
  );
};

export default PurchaseOrders;
