import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Package, CheckCircle, X, RefreshCw, Edit2, AlertTriangle
} from 'lucide-react';
import {
  inventoryService,
  InventoryMaterial,
  InventoryConfig
} from '../services/inventoryService';
import { showSuccess, showError } from '@/utils/toastHelper';
import { getStockStatus, validateMaterialForm } from '../utils/inventoryHelpers';
import { PAGINATION, INVENTORY_DEFAULTS } from '@/lib/inventoryConstants';
import ConfirmationModal from '../components/ConfirmationModal';

const MaterialsCatalogPage: React.FC = () => {
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [inventoryConfig, setInventoryConfig] = useState<InventoryConfig>({
    store_name: '',
    company_name: '',
    currency: INVENTORY_DEFAULTS.CURRENCY,
    delivery_note_prefix: INVENTORY_DEFAULTS.DELIVERY_NOTE_PREFIX
  });

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<InventoryMaterial | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    material_name: '',
    brand: '',
    size: '',
    category: '',
    unit: '',
    current_stock: 0,
    min_stock_level: 0,
    unit_price: 0,
    description: '',
    is_active: true
  });

  const [disposalFormData, setDisposalFormData] = useState({
    quantity: 0,
    reason: 'damaged',
    notes: '',
    estimated_value: 0
  });

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmColor?: 'CONFIRM' | 'DELETE' | 'APPROVE' | 'WARNING' | 'INFO';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
    confirmColor: 'CONFIRM'
  });

  const showConfirmation = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirm',
    confirmColor: 'CONFIRM' | 'DELETE' | 'APPROVE' | 'WARNING' | 'INFO' = 'CONFIRM'
  ) => {
    setConfirmModal({ show: true, title, message, onConfirm, confirmText, confirmColor });
  };

  const closeConfirmation = () => {
    setConfirmModal({ ...confirmModal, show: false });
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reset page when search/category filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [matData, configData] = await Promise.all([
        inventoryService.getAllInventoryItems(),
        inventoryService.getInventoryConfig()
      ]);

      setMaterials(matData || []);
      setInventoryConfig(configData);

      const uniqueCategories = [...new Set((matData || [])
        .map((m: InventoryMaterial) => m.category)
        .filter(Boolean))] as string[];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error fetching data:', error);
      showError('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      material_name: '',
      brand: '',
      size: '',
      category: '',
      unit: '',
      current_stock: 0,
      min_stock_level: 0,
      unit_price: 0,
      description: '',
      is_active: true
    });
    setSelectedMaterial(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
              ['current_stock', 'min_stock_level', 'unit_price'].includes(name) ?
              parseFloat(value) || 0 : value
    }));
  };

  const handleEditClick = (material: InventoryMaterial) => {
    setSelectedMaterial(material);
    setFormData({
      material_name: material.material_name,
      brand: material.brand || '',
      size: material.size || '',
      category: material.category || '',
      unit: material.unit,
      current_stock: material.current_stock,
      min_stock_level: material.min_stock_level || 0,
      unit_price: material.unit_price,
      description: material.description || '',
      is_active: material.is_active !== false
    });
    setShowEditModal(true);
  };

  const handleUpdateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial?.inventory_material_id) return;

    const validationError = validateMaterialForm(formData);
    if (validationError) {
      showError(validationError);
      return;
    }

    setSaving(true);
    try {
      await inventoryService.updateInventoryItem(selectedMaterial.inventory_material_id, formData);
      setShowEditModal(false);
      resetForm();
      fetchData();
      showSuccess('Material updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update material';
      console.error('Error updating material:', error);
      showError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = (material: InventoryMaterial) => {
    if (!material.inventory_material_id) return;

    showConfirmation(
      'Delete Material',
      `Are you sure you want to delete "${material.material_name}"?`,
      async () => {
        closeConfirmation();
        try {
          await inventoryService.deleteInventoryItem(material.inventory_material_id!);
          fetchData();
          showSuccess('Material deleted successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete material';
          console.error('Error deleting material:', error);
          showError(errorMessage);
        }
      },
      'Delete',
      'DELETE'
    );
  };

  const handleDisposalRequest = (material: InventoryMaterial) => {
    setSelectedMaterial(material);
    setDisposalFormData({
      quantity: material.current_stock,
      reason: 'damaged',
      notes: '',
      estimated_value: material.current_stock * (material.unit_price || 0)
    });
    setShowDisposalModal(true);
  };

  const handleDisposalInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDisposalFormData(prev => {
      const updated = {
        ...prev,
        [name]: ['quantity', 'estimated_value'].includes(name) ? parseFloat(value) || 0 : value
      };

      // Auto-calculate estimated value when quantity changes
      if (name === 'quantity' && selectedMaterial) {
        updated.estimated_value = parseFloat(value) * (selectedMaterial.unit_price || 0);
      }

      return updated;
    });
  };

  const handleSubmitDisposalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial?.inventory_material_id) return;

    if (disposalFormData.quantity <= 0 || disposalFormData.quantity > (selectedMaterial.current_stock || 0)) {
      showError(`Quantity must be between 1 and ${selectedMaterial.current_stock}`);
      return;
    }

    setSaving(true);
    try {
      await inventoryService.requestMaterialDisposal(selectedMaterial.inventory_material_id, {
        quantity: disposalFormData.quantity,
        reason: disposalFormData.reason,
        notes: disposalFormData.notes,
        estimated_value: disposalFormData.estimated_value
      });
      setShowDisposalModal(false);
      setSelectedMaterial(null);
      fetchData();
      showSuccess('Disposal request submitted for TD approval');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit disposal request';
      console.error('Error submitting disposal request:', error);
      showError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter(material => {
      const matchesSearch = searchTerm === '' ||
        material.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.material_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.brand?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || material.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [materials, searchTerm, categoryFilter]);

  const totalPages = Math.ceil(filteredMaterials.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedMaterials = useMemo(() => {
    return filteredMaterials.slice(
      (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE,
      currentPage * PAGINATION.DEFAULT_PAGE_SIZE
    );
  }, [filteredMaterials, currentPage]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 animate-pulse">
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Materials Catalog</h1>
        <p className="text-gray-600 mt-1">View and manage all materials in your inventory</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-blue-900">Materials Catalog</h3>
            <p className="text-sm text-blue-700 mt-1">
              View all materials available in your store. Materials are added automatically when you record purchases or returns.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by material name, code, or brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search materials"
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Availability</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedMaterials.map((material) => (
                <tr key={material.inventory_material_id} className={`hover:bg-gray-50 ${material.current_stock === 0 ? 'bg-red-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {material.material_code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      <div className="font-medium">{material.material_name}</div>
                      {material.brand && <div className="text-gray-500 text-xs">{material.brand}</div>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {material.category || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {material.current_stock > 0 ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3" />
                        Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                        <X className="w-3 h-3" />
                        Not Available
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      <div className={`font-bold text-lg ${material.current_stock === 0 ? 'text-red-600' : material.current_stock <= (material.min_stock_level || 0) ? 'text-orange-600' : 'text-green-600'}`}>
                        {material.current_stock} {material.unit}
                      </div>
                      <div className="text-gray-500 text-xs">Min: {material.min_stock_level || 0}</div>
                      {(material.backup_stock ?? 0) > 0 && (
                        <div className="mt-1 flex items-center gap-1" title={material.backup_condition_notes || 'Partially usable stock'}>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            <Package className="w-3 h-3" />
                            +{material.backup_stock} backup
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {inventoryConfig.currency} {material.unit_price?.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                    <div className="flex items-center justify-center gap-2">
                      {/* Request Disposal for damaged/wasted materials */}
                      {material.current_stock > 0 ? (
                        <button
                          onClick={() => handleDisposalRequest(material)}
                          className="text-orange-600 hover:text-orange-900 transition-colors"
                          title="Request disposal for damaged/wasted material"
                          aria-label={`Request disposal for ${material.material_name}`}
                        >
                          <AlertTriangle className="h-5 w-5" />
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Showing {(currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE + 1} to {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, filteredMaterials.length)} of {filteredMaterials.length} results
              <span className="text-gray-500 ml-2">(Page {currentPage} of {totalPages})</span>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  aria-label={`Go to page ${page}`}
                  aria-current={currentPage === page ? 'page' : undefined}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredMaterials.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No materials found</p>
          </div>
        )}
      </div>

      {showEditModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-material-title"
        >
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 id="edit-material-title" className="text-xl font-bold text-gray-900 mb-4">Edit Material</h2>
              <form onSubmit={handleUpdateMaterial} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Material Name*</label>
                    <input
                      type="text"
                      name="material_name"
                      value={formData.material_name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                    <input
                      type="text"
                      name="brand"
                      value={formData.brand}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                    <input
                      type="text"
                      name="size"
                      value={formData.size}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit*</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Stock*</label>
                    <input
                      type="number"
                      name="current_stock"
                      value={formData.current_stock}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level</label>
                    <input
                      type="number"
                      name="min_stock_level"
                      value={formData.min_stock_level}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price*</label>
                    <input
                      type="number"
                      name="unit_price"
                      value={formData.unit_price}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Update Material'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Disposal Request Modal */}
      {showDisposalModal && selectedMaterial && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disposal-request-title"
        >
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                <h2 id="disposal-request-title" className="text-xl font-bold text-gray-900">
                  Request Material Disposal
                </h2>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-orange-800">
                  This will create a disposal request for TD approval. Upon approval, the material quantity will be reduced from inventory and recorded in disposal history.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Material Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <span className="ml-2 font-medium">{selectedMaterial.material_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Code:</span>
                    <span className="ml-2 font-mono">{selectedMaterial.material_code}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Available Stock:</span>
                    <span className="ml-2 font-medium">{selectedMaterial.current_stock} {selectedMaterial.unit}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Unit Price:</span>
                    <span className="ml-2 font-medium">{inventoryConfig.currency} {selectedMaterial.unit_price?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitDisposalRequest} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity to Dispose* <span className="text-xs text-gray-500">(Max: {selectedMaterial.current_stock})</span>
                    </label>
                    <input
                      type="number"
                      name="quantity"
                      value={disposalFormData.quantity}
                      onChange={handleDisposalInputChange}
                      required
                      min="0.01"
                      max={selectedMaterial.current_stock}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value*</label>
                    <input
                      type="number"
                      name="estimated_value"
                      value={disposalFormData.estimated_value}
                      onChange={handleDisposalInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-gray-50"
                      readOnly
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Disposal*</label>
                  <select
                    name="reason"
                    value={disposalFormData.reason}
                    onChange={handleDisposalInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="damaged">Damaged/Defective</option>
                    <option value="expired">Expired</option>
                    <option value="wasted">Wasted</option>
                    <option value="obsolete">Obsolete</option>
                    <option value="lost">Lost/Missing</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes*</label>
                  <textarea
                    name="notes"
                    value={disposalFormData.notes}
                    onChange={handleDisposalInputChange}
                    required
                    rows={4}
                    placeholder="Provide detailed explanation for the disposal request..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisposalModal(false);
                      setSelectedMaterial(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? 'Submitting...' : 'Submit for TD Approval'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.onConfirm();
        }}
        onCancel={closeConfirmation}
        confirmText={confirmModal.confirmText}
        confirmColor={confirmModal.confirmColor}
      />
    </div>
  );
};

export default MaterialsCatalogPage;
