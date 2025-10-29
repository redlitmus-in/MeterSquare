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
  AlertCircle,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Purchase, buyerService } from '../services/buyerService';
import { buyerVendorService, Vendor, VendorProduct } from '../services/buyerVendorService';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';

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
  const { user } = useAuthStore();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorProducts, setVendorProducts] = useState<Map<number, VendorProduct[]>>(new Map());
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [isSelectingVendor, setIsSelectingVendor] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showVendorDetailsModal, setShowVendorDetailsModal] = useState(false);
  const [viewingVendor, setViewingVendor] = useState<Vendor | null>(null);
  const [viewingVendorProducts, setViewingVendorProducts] = useState<VendorProduct[]>([]);
  const [loadingVendorDetails, setLoadingVendorDetails] = useState(false);

  // Check if current user is Technical Director
  const isTechnicalDirector = user?.role?.toLowerCase().includes('technical') ||
                               user?.role?.toLowerCase().includes('director') ||
                               user?.role_name?.toLowerCase().includes('technical');

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

      // Fetch products for all vendors
      const productsMap = new Map<number, VendorProduct[]>();
      await Promise.all(
        response.vendors.map(async (vendor) => {
          if (vendor.vendor_id) {
            try {
              const products = await buyerVendorService.getVendorProducts(vendor.vendor_id);
              productsMap.set(vendor.vendor_id, products);
            } catch (error) {
              console.error(`Error loading products for vendor ${vendor.vendor_id}:`, error);
              productsMap.set(vendor.vendor_id, []);
            }
          }
        })
      );

      setVendorProducts(productsMap);
      setVendors(response.vendors);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoadingVendors(false);
    }
  };

  // Filter vendors based on search and material matching
  const filteredVendors = useMemo(() => {
    // Get required materials as keywords
    const requiredMaterials = purchase.materials
      .map(m => m.material_name.toLowerCase().trim())
      .filter(Boolean);

    // Filter vendors who have products matching the required materials
    let filtered = vendors.filter(vendor => {
      if (!vendor.vendor_id) return false;

      const products = vendorProducts.get(vendor.vendor_id) || [];

      // Vendor must have at least one product matching the required materials
      const hasMatchingProduct = products.some(product => {
        const productName = product.product_name?.toLowerCase() || '';
        const productCategory = product.category?.toLowerCase() || '';
        const vendorCategory = vendor.category?.toLowerCase() || '';

        // Check if product matches any required material
        return requiredMaterials.some(material => {
          // Match by product name, product category, or vendor category
          return productName.includes(material) ||
                 material.includes(productName) ||
                 productCategory.includes(material) ||
                 material.includes(productCategory) ||
                 vendorCategory.includes(material) ||
                 material.includes(vendorCategory);
        });
      });

      return hasMatchingProduct;
    });

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(vendor =>
        vendor.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.contact_person_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort by relevance: vendors with more matching products first
    filtered.sort((a, b) => {
      const aProducts = vendorProducts.get(a.vendor_id!) || [];
      const bProducts = vendorProducts.get(b.vendor_id!) || [];

      const aMatches = aProducts.filter(p =>
        requiredMaterials.some(m =>
          p.product_name?.toLowerCase().includes(m) ||
          m.includes(p.product_name?.toLowerCase() || '') ||
          p.category?.toLowerCase().includes(m) ||
          m.includes(p.category?.toLowerCase() || '')
        )
      ).length;

      const bMatches = bProducts.filter(p =>
        requiredMaterials.some(m =>
          p.product_name?.toLowerCase().includes(m) ||
          m.includes(p.product_name?.toLowerCase() || '') ||
          p.category?.toLowerCase().includes(m) ||
          m.includes(p.category?.toLowerCase() || '')
        )
      ).length;

      return bMatches - aMatches;
    });

    return filtered;
  }, [vendors, vendorProducts, searchTerm, purchase.materials]);

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
      const response = await buyerService.selectVendor({
        cr_id: purchase.cr_id,
        vendor_id: selectedVendorId!
      });
      toast.success(response.message || 'Vendor selection sent to TD for approval!');
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

  const handleViewVendorDetails = async (vendor: Vendor) => {
    try {
      setLoadingVendorDetails(true);
      setShowVendorDetailsModal(true);
      setViewingVendor(vendor);

      // Use cached vendor products
      if (vendor.vendor_id) {
        const products = vendorProducts.get(vendor.vendor_id) || [];
        setViewingVendorProducts(products);
      }
    } catch (error) {
      console.error('Error loading vendor details:', error);
      toast.error('Failed to load vendor details');
    } finally {
      setLoadingVendorDetails(false);
    }
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
                    <span className="font-medium">Smart Filtering:</span> Only showing vendors who have products matching your required materials. Vendors with more matches appear first.
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

                      // Calculate matching products
                      const requiredMaterials = purchase.materials
                        .map(m => m.material_name.toLowerCase().trim())
                        .filter(Boolean);

                      const vendorProductsList = vendorProducts.get(vendor.vendor_id!) || [];
                      const matchingProducts = vendorProductsList.filter(p =>
                        requiredMaterials.some(m =>
                          p.product_name?.toLowerCase().includes(m) ||
                          m.includes(p.product_name?.toLowerCase() || '') ||
                          p.category?.toLowerCase().includes(m) ||
                          m.includes(p.category?.toLowerCase() || '')
                        )
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
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h4 className="font-semibold text-gray-900">{vendor.company_name}</h4>
                                <Badge className="bg-green-100 text-green-800 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {matchingProducts.length} Matching
                                </Badge>
                                {vendor.category && (
                                  <Badge className="bg-purple-100 text-purple-800 text-xs">
                                    {vendor.category}
                                  </Badge>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewVendorDetails(vendor);
                                  }}
                                  className="ml-auto p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                                  title="View vendor details"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Details</span>
                                </button>
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

                              {/* Show matching products */}
                              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                                <div className="text-xs font-medium text-green-900 mb-1 flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  Matching Products ({matchingProducts.length})
                                </div>
                                <div className="space-y-0.5">
                                  {matchingProducts.slice(0, 3).map((product, idx) => (
                                    <div key={idx} className="text-[10px] text-green-800">
                                      • {product.product_name}
                                      {product.unit_price && (
                                        <span className="text-green-600"> - AED {product.unit_price}/{product.unit || 'unit'}</span>
                                      )}
                                    </div>
                                  ))}
                                  {matchingProducts.length > 3 && (
                                    <div className="text-[10px] text-green-600 italic">
                                      +{matchingProducts.length - 3} more matching products...
                                    </div>
                                  )}
                                </div>
                              </div>
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
                        {isTechnicalDirector ? 'Saving...' : 'Sending for Approval...'}
                      </>
                    ) : (
                      <>
                        <Store className="w-4 h-4 mr-2" />
                        {isTechnicalDirector ? 'Save & Approve' : 'Send to TD for Approval'}
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
                          {isTechnicalDirector ? (
                            <>This selection will be <span className="font-semibold">approved</span> and sent to the <span className="font-semibold">Buyer</span>.</>
                          ) : (
                            <>This selection will be sent to the <span className="font-semibold">Technical Director</span> for approval.</>
                          )}
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
                        {isTechnicalDirector ? 'Confirm & Approve' : 'Confirm & Send'}
                      </Button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>

          {/* Vendor Details Modal */}
          <AnimatePresence>
            {showVendorDetailsModal && viewingVendor && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80]"
                  onClick={() => {
                    setShowVendorDetailsModal(false);
                    setViewingVendor(null);
                    setViewingVendorProducts([]);
                  }}
                />
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 overflow-y-auto">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-4 border-b border-purple-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-500 rounded-full">
                            <Store className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{viewingVendor.company_name}</h3>
                            {viewingVendor.category && (
                              <Badge className="mt-1 bg-purple-200 text-purple-900">{viewingVendor.category}</Badge>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setShowVendorDetailsModal(false);
                            setViewingVendor(null);
                            setViewingVendorProducts([]);
                          }}
                          className="p-2 hover:bg-purple-200 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5 text-gray-600" />
                        </button>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
                      {loadingVendorDetails ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                          <span className="ml-3 text-gray-600">Loading details...</span>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {/* Contact Information */}
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <h4 className="font-semibold text-blue-900 mb-3 text-sm">Contact Information</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                              {viewingVendor.contact_person_name && (
                                <div>
                                  <span className="text-blue-700 font-medium">Contact Person:</span>
                                  <p className="text-gray-900">{viewingVendor.contact_person_name}</p>
                                </div>
                              )}
                              {viewingVendor.email && (
                                <div>
                                  <span className="text-blue-700 font-medium">Email:</span>
                                  <p className="text-gray-900 break-all">{viewingVendor.email}</p>
                                </div>
                              )}
                              {viewingVendor.phone && (
                                <div>
                                  <span className="text-blue-700 font-medium">Phone:</span>
                                  <p className="text-gray-900">{viewingVendor.phone_code} {viewingVendor.phone}</p>
                                </div>
                              )}
                              {viewingVendor.gst_number && (
                                <div>
                                  <span className="text-blue-700 font-medium">GST:</span>
                                  <p className="text-gray-900">{viewingVendor.gst_number}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Address */}
                          {(viewingVendor.street_address || viewingVendor.city || viewingVendor.country) && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                              <h4 className="font-semibold text-green-900 mb-2 text-sm flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                Address
                              </h4>
                              <p className="text-gray-900 text-sm">
                                {[
                                  viewingVendor.street_address,
                                  viewingVendor.city,
                                  viewingVendor.state,
                                  viewingVendor.country,
                                  viewingVendor.pin_code
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            </div>
                          )}

                          {/* Products/Services Table */}
                          {viewingVendorProducts.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
                                <Package className="w-4 h-4 text-purple-600" />
                                Products/Services ({viewingVendorProducts.length})
                              </h4>
                              <div className="overflow-x-auto rounded-lg border border-purple-200">
                                <table className="w-full text-sm">
                                  <thead className="bg-purple-50 border-b border-purple-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-semibold text-purple-900">Product Name</th>
                                      <th className="px-4 py-2 text-left font-semibold text-purple-900">Category</th>
                                      <th className="px-4 py-2 text-left font-semibold text-purple-900">Description</th>
                                      <th className="px-4 py-2 text-right font-semibold text-purple-900">Price</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {viewingVendorProducts.map((product, idx) => (
                                      <tr
                                        key={product.product_id}
                                        className={`${
                                          idx % 2 === 0 ? 'bg-white' : 'bg-purple-50/30'
                                        } border-b border-purple-100 last:border-b-0 hover:bg-purple-50 transition-colors`}
                                      >
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                          {product.product_name}
                                        </td>
                                        <td className="px-4 py-3">
                                          {product.category ? (
                                            <Badge className="bg-purple-200 text-purple-900 text-[10px]">
                                              {product.category}
                                            </Badge>
                                          ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 max-w-xs">
                                          {product.description ? (
                                            <span className="line-clamp-2 text-xs">{product.description}</span>
                                          ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-purple-900">
                                          {product.unit_price ? (
                                            <div className="text-xs">
                                              <div>AED {product.unit_price.toLocaleString()}</div>
                                              <div className="text-[10px] text-gray-500">per {product.unit || 'unit'}</div>
                                            </div>
                                          ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {viewingVendorProducts.length === 0 && !loadingVendorDetails && (
                            <div className="text-center py-8">
                              <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                              <p className="text-gray-500 text-sm">No products/services listed</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
                      <Button
                        onClick={() => {
                          setShowVendorDetailsModal(false);
                          setViewingVendor(null);
                          setViewingVendorProducts([]);
                        }}
                        variant="outline"
                        className="px-6"
                      >
                        Close
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
