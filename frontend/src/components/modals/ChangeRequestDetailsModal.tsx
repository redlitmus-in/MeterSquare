import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, AlertCircle, CheckCircle, Clock, XCircle, Send, FileText, Download, ChevronDown, Edit, ExternalLink, GitCompare } from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { ChangeRequestItem } from '@/services/changeRequestService';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/utils/formatters';
import { isEstimator, isTechnicalDirector, isSiteEngineer, isProjectManager } from '@/utils/roleHelpers';
import EditChangeRequestModal from './EditChangeRequestModal';
import { buyerService } from '@/roles/buyer/services/buyerService';
import { buyerVendorService, Vendor } from '@/roles/buyer/services/buyerVendorService';
import BOQSubItemDetailModal from './BOQSubItemDetailModal';
import { showError, showWarning } from '@/utils/toastHelper';

interface ChangeRequestDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeRequest: ChangeRequestItem | null;
  onApprove?: () => void;
  onReject?: () => void;
  canApprove?: boolean;
  onEditLPO?: () => void;
}

const ChangeRequestDetailsModal: React.FC<ChangeRequestDetailsModalProps> = ({
  isOpen,
  onClose,
  changeRequest,
  onApprove,
  onReject,
  canApprove: canApproveFromParent,
  onEditLPO
}) => {
  const { user } = useAuthStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [expandedSpecs, setExpandedSpecs] = useState<Set<number>>(new Set());
  const [lpoData, setLpoData] = useState<any>(null);
  const [loadingLPO, setLoadingLPO] = useState(false);
  const [downloadingLPO, setDownloadingLPO] = useState(false);
  const [isLPOExpanded, setIsLPOExpanded] = useState(false);

  // BOQ Details Modal state - for viewing sub-item in approved BOQ
  const [showBOQModal, setShowBOQModal] = useState(false);
  const [selectedSubItemForBOQ, setSelectedSubItemForBOQ] = useState<string | null>(null);
  const [selectedMaterialForBOQ, setSelectedMaterialForBOQ] = useState<string | null>(null);

  // State to track edited materials with updated prices
  const [editedMaterials, setEditedMaterials] = useState<any[]>([]);

  // Vendor comparison modal state
  const [showVendorComparisonModal, setShowVendorComparisonModal] = useState(false);
  const [competitorVendors, setCompetitorVendors] = useState<Vendor[]>([]);
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);

  // Toggle specification expansion
  const toggleSpec = (idx: number) => {
    setExpandedSpecs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  // Handle clicking on sub-item to view in BOQ
  const handleViewSubItemInBOQ = (subItemName: string, materialName?: string) => {
    if (!changeRequest?.boq_id || changeRequest.boq_id <= 0) {
      return; // BOQ ID not available - silently ignore click
    }
    if (!subItemName || subItemName.trim() === '') {
      return; // No sub-item name - silently ignore
    }
    setSelectedSubItemForBOQ(subItemName);
    setSelectedMaterialForBOQ(materialName || null);
    setShowBOQModal(true);
  };

  // State to hold the latest change request data (refreshable)
  const [latestChangeRequest, setLatestChangeRequest] = React.useState<ChangeRequestItem | null>(null);

  // Fetch fresh change request data from API when modal opens
  React.useEffect(() => {
    const fetchFreshData = async () => {
      if (isOpen && changeRequest?.cr_id) {
        // Check if this is a POChild - POChildren already have materials with supplier_notes from backend
        const isPOChild = !!(changeRequest as any).po_child_id;

        if (isPOChild) {
          // This is a POChild - materials already enriched by backend, use prop data directly
          setLatestChangeRequest(changeRequest);
          return;
        }

        // PERFORMANCE FIX: Only fetch buyer data for roles that need it
        // Site Engineers and Project Managers don't need vendor selection data
        const userRole = (user?.role || user?.role_name || '').toLowerCase().replace(/[_\s]/g, '');
        const needsVendorData = userRole.includes('buyer') ||
                                userRole.includes('estimator') ||
                                userRole.includes('technical') ||
                                userRole.includes('admin');

        if (!needsVendorData) {
          // User doesn't need vendor selection data - use prop data directly
          // Prevents unnecessary 403 errors for Site Engineers/PMs
          setLatestChangeRequest(changeRequest);
          return;
        }

        try {
          // This is a parent CR - fetch latest material_vendor_selections with supplier_notes
          // Only called for Buyer, Estimator, TD, and Admin roles
          const response = await buyerService.getPurchaseById(changeRequest.cr_id);
          // Merge the fresh data with the prop data
          setLatestChangeRequest({
            ...changeRequest,
            material_vendor_selections: response.material_vendor_selections || {}
          } as ChangeRequestItem);
        } catch (error) {
          console.error('Error fetching fresh CR data:', error);
          // Fall back to prop data if fetch fails
          setLatestChangeRequest(changeRequest);
        }
      }
    };

    fetchFreshData();
  }, [isOpen, changeRequest?.cr_id, user]);

  // Initialize edited materials when modal opens or changeRequest changes
  // Use isOpen and latestChangeRequest as dependencies to ensure fresh data on every open
  React.useEffect(() => {
    if (isOpen && latestChangeRequest) {
      const rawMaterials = latestChangeRequest.sub_items_data || latestChangeRequest.materials_data || latestChangeRequest.materials || [];
      // Enrich materials with vendor negotiated prices and supplier notes from material_vendor_selections
      const materials = rawMaterials.map((mat: any) => {
        const materialName = mat.material_name || mat.sub_item_name || '';
        const vendorSelection = (latestChangeRequest as any).material_vendor_selections?.[materialName];

        // Build enriched material object
        const enrichedMaterial = { ...mat };

        // Add negotiated price if available
        if (vendorSelection?.negotiated_price != null && vendorSelection.negotiated_price > 0) {
          enrichedMaterial.negotiated_price = vendorSelection.negotiated_price;
          enrichedMaterial.unit_price = vendorSelection.negotiated_price;
          enrichedMaterial.total_price = vendorSelection.negotiated_price * (mat.quantity || 0);
        }

        // Add supplier notes if available from material_vendor_selections OR preserve existing notes from material
        if (vendorSelection?.supplier_notes) {
          enrichedMaterial.supplier_notes = vendorSelection.supplier_notes;
        } else if (mat.supplier_notes) {
          // POChild materials already have supplier_notes from backend - preserve them
          enrichedMaterial.supplier_notes = mat.supplier_notes;
        }

        // Check for child_notes at POChild level (new format)
        if (!enrichedMaterial.supplier_notes && (latestChangeRequest as any).child_notes) {
          const childNotes = (latestChangeRequest as any).child_notes;
          const materialPrefix = `[${materialName}]: `;

          if (childNotes.includes(materialPrefix)) {
            // Extract notes for this specific material (format: "[material_name]: notes")
            const startIdx = childNotes.indexOf(materialPrefix) + materialPrefix.length;
            const endIdx = childNotes.indexOf('\n\n', startIdx);
            enrichedMaterial.supplier_notes = endIdx > startIdx
              ? childNotes.substring(startIdx, endIdx)
              : childNotes.substring(startIdx);
          } else if (!childNotes.includes('[')) {
            // Plain notes without prefix (legacy format) - apply to all materials
            enrichedMaterial.supplier_notes = childNotes;
          }
        }

        return enrichedMaterial;
      });
      setEditedMaterials(JSON.parse(JSON.stringify(materials))); // Deep copy
      // Reset LPO data when modal opens with new request
      setLpoData(null);
      setIsLPOExpanded(false);
    }
  }, [isOpen, latestChangeRequest]);

  // Auto-fetch LPO data to get prices and VAT when vendor is selected
  React.useEffect(() => {
    const fetchLPOData = async () => {
      if (!isOpen || !latestChangeRequest || lpoData) return;

      // PERFORMANCE FIX: Only fetch LPO data for roles that can view it
      const userRole = (user?.role || user?.role_name || '').toLowerCase().replace(/[_\s]/g, '');
      const canViewLPO = userRole.includes('buyer') ||
                         userRole.includes('estimator') ||
                         userRole.includes('technical') ||
                         userRole.includes('admin');

      // Site Engineers and Project Managers don't need LPO data
      if (!canViewLPO) return;

      // Always fetch LPO data when vendor is selected (to get VAT and prices)
      if (latestChangeRequest.selected_vendor_name) {
        try {
          const poChildId = (latestChangeRequest as any).po_child_id;
          const response = await buyerService.previewLPOPdf(latestChangeRequest.cr_id, poChildId);
          const lpoDataFromResponse = response.lpo_data || response;
          setLpoData(lpoDataFromResponse);
        } catch (error) {
          // Silently fail - LPO data is optional
          console.log('LPO data not available:', error);
        }
      }
    };

    fetchLPOData();
  }, [isOpen, latestChangeRequest, lpoData, user]);

  // Memoize material data for vendor comparison to avoid recalculation on every render
  // MUST be before early return to avoid "Rendered more hooks than during the previous render" error
  const requestMaterialsForComparison = useMemo(() =>
    latestChangeRequest ? (latestChangeRequest.sub_items_data || latestChangeRequest.materials_data || []) : [],
    [latestChangeRequest]
  );

  const requestMaterialNamesSet = useMemo(() =>
    new Set(
      requestMaterialsForComparison.map((m: any) =>
        (m.material_name || m.sub_item_name || '').toLowerCase().trim()
      )
    ),
    [requestMaterialsForComparison]
  );

  const materialQuantityMap = useMemo(() =>
    new Map(
      requestMaterialsForComparison.map((m: any) => [
        (m.material_name || m.sub_item_name || '').toLowerCase().trim(),
        { quantity: m.quantity || 0, unit: m.unit }
      ])
    ),
    [requestMaterialsForComparison]
  );

  if (!isOpen || !changeRequest) return null;

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      under_review: 'bg-blue-100 text-blue-800 border-blue-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const getStatusIcon = (status: string) => {
    if (status === 'approved') return <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />;
    if (status === 'rejected') return <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />;
    if (status === 'under_review') return <Send className="w-4 h-4 sm:w-5 sm:h-5" />;
    return <Clock className="w-4 h-4 sm:w-5 sm:h-5" />;
  };

  const getStatusLabel = (status: string) => {
    if (!status) return 'UNKNOWN';
    const labels: Record<string, string> = {
      pending: 'PENDING',
      under_review: 'UNDER REVIEW',
      approved_by_pm: 'APPROVED BY PM',
      approved_by_td: 'APPROVED BY TD',
      approved: 'APPROVED & MERGED',
      rejected: 'REJECTED',
      assigned_to_buyer: 'ASSIGNED TO BUYER',
      purchase_completed: 'PURCHASE COMPLETED',
      routed_to_store: 'ROUTED TO M2 STORE',
      pending_td_approval: 'PENDING TD APPROVAL',
      vendor_approved: 'VENDOR APPROVED',
      split_to_po_children: 'SPLIT TO VENDORS'
    };
    return labels[status] || status.toUpperCase().replace(/_/g, ' ');
  };

  // Handler for updating unit price
  const handlePriceChange = (index: number, newUnitPrice: string) => {
    const price = parseFloat(newUnitPrice) || 0;
    const updatedMaterials = [...editedMaterials];
    updatedMaterials[index] = {
      ...updatedMaterials[index],
      unit_price: price,
      total_price: updatedMaterials[index].quantity * price
    };
    setEditedMaterials(updatedMaterials);
  };

  // Handler for comparing vendors with same materials
  const handleCompareVendors = async () => {
    if (!changeRequest) return;

    // Validate materials exist before opening modal
    const materials = changeRequest.sub_items_data || changeRequest.materials_data || [];
    const materialNames = materials.map((m: any) =>
      (m.material_name || m.sub_item_name || '').toLowerCase().trim()
    ).filter(Boolean);

    if (materialNames.length === 0) {
      showWarning('No materials found in this change request');
      return;
    }

    setLoadingCompetitors(true);

    try {
      // Fetch all vendors with their products
      const response = await buyerVendorService.getAllVendorsWithProducts({
        status: 'active',
        per_page: 1000 // Get all vendors
      });

      if (response.success && response.vendors) {
        // Create a Set for O(1) lookup instead of array includes
        const materialNamesSet = new Set(materialNames);

        // Filter vendors who have at least one matching material
        const competitors = response.vendors.filter(vendor => {
          if (vendor.vendor_id === changeRequest.selected_vendor_id) {
            return false; // Exclude currently selected vendor
          }

          if (!vendor.products || vendor.products.length === 0) {
            return false;
          }

          // Check if vendor has any of the materials - use Set.has() for O(1) lookup
          const hasMatchingMaterial = vendor.products.some(product =>
            materialNamesSet.has((product.product_name || '').toLowerCase().trim())
          );

          return hasMatchingMaterial;
        });

        setCompetitorVendors(competitors);

        // Only open modal after data is loaded
        setShowVendorComparisonModal(true);

        // Warn if pagination limit might have truncated results
        if (response.pagination?.total > 1000) {
          showWarning(
            `Only showing first 1000 of ${response.pagination.total} vendors. Some competitors may not be displayed.`
          );
        }
      }
    } catch (error: any) {
      console.error('Error fetching competitor vendors:', error);
      setCompetitorVendors([]);

      // Show user-friendly error message
      if (error.response?.status === 401) {
        showError('Authentication required. Please login again.');
      } else if (error.response?.status === 500) {
        showError('Server error. Please try again later.');
      } else if (!error.response) {
        showError('Unable to connect to server. Please check your connection.');
      } else {
        showError('Failed to load competitor vendors. Please try again.');
      }
    } finally {
      setLoadingCompetitors(false);
    }
  };

  // Calculate costs: Use editedMaterials for real-time calculations
  // Also enrich with LPO prices if available (when material prices are 0)
  const rawMaterialsData = editedMaterials.length > 0 ? editedMaterials : (changeRequest.sub_items_data || changeRequest.materials_data || []);

  // Enrich materials with LPO prices if we have them and material prices are 0
  // Also preserve BOQ prices for comparison display
  const materialVendorSelectionsForEnrich = (changeRequest as any).material_vendor_selections || {};

  const materialsData = rawMaterialsData.map((mat: any) => {
    // Try to find matching item from LPO data for price enrichment
    let lpoItem = null;
    if (lpoData?.items) {
      lpoItem = lpoData.items.find((item: any) =>
        item.description?.toLowerCase() === mat.material_name?.toLowerCase() ||
        item.description?.toLowerCase() === mat.sub_item_name?.toLowerCase()
      );
    }

    // Check for vendor negotiated price and vendor's material name from material_vendor_selections
    const materialName = mat.material_name || mat.sub_item_name || '';
    const vendorSelection = materialVendorSelectionsForEnrich[materialName] || {};
    const vendorSelectionPrice = vendorSelection.negotiated_price;
    const vendorMaterialName = vendorSelection.vendor_material_name;

    // Get BOQ price from material or LPO item (don't use unit_price as it might be vendor price)
    const boqUnitPrice = mat.boq_unit_price || mat.original_unit_price || lpoItem?.boq_rate || 0;
    const boqTotalPrice = mat.boq_total_price || mat.original_total_price || (mat.quantity * boqUnitPrice) || 0;

    // Determine which material name to display (vendor's name if available, otherwise BOQ name)
    const displayMaterialName = vendorMaterialName || materialName;

    // PRIORITY 1: Use vendor negotiated price from material_vendor_selections
    if (vendorSelectionPrice != null && vendorSelectionPrice > 0) {
      return {
        ...mat,
        material_name: displayMaterialName,  // Use vendor's material name
        boq_material_name: materialName,  // Keep original BOQ name for reference
        unit_price: vendorSelectionPrice,
        total_price: vendorSelectionPrice * mat.quantity,
        negotiated_price: vendorSelectionPrice,
        boq_unit_price: boqUnitPrice,
        boq_total_price: boqTotalPrice
      };
    }

    // PRIORITY 2: Use negotiated_price if available on material (vendor's quoted/negotiated price for this PO)
    if (mat.negotiated_price != null && mat.negotiated_price > 0) {
      return {
        ...mat,
        material_name: displayMaterialName,  // Use vendor's material name
        boq_material_name: materialName,  // Keep original BOQ name for reference
        unit_price: mat.negotiated_price,
        total_price: mat.negotiated_price * mat.quantity,
        boq_unit_price: boqUnitPrice,
        boq_total_price: boqTotalPrice
      };
    }

    // PRIORITY 3: Use material's unit_price if it's already set and valid
    if (mat.unit_price && mat.unit_price > 0) {
      return {
        ...mat,
        material_name: displayMaterialName,  // Use vendor's material name
        boq_material_name: materialName,  // Keep original BOQ name for reference
        boq_unit_price: boqUnitPrice,
        boq_total_price: boqTotalPrice
      };
    }

    // PRIORITY 4: Use LPO vendor price as fallback (vendor catalog price)
    if (lpoItem && lpoItem.rate > 0) {
      return {
        ...mat,
        material_name: displayMaterialName,  // Use vendor's material name
        boq_material_name: materialName,  // Keep original BOQ name for reference
        unit_price: lpoItem.rate,
        total_price: lpoItem.amount || (mat.quantity * lpoItem.rate),
        boq_unit_price: boqUnitPrice,
        boq_total_price: boqTotalPrice
      };
    }

    // No vendor price available, just add BOQ prices and vendor material name if available
    return {
      ...mat,
      material_name: displayMaterialName,  // Use vendor's material name if available
      boq_material_name: materialName,  // Keep original BOQ name for reference
      boq_unit_price: boqUnitPrice,
      boq_total_price: boqTotalPrice
    };
  });

  // Total cost of ALL materials (for display) - uses editedMaterials
  const totalMaterialsCost = materialsData.reduce((sum: number, mat: any) =>
    sum + (mat.total_price || (mat.quantity * mat.unit_price) || 0), 0
  );

  // Calculate grand total including VAT (for summary display consistency)
  const vatPercent = lpoData?.totals?.vat_percent || 0;
  const vatAmount = vatPercent > 0 ? (totalMaterialsCost * vatPercent / 100) : 0;
  const grandTotalWithVat = totalMaterialsCost + vatAmount;

  // Use role helper functions with fallback string checks for robustness
  const userRoleLower = user?.role?.toLowerCase() || '';
  const userRoleNameLower = user?.role_name?.toLowerCase() || '';

  const userIsEstimator = isEstimator(user);
  const userIsTechnicalDirector = isTechnicalDirector(user);

  // Check Site Engineer with fallback string matching
  const userIsSiteEngineer = isSiteEngineer(user) ||
                             userRoleLower === 'siteengineer' ||
                             userRoleLower === 'site_engineer' ||
                             userRoleLower === 'site engineer' ||
                             userRoleLower === 'sitesupervisor' ||
                             userRoleLower === 'site_supervisor' ||
                             userRoleNameLower === 'site_supervisor' ||
                             userRoleNameLower === 'siteengineer';

  const userIsBuyer = user?.role?.toLowerCase() === 'buyer' || user?.role_name?.toLowerCase() === 'buyer';

  // Final statuses where no actions should be allowed (except for vendor approval pending TD)
  // Note: vendor_selection_status === 'pending_td_approval' is allowed to show buttons for vendor approval
  const isFinalStatus = ['approved_by_pm', 'approved_by_td', 'assigned_to_buyer', 'send_to_buyer', 'purchase_completed', 'routed_to_store', 'approved', 'rejected', 'vendor_approved'].includes(changeRequest.status);

  // Check if this is a vendor approval pending TD - these should show approve/reject buttons
  const isVendorApprovalPending = changeRequest.vendor_selection_status === 'pending_td_approval';

  // Check if vendor selection is pending TD approval (no edits allowed)
  const isVendorPendingApproval = changeRequest.vendor_selection_status === 'pending_td_approval';

  // Estimator/TD can approve if request needs their approval
  const canApproveReject = canApproveFromParent !== undefined
    ? canApproveFromParent
    : (userIsEstimator || userIsTechnicalDirector) &&
      changeRequest.status === 'under_review' &&
      !isFinalStatus;

  // Determine if estimator can edit prices (estimator viewing under_review status)
  // DISABLED once sent to TD for vendor approval
  const canEditPrices = userIsEstimator &&
                        changeRequest.status === 'under_review' &&
                        changeRequest.approval_required_from === 'estimator' &&
                        !isVendorPendingApproval &&
                        !isFinalStatus;

  // Check Project Manager with fallback string matching
  const userIsProjectManager = isProjectManager(user) ||
                               userRoleLower === 'project_manager' ||
                               userRoleLower === 'projectmanager' ||
                               userRoleLower === 'project manager' ||
                               userRoleNameLower === 'project_manager' ||
                               userRoleNameLower === 'projectmanager';

  // Hide pricing for Site Engineers and Project Managers
  // Only Buyers, Estimators, TD, and Admin can see pricing
  const shouldShowPricing = !userIsSiteEngineer && !userIsProjectManager;

  // Handler for approval with updated materials
  const handleApproveWithUpdatedPrices = () => {
    if (onApprove) {
      // Store edited materials in changeRequest for parent to access
      (changeRequest as any)._editedMaterials = editedMaterials;
      onApprove();
    }
  };

  // Load LPO preview data and expand section
  const handleViewLPO = async () => {
    if (!changeRequest) return;

    // If already loaded, just toggle expansion
    if (lpoData) {
      setIsLPOExpanded(!isLPOExpanded);
      return;
    }

    setLoadingLPO(true);
    try {
      // Get po_child_id from changeRequest if available (for POChild records)
      const poChildId = (changeRequest as any).po_child_id;
      const response = await buyerService.previewLPOPdf(changeRequest.cr_id, poChildId);
      // Extract lpo_data from response
      const lpoDataFromResponse = response.lpo_data || response;
      setLpoData(lpoDataFromResponse);
      setIsLPOExpanded(true);
    } catch (error) {
      console.error('Error loading LPO:', error);
      alert('Failed to load LPO data');
    } finally {
      setLoadingLPO(false);
    }
  };

  // Download LPO PDF
  const handleDownloadLPO = async () => {
    if (!changeRequest || !lpoData) return;
    setDownloadingLPO(true);
    try {
      const poChildId = (changeRequest as any).po_child_id;
      const response = await buyerService.generateLPOPdf(changeRequest.cr_id, lpoData, poChildId);

      // Create blob and download
      const blob = new Blob([response], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LPO-${changeRequest.formatted_cr_id || changeRequest.cr_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading LPO:', error);
      alert('Failed to download LPO PDF');
    } finally {
      setDownloadingLPO(false);
    }
  };


  return (
    <AnimatePresence>
      <>
        {/* Full Page View */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-gray-100"
        >
          <div className="h-full flex flex-col">
            {/* Header - Fixed at top, compact on mobile */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-purple-600 to-purple-700 shadow-lg flex-shrink-0">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">
                    <Package className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-white">
                      {changeRequest.formatted_cr_id || `PO-${changeRequest.cr_id}` || 'N/A'}
                    </h1>
                    <p className="text-xs sm:text-sm text-white/80 mt-0.5 sm:mt-1 truncate max-w-[180px] sm:max-w-none">
                      {changeRequest.project_name || 'Project'} • BOQ: {changeRequest.boq_name || `#${changeRequest.boq_id}` || 'N/A'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <X className="w-4 sm:w-5 h-4 sm:h-5" />
                  <span className="font-medium text-sm sm:text-base">Close</span>
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              <div className="max-w-7xl mx-auto">
                {/* Info Cards Row - Stack on mobile */}
                <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 mb-4 sm:mb-6">
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-6">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="text-xs sm:text-sm text-gray-500">Status:</span>
                      <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-semibold border ${getStatusColor(changeRequest.status || 'pending')}`}>
                        {getStatusIcon(changeRequest.status || 'pending')}
                        {getStatusLabel(changeRequest.status || 'pending')}
                      </span>
                    </div>
                    <div className="hidden sm:block h-6 w-px bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm text-gray-500">Requested By:</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-900">{changeRequest.requested_by_name || 'N/A'}</span>
                      <span className="text-xs sm:text-sm text-gray-400">({changeRequest.requested_by_role?.replace('_', ' ').replace('siteEngineer', 'Site Engineer') || 'N/A'})</span>
                    </div>
                    <div className="hidden sm:block h-6 w-px bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm text-gray-500">Date:</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-900">
                        {changeRequest.created_at ? new Date(changeRequest.created_at).toLocaleDateString('en-US', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Project & BOQ Details Section - Professional Layout */}
                <div className="bg-white rounded-lg shadow-sm mb-4 sm:mb-6 overflow-hidden">
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                    {/* Project Information */}
                    <div className="p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900">Project Information</h3>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-xs text-gray-500 min-w-[80px]">Project</span>
                          <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4" title={changeRequest.project_name || 'N/A'}>
                            {changeRequest.project_name || 'N/A'}
                          </span>
                        </div>
                        {changeRequest.project_code && (
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[80px]">Code</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {changeRequest.project_code}
                            </span>
                          </div>
                        )}
                        {changeRequest.project_client && (
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[80px]">Client</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4" title={changeRequest.project_client}>
                              {changeRequest.project_client}
                            </span>
                          </div>
                        )}
                        {changeRequest.project_location && (
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[80px]">Location</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4" title={changeRequest.project_location}>
                              {changeRequest.project_location}
                            </span>
                          </div>
                        )}
                        {changeRequest.area && (
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[80px]">Area</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {changeRequest.area}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BOQ Information */}
                    <div className="p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900">BOQ Information</h3>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-xs text-gray-500 min-w-[80px]">BOQ Name</span>
                          <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4" title={changeRequest.boq_name || `BOQ #${changeRequest.boq_id}`}>
                            {changeRequest.boq_name || `BOQ #${changeRequest.boq_id}`}
                          </span>
                        </div>
                        <div className="flex justify-between items-start">
                          <span className="text-xs text-gray-500 min-w-[80px]">BOQ ID</span>
                          <span className="text-sm font-medium text-blue-600 text-right flex-1 ml-4">
                            #{changeRequest.boq_id}
                          </span>
                        </div>
                        {changeRequest.item_name && (
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[80px]">Item</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4" title={changeRequest.item_name}>
                              {changeRequest.item_name}
                            </span>
                          </div>
                        )}
                        {changeRequest.boq_status && (
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[80px]">Status</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              changeRequest.boq_status === 'approved' ? 'bg-green-100 text-green-700' :
                              changeRequest.boq_status === 'draft' ? 'bg-gray-100 text-gray-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {changeRequest.boq_status.charAt(0).toUpperCase() + changeRequest.boq_status.slice(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vendor Comparison Section - For TD to compare vendors */}
                {userIsTechnicalDirector && !changeRequest.selected_vendor_id && !(changeRequest as any).vendor_details && (
                  <div className="bg-white rounded-lg shadow-sm mb-4 sm:mb-6 p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <GitCompare className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">Vendor Comparison</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Compare vendors who can supply these materials</p>
                        </div>
                      </div>
                      <button
                        onClick={handleCompareVendors}
                        disabled={loadingCompetitors}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingCompetitors ? (
                          <>
                            <ModernLoadingSpinners size="xs" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <GitCompare className="w-4 h-4" />
                            Compare Vendors
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Vendor Details Section */}
                {(changeRequest.selected_vendor_id || (changeRequest as any).vendor_details) && (
                  <div className="bg-white rounded-lg shadow-sm mb-4 sm:mb-6 overflow-hidden">
                    {/* Header with Compare Button - Always visible when vendor is selected */}
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-4 sm:px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">Selected Vendor Details</h3>
                            <p className="text-xs text-gray-500">Compare with other vendors who can supply these materials</p>
                          </div>
                        </div>
                        <button
                          onClick={handleCompareVendors}
                          disabled={loadingCompetitors}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                          title="Compare with competitor vendors"
                        >
                          {loadingCompetitors ? (
                            <>
                              <ModernLoadingSpinners size="xxs" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <GitCompare className="w-3.5 h-3.5" />
                              Compare Vendors
                            </>
                          )}
                        </button>
                      </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                      {/* Vendor Company Information */}
                      <div className="p-4 sm:p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900">Vendor Information</h3>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">Company Name</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {(changeRequest as any).vendor_details?.company_name || changeRequest.selected_vendor_name || 'N/A'}
                            </span>
                          </div>

                          {/* Vendor contact details */}
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">Contact Person</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {(changeRequest as any).vendor_details?.contact_person_name || (changeRequest as any).vendor_contact_person || 'N/A'}
                            </span>
                          </div>

                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">Email</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4 break-words">
                              {(changeRequest as any).vendor_details?.email || (changeRequest as any).vendor_email || 'N/A'}
                            </span>
                          </div>

                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">Phone</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {(changeRequest as any).vendor_details?.phone_code || (changeRequest as any).vendor_phone_code || ''} {(changeRequest as any).vendor_details?.phone || (changeRequest as any).vendor_phone || 'N/A'}
                            </span>
                          </div>

                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">Category</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {(changeRequest as any).vendor_details?.category || (changeRequest as any).vendor_category || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Vendor Additional Details */}
                      <div className="p-4 sm:p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900">Selection Details</h3>
                        </div>
                        <div className="space-y-3">
                          {/* Show address from vendor_details or fallback fields */}
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">Address</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {[
                                (changeRequest as any).vendor_details?.street_address || (changeRequest as any).vendor_street_address,
                                (changeRequest as any).vendor_details?.city || (changeRequest as any).vendor_city,
                                (changeRequest as any).vendor_details?.state || (changeRequest as any).vendor_state,
                                (changeRequest as any).vendor_details?.country || (changeRequest as any).vendor_country,
                                (changeRequest as any).vendor_details?.pin_code || (changeRequest as any).vendor_pin_code
                              ].filter(Boolean).join(', ') || 'N/A'}
                            </span>
                          </div>

                          {/* Show GST/TRN from vendor_details or fallback field */}
                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">GST/TRN Number</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {(changeRequest as any).vendor_details?.gst_number || (changeRequest as any).vendor_gst_number || 'N/A'}
                            </span>
                          </div>

                          <div className="flex justify-between items-start">
                            <span className="text-xs text-gray-500 min-w-[100px]">Selected By</span>
                            <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                              {changeRequest.vendor_selected_by_buyer_name || 'N/A'}
                            </span>
                          </div>

                          {changeRequest.vendor_selection_date && (
                            <div className="flex justify-between items-start">
                              <span className="text-xs text-gray-500 min-w-[100px]">Selection Date</span>
                              <span className="text-sm font-medium text-gray-900 text-right flex-1 ml-4">
                                {new Date(changeRequest.vendor_selection_date).toLocaleDateString('en-US', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Supplier Notes */}
                    {changeRequest.supplier_notes && (
                      <div className="px-4 pb-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start gap-2">
                            <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-blue-900 mb-1">Notes for Supplier</div>
                              <div className="text-sm text-blue-800 whitespace-pre-wrap break-words italic">
                                "{changeRequest.supplier_notes}"
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* View Competitor Vendors Button - Show to TD if comparison data exists */}
                    {userIsTechnicalDirector && changeRequest.material_vendor_selections && Object.keys(changeRequest.material_vendor_selections).length > 0 && (
                      <div className="px-4 pb-4">
                        <button
                          onClick={() => {
                            // Scroll to the Buyer's Vendor Evaluation section
                            const vendorComparisonSection = document.getElementById('vendor-comparison-section');
                            if (vendorComparisonSection) {
                              vendorComparisonSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }}
                          className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          View Competitor Vendors
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Buyer's Vendor Evaluation (Comparison Data) - Only show to TD if vendor comparison data exists */}
                {userIsTechnicalDirector && changeRequest.material_vendor_selections && Object.keys(changeRequest.material_vendor_selections).length > 0 && (
                  (() => {
                    // Extract vendor comparison data from material_vendor_selections
                    const allEvaluatedVendors = new Map<number, any>();

                    try {
                      Object.entries(changeRequest.material_vendor_selections).forEach(([materialName, selection]: [string, any]) => {
                        // ✅ Null safety: Validate selection and vendor_comparison_data
                        if (!selection || typeof selection !== 'object') return;
                        if (!selection.vendor_comparison_data || !Array.isArray(selection.vendor_comparison_data)) return;

                        selection.vendor_comparison_data.forEach((vendorData: any) => {
                          // ✅ Null safety: Validate vendorData before processing
                          if (!vendorData || typeof vendorData !== 'object') return;
                          if (!vendorData.vendor_id) return;

                          if (!allEvaluatedVendors.has(vendorData.vendor_id)) {
                            allEvaluatedVendors.set(vendorData.vendor_id, {
                              ...vendorData,
                              materials: []
                            });
                          }
                          allEvaluatedVendors.get(vendorData.vendor_id).materials.push({
                            material_name: materialName,
                            vendor_material_name: vendorData.vendor_material_name,
                            negotiated_price: vendorData.negotiated_price
                          });
                        });
                      });
                    } catch (error) {
                      console.error('Error rendering vendor comparison:', error);
                      return (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                          <p className="text-sm text-yellow-800">
                            Unable to display vendor comparison data. The data may be incomplete or corrupted.
                          </p>
                        </div>
                      );
                    }

                    const evaluatedVendorsList = Array.from(allEvaluatedVendors.values());
                    const selectedVendor = evaluatedVendorsList.find(v => v?.is_selected);
                    const otherVendors = evaluatedVendorsList.filter(v => !v?.is_selected);

                    if (evaluatedVendorsList.length === 0) return null;

                    return (
                      <div id="vendor-comparison-section" className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-sm p-4 sm:p-5 mb-4 sm:mb-6 border border-blue-200">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                            <GitCompare className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">Buyer's Vendor Evaluation</h3>
                            <p className="text-xs text-gray-600 mt-0.5">
                              Buyer evaluated {evaluatedVendorsList.length} vendor{evaluatedVendorsList.length !== 1 ? 's' : ''} for this purchase
                            </p>
                          </div>
                        </div>

                        {otherVendors.length > 0 && (
                          <div className="space-y-3">
                            <div className="bg-white border border-blue-200 rounded-lg p-3">
                              <p className="text-xs font-semibold text-gray-700 mb-2">
                                <span className="text-blue-600">{otherVendors.length}</span> other vendor{otherVendors.length !== 1 ? 's were' : ' was'} considered:
                              </p>
                              <div className="space-y-2">
                                {otherVendors.map((vendor: any) => (
                                  <div key={vendor.vendor_id} className="bg-gray-50 border border-gray-200 rounded-md p-2.5">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate">{vendor.vendor_name}</p>
                                        {vendor.vendor_category && (
                                          <p className="text-xs text-gray-500 mt-0.5">{vendor.vendor_category}</p>
                                        )}
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-xs text-gray-500">Total Materials</p>
                                        <p className="font-semibold text-gray-900">{vendor.materials.length}</p>
                                      </div>
                                    </div>

                                    {/* Contact Info Grid */}
                                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-300 pt-2 mt-2">
                                      {vendor.vendor_contact_person && (
                                        <div>
                                          <span className="text-gray-500">Contact:</span>
                                          <span className="ml-1 text-gray-900 font-medium">{vendor.vendor_contact_person}</span>
                                        </div>
                                      )}
                                      {vendor.vendor_phone && (
                                        <div>
                                          <span className="text-gray-500">Phone:</span>
                                          <span className="ml-1 text-gray-900 font-medium">
                                            {vendor.vendor_phone_code} {vendor.vendor_phone}
                                          </span>
                                        </div>
                                      )}
                                      {vendor.vendor_email && (
                                        <div className="col-span-2">
                                          <span className="text-gray-500">Email:</span>
                                          <span className="ml-1 text-gray-900 font-medium break-all">{vendor.vendor_email}</span>
                                        </div>
                                      )}
                                      {vendor.vendor_gst_number && (
                                        <div>
                                          <span className="text-gray-500">TRN:</span>
                                          <span className="ml-1 text-gray-900 font-medium">{vendor.vendor_gst_number}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Materials with prices */}
                                    <div className="mt-2 border-t border-gray-300 pt-2">
                                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Materials & Prices:</p>
                                      <div className="space-y-1">
                                        {vendor.materials.map((mat: any, idx: number) => (
                                          <div key={idx} className="flex justify-between items-start text-xs bg-white rounded px-2 py-1">
                                            <span className="text-gray-700 flex-1">
                                              {mat.material_name}
                                              {mat.vendor_material_name && mat.vendor_material_name !== mat.material_name && (
                                                <span className="text-gray-500 ml-1">({mat.vendor_material_name})</span>
                                              )}
                                            </span>
                                            {mat.negotiated_price != null && (
                                              <span className="font-semibold text-gray-900 ml-2">
                                                AED {Number(mat.negotiated_price).toFixed(2)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="bg-green-50 border border-green-300 rounded-lg p-2.5 flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-green-800">
                                <span className="font-semibold">{selectedVendor?.vendor_name || changeRequest.selected_vendor_name}</span> was selected by the buyer after comparison
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Justification/Reason Section */}
                {(changeRequest.justification || changeRequest.reason) && (
                  <div className="bg-white rounded-lg shadow-sm p-4 sm:p-5 mb-4 sm:mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">Justification / Reason</h3>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {changeRequest.justification || changeRequest.reason}
                      </p>
                    </div>
                  </div>
                )}

                {/* Approval Trail */}
                {(changeRequest.pm_approval_date || changeRequest.td_approval_date || changeRequest.approval_date || changeRequest.rejection_reason) && (
                  <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 mb-4 sm:mb-6">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">Approval History</h3>
                    <div className="space-y-2 sm:space-y-3">
                    {/* PM Approval */}
                    {changeRequest.pm_approval_date && (
                      <div className="flex items-start gap-2 sm:gap-3 bg-green-50 border border-green-200 rounded-lg p-2.5 sm:p-3">
                        <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-green-900">Approved by Project Manager</p>
                          <p className="text-[10px] sm:text-xs text-green-700">{changeRequest.pm_approved_by_name}</p>
                          <p className="text-[10px] sm:text-xs text-green-600 mt-0.5 sm:mt-1">
                            {new Date(changeRequest.pm_approval_date).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* TD Approval */}
                    {changeRequest.td_approval_date && (
                      <div className="flex items-start gap-2 sm:gap-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5 sm:p-3">
                        <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-blue-900">Approved by Technical Director</p>
                          <p className="text-[10px] sm:text-xs text-blue-700">{changeRequest.td_approved_by_name}</p>
                          <p className="text-[10px] sm:text-xs text-blue-600 mt-0.5 sm:mt-1">
                            {new Date(changeRequest.td_approval_date).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Estimator Approval */}
                    {changeRequest.approval_date && changeRequest.status === 'approved' && (
                      <div className="flex items-start gap-2 sm:gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 sm:p-3">
                        <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-emerald-900">Final Approval by Estimator</p>
                          <p className="text-[10px] sm:text-xs text-emerald-700">{changeRequest.approved_by_name}</p>
                          <p className="text-[10px] sm:text-xs text-emerald-600 mt-0.5 sm:mt-1">
                            {new Date(changeRequest.approval_date).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          <p className="text-[10px] sm:text-xs text-emerald-700 mt-1 sm:mt-2 font-medium">✓ Materials merged to BOQ</p>
                        </div>
                      </div>
                    )}

                    {/* Rejection */}
                      {changeRequest.rejection_reason && (
                        <div className="flex items-start gap-2 sm:gap-3 bg-red-50 border border-red-200 rounded-lg p-2.5 sm:p-3">
                          <XCircle className="w-4 sm:w-5 h-4 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-semibold text-red-900">Rejected</p>
                            {changeRequest.rejected_by_name && (
                              <p className="text-[10px] sm:text-xs text-red-700">By: {changeRequest.rejected_by_name}</p>
                            )}
                            {changeRequest.rejected_at_stage && (
                              <p className="text-[10px] sm:text-xs text-red-600 capitalize">At: {changeRequest.rejected_at_stage.replace('_', ' ')} stage</p>
                            )}
                            <p className="text-[10px] sm:text-xs text-red-800 mt-1 sm:mt-2 italic">&quot;{changeRequest.rejection_reason}&quot;</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Materials Requested - Card layout on mobile, Table on desktop */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4 sm:mb-6">
                  <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-sm sm:text-lg font-semibold text-gray-800">Materials Requested</h3>
                  </div>

                  {/* Mobile: Card Layout */}
                  <div className="sm:hidden p-3 space-y-3">
                    {materialsData?.map((material: any, idx: number) => {
                      // Use is_new_material flag from backend (set when material doesn't exist in BOQ)
                      // Fallback to checking master_material_id only if flag is not present
                      const isNewMaterial = material.is_new_material === true || 
                                            (material.is_new_material === undefined && material.master_material_id === null);
                      return (
                        <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          {/* Material Name + NEW badge */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-sm text-gray-900 truncate" title={material.material_name}>{material.material_name}</span>
                            {isNewMaterial && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 text-green-700 border border-green-300 flex-shrink-0">
                                NEW
                              </span>
                            )}
                          </div>

                          {/* Details Grid */}
                          <div className="space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="truncate">
                                <span className="text-gray-500">Brand:</span>
                                <span className="ml-1 text-gray-900" title={material.brand || ''}>{material.brand || '-'}</span>
                              </div>
                              <div className="truncate">
                                <span className="text-gray-500">Size:</span>
                                <span className="ml-1 text-gray-900" title={material.size || ''}>{material.size || '-'}</span>
                              </div>
                            </div>
                            {/* Specification */}
                            {material.specification && material.specification.trim() && (
                              <div>
                                <span className="text-gray-500">Specification:</span>
                                <div className="ml-1 text-gray-900">
                                  {material.specification.length > 80 && !expandedSpecs.has(idx) ? (
                                    <>
                                      <span>{material.specification.substring(0, 80)}...</span>
                                      <button
                                        onClick={() => toggleSpec(idx)}
                                        className="ml-1 text-purple-600 hover:text-purple-800 font-medium"
                                      >
                                        See More
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span>{material.specification}</span>
                                      {material.specification.length > 80 && (
                                        <button
                                          onClick={() => toggleSpec(idx)}
                                          className="ml-1 text-purple-600 hover:text-purple-800 font-medium"
                                        >
                                          See Less
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="truncate">
                                <span className="text-gray-500">Sub-Item:</span>
                                {material.sub_item_name ? (
                                  <button
                                    onClick={() => handleViewSubItemInBOQ(material.sub_item_name, material.material_name)}
                                    className="ml-1 text-purple-700 hover:text-purple-900 underline underline-offset-2 hover:no-underline truncate"
                                    title={`View "${material.sub_item_name}" in BOQ`}
                                  >
                                    {material.sub_item_name}
                                  </button>
                                ) : (
                                  <span className="ml-1 text-gray-900">-</span>
                                )}
                              </div>
                              <div>
                                <span className="text-gray-500">Qty:</span>
                                <span className="ml-1 font-medium text-gray-900">{material.quantity} {material.unit}</span>
                              </div>
                            </div>
                          </div>

                          {/* Notes - Only show for NEW materials with justification */}
                          {isNewMaterial && material.justification && material.justification.trim().length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <span className="text-gray-500 text-xs">Notes:</span>
                              <p className="text-xs text-gray-700 line-clamp-2 mt-0.5">
                                {material.justification}
                              </p>
                            </div>
                          )}

                          {/* Pricing (if shown) */}
                          {shouldShowPricing && (
                            <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                              <div className="text-xs">
                                <span className="text-gray-500">Unit:</span>
                                <span className="ml-1 font-medium text-gray-900">{formatCurrency(material.unit_price || 0)}</span>
                              </div>
                              <div className="text-xs">
                                <span className="text-gray-500">Total:</span>
                                <span className="ml-1 font-bold text-purple-700">{formatCurrency(material.total_price || (material.quantity * material.unit_price) || 0)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Total Cost on Mobile */}
                    {shouldShowPricing && (
                      <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                        {/* Subtotal */}
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Subtotal:</span>
                          <span className="text-sm font-medium text-gray-700">{formatCurrency(totalMaterialsCost)}</span>
                        </div>
                        {/* VAT - only show if > 0 */}
                        {vatPercent > 0 && (
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-sm text-gray-600">VAT ({vatPercent}%):</span>
                            <span className="text-sm font-medium text-gray-700">{formatCurrency(vatAmount)}</span>
                          </div>
                        )}
                        {/* Total Cost */}
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-purple-200">
                          <span className="text-sm font-bold text-gray-700">Total Cost:</span>
                          <span className="text-base font-bold text-purple-700">{formatCurrency(grandTotalWithVat)}</span>
                        </div>
                        {/* BOQ Total as secondary - always show */}
                        {(() => {
                          const boqTotal = materialsData.reduce((sum: number, mat: any) => {
                            const boqPrice = mat.boq_unit_price || mat.original_unit_price || 0;
                            return sum + (boqPrice * (mat.quantity || 0));
                          }, 0);
                          if (boqTotal > 0) {
                            return (
                              <div className="flex justify-between items-center mt-1 text-xs text-gray-400">
                                <span>BOQ:</span>
                                <span>{formatCurrency(boqTotal)}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Warning when prices are missing */}
                  {shouldShowPricing && totalMaterialsCost === 0 && materialsData.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Prices not set for materials</p>
                        <p className="text-xs text-amber-600 mt-1">
                          Material prices should be set in the BOQ or by the Estimator/Buyer during the approval process.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Desktop: Table Layout */}
                  <div className="hidden sm:block overflow-x-auto">
                  {/* Check if there are any NEW materials to show Notes column */}
                  {(() => {
                    const hasNewMaterials = materialsData?.some((mat: any) => 
                      mat.is_new_material === true || 
                      (mat.is_new_material === undefined && mat.master_material_id === null)
                    );
                    return (
                  <table className="w-full">
                    <thead className="bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Material</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Brand</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Size</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Specification</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Sub-Item</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Qty</th>
                        {hasNewMaterials && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Notes</th>
                        )}
                        {shouldShowPricing && (
                          <>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Unit Price</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {materialsData?.map((material: any, idx: number) => {
                        // Use is_new_material flag from backend (set when material doesn't exist in BOQ)
                        // Fallback to checking master_material_id only if flag is not present
                        const isNewMaterial = material.is_new_material === true ||
                                              (material.is_new_material === undefined && material.master_material_id === null);
                        return (
                          <React.Fragment key={idx}>
                          <tr className="hover:bg-gray-50 transition-colors">
                            {/* Material Name */}
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium" title={material.material_name}>{material.material_name}</span>
                                {isNewMaterial && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300 flex-shrink-0">
                                    NEW
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* Brand */}
                            <td className="px-4 py-3 text-sm text-gray-600" title={material.brand || ''}>
                              {material.brand || <span className="text-gray-400">-</span>}
                            </td>
                            {/* Size */}
                            <td className="px-4 py-3 text-sm text-gray-600" title={material.size || ''}>
                              {material.size || <span className="text-gray-400">-</span>}
                            </td>
                            {/* Specification */}
                            <td className="px-4 py-3 text-sm text-gray-600" style={{ maxWidth: '250px' }}>
                              {material.specification && material.specification.trim() ? (
                                <div>
                                  {material.specification.length > 100 && !expandedSpecs.has(idx) ? (
                                    <div>
                                      <span>{material.specification.substring(0, 100)}...</span>
                                      <button
                                        onClick={() => toggleSpec(idx)}
                                        className="ml-1 text-purple-600 hover:text-purple-800 font-medium text-xs whitespace-nowrap"
                                      >
                                        See More
                                      </button>
                                    </div>
                                  ) : (
                                    <div>
                                      <span>{material.specification}</span>
                                      {material.specification.length > 100 && (
                                        <button
                                          onClick={() => toggleSpec(idx)}
                                          className="ml-1 text-purple-600 hover:text-purple-800 font-medium text-xs whitespace-nowrap"
                                        >
                                          See Less
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            {/* Sub-Item - Clickable to view in BOQ */}
                            <td className="px-4 py-3 text-sm">
                              {material.sub_item_name ? (
                                <button
                                  onClick={() => handleViewSubItemInBOQ(material.sub_item_name, material.material_name)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 hover:text-purple-900 transition-colors cursor-pointer truncate max-w-full group"
                                  title={`Click to view "${material.sub_item_name}" in BOQ scope`}
                                >
                                  <span className="truncate">{material.sub_item_name}</span>
                                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                </button>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Quantity */}
                            <td className="px-4 py-3 text-sm text-gray-900 text-center whitespace-nowrap font-medium">
                              {material.quantity} <span className="text-gray-500 font-normal">{material.unit}</span>
                            </td>
                            {/* Notes - Only show for NEW materials */}
                            {hasNewMaterials && (
                              <td className="px-4 py-3 text-sm">
                                {isNewMaterial && material.justification && material.justification.trim().length > 0 ? (
                                  <p className="text-xs text-gray-700 line-clamp-2" title={material.justification}>
                                    {material.justification}
                                  </p>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            )}
                            {shouldShowPricing && (() => {
                              // Get vendor price and BOQ price
                              const vendorUnitPrice = material.unit_price || 0;
                              const boqUnitPrice = material.original_unit_price || material.boq_unit_price || 0;
                              const vendorTotal = material.total_price || (material.quantity * vendorUnitPrice) || 0;
                              const boqTotal = material.original_total_price || material.boq_total_price || (material.quantity * boqUnitPrice) || 0;
                              const unitPriceDiff = vendorUnitPrice - boqUnitPrice;

                              return (
                              <>
                                {/* Unit Price */}
                                <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                                  {canEditPrices && isNewMaterial ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={vendorUnitPrice}
                                      onChange={(e) => handlePriceChange(idx, e.target.value)}
                                      className="w-24 px-2 py-1 text-sm text-right border border-purple-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-purple-50 text-gray-900 font-medium"
                                      placeholder="0.00"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-end">
                                      {vendorUnitPrice > 0 ? (
                                        <span className="font-semibold text-gray-900">{formatCurrency(vendorUnitPrice)}</span>
                                      ) : (
                                        <span className="text-amber-600 text-xs italic">Price not set</span>
                                      )}
                                      {boqUnitPrice > 0 && boqUnitPrice !== vendorUnitPrice && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                          <span className="text-[10px] text-gray-400">BOQ: {formatCurrency(boqUnitPrice)}</span>
                                          {unitPriceDiff !== 0 && (
                                            <span className={`text-[10px] font-bold ${unitPriceDiff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                              ({unitPriceDiff > 0 ? '+' : ''}{formatCurrency(unitPriceDiff)})
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                {/* Total */}
                                <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                                  <div className="flex flex-col items-end">
                                    {vendorTotal > 0 ? (
                                      <span className="font-bold text-gray-900">{formatCurrency(vendorTotal)}</span>
                                    ) : (
                                      <span className="text-amber-600 text-xs italic">-</span>
                                    )}
                                    {boqTotal > 0 && (
                                      <span className="text-[10px] text-gray-400 mt-0.5">BOQ: {formatCurrency(boqTotal)}</span>
                                    )}
                                  </div>
                                </td>
                              </>
                            );
                            })()}
                          </tr>

                          {/* Supplier Notes Sub-Row */}
                          {material.supplier_notes && material.supplier_notes.trim().length > 0 && (
                            <tr>
                              <td colSpan={hasNewMaterials ? (shouldShowPricing ? 10 : 7) : (shouldShowPricing ? 9 : 6)} className="px-4 py-2 bg-blue-50 border-t-0">
                                <div className="flex items-start gap-2 text-xs">
                                  <span className="font-semibold text-blue-700 whitespace-nowrap">📝 Note:</span>
                                  <span className="text-blue-800">{material.supplier_notes}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                        );
                      })}
                      {shouldShowPricing && (() => {
                        // Calculate subtotal, VAT, and grand total
                        const subtotal = totalMaterialsCost;
                        const vatPercent = lpoData?.totals?.vat_percent || 0;
                        const vatAmount = vatPercent > 0 ? (subtotal * vatPercent / 100) : 0;
                        const grandTotal = subtotal + vatAmount;

                        const boqTotal = materialsData.reduce((sum: number, mat: any) => {
                          const boqPrice = mat.boq_unit_price || mat.original_unit_price || 0;
                          return sum + (boqPrice * (mat.quantity || 0));
                        }, 0);

                        return (
                          <>
                            {/* Subtotal Row */}
                            <tr className="bg-gray-50">
                              <td colSpan={hasNewMaterials ? 9 : 8} className="px-4 py-2 text-sm font-semibold text-gray-700 text-right">
                                Subtotal:
                              </td>
                              <td className="px-4 py-2 text-right whitespace-nowrap">
                                <div className="text-sm font-semibold text-gray-900">
                                  {formatCurrency(subtotal)}
                                </div>
                                {boqTotal > 0 && (
                                  <div className="text-[10px] text-gray-400 mt-0.5">
                                    BOQ: {formatCurrency(boqTotal)}
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* VAT Row - Only show if VAT > 0 */}
                            {vatPercent > 0 && (
                              <tr className="bg-gray-50">
                                <td colSpan={hasNewMaterials ? 9 : 8} className="px-4 py-2 text-sm font-semibold text-gray-700 text-right">
                                  VAT ({vatPercent}%):
                                </td>
                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {formatCurrency(vatAmount)}
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* Total Row */}
                            <tr className="bg-gray-100 border-t-2 border-gray-300">
                              <td colSpan={hasNewMaterials ? 9 : 8} className="px-4 py-3 text-sm font-bold text-gray-700 text-right">
                                Total Cost:
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <div className="text-base font-bold text-purple-700">
                                  {formatCurrency(grandTotal)}
                                </div>
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                    );
                  })()}
                  </div>
                </div>

                {/* Negotiable Margin Summary - Only show for NEW materials and hide from Site Engineers and PMs */}
                {shouldShowPricing && changeRequest.negotiable_margin_analysis && materialsData.some((mat: any) => mat.master_material_id === null || mat.master_material_id === undefined) && (() => {
                  // Check if budget is invalid (zero or negative allocation)
                  const hasInvalidBudget = changeRequest.negotiable_margin_analysis.original_allocated <= 0;

                  return (
                    <div className={`bg-white rounded-lg shadow-sm p-3 sm:p-4 mb-4 sm:mb-6 ${hasInvalidBudget ? 'border-l-4 border-red-500' : 'border-l-4 border-purple-500'}`}>
                      {/* Warning Banner for Invalid Budget */}
                      {hasInvalidBudget && (
                        <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-2 sm:gap-3">
                            <AlertCircle className="w-4 sm:w-5 h-4 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-xs sm:text-sm font-bold text-red-900">
                                No Negotiable Margin Budget Available
                              </p>
                              <p className="text-[10px] sm:text-sm text-red-700 mt-0.5 sm:mt-1">
                                Current Allocation: {formatCurrency(changeRequest.negotiable_margin_analysis.original_allocated)}
                              </p>
                              <p className="text-[10px] sm:text-sm text-red-600 mt-0.5 sm:mt-1">
                                This budget shows invalid or insufficient allocation for change requests.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <h3 className={`text-xs sm:text-sm font-semibold mb-2 sm:mb-4 ${hasInvalidBudget ? 'text-red-900' : 'text-purple-900'}`}>
                        Negotiable Margin Summary
                      </h3>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                          <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            Original Allocated:
                          </span>
                          <p className={`font-bold text-xs sm:text-sm ${hasInvalidBudget ? 'text-red-900' : 'text-purple-900'}`}>
                            {formatCurrency(changeRequest.negotiable_margin_analysis.original_allocated || 0)}
                          </p>
                          {changeRequest.negotiable_margin_analysis.discount_applied > 0 && (
                            <p className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-500' : 'text-purple-500'}`}>
                              (Discount: {formatCurrency(changeRequest.negotiable_margin_analysis.discount_applied)})
                            </p>
                          )}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                          <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            Already Consumed:
                          </span>
                          <p className="font-bold text-xs sm:text-sm text-orange-600">
                            {formatCurrency(changeRequest.negotiable_margin_analysis.already_consumed || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                          <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            This Request:
                          </span>
                          <p className="font-bold text-xs sm:text-sm text-blue-600">
                            {formatCurrency(changeRequest.negotiable_margin_analysis.this_request || 0)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                          <span className={`text-[10px] sm:text-xs ${hasInvalidBudget ? 'text-red-600' : 'text-purple-600'}`}>
                            Remaining After:
                          </span>
                          <p className={`font-bold text-xs sm:text-sm ${
                            changeRequest.negotiable_margin_analysis.remaining_after < 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}>
                            {formatCurrency(changeRequest.negotiable_margin_analysis.remaining_after)}
                          </p>
                        </div>
                      </div>

                      <div className={`mt-3 sm:mt-4 pt-3 sm:pt-4 border-t ${hasInvalidBudget ? 'border-red-200' : 'border-purple-200'}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs sm:text-sm ${hasInvalidBudget ? 'text-red-700' : 'text-purple-700'}`}>
                            Total Consumption:
                          </span>
                          <span className={`text-lg sm:text-xl font-bold ${
                            changeRequest.negotiable_margin_analysis.exceeds_60_percent
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}>
                            {changeRequest.negotiable_margin_analysis.consumption_percentage.toFixed(1)}%
                          </span>
                        </div>
                        {changeRequest.negotiable_margin_analysis.exceeds_60_percent && (
                          <p className="text-[10px] sm:text-xs text-red-600 mt-1 sm:mt-2 flex items-center gap-1">
                            <AlertCircle className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                            <span>Warning: Consumption exceeds 60% threshold</span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}


                {/* LPO Details Section - Collapsible */}
                {changeRequest.selected_vendor_name && (() => {
                  const role = (user?.role || user?.role_name || '').toLowerCase().replace(/[_\s]/g, '');
                  const canViewLPO = userIsTechnicalDirector || userIsBuyer ||
                    role.includes('technical') || role.includes('admin') || role.includes('buyer');
                  return canViewLPO;
                })() && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4 sm:mb-6 border border-gray-200">
                    {/* LPO Header */}
                    <div className="px-3 sm:px-4 py-3 bg-purple-50 border-b border-gray-200 flex items-center justify-between">
                      <button
                        onClick={handleViewLPO}
                        disabled={loadingLPO}
                        className="flex items-center gap-2 text-sm sm:text-base font-semibold text-purple-900 hover:text-purple-700 transition-colors disabled:opacity-50"
                      >
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>LPO Details</span>
                        {loadingLPO ? (
                          <ModernLoadingSpinners size="xs" className="ml-1" />
                        ) : (
                          <ChevronDown className={`w-4 h-4 transition-transform ${isLPOExpanded ? 'rotate-180' : ''}`} />
                        )}
                      </button>

                      {/* Edit LPO Button */}
                      {onEditLPO && (
                        <button
                          onClick={() => {
                            // Parent component handles modal close and opens LPO editor
                            onEditLPO();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span>Edit LPO</span>
                        </button>
                      )}
                    </div>

                    {/* LPO Content - Expanded */}
                    {isLPOExpanded && lpoData && (
                      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
                        {/* Company Info */}
                        <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                          <h4 className="font-semibold text-gray-800 mb-2 sm:mb-3 text-sm sm:text-base">Company Information</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <span className="text-gray-500">Company:</span>
                              <span className="ml-2 font-medium">{lpoData.company?.name || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Contact:</span>
                              <span className="ml-2 font-medium">{lpoData.company?.contact_person || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        {/* LPO Info */}
                        <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
                          <h4 className="font-semibold text-gray-800 mb-2 sm:mb-3 text-sm sm:text-base">LPO Information</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <span className="text-gray-500">LPO Number:</span>
                              <span className="ml-2 font-medium text-blue-700">{lpoData.lpo_info?.lpo_number || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">LPO Date:</span>
                              <span className="ml-2 font-medium">{lpoData.lpo_info?.lpo_date || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Quotation Ref:</span>
                              <span className="ml-2 font-medium">{lpoData.lpo_info?.quotation_ref || 'N/A'}</span>
                            </div>
                          </div>
                          {lpoData.lpo_info?.custom_message && (
                            <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-blue-200">
                              <span className="text-gray-500 text-xs sm:text-sm">Message:</span>
                              <p className="mt-1 text-xs sm:text-sm text-gray-700">{lpoData.lpo_info.custom_message}</p>
                            </div>
                          )}
                        </div>

                        {/* Vendor Info */}
                        <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                          <h4 className="font-semibold text-gray-800 mb-2 sm:mb-3 text-sm sm:text-base">Vendor Information</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <span className="text-gray-500">Vendor:</span>
                              <span className="ml-2 font-medium">{lpoData.vendor?.company_name || lpoData.vendor?.name || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Contact:</span>
                              <span className="ml-2 font-medium">{lpoData.vendor?.contact_person || lpoData.vendor?.address || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Phone:</span>
                              <span className="ml-2 font-medium">{lpoData.vendor?.phone || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Email:</span>
                              <span className="ml-2 font-medium">{lpoData.vendor?.email || 'N/A'}</span>
                            </div>
                          </div>
                          {lpoData.vendor?.project && (
                            <div className="mt-2 pt-2 border-t border-green-200">
                              <span className="text-gray-500 text-xs sm:text-sm">Project:</span>
                              <span className="ml-2 font-medium text-xs sm:text-sm">{lpoData.vendor.project}</span>
                            </div>
                          )}
                        </div>

                        {/* Items */}
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2 sm:mb-3 text-sm sm:text-base">Items</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs sm:text-sm border-collapse">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="px-2 sm:px-3 py-2 text-left border">#</th>
                                  <th className="px-2 sm:px-3 py-2 text-left border">Material</th>
                                  <th className="px-2 sm:px-3 py-2 text-left border">Brand</th>
                                  <th className="px-2 sm:px-3 py-2 text-left border">Specification</th>
                                  <th className="px-2 sm:px-3 py-2 text-right border">Qty</th>
                                  <th className="px-2 sm:px-3 py-2 text-center border">Unit</th>
                                  <th className="px-2 sm:px-3 py-2 text-right border">Rate</th>
                                  <th className="px-2 sm:px-3 py-2 text-right border">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lpoData.items?.map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-2 sm:px-3 py-2 border">{item.sl_no}</td>
                                    <td className="px-2 sm:px-3 py-2 border">{item.material_name || item.description}</td>
                                    <td className="px-2 sm:px-3 py-2 border">{item.brand || '-'}</td>
                                    <td className="px-2 sm:px-3 py-2 border">{item.specification || '-'}</td>
                                    <td className="px-2 sm:px-3 py-2 text-right border">{item.qty}</td>
                                    <td className="px-2 sm:px-3 py-2 text-center border">{item.unit}</td>
                                    <td className="px-2 sm:px-3 py-2 text-right border">{formatCurrency(item.rate)}</td>
                                    <td className="px-2 sm:px-3 py-2 text-right border font-medium">{formatCurrency(item.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Totals */}
                        <div className="p-3 sm:p-4 bg-purple-50 rounded-lg">
                          <h4 className="font-semibold text-gray-800 mb-2 sm:mb-3 text-sm sm:text-base">Totals</h4>
                          <div className="space-y-2 text-xs sm:text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Subtotal:</span>
                              <span className="font-medium">{formatCurrency(lpoData.totals?.subtotal || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">VAT ({lpoData.totals?.vat_percent || 5}%):</span>
                              <span className="font-medium">{formatCurrency(lpoData.totals?.vat_amount || 0)}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-purple-200">
                              <span className="font-semibold text-gray-800">Grand Total:</span>
                              <span className="font-bold text-purple-700 text-base sm:text-lg">{formatCurrency(lpoData.totals?.grand_total || 0)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Terms */}
                        {lpoData.terms && (
                          <div className="p-3 sm:p-4 bg-amber-50 rounded-lg">
                            <h4 className="font-semibold text-gray-800 mb-2 sm:mb-3 text-sm sm:text-base">Terms & Conditions</h4>
                            <div className="space-y-2 text-xs sm:text-sm">
                              {lpoData.terms.payment_terms && (
                                <div>
                                  <span className="text-gray-600">Payment Terms:</span>
                                  <span className="ml-2">{lpoData.terms.payment_terms}</span>
                                </div>
                              )}
                              {(lpoData.terms.delivery_terms || lpoData.terms.completion_terms) && (
                                <div>
                                  <span className="text-gray-600">Delivery Terms:</span>
                                  <span className="ml-2">{lpoData.terms.delivery_terms || lpoData.terms.completion_terms}</span>
                                </div>
                              )}
                              {lpoData.terms.custom_terms && lpoData.terms.custom_terms.length > 0 && (
                                <div className="mt-2">
                                  <span className="text-gray-600">Additional Terms:</span>
                                  <ul className="list-disc list-inside mt-1 text-gray-700">
                                    {lpoData.terms.custom_terms.filter((t: any) => t.selected).map((term: any, idx: number) => (
                                      <li key={idx}>{term.text}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Download Button */}
                        <div className="flex justify-end">
                          <button
                            onClick={handleDownloadLPO}
                            disabled={downloadingLPO}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-xs sm:text-sm font-medium"
                          >
                            {downloadingLPO ? (
                              <>
                                <ModernLoadingSpinners size="xxs" />
                                Downloading...
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                Download PDF
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Rejection Reason */}
                {changeRequest.status === 'rejected' && changeRequest.rejection_reason && (
                  <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 border-l-4 border-red-500 mb-4 sm:mb-6">
                    <p className="font-semibold text-red-900 text-xs sm:text-sm mb-1 sm:mb-2">Rejection Reason:</p>
                    <p className="text-xs sm:text-sm text-red-700 break-words">{changeRequest.rejection_reason}</p>
                    {changeRequest.approved_by_name && (
                      <p className="text-[10px] sm:text-xs text-red-600 mt-1 sm:mt-2">- {changeRequest.approved_by_name}</p>
                    )}
                  </div>
                )}

                {/* Approval Info */}
                {changeRequest.status === 'approved' && changeRequest.approved_by_name && (
                  <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 border-l-4 border-green-500">
                    <p className="font-semibold text-green-900 text-xs sm:text-sm">
                      Approved by {changeRequest.approved_by_name} on{' '}
                      {changeRequest.approval_date && new Date(changeRequest.approval_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer - Only show if can approve/reject */}
            {((!isFinalStatus && canApproveReject) || (isVendorApprovalPending && canApproveReject)) && (
              <div className="border-t border-gray-200 px-3 sm:px-6 py-3 sm:py-4 bg-gray-50 flex-shrink-0">
                <div className="max-w-7xl mx-auto flex items-center justify-end gap-2 sm:gap-4">
                  <button
                    onClick={onReject}
                    className="px-3 sm:px-6 py-2 sm:py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleApproveWithUpdatedPrices}
                    className="px-3 sm:px-6 py-2 sm:py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-1.5 sm:gap-2 text-sm"
                  >
                    <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5" />
                    <span className="hidden sm:inline">Approve Request</span>
                    <span className="sm:hidden">Approve</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Edit Change Request Modal */}
        {showEditModal && (
          <EditChangeRequestModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            changeRequest={changeRequest}
            onSuccess={() => {
              setShowEditModal(false);
              // Trigger parent refresh callback instead of full page reload
              onClose();
            }}
          />
        )}

        {/* BOQ Sub-Item Detail Modal - View specific sub-item scope in approved BOQ */}
        {showBOQModal && changeRequest?.boq_id && selectedSubItemForBOQ && (
          <BOQSubItemDetailModal
            isOpen={showBOQModal}
            onClose={() => {
              setShowBOQModal(false);
              setSelectedSubItemForBOQ(null);
              setSelectedMaterialForBOQ(null);
            }}
            boqId={changeRequest.boq_id}
            subItemName={selectedSubItemForBOQ}
            materialName={selectedMaterialForBOQ || undefined}
            boqName={changeRequest.boq_name || `BOQ #${changeRequest.boq_id}`}
            projectId={changeRequest.project_id}
            projectName={changeRequest.project_name}
            boqStatus={changeRequest.boq_status}
            pmAssigned={changeRequest.pm_assigned}
          />
        )}

        {/* Vendor Comparison Modal */}
        {showVendorComparisonModal && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vendor-comparison-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
            onClick={() => setShowVendorComparisonModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center" aria-hidden="true">
                    <GitCompare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 id="vendor-comparison-title" className="text-xl font-bold text-white">Competitor Vendors</h2>
                    <p className="text-sm text-blue-100">Vendors with matching materials</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVendorComparisonModal(false)}
                  aria-label="Close vendor comparison modal"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-white" aria-hidden="true" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                {loadingCompetitors ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <ModernLoadingSpinners size="lg" className="mb-4" />
                    <p className="text-gray-600">Loading competitor vendors...</p>
                  </div>
                ) : competitorVendors.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Competitors Found</h3>
                    <p className="text-gray-600">No other vendors have these materials in their catalog.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mb-4">
                      <p className="text-sm text-gray-600">
                        Found <span className="font-semibold text-gray-900">{competitorVendors.length}</span> competitor vendor{competitorVendors.length !== 1 ? 's' : ''} with matching materials
                      </p>
                    </div>

                    {competitorVendors.map((vendor) => {
                      // Find matching products using memoized Set for O(1) lookup
                      const matchingProducts = vendor.products?.filter(product =>
                        requestMaterialNamesSet.has((product.product_name || '').toLowerCase().trim())
                      ) || [];

                      // Calculate total for matching products using memoized map
                      const totalCost = matchingProducts.reduce((sum, product) => {
                        const materialKey = (product.product_name || '').toLowerCase().trim();
                        const materialInfo = materialQuantityMap.get(materialKey);
                        const quantity = materialInfo?.quantity || 0;
                        const price = product.unit_price || 0;
                        return sum + (quantity * price);
                      }, 0);

                      return (
                        <div key={vendor.vendor_id} className="bg-white border border-gray-300 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all">
                          {/* Vendor Header */}
                          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-5 border-b border-gray-200">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                  </div>
                                  <h3 className="text-lg font-bold text-gray-900 truncate">{vendor.company_name}</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                  {vendor.contact_person_name && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      <span className="truncate">{vendor.contact_person_name}</span>
                                    </div>
                                  )}
                                  {vendor.email && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                      </svg>
                                      <span className="truncate">{vendor.email}</span>
                                    </div>
                                  )}
                                  {vendor.phone && (
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                      </svg>
                                      <span>{vendor.phone_code} {vendor.phone}</span>
                                    </div>
                                  )}
                                  {vendor.category && (
                                    <div className="flex items-center gap-2">
                                      <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-md text-xs font-medium">
                                        {vendor.category}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-xs font-medium text-gray-500 mb-1">Estimated Total</div>
                                <div className="text-2xl font-bold text-blue-600">
                                  {formatCurrency(totalCost)}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {matchingProducts.length} material{matchingProducts.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Matching Products Table */}
                          <div className="overflow-x-auto bg-white">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Material</th>
                                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Unit</th>
                                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Quantity</th>
                                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Unit Price</th>
                                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {matchingProducts.map((product, idx) => {
                                  const materialKey = (product.product_name || '').toLowerCase().trim();
                                  const materialInfo = materialQuantityMap.get(materialKey);
                                  const quantity = materialInfo?.quantity || 0;
                                  const unitPrice = product.unit_price || 0;
                                  const total = quantity * unitPrice;

                                  return (
                                    <tr key={`${vendor.vendor_id}-${product.product_id}-${idx}`} className="hover:bg-blue-50 transition-colors">
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                          <span className="text-sm font-medium text-gray-900">{product.product_name}</span>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                          {product.unit || materialInfo?.unit || 'N/A'}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                        <span className="text-sm font-semibold text-gray-900">{quantity}</span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                        <span className="text-sm font-medium text-gray-700">
                                          {formatCurrency(unitPrice)}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                        <span className="text-sm font-bold text-blue-600">
                                          {formatCurrency(total)}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </>
    </AnimatePresence>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (582 lines)
export default React.memo(ChangeRequestDetailsModal);
