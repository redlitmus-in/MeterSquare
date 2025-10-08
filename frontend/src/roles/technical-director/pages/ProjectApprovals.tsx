import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  DocumentCheckIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  CalendarIcon,
  UserIcon,
  CurrencyDollarIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  UserPlusIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { tdService } from '@/roles/technical-director/services/tdService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import BOQHistoryTimeline from '@/roles/estimator/components/BOQHistoryTimeline';
import {
  exportBOQToExcelInternal,
  exportBOQToExcelClient,
  exportBOQToPDFInternal,
  exportBOQToPDFClient
} from '@/utils/boqExportUtils';

interface BOQItem {
  id: number;
  description: string;
  briefDescription?: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  materials: {
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  labour: {
    type: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  laborCost: number;
  estimatedSellingPrice: number;
}

interface EstimationItem {
  id: number;
  projectName: string;
  clientName: string;
  estimator: string;
  totalValue: number;
  itemCount: number;
  laborCost: number;
  materialCost: number;
  profitMargin: number;
  overheadPercentage: number;
  submittedDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'sent_for_confirmation' | 'client_confirmed';
  priority: 'high' | 'medium' | 'low';
  location: string;
  floor: string;
  workingHours: string;
  boqItems?: BOQItem[];
  approvalNotes?: string;
  rejectionReason?: string;
  emailSent?: boolean;
  projectId?: number;
  pmAssigned?: boolean;
}

const ProjectApprovals: React.FC = () => {
  const [selectedEstimation, setSelectedEstimation] = useState<EstimationItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'sent' | 'assigned' | 'rejected'>('pending');
  const [showBOQModal, setShowBOQModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [boqs, setBOQs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBOQDetails, setLoadingBOQDetails] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [downloadType, setDownloadType] = useState<'internal' | 'client'>('internal');
  const [showAssignPMModal, setShowAssignPMModal] = useState(false);
  const [assignMode, setAssignMode] = useState<'create' | 'existing'>('existing');
  const [allPMs, setAllPMs] = useState<any[]>([]);
  const [selectedPMId, setSelectedPMId] = useState<number | null>(null);
  const [newPMData, setNewPMData] = useState({ full_name: '', email: '', phone: '' });
  const [pmSearchQuery, setPmSearchQuery] = useState('');
  const [expandedPMId, setExpandedPMId] = useState<number | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showPMWorkloadView, setShowPMWorkloadView] = useState(false);
  const [showPMDetailsModal, setShowPMDetailsModal] = useState(false);
  const [selectedProjectPM, setSelectedProjectPM] = useState<any>(null);

  // Format currency for display
  const formatCurrency = (amount: number): string => {
    if (amount >= 100000) {
      return `${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toLocaleString();
  };

  // Load BOQs on mount and set up auto-refresh polling
  useEffect(() => {
    loadBOQs(); // Initial load with spinner
    loadPMs(); // Load PMs for assigned tab

    // Poll for new BOQs every 5 seconds (background refresh, no spinner)
    const intervalId = setInterval(() => {
      loadBOQs(false); // Auto-refresh without showing loading spinner
      loadPMs(); // Also refresh PM data
    }, 5000); // 5 seconds for faster updates

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  const loadBOQs = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) {
      setLoading(true);
    }
    try {
      const response = await tdService.getAllTDBOQs();
      if (response.success && response.data) {
        setBOQs(response.data);
      } else {
        console.error('Failed to load BOQs:', response.message);
        // Only show error toast on initial load, not during auto-refresh
        if (showLoadingSpinner) {
          toast.error(response.message || 'Failed to load BOQs');
        }
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      // Only show error toast on initial load, not during auto-refresh
      if (showLoadingSpinner) {
        toast.error('Failed to load BOQs');
      }
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
    }
  };

  const loadBOQDetails = async (boqId: number, listEstimation?: EstimationItem) => {
    setLoadingBOQDetails(true);
    try {
      // Preserve fields from list view that aren't in detail API
      const preservedFields = {
        clientName: listEstimation?.clientName || selectedEstimation?.clientName,
        location: listEstimation?.location || selectedEstimation?.location,
        floor: listEstimation?.floor || selectedEstimation?.floor,
        workingHours: listEstimation?.workingHours || selectedEstimation?.workingHours
      };

      const response = await estimatorService.getBOQById(boqId);
      if (response.success && response.data) {
        const estimation = transformBOQToEstimation(response.data);

        // Always preserve client from list view - detail API doesn't have it
        if (preservedFields.clientName) {
          estimation.clientName = preservedFields.clientName;
        }

        // Prefer location from list if available (it's more reliable)
        if (preservedFields.location && preservedFields.location !== 'N/A') {
          estimation.location = preservedFields.location;
        }

        // For fields that might come from detail API, prefer detail API if available
        if (!estimation.floor || estimation.floor === 'N/A') {
          estimation.floor = preservedFields.floor || estimation.floor;
        }
        if (!estimation.workingHours || estimation.workingHours === 'N/A') {
          estimation.workingHours = preservedFields.workingHours || estimation.workingHours;
        }

        setSelectedEstimation(estimation);
      } else {
        toast.error('Failed to load BOQ details');
      }
    } catch (error) {
      console.error('Error loading BOQ details:', error);
      toast.error('Failed to load BOQ details');
    } finally {
      setLoadingBOQDetails(false);
    }
  };


  // Transform BOQ data to match EstimationItem structure
  const transformBOQToEstimation = (boq: any): EstimationItem => {
    // Handle both list response (project_name, client) and detail response (project_details.project_name)
    const projectName = boq.project_name || boq.project_details?.project_name || boq.boq_name || 'Unnamed Project';
    const clientName = boq.client || boq.project_details?.client || boq.project?.client || 'Unknown Client';
    const status = mapBOQStatus(boq.status);

    // Use API-provided totals directly (these come from backend calculations)
    // IMPORTANT: Use selling_price (includes O&P), NOT total_cost (only base + overhead)
    const totalValue = boq.selling_price || boq.total_cost || 0;
    const laborCost = boq.total_labour_cost || 0;
    const materialCost = boq.total_material_cost || 0;
    const itemCount = boq.items_count || 0;

    return {
      id: boq.boq_id,
      projectName: projectName,
      clientName: clientName,
      estimator: boq.created_by || boq.created_by_name || 'Unknown',
      totalValue: totalValue,
      itemCount: itemCount,
      laborCost: laborCost,
      materialCost: materialCost,
      profitMargin: boq.profit_margin || boq.profit_margin_percentage || 0,
      overheadPercentage: boq.overhead_percentage || boq.overhead || 0,
      submittedDate: boq.created_at ? new Date(boq.created_at).toISOString().split('T')[0] : '',
      status: status,
      priority: 'medium',
      approvalNotes: status === 'approved' ? boq.notes : undefined,
      rejectionReason: status === 'rejected' ? boq.notes : undefined,
      location: boq.location || boq.project_details?.location || boq.project?.location || 'N/A',
      floor: boq.floor || boq.floor_name || boq.project_details?.floor || boq.project?.floor_name || 'N/A',
      workingHours: boq.hours || boq.working_hours || boq.project_details?.hours || boq.project?.working_hours || 'N/A',
      emailSent: boq.email_sent || false,
      projectId: boq.project_id,
      pmAssigned: !!boq.user_id, // Convert to boolean - user_id indicates PM is assigned to project
      // Support both old format (items) and new format (existing_purchase/new_purchase)
      existingItems: (boq.existing_purchase?.items || boq.items)?.map((item: any) => {
        const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
        const sellingPrice = item.selling_price || 0;
        const calculatedRate = totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice;

        return {
          id: item.master_item_id || item.item_id,
          description: item.item_name,
          briefDescription: item.description || '',
          unit: item.materials?.[0]?.unit || 'nos',
          quantity: totalQuantity,
          rate: calculatedRate,
          amount: sellingPrice,
          materials: item.materials?.map((mat: any) => ({
            name: mat.material_name,
            quantity: mat.quantity,
            unit: mat.unit,
            rate: mat.unit_price,
            amount: mat.total_price
          })) || [],
          labour: item.labour?.map((lab: any) => ({
            type: lab.labour_role,
            quantity: lab.hours,
            unit: 'hrs',
            rate: lab.rate_per_hour,
            amount: lab.total_cost
          })) || [],
          laborCost: item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
          estimatedSellingPrice: item.selling_price || 0,
          isNew: false // Mark as existing item
        };
      }) || [],
      newItems: boq.new_purchase?.items?.map((item: any) => {
        const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
        const sellingPrice = item.selling_price || 0;
        const calculatedRate = totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice;

        return {
          id: item.master_item_id || item.item_id,
          description: item.item_name,
          briefDescription: item.description || '',
          unit: item.materials?.[0]?.unit || 'nos',
          quantity: totalQuantity,
          rate: calculatedRate,
          amount: sellingPrice,
          materials: item.materials?.map((mat: any) => ({
            name: mat.material_name,
            quantity: mat.quantity,
            unit: mat.unit,
            rate: mat.unit_price,
            amount: mat.total_price
          })) || [],
          labour: item.labour?.map((lab: any) => ({
            type: lab.labour_role,
            quantity: lab.hours,
            unit: 'hrs',
            rate: lab.rate_per_hour,
            amount: lab.total_cost
          })) || [],
          laborCost: item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
          estimatedSellingPrice: item.selling_price || 0,
          isNew: true // Mark as new item
        };
      }) || [],
      // Keep boqItems for backward compatibility (combine existing + new)
      boqItems: [
        ...((boq.existing_purchase?.items || boq.items)?.map((item: any) => {
          const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
          const sellingPrice = item.selling_price || 0;
          const calculatedRate = totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice;

          return {
            id: item.item_id,
            description: item.item_name,
            briefDescription: item.description || '',
            unit: item.materials?.[0]?.unit || 'nos',
            quantity: totalQuantity,
            rate: calculatedRate,
            amount: sellingPrice,
            materials: item.materials?.map((mat: any) => ({
              name: mat.material_name,
              quantity: mat.quantity,
              unit: mat.unit,
              rate: mat.unit_price,
              amount: mat.total_price
            })) || [],
            labour: item.labour?.map((lab: any) => ({
              type: lab.labour_role,
              quantity: lab.hours,
              unit: 'hrs',
              rate: lab.rate_per_hour,
              amount: lab.total_cost
            })) || [],
            laborCost: item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
            estimatedSellingPrice: item.selling_price || 0,
            isNew: false
          };
        }) || []),
        ...(boq.new_purchase?.items?.map((item: any) => {
          const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
          const sellingPrice = item.selling_price || 0;
          const calculatedRate = totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice;

          return {
            id: item.item_id,
            description: item.item_name,
            briefDescription: item.description || '',
            unit: item.materials?.[0]?.unit || 'nos',
            quantity: totalQuantity,
            rate: calculatedRate,
            amount: sellingPrice,
            materials: item.materials?.map((mat: any) => ({
              name: mat.material_name,
              quantity: mat.quantity,
              unit: mat.unit,
              rate: mat.unit_price,
              amount: mat.total_price
            })) || [],
            labour: item.labour?.map((lab: any) => ({
              type: lab.labour_role,
              quantity: lab.hours,
              unit: 'hrs',
              rate: lab.rate_per_hour,
              amount: lab.total_cost
            })) || [],
            laborCost: item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
            estimatedSellingPrice: item.selling_price || 0,
            isNew: true
          };
        }) || [])
      ]
    };
  };

  // Map BOQ status to estimation status
  const mapBOQStatus = (status: string): 'pending' | 'approved' | 'rejected' | 'sent_for_confirmation' | 'client_confirmed' | 'client_rejected' | 'cancelled' => {
    if (!status) return 'pending';

    const normalizedStatus = status.toLowerCase().trim();

    // Check for approved status
    if (normalizedStatus === 'approved' || normalizedStatus === 'approve') {
      return 'approved';
    }

    // Check for rejected status
    if (normalizedStatus === 'rejected' || normalizedStatus === 'reject') {
      return 'rejected';
    }

    // Check for client confirmed (ready for PM assignment)
    if (normalizedStatus === 'client_confirmed') {
      return 'client_confirmed';
    }

    // Check for client rejected (wants changes)
    if (normalizedStatus === 'client_rejected') {
      return 'client_rejected';
    }

    // Check for cancelled (client doesn't want to proceed)
    if (normalizedStatus === 'client_cancelled') {
      return 'cancelled';
    }

    // Check for sent to client (waiting for client confirmation)
    if (normalizedStatus === 'sent_for_confirmation' || normalizedStatus === 'sent_to_client') {
      return 'sent_for_confirmation';
    }

    // All other statuses (draft, in_review, pending) -> pending
    return 'pending';
  };

  // Transform BOQs to estimations
  const estimations = boqs.map(transformBOQToEstimation);

  // Sort by submittedDate - most recent first
  const sortedEstimations = estimations.sort((a, b) => {
    const dateA = new Date(a.submittedDate || 0).getTime();
    const dateB = new Date(b.submittedDate || 0).getTime();
    return dateB - dateA; // Descending order (newest first)
  });

  const filteredEstimations = sortedEstimations.filter(est => {
    if (filterStatus === 'pending') {
      // Pending: Waiting for TD internal approval (status = pending, sent via email to TD)
      return est.status === 'pending' && !est.pmAssigned;
    } else if (filterStatus === 'approved') {
      // Approved: TD approved internally, includes both "approved" and "sent_for_confirmation" (waiting for client)
      return (est.status === 'approved' || est.status === 'sent_for_confirmation') && !est.pmAssigned;
    } else if (filterStatus === 'sent') {
      // Client Response: Shows both approved (client_confirmed) and rejected (client_rejected) by client
      return (est.status === 'client_confirmed' || est.status === 'client_rejected') && !est.pmAssigned;
    } else if (filterStatus === 'assigned') {
      // Assigned: PM has been assigned (can be after client confirms)
      return est.pmAssigned === true && est.status !== 'rejected' && est.status !== 'completed' && est.status !== 'cancelled';
    } else if (filterStatus === 'completed') {
      // Completed: Project is completed
      return est.status === 'completed';
    } else if (filterStatus === 'rejected') {
      // Rejected: TD rejected the BOQ
      return est.status === 'rejected';
    } else if (filterStatus === 'cancelled') {
      // Cancelled: Client doesn't want to proceed with business
      return est.status === 'cancelled';
    }
    return false;
  });

  const handleApproval = async (id: number, approved: boolean, notes?: string) => {
    try {
      if (approved) {
        // Close approval notes modal and show comparison modal for TD to review
        setShowApprovalModal(false);
        setShowComparisonModal(true);
      } else {
        if (!notes || !notes.trim()) {
          toast.error('Please provide a rejection reason');
          return;
        }
        const response = await tdService.rejectBOQ(id, notes);
        if (response.success) {
          toast.success('BOQ rejected successfully');
          setShowBOQModal(false); // Close BOQ details modal
          await loadBOQs(); // Reload data
        } else {
          toast.error(response.message || 'Failed to reject BOQ');
        }
      }
    } catch (error) {
      toast.error('An error occurred while processing the request');
    }
    setShowRejectionModal(false);
    setApprovalNotes('');
    setRejectionReason('');
  };

  // Final approval after TD reviews comparison
  const handleFinalApproval = async () => {
    if (!selectedEstimation || isApproving) return;

    setIsApproving(true);
    try {
      const response = await tdService.approveBOQ(selectedEstimation.id, approvalNotes);
      if (response.success) {
        toast.success('BOQ approved successfully');
        setShowComparisonModal(false); // Close comparison modal
        setShowBOQModal(false); // Close BOQ details modal
        setSelectedEstimation(null); // Clear selection
        setApprovalNotes(''); // Clear notes
        await loadBOQs(); // Reload data
      } else {
        toast.error(response.message || 'Failed to approve BOQ');
      }
    } catch (error) {
      console.error('Approval error:', error);
      toast.error('Failed to approve BOQ');
    } finally {
      setIsApproving(false);
    }
  };

  const handleDownload = async (format: 'excel' | 'pdf') => {
    if (!selectedEstimation) return;

    try {
      const isInternal = downloadType === 'internal';
      const formatName = format === 'excel' ? 'Excel' : 'PDF';
      const typeName = isInternal ? 'Internal' : 'Client';

      toast.loading(`Generating ${typeName} ${formatName} file...`);

      if (format === 'excel') {
        if (isInternal) {
          await exportBOQToExcelInternal(selectedEstimation);
        } else {
          await exportBOQToExcelClient(selectedEstimation);
        }
      } else {
        if (isInternal) {
          await exportBOQToPDFInternal(selectedEstimation);
        } else {
          await exportBOQToPDFClient(selectedEstimation);
        }
      }

      toast.dismiss();
      toast.success(`${typeName} BOQ downloaded successfully as ${formatName}`);
      setShowFormatModal(false);
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to download BOQ');
      console.error('Download error:', error);
    }
  };


  // Load PMs when assign modal opens
  useEffect(() => {
    if (showAssignPMModal) {
      loadPMs();
    }
  }, [showAssignPMModal]);

  const loadPMs = async () => {
    try {
      const response = await tdService.getPMsWithWorkload();
      if (response.success && response.data) {
        setAllPMs(response.data);
      }
    } catch (error) {
      console.error('Error loading PMs:', error);
      toast.error('Failed to load Project Managers');
    }
  };

  const handleAssignPM = async () => {
    if (!selectedEstimation || !selectedEstimation.projectId) {
      toast.error('No project selected');
      return;
    }

    try {
      if (assignMode === 'create') {
        // Validate new PM data
        if (!newPMData.full_name || !newPMData.email || !newPMData.phone) {
          toast.error('Please fill all PM details');
          return;
        }

        toast.loading('Creating Project Manager...');
        const response = await tdService.createPM({
          ...newPMData,
          project_ids: [selectedEstimation.projectId]
        });

        toast.dismiss();
        if (response.success) {
          toast.success('Project Manager created and assigned successfully');
          setShowAssignPMModal(false);
          setNewPMData({ full_name: '', email: '', phone: '' });
          await loadBOQs();
          // Reload the selected BOQ details to update the UI
          if (selectedEstimation) {
            await loadBOQDetails(selectedEstimation.id);
          }
        } else {
          toast.error(response.message);
        }
      } else {
        // Assign to existing PM
        if (!selectedPMId) {
          toast.error('Please select a Project Manager');
          return;
        }

        toast.loading('Assigning Project Manager...');
        const response = await tdService.assignProjectsToPM(selectedPMId, [selectedEstimation.projectId]);

        toast.dismiss();
        if (response.success) {
          toast.success('Project assigned to PM successfully');
          setShowAssignPMModal(false);
          setSelectedPMId(null);
          await loadBOQs();
          // Reload the selected BOQ details to update the UI
          if (selectedEstimation) {
            await loadBOQDetails(selectedEstimation.id);
          }
        } else {
          toast.error(response.message);
        }
      }
    } catch (error) {
      toast.dismiss();
      console.error('Assign PM error:', error);
      toast.error('Failed to assign Project Manager');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'rejected': return <XCircleIcon className="w-5 h-5 text-red-600" />;
      case 'cancelled': return <XCircleIcon className="w-5 h-5 text-red-600" />;
      case 'client_confirmed': return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'client_rejected': return <XCircleIcon className="w-5 h-5 text-orange-600" />;
      case 'sent_for_confirmation': return <ClockIcon className="w-5 h-5 text-blue-600" />;
      default: return <ClockIcon className="w-5 h-5 text-yellow-600" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <DocumentCheckIcon className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">Project Approvals</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Filter Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 mb-6 inline-flex gap-1">
          {[
            { key: 'pending', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'sent', label: 'Client Response' },
            { key: 'assigned', label: 'Assigned' },
            { key: 'completed', label: 'Completed' },
            { key: 'rejected', label: 'Rejected by TD' },
            { key: 'cancelled', label: 'Cancelled' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key as any)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                filterStatus === tab.key
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Estimations List - Always show */}
        {false ? (
          <div className="space-y-4">
            {allPMs.map((pm: any, index: number) => {
              const projectCount = pm.projectCount || 0;
              const isAvailable = projectCount === 0;
              const isBusy = projectCount >= 1 && projectCount <= 3;
              const isOverloaded = projectCount > 3;

              let statusColor = '';
              let statusText = '';
              let statusBg = '';
              let borderColor = '';

              if (isAvailable) {
                statusColor = 'text-green-700';
                statusText = 'Available';
                statusBg = 'bg-green-50';
                borderColor = 'border-green-200';
              } else if (isBusy) {
                statusColor = 'text-yellow-700';
                statusText = 'Busy';
                statusBg = 'bg-yellow-50';
                borderColor = 'border-yellow-200';
              } else {
                statusColor = 'text-red-700';
                statusText = 'Overloaded';
                statusBg = 'bg-red-50';
                borderColor = 'border-red-200';
              }

              return (
                <motion.div
                  key={pm.user_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className={`bg-white rounded-xl shadow-md border-2 ${borderColor} hover:shadow-xl transition-all`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <UserIcon className="w-8 h-8 text-[#243d8a] p-1.5 bg-blue-100 rounded-lg" />
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{pm.pm_name || pm.full_name}</h3>
                            <p className="text-sm text-gray-600">{pm.email}</p>
                          </div>
                          <span className={`ml-auto px-4 py-1.5 rounded-full text-sm font-semibold ${statusColor} ${statusBg} border-2 ${borderColor}`}>
                            {statusText}
                          </span>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-gray-600 mb-4">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-700">Phone:</span>
                            <span>{pm.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <BuildingOfficeIcon className="w-5 h-5 text-gray-500" />
                            <span className="font-bold text-lg text-[#243d8a]">{projectCount}</span>
                            <span className="text-gray-600">{projectCount === 1 ? 'project' : 'projects'} assigned</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-500">Workload</span>
                            <span className={`font-semibold ${statusColor}`}>
                              {projectCount === 0 ? '0%' : projectCount <= 3 ? `${Math.min(projectCount * 25, 75)}%` : '100%'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                isAvailable ? 'bg-green-500' : isBusy ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: projectCount === 0 ? '0%' : `${Math.min(projectCount * 20, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Assigned Projects List */}
                        {pm.projects && pm.projects.length > 0 && (
                          <div className={`mt-4 p-4 rounded-lg ${statusBg} border ${borderColor}`}>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                              <DocumentTextIcon className="w-4 h-4" />
                              Assigned Projects ({pm.projects.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {pm.projects.map((project: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="bg-white rounded-lg p-3 border border-gray-200 hover:border-[#243d8a] transition-colors"
                                >
                                  <div className="flex items-start gap-2">
                                    <BuildingOfficeIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {project.project_name}
                                      </p>
                                      <p className="text-xs text-gray-500">ID: {project.project_id}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {projectCount === 0 && (
                          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm text-green-700 flex items-center gap-2">
                              <CheckCircleIcon className="w-5 h-5" />
                              This PM is available and ready to take on new projects
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Estimations List */
          <div className="space-y-4">
            {filteredEstimations.map((estimation, index) => (
            <motion.div
              key={estimation.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              className="bg-white rounded-xl shadow-md border border-gray-100 hover:shadow-xl transition-all"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{estimation.projectName}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(estimation.priority)}`}>
                        {estimation.priority} priority
                      </span>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(estimation.status)}
                        <span className={`text-sm font-medium ${
                          estimation.status === 'cancelled' ? 'text-red-600' :
                          estimation.status === 'rejected' ? 'text-red-600' :
                          estimation.status === 'approved' ? 'text-green-600' :
                          estimation.status === 'client_confirmed' ? 'text-green-600' :
                          estimation.status === 'client_rejected' ? 'text-orange-600' :
                          'text-gray-600'
                        }`}>
                          {estimation.status === 'cancelled' ? 'CLIENT CANCELLED' :
                           estimation.status === 'client_confirmed' ? 'CLIENT CONFIRMED' :
                           estimation.status === 'client_rejected' ? 'CLIENT REJECTED' :
                           estimation.status === 'sent_for_confirmation' ? 'SENT TO CLIENT' :
                           estimation.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-1">
                        <BuildingOfficeIcon className="w-4 h-4" />
                        <span>{estimation.clientName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="w-4 h-4" />
                        <span>{estimation.submittedDate}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-4">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Total Value</p>
                        <p className="text-lg font-bold text-gray-900">AED{formatCurrency(estimation.totalValue)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Items</p>
                        <p className="text-lg font-bold text-blue-900">{estimation.itemCount}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Labor Cost</p>
                        <p className="text-lg font-bold text-green-900">AED{formatCurrency(estimation.laborCost)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Material Cost</p>
                        <p className="text-lg font-bold text-purple-900">AED{formatCurrency(estimation.materialCost)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">O&P Margin</p>
                        <p className="text-lg font-bold text-orange-900">{estimation.overheadPercentage + estimation.profitMargin}%</p>
                        <p className="text-[10px] text-orange-700">OH: {estimation.overheadPercentage}% | P: {estimation.profitMargin}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={async () => {
                        // Store reference to current estimation BEFORE any state changes
                        const currentEstimation = estimation;
                        // Load full details with preserved client
                        await loadBOQDetails(currentEstimation.id, currentEstimation);
                        setShowBOQModal(true);
                      }}
                      className="p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
                      title="View BOQ Details"
                    >
                      <EyeIcon className="w-5 h-5 text-blue-600 group-hover:text-blue-700" />
                    </button>

                    {/* Show PM Details button - Only show when PM is assigned */}
                    {estimation.pmAssigned && (
                      <button
                        onClick={async () => {
                          // Load PM data if not already loaded
                          if (allPMs.length === 0) {
                            await loadPMs();
                          }

                          // Find PM details for this project
                          const pmForProject = allPMs.find(pm =>
                            pm.projects?.some((p: any) => p.project_id === estimation.projectId)
                          );

                          if (pmForProject) {
                            setSelectedProjectPM(pmForProject);
                            setShowPMDetailsModal(true);
                          } else {
                            // Try loading PMs again and retry
                            await loadPMs();
                            const retryPM = allPMs.find(pm =>
                              pm.projects?.some((p: any) => p.project_id === estimation.projectId)
                            );
                            if (retryPM) {
                              setSelectedProjectPM(retryPM);
                              setShowPMDetailsModal(true);
                            } else {
                              toast.error('PM details not found. Please refresh the page.');
                            }
                          }
                        }}
                        className="p-2.5 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group"
                        title="View Assigned PM Details"
                      >
                        <UserIcon className="w-5 h-5 text-green-600 group-hover:text-green-700" />
                      </button>
                    )}

                    {/* Assign PM button - Only show when client has confirmed */}
                    {estimation.status === 'client_confirmed' && !estimation.pmAssigned && (
                      <button
                        onClick={() => {
                          setSelectedEstimation(estimation);
                          setShowAssignPMModal(true);
                        }}
                        className="px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-[#243d8a] text-sm font-medium flex items-center gap-1.5 group"
                        title="Assign Project Manager"
                      >
                        <UserPlusIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        Assign PM
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          </div>
        )}

        {!showPMWorkloadView && filteredEstimations.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No estimations found for the selected filter</p>
          </div>
        )}

        {/* Approval Modal */}
        {showApprovalModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-lg w-full"
            >
              <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
                <h2 className="text-xl font-bold text-green-900">Approve BOQ - {selectedEstimation.projectName}</h2>
                <p className="text-sm text-green-700 mt-1">Confirm approval for estimator to send to client</p>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Approval Notes (Optional)
                  </label>
                  <textarea
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={3}
                    placeholder="Add any conditions, notes, or requirements for this approval..."
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">Project Summary:</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Total Value:</span>
                      <span className="font-semibold ml-1">AED{formatCurrency(
                        selectedEstimation.materialCost +
                        selectedEstimation.laborCost +
                        ((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.overheadPercentage / 100) +
                        ((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.profitMargin / 100)
                      )}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Profit Margin:</span>
                      <span className="font-semibold ml-1">{selectedEstimation.profitMargin}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Overhead:</span>
                      <span className="font-semibold ml-1">{selectedEstimation.overheadPercentage}%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowApprovalModal(false);
                      setApprovalNotes('');
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleApproval(selectedEstimation.id, true, approvalNotes)}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <CheckCircleIcon className="w-5 h-5" />
                    Approve Project
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Rejection Modal */}
        {showRejectionModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-lg w-full"
            >
              <div className="bg-gradient-to-r from-red-50 to-red-100 px-6 py-4 border-b border-red-200">
                <h2 className="text-xl font-bold text-red-900">Reject Project</h2>
                <p className="text-sm text-red-700 mt-1">{selectedEstimation.projectName}</p>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={4}
                    placeholder="Please provide a reason for rejection..."
                    required
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> The rejection reason will be sent to the estimator for review and corrections.
                  </p>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowRejectionModal(false);
                      setRejectionReason('');
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (rejectionReason.trim()) {
                        handleApproval(selectedEstimation.id, false, rejectionReason);
                      } else {
                        toast.error('Please provide a rejection reason');
                      }
                    }}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <XCircleIcon className="w-5 h-5" />
                    Reject Project
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* BOQ Details Modal */}
        {showBOQModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-6xl w-full max-h-[90vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-blue-900">BOQ Details - {selectedEstimation.projectName}</h2>
                    <p className="text-sm text-blue-700">{selectedEstimation.clientName} • {selectedEstimation.location} • {selectedEstimation.floor}</p>
                    <p className="text-xs text-blue-600 mt-1">Working Hours: {selectedEstimation.workingHours}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Download - Only show after TD approves (status approved or later) */}
                    {(selectedEstimation.status === 'approved' ||
                      selectedEstimation.status === 'sent_for_confirmation' ||
                      selectedEstimation.status === 'client_confirmed' ||
                      selectedEstimation.pmAssigned) && (
                      <button
                        onClick={() => setShowFormatModal(true)}
                        className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                        title="Download BOQ"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        Download
                      </button>
                    )}

                    {/* Assign PM - Only after client confirmed and PM not yet assigned */}
                    {selectedEstimation.status === 'client_confirmed' && !selectedEstimation.pmAssigned && (
                      <button
                        onClick={() => {
                          setShowAssignPMModal(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200 rounded-lg font-medium text-sm transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                        title="Assign Project Manager to this project"
                      >
                        <UserPlusIcon className="w-4 h-4" />
                        Assign PM
                      </button>
                    )}
                    <button
                      onClick={() => setShowHistoryModal(true)}
                      className="px-3 py-1.5 bg-white/70 hover:bg-white text-blue-700 rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                    >
                      <ClockIcon className="w-4 h-4" />
                      History
                    </button>
                    <button
                      onClick={() => setShowBOQModal(false)}
                      className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="w-6 h-6 text-blue-900" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {loadingBOQDetails ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners variant="pulse-wave" />
                  </div>
                ) : (
                  <>
                    {/* Existing BOQ Items */}
                    {selectedEstimation.existingItems && selectedEstimation.existingItems.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-gray-900">Existing BOQ Items</h3>
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                            {selectedEstimation.existingItems.length} Items
                          </span>
                        </div>
                        <div className="space-y-4">
                          {selectedEstimation.existingItems.map((item, index) => (
                            <div key={item.id} className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-900">
                              {item.description}
                            </h4>
                            {item.briefDescription && (
                              <p className="text-sm text-gray-600 mt-1">{item.briefDescription}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                              <span>Qty: {item.quantity} {item.unit}</span>
                              <span>Rate: AED{item.rate}/{item.unit}</span>
                            </div>
                          </div>
                        </div>

                        {/* Materials Breakdown */}
                        <div className="bg-blue-50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-semibold text-blue-900 mb-2">+ Raw Materials</p>
                          <div className="space-y-1">
                            {item.materials.map((material, mIndex) => (
                              <div key={mIndex} className="flex items-center justify-between text-sm">
                                <span className="text-gray-700">
                                  {material.name} ({material.quantity} {material.unit})
                                </span>
                                <span className="font-medium text-gray-900">
                                  Est. Cost: AED{material.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-blue-200 mt-2 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span className="text-blue-900">Total Materials:</span>
                              <span className="text-blue-900">AED{item.materials.reduce((sum, m) => sum + m.amount, 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Labour Breakdown */}
                        <div className="bg-green-50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-semibold text-green-900 mb-2">+ Labour</p>
                          <div className="space-y-1">
                            {item.labour && item.labour.map((labor, lIndex) => (
                              <div key={lIndex} className="flex items-center justify-between text-sm">
                                <span className="text-gray-700">
                                  {labor.type} ({labor.quantity} {labor.unit})
                                </span>
                                <span className="font-medium text-gray-900">
                                  Est. Cost: AED{labor.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-green-200 mt-2 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span className="text-green-900">Total Labour:</span>
                              <span className="text-green-900">AED{item.laborCost.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Overhead & Profit */}
                        <div className="bg-orange-50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-semibold text-orange-900 mb-2">+ Overheads & Profit</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-700">Overhead ({selectedEstimation.overheadPercentage}%)</span>
                              <span className="text-gray-900">AED{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * selectedEstimation.overheadPercentage / 100).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-700">Profit Margin ({selectedEstimation.profitMargin}%)</span>
                              <span className="text-gray-900">AED{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * selectedEstimation.profitMargin / 100).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Estimated Selling Price */}
                        <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900">Estimated Selling Price:</span>
                            <span className="text-xl font-bold text-green-900">AED{item.estimatedSellingPrice.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* New Purchase Items */}
                    {selectedEstimation.newItems && selectedEstimation.newItems.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-gray-900">New Purchase Items</h3>
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                            {selectedEstimation.newItems.length} Items
                          </span>
                        </div>
                        <div className="space-y-4">
                          {selectedEstimation.newItems.map((item, index) => (
                            <div key={item.id} className="border border-purple-200 rounded-xl p-4 bg-purple-50/30 hover:shadow-md transition-all">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-gray-900">
                                      {item.description}
                                    </h4>
                                    <span className="px-2 py-0.5 text-xs bg-purple-200 text-purple-800 rounded font-semibold">NEW</span>
                                  </div>
                                  {item.briefDescription && (
                                    <p className="text-sm text-gray-600 mt-1">{item.briefDescription}</p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                                    <span>Qty: {item.quantity} {item.unit}</span>
                                    <span>Rate: AED{item.rate}/{item.unit}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Materials Breakdown - Purple Theme */}
                              <div className="bg-purple-50 rounded-lg p-3 mb-3 border border-purple-200">
                                <p className="text-sm font-semibold text-purple-900 mb-2">+ Raw Materials</p>
                                <div className="space-y-1">
                                  {item.materials.map((material, mIndex) => (
                                    <div key={mIndex} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700">
                                        {material.name} ({material.quantity} {material.unit})
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        Est. Cost: AED{material.amount.toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="border-t border-purple-200 mt-2 pt-2">
                                  <div className="flex justify-between text-sm font-semibold">
                                    <span className="text-purple-900">Total Materials:</span>
                                    <span className="text-purple-900">AED{item.materials.reduce((sum, m) => sum + m.amount, 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Labour Breakdown */}
                              <div className="bg-green-50 rounded-lg p-3 mb-3">
                                <p className="text-sm font-semibold text-green-900 mb-2">+ Labour</p>
                                <div className="space-y-1">
                                  {item.labour && item.labour.map((labor, lIndex) => (
                                    <div key={lIndex} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-700">
                                        {labor.type} ({labor.quantity} {labor.unit})
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        Est. Cost: AED{labor.amount.toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="border-t border-green-200 mt-2 pt-2">
                                  <div className="flex justify-between text-sm font-semibold">
                                    <span className="text-green-900">Total Labour:</span>
                                    <span className="text-green-900">AED{item.laborCost.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Overheads & Profit */}
                              <div className="bg-yellow-50 rounded-lg p-3 mb-3">
                                <p className="text-sm font-semibold text-gray-900 mb-2">+ Overheads & Profit</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Overhead ({selectedEstimation.overheadPercentage}%)</span>
                                    <span className="text-gray-900">AED{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * selectedEstimation.overheadPercentage / 100).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Profit Margin ({selectedEstimation.profitMargin}%)</span>
                                    <span className="text-gray-900">AED{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * selectedEstimation.profitMargin / 100).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Estimated Selling Price */}
                              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-gray-900">Estimated Selling Price:</span>
                                  <span className="text-xl font-bold text-green-900">AED{item.estimatedSellingPrice.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fallback: No items message */}
                    {(!selectedEstimation.existingItems || selectedEstimation.existingItems.length === 0) &&
                     (!selectedEstimation.newItems || selectedEstimation.newItems.length === 0) && (
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500">No BOQ items available</p>
                      </div>
                    )}
                  </>
                )}

                {/* Cost Summary */}
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                  <h4 className="font-bold text-gray-900 mb-3">Cost Summary</h4>
                  <div className="space-y-2">
                    {(() => {
                      // Calculate totals from items if available
                      const totalMaterialCost = selectedEstimation.boqItems?.reduce((sum, item) =>
                        sum + item.materials.reduce((matSum, m) => matSum + m.amount, 0), 0
                      ) || selectedEstimation.materialCost || 0;

                      const totalLaborCost = selectedEstimation.boqItems?.reduce((sum, item) =>
                        sum + item.laborCost, 0
                      ) || selectedEstimation.laborCost || 0;

                      // Use the actual grand total from API, or sum of all item selling prices
                      // This is correct because items may have varying overhead/profit percentages
                      const grandTotal = selectedEstimation.totalValue ||
                        selectedEstimation.boqItems?.reduce((sum, item) => sum + (item.estimatedSellingPrice || 0), 0) || 0;

                      const baseCost = totalMaterialCost + totalLaborCost;
                      const overheadAmount = baseCost * selectedEstimation.overheadPercentage / 100;
                      const profitAmount = baseCost * selectedEstimation.profitMargin / 100;

                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Material Cost:</span>
                            <span className="font-semibold">AED{totalMaterialCost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Labor Cost:</span>
                            <span className="font-semibold">AED{totalLaborCost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Overhead ({selectedEstimation.overheadPercentage}%):</span>
                            <span className="font-semibold">AED{overheadAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Profit ({selectedEstimation.profitMargin}%):</span>
                            <span className="font-semibold">AED{profitAmount.toLocaleString()}</span>
                          </div>
                          <div className="border-t border-blue-300 pt-2 mt-2">
                            <div className="flex justify-between">
                              <span className="font-bold text-gray-900">Grand Total:</span>
                              <span className="font-bold text-lg text-green-600">
                                AED{grandTotal.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Status Messages - Inside Scrollable Area */}
                {selectedEstimation.status === 'approved' && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircleIcon className="w-6 h-6" />
                      <span className="font-semibold">This BOQ has been approved</span>
                    </div>
                    {selectedEstimation.approvalNotes && (
                      <p className="text-sm text-green-600 mt-2">Notes: {selectedEstimation.approvalNotes}</p>
                    )}
                  </div>
                )}

                {selectedEstimation.status === 'rejected' && (
                  <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-center gap-2 text-red-700">
                      <XCircleIcon className="w-6 h-6" />
                      <span className="font-semibold">This BOQ has been rejected</span>
                    </div>
                    {selectedEstimation.rejectionReason && (
                      <p className="text-sm text-red-600 mt-2">Reason: {selectedEstimation.rejectionReason}</p>
                    )}
                  </div>
                )}

              </div>

              {/* Footer with Approve/Reject Buttons */}
              <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-200">
                {/* Approve/Reject Buttons - Only for pending BOQs */}
                {selectedEstimation.status === 'pending' && (
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">Internal Approval:</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShowRejectionModal(true)}
                          className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                        >
                          <XCircleIcon className="w-5 h-5" />
                          Reject
                        </button>
                        <button
                          onClick={() => setShowApprovalModal(true)}
                          className="px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                        >
                          <CheckCircleIcon className="w-5 h-5" />
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Info - Only for approved BOQs (before sent to client) */}
                {selectedEstimation.status === 'approved' && (
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-green-600">✓ Internally Approved</span>
                      <p className="text-xs text-gray-500 mt-0.5">Waiting for Estimator to send to client</p>
                    </div>
                  </div>
                )}

                {/* Footer Info */}
                <div className="px-6 py-3">
                  <div className="text-sm text-gray-600">
                    Submitted by: <span className="font-semibold">{selectedEstimation.estimator}</span> on {selectedEstimation.submittedDate}
                    {selectedEstimation.emailSent && (
                      <span className="ml-4 text-green-600">
                        <CheckCircleIcon className="w-4 h-4 inline mr-1" />
                        Sent to Client
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Download Format Selection Modal */}
        {showFormatModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-md w-full"
            >
              <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
                <h2 className="text-xl font-bold text-green-900">Download BOQ</h2>
                <p className="text-sm text-green-700 mt-1">{selectedEstimation.projectName}</p>
              </div>

              <div className="p-6">
                {/* Comparison Tip */}
                {selectedEstimation.status === 'pending' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-blue-800 font-medium">Comparison Tip</p>
                        <p className="text-xs text-blue-700 mt-1">
                          Download both versions to compare what's visible internally vs what the client will see after estimator sends it.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Version Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Version:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="downloadType"
                        value="internal"
                        checked={downloadType === 'internal'}
                        onChange={() => setDownloadType('internal')}
                        className="w-4 h-4 text-green-600"
                      />
                      <div className="ml-3 flex-1">
                        <span className="font-semibold text-gray-900">Internal Version</span>
                        <p className="text-xs text-gray-600">With overhead & profit margins (complete breakdown)</p>
                      </div>
                    </label>
                    <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="downloadType"
                        value="client"
                        checked={downloadType === 'client'}
                        onChange={() => setDownloadType('client')}
                        className="w-4 h-4 text-purple-600"
                      />
                      <div className="ml-3 flex-1">
                        <span className="font-semibold text-gray-900">Client Version</span>
                        <p className="text-xs text-gray-600">Without overhead & profit (client-friendly)</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Format Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Format:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleDownload('excel')}
                      className="p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 hover:border-green-400 transition-all group"
                    >
                      <div className="text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-lg mx-auto mb-2 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="font-semibold text-gray-900">Excel</span>
                        <p className="text-xs text-gray-600 mt-1">Multiple sheets with details</p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDownload('pdf')}
                      className="p-4 border-2 border-red-200 rounded-lg hover:bg-red-50 hover:border-red-400 transition-all group"
                    >
                      <div className="text-center">
                        <div className="w-12 h-12 bg-red-100 rounded-lg mx-auto mb-2 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="font-semibold text-gray-900">PDF</span>
                        <p className="text-xs text-gray-600 mt-1">Professional document</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => setShowFormatModal(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* PM Assignment Modal - Modern Design */}
        {showAssignPMModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="bg-[#243d8a] px-6 py-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <UserPlusIcon className="w-6 h-6" />
                      Assign Project Manager
                    </h2>
                    <p className="text-blue-100 text-sm">{selectedEstimation.projectName}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAssignPMModal(false);
                      setSelectedPMId(null);
                      setNewPMData({ full_name: '', email: '', phone: '' });
                      setAssignMode('existing');
                    }}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1.5 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                {/* Mode Selection - Modern Tab Style */}
                <div className="bg-gray-100 rounded-lg p-1 mb-3 inline-flex w-full">
                  <button
                    onClick={() => setAssignMode('existing')}
                    className={`flex-1 py-2 px-4 rounded-md font-semibold text-sm transition-all duration-200 ${
                      assignMode === 'existing'
                        ? 'bg-white text-[#243d8a] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <UserIcon className="w-4 h-4 inline mr-1.5" />
                    Select Existing PM
                  </button>
                  <button
                    onClick={() => setAssignMode('create')}
                    className={`flex-1 py-2 px-4 rounded-md font-semibold text-sm transition-all duration-200 ${
                      assignMode === 'create'
                        ? 'bg-white text-[#243d8a] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <UserPlusIcon className="w-4 h-4 inline mr-1.5" />
                    Create New PM
                  </button>
                </div>

                {/* Existing PM Selection */}
                {assignMode === 'existing' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-semibold text-gray-700">
                        Select Project Manager <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Search PM..."
                        value={pmSearchQuery}
                        onChange={(e) => setPmSearchQuery(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#243d8a] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-3">
                      {allPMs
                        .filter(pm =>
                          pmSearchQuery === '' ||
                          (pm.pm_name || pm.full_name)?.toLowerCase().includes(pmSearchQuery.toLowerCase()) ||
                          pm.email?.toLowerCase().includes(pmSearchQuery.toLowerCase())
                        )
                        .map((pm: any) => {
                          const isSelected = selectedPMId === pm.user_id;
                          const projectCount = pm.projectCount || 0;
                          const isAvailable = projectCount === 0;
                          const isBusy = projectCount >= 1 && projectCount <= 3;
                          const isOverloaded = projectCount > 3;

                          let statusColor = '';
                          let statusText = '';
                          let statusBg = '';

                          if (isAvailable) {
                            statusColor = 'text-green-700';
                            statusText = 'Available';
                            statusBg = 'bg-green-50 border-green-200';
                          } else if (isBusy) {
                            statusColor = 'text-yellow-700';
                            statusText = 'Busy';
                            statusBg = 'bg-yellow-50 border-yellow-200';
                          } else {
                            statusColor = 'text-red-700';
                            statusText = 'Overloaded';
                            statusBg = 'bg-red-50 border-red-200';
                          }

                          return (
                            <div key={pm.user_id}>
                              <div
                                onClick={() => setSelectedPMId(pm.user_id)}
                                className={`border rounded-md px-3 py-1.5 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-[#243d8a] bg-blue-50 shadow-sm'
                                    : `border-gray-200 hover:border-gray-300 hover:shadow-sm ${statusBg}`
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-gray-900 text-sm">{pm.pm_name || pm.full_name}</h4>
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor} ${statusBg} border whitespace-nowrap`}>
                                        {statusText}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-600 flex-shrink-0">
                                    <span className="max-w-[200px] truncate">{pm.email}</span>
                                    <span className="whitespace-nowrap">{pm.phone}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                      <BuildingOfficeIcon className="w-4 h-4 text-gray-400" />
                                      <span className="font-medium text-gray-700 text-sm">{projectCount}</span>
                                      <span className="text-gray-500 text-xs">{projectCount === 1 ? 'project' : 'projects'}</span>
                                    </div>
                                    {projectCount > 0 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedPMId(expandedPMId === pm.user_id ? null : pm.user_id);
                                        }}
                                        className="text-xs text-[#243d8a] hover:underline font-medium whitespace-nowrap"
                                      >
                                        {expandedPMId === pm.user_id ? 'Hide' : 'View'}
                                      </button>
                                    )}
                                    {isSelected && (
                                      <CheckCircleIcon className="w-5 h-5 text-[#243d8a] flex-shrink-0" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {expandedPMId === pm.user_id && pm.projects && pm.projects.length > 0 && (
                                <div className="ml-4 mt-1 mb-2 p-2 bg-gray-50 rounded border-l-2 border-gray-300">
                                  <p className="text-xs font-semibold text-gray-600 mb-1">Assigned Projects:</p>
                                  <ul className="space-y-0.5">
                                    {pm.projects.map((project: any, idx: number) => (
                                      <li key={idx} className="text-xs text-gray-700 flex items-start gap-1">
                                        <span className="text-gray-400">•</span>
                                        <span>{project.project_name}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {allPMs.length === 0 && (
                      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-sm text-amber-800 flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5" />
                          No Project Managers available. Create a new one.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Create New PM Form */}
                {assignMode === 'create' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-5"
                  >
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newPMData.full_name}
                        onChange={(e) => setNewPMData({ ...newPMData, full_name: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#243d8a] focus:ring-4 focus:ring-blue-100 transition-all"
                        placeholder="Enter full name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={newPMData.email}
                        onChange={(e) => setNewPMData({ ...newPMData, email: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#243d8a] focus:ring-4 focus:ring-blue-100 transition-all"
                        placeholder="john.doe@company.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={newPMData.phone}
                        onChange={(e) => setNewPMData({ ...newPMData, phone: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#243d8a] focus:ring-4 focus:ring-blue-100 transition-all"
                        placeholder="+971 50 123 4567"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Info Note */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-[#243d8a] rounded-lg p-5 mt-8">
                  <div className="flex gap-3">
                    <BuildingOfficeIcon className="w-6 h-6 text-[#243d8a] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[#243d8a] mb-1">Project Assignment</p>
                      <p className="text-sm text-gray-700">
                        The assigned Project Manager will gain full access to manage this project, including site engineers and procurement.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-4 mt-8 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowAssignPMModal(false);
                      setSelectedPMId(null);
                      setNewPMData({ full_name: '', email: '', phone: '' });
                      setAssignMode('existing');
                    }}
                    className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssignPM}
                    className="flex-1 px-6 py-3 bg-[#243d8a] hover:bg-[#1a2d66] text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    <UserPlusIcon className="w-5 h-5" />
                    {assignMode === 'create' ? 'Create & Assign' : 'Assign to Project'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* BOQ Comparison Modal - Internal vs Client */}
        {showComparisonModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">BOQ Comparison - {selectedEstimation.projectName}</h2>
                    <p className="text-sm text-gray-600 mt-1">Compare what TD sees vs what Client will receive</p>
                  </div>
                  <button
                    onClick={() => setShowComparisonModal(false)}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6 text-gray-700" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-0 overflow-y-auto max-h-[calc(90vh-200px)]">
                {/* Internal Version (Left) */}
                <div className="p-6 bg-orange-50/30 border-r-2 border-orange-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="px-3 py-1 bg-orange-100 border border-orange-300 rounded-lg">
                      <span className="text-sm font-bold text-orange-800">INTERNAL VERSION</span>
                    </div>
                    <span className="text-xs text-gray-600">(What TD sees)</span>
                  </div>

                  {/* Cost Summary - Internal */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                    <h3 className="font-bold text-gray-900 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Material Cost:</span>
                        <span className="font-semibold">AED{formatCurrency(selectedEstimation.materialCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Labour Cost:</span>
                        <span className="font-semibold">AED{formatCurrency(selectedEstimation.laborCost)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600">Base Cost:</span>
                        <span className="font-semibold">AED{formatCurrency(selectedEstimation.materialCost + selectedEstimation.laborCost)}</span>
                      </div>
                      <div className="flex justify-between bg-orange-50 p-2 rounded">
                        <span className="text-orange-800 font-medium">Overhead ({selectedEstimation.overheadPercentage}%):</span>
                        <span className="font-bold text-orange-800">AED{formatCurrency((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.overheadPercentage / 100)}</span>
                      </div>
                      <div className="flex justify-between bg-orange-50 p-2 rounded">
                        <span className="text-orange-800 font-medium">Profit ({selectedEstimation.profitMargin}%):</span>
                        <span className="font-bold text-orange-800">AED{formatCurrency((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.profitMargin / 100)}</span>
                      </div>
                      <div className="flex justify-between pt-3 border-t-2 border-orange-300 mt-2">
                        <span className="text-lg font-bold text-gray-900">Total:</span>
                        <span className="text-lg font-bold text-green-600">AED{formatCurrency(
                          selectedEstimation.materialCost +
                          selectedEstimation.laborCost +
                          ((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.overheadPercentage / 100) +
                          ((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.profitMargin / 100)
                        )}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Client Version (Right) */}
                <div className="p-6 bg-blue-50/30">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="px-3 py-1 bg-blue-100 border border-blue-300 rounded-lg">
                      <span className="text-sm font-bold text-blue-800">CLIENT VERSION</span>
                    </div>
                    <span className="text-xs text-gray-600">(What Client sees)</span>
                  </div>

                  {/* Cost Summary - Client */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                    <h3 className="font-bold text-gray-900 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      {(() => {
                        const baseCost = selectedEstimation.materialCost + selectedEstimation.laborCost;
                        const overheadAmount = baseCost * selectedEstimation.overheadPercentage / 100;
                        const profitAmount = baseCost * selectedEstimation.profitMargin / 100;
                        const totalMarkup = overheadAmount + profitAmount;
                        const sellingPrice = baseCost + totalMarkup;

                        // Distribute markup proportionally to materials and labor
                        const materialRatio = selectedEstimation.materialCost / baseCost;
                        const laborRatio = selectedEstimation.laborCost / baseCost;
                        const materialMarkupShare = totalMarkup * materialRatio;
                        const laborMarkupShare = totalMarkup * laborRatio;
                        const adjustedMaterialCost = selectedEstimation.materialCost + materialMarkupShare;
                        const adjustedLaborCost = selectedEstimation.laborCost + laborMarkupShare;

                        return (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Material Cost:</span>
                              <span className="font-semibold">AED{formatCurrency(adjustedMaterialCost)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Labour Cost:</span>
                              <span className="font-semibold">AED{formatCurrency(adjustedLaborCost)}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t">
                              <span className="text-gray-600">Base Cost:</span>
                              <span className="font-semibold">AED{formatCurrency(sellingPrice)}</span>
                            </div>
                            <div className="flex justify-between bg-gray-100 p-2 rounded opacity-40">
                              <span className="text-gray-500 line-through">Overhead & Profit:</span>
                              <span className="text-gray-500 line-through">Hidden from client</span>
                            </div>
                            <div className="flex justify-between pt-3 border-t-2 border-blue-300 mt-2">
                              <span className="text-lg font-bold text-gray-900">Total:</span>
                              <span className="text-lg font-bold text-green-600">AED{formatCurrency(sellingPrice)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <strong>Key Difference:</strong> Internal version shows overhead & profit breakdown, Client version shows final price only
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setShowComparisonModal(false);
                        setApprovalNotes('');
                      }}
                      disabled={isApproving}
                      className={`px-6 py-2.5 ${isApproving ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-500 hover:bg-gray-600'} text-white rounded-lg font-medium transition-colors`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleFinalApproval}
                      disabled={isApproving}
                      className={`px-6 py-2.5 ${isApproving ? 'bg-green-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg font-medium transition-colors flex items-center gap-2`}
                    >
                      {isApproving ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="w-5 h-5" />
                          Approve
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* PM Details Modal - Show assigned PM details for a project */}
        {showPMDetailsModal && selectedProjectPM && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
            >
              {/* Header */}
              <div className="bg-[#243d8a] px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserIcon className="w-8 h-8 text-white p-1.5 bg-white bg-opacity-20 rounded-lg" />
                    <div>
                      <h2 className="text-xl font-bold text-white">Assigned Project Manager</h2>
                      <p className="text-blue-100 text-sm">PM Details and Workload</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowPMDetailsModal(false);
                      setSelectedProjectPM(null);
                    }}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {(() => {
                  const projectCount = selectedProjectPM.projectCount || 0;
                  const isAvailable = projectCount === 0;
                  const isBusy = projectCount >= 1 && projectCount <= 3;
                  const isOverloaded = projectCount > 3;

                  let statusColor = '';
                  let statusText = '';
                  let statusBg = '';
                  let borderColor = '';

                  if (isAvailable) {
                    statusColor = 'text-green-700';
                    statusText = 'Available';
                    statusBg = 'bg-green-50';
                    borderColor = 'border-green-200';
                  } else if (isBusy) {
                    statusColor = 'text-yellow-700';
                    statusText = 'Busy';
                    statusBg = 'bg-yellow-50';
                    borderColor = 'border-yellow-200';
                  } else {
                    statusColor = 'text-red-700';
                    statusText = 'Overloaded';
                    statusBg = 'bg-red-50';
                    borderColor = 'border-red-200';
                  }

                  return (
                    <>
                      {/* PM Info Card */}
                      <div className={`border-2 rounded-xl p-5 mb-4 ${borderColor} ${statusBg}`}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="text-2xl font-bold text-gray-900">
                                {selectedProjectPM.pm_name || selectedProjectPM.full_name}
                              </h3>
                              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColor} ${statusBg} border-2 ${borderColor}`}>
                                {statusText}
                              </span>
                            </div>

                            <div className="space-y-2 mb-4">
                              <div className="flex items-center gap-2 text-gray-700">
                                <span className="text-sm font-medium text-gray-500">Email:</span>
                                <span className="text-sm">{selectedProjectPM.email}</span>
                              </div>
                              <div className="flex items-center gap-2 text-gray-700">
                                <span className="text-sm font-medium text-gray-500">Phone:</span>
                                <span className="text-sm">{selectedProjectPM.phone}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                              <BuildingOfficeIcon className="w-5 h-5 text-gray-500" />
                              <span className="font-bold text-xl text-[#243d8a]">{projectCount}</span>
                              <span className="text-gray-600 text-sm">
                                {projectCount === 1 ? 'project' : 'projects'} assigned
                              </span>
                            </div>

                            {/* Progress Bar */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-500">Workload Capacity</span>
                                <span className={`font-semibold ${statusColor}`}>
                                  {projectCount === 0 ? '0%' : projectCount <= 3 ? `${Math.min(projectCount * 25, 75)}%` : '100%'}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-3">
                                <div
                                  className={`h-3 rounded-full transition-all ${
                                    isAvailable ? 'bg-green-500' : isBusy ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: projectCount === 0 ? '0%' : `${Math.min(projectCount * 20, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Assigned Projects List */}
                      {selectedProjectPM.projects && selectedProjectPM.projects.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <DocumentTextIcon className="w-5 h-5 text-gray-500" />
                            All Assigned Projects ({selectedProjectPM.projects.length})
                          </h4>
                          <div className="max-h-64 overflow-y-auto space-y-2">
                            {selectedProjectPM.projects.map((project: any, idx: number) => (
                              <div
                                key={idx}
                                className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-[#243d8a] hover:bg-blue-50 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <BuildingOfficeIcon className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {project.project_name}
                                    </p>
                                    <p className="text-xs text-gray-500">Project ID: {project.project_id}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {projectCount === 0 && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-700 flex items-center gap-2">
                            <CheckCircleIcon className="w-5 h-5" />
                            This PM is currently available and has no assigned projects
                          </p>
                        </div>
                      )}

                      {/* Close Button */}
                      <div className="mt-6 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => {
                            setShowPMDetailsModal(false);
                            setSelectedProjectPM(null);
                          }}
                          className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}

        {/* History Modal - BOQ History Timeline */}
        {showHistoryModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Compact Header with soft red gradient */}
              <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-3 border-b border-red-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <ClockIcon className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">BOQ History</h2>
                      <p className="text-gray-600 text-xs">{selectedEstimation.projectName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg p-1.5 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content with light background */}
              <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                <BOQHistoryTimeline boqId={selectedEstimation.id} />
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default ProjectApprovals;