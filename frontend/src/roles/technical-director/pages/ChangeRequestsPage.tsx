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
import { formatCurrency } from '@/utils/formatters';
import { API_BASE_URL } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import ChangeRequestDetailsModal from '@/components/modals/ChangeRequestDetailsModal';
import EditChangeRequestModal from '@/components/modals/EditChangeRequestModal';
import ApprovalWithBuyerModal from '@/components/modals/ApprovalWithBuyerModal';
import RejectionReasonModal from '@/components/modals/RejectionReasonModal';
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

  // ✅ PERFORMANCE: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<{
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  } | null>(null);
  const perPage = 20;
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvingCrId, setApprovingCrId] = useState<number | null>(null);
  const [approvingVendorId, setApprovingVendorId] = useState<number | null>(null);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectingCrId, setRejectingCrId] = useState<number | null>(null);
  const [rejectingPOChildId, setRejectingPOChildId] = useState<number | null>(null);
  const [isVendorRejectionFromModal, setIsVendorRejectionFromModal] = useState(false);

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

  // ✅ PERFORMANCE: Reload when page changes
  useEffect(() => {
    loadChangeRequests(false);
  }, [currentPage]);

  const loadChangeRequests = async (showLoadingSpinner = false) => {
    // Only show loading spinner on initial load, not on auto-refresh
    if (showLoadingSpinner) {
      setLoading(true);
    }
    try {
      // ✅ PERFORMANCE: Use pagination to reduce data load
      const response = await changeRequestService.getChangeRequests(currentPage, perPage);
      if (response.success) {
        setChangeRequests(response.data);
        if (response.pagination) {
          setPagination(response.pagination);
        }
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

        // Sort by updated_at (latest first), fallback to created_at
        const sorted = mappedApprovals.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at).getTime();
          const dateB = new Date(b.updated_at || b.created_at).getTime();
          return dateB - dateA; // Descending (newest first)
        });

        setVendorApprovals(sorted);
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
        const children = response.po_children || [];
        // Sort by updated_at (latest first), fallback to created_at
        const sorted = children.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at).getTime();
          const dateB = new Date(b.updated_at || b.created_at).getTime();
          return dateB - dateA; // Descending (newest first)
        });
        setPendingPOChildren(sorted);
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
        const children = response.po_children || [];
        // Sort by updated_at (latest first), fallback to created_at
        const sorted = children.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at).getTime();
          const dateB = new Date(b.updated_at || b.created_at).getTime();
          return dateB - dateA; // Descending (newest first)
        });
        setApprovedPOChildren(sorted);
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
        const children = response.po_children || [];
        // Sort by updated_at (latest first), fallback to created_at
        const sorted = children.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at).getTime();
          const dateB = new Date(b.updated_at || b.created_at).getTime();
          return dateB - dateA; // Descending (newest first)
        });
        setRejectedPOChildren(sorted);
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

  // Handle opening LPO editor for a PO child
  const handleOpenLpoEditor = (poChild: POChild, readOnly: boolean = false) => {
    setSelectedPOChildForLpo(poChild);
    setSelectedCrIdForLpo(poChild.parent_cr_id);
    setLpoEditorReadOnly(readOnly);
    setShowLpoEditorModal(true);
  };

  // Handle viewing PO child details (shows only PO child's materials, not parent CR)
  const handleViewPOChildDetails = async (poChild: POChild) => {
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
    // The backend enriches materials with vendor prices in unit_price field
    const mappedMaterials = (poChild.materials || []).map(m => {
      // unit_price from backend should already be vendor negotiated price
      const unitPrice = m.unit_price || m.boq_unit_price || 0;
      const quantity = m.quantity || 0;
      const totalPrice = m.total_price || m.boq_total_price || (unitPrice * quantity) || 0;

      return {
        material_name: m.material_name,
        quantity: quantity,
        unit: m.unit,
        unit_price: unitPrice,
        total_price: totalPrice,
        // Include negotiated_price so modal knows this is the vendor price
        negotiated_price: m.negotiated_price || unitPrice,
        boq_unit_price: m.boq_unit_price,
        boq_total_price: m.boq_total_price,
        // Preserve original BOQ price for reference
        original_unit_price: m.boq_unit_price || m.original_unit_price,
        original_total_price: m.boq_total_price || m.original_total_price,
        master_material_id: m.master_material_id || undefined,
        justification: m.justification || m.reason || '',
        brand: m.brand,
        size: m.size,
        specification: m.specification,
        sub_item_name: m.sub_item_name,
      };
    });

    // Calculate total from mapped materials (in case backend total is 0)
    const calculatedTotal = mappedMaterials.reduce((sum, m) => sum + (m.total_price || 0), 0);

    // Use vendor_details from POChild API response (now included via backend fix)
    // POChild.to_dict() now includes full vendor details when vendor relationship is loaded
    const vendorDetailsData = (poChild as any).vendor_details || null;

    const poChildAsChangeRequest: ChangeRequestItem & { po_child_id?: number; vendor_details?: any } = {
      cr_id: poChild.parent_cr_id,
      formatted_cr_id: poChild.formatted_id,
      project_id: poChild.project_id || 0,
      project_name: poChild.project_name || 'Unknown Project',
      project_code: poChild.project_code || '',
      project_client: poChild.client || '',
      project_location: poChild.location || '',
      boq_id: poChild.boq_id || 0,
      boq_name: poChild.boq_name || '',
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
      // Full vendor details for display in modal (from POChild API response)
      vendor_details: vendorDetailsData,
      // Vendor fields directly from POChild API response (from to_dict() method)
      // Now properly typed in POChild interface - no need for 'as any' casts
      vendor_email: poChild.vendor_email,
      vendor_phone: poChild.vendor_phone,
      vendor_phone_code: poChild.vendor_phone_code,
      vendor_contact_person: poChild.vendor_contact_person,
      vendor_category: poChild.vendor_category,
      vendor_street_address: poChild.vendor_street_address,
      vendor_city: poChild.vendor_city,
      vendor_state: poChild.vendor_state,
      vendor_country: poChild.vendor_country,
      vendor_pin_code: poChild.vendor_pin_code,
      vendor_gst_number: poChild.vendor_gst_number,
      // Material vendor selections from parent CR for vendor comparison display
      material_vendor_selections: poChild.material_vendor_selections || {},
    };

    // Debug: Log the data being set to verify vendor fields are present
    console.log('Setting POChild as ChangeRequest:', {
      vendor_email: poChildAsChangeRequest.vendor_email,
      vendor_phone: poChildAsChangeRequest.vendor_phone,
      vendor_contact_person: poChildAsChangeRequest.vendor_contact_person,
      vendor_category: poChildAsChangeRequest.vendor_category,
      vendor_gst_number: poChildAsChangeRequest.vendor_gst_number,
      vendor_street_address: poChildAsChangeRequest.vendor_street_address,
      full_object: poChildAsChangeRequest
    });

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
        setIsVendorRejectionFromModal(false);
        return;
      }

      if (!rejectingCrId) return;

      // Check if this is a vendor selection rejection (from vendor approvals tab OR from modal)
      const isVendorRejection = isVendorRejectionFromModal || vendorApprovals.some(p => p.cr_id === rejectingCrId);

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
      setIsVendorRejectionFromModal(false);
    } catch (error: any) {
      showError(error.message || 'Failed to reject');
      // Clean up state on error to prevent stale flags
      setShowRejectionModal(false);
      setRejectingCrId(null);
      setRejectingPOChildId(null);
      setIsVendorRejectionFromModal(false);
    }
  };

  const handleReview = async (crId: number) => {
    try {
      const response = await changeRequestService.getChangeRequestDetail(crId);
      if (response.success && response.data) {
        const changeRequestData = response.data;

        // Fetch vendor details if vendor is selected
        if (changeRequestData.selected_vendor_id) {
          try {
            const vendorDetails = await buyerVendorService.getVendorById(changeRequestData.selected_vendor_id);
            // Add vendor details to the change request object
            (changeRequestData as any).vendor_details = vendorDetails;
          } catch (error) {
            console.error('Error loading vendor details:', error);
            // Continue without vendor details - basic info will still show
          }
        }

        setSelectedChangeRequest(changeRequestData);
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

  // Handle vendor approval from modal (for PO children or legacy CRs with pending_td_approval)
  const handleApproveVendorFromModal = async () => {
    if (!selectedChangeRequest) return;
    const poChildId = (selectedChangeRequest as any).po_child_id;
    setShowDetailsModal(false);

    if (poChildId) {
      // POChild-based vendor approval
      await handleApprovePOChild(poChildId);
    } else {
      // Legacy CR-based vendor approval
      await handleApproveVendor(selectedChangeRequest.cr_id);
    }
  };

  // Handle vendor rejection from modal (for PO children or legacy CRs with pending_td_approval)
  const handleRejectVendorFromModal = () => {
    if (!selectedChangeRequest) return;
    const poChildId = (selectedChangeRequest as any).po_child_id;
    setShowDetailsModal(false);

    if (poChildId) {
      // POChild-based vendor rejection
      setRejectingPOChildId(poChildId);
    } else {
      // Legacy CR-based vendor rejection
      setRejectingCrId(selectedChangeRequest.cr_id);
    }
    // Set flag so handleRejectionSubmit knows this is a vendor rejection
    setIsVendorRejectionFromModal(true);
    setShowRejectionModal(true);
  };

  // formatCurrency imported from @/utils/formatters

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
    const searchLower = searchTerm.toLowerCase().trim();
    // ✅ Search by ID (CR-123, PO-123, 123), project code (MSQ26), project name
    const crIdString = `cr-${purchase.cr_id}`;
    const poIdString = `po-${purchase.cr_id}`;
    const matchesSearch = !searchTerm ||
      purchase.project_name.toLowerCase().includes(searchLower) ||
      purchase.project_code?.toLowerCase().includes(searchLower) ||
      crIdString.includes(searchLower) ||
      poIdString.includes(searchLower) ||
      purchase.cr_id?.toString().includes(searchTerm.trim());

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
    const searchLower = searchTerm.toLowerCase().trim();
    const poIdString = `po-${poChild.id}`;
    const formattedId = (poChild.formatted_id || '').toLowerCase();
    const matchesSearch = !searchTerm ||
      (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
      poChild.project_code?.toLowerCase().includes(searchLower) ||
      poIdString.includes(searchLower) ||
      formattedId.includes(searchLower) ||
      poChild.id?.toString().includes(searchTerm.trim());

    if (vendorApprovalsSubTab === 'pending') {
      return matchesSearch && poChild.vendor_selection_status === 'pending_td_approval';
    }
    // For approved/rejected, PO children are not in this list anymore (they've been processed)
    return false;
  });

  // Filter approved PO children for approved sub-tab
  const filteredApprovedPOChildren = approvedPOChildren.filter(poChild => {
    const searchLower = searchTerm.toLowerCase().trim();
    const poIdString = `po-${poChild.id}`;
    const formattedId = (poChild.formatted_id || '').toLowerCase();
    const matchesSearch = !searchTerm ||
      (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
      poChild.project_code?.toLowerCase().includes(searchLower) ||
      poIdString.includes(searchLower) ||
      formattedId.includes(searchLower) ||
      poChild.id?.toString().includes(searchTerm.trim());
    return matchesSearch;
  });

  // 🔥 MIXED ORDERING: Merge approved vendor approvals and approved PO children, sorted by date
  const mergedApprovedItems = React.useMemo(() => {
    if (vendorApprovalsSubTab !== 'approved') {
      return [];
    }

    // Get approved parent purchases
    const approvedParents = filteredVendorApprovals.filter(p => p.vendor_selection_status === 'approved');

    // Combine both arrays
    const combined: Array<Purchase | POChild> = [
      ...approvedParents,
      ...filteredApprovedPOChildren
    ];

    // Sort by created_at in descending order (newest first)
    return combined.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA; // Descending (newest first)
    });
  }, [vendorApprovalsSubTab, filteredVendorApprovals, filteredApprovedPOChildren]);

  // Helper to check if item is POChild
  const isPOChild = (item: Purchase | POChild): item is POChild => {
    return 'parent_cr_id' in item;
  };

  // Filter rejected PO children for rejected sub-tab
  const filteredRejectedPOChildren = rejectedPOChildren.filter(poChild => {
    const searchLower = searchTerm.toLowerCase().trim();
    const poIdString = `po-${poChild.id}`;
    const formattedId = (poChild.formatted_id || '').toLowerCase();
    const matchesSearch = !searchTerm ||
      (poChild.project_name || poChild.item_name || '').toLowerCase().includes(searchLower) ||
      poChild.project_code?.toLowerCase().includes(searchLower) ||
      poIdString.includes(searchLower) ||
      formattedId.includes(searchLower) ||
      poChild.id?.toString().includes(searchTerm.trim());
    return matchesSearch;
  });

  // 🔥 MIXED ORDERING: Merge pending vendor approvals and pending PO children, sorted by date
  const mergedPendingItems = React.useMemo(() => {
    if (vendorApprovalsSubTab !== 'pending') {
      return [];
    }

    // Get pending parent purchases
    const pendingParents = filteredVendorApprovals.filter(p => p.vendor_selection_status === 'pending_td_approval');

    // Combine both arrays
    const combined: Array<Purchase | POChild> = [
      ...pendingParents,
      ...filteredPOChildren
    ];

    // Sort by updated_at (latest first), fallback to created_at
    return combined.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA; // Descending (newest first)
    });
  }, [vendorApprovalsSubTab, filteredVendorApprovals, filteredPOChildren]);

  // 🔥 MIXED ORDERING: Merge rejected vendor approvals and rejected PO children, sorted by date
  const mergedRejectedItems = React.useMemo(() => {
    if (vendorApprovalsSubTab !== 'rejected') {
      return [];
    }

    // Get rejected parent purchases
    const rejectedParents = filteredVendorApprovals.filter(p =>
      p.vendor_selection_status === 'rejected' || p.vendor_selection_status === 'td_rejected'
    );

    // Combine both arrays
    const combined: Array<Purchase | POChild> = [
      ...rejectedParents,
      ...filteredRejectedPOChildren
    ];

    // Sort by updated_at (latest first), fallback to created_at
    return combined.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA; // Descending (newest first)
    });
  }, [vendorApprovalsSubTab, filteredVendorApprovals, filteredRejectedPOChildren]);

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
        const changeRequestData = response.data;

        // Fetch vendor details if vendor is selected
        if (changeRequestData.selected_vendor_id) {
          try {
            const vendorDetails = await buyerVendorService.getVendorById(changeRequestData.selected_vendor_id);
            // Add vendor details to the change request object
            (changeRequestData as any).vendor_details = vendorDetails;
          } catch (error) {
            console.error('Error loading vendor details:', error);
            // Continue without vendor details - basic info will still show
          }
        }

        setSelectedChangeRequest(changeRequestData);
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

  // Vendor Approvals Table View Component
  const VendorApprovalsTable = ({ poChildren }: { poChildren: POChild[] }) => {
    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO ID</TableHead>
              <TableHead>Project/Item</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Materials</TableHead>
              <TableHead>Total Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {poChildren.map((poChild) => {
              const totalCost = calculatePOChildTotal(poChild);
              const isPending = poChild.vendor_selection_status === 'pending_td_approval';
              const isApproved = poChild.vendor_selection_status === 'approved';
              const isRejected = poChild.vendor_selection_status === 'rejected';

              return (
                <TableRow key={poChild.id}>
                  <TableCell className="font-semibold text-blue-600">{poChild.formatted_id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{poChild.project_name || poChild.item_name || 'N/A'}</div>
                    {poChild.item_name && poChild.project_name && (
                      <div className="text-xs text-gray-500">{poChild.item_name}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900">{poChild.vendor_name || 'N/A'}</TableCell>
                  <TableCell>{poChild.created_at ? new Date(poChild.created_at).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell>{poChild.materials?.length || 0}</TableCell>
                  <TableCell className="font-semibold text-blue-700">AED {totalCost.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={
                      isPending ? 'bg-yellow-100 text-yellow-800' :
                      isApproved ? 'bg-green-100 text-green-800' :
                      isRejected ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                    }>
                      {isPending ? 'PENDING' : isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'UNKNOWN'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleOpenLpoEditor(poChild, true)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Details
                      </Button>
                      {isPending && (
                        <>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApprovePOChild(poChild.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => {
                            setRejectingPOChildId(poChild.id);
                            setShowRejectionModal(true);
                          }}>
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
                ) : viewMode === 'table' ? (
                  <VendorApprovalsTable poChildren={
                    vendorApprovalsSubTab === 'pending' ? filteredPOChildren :
                    vendorApprovalsSubTab === 'approved' ? filteredApprovedPOChildren :
                    filteredRejectedPOChildren
                  } />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {/* 🔥 MIXED ORDERING: Render merged array for approved tab */}
                    {vendorApprovalsSubTab === 'approved' && mergedApprovedItems.map((item, index) => {
                      if (isPOChild(item)) {
                        // Render PO Child card
                        const poChild = item;
                        return (
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
                                      {material.supplier_notes && material.supplier_notes.trim().length > 0 && (
                                        <div className="mt-1 text-[8px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                          <span className="font-semibold">📝 Note:</span> {material.supplier_notes}
                                        </div>
                                      )}
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
                          <div className="mt-1.5 pt-1 border-t border-gray-200 text-[10px]">
                            <div className="flex justify-between">
                              <span className="text-gray-600 font-semibold">Total Cost:</span>
                              {calculatePOChildTotal(poChild) > 0 ? (
                                <span className="font-bold text-blue-700">AED {calculatePOChildTotal(poChild).toLocaleString()}</span>
                              ) : (
                                <span className="text-amber-600 italic text-[9px]">Prices not set</span>
                              )}
                            </div>
                            {/* BOQ Total as secondary - always show */}
                            {(() => {
                              const boqTotal = (poChild.materials || []).reduce((sum: number, m: any) => {
                                const boqPrice = m.boq_unit_price || 0;
                                return sum + (boqPrice * (m.quantity || 0));
                              }, 0);
                              if (boqTotal > 0) {
                                return (
                                  <div className="flex justify-between text-[8px] text-gray-400 mt-0.5">
                                    <span>BOQ:</span>
                                    <span>AED {boqTotal.toLocaleString()}</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
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
                        );
                      } else {
                        // Render Purchase (parent) card
                        const purchase = item as Purchase;
                        return (
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
                                      {material.supplier_notes && material.supplier_notes.trim().length > 0 && (
                                        <div className="mt-1 text-[8px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                          <span className="font-semibold">📝 Note:</span> {material.supplier_notes}
                                        </div>
                                      )}
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
                                  <div className="flex justify-between mt-0.5 text-[8px] text-gray-400">
                                    <span>BOQ:</span>
                                    <span>AED {boqTotal.toLocaleString()}</span>
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
                        );
                      }
                    })}

                    {/* 🔥 MIXED ORDERING: Render merged pending items (purchases + POChildren mixed by date) */}
                    {vendorApprovalsSubTab === 'pending' && mergedPendingItems.map((item, index) => {
                      // Check if this item is a POChild or regular purchase
                      if (isPOChild(item)) {
                        // Render POChild card
                        const poChild = item;
                        const totalCost = calculatePOChildTotal(poChild);
                        return (
                        <motion.div
                          key={`pending-po-${poChild.id}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.02 * index }}
                          className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-orange-200"
                        >
                          <div className="p-2 bg-orange-50/30">
                            <div className="flex items-start justify-between mb-1">
                              <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{poChild.project_name || poChild.item_name}</h3>
                              <Badge className="text-[9px] px-1.5 py-0.5 bg-orange-600 text-white font-bold">
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
                                <Store className="h-2.5 w-2.5 text-orange-500" />
                                <span className="truncate font-semibold text-orange-900">{poChild.vendor_name || 'N/A'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="px-2 pb-2">
                            <div className="text-[9px] text-gray-500 mb-1 font-semibold flex items-center gap-1">
                              <Package className="h-2.5 w-2.5" />
                              Materials ({poChild.materials?.length || 0})
                            </div>
                            <div className="mt-1.5 pt-1 border-t border-orange-200 text-[10px]">
                              <div className="flex justify-between">
                                <span className="text-gray-600 font-semibold">Total Cost:</span>
                                <span className="font-bold text-orange-700">AED {(totalCost || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-orange-200 p-1.5 flex flex-col gap-1">
                            <button
                              onClick={() => {
                                const mappedPOChild: ChangeRequestItem = {
                                  cr_id: poChild.parent_cr_id || 0,
                                  po_child_id: poChild.id,
                                  project_name: poChild.project_name || poChild.item_name || '',
                                  project_code: poChild.project_code || '',
                                  created_at: poChild.created_at,
                                  status: poChild.status,
                                  item_name: poChild.item_name || '',
                                  materials_data: poChild.materials || [],
                                  materials_count: poChild.materials?.length || 0,
                                  materials_total_cost: poChild.materials_total_cost || 0,
                                  vendor_selection_status: poChild.vendor_selection_status,
                                  selected_vendor_name: poChild.vendor_name,
                                  selected_vendor_id: poChild.vendor_id,
                                  formatted_cr_id: poChild.formatted_id || `PO-${poChild.parent_cr_id}.${poChild.id}`,
                                  client: poChild.client || '',
                                  location: poChild.location || '',
                                  boq_id: poChild.boq_id,
                                  boq_name: poChild.boq_name || '',

                                  // Vendor details object (from backend po_child.to_dict())
                                  vendor_details: (poChild as any).vendor_details,

                                  // Vendor detail fields (from backend po_child.to_dict())
                                  vendor_contact_person: (poChild as any).vendor_contact_person,
                                  vendor_email: (poChild as any).vendor_email,
                                  vendor_phone: (poChild as any).vendor_phone,
                                  vendor_phone_code: (poChild as any).vendor_phone_code,
                                  vendor_category: (poChild as any).vendor_category,
                                  vendor_street_address: (poChild as any).vendor_street_address,
                                  vendor_city: (poChild as any).vendor_city,
                                  vendor_state: (poChild as any).vendor_state,
                                  vendor_country: (poChild as any).vendor_country,
                                  vendor_pin_code: (poChild as any).vendor_pin_code,
                                  vendor_gst_number: (poChild as any).vendor_gst_number,

                                  // Vendor selection tracking
                                  vendor_selected_by_buyer_name: (poChild as any).vendor_selected_by_buyer_name,
                                  vendor_selection_date: (poChild as any).vendor_selection_date,

                                  // Parent CR fields
                                  requested_by_name: (poChild as any).requested_by_name,
                                  requested_by_role: (poChild as any).requested_by_role,
                                  justification: (poChild as any).justification,

                                  // Material vendor selections for competitor comparison
                                  material_vendor_selections: (poChild as any).material_vendor_selections || {}
                                };
                                setSelectedChangeRequest(mappedPOChild);
                                setShowDetailsModal(true);
                              }}
                              className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold w-full"
                              style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                            >
                              <Eye className="h-3 w-3" />
                              <span>Details</span>
                            </button>

                            <div className="grid grid-cols-2 gap-1">
                              <button
                                onClick={() => handleApprovePOChild(poChild.id)}
                                disabled={approvingVendorId === poChild.vendor_id}
                                className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {approvingVendorId === poChild.vendor_id ? (
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
                                onClick={() => {
                                  setRejectingPOChildId(poChild.id);
                                  setShowRejectionModal(true);
                                }}
                                disabled={approvingVendorId === poChild.vendor_id}
                                className="bg-red-600 hover:bg-red-700 text-white text-[9px] h-6 rounded transition-all flex items-center justify-center gap-0.5 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <X className="h-3 w-3" />
                                <span>Reject</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                        );
                      } else {
                        // Render Purchase (parent) card
                        const purchase = item as Purchase;
                        return (
                          <motion.div
                            key={`pending-legacy-${purchase.cr_id}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.02 * index }}
                            className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200"
                          >
                            {/* Header */}
                            <div className="p-2">
                              <div className="flex items-start justify-between mb-1">
                                <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{purchase.project_name}</h3>
                                <Badge className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-800">
                                  {purchase.formatted_cr_id || `PO-${purchase.cr_id}`}
                                </Badge>
                              </div>

                              <div className="space-y-0.5 text-[10px] text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Package className="h-2.5 w-2.5 text-gray-400" />
                                  <span className="truncate">{purchase.item_name || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-2.5 w-2.5 text-gray-400" />
                                  <span className="truncate">{purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Store className="h-2.5 w-2.5 text-gray-500" />
                                  <span className="truncate font-semibold text-gray-900">{purchase.vendor_name || 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Materials count and cost */}
                            <div className="px-2 pb-2">
                              <div className="text-[9px] text-gray-500 mb-1 font-semibold flex items-center gap-1">
                                <Package className="h-2.5 w-2.5" />
                                Materials ({purchase.materials_count || 0})
                              </div>
                              <div className="mt-1.5 pt-1 border-t border-gray-200 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">Total Cost:</span>
                                  <span className="font-bold text-blue-700">AED {(purchase.total_cost || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="border-t border-gray-200 p-1.5 flex flex-col gap-1">
                              <button
                                onClick={() => handleReviewVendorApproval(purchase.cr_id)}
                                className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold w-full"
                                style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                              >
                                <Eye className="h-3 w-3" />
                                <span>Details</span>
                              </button>

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
                            </div>
                          </motion.div>
                        );
                      }
                    })}

                    {/* 🔥 MIXED ORDERING: Render merged rejected items (parents + PO children sorted by date) */}
                    {vendorApprovalsSubTab === 'rejected' && mergedRejectedItems.map((item, index) => {
                      if (isPOChild(item)) {
                        // Render PO Child card
                        const poChild = item;
                        const totalCost = calculatePOChildTotal(poChild);
                        return (
                          <motion.div
                            key={`rejected-po-${poChild.id}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.02 * index }}
                            className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-red-200"
                          >
                            <div className="p-2 bg-red-50/30">
                              <div className="flex items-start justify-between mb-1">
                                <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{poChild.project_name || poChild.item_name}</h3>
                                <Badge className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-800">
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
                                  <Store className="h-2.5 w-2.5 text-red-400" />
                                  <span className="truncate font-semibold text-gray-900">{poChild.vendor_name || 'N/A'}</span>
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
                                      const vendorPrice = material.unit_price || material.boq_unit_price || 0;
                                      const quantity = material.quantity || 0;
                                      const materialTotal = material.total_price || material.boq_total_price || (vendorPrice * quantity) || 0;

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
                                            </div>
                                          </div>
                                          {material.supplier_notes && material.supplier_notes.trim().length > 0 && (
                                            <div className="mt-1 text-[8px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                              <span className="font-semibold">📝 Note:</span> {material.supplier_notes}
                                            </div>
                                          )}
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
                              <div className="mt-1.5 pt-1 border-t border-gray-200 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">Total Cost:</span>
                                  {totalCost > 0 ? (
                                    <span className="font-bold text-blue-700">AED {totalCost.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-amber-600 italic text-[9px]">Prices not set</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status */}
                            <div className="border-t border-red-100 p-1.5 flex flex-col gap-1 bg-red-50/20">
                              <button
                                onClick={() => handleViewPOChildDetails(poChild)}
                                className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold"
                                style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                              >
                                <Eye className="h-3 w-3" />
                                <span>View Details</span>
                              </button>
                              <div className="bg-red-100 border border-red-300 rounded px-2 py-1 text-[9px] text-red-800 font-bold text-center">
                                <XCircle className="h-3 w-3 inline mr-1" />
                                Rejected by TD
                              </div>
                            </div>
                          </motion.div>
                        );
                      } else {
                        // Render Purchase (parent) card
                        const purchase = item as Purchase;
                        return (
                          <motion.div
                            key={`rejected-legacy-${purchase.cr_id}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.02 * index }}
                            className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200"
                          >
                            {/* Header */}
                            <div className="p-2">
                              <div className="flex items-start justify-between mb-1">
                                <h3 className="font-semibold text-gray-900 text-xs flex-1 line-clamp-1">{purchase.project_name}</h3>
                                <Badge className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-800">
                                  {purchase.formatted_cr_id || `PO-${purchase.cr_id}`}
                                </Badge>
                              </div>

                              <div className="space-y-0.5 text-[10px] text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Package className="h-2.5 w-2.5 text-gray-400" />
                                  <span className="truncate">{purchase.item_name || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-2.5 w-2.5 text-gray-400" />
                                  <span className="truncate">{purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Store className="h-2.5 w-2.5 text-gray-500" />
                                  <span className="truncate font-semibold text-gray-900">{purchase.vendor_name || 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Materials count and cost */}
                            <div className="px-2 pb-2">
                              <div className="text-[9px] text-gray-500 mb-1 font-semibold flex items-center gap-1">
                                <Package className="h-2.5 w-2.5" />
                                Materials ({purchase.materials_count || 0})
                              </div>
                              <div className="mt-1.5 pt-1 border-t border-gray-200 text-[10px]">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 font-semibold">Total Cost:</span>
                                  <span className="font-bold text-blue-700">AED {(purchase.total_cost || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="border-t border-gray-200 p-1.5 flex flex-col gap-1">
                              <button
                                onClick={() => handleReviewVendorApproval(purchase.cr_id)}
                                className="text-white text-[9px] h-6 rounded hover:opacity-90 transition-all flex items-center justify-center gap-0.5 font-semibold w-full"
                                style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                              >
                                <Eye className="h-3 w-3" />
                                <span>View Details</span>
                              </button>
                              <div className="bg-red-100 border border-red-300 rounded px-2 py-1 text-[9px] text-red-800 font-bold text-center">
                                <XCircle className="h-3 w-3 inline mr-1" />
                                Rejected by TD
                              </div>
                            </div>
                          </motion.div>
                        );
                      }
                    })}
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

          {/* ✅ PERFORMANCE: Pagination Controls */}
          {pagination && (
            <div className="flex items-center justify-between bg-white border-t border-gray-200 rounded-b-lg p-4 mt-6">
              <div className="text-sm text-gray-600 font-medium">
                Showing {pagination.total_count > 0 ? Math.min((currentPage - 1) * perPage + 1, pagination.total_count) : 0} to {Math.min(currentPage * perPage, pagination.total_count)} of {pagination.total_count} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={!pagination.has_prev}
                  className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  style={{ color: 'rgb(36, 61, 138)' }}
                >
                  Previous
                </button>
                {Array.from({ length: pagination.total_pages || 1 }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`h-9 w-9 text-sm font-semibold rounded-lg border transition-colors ${
                      currentPage === page
                        ? 'border-[rgb(36,61,138)] bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                    style={{ color: currentPage === page ? 'rgb(36, 61, 138)' : '#6b7280' }}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(pagination.total_pages, prev + 1))}
                  disabled={!pagination.has_next}
                  className="h-9 px-4 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  style={{ color: 'rgb(36, 61, 138)' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
        onApprove={
          // If this is a vendor approval (pending TD approval), use vendor approval handler
          // Works for both POChild-based and legacy CR-based vendor approvals
          selectedChangeRequest?.vendor_selection_status === 'pending_td_approval'
            ? handleApproveVendorFromModal
            : handleApproveFromModal
        }
        onReject={
          // If this is a vendor approval (pending TD approval), use vendor rejection handler
          // Works for both POChild-based and legacy CR-based vendor approvals
          selectedChangeRequest?.vendor_selection_status === 'pending_td_approval'
            ? handleRejectVendorFromModal
            : handleRejectFromModal
        }
        canApprove={
          // Allow approval for regular pending CRs OR for PO children pending TD vendor approval
          (permissions.canApproveChangeRequest(user) && selectedChangeRequest?.status === 'pending') ||
          (permissions.canApproveChangeRequest(user) && selectedChangeRequest?.vendor_selection_status === 'pending_td_approval')
        }
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

      {/* Rejection Reason Modal */}
      <RejectionReasonModal
        isOpen={showRejectionModal}
        onClose={() => {
          setShowRejectionModal(false);
          setRejectingCrId(null);
          setRejectingPOChildId(null);
          setSelectedChangeRequest(null);
          setIsVendorRejectionFromModal(false);
        }}
        onSubmit={handleRejectionSubmit}
        title={rejectingPOChildId || isVendorRejectionFromModal ? "Reject Vendor Selection" : rejectingCrId && vendorApprovals.some(p => p.cr_id === rejectingCrId) ? "Reject Vendor Selection" : "Reject PO"}
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
