import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Store,
  Search,
  Package,
  Mail,
  Phone,
  MapPin,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Purchase, buyerService } from '../services/buyerService';
import { buyerVendorService, Vendor } from '../services/buyerVendorService';
import { toast } from 'sonner';

interface VendorSelectionModalProps {
  purchase: Purchase;
  isOpen: boolean;
  onClose: () => void;
  onVendorSelected?: () => void;
}

const VendorSelectionModal: React.FC<VendorSelectionModalProps> = ({
  purchase,
  isOpen,
  onClose,
  onVendorSelected
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [isSelectingVendor, setIsSelectingVendor] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadVendors();
    }
  }, [isOpen]);

  const loadVendors = async () => {
    try {
      setLoadingVendors(true);
      const response = await buyerVendorService.getAllVendors({
        status: 'active',
        per_page: 100
      });
      setVendors(response.vendors);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoadingVendors(false);
    }
  };

  // Filter vendors based on search and material categories
  const filteredVendors = useMemo(() => {
    let filtered = vendors;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(vendor =>
        vendor.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.contact_person_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Get unique categories from purchase materials
    const materialCategories = purchase.materials
      .map(m => m.material_name.toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i);

    // Prioritize vendors whose category matches material types
    const relevantVendors = filtered.filter(vendor =>
      vendor.category && materialCategories.some(cat =>
        vendor.category!.toLowerCase().includes(cat) ||
        cat.includes(vendor.category!.toLowerCase())
      )
    );

    const otherVendors = filtered.filter(vendor => !relevantVendors.includes(vendor));

    return [...relevantVendors, ...otherVendors];
  }, [vendors, searchTerm, purchase.materials]);

  const handleSelectVendor = () => {
    if (!selectedVendorId) {
      toast.error('Please select a vendor');
      return;
    }

    const selectedVendor = vendors.find(v => v.vendor_id === selectedVendorId);
    if (!selectedVendor) {
      toast.error('Vendor not found');
      return;
    }

    // Show confirmation dialog
    setShowConfirmation(true);
  };

  const handleConfirmSelection = async () => {
    try {
      setIsSelectingVendor(true);
      setShowConfirmation(false);
      await buyerService.selectVendor({
        cr_id: purchase.cr_id,
        vendor_id: selectedVendorId!
      });
      toast.success('Vendor selection sent to TD for approval!');
      onVendorSelected?.();
      onClose();
    } catch (error: any) {
      console.error('Error selecting vendor:', error);
      toast.error(error.message || 'Failed to select vendor');
    } finally {
      setIsSelectingVendor(false);
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-5 border-b border-blue-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Store className="w-6 h-6 text-blue-600" />
                      <h2 className="text-2xl font-bold text-gray-900">
                        Select Vendor
                      </h2>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Purchase Order:</span> CR #{purchase.cr_id} - {purchase.item_name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Required Materials: {purchase.materials_count} items
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {/* Materials Summary */}
                <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-5 h-5 text-purple-600" />
                    <h3 className="text-sm font-semibold text-purple-800">Required Materials</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {purchase.materials.slice(0, 4).map((material, idx) => (
                      <div key={idx} className="text-xs text-purple-900">
                        <span className="font-medium">{material.material_name}</span>
                        <span className="text-purple-600"> - {material.quantity} {material.unit}</span>
                      </div>
                    ))}
                    {purchase.materials.length > 4 && (
                      <div className="text-xs text-purple-600 italic">
                        +{purchase.materials.length - 4} more items...
                      </div>
                    )}
                  </div>
                </div>

                {/* Search Bar */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search vendors by name, category, or contact..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 border-gray-200 focus:border-blue-300 focus:ring-0 text-sm"
                    />
                  </div>
                </div>

                {/* Info Banner */}
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-900">
                    <span className="font-medium">Note:</span> Vendors are prioritized based on their category matching your required materials. Selection requires TD approval.
                  </div>
                </div>

                {/* Vendors List */}
                {loadingVendors ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredVendors.length === 0 ? (
                  <div className="text-center py-12">
                    <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No vendors found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 mb-6">
                    {filteredVendors.map((vendor) => {
                      const isSelected = selectedVendorId === vendor.vendor_id;
                      const isRelevant = vendor.category && purchase.materials.some(m =>
                        vendor.category!.toLowerCase().includes(m.material_name.toLowerCase()) ||
                        m.material_name.toLowerCase().includes(vendor.category!.toLowerCase())
                      );

                      return (
                        <motion.div
                          key={vendor.vendor_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => setSelectedVendorId(vendor.vendor_id!)}
                          className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold text-gray-900">{vendor.company_name}</h4>
                                {isRelevant && (
                                  <Badge className="bg-green-100 text-green-800 text-xs">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Relevant
                                  </Badge>
                                )}
                                {vendor.category && (
                                  <Badge className="bg-purple-100 text-purple-800 text-xs">
                                    {vendor.category}
                                  </Badge>
                                )}
                              </div>

                              <div className="space-y-1 text-xs text-gray-600">
                                {vendor.contact_person_name && (
                                  <div>Contact: {vendor.contact_person_name}</div>
                                )}
                                {vendor.email && (
                                  <div className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {vendor.email}
                                  </div>
                                )}
                                {vendor.phone && (
                                  <div className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {vendor.phone_code} {vendor.phone}
                                  </div>
                                )}
                                {vendor.city && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {vendor.city}{vendor.country ? `, ${vendor.country}` : ''}
                                  </div>
                                )}
                              </div>

                              {vendor.products_count && vendor.products_count > 0 && (
                                <div className="mt-2 text-xs text-gray-500">
                                  <Package className="w-3 h-3 inline mr-1" />
                                  {vendor.products_count} products/services available
                                </div>
                              )}
                            </div>

                            <div className="flex-shrink-0">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-gray-300'
                              }`}>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  {selectedVendorId && (
                    <span className="font-medium text-blue-600">
                      Vendor selected: {vendors.find(v => v.vendor_id === selectedVendorId)?.company_name}
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={onClose}
                    variant="outline"
                    className="px-6"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSelectVendor}
                    disabled={!selectedVendorId || isSelectingVendor}
                    className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSelectingVendor ? (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Sending for Approval...
                      </>
                    ) : (
                      <>
                        <Store className="w-4 h-4 mr-2" />
                        Send to TD for Approval
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Confirmation Dialog */}
          <AnimatePresence>
            {showConfirmation && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                  onClick={handleCancelConfirmation}
                />
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Confirmation Header */}
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500 rounded-full">
                          <AlertCircle className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Confirm Vendor Selection</h3>
                      </div>
                    </div>

                    {/* Confirmation Body */}
                    <div className="px-6 py-5">
                      <p className="text-gray-700 mb-4">
                        Are you sure you want to select <span className="font-semibold text-gray-900">"{vendors.find(v => v.vendor_id === selectedVendorId)?.company_name}"</span> for this purchase order?
                      </p>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-900">
                          <AlertCircle className="w-4 h-4 inline mr-1.5" />
                          This selection will be sent to the <span className="font-semibold">Technical Director</span> for approval.
                        </p>
                      </div>
                    </div>

                    {/* Confirmation Footer */}
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                      <Button
                        onClick={handleCancelConfirmation}
                        variant="outline"
                        className="px-6"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleConfirmSelection}
                        className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Confirm & Send
                      </Button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};

export default VendorSelectionModal;
