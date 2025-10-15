import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  DocumentPlusIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import ExtraSubItemsForm from '@/components/change-requests/ExtraSubItemsForm';
import { useChangeRequestsAutoSync } from '@/hooks/useAutoSync';
import { changeRequestService } from '@/services/changeRequestService';

interface ChangeRequest {
  cr_id: number;
  project_id: number;
  boq_id: number;
  item_id: string;
  item_name: string;
  status: string;
  justification: string;
  percentage_of_item_overhead: number;
  materials_total_cost: number;
  created_at: string;
  current_approver_role?: string;
  approval_required_from?: string;
}

const ChangeRequestsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);

  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('access_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Real-time auto-sync hook
  const { data: changeRequestsData, isLoading: loading, refetch } = useChangeRequestsAutoSync(
    async () => {
      const response = await changeRequestService.getChangeRequests();
      if (response.success) {
        return response.data;
      }
      throw new Error(response.message || 'Failed to load change requests');
    }
  );

  const changeRequests = useMemo(() => changeRequestsData || [], [changeRequestsData]);

  const handleSubmitChangeRequest = async (data: any) => {
    try {
      const response = await axios.post(`${API_URL}/boq/change-request`, data, { headers });

      if (response.data.cr_id) {
        // Send for review immediately after creation
        await axios.post(
          `${API_URL}/change-request/${response.data.cr_id}/send-for-review`,
          {},
          { headers }
        );
      }

      toast.success('Change request submitted successfully');
      setShowForm(false);
      refetch(); // Trigger background refresh
    } catch (error: any) {
      console.error('Error submitting change request:', error);
      toast.error(error.response?.data?.error || 'Failed to submit change request');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { color: string; icon: React.ReactNode; label: string } } = {
      pending: {
        color: 'bg-gray-100 text-gray-700 border-gray-300',
        icon: <ClockIcon className="w-4 h-4" />,
        label: 'Pending'
      },
      under_review: {
        color: 'bg-blue-100 text-blue-700 border-blue-300',
        icon: <ClockIcon className="w-4 h-4" />,
        label: 'Under Review'
      },
      approved_by_pm: {
        color: 'bg-indigo-100 text-indigo-700 border-indigo-300',
        icon: <CheckCircleIcon className="w-4 h-4" />,
        label: 'PM Approved'
      },
      approved_by_td: {
        color: 'bg-purple-100 text-purple-700 border-purple-300',
        icon: <CheckCircleIcon className="w-4 h-4" />,
        label: 'TD Approved'
      },
      approved: {
        color: 'bg-green-100 text-green-700 border-green-300',
        icon: <CheckCircleIcon className="w-4 h-4" />,
        label: 'Completed'
      },
      rejected: {
        color: 'bg-red-100 text-red-700 border-red-300',
        icon: <XCircleIcon className="w-4 h-4" />,
        label: 'Rejected'
      }
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 shadow-sm border border-blue-100">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Change Requests</h1>
                <p className="text-gray-600">Request additional sub-items for BOQ items</p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                New Request
              </button>
            </div>
          </div>
        </motion.div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b px-6 py-4">
                <h2 className="text-xl font-semibold text-gray-900">Request Extra Sub-Items</h2>
              </div>
              <div className="p-6">
                <ExtraSubItemsForm
                  onSubmit={handleSubmitChangeRequest}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            </motion.div>
          </div>
        )}

        {/* Change Requests List */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : changeRequests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <DocumentPlusIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Change Requests</h3>
              <p className="text-gray-500">Click "New Request" to create your first change request</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Request ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Cost
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        % of Overhead
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pending With
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {changeRequests.map((request) => (
                      <tr key={request.cr_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          CR-{request.cr_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {request.item_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          AED{request.materials_total_cost.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`font-medium ${
                            request.percentage_of_item_overhead > 40
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}>
                            {request.percentage_of_item_overhead.toFixed(1)}%
                          </span>
                          {request.percentage_of_item_overhead > 40 && (
                            <ExclamationTriangleIcon className="inline-block w-4 h-4 ml-1 text-amber-500" />
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {request.current_approver_role || request.approval_required_from || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(request.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setSelectedRequest(request)}
                            className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                          >
                            <EyeIcon className="w-4 h-4" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ChangeRequestsPage;