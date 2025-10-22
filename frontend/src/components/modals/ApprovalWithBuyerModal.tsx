import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, User } from 'lucide-react';
import { changeRequestService } from '@/services/changeRequestService';
import { toast } from 'sonner';
import Mod ernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface Buyer {
  user_id: number;
  full_name: string;
  email: string;
  username: string;
}

interface ApprovalWithBuyerModalProps {
  isOpen: boolean;
  onClose: () => void;
  crId: number;
  crName?: string;
  onSuccess: () => void;
}

const ApprovalWithBuyerModal: React.FC<ApprovalWithBuyerModalProps> = ({
  isOpen,
  onClose,
  crId,
  crName = `CR-${crId}`,
  onSuccess
}) => {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingBuyers, setFetchingBuyers] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchBuyers();
    }
  }, [isOpen]);

  const fetchBuyers = async () => {
    setFetchingBuyers(true);
    try {
      const response = await changeRequestService.getAllBuyers();
      if (response.success) {
        setBuyers(response.buyers);
        // Auto-select first buyer if only one exists
        if (response.buyers.length === 1) {
          setSelectedBuyerId(response.buyers[0].user_id);
        }
      } else {
        toast.error(response.message || 'Failed to load buyers');
      }
    } catch (error) {
      toast.error('Failed to load buyers');
    } finally {
      setFetchingBuyers(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedBuyerId) {
      toast.error('Please select a buyer');
      return;
    }

    setLoading(true);
    try {
      const response = await changeRequestService.approve(crId, comments || 'Approved', selectedBuyerId);
      if (response.success) {
        toast.success(response.message || 'Request approved and assigned to buyer');
        onSuccess();
        onClose();
      } else {
        toast.error(response.message || 'Failed to approve request');
      }
    } catch (error) {
      toast.error('Failed to approve request');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-green-500 to-green-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      Approve Change Request
                    </h2>
                    <p className="text-sm text-white/90 mt-1">
                      {crName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {fetchingBuyers ? (
                <div className="flex items-center justify-center py-8">
                  <ModernLoadingSpinners variant="dots" size="medium" color="primary" />
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Buyer Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Assign to Buyer <span className="text-red-500">*</span>
                    </label>
                    {buyers.length === 0 ? (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          No buyers available in the system. Please contact administrator.
                        </p>
                      </div>
                    ) : (
                      <select
                        value={selectedBuyerId || ''}
                        onChange={(e) => setSelectedBuyerId(Number(e.target.value))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                        required
                      >
                        <option value="">Select a buyer</option>
                        {buyers.map(buyer => (
                          <option key={buyer.user_id} value={buyer.user_id}>
                            {buyer.full_name} ({buyer.email})
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      The selected buyer will be notified to complete the purchase
                    </p>
                  </div>

                  {/* Comments (Optional) */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Comments (Optional)
                    </label>
                    <textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Add any approval notes..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm resize-none"
                    />
                  </div>

                  {/* Info Box */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> Approving this request will assign it to the selected buyer for purchase and merge the materials into the BOQ.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={loading || !selectedBuyerId || fetchingBuyers}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <ModernLoadingSpinners variant="dots" size="small" color="white" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Approve & Assign
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  );
};

export default ApprovalWithBuyerModal;
