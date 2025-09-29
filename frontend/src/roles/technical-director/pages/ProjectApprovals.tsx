import React, { useState } from 'react';
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [showBOQModal, setShowBOQModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const estimations: EstimationItem[] = [
    {
      id: 1,
      projectName: 'Corporate Office - Tower A',
      clientName: 'Tech Solutions Inc.',
      estimator: 'John Anderson',
      totalValue: 4500000,
      itemCount: 52,
      laborCost: 1200000,
      materialCost: 2500000,
      profitMargin: 18,
      overheadPercentage: 10,
      submittedDate: '2024-01-20',
      status: 'pending',
      priority: 'high',
      location: 'Mumbai',
      floor: '5th Floor',
      workingHours: '9:00 AM - 6:00 PM',
      projectDuration: '4 months',
      boqItems: [
        {
          id: 1,
          description: 'PW-01 - Glass Partition Wall',
          briefDescription: 'Supply and installation of 10mm toughened glass partition with aluminium frames',
          unit: 'sqm',
          quantity: 120,
          rate: 935,
          amount: 112200,
          materials: [
            { name: 'Glass Panel', quantity: 120, unit: 'sqft', rate: 500, amount: 60000 },
            { name: 'Aluminium Frame', quantity: 80, unit: 'rft', rate: 200, amount: 16000 },
            { name: 'Sealant', quantity: 5, unit: 'tubes', rate: 300, amount: 1500 }
          ],
          labour: [
            { type: 'Fabricator', quantity: 40, unit: 'hrs', rate: 500, amount: 20000 },
            { type: 'Installer', quantity: 24, unit: 'hrs', rate: 400, amount: 9600 },
            { type: 'Helper', quantity: 16, unit: 'hrs', rate: 200, amount: 3200 }
          ],
          laborCost: 32800,
          estimatedSellingPrice: 112035
        },
        {
          id: 2,
          description: 'FC-02 - False Ceiling Grid System',
          briefDescription: 'Supply and installation of mineral fiber false ceiling with grid system',
          unit: 'sqm',
          quantity: 180,
          rate: 1200,
          amount: 216000,
          materials: [
            { name: 'Ceiling Tiles 2x2', quantity: 180, unit: 'sqm', rate: 650, amount: 117000 },
            { name: 'Grid System', quantity: 200, unit: 'meter', rate: 280, amount: 56000 },
            { name: 'Hangers & Wires', quantity: 100, unit: 'pcs', rate: 150, amount: 15000 }
          ],
          labour: [
            { type: 'Ceiling Installer', quantity: 48, unit: 'hrs', rate: 450, amount: 21600 },
            { type: 'Helper', quantity: 32, unit: 'hrs', rate: 200, amount: 6400 }
          ],
          laborCost: 28000,
          estimatedSellingPrice: 245000
        },
        {
          id: 3,
          description: 'EL-03 - Electrical Wiring Concealed',
          briefDescription: 'Concealed electrical wiring with modular switches and sockets',
          unit: 'point',
          quantity: 45,
          rate: 2500,
          amount: 112500,
          materials: [
            { name: 'Electrical Wire 2.5mm', quantity: 500, unit: 'meter', rate: 45, amount: 22500 },
            { name: 'Conduit Pipes', quantity: 200, unit: 'meter', rate: 60, amount: 12000 },
            { name: 'Switch & Sockets', quantity: 45, unit: 'pcs', rate: 850, amount: 38250 }
          ],
          labour: [
            { type: 'Electrician', quantity: 60, unit: 'hrs', rate: 550, amount: 33000 },
            { type: 'Helper', quantity: 40, unit: 'hrs', rate: 200, amount: 8000 }
          ],
          laborCost: 41000,
          estimatedSellingPrice: 128500
        }
      ]
    },
    {
      id: 2,
      projectName: 'Retail Store Renovation',
      clientName: 'Fashion Retail Ltd.',
      estimator: 'Sarah Miller',
      totalValue: 2300000,
      itemCount: 38,
      laborCost: 600000,
      materialCost: 1300000,
      profitMargin: 15,
      overheadPercentage: 7,
      submittedDate: '2024-01-19',
      status: 'pending',
      priority: 'medium',
      location: 'Delhi',
      floor: 'Ground Floor',
      workingHours: '10:00 AM - 7:00 PM',
      projectDuration: '3 months'
    },
    {
      id: 3,
      projectName: 'Restaurant Interior Design',
      clientName: 'Gourmet Foods Pvt Ltd.',
      estimator: 'Mike Johnson',
      totalValue: 1800000,
      itemCount: 28,
      laborCost: 450000,
      materialCost: 950000,
      profitMargin: 17,
      overheadPercentage: 8,
      submittedDate: '2024-01-18',
      status: 'pending',
      priority: 'low',
      location: 'Bangalore',
      floor: '1st Floor',
      workingHours: '8:00 AM - 5:00 PM',
      projectDuration: '2 months'
    },
    {
      id: 4,
      projectName: 'Bank Branch Setup',
      clientName: 'National Bank',
      estimator: 'Emily Chen',
      totalValue: 3200000,
      itemCount: 45,
      laborCost: 900000,
      materialCost: 1800000,
      profitMargin: 12,
      overheadPercentage: 8,
      submittedDate: '2024-01-17',
      status: 'approved',
      priority: 'high',
      location: 'Chennai',
      floor: 'Ground Floor',
      workingHours: '9:00 AM - 6:00 PM',
      projectDuration: '3.5 months',
      approvalNotes: 'Approved with condition to maintain quality standards for bank premises'
    }
  ];

  const filteredEstimations = estimations.filter(est =>
    filterStatus === 'all' || est.status === filterStatus
  );

  const handleApproval = (id: number, approved: boolean, notes?: string) => {
    const action = approved ? 'approved' : 'rejected';
    const message = approved
      ? `Project approved${notes ? ' with notes' : ''}`
      : `Project rejected${notes ? ' with reason' : ''}`;
    toast.success(message);
    // Here you would make API call to update status with notes/reason
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
              <DocumentCheckIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-blue-900">Project Approvals</h1>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-yellow-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Review</p>
                <p className="text-2xl font-bold text-gray-900">
                  {estimations.filter(e => e.status === 'pending').length}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <ClockIcon className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md border border-green-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Approved</p>
                <p className="text-2xl font-bold text-gray-900">
                  {estimations.filter(e => e.status === 'approved').length}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md border border-blue-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">₹118L</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <CurrencyDollarIcon className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-md border border-purple-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg. Profit Margin</p>
                <p className="text-2xl font-bold text-gray-900">23.75%</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <ArrowTrendingUpIcon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 mb-6 inline-flex">
          {['all', 'pending', 'approved', 'rejected'].map((status) => (
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