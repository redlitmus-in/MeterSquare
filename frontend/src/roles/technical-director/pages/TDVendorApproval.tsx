import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  Clock,
  XCircle,
  Building2,
  MapPin,
  FileText,
  Package,
  DollarSign,
  Store,
  Eye,
  Check,
  X as XIcon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { toast } from 'sonner';
import axios from 'axios';

interface BOQAssignment {
  assignment_id: number;
  boq_id: number;
  project_id: number;
  status: string;
  assigned_by_name: string;
  assigned_to_buyer_name: string;
  assignment_date: string | null;
  vendor_selection_status: string;
  selected_vendor_id: number;
  selected_vendor_name: string;
  vendor_selected_by_buyer_name: string;
  vendor_selection_date: string | null;
  vendor_approved_by_td_name: string | null;
  vendor_approval_date: string | null;
  vendor_rejection_reason: string | null;
  boq: {
    boq_id: number;
    boq_name: string;
  };
  project: {
    project_id: number;
    project_name: string;
    client: string;
    location: string;
  };
  materials: Array<{
    id: number;
    item_name: string;
    sub_item_name: string;
    material_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }>;
  total_cost: number;
  overhead_allocated: number;
  overhead_percentage: number;
  base_total: number;
  vendor: {
    vendor_id: number;
    company_name: string;
    email: string;
    phone: string;
    phone_code: string;
    category: string;
  } | null;
}

const TDVendorApproval: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'change_requests' | 'se_boq'>('se_boq');
  const [seBoqSubTab, setSeBoqSubTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [assignments, setAssignments] = useState<BOQAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<BOQAssignment | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [assignmentToReject, setAssignmentToReject] = useState<BOQAssignment | null>(null);

  useEffect(() => {
    if (activeTab === 'se_boq') {
      fetchSEBoqAssignments();
    }
  }, [activeTab]);

  const fetchSEBoqAssignments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/se-boq-vendor-requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAssignments(response.data.assignments || []);
    } catch (error: any) {
      toast.error('Failed to load SE BOQ vendor requests');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (assignmentId: number) => {
    try {
      setActionLoading(assignmentId);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/buyer/se-boq/${assignmentId}/td-approve-vendor`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Vendor approved successfully');
      fetchSEBoqAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to approve vendor');
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!assignmentToReject || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      setActionLoading(assignmentToReject.assignment_id);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/buyer/se-boq/${assignmentToReject.assignment_id}/td-reject-vendor`,
        { rejection_reason: rejectionReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Vendor rejected successfully');
      setShowRejectModal(false);
      setRejectionReason('');
      setAssignmentToReject(null);
      fetchSEBoqAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reject vendor');
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredAssignments = useMemo(() => {
    return assignments.filter(assignment => {
      if (seBoqSubTab === 'pending') return assignment.vendor_selection_status === 'pending_td_approval';
      if (seBoqSubTab === 'approved') return assignment.vendor_selection_status === 'approved';
      if (seBoqSubTab === 'rejected') return assignment.vendor_selection_status === 'rejected';
      return true;
    });
  }, [assignments, seBoqSubTab]);

  const stats = useMemo(() => {
    return {
      pending: assignments.filter(a => a.vendor_selection_status === 'pending_td_approval').length,
      approved: assignments.filter(a => a.vendor_selection_status === 'approved').length,
      rejected: assignments.filter(a => a.vendor_selection_status === 'rejected').length
    };
  }, [assignments]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" color="blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vendor Approval</h1>
        <p className="text-gray-600">Review and approve vendor selections</p>
      </div>

      {/* Main Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 mb-6 inline-flex gap-1">
        <button
          onClick={() => setActiveTab('change_requests')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'change_requests'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Change Requests
        </button>
        <button
          onClick={() => setActiveTab('se_boq')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'se_boq'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          SE BOQ Assignments
        </button>
      </div>

      {/* SE BOQ Sub-tabs */}
      {activeTab === 'se_boq' && (
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setSeBoqSubTab('pending')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                seBoqSubTab === 'pending'
                  ? 'bg-yellow-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-1" />
              Pending Approval ({stats.pending})
            </button>
            <button
              onClick={() => setSeBoqSubTab('approved')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                seBoqSubTab === 'approved'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <CheckCircle className="w-4 h-4 inline mr-1" />
              Approved ({stats.approved})
            </button>
            <button
              onClick={() => setSeBoqSubTab('rejected')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                seBoqSubTab === 'rejected'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <XCircle className="w-4 h-4 inline mr-1" />
              Rejected ({stats.rejected})
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab === 'change_requests' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Change Request vendor approvals coming soon</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No {seBoqSubTab} SE BOQ vendor requests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssignments.map((assignment, index) => (
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
                    {assignment.boq.boq_name}
                  </h3>
                  <Badge className={`${
                    assignment.vendor_selection_status === 'approved'
                      ? 'bg-green-600 text-white'
                      : assignment.vendor_selection_status === 'rejected'
                        ? 'bg-red-600 text-white'
                        : 'bg-yellow-600 text-white'
                  } text-xs whitespace-nowrap`}>
                    {assignment.vendor_selection_status === 'approved' ? (
                      <>
                        <CheckCircle className="w-3 h-3 inline mr-1" />
                        Approved
                      </>
                    ) : assignment.vendor_selection_status === 'rejected' ? (
                      <>
                        <XCircle className="w-3 h-3 inline mr-1" />
                        Rejected
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3 inline mr-1" />
                        Pending
                      </>
                    )}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{assignment.project.project_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">Buyer: {assignment.assigned_to_buyer_name}</span>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col">
                <div className="space-y-3 mb-4">
                  {/* Vendor Info */}
                  {assignment.vendor && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Store className="w-4 h-4 text-gray-600" />
                        <div className="text-xs text-gray-600 font-medium">Selected Vendor</div>
                      </div>
                      <div className="text-sm font-bold text-gray-900">{assignment.vendor.company_name}</div>
                      <div className="text-xs text-gray-600">{assignment.vendor.email}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Selected by: {assignment.vendor_selected_by_buyer_name}
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason */}
                  {assignment.vendor_rejection_reason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="text-xs font-medium text-red-900 mb-1">Rejection Reason</div>
                      <div className="text-xs text-red-700">{assignment.vendor_rejection_reason}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
                      <div className="text-xs text-purple-700 mb-0.5">Materials</div>
                      <div className="text-sm font-medium flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {assignment.materials.length} items
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                      <div className="text-xs text-green-700 mb-0.5">Total Cost</div>
                      <div className="text-sm font-medium flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        {formatCurrency(assignment.total_cost)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 mt-auto">
                  <Button
                    onClick={() => {
                      setSelectedAssignment(assignment);
                      setShowDetailsModal(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View Details
                  </Button>

                  {assignment.vendor_selection_status === 'pending_td_approval' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleApprove(assignment.assignment_id)}
                        disabled={actionLoading === assignment.assignment_id}
                        size="sm"
                        className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                      >
                        {actionLoading === assignment.assignment_id ? (
                          <>
                            <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setAssignmentToReject(assignment);
                          setShowRejectModal(true);
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-red-300 text-red-700 hover:bg-red-50"
                      >
                        <XIcon className="w-3 h-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-5 border-b border-blue-200 sticky top-0 z-10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {selectedAssignment.boq.boq_name}
                    </h2>
                    <Badge className={`${
                      selectedAssignment.vendor_selection_status === 'approved'
                        ? 'bg-green-600 text-white'
                        : selectedAssignment.vendor_selection_status === 'rejected'
                          ? 'bg-red-600 text-white'
                          : 'bg-yellow-600 text-white'
                    }`}>
                      {selectedAssignment.vendor_selection_status === 'approved' ? 'Approved' :
                       selectedAssignment.vendor_selection_status === 'rejected' ? 'Rejected' : 'Pending'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      {selectedAssignment.project.project_name}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      {selectedAssignment.project.client}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      {selectedAssignment.project.location}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedAssignment(null);
                  }}
                  className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                >
                  <XIcon className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
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
                        {selectedAssignment.materials.length}
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
                        {formatCurrency(selectedAssignment.total_cost)}
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
                        {selectedAssignment.assigned_by_name}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vendor Info */}
              {selectedAssignment.vendor && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Store className="w-5 h-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-900">Selected Vendor</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Company Name</div>
                      <div className="font-medium text-gray-900">{selectedAssignment.vendor.company_name}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Email</div>
                      <div className="font-medium text-gray-900">{selectedAssignment.vendor.email}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Selected By</div>
                      <div className="font-medium text-gray-900">{selectedAssignment.vendor_selected_by_buyer_name}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Category</div>
                      <div className="font-medium text-gray-900">{selectedAssignment.vendor.category || 'N/A'}</div>
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
                      {selectedAssignment.materials.map((material, index) => (
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
                            {formatCurrency(material.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                            {formatCurrency(material.total_price)}
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
                          {formatCurrency(selectedAssignment.total_cost)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <Button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedAssignment(null);
                }}
                variant="outline"
                className="px-6"
              >
                Close
              </Button>
              {selectedAssignment.vendor_selection_status === 'pending_td_approval' && (
                <>
                  <Button
                    onClick={() => {
                      setShowDetailsModal(false);
                      setAssignmentToReject(selectedAssignment);
                      setShowRejectModal(true);
                    }}
                    variant="outline"
                    className="px-6 border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <XIcon className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => {
                      handleApprove(selectedAssignment.assignment_id);
                      setShowDetailsModal(false);
                    }}
                    disabled={actionLoading === selectedAssignment.assignment_id}
                    className="px-6 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && assignmentToReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
          >
            <div className="bg-gradient-to-r from-red-50 to-red-100 px-6 py-4 border-b border-red-200">
              <h3 className="text-xl font-bold text-gray-900">Reject Vendor Selection</h3>
              <p className="text-sm text-gray-600 mt-1">
                {assignmentToReject.boq.boq_name} - {assignmentToReject.vendor?.company_name}
              </p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows={4}
                placeholder="Please provide a reason for rejection..."
              />
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <Button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  setAssignmentToReject(null);
                }}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || actionLoading === assignmentToReject.assignment_id}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {actionLoading === assignmentToReject.assignment_id ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <XIcon className="w-4 h-4 mr-2" />
                    Reject Vendor
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default TDVendorApproval;
