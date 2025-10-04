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
  EnvelopeIcon
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
  status: 'pending' | 'approved' | 'rejected';
  priority: 'high' | 'medium' | 'low';
  location: string;
  floor: string;
  workingHours: string;
  boqItems?: BOQItem[];
  approvalNotes?: string;
  rejectionReason?: string;
}

const ProjectApprovals: React.FC = () => {
  const [selectedEstimation, setSelectedEstimation] = useState<EstimationItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | 'completed'>('pending');
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
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [downloadType, setDownloadType] = useState<'internal' | 'client'>('internal');

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
      const response = await estimatorService.getAllBOQs();
      if (response.success && response.data) {
        setBOQs(response.data);
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
  const mapBOQStatus = (status: string): 'pending' | 'approved' | 'rejected' => {
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

    // All other statuses (sent_for_confirmation, draft, in_review, pending) -> pending
    return 'pending';
  };

  // Transform BOQs to estimations
  const estimations = boqs.map(transformBOQToEstimation);

  const filteredEstimations = estimations.filter(est => {
    if (filterStatus === 'pending') {
      // Pending includes: sent_for_confirmation, draft, in_review
      const boq = boqs.find(b => b.boq_id === est.id);
      const status = boq?.status?.toLowerCase().replace(/_/g, '');
      return status === 'sentforconfirmation' || status === 'draft' || status === 'inreview' || status === 'pending';
    } else if (filterStatus === 'completed') {
      const boq = boqs.find(b => b.boq_id === est.id);
      const status = boq?.status?.toLowerCase();
      return status === 'completed';
    }
    return est.status === filterStatus;
  });

  const handleApproval = async (id: number, approved: boolean, notes?: string) => {
    try {
      if (approved) {
        const response = await tdService.approveBOQ(id, notes);
        if (response.success) {
          toast.success('BOQ approved successfully');
          setShowBOQModal(false); // Close BOQ details modal
          await loadBOQs(); // Reload data
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
    setShowApprovalModal(false);
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

  const handleSendToClient = async () => {
    if (!selectedEstimation) return;

    if (!clientEmail.trim()) {
      toast.error('Please enter client email address');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      toast.loading('Sending BOQ to client (Excel)...');
      const response = await tdService.sendBOQToClient(
        selectedEstimation.id,
        clientEmail,
        emailMessage,
        ['excel'] // Send only Excel format
      );

      toast.dismiss();
      if (response.success) {
        toast.success('BOQ sent to client successfully');
        setShowSendEmailModal(false);
        setClientEmail('');
        setEmailMessage('');
        await loadBOQs(); // Reload to update status
      } else {
        toast.error(response.message || 'Failed to send BOQ to client');
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to send BOQ to client');
      console.error('Send email error:', error);
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 mb-6 inline-flex">
          {['pending', 'approved', 'rejected', 'completed'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status as any)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                filterStatus === status
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
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
                    {estimation.status === 'pending' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedEstimation(estimation);
                            setShowApprovalModal(true);
                          }}
                          className="p-2.5 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group"
                          title="Approve"
                        >
                          <CheckCircleIcon className="w-5 h-5 text-green-600 group-hover:text-green-700" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEstimation(estimation);
                            setShowRejectionModal(true);
                          }}
                          className="p-2.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors group"
                          title="Reject"
                        >
                          <XCircleIcon className="w-5 h-5 text-red-600 group-hover:text-red-700" />
                        </button>
                      </>
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
                <h2 className="text-xl font-bold text-green-900">Approve Project</h2>
                <p className="text-sm text-green-700 mt-1">{selectedEstimation.projectName}</p>
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
                    rows={4}
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
                    <button
                      onClick={() => setShowFormatModal(true)}
                      className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                      title="Download BOQ"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      Download
                    </button>
                    <button
                      onClick={() => {
                        setShowSendEmailModal(true);
                      }}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                      title="Send to Client via Email"
                    >
                      <EnvelopeIcon className="w-4 h-4" />
                      Send
                    </button>
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
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Material Cost:</span>
                      <span className="font-semibold">AED{(selectedEstimation.materialCost).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Labor Cost:</span>
                      <span className="font-semibold">AED{(selectedEstimation.laborCost).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Overhead ({selectedEstimation.overheadPercentage}%):</span>
                      <span className="font-semibold">AED{((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.overheadPercentage / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Profit ({selectedEstimation.profitMargin}%):</span>
                      <span className="font-semibold">AED{((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.profitMargin / 100).toLocaleString()}</span>
                    </div>
                    <div className="border-t border-blue-300 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="font-bold text-gray-900">Grand Total:</span>
                        <span className="font-bold text-lg text-green-600">
                          AED{(
                            selectedEstimation.materialCost +
                            selectedEstimation.laborCost +
                            ((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.overheadPercentage / 100) +
                            ((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.profitMargin / 100)
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
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

              {/* Sticky Action Buttons & Footer */}
              <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-200">
                {selectedEstimation.status === 'pending' && (
                  <div className="px-6 py-4 flex items-center gap-3 justify-end">
                    <button
                      onClick={() => {
                        setShowRejectionModal(true);
                      }}
                      className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                    >
                      <XCircleIcon className="w-5 h-5" />
                      Reject BOQ
                    </button>
                    <button
                      onClick={() => {
                        setShowApprovalModal(true);
                      }}
                      className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md"
                    >
                      <CheckCircleIcon className="w-5 h-5" />
                      Approve BOQ
                    </button>
                  </div>
                )}

                {/* Footer Info */}
                <div className="px-6 py-3 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    Submitted by: <span className="font-semibold">{selectedEstimation.estimator}</span> on {selectedEstimation.submittedDate}
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

        {/* Send to Client Email Modal */}
        {showSendEmailModal && selectedEstimation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-lg w-full"
            >
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                <h2 className="text-xl font-bold text-blue-900">Send BOQ to Client</h2>
                <p className="text-sm text-blue-700 mt-1">{selectedEstimation.projectName}</p>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="client@example.com"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message to Client (Optional)
                  </label>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    placeholder="Add a personal message for the client..."
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">What will be sent:</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• BOQ Excel file (Client version - WITHOUT overhead & profit details)</li>
                    <li>• Project: {selectedEstimation.projectName}</li>
                    <li>• Total Value: AED {formatCurrency(selectedEstimation.totalValue)}</li>
                    <li>• {selectedEstimation.itemCount} items included</li>
                  </ul>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> The client version hides internal cost breakdowns, overhead percentages, and profit margins.
                  </p>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowSendEmailModal(false);
                      setClientEmail('');
                      setEmailMessage('');
                    }}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendToClient}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <EnvelopeIcon className="w-5 h-5" />
                    Send to Client
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