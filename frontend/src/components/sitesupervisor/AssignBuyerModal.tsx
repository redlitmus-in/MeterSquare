import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, User } from 'lucide-react';
import { Buyer, getAvailableBuyers, assignBoqToBuyer } from '@/services/boqAssignmentService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface AssignBuyerModalProps {
  isOpen: boolean;
  onClose: () => void;
  boqId: number;
  boqName?: string;
  projectName?: string;
  onSuccess: () => void;
}

const AssignBuyerModal: React.FC<AssignBuyerModalProps> = ({
  isOpen,
  onClose,
  boqId,
  boqName = `BOQ-${boqId}`,
  projectName,
  onSuccess
}) => {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);
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
      const response = await getAvailableBuyers();
      setBuyers(response);
      // Auto-select first buyer if only one exists
      if (response.length === 1) {
        setSelectedBuyerId(response[0].user_id);
      }
    } catch (error) {
      toast.error('Failed to load buyers');
      console.error(error);
    } finally {
      setFetchingBuyers(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedBuyerId) {
      toast.error('Please select a buyer');
      return;
    }

    setLoading(true);
    try {
      const response = await assignBoqToBuyer(boqId, selectedBuyerId);
      if (response.success) {
        toast.success(response.message || 'BOQ assigned to buyer successfully');
        onSuccess();
        onClose();
      } else {
        toast.error(response.message || 'Failed to assign BOQ');
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to assign BOQ to buyer';
      toast.error(errorMessage);
      console.error(error);
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
            <div className="px-6 py-5 bg-gradient-to-r from-blue-500 to-blue-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Send className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      Assign BOQ to Procurement
                    </h2>
                    <p className="text-sm text-white/90 mt-1">
                      {boqName} {projectName && ` - ${projectName}`}
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
                      Select Procurement <span className="text-red-500">*</span>
                    </label>
                    {buyers.length === 0 ? (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          No buyers available in the system. Please contact administrator.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto p-3 space-y-2">
                        {buyers.map((buyer) => (
                          <div
                            key={buyer.user_id}
                            onClick={() => setSelectedBuyerId(buyer.user_id)}
                            className={`
                              flex items-center gap-3 p-3 cursor-pointer transition-colors rounded-lg border-2
                              ${selectedBuyerId === buyer.user_id
                                ? 'bg-blue-50 border-blue-500'
                                : 'border-gray-200 hover:border-gray-300 bg-white'}
                            `}
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                              {buyer.full_name.charAt(0).toUpperCase()}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {buyer.full_name}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{buyer.email}</p>
                            </div>

                            {selectedBuyerId === buyer.user_id && (
                              <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      The selected procurement team will receive all BOQ materials for purchase
                    </p>
                  </div>

                  {/* Info Box */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> All BOQ materials will be sent to the selected procurement team.
                      The procurement team will then select vendors and get TD approval before completing the purchase.
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
                onClick={handleAssign}
                disabled={loading || !selectedBuyerId || fetchingBuyers}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <ModernLoadingSpinners variant="dots" size="small" color="white" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Assign to Procurement
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

export default AssignBuyerModal;
