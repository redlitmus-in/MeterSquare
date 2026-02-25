import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Package, X, CheckCircle, XCircle, Check, Store } from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Purchase, StoreAvailabilityResponse } from '../services/buyerService';

interface StoreAvailabilityModalProps {
  isOpen: boolean;
  purchase: Purchase | null;
  storeAvailability: StoreAvailabilityResponse | null;
  checkingStoreAvailability: boolean;
  completingFromStore: boolean;
  selectedStoreMaterials: Set<string>;
  onToggleMaterial: (materialName: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const StoreAvailabilityModal: React.FC<StoreAvailabilityModalProps> = ({
  isOpen,
  purchase,
  storeAvailability,
  checkingStoreAvailability,
  completingFromStore,
  selectedStoreMaterials,
  onToggleMaterial,
  onClose,
  onConfirm,
}) => {
  const handleClose = () => {
    if (completingFromStore) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="bg-red-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-200 rounded-lg">
                    <Package className="w-5 h-5 text-red-700" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-red-800">Get from M2 Store</h2>
                    <p className="text-sm text-red-600">PO-{purchase?.cr_id}</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1 hover:bg-red-200 rounded-lg transition-colors"
                  disabled={completingFromStore}
                >
                  <X className="w-5 h-5 text-red-700" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {checkingStoreAvailability ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <ModernLoadingSpinners />
                  <p className="mt-4 text-gray-600">Checking store availability...</p>
                </div>
              ) : storeAvailability ? (
                <div className="space-y-4">
                  {/* Status Summary */}
                  <div className={`p-4 rounded-lg border ${
                    storeAvailability.can_complete_from_store
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {storeAvailability.can_complete_from_store ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="font-semibold text-green-800">All materials available in store!</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-5 h-5 text-red-600" />
                          <span className="font-semibold text-red-800">Some materials not available</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Available Materials - Clickable/Selectable */}
                  {storeAvailability.available_materials.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          Available ({storeAvailability.available_materials.length})
                        </h3>
                        <span className="text-xs text-gray-500">
                          {selectedStoreMaterials.size} selected
                        </span>
                      </div>
                      <div className="space-y-2">
                        {storeAvailability.available_materials.map((mat, idx) => {
                          const isSelected = selectedStoreMaterials.has(mat.material_name);
                          return (
                            <div
                              key={idx}
                              onClick={() => onToggleMaterial(mat.material_name)}
                              className={`rounded-lg p-3 cursor-pointer transition-all border-2 ${
                                isSelected
                                  ? 'bg-green-100 border-green-500 shadow-sm'
                                  : 'bg-green-50 border-green-200 hover:border-green-400'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {/* Checkbox */}
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? 'bg-green-600 border-green-600'
                                    : 'bg-white border-gray-300'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                {/* Material Info */}
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900 text-sm">{mat.material_name}</div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    Required: {mat.required_quantity} | In Store: {mat.available_quantity}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Already Sent Materials - Show with status */}
                  {storeAvailability.already_sent_materials && storeAvailability.already_sent_materials.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <Store className="w-4 h-4 text-purple-600" />
                        Already Sent to Store ({storeAvailability.already_sent_materials.length})
                      </h3>
                      <p className="text-xs text-gray-500 mb-2">These materials have already been requested</p>
                      <div className="space-y-2">
                        {storeAvailability.already_sent_materials.map((mat: any, idx: number) => (
                          <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3 opacity-80">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-gray-900 text-sm">{mat.material_name}</div>
                              <span className="text-xs px-2 py-0.5 rounded bg-purple-200 text-purple-800 capitalize">
                                {mat.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              Required: {mat.required_quantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unavailable Materials - Not selectable */}
                  {storeAvailability.unavailable_materials.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        Not Available ({storeAvailability.unavailable_materials.length})
                      </h3>
                      <p className="text-xs text-gray-500 mb-2">These materials need to be ordered from vendor</p>
                      <div className="space-y-2">
                        {storeAvailability.unavailable_materials.map((mat, idx) => (
                          <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3 opacity-70">
                            <div className="font-medium text-gray-900 text-sm">{mat.material_name}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              Required: {mat.required_quantity} | In Store: {mat.available_quantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between">
                {/* Selection info */}
                <div className="text-sm text-gray-600">
                  {selectedStoreMaterials.size > 0 ? (
                    <span className="text-green-700 font-medium">
                      {selectedStoreMaterials.size} material{selectedStoreMaterials.size !== 1 ? 's' : ''} selected for store
                    </span>
                  ) : (
                    <span className="text-gray-500">Select materials to request from store</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    disabled={completingFromStore}
                  >
                    Cancel
                  </Button>
                  {/* Show button when there are available materials (even if some unavailable) */}
                  {storeAvailability && storeAvailability.available_materials.length > 0 && (
                    <Button
                      onClick={onConfirm}
                      disabled={completingFromStore || selectedStoreMaterials.size === 0}
                      className="bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50"
                    >
                      {completingFromStore ? (
                        <>
                          <ModernLoadingSpinners size="xs" className="mr-2" />
                          Sending Request...
                        </>
                      ) : (
                        <>
                          <Package className="w-4 h-4 mr-2" />
                          Request Selected ({selectedStoreMaterials.size})
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(StoreAvailabilityModal);
