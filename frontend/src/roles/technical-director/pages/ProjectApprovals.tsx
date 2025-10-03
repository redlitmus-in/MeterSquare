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
  XMarkIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

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
  projectDuration: string;
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

  // Load BOQs on mount
  useEffect(() => {
    loadBOQs();
  }, []);

  const loadBOQs = async () => {
    setLoading(true);
    try {
      const response = await estimatorService.getAllBOQs();
      if (response.success && response.data) {
        console.log('Loaded BOQs:', response.data);
        console.log('BOQ Statuses:', response.data.map((b: any) => ({ id: b.boq_id, status: b.status })));
        setBOQs(response.data);
      } else {
        console.log('No BOQs loaded or response failed');
      }
    } catch (error) {
      console.error('Error loading BOQs:', error);
      toast.error('Failed to load BOQs');
    } finally {
      setLoading(false);
    }
  };

  // Transform BOQ data to match EstimationItem structure
  const transformBOQToEstimation = (boq: any): EstimationItem => {
    return {
      id: boq.boq_id,
      projectName: boq.project_name || 'Unnamed Project',
      clientName: boq.client || 'Unknown Client',
      estimator: boq.created_by_name || 'Unknown',
      totalValue: boq.total_cost || 0,
      itemCount: boq.items?.length || 0,
      laborCost: boq.items?.reduce((sum: number, item: any) => {
        const labourTotal = item.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || 0), 0) || 0;
        return sum + labourTotal;
      }, 0) || 0,
      materialCost: boq.items?.reduce((sum: number, item: any) => {
        const materialTotal = item.materials?.reduce((mSum: number, m: any) => mSum + (m.total_price || 0), 0) || 0;
        return sum + materialTotal;
      }, 0) || 0,
      profitMargin: boq.items?.[0]?.profit_percentage || 0,
      overheadPercentage: boq.items?.[0]?.overhead_percentage || 0,
      submittedDate: boq.created_at ? new Date(boq.created_at).toISOString().split('T')[0] : '',
      status: mapBOQStatus(boq.status),
      priority: 'medium',
      location: boq.location || 'N/A',
      floor: boq.floor_name || 'N/A',
      workingHours: boq.working_hours || 'N/A',
      projectDuration: 'N/A',
      boqItems: boq.items?.map((item: any) => ({
        id: item.item_id,
        description: item.item_name,
        briefDescription: item.description || '',
        unit: item.materials?.[0]?.unit || 'nos',
        quantity: item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 0,
        rate: 0,
        amount: item.selling_price || 0,
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
      })) || []
    };
  };

  // Map BOQ status to estimation status
  const mapBOQStatus = (status: string): 'pending' | 'approved' | 'rejected' => {
    const normalizedStatus = status?.toLowerCase();
    if (normalizedStatus === 'approved') return 'approved';
    if (normalizedStatus === 'rejected') return 'rejected';
    return 'pending'; // sent_for_confirmation, draft, etc. -> pending
  };

  // Transform BOQs to estimations
  const estimations = boqs.map(transformBOQToEstimation);

  const filteredEstimations = estimations.filter(est => {
    if (filterStatus === 'pending') {
      // Pending includes: sent_for_confirmation, draft, in_review
      const boq = boqs.find(b => b.boq_id === est.id);
      const status = boq?.status?.toLowerCase().replace(/_/g, '');
      console.log('BOQ Status (normalized):', status, 'Original:', boq?.status);
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
        const response = await estimatorService.approveBOQ(id, notes);
        if (response.success) {
          toast.success('Project approved successfully');
          await loadBOQs(); // Reload data
        } else {
          toast.error(response.message || 'Failed to approve project');
        }
      } else {
        if (!notes || !notes.trim()) {
          toast.error('Please provide a rejection reason');
          return;
        }
        const response = await estimatorService.rejectBOQ(id, notes);
        if (response.success) {
          toast.success('Project rejected successfully');
          await loadBOQs(); // Reload data
        } else {
          toast.error(response.message || 'Failed to reject project');
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
        <ModernLoadingSpinners variant="pulse" color="blue" />
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
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="w-4 h-4" />
                        <span>Duration: {estimation.projectDuration}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-4">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Total Value</p>
                        <p className="text-lg font-bold text-gray-900">₹{(estimation.totalValue / 100000).toFixed(1)}L</p>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Items</p>
                        <p className="text-lg font-bold text-blue-900">{estimation.itemCount}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Labor Cost</p>
                        <p className="text-lg font-bold text-green-900">₹{(estimation.laborCost / 100000).toFixed(1)}L</p>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Material Cost</p>
                        <p className="text-lg font-bold text-purple-900">₹{(estimation.materialCost / 100000).toFixed(1)}L</p>
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
                      onClick={() => {
                        setSelectedEstimation(estimation);
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                      <span className="font-semibold ml-1">₹{(selectedEstimation.totalValue / 100000).toFixed(1)}L</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Profit Margin:</span>
                      <span className="font-semibold ml-1">{selectedEstimation.profitMargin}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Overhead:</span>
                      <span className="font-semibold ml-1">{selectedEstimation.overheadPercentage}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Duration:</span>
                      <span className="font-semibold ml-1">{selectedEstimation.projectDuration}</span>
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                    <p className="text-xs text-blue-600 mt-1">Working Hours: {selectedEstimation.workingHours} • Duration: {selectedEstimation.projectDuration}</p>
                  </div>
                  <button
                    onClick={() => setShowBOQModal(false)}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6 text-blue-900" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {/* Project Summary */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Total Value</p>
                    <p className="text-lg font-bold text-gray-900">₹{(selectedEstimation.totalValue / 100000).toFixed(1)}L</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Material Cost</p>
                    <p className="text-lg font-bold text-blue-900">₹{(selectedEstimation.materialCost / 100000).toFixed(1)}L</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Labor Cost</p>
                    <p className="text-lg font-bold text-green-900">₹{(selectedEstimation.laborCost / 100000).toFixed(1)}L</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">O&P Margin</p>
                    <p className="text-lg font-bold text-purple-900">{selectedEstimation.overheadPercentage + selectedEstimation.profitMargin}%</p>
                    <p className="text-[10px] text-purple-700">OH: {selectedEstimation.overheadPercentage}% | P: {selectedEstimation.profitMargin}%</p>
                  </div>
                </div>

                {/* BOQ Items */}
                <h3 className="text-lg font-bold text-gray-900 mb-4">Bill of Quantities - Items</h3>
                {selectedEstimation.boqItems && selectedEstimation.boqItems.length > 0 ? (
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
                              <span>Rate: ₹{item.rate}/{item.unit}</span>
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
                                  Est. Cost: ₹{material.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-blue-200 mt-2 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span className="text-blue-900">Total Materials:</span>
                              <span className="text-blue-900">₹{item.materials.reduce((sum, m) => sum + m.amount, 0).toLocaleString()}</span>
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
                                  Est. Cost: ₹{labor.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-green-200 mt-2 pt-2">
                            <div className="flex justify-between text-sm font-semibold">
                              <span className="text-green-900">Total Labour:</span>
                              <span className="text-green-900">₹{item.laborCost.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Overhead & Profit */}
                        <div className="bg-orange-50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-semibold text-orange-900 mb-2">+ Overheads & Profit</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-700">Overhead ({selectedEstimation.overheadPercentage}%)</span>
                              <span className="text-gray-900">₹{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * selectedEstimation.overheadPercentage / 100).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-700">Profit Margin ({selectedEstimation.profitMargin}%)</span>
                              <span className="text-gray-900">₹{((item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost) * selectedEstimation.profitMargin / 100).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Estimated Selling Price */}
                        <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900">Estimated Selling Price:</span>
                            <span className="text-xl font-bold text-green-900">₹{item.estimatedSellingPrice.toLocaleString()}</span>
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
                      <span className="font-semibold">₹{(selectedEstimation.materialCost).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Labor Cost:</span>
                      <span className="font-semibold">₹{(selectedEstimation.laborCost).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Overhead ({selectedEstimation.overheadPercentage}%):</span>
                      <span className="font-semibold">₹{((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.overheadPercentage / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Profit ({selectedEstimation.profitMargin}%):</span>
                      <span className="font-semibold">₹{((selectedEstimation.materialCost + selectedEstimation.laborCost) * selectedEstimation.profitMargin / 100).toLocaleString()}</span>
                    </div>
                    <div className="border-t border-blue-300 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="font-bold text-gray-900">Grand Total:</span>
                        <span className="font-bold text-lg text-green-600">₹{selectedEstimation.totalValue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer with Actions */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Submitted by: <span className="font-semibold">{selectedEstimation.estimator}</span> on {selectedEstimation.submittedDate}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowBOQModal(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Close
                  </button>
                  {selectedEstimation.status === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          handleApproval(selectedEstimation.id, false);
                          setShowBOQModal(false);
                        }}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                      >
                        <XCircleIcon className="w-5 h-5" />
                        Reject
                      </button>
                      <button
                        onClick={() => {
                          handleApproval(selectedEstimation.id, true);
                          setShowBOQModal(false);
                        }}
                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                        Approve
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectApprovals;