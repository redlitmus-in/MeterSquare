/**
 * Admin BOQ Management Page
 * Admin can create, view, edit, and approve BOQs (combines Estimator + TD capabilities)
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Plus,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  Mail,
  Filter
} from 'lucide-react';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { useNavigate } from 'react-router-dom';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { adminApi, BOQItem } from '@/api/admin';

const BOQManagement: React.FC = () => {
  const [boqs, setBOQs] = useState<BOQItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const navigate = useNavigate();

  useEffect(() => {
    fetchBOQs();
  }, [filterStatus]);

  const fetchBOQs = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getBOQs({
        status: filterStatus !== 'all' ? filterStatus : undefined
      });
      setBOQs(response.boqs);
    } catch (error: any) {
      showError('Failed to fetch BOQs', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'in_review':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'in_review':
        return <Eye className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const handleCreateBOQ = () => {
    // Navigate to estimator BOQ creation form
    navigate('/estimator/create-boq');
  };

  const handleViewBOQ = (boqId: number) => {
    // Navigate to BOQ details
    navigate(`/boq/${boqId}`);
  };

  const handleApproveBOQ = async (boqId: number) => {
    try {
      await adminApi.approveBOQ(boqId, { approved: true });
      showSuccess('BOQ approved successfully');
      fetchBOQs();
    } catch (error: any) {
      showError('Failed to approve BOQ', {
        description: error.response?.data?.error || error.message
      });
    }
  };

  const handleRejectBOQ = async (boqId: number) => {
    try {
      await adminApi.approveBOQ(boqId, { approved: false });
      showSuccess('BOQ rejected');
      fetchBOQs();
    } catch (error: any) {
      showError('Failed to reject BOQ', {
        description: error.response?.data?.error || error.message
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-[#243d8a]" />
              BOQ Management
            </h1>
            <p className="text-gray-500 mt-1">Create, view, edit and approve Bills of Quantities</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchBOQs}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Refresh
            </button>
            <button
              onClick={handleCreateBOQ}
              className="flex items-center gap-2 px-6 py-3 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors shadow-md"
            >
              <Plus className="w-5 h-5" />
              Create BOQ
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <span className="text-sm text-gray-500">
              {boqs.length} BOQ{boqs.length !== 1 ? 's' : ''} found
            </span>
          </div>
        </div>

        {/* BOQ List */}
        {isLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex items-center justify-center">
            <ModernLoadingSpinners variant="pulse-wave" size="lg" />
          </div>
        ) : boqs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No BOQs found</p>
            <button
              onClick={handleCreateBOQ}
              className="mt-4 px-6 py-2 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors"
            >
              Create First BOQ
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {boqs.map((boq, index) => (
              <motion.div
                key={boq.boq_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{boq.project_name}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${getStatusColor(boq.status)}`}>
                        {getStatusIcon(boq.status)}
                        {boq.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">v{boq.version}</span>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 mb-1">BOQ ID</p>
                        <p className="font-medium text-gray-900">#{boq.boq_id}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Project ID</p>
                        <p className="font-medium text-gray-900">#{boq.project_id}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Created By</p>
                        <p className="font-medium text-gray-900">{boq.created_by}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Total Amount</p>
                        <p className="font-medium text-[#243d8a]">AED{(boq.total_amount / 100000).toFixed(2)}L</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span>Created: {new Date(boq.created_at).toLocaleDateString()}</span>
                      <span>Updated: {new Date(boq.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleViewBOQ(boq.boq_id)}
                      className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                      title="View BOQ"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                      title="Edit BOQ"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-gray-50 text-gray-600 rounded-lg transition-colors"
                      title="Download BOQ"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-gray-50 text-gray-600 rounded-lg transition-colors"
                      title="Send Email"
                    >
                      <Mail className="w-5 h-5" />
                    </button>
                    {boq.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApproveBOQ(boq.boq_id)}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectBOQ(boq.boq_id)}
                          className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BOQManagement;
