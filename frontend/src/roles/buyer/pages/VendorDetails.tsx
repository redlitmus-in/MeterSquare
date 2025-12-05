import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  CubeIcon
} from '@heroicons/react/24/outline';
import { buyerVendorService, Vendor, VendorProduct } from '@/roles/buyer/services/buyerVendorService';
import AddVendorModal from '@/components/buyer/AddVendorModal';
import AddProductModal from '@/components/buyer/AddProductModal';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { useAuthStore } from '@/store/authStore';
import { getRoleSlug } from '@/utils/roleRouting';

const VendorDetails: React.FC = () => {
  const { vendorId } = useParams<{ vendorId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Get role-specific vendor list path
  const roleSlug = getRoleSlug(user?.role_id || '');
  const vendorsPath = `/${roleSlug}/vendors`;

  // Get tax number label based on country
  const getTaxNumberLabel = (country: string) => {
    const taxInfo: Record<string, string> = {
      'India': 'GST Number',
      'UAE': 'VAT/TRN Number',
      'Saudi Arabia': 'VAT Number',
      'Qatar': 'Tax Number',
      'Kuwait': 'Tax Number',
      'Bahrain': 'Tax Number',
      'Oman': 'Tax Number',
      'UK': 'VAT Number',
      'USA': 'EIN (Employer ID)',
      'Canada': 'Business Number',
      'Australia': 'ABN/ACN',
      'Germany': 'VAT-ID (USt-IdNr)',
      'France': 'VAT Number',
      'Spain': 'NIF/CIF',
      'Italy': 'VAT Number',
      'Netherlands': 'VAT Number',
      'Singapore': 'GST Registration Number',
      'Malaysia': 'SST/GST Number',
      'China': 'Taxpayer ID',
      'Japan': 'Corporate Number',
      'South Korea': 'Business Registration Number',
      'Brazil': 'CNPJ',
      'Mexico': 'RFC',
      'South Africa': 'VAT Number',
      'New Zealand': 'GST Number',
      'Switzerland': 'UID/VAT',
      'Norway': 'Organization Number',
      'Sweden': 'Organization Number',
      'Denmark': 'CVR Number',
      'Finland': 'Business ID',
    };

    return taxInfo[country] || 'Tax/VAT Number';
  };

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);

  useEffect(() => {
    if (vendorId) {
      loadVendorDetails();
    }
  }, [vendorId]);

  const loadVendorDetails = async () => {
    if (!vendorId) return;

    try {
      setLoading(true);
      const vendorData = await buyerVendorService.getVendorById(parseInt(vendorId));
      setVendor(vendorData);
      setProducts(vendorData.products || []);
    } catch (error: any) {
      console.error('Error loading vendor details:', error);
      showError(error.message || 'Failed to load vendor details');
      navigate(vendorsPath);
    } finally {
      setLoading(false);
    }
  };

  const handleEditVendor = () => {
    setShowEditModal(true);
  };

  const handleVendorUpdated = (updatedVendor: Vendor) => {
    setVendor(updatedVendor);
    loadVendorDetails();
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setShowAddProductModal(true);
  };

  const handleEditProduct = (product: VendorProduct) => {
    setEditingProduct(product);
    setShowAddProductModal(true);
  };

  const handleProductAdded = () => {
    loadVendorDetails();
  };

  const handleDeleteProduct = async (product: VendorProduct) => {
    if (!vendorId || !product.product_id) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${product.product_name}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await buyerVendorService.deleteVendorProduct(parseInt(vendorId), product.product_id);
      showSuccess('Product deleted successfully');
      loadVendorDetails();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      showError(error.message || 'Failed to delete product');
    }
  };

  const handleDeleteVendor = async () => {
    if (!vendorId || !vendor) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${vendor.company_name}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await buyerVendorService.deleteVendor(parseInt(vendorId));
      showSuccess('Vendor deleted successfully');
      navigate(vendorsPath);
    } catch (error: any) {
      console.error('Error deleting vendor:', error);
      showError(error.message || 'Failed to delete vendor');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <ModernLoadingSpinners variant="pulse-wave" color="blue" />
          <p className="text-gray-600 mt-4">Loading vendor details...</p>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Vendor Not Found</h3>
          <button
            onClick={() => navigate(vendorsPath)}
            className="text-[#243d8a] hover:text-[#1e3270]"
          >
            Back to Vendors
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <button
          onClick={() => navigate(vendorsPath)}
          className="inline-flex items-center justify-center w-8 h-8 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors mb-4"
          title="Back to Vendors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                {vendor.company_name}
              </h1>
              <div className="flex flex-wrap gap-2">
                {vendor.category && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                    {vendor.category}
                  </span>
                )}
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    vendor.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {vendor.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleEditVendor}
                className="px-3 py-1.5 text-sm bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors flex items-center gap-1.5"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={handleDeleteVendor}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vendor Information */}
        <div className="lg:col-span-1">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm"
          >
            <h2 className="text-base font-bold text-gray-800 mb-3">Contact Information</h2>
            <div className="space-y-3">
              {vendor.contact_person_name && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Contact Person</p>
                  <p className="text-sm text-gray-800 font-medium">{vendor.contact_person_name}</p>
                </div>
              )}

              {vendor.email && (
                <div className="flex items-start gap-2">
                  <EnvelopeIcon className="w-4 h-4 text-[#243d8a] mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Email</p>
                    <p className="text-sm text-gray-800">{vendor.email}</p>
                  </div>
                </div>
              )}

              {vendor.phone && (
                <div className="flex items-start gap-2">
                  <PhoneIcon className="w-4 h-4 text-[#243d8a] mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Phone</p>
                    <p className="text-sm text-gray-800">
                      {vendor.phone_code} {vendor.phone}
                    </p>
                  </div>
                </div>
              )}

              {(vendor.street_address || vendor.city || vendor.state || vendor.country) && (
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-4 h-4 text-[#243d8a] mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Address</p>
                    <div className="text-sm text-gray-800">
                      {vendor.street_address && <p>{vendor.street_address}</p>}
                      {(vendor.city || vendor.state) && (
                        <p>
                          {vendor.city}
                          {vendor.city && vendor.state && ', '}
                          {vendor.state}
                        </p>
                      )}
                      {vendor.country && <p>{vendor.country}</p>}
                      {vendor.pin_code && <p>{vendor.pin_code}</p>}
                    </div>
                  </div>
                </div>
              )}

              {vendor.gst_number && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">{getTaxNumberLabel(vendor.country || 'UAE')}</p>
                  <p className="text-sm text-gray-800 font-mono">{vendor.gst_number}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Products/Services */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-800">Products & Services</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {products.length} {products.length === 1 ? 'item' : 'items'}
                </p>
              </div>
              <button
                onClick={handleAddProduct}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Product
              </button>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-12">
                <CubeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Products Added</h3>
                <p className="text-gray-500 mb-4">
                  Add products or services that this vendor provides
                </p>
                <button
                  onClick={handleAddProduct}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="w-5 h-5" />
                  Add Your First Product
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((product, index) => (
                  <motion.div
                    key={product.product_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                    className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          {product.product_name}
                        </h3>
                        {product.category && (
                          <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded mb-1.5">
                            {product.category}
                          </span>
                        )}
                        {product.description && (
                          <p className="text-xs text-gray-600 mt-1.5">{product.description}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-xs">
                          {product.unit && (
                            <div>
                              <span className="text-gray-500">Unit:</span>{' '}
                              <span className="text-gray-800 font-medium">{product.unit}</span>
                            </div>
                          )}
                          {product.unit_price !== undefined && product.unit_price !== null && (
                            <div>
                              <span className="text-gray-500">Price:</span>{' '}
                              <span className="text-gray-800 font-medium">
                                AED {product.unit_price.toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-3">
                        <button
                          onClick={() => handleEditProduct(product)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit product"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete product"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Edit Vendor Modal */}
      <AddVendorModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onVendorAdded={handleVendorUpdated}
        editVendor={vendor}
      />

      {/* Add/Edit Product Modal */}
      <AddProductModal
        isOpen={showAddProductModal}
        onClose={() => {
          setShowAddProductModal(false);
          setEditingProduct(null);
        }}
        vendorId={parseInt(vendorId || '0')}
        onProductAdded={handleProductAdded}
        editProduct={editingProduct}
      />
    </div>
  );
};

export default VendorDetails;
