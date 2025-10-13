import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingCartIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useParams } from 'react-router-dom';

// This page handles purchase request approvals for Project Managers
// Data will come from backend once endpoints are ready

interface PurchaseRequest {
  id: number;
  project_name: string;
  item_name: string;
  quantity: number;
  estimated_cost: number;
  requested_by: string;
  request_date: string;
  status: 'pending' | 'approved' | 'rejected';
  description?: string;
}

const PurchaseApprovalsPage: React.FC = () => {
  const { purchaseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [purchase, setPurchase] = useState<PurchaseRequest | null>(null);

  useEffect(() => {
    loadPurchaseDetails();
  }, [purchaseId]);

  const loadPurchaseDetails = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call when backend endpoint is ready
      // const response = await projectManagerService.getPurchaseRequest(purchaseId);
      // setPurchase(response.data);

      setPurchase(null);
    } catch (error) {
      console.error('Error loading purchase details:', error);
      toast.error('Failed to load purchase request');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      // TODO: Replace with actual API call
      // await projectManagerService.approvePurchase(purchaseId);
      toast.success('Purchase request approved');
    } catch (error) {
      console.error('Error approving purchase:', error);
      toast.error('Failed to approve purchase');
    }
  };

  const handleReject = async () => {
    try {
      // TODO: Replace with actual API call
      // await projectManagerService.rejectPurchase(purchaseId);
      toast.success('Purchase request rejected');
    } catch (error) {
      console.error('Error rejecting purchase:', error);
      toast.error('Failed to reject purchase');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading purchase details...</p>
        </div>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                <ShoppingCartIcon className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-blue-900">Purchase Approval</h1>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <ShoppingCartIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Purchase Request Found</h3>
            <p className="text-gray-500">
              Purchase approval data will be loaded from the backend API when the endpoint is ready.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
              <ShoppingCartIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-blue-900">Purchase Approval</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Purchase Details Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Purchase Request #{purchase.id}</h2>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                purchase.status === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : purchase.status === 'rejected'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Project</label>
                <div className="flex items-center gap-2 mt-1">
                  <BuildingOfficeIcon className="w-5 h-5 text-blue-600" />
                  <p className="font-medium text-gray-900">{purchase.project_name}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Item</label>
                <p className="font-medium text-gray-900 mt-1">{purchase.item_name}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Quantity</label>
                <p className="font-medium text-gray-900 mt-1">{purchase.quantity}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Estimated Cost</label>
                <div className="flex items-center gap-2 mt-1">
                  <CurrencyDollarIcon className="w-5 h-5 text-green-600" />
                  <p className="font-medium text-gray-900">AED{purchase.estimated_cost.toLocaleString()}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Requested By</label>
                <p className="font-medium text-gray-900 mt-1">{purchase.requested_by}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Request Date</label>
                <div className="flex items-center gap-2 mt-1">
                  <CalendarIcon className="w-5 h-5 text-gray-600" />
                  <p className="font-medium text-gray-900">{purchase.request_date}</p>
                </div>
              </div>
            </div>
          </div>

          {purchase.description && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <label className="text-sm font-medium text-gray-500">Description</label>
              <p className="text-gray-700 mt-2">{purchase.description}</p>
            </div>
          )}

          {purchase.status === 'pending' && (
            <div className="flex gap-4 mt-8">
              <button
                onClick={handleApprove}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
              >
                <CheckCircleIcon className="w-5 h-5" />
                Approve
              </button>
              <button
                onClick={handleReject}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                <XCircleIcon className="w-5 h-5" />
                Reject
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default PurchaseApprovalsPage;
