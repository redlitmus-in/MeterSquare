import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { buyerVendorService, VendorProduct } from '@/roles/buyer/services/buyerVendorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: number;
  onProductAdded: (product: VendorProduct) => void;
  editProduct?: VendorProduct | null;
}

const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  onProductAdded,
  editProduct
}) => {
  const [formData, setFormData] = useState<Partial<VendorProduct>>({
    product_name: '',
    category: '',
    description: '',
    unit: '',
    unit_price: undefined
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [customUnit, setCustomUnit] = useState('');
  const [showCustomUnit, setShowCustomUnit] = useState(false);

  // Comprehensive universal units list
  const units = [
    // Count/Quantity
    'Piece', 'Pcs', 'Unit', 'Each', 'Nos', 'Number', 'Item',
    // Weight
    'Kg', 'Kilogram', 'Gram', 'g', 'mg', 'Milligram', 'Ton', 'Metric Ton', 'Pound', 'lb', 'Ounce', 'oz',
    // Volume
    'Liter', 'L', 'Milliliter', 'ml', 'Gallon', 'Cubic Meter', 'm³', 'Cubic Feet', 'ft³', 'Barrel',
    // Length
    'Meter', 'm', 'Centimeter', 'cm', 'Millimeter', 'mm', 'Kilometer', 'km', 'Feet', 'ft', 'Inch', 'in', 'Yard', 'yd',
    // Area
    'Sq Meter', 'm²', 'Sq Feet', 'ft²', 'Sq Yard', 'Sq Inch', 'Acre', 'Hectare',
    // Packaging
    'Box', 'Carton', 'Case', 'Pack', 'Packet', 'Bundle', 'Bag', 'Sack', 'Pallet', 'Container',
    // Roll/Sheet
    'Roll', 'Sheet', 'Ream', 'Coil',
    // Set/Pair
    'Set', 'Pair', 'Dozen', 'Gross',
    // Construction specific
    'Bag (50kg)', 'Bag (25kg)', 'CFT', 'RFT', 'Running Feet', 'Running Meter', 'Brass', 'Load', 'Trip',
    // Time based (for services)
    'Hour', 'Day', 'Week', 'Month',
    // Custom option
    'Other (Custom)'
  ];

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (editProduct) {
      setFormData(editProduct);
    } else {
      resetForm();
    }
  }, [editProduct, isOpen]);

  const loadCategories = async () => {
    try {
      const cats = await buyerVendorService.getVendorCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories(buyerVendorService.getDefaultCategories());
    }
  };

  const resetForm = () => {
    setFormData({
      product_name: '',
      category: '',
      description: '',
      unit: '',
      unit_price: undefined
    });
    setErrors([]);
    setCustomUnit('');
    setShowCustomUnit(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Handle numeric fields
    if (name === 'unit_price') {
      const numValue = value === '' ? undefined : parseFloat(value);
      setFormData(prev => ({ ...prev, [name]: numValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const validateForm = (): boolean => {
    const validationErrors: string[] = [];

    if (!formData.product_name?.trim()) {
      validationErrors.push('Product name is required');
    }

    if (formData.unit_price !== undefined && formData.unit_price < 0) {
      validationErrors.push('Unit price cannot be negative');
    }

    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      let product: VendorProduct;

      if (editProduct && editProduct.product_id) {
        // Update existing product
        product = await buyerVendorService.updateVendorProduct(vendorId, editProduct.product_id, formData);
        showSuccess('Product updated successfully');
      } else {
        // Add new product
        product = await buyerVendorService.addVendorProduct(vendorId, formData as Omit<VendorProduct, 'product_id' | 'vendor_id'>);
        showSuccess('Product added successfully');
      }

      onProductAdded(product);
      onClose();
      resetForm();
    } catch (error: any) {
      console.error('Error saving product:', error);
      showError(error.message || 'Failed to save product');
      setErrors([error.message || 'Failed to save product']);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl z-50"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">
                  {editProduct ? 'Edit Product' : 'Add New Product'}
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6">
              {/* Error Messages */}
              {errors.length > 0 && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <ul className="list-disc list-inside text-sm text-red-700">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4">
                {/* Product Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product/Service Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="product_name"
                    value={formData.product_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter product or service name"
                    required
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Enter product description, specifications, etc."
                  />
                </div>

                {/* Unit and Unit Price */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-2">
                      Unit
                    </label>
                    {!showCustomUnit ? (
                      <select
                        id="unit"
                        name="unit"
                        value={formData.unit}
                        onChange={(e) => {
                          if (e.target.value === 'Other (Custom)') {
                            setShowCustomUnit(true);
                            setFormData(prev => ({ ...prev, unit: '' }));
                          } else {
                            handleInputChange(e);
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Unit</option>
                        {units.map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customUnit}
                          onChange={(e) => {
                            setCustomUnit(e.target.value);
                            setFormData(prev => ({ ...prev, unit: e.target.value }));
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Enter custom unit (e.g., Bundle, Drum)"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowCustomUnit(false);
                            setCustomUnit('');
                            setFormData(prev => ({ ...prev, unit: '' }));
                          }}
                          className="px-3 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                          title="Back to list"
                        >
                          ←
                        </button>
                      </div>
                    )}
                    {!showCustomUnit && (
                      <p className="text-xs text-gray-500 mt-1">
                        Can't find your unit? Select "Other (Custom)" to enter manually
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="unit_price" className="block text-sm font-medium text-gray-700 mb-2">
                      Unit Price (AED)
                    </label>
                    <input
                      id="unit_price"
                      type="number"
                      name="unit_price"
                      value={formData.unit_price ?? ''}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : editProduct ? 'Update Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

// Performance optimization: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(AddProductModal, (prevProps, nextProps) => {
  return prevProps.isOpen === nextProps.isOpen &&
         prevProps.vendorId === nextProps.vendorId &&
         prevProps.editProduct?.product_id === nextProps.editProduct?.product_id;
});
