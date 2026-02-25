import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Package, X, CheckCircle } from 'lucide-react';
import { showWarning } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { POChild } from '../services/buyerService';

interface SiteEngineerModalProps {
  isOpen: boolean;
  poChild: POChild | null;
  siteEngineers: Array<{ user_id: number; full_name: string; email: string }>;
  loadingSiteEngineers: boolean;
  completingPurchaseId: number | null;
  onClose: () => void;
  onComplete: (poChildId: number, notes: string, recipient: string) => Promise<boolean>;
}

const SiteEngineerModal: React.FC<SiteEngineerModalProps> = ({
  isOpen,
  poChild,
  siteEngineers,
  loadingSiteEngineers,
  completingPurchaseId,
  onClose,
  onComplete,
}) => {
  const [selectedSiteEngineer, setSelectedSiteEngineer] = useState<string>('');

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedSiteEngineer('');
    }
  }, [isOpen]);

  // Auto-select if only one site engineer available
  useEffect(() => {
    if (siteEngineers.length === 1) {
      setSelectedSiteEngineer(siteEngineers[0].full_name);
    }
  }, [siteEngineers]);

  const handleClose = () => {
    if (completingPurchaseId) return;
    setSelectedSiteEngineer('');
    onClose();
  };

  const handleComplete = async () => {
    if (!poChild) return;
    if (!selectedSiteEngineer) {
      showWarning('Please select or enter a site engineer name');
      return;
    }

    const success = await onComplete(poChild.id, '', selectedSiteEngineer);
    if (success) {
      setSelectedSiteEngineer('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && poChild && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Select Site Engineer</h2>
                    <p className="text-xs text-cyan-100">
                      Who will receive this delivery?
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={completingPurchaseId !== null}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Project Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm">
                  <span className="text-gray-600">Project:</span>
                  <span className="font-semibold text-gray-900 ml-2">
                    {poChild.project_name}
                  </span>
                </div>
                {poChild.project_code && (
                  <div className="text-xs text-gray-500 mt-1">
                    Code: {poChild.project_code}
                  </div>
                )}
              </div>

              {/* Requested By Info */}
              {poChild.requested_by_name && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-sm">
                    <span className="text-gray-600">Requested By:</span>
                    <span className="font-semibold text-gray-900 ml-2">
                      {poChild.requested_by_name}
                    </span>
                    {poChild.requested_by_role && (
                      <span className="text-xs text-gray-500 ml-1">
                        ({poChild.requested_by_role.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())})
                      </span>
                    )}
                  </div>
                  {poChild.requested_by_role &&
                   (poChild.requested_by_role.toLowerCase().includes('site') ||
                    poChild.requested_by_role.toLowerCase() === 'se') && (
                    <div className="mt-2 text-xs text-green-700 bg-green-100 px-3 py-2 rounded">
                      Tip: Consider delivering to <strong>{poChild.requested_by_name}</strong> since they requested these materials
                    </div>
                  )}
                </div>
              )}

              {/* Materials Summary */}
              {poChild.materials && poChild.materials.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Materials to be delivered:</h3>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {poChild.materials.map((mat, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs bg-white p-2 rounded border border-gray-100">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{mat.material_name}</div>
                          {mat.sub_item_name && (
                            <div className="text-gray-500 text-xs">{mat.sub_item_name}</div>
                          )}
                        </div>
                        <div className="text-right ml-2">
                          <div className="font-semibold text-gray-900">
                            {mat.quantity} {mat.unit}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading state */}
              {loadingSiteEngineers && (
                <div className="flex items-center justify-center py-8">
                  <ModernLoadingSpinners size="sm" />
                </div>
              )}

              {/* Site Engineer Selection */}
              {!loadingSiteEngineers && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Site Engineer / Recipient *
                  </label>

                  {siteEngineers.length > 0 ? (
                    <select
                      value={selectedSiteEngineer}
                      onChange={(e) => setSelectedSiteEngineer(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      disabled={completingPurchaseId !== null}
                    >
                      <option value="">Select Site Engineer</option>
                      {siteEngineers.map((se) => (
                        <option key={se.user_id} value={se.full_name}>
                          {se.full_name} ({se.email})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={selectedSiteEngineer}
                        onChange={(e) => setSelectedSiteEngineer(e.target.value)}
                        placeholder={poChild.requested_by_name || "Enter site engineer name"}
                        className="w-full px-4 py-3 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-orange-50"
                        disabled={completingPurchaseId !== null}
                      />
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-orange-600">
                          No site engineers assigned to this project. Please enter a name manually.
                        </p>
                        {poChild.requested_by_name &&
                         poChild.requested_by_role &&
                         (poChild.requested_by_role.toLowerCase().includes('site') ||
                          poChild.requested_by_role.toLowerCase() === 'se') && (
                          <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded">
                            <strong>Suggestion:</strong> Materials were requested by{' '}
                            <button
                              type="button"
                              onClick={() => setSelectedSiteEngineer(poChild.requested_by_name || '')}
                              className="underline font-semibold hover:text-blue-900"
                            >
                              {poChild.requested_by_name}
                            </button>
                            {' '}(Site Engineer)
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 rounded-b-2xl flex justify-end gap-3">
              <Button
                onClick={handleClose}
                disabled={completingPurchaseId !== null}
                variant="outline"
                className="px-4 py-2"
              >
                Cancel
              </Button>
              <Button
                onClick={handleComplete}
                disabled={completingPurchaseId !== null || !selectedSiteEngineer}
                className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700"
              >
                {completingPurchaseId === poChild.id ? (
                  <>
                    <ModernLoadingSpinners size="xs" className="mr-2" />
                    Completing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Complete & Send to Store
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(SiteEngineerModal);
