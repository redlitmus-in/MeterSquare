import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, User } from 'lucide-react';
import { changeRequestService } from '@/services/changeRequestService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface Buyer {
  user_id: number;
  full_name: string;
  email: string;
  username: string;
  is_active: boolean;
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

  // Track selected buyer for offline email hint
  const selectedBuyer = buyers.find(b => b.user_id === selectedBuyerId) ?? null;
  const isSelectedBuyerOffline = selectedBuyer ? selectedBuyer.is_active !== true : false;

  useEffect(() => {
    if (isOpen) {
      fetchBuyers();
      // Disable background scrolling when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      // Re-enable background scrolling when modal is closed
      document.body.style.overflow = 'unset';
    }

    // Cleanup function to ensure overflow is reset
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const fetchBuyers = async () => {
    setFetchingBuyers(true);
    try {
      const response = await changeRequestService.getAllBuyers();
      if (response.success) {
        setBuyers(response.buyers);
        // Auto-select if only one buyer exists (online or offline)
        if (response.buyers.length === 1) {
          setSelectedBuyerId(response.buyers[0].user_id);
        }
      } else {
        showError(response.message || 'Failed to load buyers');
      }
    } catch (error) {
      showError('Failed to load buyers');
    } finally {
      setFetchingBuyers(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedBuyerId) {
      showError('Please select a buyer');
      return;
    }

    setLoading(true);
    try {
      // Get edited materials if estimator updated prices
      const editedMaterials = (window as any).__editedMaterials;

      const response = await changeRequestService.approve(
        crId,
        comments || 'Approved',
        selectedBuyerId,
        editedMaterials // Pass updated materials with prices
      );

      // Clean up temp storage
      if (editedMaterials) {
        delete (window as any).__editedMaterials;
      }

      if (response.success) {
        showSuccess(response.message || 'Request approved and assigned to buyer');
        onSuccess();
        onClose();
      } else {
        showError(response.message || 'Failed to approve request');
      }
    } catch (error) {
      showError('Failed to approve request');
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
            className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] max-h-[85vh] max-h-[90vh] overflow-hidden flex flex-col flex flex-col"
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
            <div className="p-6 overflow-y-auto flex-1 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
                      Assign to Procurement <span className="text-red-500">*</span>
                    </label>
                    {buyers.length === 0 ? (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          No buyers available in the system. Please contact administrator.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto p-3 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {/* Online Buyers Section */}
                        {buyers.filter(b => b.is_active === true).length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <User className="w-4 h-4 text-green-600" />
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <h3 className="text-xs font-bold text-green-700 uppercase tracking-wide">Online</h3>
                              <div className="flex-1 h-px bg-green-200"></div>
                            </div>
                            <div className="space-y-2">
                              {buyers.filter(b => b.is_active === true).map((buyer) => (
                          <div
                            key={buyer.user_id}
                            onClick={() => setSelectedBuyerId(buyer.user_id)}
                            className={`
                              flex items-center gap-3 p-3 cursor-pointer transition-colors rounded-lg border-2
                              ${selectedBuyerId === buyer.user_id ? 'bg-green-50 border-green-500' : 'border-gray-200 hover:border-gray-300 bg-white'}
                            `}
                          >
                            {/* Online Status Indicator */}
                            <div className="relative">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                                {buyer.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div
                                className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white bg-green-500"
                                title="Online"
                              />
                            </div>

                            {/* Buyer Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {buyer.full_name}
                                </p>
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 flex items-center gap-1 bg-green-100 text-green-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                  Online
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 truncate">{buyer.email}</p>
                            </div>

                            {/* Selected Checkmark */}
                            {selectedBuyerId === buyer.user_id && (
                              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                            </div>
                          </div>
                        )}

                        {/* Offline Buyers Section */}
                        {buyers.filter(b => b.is_active !== true).length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Offline</h3>
                              <div className="flex-1 h-px bg-gray-200"></div>
                            </div>
                            <div className="space-y-2">
                              {buyers.filter(b => b.is_active !== true).map((buyer) => (
                          <div
                            key={buyer.user_id}
                            onClick={() => setSelectedBuyerId(buyer.user_id)}
                            className={`
                              flex items-center gap-3 p-3 cursor-pointer transition-colors rounded-lg border-2
                              ${selectedBuyerId === buyer.user_id
                                ? 'bg-gray-100 border-gray-400'
                                : 'border-gray-200 hover:border-gray-300 bg-white'}
                            `}
                          >
                            {/* Offline Status Indicator */}
                            <div className="relative">
                              <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white font-semibold">
                                {buyer.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div
                                className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white bg-gray-400"
                                title="Offline"
                              />
                            </div>

                            {/* Buyer Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-700 truncate">
                                  {buyer.full_name}
                                </p>
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 flex items-center gap-1 bg-gray-200 text-gray-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                  Offline
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 truncate">{buyer.email}</p>
                            </div>

                            {/* Selected Checkmark */}
                            {selectedBuyerId === buyer.user_id && (
                              <CheckCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {isSelectedBuyerOffline ? (
                      <p className="text-xs mt-2 text-amber-600 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        This buyer is offline. An email notification will be sent to notify them.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">
                        The selected procurement team will be notified to complete the purchase
                      </p>
                    )}
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
                      <strong>Note:</strong> Approving this request will assign it to the selected procurement team for purchase and merge the materials into the BOQ.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 flex-shrink-0">
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

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(ApprovalWithBuyerModal);
