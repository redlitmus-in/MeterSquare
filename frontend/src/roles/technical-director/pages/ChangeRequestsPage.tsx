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
import { buyerService, Purchase, POChild } from '@/roles/buyer/services/buyerService';
import { buyerVendorService, Vendor, VendorProduct } from '@/roles/buyer/services/buyerVendorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { API_BASE_URL } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import EditChangeRequestModal from '@/components/modals/EditChangeRequestModal';
import ApprovalWithBuyerModal from '@/components/modals/ApprovalWithBuyerModal';
import RejectionReasonModal from '@/components/modals/RejectionReasonModal';
import MaterialVendorSelectionModal from '@/roles/buyer/components/MaterialVendorSelectionModal';
import TDLPOEditorModal from '../components/TDLPOEditorModal';
import { useAuthStore } from '@/store/authStore';
import { permissions } from '@/utils/rolePermissions';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';

// Helper function to calculate total cost from POChild materials
const calculatePOChildTotal = (poChild: POChild): number => {
  if (poChild.materials_total_cost && poChild.materials_total_cost > 0) {
    return poChild.materials_total_cost;
  }
  // Calculate from materials if total is 0
  const materials = poChild.materials || [];
  return materials.reduce((sum, m) => {
    const unitPrice = m.unit_price || m.boq_unit_price || 0;
    const quantity = m.quantity || 0;
    const totalPrice = m.total_price || m.boq_total_price || (unitPrice * quantity) || 0;
    return sum + totalPrice;
  }, 0);
};

const ChangeRequestsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('vendor_approvals');
  const [vendorApprovalsSubTab, setVendorApprovalsSubTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [vendorApprovals, setVendorApprovals] = useState<Purchase[]>([]);
  const [pendingPOChildren, setPendingPOChildren] = useState<POChild[]>([]);
  const [approvedPOChildren, setApprovedPOChildren] = useState<POChild[]>([]);
  const [rejectedPOChildren, setRejectedPOChildren] = useState<POChild[]>([]);
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
  const [rejectingPOChildId, setRejectingPOChildId] = useState<number | null>(null);

  // LPO Editor state
  const [showLpoEditorModal, setShowLpoEditorModal] = useState(false);
  const [selectedPOChildForLpo, setSelectedPOChildForLpo] = useState<POChild | null>(null);
  const [selectedCrIdForLpo, setSelectedCrIdForLpo] = useState<number | null>(null);
  const [lpoEditorReadOnly, setLpoEditorReadOnly] = useState(false);

  // ✅ LISTEN TO REAL-TIME UPDATES - This makes data reload automatically!
  const changeRequestUpdateTimestamp = useRealtimeUpdateStore(state => state.changeRequestUpdateTimestamp);

  // Fetch change requests and vendor approvals - real-time subscriptions handle updates
  useEffect(() => {
    // Initial load with loading spinner
    loadChangeRequests(true);
    loadVendorApprovals();
    loadPendingPOChildren();
    loadApprovedPOChildren();
    loadRejectedPOChildren();

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
    loadPendingPOChildren(); // Also reload PO children
    loadApprovedPOChildren(); // Also reload approved PO children
    loadRejectedPOChildren(); // Also reload rejected PO children
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
          showError(response.message || 'Failed to load POs');
        }
      }
    } catch (error) {
      console.error('Error loading change requests:', error);
      // Only show error toast on initial load to avoid spam
      if (showLoadingSpinner) {
        showError('Failed to load POs');
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

        // Filter for change requests with vendor selection (pending, approved, or rejected)
        // Include ALL CRs that have a vendor_selection_status
        const pendingVendorApprovals = response.data.filter(
          (cr: ChangeRequestItem) => {
            const vendorStatus = cr.vendor_selection_status;

            // Check if this CR has a vendor selection status (pending, approved, or rejected)
            const hasVendorSelection = vendorStatus && ['pending_td_approval', 'approved', 'rejected'].includes(vendorStatus);

            console.log(`CR-${cr.cr_id}:`, {
              status: cr.status,
              vendor_selection_status: cr.vendor_selection_status,
              selected_vendor_name: cr.selected_vendor_name,
              formatted_cr_id: cr.formatted_cr_id,
              hasVendorSelection
            });

            return hasVendorSelection;
          }
        );

        console.log('✅ Filtered vendor approvals:', pendingVendorApprovals.length);

        // Map to Purchase format for compatibility
        const mappedApprovals: Purchase[] = pendingVendorApprovals.map((cr: ChangeRequestItem) => {
          // Calculate materials with vendor prices
          const mappedMaterials = (cr.materials_data || []).map(mat => {
            // Get vendor's negotiated price from material_vendor_selections
            const vendorSelection = cr.material_vendor_selections?.[mat.material_name];
            const vendorUnitPrice = vendorSelection?.negotiated_price ?? mat.unit_price ?? 0;
            const quantity = mat.quantity || 0;
            // Get BOQ price directly from material (already available in materials_data)
            const boqPrice = mat.boq_unit_price || mat.original_unit_price || 0;

            return {
              material_name: mat.material_name || '',
              quantity: quantity,
              unit: mat.unit || '',
              unit_price: vendorUnitPrice,  // Vendor's negotiated price
              total_price: vendorUnitPrice * quantity,  // Recalculate based on vendor price
              boq_unit_price: boqPrice,  // BOQ price for comparison
              boq_total_price: boqPrice * quantity
            };
          });

          // Calculate total cost based on vendor prices
          const vendorTotalCost = mappedMaterials.reduce((sum, mat) => sum + mat.total_price, 0);

          return {
            cr_id: cr.cr_id,
            formatted_cr_id: cr.formatted_cr_id || `PO-${cr.cr_id}`,
            project_id: cr.project_id,
            project_name: cr.project_name || cr.boq_name || 'Unknown Project',
            client: cr.project_client || '',
            item_name: cr.item_name || '',
            materials_count: cr.materials_data?.length || 0,
            total_cost: vendorTotalCost,  // Use calculated vendor total
            vendor_name: cr.selected_vendor_name || 'No Vendor',
            vendor_id: cr.selected_vendor_id || 0,
            created_at: cr.created_at,
            status: cr.status,
            vendor_selection_pending_td_approval: true,
            vendor_selection_status: cr.vendor_selection_status,
            materials: mappedMaterials,
            boq_id: cr.boq_id,
            boq_name: cr.boq_name || ''
          };
        });

        setVendorApprovals(mappedApprovals);
      }
    } catch (error) {
      console.error('Error loading vendor approvals:', error);
    }
  };

  // Load PO children pending TD approval (new system)
  const loadPendingPOChildren = async () => {
    try {
      const response = await buyerService.getPendingPOChildren();
      if (response.success) {
        console.log('🔍 Pending PO Children:', response.po_children);
        setPendingPOChildren(response.po_children || []);
      }
    } catch (error) {
      console.error('Error loading pending PO children:', error);
    }
  };

  // Load approved PO children (for approved sub-tab)
  const loadApprovedPOChildren = async () => {
    try {
      console.log('📥 Loading approved PO children for TD...');
      const response = await buyerService.getApprovedPOChildren();
      console.log('📥 Approved PO Children response:', response);
      if (response.success) {
        console.log('✅ Approved PO Children loaded:', response.po_children?.length || 0, 'items');
        setApprovedPOChildren(response.po_children || []);
      } else {
        console.warn('⚠️ Approved PO Children response not successful:', response);
        setApprovedPOChildren([]);
      }
    } catch (error: any) {
      console.error('❌ Error loading approved PO children:', error);
      // Don't show error toast, just set empty state to avoid breaking UI
      setApprovedPOChildren([]);
    }
  };

  // Load rejected PO children (for rejected sub-tab)
  const loadRejectedPOChildren = async () => {
    try {
      const response = await buyerService.getRejectedPOChildren();
      if (response.success) {
        console.log('🚫 Rejected PO Children loaded:', response.po_children?.length || 0, 'items');
        setRejectedPOChildren(response.po_children || []);
      }
    } catch (error: any) {
      console.error('Error loading rejected PO children:', error);
      setRejectedPOChildren([]);
    }
  };

  // Handle PO child approval
  const handleApprovePOChild = async (poChildId: number) => {
    try {
      const response = await buyerService.tdApprovePOChild(poChildId);
      if (response.success) {
        showSuccess(response.message || 'Vendor selection approved!');
        loadPendingPOChildren();
        loadApprovedPOChildren();
        loadVendorApprovals();
      }
    } catch (error: any) {
      showError(error.message || 'Failed to approve vendor selection');
    }
  };

  // Handle PO child rejection
  const handleRejectPOChild = async (poChildId: number, reason: string) => {
    try {
      const response = await buyerService.tdRejectPOChild(poChildId, reason);
      if (response.success) {
        showSuccess(response.message || 'Vendor selection rejected');
        loadPendingPOChildren();
        loadRejectedPOChildren();
        loadVendorApprovals();
      }
    } catch (error: any) {
      showError(error.message || 'Failed to reject vendor selection');
    }
  };

  // Handle viewing vendor info for PO child
  const handleViewPOChildVendorInfo = async (poChild: POChild) => {
    // Convert POChild to Purchase-like object for the vendor info modal
    const purchaseLike: Purchase = {
      cr_id: poChild.parent_cr_id,
      formatted_cr_id: poChild.formatted_id,
      project_id: poChild.project_id || 0,
      project_name: poChild.project_name || 'Unknown Project',
      client: '',
      location: '',
      boq_id: poChild.boq_id || 0,
      boq_name: '',
      item_name: poChild.item_name || '',
      sub_item_name: '',
      request_type: '',
      reason: '',
      materials: poChild.materials || [],
      materials_count: poChild.materials_count || poChild.materials?.length || 0,
      total_cost: poChild.materials_total_cost || 0,
      approved_by: 0,
      approved_at: null,
      created_at: poChild.created_at || '',
      status: 'pending',
      vendor_id: poChild.vendor_id,
      vendor_name: poChild.vendor_name,
      vendor_selection_status: poChild.vendor_selection_status,
    };

    setSelectedVendorPurchase(purchaseLike);
    setShowVendorInfoModal(true);

    // Fetch full vendor details
    if (poChild.vendor_id) {
      try {
        setLoadingVendorDetails(true);
        const [vendor, products] = await Promise.all([
          buyerVendorService.getVendorById(poChild.vendor_id),
          buyerVendorService.getVendorProducts(poChild.vendor_id)
        ]);
        setVendorDetails(vendor);

        // Filter products to only show those that match materials in this PO child
        const materialNames = (poChild.materials || []).map(m =>
          m.material_name?.toLowerCase().trim() || ''
        );

        const relevantProducts = products.filter(product => {
          const productName = product.product_name?.toLowerCase().trim() || '';
          const productCategory = product.category?.toLowerCase().trim() || '';

          return materialNames.some(materialName => {
            if (!materialName) return false;
            return productName.includes(materialName) ||
              materialName.includes(productName) ||
              productCategory.includes(materialName);
          });
        });

        setVendorProducts(relevantProducts.length > 0 ? relevantProducts : products.slice(0, 5));
      } catch (error) {
        console.error('Error loading vendor details:', error);
        setVendorDetails(null);
        setVendorProducts([]);
      } finally {
        setLoadingVendorDetails(false);
      }
    }
  };

  // Handle opening LPO editor for a PO child
  const handleOpenLpoEditor = (poChild: POChild, readOnly: boolean = false) => {
    setSelectedPOChildForLpo(poChild);
    setSelectedCrIdForLpo(poChild.parent_cr_id);
    setLpoEditorReadOnly(readOnly);
    setShowLpoEditorModal(true);
  };

  // Handle viewing PO child details (shows only PO child's materials, not parent CR)
  const handleViewPOChildDetails = (poChild: POChild) => {
    // Convert POChild to ChangeRequestItem format for the details modal
    // Map PO child status to CR status for display
    const mappedStatus = poChild.vendor_selection_status === 'pending_td_approval'
      ? 'pending'
      : poChild.vendor_selection_status === 'approved'
        ? 'approved'
        : poChild.status === 'purchase_completed'
          ? 'purchase_completed'
          : 'pending';

    // Map materials to match ChangeRequestItem format
    // Ensure prices are calculated even if missing from backend
    const mappedMaterials = (poChild.materials || []).map(m => {
      const unitPrice = m.unit_price || m.boq_unit_price || 0;
      const quantity = m.quantity || 0;
      const totalPrice = m.total_price || m.boq_total_price || (unitPrice * quantity) || 0;

      return {
        material_name: m.material_name,
        quantity: quantity,
        unit: m.unit,
        unit_price: unitPrice,
        total_price: totalPrice,
        boq_unit_price: m.boq_unit_price,
        boq_total_price: m.boq_total_price,
        master_material_id: m.master_material_id || undefined,
        justification: m.justification || m.reason || '',
      };
    });

    // Calculate total from mapped materials (in case backend total is 0)
    const calculatedTotal = mappedMaterials.reduce((sum, m) => sum + (m.total_price || 0), 0);

    const poChildAsChangeRequest: ChangeRequestItem & { po_child_id?: number } = {
      cr_id: poChild.parent_cr_id,
      formatted_cr_id: poChild.formatted_id,
      project_id: poChild.project_id || 0,
      project_name: poChild.project_name || 'Unknown Project',
      boq_id: poChild.boq_id || 0,
      boq_name: '',
      item_name: poChild.item_name || '',
      request_type: 'EXTRA_MATERIALS',
      justification: '',
      status: mappedStatus as ChangeRequestItem['status'],
      requested_by_user_id: 0,
      requested_by_name: poChild.vendor_selected_by_buyer_name || '',
      requested_by_role: 'buyer',
      created_at: poChild.created_at || '',
      // Use PO child's materials only
      materials_data: mappedMaterials,
      materials_total_cost: poChild.materials_total_cost || calculatedTotal || 0,
      // Vendor info
      selected_vendor_id: poChild.vendor_id,
      selected_vendor_name: poChild.vendor_name,
      vendor_selection_status: poChild.vendor_selection_status,
      vendor_selected_by_buyer_name: poChild.vendor_selected_by_buyer_name,
      vendor_selection_date: poChild.vendor_selection_date,
      // PO Child ID for LPO preview
      po_child_id: poChild.id,
    };

    setSelectedChangeRequest(poChildAsChangeRequest);
    setShowDetailsModal(true);
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
    try {
      // Handle PO Child rejection
      if (rejectingPOChildId) {
        await handleRejectPOChild(rejectingPOChildId, reason);
        setShowRejectionModal(false);
        setRejectingPOChildId(null);
        return;
      }

      if (!rejectingCrId) return;

      // Check if this is a vendor selection rejection (from vendor approvals tab)
      const isVendorRejection = vendorApprovals.some(p => p.cr_id === rejectingCrId);

      if (isVendorRejection) {
        // Reject vendor selection
        const apiUrl = API_BASE_URL;
        const token = localStorage.getItem('access_token');

        const response = await fetch(`${apiUrl}/buyer/purchase/${rejectingCrId}/td-reject-vendor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ reason })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to reject vendor selection');
        }

        showSuccess('Vendor selection rejected. Buyer has been notified to select a new vendor.');

        // Reload data
        await Promise.all([
          loadVendorApprovals(),
          loadChangeRequests()
        ]);
      } else {
        // Regular change request rejection
        const response = await changeRequestService.reject(rejectingCrId, reason);
        if (response.success) {
          showSuccess('PO rejected');
          loadChangeRequests();
        } else {
          showError(response.message);
        }
      }

      setShowRejectionModal(false);
      setRejectingCrId(null);
    } catch (error: any) {
      showError(error.message || 'Failed to reject');
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
      showError('Failed to load PO details');
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
      // Pending tab: Items awaiting TD approval
      matchesTab = ['under_review', 'approved_by_pm', 'pending'].includes(status);
    } else if (activeTab === 'approved') {
      // Approved tab: CRs approved by TD, buyer selecting vendor
      matchesTab = status === 'assigned_to_buyer' && !req.vendor_selection_status;
    } else if (activeTab === 'completed') {
      // Only show truly completed purchases (purchase_completed status)
      matchesTab = status === 'purchase_completed';
    }
    // vendor_approvals tab uses vendorApprovals data, not changeRequests

    return matchesSearch && matchesTab;
  });

  // Filter vendor approvals for vendor_approvals tab with sub-tabs
  const filteredVendorApprovals = vendorApprovals.filter(purchase => {
    const matchesSearch = purchase.project_name.toLowerCase().includes(searchTerm.toLowerCase());

    if (vendorApprovalsSubTab === 'pending') {
      // Show pending vendor approvals (waiting for TD approval)
      return matchesSearch && purchase.vendor_selection_status === 'pending_td_approval';
    } else if (vendorApprovalsSubTab === 'approved') {
      // Show approved vendor selections
      return matchesSearch && purchase.vendor_selection_status === 'approved';
    } else if (vendorApprovalsSubTab === 'rejected') {
      // Show rejected vendor selections (both 'rejected' and 'td_rejected')
      return matchesSearch && (purchase.vendor_selection_status === 'rejected' || purchase.vendor_selection_status === 'td_rejected');
    }
    return matchesSearch;
  });

  // Filter PO children for vendor_approvals tab (new system)
  const filteredPOChildren = pendingPOChildren.filter(poChild => {
    const matchesSearch = (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (vendorApprovalsSubTab === 'pending') {
      return matchesSearch && poChild.vendor_selection_status === 'pending_td_approval';
    }
    // For approved/rejected, PO children are not in this list anymore (they've been processed)
    return false;
  });

  // Filter approved PO children for approved sub-tab
  const filteredApprovedPOChildren = approvedPOChildren.filter(poChild => {
    const matchesSearch = (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Filter rejected PO children for rejected sub-tab
  const filteredRejectedPOChildren = rejectedPOChildren.filter(poChild => {
    const matchesSearch = (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Calculate vendor totals for change requests
  const enrichedChangeRequests = filteredRequests.map(request => {
    const vendorTotalCost = (request.materials_data || []).reduce((sum, mat) => {
      const vendorSelection = request.material_vendor_selections?.[mat.material_name];
      const vendorPrice = vendorSelection?.negotiated_price ?? mat.unit_price ?? 0;
      return sum + (vendorPrice * (mat.quantity || 0));
    }, 0);

    return { ...request, vendorTotalCost };
  });

  const handleApproveVendor = async (crId: number) => {
    setApprovingVendorId(crId);
    try {
      const apiUrl = API_BASE_URL;
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

      // Switch to vendor_approvals tab and approved sub-tab to show the updated item
      setActiveTab('vendor_approvals');
      setVendorApprovalsSubTab('approved');
    } catch (error: any) {
      console.error('Error approving vendor:', error);
      showError(error.message || 'Failed to approve vendor');
    } finally {
      setApprovingVendorId(null);
    }
  };

  const handleRejectVendorSelection = async (crId: number) => {
    setRejectingCrId(crId);
    setShowRejectionModal(true);
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
      showError('Failed to load PO details');
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

        // Filter products to only show those that match materials in this purchase
        const materialNames = (purchase.materials || []).map(m =>
          m.material_name?.toLowerCase().trim() || ''
        );

        const relevantProducts = products.filter(product => {
          const productName = product.product_name?.toLowerCase().trim() || '';
          const productCategory = product.category?.toLowerCase().trim() || '';

          // Check if product matches any material in the purchase
          return materialNames.some(materialName => {
            if (!materialName) return false;
            // Match by name similarity
            return productName.includes(materialName) ||
                   materialName.includes(productName) ||
                   productCategory.includes(materialName) ||
                   materialName.includes(productCategory);
          });
        });

        setVendorProducts(relevantProducts);
      } catch (error) {
        console.error('Error loading vendor details:', error);
        showError('Failed to load vendor details');
      } finally {
        setLoadingVendorDetails(false);
      }
    }
  };

  const stats = {
    pending: changeRequests.filter(r => {
      const status = r.status?.trim();
      return ['under_review', 'approved_by_pm', 'pending'].includes(status);
    }).length,
    approved: changeRequests.filter(r => {
      const status = r.status?.trim();
      return status === 'assigned_to_buyer' && !r.vendor_selection_status;
    }).length,
    vendorApprovals: vendorApprovals.length + pendingPOChildren.length + approvedPOChildren.length + rejectedPOChildren.length, // Total vendor approvals including PO children
    vendorApprovalsPending: vendorApprovals.filter(p => p.vendor_selection_status === 'pending_td_approval').length + pendingPOChildren.filter(p => p.vendor_selection_status === 'pending_td_approval').length,
    vendorApprovalsApproved: vendorApprovals.filter(p => p.vendor_selection_status === 'approved').length + approvedPOChildren.length,
    vendorApprovalsRejected: vendorApprovals.filter(p => p.vendor_selection_status === 'rejected' || p.vendor_selection_status === 'td_rejected').length + rejectedPOChildren.length,
    poChildrenPending: pendingPOChildren.filter(p => p.vendor_selection_status === 'pending_td_approval').length,
    poChildrenApproved: approvedPOChildren.length,
    poChildrenRejected: rejectedPOChildren.length,
    completed: changeRequests.filter(r => r.status?.trim() === 'purchase_completed').length
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="blue" />
      </div>
    );
  }

  // Table View Component
  const RequestsTable = ({ requests }: { requests: ChangeRequestItem[] }) => {
    // Calculate vendor totals for table view
    const enrichedTableRequests = requests.map(request => {
      const vendorTotalCost = (request.materials_data || []).reduce((sum, mat) => {
        const vendorSelection = request.material_vendor_selections?.[mat.material_name];
        const vendorPrice = vendorSelection?.negotiated_price ?? mat.unit_price ?? 0;
        return sum + (vendorPrice * (mat.quantity || 0));
      }, 0);
      return { ...request, vendorTotalCost };
    });

    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project Name</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>New Items</TableHead>
              <TableHead>Vendor Amount</TableHead>
              <TableHead>BOQ Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedTableRequests.map((request) => {
              const isHighValue = request.approval_type === 'td';
              return (
                <TableRow key={request.cr_id}>
                  <TableCell className="font-semibold">{request.project_name}</TableCell>
                  <TableCell>{request.requested_by_name}</TableCell>
                  <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{(request.materials_data?.length || 0)}</TableCell>
                  <TableCell className="font-semibold text-blue-700">{formatCurrency(request.vendorTotalCost || request.materials_total_cost)}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{formatCurrency(request.materials_total_cost)}</TableCell>
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header - Compact */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <FolderOpen className="w-4 h-4 text-red-600" />
            </div>
            <h1 className="text-lg font-bold text-[#243d8a]">Purchase Orders</h1>
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
              {/* Pending tab - COMMENTED OUT
              <TabsTrigger
                value="pending"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-yellow-500 data-[state=active]:text-yellow-600 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Pending
                <span className="ml-1 text-gray-400">({stats.pending})</span>
              </TabsTrigger>
              */}
              {/* Approved tab - COMMENTED OUT
              <TabsTrigger
                value="approved"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <ShoppingCart className="w-3 h-3 mr-1" />
                Approved
                <span className="ml-1 text-gray-400">({stats.approved})</span>
              </TabsTrigger>
              */}
              <TabsTrigger
                value="vendor_approvals"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-600 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <Store className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Vendor Approvals</span>
                <span className="sm:hidden">Vendors</span>
                <span className="ml-1 text-gray-400">({stats.vendorApprovals})</span>
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-400 data-[state=active]:text-green-500 text-gray-500 px-2 py-2 font-semibold text-[10px] sm:text-xs"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Completed
                <span className="ml-1 text-gray-400">({stats.completed})</span>
              </TabsTrigger>
            </TabsList>
            {/* Sub-tabs for Vendor Approvals */}
            {activeTab === 'vendor_approvals' && (
              <div className="mb-2 p-2 bg-orange-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVendorApprovalsSubTab('pending')}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      vendorApprovalsSubTab === 'pending'
                        ? 'bg-orange-600 text-white'
                        : 'text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Pending ({stats.vendorApprovalsPending})
                  </button>
                  <button
                    onClick={() => {
                      setVendorApprovalsSubTab('approved');
                      // Reload approved PO children when switching to approved tab
                      loadApprovedPOChildren();
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      vendorApprovalsSubTab === 'approved'
                        ? 'bg-green-600 text-white'
                        : 'text-green-700 hover:bg-green-100'
                    }`}
                  >
                    <CheckCircle className="w-3 h-3 inline mr-1" />
                    Approved ({stats.vendorApprovalsApproved})
                  </button>
                  <button
                    onClick={() => setVendorApprovalsSubTab('rejected')}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      vendorApprovalsSubTab === 'rejected'
                        ? 'bg-red-600 text-white'
                        : 'text-red-700 hover:bg-red-100'
                    }`}
                  >
                    <XCircle className="w-3 h-3 inline mr-1" />
                    Rejected ({stats.vendorApprovalsRejected})
                  </button>
                </div>
                <div className="text-[10px] text-gray-600 mt-1">
                  {vendorApprovalsSubTab === 'pending'
                    ? 'Vendor selections waiting for TD approval. Review and approve/reject.'
                    : vendorApprovalsSubTab === 'approved'
                    ? 'Vendor selections approved by TD. Buyers can complete purchases.'
                    : 'Vendor selections rejected by TD. Buyers need to select new vendors.'}
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
                    {enrichedChangeRequests.map((request, index) => {
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
                              <span className="text-gray-500">Vendor Amount:</span>
                              <span className="font-bold text-blue-700">{formatCurrency(request.vendorTotalCost || request.materials_total_cost)}</span>
                            </div>
                            {request.materials_total_cost > 0 && request.vendorTotalCost > 0 && request.materials_total_cost !== request.vendorTotalCost && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-400 text-[8px]">BOQ Amount:</span>
                                  <span className="text-gray-400 text-[8px]">{formatCurrency(request.materials_total_cost)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400 text-[8px]">Difference:</span>
                                  <span className={`text-[8px] font-bold ${request.vendorTotalCost > request.materials_total_cost ? 'text-red-600' : 'text-green-600'}`}>
                                    {request.vendorTotalCost > request.materials_total_cost ? '+' : ''}{formatCurrency(Math.abs(request.vendorTotalCost - request.materials_total_cost))}
                                  </span>
                                </div>
                              </>
                            )}
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
                                disabled={request.status === 'pending_td_approval' || request.vendor_selection_status === 'pending_td_approval'}
                                className={`text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold ${
                                  request.status === 'pending_td_approval' || request.vendor_selection_status === 'pending_td_approval'
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

            <TabsContent value="approved" className="mt-0 p-0">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-900">Approved - Buyer Selecting Vendor</h2>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No approved requests found</p>
                  </div>
                ) : viewMode === 'table' ? (
                  <RequestsTable requests={filteredRequests} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {enrichedChangeRequests.map((request, index) => (
                      <motion.div
                        key={request.cr_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-blue-300"
                      >
                        {/* Header - Compact */}
                        <div className="p-2">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{request.project_name}</h3>
                            <Badge className="bg-blue-100 text-blue-800 text-[9px] px-1 py-0">
                              APPROVED
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
                            <div className="flex items-center gap-1">
                              <ShoppingCart className="h-2.5 w-2.5 text-blue-500" />
                              <span className="truncate text-blue-700 font-medium">Buyer selecting vendor</span>
                            </div>
                          </div>
                        </div>

                        {/* Stats - Compact */}
                        <div className="px-2 pb-1 text-center text-[10px]">
                          <span className="font-bold text-blue-600 text-sm">{(request.materials_data?.length || 0)}</span>
                          <span className="text-gray-600 ml-0.5">Item{(request.materials_data?.length || 0) > 1 ? 's' : ''}</span>
                        </div>

                        {/* Financial Impact - Compact */}
                        <div className="px-2 pb-2 space-y-0.5 text-[9px]">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Vendor Amount:</span>
                            <span className="font-bold text-blue-700">{formatCurrency(request.vendorTotalCost || request.materials_total_cost)}</span>
                          </div>
                          {request.materials_total_cost > 0 && request.vendorTotalCost > 0 && request.materials_total_cost !== request.vendorTotalCost && (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-400 text-[8px]">BOQ Amount:</span>
                                <span className="text-gray-400 text-[8px]">{formatCurrency(request.materials_total_cost)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400 text-[8px]">Difference:</span>
                                <span className={`text-[8px] font-bold ${request.vendorTotalCost > request.materials_total_cost ? 'text-red-600' : 'text-green-600'}`}>
                                  {request.vendorTotalCost > request.materials_total_cost ? '+' : ''}{formatCurrency(Math.abs(request.vendorTotalCost - request.materials_total_cost))}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Actions - Compact */}
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

            <TabsContent value="vendor_approvals" className="mt-0 p-0">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-900">Vendor Selection Approvals</h2>
                {filteredVendorApprovals.length === 0 && filteredPOChildren.length === 0 && (vendorApprovalsSubTab !== 'approved' || filteredApprovedPOChildren.length === 0) && (vendorApprovalsSubTab !== 'rejected' || filteredRejectedPOChildren.length === 0) ? (
                  <div className="text-center py-8">
                    <Store className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">
                      {vendorApprovalsSubTab === 'pending'
                        ? 'No vendor approvals pending'
                        : vendorApprovalsSubTab === 'approved'
                          ? 'No approved vendor selections'
                          : 'No rejected vendor selections'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {/* Approved PO Children FIRST (for Approved sub-tab) - Show at TOP */}
                    {vendorApprovalsSubTab === 'approved' && filteredApprovedPOChildren.map((poChild, index) => (
                      <motion.div
                        key={`approved-po-${poChild.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border-2 border-green-400 ring-2 ring-green-100"
                      >
                        <div className="p-2 bg-gradient-to-r from-green-50 to-emerald-50">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{poChild.project_name || poChild.item_name}</h3>
                            <Badge className="text-[9px] px-1.5 py-0.5 bg-green-600 text-white font-bold">
                              {poChild.formatted_id}
                            </Badge>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-gray-600">
                            <div className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{poChild.item_name || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Store className="h-2.5 w-2.5 text-green-500" />
                              <span className="truncate font-semibold text-green-900">{poChild.vendor_name || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Materials List */}
                        <div className="px-2 pb-2">
                          <div className="text-[9px] text-gray-500 mb-1 font-semibold flex items-center gap-1">
                            <Package className="h-2.5 w-2.5" />
                            Materials ({poChild.materials?.length || 0})
                          </div>
                          <div className="bg-gray-50 rounded border border-gray-200 max-h-28 overflow-y-auto">
                            {poChild.materials && poChild.materials.length > 0 ? (
                              <div className="divide-y divide-gray-100">
                                {poChild.materials.map((material: any, idx: number) => {
                                  const boqPrice = material.boq_unit_price || 0;
                                  // Use vendor price, fallback to BOQ price if vendor price is 0
                                  const vendorPrice = material.unit_price || material.boq_unit_price || 0;
                                  const quantity = material.quantity || 0;
                                  const materialTotal = material.total_price || material.boq_total_price || (vendorPrice * quantity) || 0;
                                  const priceDiff = vendorPrice - boqPrice;
                                  const isOverBudget = priceDiff > 0;

                                  return (
                                    <div key={idx} className="px-1.5 py-1 text-[9px]">
                                      <div className="flex justify-between items-start gap-1">
                                        <span className="text-gray-800 font-medium flex-1 line-clamp-1">{material.material_name}</span>
                                        <div className="text-right whitespace-nowrap">
                                          {vendorPrice > 0 ? (
                                            <span className="text-blue-700 font-bold">
                                              AED {vendorPrice.toLocaleString()}
                                            </span>
                                          ) : (
                                            <span className="text-amber-600 italic text-[8px]">
                                              Price not set
                                            </span>
                                          )}
                                          {boqPrice > 0 && boqPrice !== vendorPrice && (
                                            <span className="text-gray-400 text-[8px] ml-0.5">
                                              (BOQ:{boqPrice})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex justify-between text-gray-500 mt-0.5">
                                        <span>{quantity} {material.unit}</span>
                                        <div className="text-right">
                                          {materialTotal > 0 ? (
                                            <span className="font-semibold text-gray-700">
                                              = AED {materialTotal.toLocaleString()}
                                            </span>
                                          ) : (
                                            <span className="text-amber-600 italic text-[8px]">-</span>
                                          )}
                                          {boqPrice > 0 && priceDiff !== 0 && (
                                            <span className={`ml-0.5 text-[8px] font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                                              {isOverBudget ? '+' : ''}{Math.round(priceDiff * quantity)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="px-2 py-2 text-[9px] text-gray-400 text-center">
                                No materials data
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between mt-1.5 pt-1 border-t border-gray-200 text-[10px]">
                            <span className="text-gray-600 font-semibold">Total Cost:</span>
                            {calculatePOChildTotal(poChild) > 0 ? (
                              <span className="font-bold text-blue-700">AED {calculatePOChildTotal(poChild).toLocaleString()}</span>
                            ) : (
                              <span className="text-amber-600 italic text-[9px]">Prices not set</span>
                            )}
                          </div>
                        </div>

                        {/* Status and Actions */}
                        <div className="border-t border-green-200 p-1.5 flex flex-col gap-1 bg-green-50/50">
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              onClick={() => handleViewPOChildDetails(poChild)}
                              className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                              style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                            >
                              <Eye className="h-3 w-3" />
                              <span>Details</span>
                            </button>
                            <button
                              onClick={() => handleOpenLpoEditor(poChild, true)}
                              className="bg-gray-500 hover:bg-gray-600 text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold"
                            >
                              <FileText className="h-3 w-3" />
                              <span>View LPO</span>
                            </button>
                          </div>
                          <div className="bg-green-100 border border-green-300 rounded px-2 py-1 text-[9px] text-green-800 font-bold text-center">
                            <CheckCircle className="h-3 w-3 inline mr-1" />
                            Approved - Awaiting Buyer
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {/* Pending PO Children (new system) */}
                    {filteredPOChildren.map((poChild, index) => (
                      <motion.div
                        key={`po-${poChild.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-blue-300"
                      >
                        <div className="p-2">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{poChild.project_name || poChild.item_name}</h3>
                            <Badge className="text-[9px] px-1 py-0 bg-blue-100 text-blue-800">
                              {poChild.formatted_id}
                            </Badge>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-gray-600">
                            <div className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{poChild.item_name || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Store className="h-2.5 w-2.5 text-blue-500" />
                              <span className="truncate font-semibold text-blue-900">{poChild.vendor_name || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Materials List */}
                        <div className="px-2 pb-2">
                          <div className="text-[9px] text-gray-500 mb-1 font-semibold flex items-center gap-1">
                            <Package className="h-2.5 w-2.5" />
                            Materials ({poChild.materials?.length || 0})
                          </div>
                          <div className="bg-gray-50 rounded border border-gray-200 max-h-28 overflow-y-auto">
                            {poChild.materials && poChild.materials.length > 0 ? (
                              <div className="divide-y divide-gray-100">
                                {poChild.materials.map((material: any, idx: number) => {
                                  const boqPrice = material.boq_unit_price || 0;
                                  // Use vendor price, fallback to BOQ price if vendor price is 0
                                  const vendorPrice = material.unit_price || material.boq_unit_price || 0;
                                  const quantity = material.quantity || 0;
                                  const materialTotal = material.total_price || material.boq_total_price || (vendorPrice * quantity) || 0;
                                  const priceDiff = vendorPrice - boqPrice;
                                  const isOverBudget = priceDiff > 0;

                                  return (
                                    <div key={idx} className="px-1.5 py-1 text-[9px]">
                                      <div className="flex justify-between items-start gap-1">
                                        <span className="text-gray-800 font-medium flex-1 line-clamp-1">{material.material_name}</span>
                                        <div className="text-right whitespace-nowrap">
                                          {vendorPrice > 0 ? (
                                            <span className="text-blue-700 font-bold">
                                              AED {vendorPrice.toLocaleString()}
                                            </span>
                                          ) : (
                                            <span className="text-amber-600 italic text-[8px]">
                                              Price not set
                                            </span>
                                          )}
                                          {boqPrice > 0 && boqPrice !== vendorPrice && (
                                            <span className="text-gray-400 text-[8px] ml-0.5">
                                              (BOQ:{boqPrice})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex justify-between text-gray-500 mt-0.5">
                                        <span>{quantity} {material.unit}</span>
                                        <div className="text-right">
                                          {materialTotal > 0 ? (
                                            <span className="font-semibold text-gray-700">
                                              = AED {materialTotal.toLocaleString()}
                                            </span>
                                          ) : (
                                            <span className="text-amber-600 italic text-[8px]">-</span>
                                          )}
                                          {boqPrice > 0 && priceDiff !== 0 && (
                                            <span className={`ml-0.5 text-[8px] font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                                              {isOverBudget ? '+' : ''}{Math.round(priceDiff * quantity)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="px-2 py-2 text-[9px] text-gray-400 text-center">
                                No materials data
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between mt-1.5 pt-1 border-t border-gray-200 text-[10px]">
                            <span className="text-gray-600 font-semibold">Total Cost:</span>
                            {calculatePOChildTotal(poChild) > 0 ? (
                              <span className="font-bold text-blue-700">AED {calculatePOChildTotal(poChild).toLocaleString()}</span>
                            ) : (
                              <span className="text-amber-600 italic text-[9px]">Prices not set</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="border-t border-gray-200 p-1.5 flex flex-col gap-1">
                          {/* Row 1: Details button */}
                          <button
                            onClick={() => handleViewPOChildDetails(poChild)}
                            className="w-full text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3" />
                            <span>Details</span>
                          </button>
                          {/* Row 2: Approve/Reject */}
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              onClick={() => handleApprovePOChild(poChild.id)}
                              className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold bg-green-600"
                            >
                              <Check className="h-3 w-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => {
                                setRejectingPOChildId(poChild.id);
                                setShowRejectionModal(true);
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold"
                            >
                              <X className="h-3 w-3" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {/* Rejected PO Children (for Rejected sub-tab) */}
                    {vendorApprovalsSubTab === 'rejected' && filteredRejectedPOChildren.map((poChild, index) => (
                      <motion.div
                        key={`rejected-po-${poChild.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * index }}
                        className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-red-300"
                      >
                        {/* Header - Compact */}
                        <div className="p-2 bg-gradient-to-r from-red-50 to-red-100">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{poChild.project_name || poChild.item_name}</h3>
                            <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-800">
                              {poChild.formatted_id}
                            </Badge>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-gray-600">
                            <div className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{poChild.client}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-gray-400" />
                              <span className="truncate">{poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            {poChild.item_name && (
                              <div className="flex items-center gap-1">
                                <FileText className="h-2.5 w-2.5 text-gray-400" />
                                <span className="truncate">{poChild.item_name}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Rejection Reason */}
                        {poChild.rejection_reason && (
                          <div className="px-2 py-1.5 bg-red-50 border-y border-red-200">
                            <div className="text-[9px] text-red-600 font-semibold mb-0.5">Rejection Reason:</div>
                            <div className="text-[10px] text-red-800 line-clamp-2">{poChild.rejection_reason}</div>
                          </div>
                        )}

                        {/* Materials List */}
                        <div className="px-2 pb-2 pt-1">
                          <div className="text-[9px] text-gray-500 mb-1 font-semibold flex items-center gap-1">
                            <Package className="h-2.5 w-2.5" />
                            Materials ({poChild.materials_count || poChild.materials?.length || 0})
                          </div>
                          <div className="bg-gray-50 rounded border border-gray-200 max-h-20 overflow-y-auto">
                            {poChild.materials && poChild.materials.length > 0 ? (
                              <div className="divide-y divide-gray-100">
                                {poChild.materials.slice(0, 3).map((mat: any, idx: number) => (
                                  <div key={idx} className="px-1.5 py-1 flex items-center justify-between text-[9px]">
                                    <span className="truncate flex-1 text-gray-700">{mat.material_name}</span>
                                    <span className="text-gray-500 ml-1">{mat.quantity} {mat.unit}</span>
                                  </div>
                                ))}
                                {poChild.materials.length > 3 && (
                                  <div className="px-1.5 py-0.5 text-[8px] text-gray-400 text-center">
                                    +{poChild.materials.length - 3} more
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="px-1.5 py-1 text-[9px] text-gray-400">No materials</div>
                            )}
                          </div>
                        </div>

                        {/* Total Cost */}
                        <div className="px-2 pb-2">
                          <div className="flex items-center justify-between text-[10px] font-bold border-t border-gray-200 pt-1.5">
                            <span className="text-gray-600">Total Cost:</span>
                            {calculatePOChildTotal(poChild) > 0 ? (
                              <span className="text-red-700">AED {calculatePOChildTotal(poChild).toLocaleString()}</span>
                            ) : (
                              <span className="text-amber-600 italic text-[9px]">Prices not set</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="border-t border-gray-200 p-1.5">
                          <button
                            onClick={() => handleViewPOChildDetails(poChild)}
                            className="w-full text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3" />
                            <span>View Details</span>
                          </button>
                        </div>
                      </motion.div>
                    ))}

                    {/* Legacy Vendor Approvals */}
                    {filteredVendorApprovals.map((purchase, index) => (
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
                            <Badge className="text-[9px] px-1 py-0 bg-orange-100 text-orange-800">
                              {purchase.formatted_cr_id || `PO-${purchase.cr_id}`}
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

                        {/* Materials List with Prices */}
                        <div className="px-2 pb-2">
                          <div className="text-[9px] text-gray-500 mb-1 font-semibold flex items-center gap-1">
                            <Package className="h-2.5 w-2.5" />
                            Materials ({purchase.materials_count})
                          </div>
                          <div className="bg-gray-50 rounded border border-gray-200 max-h-28 overflow-y-auto">
                            {purchase.materials && purchase.materials.length > 0 ? (
                              <div className="divide-y divide-gray-100">
                                {purchase.materials.map((material: any, idx: number) => {
                                  const boqPrice = material.boq_unit_price || material.original_unit_price || 0;
                                  // Use negotiated price first, then unit_price, then BOQ price
                                  const vendorPrice = material.negotiated_price || material.unit_price || material.boq_unit_price || 0;
                                  const quantity = material.quantity || 0;
                                  const materialTotal = material.total_price || material.boq_total_price || (vendorPrice * quantity) || 0;
                                  const priceDiff = vendorPrice - boqPrice;
                                  const isOverBudget = priceDiff > 0;

                                  return (
                                    <div key={idx} className="px-1.5 py-1 text-[9px]">
                                      <div className="flex justify-between items-start gap-1">
                                        <span className="text-gray-800 font-medium flex-1 line-clamp-1">{material.material_name}</span>
                                        <div className="text-right whitespace-nowrap">
                                          {vendorPrice > 0 ? (
                                            <span className="text-blue-700 font-bold">
                                              AED {vendorPrice.toLocaleString()}
                                            </span>
                                          ) : (
                                            <span className="text-amber-600 italic text-[8px]">
                                              Price not set
                                            </span>
                                          )}
                                          {boqPrice > 0 && boqPrice !== vendorPrice && (
                                            <span className="text-gray-400 text-[8px] ml-0.5">
                                              (BOQ:{boqPrice})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex justify-between text-gray-500 mt-0.5">
                                        <span>{quantity} {material.unit}</span>
                                        {materialTotal > 0 ? (
                                          <span className="font-semibold text-gray-700">
                                            = AED {materialTotal.toLocaleString()}
                                          </span>
                                        ) : (
                                          <span className="text-amber-600 italic text-[8px]">-</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="px-2 py-2 text-[9px] text-gray-400 text-center">
                                No materials data
                              </div>
                            )}
                          </div>
                          {/* Total Cost with BOQ comparison */}
                          {(() => {
                            // Calculate vendor total from materials with negotiated prices
                            const calculatedTotal = purchase.materials?.reduce((sum: number, m: any) => {
                              const price = m.negotiated_price || m.unit_price || m.boq_unit_price || 0;
                              return sum + (price * (m.quantity || 0));
                            }, 0) || 0;
                            const vendorTotal = purchase.total_cost || calculatedTotal || 0;
                            const boqTotal = purchase.materials?.reduce((sum: number, m: any) => sum + ((m.boq_unit_price || m.original_unit_price || 0) * (m.quantity || 0)), 0) || 0;
                            return (
                              <div className="mt-1.5 pt-1 border-t border-gray-200 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">Vendor Total:</span>
                                  {vendorTotal > 0 ? (
                                    <span className="font-bold text-blue-700">AED {vendorTotal.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-amber-600 italic text-[9px]">Prices not set</span>
                                  )}
                                </div>
                                {boqTotal > 0 && (
                                  <div className="flex justify-between mt-0.5">
                                    <span className="text-gray-500">BOQ Total:</span>
                                    <span className="font-semibold text-gray-600">AED {boqTotal.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Actions - Compact */}
                        <div className="border-t border-gray-200 p-1.5 flex flex-col gap-1">
                          {/* Row 1: View Details */}
                          <button
                            onClick={() => handleReviewVendorApproval(purchase.cr_id)}
                            className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold w-full"
                            style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                          >
                            <Eye className="h-3 w-3" />
                            <span>Details</span>
                          </button>

                          {/* Row 2: Status badge for approved/rejected, or Approve/Reject buttons */}
                          {purchase.vendor_selection_status === 'approved' ? (
                            <div className="bg-green-50 border border-green-200 rounded px-2 py-1 text-[9px] text-green-700 font-semibold text-center">
                              <CheckCircle className="h-3 w-3 inline mr-1" />
                              Approved
                            </div>
                          ) : purchase.vendor_selection_status === 'rejected' ? (
                            <div className="bg-red-50 border border-red-200 rounded px-2 py-1 text-[9px] text-red-700 font-semibold text-center">
                              <XCircle className="h-3 w-3 inline mr-1" />
                              Rejected
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                onClick={() => handleApproveVendor(purchase.cr_id)}
                                disabled={approvingVendorId === purchase.cr_id}
                                className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {approvingVendorId === purchase.cr_id ? (
                                  <>
                                    <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[8px]">Approving...</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-3 w-3" />
                                    <span>Approve</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleRejectVendorSelection(purchase.cr_id)}
                                disabled={approvingVendorId === purchase.cr_id}
                                className="bg-red-600 hover:bg-red-700 text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <X className="h-3 w-3" />
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
                    {enrichedChangeRequests.map((request, index) => (
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
                            <span className="text-gray-500">Vendor Amount:</span>
                            <span className="font-bold text-blue-700">{formatCurrency(request.vendorTotalCost || request.materials_total_cost)}</span>
                          </div>
                          {request.materials_total_cost > 0 && request.vendorTotalCost > 0 && request.materials_total_cost !== request.vendorTotalCost && (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-400 text-[8px]">BOQ Amount:</span>
                                <span className="text-gray-400 text-[8px]">{formatCurrency(request.materials_total_cost)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400 text-[8px]">Difference:</span>
                                <span className={`text-[8px] font-bold ${request.vendorTotalCost > request.materials_total_cost ? 'text-red-600' : 'text-green-600'}`}>
                                  {request.vendorTotalCost > request.materials_total_cost ? '+' : ''}{formatCurrency(Math.abs(request.vendorTotalCost - request.materials_total_cost))}
                                </span>
                              </div>
                            </>
                          )}
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
        onEditLPO={() => {
          if (selectedChangeRequest) {
            // Convert back to POChild format if it has po_child_id
            const poChildId = (selectedChangeRequest as any).po_child_id;
            if (poChildId) {
              // Find the POChild from the pending list
              const poChild = pendingPOChildren.find(p => p.id === poChildId);
              if (poChild) {
                handleOpenLpoEditor(poChild, false);
              }
            }
          }
        }}
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
          crName={`PO-${approvingCrId}`}
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
                        <p className="text-sm text-gray-600 mt-0.5">{selectedVendorPurchase.formatted_cr_id || `PO-${selectedVendorPurchase.cr_id}`} - {selectedVendorPurchase.project_name}</p>
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

                    {/* Matching Vendor Products - Only showing products relevant to this purchase */}
                    {vendorProducts.length > 0 && (
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                          <Package className="w-5 h-5 text-green-600" />
                          Matching Vendor Products ({vendorProducts.length})
                        </h4>
                        <p className="text-xs text-gray-500 mb-2">Products from this vendor that match the requested materials</p>
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

      {/* Material Vendor Selection Modal - TD Mode for changing vendor */}
      {selectedVendorPurchase && (
        <MaterialVendorSelectionModal
          purchase={selectedVendorPurchase}
          isOpen={showVendorSelectionModal}
          onClose={() => setShowVendorSelectionModal(false)}
          onVendorSelected={() => {
            setShowVendorSelectionModal(false);
            loadVendorApprovals();
            loadChangeRequests();
            showSuccess('Vendor Changed Successfully!');
          }}
          viewMode="td"
        />
      )}

      {/* Rejection Reason Modal */}
      <RejectionReasonModal
        isOpen={showRejectionModal}
        onClose={() => {
          setShowRejectionModal(false);
          setRejectingCrId(null);
          setRejectingPOChildId(null);
          setSelectedChangeRequest(null);
        }}
        onSubmit={handleRejectionSubmit}
        title={rejectingPOChildId ? "Reject Vendor Selection" : rejectingCrId && vendorApprovals.some(p => p.cr_id === rejectingCrId) ? "Reject Vendor Selection" : "Reject PO"}
      />

      {/* TD LPO Editor Modal */}
      <TDLPOEditorModal
        poChild={selectedPOChildForLpo}
        crId={selectedCrIdForLpo || 0}
        isOpen={showLpoEditorModal}
        onClose={() => {
          setShowLpoEditorModal(false);
          setSelectedPOChildForLpo(null);
          setSelectedCrIdForLpo(null);
        }}
        isReadOnly={lpoEditorReadOnly}
      />

    </div>
  );
};

// ✅ PERFORMANCE FIX: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(ChangeRequestsPage);
