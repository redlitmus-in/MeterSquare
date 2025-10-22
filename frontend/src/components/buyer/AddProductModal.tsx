import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { buyerVendorService, VendorProduct } from '@/roles/buyer/services/buyerVendorService';
import { toast } from 'sonner';

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
  const [formData, setFormData] = useState<Partial<VendorProduct & { quantity?: number; total_amount?: number }>>({
    product_name: '',
    category: '',
    description: '',
    unit: '',
    unit_price: undefined,
    quantity: undefined,
    total_amount: undefined
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Updated units - removed Hour and Day, kept only material units
  const units = ['Piece', 'Kg', 'Gram', 'Ton', 'Liter', 'Meter', 'Sq Meter', 'Sq Feet', 'Cubic Meter', 'Box', 'Set', 'Roll', 'Pack', 'Bag', 'Other'];

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
      unit_price: undefined,
      quantity: undefined,
      total_amount: undefined
    });
    setErrors([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Handle numeric fields
    if (name === 'unit_price' || name === 'quantity') {
      const numValue = value === '' ? undefined : parseFloat(value);
      setFormData(prev => {
        const updated = { ...prev, [name]: numValue };

        // Auto-calculate total amount if both unit_price and quantity are present
        if (name === 'unit_price' && updated.quantity !== undefined && numValue !== undefined) {
          updated.total_amount = numValue * updated.quantity;
        } else if (name === 'quantity' && updated.unit_price !== undefined && numValue !== undefined) {
          updated.total_amount = updated.unit_price * numValue;
        }

        return updated;
      });
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
        toast.success('Product updated successfully');
      } else {
        // Add new product
        product = await buyerVendorService.addVendorProduct(vendorId, formData as Omit<VendorProduct, 'product_id' | 'vendor_id'>);
        toast.success('Product added successfully');
      }

      onProductAdded(product);
      onClose();
      resetForm();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast.error(error.message || 'Failed to save product');
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

                {/* Unit, Unit Price, Quantity, and Total */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-2">
                      Unit
                    </label>
                    <select
                      id="unit"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Unit</option>
                      {units.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
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

                  <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-2">
                      Quantity
                    </label>
                    <input
                      id="quantity"
                      type="number"
                      name="quantity"
                      value={formData.quantity ?? ''}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label htmlFor="total_amount" className="block text-sm font-medium text-gray-700 mb-2">
                      Total Amount (AED)
                    </label>
                    <input
                      id="total_amount"
                      type="number"
                      value={formData.total_amount ?? ''}
                      readOnly
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-semibold"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">Auto-calculated (Unit Price × Quantity)</p>
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

export default AddProductModal;
