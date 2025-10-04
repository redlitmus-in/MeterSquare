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
  const [boqHistory, setBOQHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [downloadType, setDownloadType] = useState<'internal' | 'client'>('internal');
  const [showAssignPMModal, setShowAssignPMModal] = useState(false);
  const [assignMode, setAssignMode] = useState<'create' | 'existing'>('existing');
  const [allPMs, setAllPMs] = useState<any[]>([]);
  const [selectedPMId, setSelectedPMId] = useState<number | null>(null);
  const [newPMData, setNewPMData] = useState({ full_name: '', email: '', phone: '' });
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  // Format currency for display
  const formatCurrency = (amount: number): string => {
    if (amount >= 100000) {
      return `${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toLocaleString();
  };

  // Load BOQs on mount
  useEffect(() => {
    loadBOQs();
  }, []);

  const loadBOQs = async () => {
    setLoading(true);
    try {
      const response = await tdService.getAllTDBOQs();
      if (response.success && response.data) {
        setBOQs(response.data);
      } else {
        console.error('Failed to load BOQs:', response.message);
        toast.error(response.message || 'Failed to load BOQs');
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      toast.error('Failed to load BOQs');
    } finally {
      setLoading(false);
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

  const loadBOQHistory = async (boqId: number) => {
    setLoadingHistory(true);
    try {
      const response = await tdService.getBOQHistory(boqId);
      if (response.success && response.data) {
        setBOQHistory(response.data);
      } else {
        toast.error('Failed to load BOQ history');
      }
    } catch (error) {
      console.error('Error loading BOQ history:', error);
      toast.error('Failed to load BOQ history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Transform BOQ data to match EstimationItem structure
  const transformBOQToEstimation = (boq: any): EstimationItem => {
    // Handle both list response (project_name, client) and detail response (project_details.project_name)
    const projectName = boq.project_name || boq.project_details?.project_name || boq.boq_name || 'Unnamed Project';
    const clientName = boq.client || 'Unknown Client';
    const status = mapBOQStatus(boq.status);

    // Use API-provided totals directly (these come from backend calculations)
    const totalValue = boq.total_cost || boq.selling_price || 0;
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
      profitMargin: boq.profit_margin || 12,
      overheadPercentage: boq.overhead_percentage || 8,
      submittedDate: boq.created_at ? new Date(boq.created_at).toISOString().split('T')[0] : '',
      status: status,
      priority: 'medium',
      approvalNotes: status === 'approved' ? boq.notes : undefined,
      rejectionReason: status === 'rejected' ? boq.notes : undefined,
      location: boq.location || boq.project_details?.location || 'N/A',
      floor: boq.floor_name || boq.project_details?.floor || 'N/A',
      workingHours: boq.working_hours || boq.project_details?.hours || 'N/A',
      emailSent: boq.email_sent || false,
      projectId: boq.project_id,
      pmAssigned: !!(boq.pm_assigned || boq.user_id), // Convert to boolean - PM assigned if user_id exists
      boqItems: boq.items?.map((item: any) => {
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
          estimatedSellingPrice: item.selling_price || 0
        };
      }) || []
    };
  };

  // Map BOQ status to estimation status
  const mapBOQStatus = (status: string): 'pending' | 'approved' | 'rejected' | 'sent_for_confirmation' | 'client_confirmed' => {
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

    // Check for sent to client (waiting for client confirmation)
    if (normalizedStatus === 'sent_for_confirmation' || normalizedStatus === 'sent_to_client') {
      return 'sent_for_confirmation';
    }

    // All other statuses (draft, in_review, pending) -> pending
    return 'pending';
  };

  // Transform BOQs to estimations
  const estimations = boqs.map(transformBOQToEstimation);

  const filteredEstimations = estimations.filter(est => {
    if (filterStatus === 'pending') {
      // Pending: Waiting for TD internal approval (status = pending, sent via email to TD)
      return est.status === 'pending' && !est.pmAssigned;
    } else if (filterStatus === 'approved') {
      // Approved: TD approved internally, waiting for Estimator to send to client (status = approved ONLY)
      return est.status === 'approved' && !est.pmAssigned;
    } else if (filterStatus === 'sent') {
      // Client Approved: Estimator confirmed client approved (status = client_confirmed ONLY), ready for PM assignment
      return est.status === 'client_confirmed' && !est.pmAssigned;
    } else if (filterStatus === 'assigned') {
      // Assigned: PM has been assigned (can be after client confirms)
      return est.pmAssigned === true && est.status !== 'rejected';
    } else if (filterStatus === 'rejected') {
      // Rejected: TD rejected the BOQ
      return est.status === 'rejected';
    }
    return false;
  });

  const handleApproval = async (id: number, approved: boolean, notes?: string) => {
    try {
      if (approved) {
        const response = await tdService.approveBOQ(id, notes);
        if (response.success) {
          toast.success('BOQ approved successfully');
          setShowApprovalModal(false); // Close approval modal first
          await loadBOQs(); // Reload data

          // Show comparison modal automatically after approval
          setShowComparisonModal(true);
        } else {
          toast.error(response.message || 'Failed to approve BOQ');
        }
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
      const response = await tdService.getAllPMs();
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
            { key: 'sent', label: 'Client Approved' },
            { key: 'assigned', label: 'Assigned' },
            { key: 'rejected', label: 'Rejected' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key as any)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                filterStatus === tab.key
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Estimations List */}
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
                        <span className="text-sm font-medium text-gray-600">
                          {estimation.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-1">
                        <BuildingOfficeIcon className="w-4 h-4" />
                        <span>{estimation.clientName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <UserIcon className="w-4 h-4" />
                        <span>{estimation.estimator}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="w-4 h-4" />
                        <span>{estimation.submittedDate}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <ClockIcon className="w-4 h-4" />
                        <span>{estimation.workingHours}</span>
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

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Location: {estimation.location}</span>
                  <span>•</span>
                  <span>Floor: {estimation.floor}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredEstimations.length === 0 && (
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
                      <span className="font-semibold ml-1">AED{(selectedEstimation.totalValue / 100000).toFixed(1)}L</span>
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
                    {/* Download - Always available for TD review */}
                    <button
                      onClick={() => setShowFormatModal(true)}
                      className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                      title="Download BOQ"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      Download
                    </button>

                    {/* Assign PM - Only after client confirmed and PM not yet assigned */}
                    {selectedEstimation.status === 'client_confirmed' && !selectedEstimation.pmAssigned && (
                      <button
                        onClick={() => {
                          setShowAssignPMModal(true);
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-[#243d8a] to-blue-600 hover:from-[#1a2d66] hover:to-blue-700 text-white rounded-lg transition-all text-sm font-medium flex items-center gap-1 shadow-md"
                        title="Assign Project Manager to this project"
                      >
                        <UserPlusIcon className="w-4 h-4" />
                        Assign PM
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowHistory(!showHistory);
                        if (!showHistory) {
                          loadBOQHistory(selectedEstimation.id);
                        }
                      }}
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
                {/* Project Summary */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Total Value</p>
                    <p className="text-lg font-bold text-gray-900">AED{(selectedEstimation.totalValue / 100000).toFixed(1)}L</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Material Cost</p>
                    <p className="text-lg font-bold text-blue-900">AED{(selectedEstimation.materialCost / 100000).toFixed(1)}L</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Labor Cost</p>
                    <p className="text-lg font-bold text-green-900">AED{(selectedEstimation.laborCost / 100000).toFixed(1)}L</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">O&P Margin</p>
                    <p className="text-lg font-bold text-purple-900">{selectedEstimation.overheadPercentage + selectedEstimation.profitMargin}%</p>
                    <p className="text-[10px] text-purple-700">OH: {selectedEstimation.overheadPercentage}% | P: {selectedEstimation.profitMargin}%</p>
                  </div>
                </div>

                {/* BOQ History */}
                {showHistory && (
                  <div className="mb-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <ClockIcon className="w-5 h-5 text-blue-600" />
                      BOQ History
                    </h3>
                    {loadingHistory ? (
                      <div className="flex items-center justify-center py-8">
                        <ModernLoadingSpinners variant="pulse-wave" />
                      </div>
                    ) : boqHistory.length > 0 ? (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {boqHistory.map((history: any, index: number) => {
                          // Parse action if it's an object
                          const actionData = typeof history.action === 'object' ? history.action : { type: history.action };
                          const actionType = actionData.type || 'ACTION';
                          const actionStatus = actionData.status || history.boq_status;

                          return (
                            <div key={history.boq_history_id} className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-gray-900">{actionType}</span>
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                                      actionStatus === 'Approved' || actionStatus === 'approved' ? 'bg-green-100 text-green-700' :
                                      actionStatus === 'Rejected' || actionStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                                      actionStatus === 'Pending' || actionStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {actionStatus}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600">
                                    {history.sender_role && `${history.sender_role}: `}{history.action_by || history.sender}
                                    {history.receiver && ` → ${history.receiver_role}: ${history.receiver}`}
                                  </p>
                                  {history.comments && (
                                    <p className="text-xs text-gray-700 mt-1 bg-gray-50 p-2 rounded">"{history.comments}"</p>
                                  )}
                                  {actionData.boq_name && (
                                    <p className="text-xs text-blue-600 mt-1">BOQ: {actionData.boq_name}</p>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                                  {new Date(history.action_date || actionData.timestamp).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">No history available</p>
                    )}
                  </div>
                )}

                {/* BOQ Items */}
                <h3 className="text-lg font-bold text-gray-900 mb-4">Bill of Quantities - Items</h3>
                {loadingBOQDetails ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners variant="pulse-wave" />
                  </div>
                ) : selectedEstimation.boqItems && selectedEstimation.boqItems.length > 0 ? (
                  <div className="space-y-4">
                    {selectedEstimation.boqItems.map((item, index) => (
                      <div key={item.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all">
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
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No BOQ items available</p>
                  </div>
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

                      const baseCost = totalMaterialCost + totalLaborCost;
                      const overheadAmount = baseCost * selectedEstimation.overheadPercentage / 100;
                      const profitAmount = baseCost * selectedEstimation.profitMargin / 100;
                      const grandTotal = baseCost + overheadAmount + profitAmount;

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
                        <button
                          onClick={() => setShowComparisonModal(true)}
                          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Compare Internal vs Client BOQ
                        </button>
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

                {/* Reject Button - Only for approved BOQs (before sent to client) */}
                {selectedEstimation.status === 'approved' && (
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-green-600">✓ Internally Approved</span>
                      <p className="text-xs text-gray-500 mt-0.5">Waiting for Estimator to send to client</p>
                    </div>
                    <button
                      onClick={() => setShowRejectionModal(true)}
                      className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                    >
                      <XCircleIcon className="w-5 h-5" />
                      Revoke Approval
                    </button>
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
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-[#243d8a] to-blue-700 px-8 py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                      <UserPlusIcon className="w-7 h-7" />
                      Assign Project Manager
                    </h2>
                    <p className="text-blue-100 mt-1 text-sm">{selectedEstimation.projectName}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAssignPMModal(false);
                      setSelectedPMId(null);
                      setNewPMData({ full_name: '', email: '', phone: '' });
                      setAssignMode('existing');
                    }}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-8">
                {/* Mode Selection - Modern Tab Style */}
                <div className="bg-gray-100 rounded-xl p-1.5 mb-8 inline-flex w-full">
                  <button
                    onClick={() => setAssignMode('existing')}
                    className={`flex-1 py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 ${
                      assignMode === 'existing'
                        ? 'bg-white text-[#243d8a] shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <UserIcon className="w-5 h-5 inline mr-2" />
                    Select Existing PM
                  </button>
                  <button
                    onClick={() => setAssignMode('create')}
                    className={`flex-1 py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 ${
                      assignMode === 'create'
                        ? 'bg-white text-[#243d8a] shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <UserPlusIcon className="w-5 h-5 inline mr-2" />
                    Create New PM
                  </button>
                </div>

                {/* Existing PM Selection */}
                {assignMode === 'existing' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      Select Project Manager <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedPMId || ''}
                      onChange={(e) => setSelectedPMId(Number(e.target.value))}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#243d8a] focus:ring-4 focus:ring-blue-100 transition-all text-gray-700"
                    >
                      <option value="">Choose a Project Manager...</option>
                      {allPMs.map((pm: any) => (
                        <option key={pm.user_id || pm.pm_id} value={pm.user_id || pm.pm_id}>
                          {pm.pm_name || pm.full_name} - {pm.email}
                        </option>
                      ))}
                    </select>
                    {allPMs.length === 0 && (
                      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-sm text-amber-800 flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5" />
                          No unassigned Project Managers available. Create a new one.
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
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-[#243d8a] to-blue-600 hover:from-[#1a2d66] hover:to-blue-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
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
                        <span className="text-lg font-bold text-green-600">AED{formatCurrency(selectedEstimation.totalValue)}</span>
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
                      <div className="flex justify-between bg-gray-100 p-2 rounded opacity-40">
                        <span className="text-gray-500 line-through">Overhead & Profit:</span>
                        <span className="text-gray-500 line-through">Hidden from client</span>
                      </div>
                      <div className="flex justify-between pt-3 border-t-2 border-blue-300 mt-2">
                        <span className="text-lg font-bold text-gray-900">Total:</span>
                        <span className="text-lg font-bold text-green-600">AED{formatCurrency(selectedEstimation.totalValue)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <strong>Key Difference:</strong> Internal version shows overhead & profit breakdown, Client version shows final price only
                  </div>
                  <button
                    onClick={() => setShowComparisonModal(false)}
                    className="px-6 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
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