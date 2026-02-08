/**
 * Add/Edit Raw Material Modal
 *
 * Modal dialog for creating and editing raw materials in the catalog.
 */

import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { rawMaterialsService, RawMaterial, CreateRawMaterialData } from '@/services/rawMaterialsService';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface AddRawMaterialModalProps {
  material?: RawMaterial | null;
  onClose: (shouldRefresh: boolean) => void;
  categories: string[];
}

const AddRawMaterialModal: React.FC<AddRawMaterialModalProps> = ({
  material,
  onClose,
  categories
}) => {
  const isEditMode = !!material;

  // Form state
  const [formData, setFormData] = useState<CreateRawMaterialData>({
    material_name: '',
    description: '',
    brand: '',
    size: '',
    specification: '',
    unit: '',
    category: '',
    unit_price: 0
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form if editing
  useEffect(() => {
    if (material) {
      setFormData({
        material_name: material.material_name || '',
        description: material.description || '',
        brand: material.brand || '',
        size: material.size || '',
        specification: material.specification || '',
        unit: material.unit || '',
        category: material.category || '',
        unit_price: material.unit_price || 0
      });
    }
  }, [material]);

  /**
   * Handle input change
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  /**
   * Validate form
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.material_name?.trim()) {
      newErrors.material_name = 'Material name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      if (isEditMode && material?.id) {
        // Update existing material
        await rawMaterialsService.updateRawMaterial(material.id, formData);
        showSuccess('Raw material updated successfully');
      } else {
        // Create new material
        await rawMaterialsService.createRawMaterial(formData);
        showSuccess('Raw material created successfully');
      }

      onClose(true); // Close modal and refresh list
    } catch (error: any) {
      console.error('Error saving raw material:', error);
      showError(error.message || 'Failed to save raw material');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    onClose(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {isEditMode ? 'Edit Raw Material' : 'Add New Raw Material'}
            </h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Material Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="material_name"
                value={formData.material_name}
                onChange={handleChange}
                placeholder="e.g., Cement OPC 53 Grade"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.material_name ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              />
              {errors.material_name && (
                <p className="mt-1 text-sm text-red-500">{errors.material_name}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Brief description of the material"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            {/* Brand and Size */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand
                </label>
                <input
                  type="text"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  placeholder="e.g., UltraTech, ACC"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Size
                </label>
                <input
                  type="text"
                  name="size"
                  value={formData.size}
                  onChange={handleChange}
                  placeholder="e.g., 50kg, 10mm, 20ft"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Specification */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specification
              </label>
              <textarea
                name="specification"
                value={formData.specification}
                onChange={handleChange}
                placeholder="Technical specifications, standards (e.g., IS 12269:2013 compliant)"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            {/* Unit, Unit Price, and Category */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  placeholder="e.g., kg, litre, pieces, m"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Price (AED)
                </label>
                <input
                  type="number"
                  name="unit_price"
                  value={formData.unit_price}
                  onChange={handleChange}
                  placeholder="e.g., 25.50"
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                {categories.length > 0 ? (
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    list="category-options"
                    placeholder="e.g., Cement, Steel, Aggregates"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                ) : (
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    placeholder="e.g., Cement, Steel, Aggregates"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                )}
                <datalist id="category-options">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-gray-500">
                  You can type a new category or select from existing ones
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                disabled={loading}
              >
                {loading && (
                  <ModernLoadingSpinners size="xs" className="mr-2" />
                )}
                {isEditMode ? 'Update Material' : 'Create Material'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddRawMaterialModal;
