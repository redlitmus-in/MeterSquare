/**
 * Add/Edit Raw Material Modal
 *
 * Modal dialog for creating and editing raw materials in the catalog.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { rawMaterialsService, RawMaterial, CreateRawMaterialData } from '@/services/rawMaterialsService';
import { apiClient } from '@/api/config';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface MasterMaterial {
  material_id: number;
  material_name: string;
  brand: string;
  size: string;
  specification: string;
  description: string;
  default_unit: string;
  current_market_price: number;
}

interface AddRawMaterialModalProps {
  material?: RawMaterial | null;
  onClose: (shouldRefresh: boolean) => void;
  categories: string[];
  existingMaterials?: RawMaterial[];
}

const AddRawMaterialModal: React.FC<AddRawMaterialModalProps> = ({
  material,
  onClose,
  categories,
  existingMaterials = [],
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
  const [showSuggestions, setShowSuggestions] = useState(false);

  // All existing materials except the one being edited
  const allOtherMaterials = useMemo(() => {
    return existingMaterials.filter(em => em.id !== material?.id);
  }, [existingMaterials, material?.id]);

  // Split into matched (shown first) and unmatched (greyed out below)
  const { matches: matchedMaterials, rest: unmatchedMaterials } = useMemo(() => {
    const term = formData.material_name?.trim().toLowerCase();
    if (!term) return { matches: allOtherMaterials.slice(0, 10), rest: [] as RawMaterial[] };
    const matches: RawMaterial[] = [];
    const rest: RawMaterial[] = [];
    for (const em of allOtherMaterials) {
      if (em.material_name.toLowerCase().includes(term)) matches.push(em);
      else rest.push(em);
    }
    return { matches: matches.slice(0, 10), rest: rest.slice(0, 10) };
  }, [formData.material_name, allOtherMaterials]);

  const hasExactMatch = useMemo(() => {
    const term = formData.material_name?.trim().toLowerCase();
    if (!term) return false;
    return existingMaterials.some(em => em.id !== material?.id && em.material_name.trim().toLowerCase() === term);
  }, [formData.material_name, existingMaterials, material?.id]);

  // Master Materials search (from materials table / existing BOQs)
  const [masterResults, setMasterResults] = useState<MasterMaterial[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const masterSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterSearchRef = useRef(0);

  const searchMasterMaterials = useCallback((query: string) => {
    if (masterSearchTimer.current) clearTimeout(masterSearchTimer.current);
    if (!query.trim() || query.trim().length < 2) {
      setMasterResults([]);
      setMasterLoading(false);
      return;
    }
    setMasterLoading(true);
    masterSearchTimer.current = setTimeout(async () => {
      const searchId = ++masterSearchRef.current;
      try {
        const response = await apiClient.get('/raw-materials/master-search', {
          params: { q: query.trim(), limit: 10 }
        });
        if (searchId !== masterSearchRef.current) return;
        if (response.data?.success && response.data?.materials) {
          setMasterResults(response.data.materials);
        } else {
          setMasterResults([]);
        }
      } catch {
        if (searchId === masterSearchRef.current) setMasterResults([]);
      } finally {
        if (searchId === masterSearchRef.current) setMasterLoading(false);
      }
    }, 300);
  }, []);

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
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="material_name"
                value={formData.material_name}
                onChange={e => { handleChange(e); setShowSuggestions(true); searchMasterMaterials(e.target.value); }}
                onFocus={() => { setShowSuggestions(true); searchMasterMaterials(formData.material_name || ''); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="e.g., Cement OPC 53 Grade"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.material_name ? 'border-red-500' : hasExactMatch ? 'border-amber-400' : 'border-gray-300'
                }`}
                disabled={loading}
              />
              {errors.material_name && (
                <p className="mt-1 text-sm text-red-500">{errors.material_name}</p>
              )}
              {hasExactMatch && !errors.material_name && (
                <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  <span>A material with this exact name already exists</span>
                </div>
              )}
              {showSuggestions && (matchedMaterials.length > 0 || masterResults.length > 0 || masterLoading) && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[280px] overflow-y-auto">
                  {/* Buyer's Raw Materials Catalog section - only show when there are matches */}
                  {matchedMaterials.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border-b border-amber-100 sticky top-0 z-10">
                        Raw Materials Catalog ({matchedMaterials.length})
                      </div>
                      {matchedMaterials.map(em => (
                        <div key={em.id} className="px-3 py-2 text-sm border-b border-gray-50 bg-amber-50/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-800">{em.material_name}</span>
                              {em.brand && <span className="ml-1 text-xs text-gray-500">({em.brand})</span>}
                              {em.size && <span className="ml-1 text-xs text-gray-400">{em.size}</span>}
                            </div>
                            {em.unit_price != null && (
                              <span className="text-xs text-gray-600">{Number(em.unit_price).toFixed(2)} AED</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Master Materials section (from existing BOQs) */}
                  {masterLoading && (
                    <div className="px-3 py-2 text-xs text-gray-500 text-center">Searching master materials...</div>
                  )}
                  {masterResults.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border-y border-purple-100 sticky top-0 z-10">
                        Master Materials
                      </div>
                      {masterResults.map(gMat => (
                        <div key={gMat.material_id} className="px-3 py-2 text-sm border-b border-gray-50">
                          <div className="font-medium text-gray-800">{gMat.material_name}</div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                            {gMat.brand && <span>Brand: {gMat.brand}</span>}
                            {gMat.size && <span>Size: {gMat.size}</span>}
                            {gMat.default_unit && <span>Unit: {gMat.default_unit}</span>}
                            {gMat.current_market_price > 0 && (
                              <span className="text-green-600 font-medium">Price: AED {Number(gMat.current_market_price).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* No results message */}
                  {formData.material_name?.trim() && matchedMaterials.length === 0 && masterResults.length === 0 && !masterLoading && (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                      No matching materials found
                    </div>
                  )}
                </div>
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
