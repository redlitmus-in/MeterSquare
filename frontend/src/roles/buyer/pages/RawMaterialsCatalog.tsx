/**
 * Raw Materials Catalog Page
 *
 * Allows Buyer/Procurement team to manage the master catalog of raw materials.
 * Estimators will select materials from this catalog when creating BOQs.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  CubeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TagIcon,
  RectangleGroupIcon
} from '@heroicons/react/24/outline';
import { rawMaterialsService, RawMaterial } from '@/services/rawMaterialsService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showSuccess, showError } from '@/utils/toastHelper';
import AddRawMaterialModal from '@/roles/buyer/components/AddRawMaterialModal';

const RawMaterialsCatalog: React.FC = () => {
  // State management
  const [allMaterials, setAllMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);

  const ITEMS_PER_PAGE = 20;

  // Load data on component mount
  useEffect(() => {
    loadMaterials();
    loadCategories();
  }, []);

  /**
   * Load all raw materials from the catalog
   */
  const loadMaterials = async () => {
    try {
      setLoading(true);
      const response = await rawMaterialsService.getAllRawMaterials({
        page: 1,
        per_page: 1000, // Load all materials for client-side filtering
        active_only: true
      });

      setAllMaterials(response.materials);
    } catch (error: any) {
      console.error('Error loading raw materials:', error);
      showError(error.message || 'Failed to load raw materials');
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  /**
   * Load unique material categories
   */
  const loadCategories = async () => {
    try {
      const response = await rawMaterialsService.getCategories();
      setCategories(response.categories);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  /**
   * Client-side filtering - instant, no API calls
   */
  const materials = useMemo(() => {
    return allMaterials.filter(material => {
      // Category filter
      if (categoryFilter && material.category !== categoryFilter) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase().trim();
        const matchesName = material.material_name?.toLowerCase().includes(search);
        const matchesBrand = material.brand?.toLowerCase().includes(search);
        const matchesDesc = material.description?.toLowerCase().includes(search);
        const matchesSpec = material.specification?.toLowerCase().includes(search);

        if (!matchesName && !matchesBrand && !matchesDesc && !matchesSpec) {
          return false;
        }
      }

      return true;
    });
  }, [allMaterials, searchTerm, categoryFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter]);

  // Pagination calculations
  const totalRecords = materials.length;
  const totalPages = Math.ceil(totalRecords / ITEMS_PER_PAGE);
  const paginatedMaterials = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return materials.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [materials, currentPage]);

  /**
   * Clear all filters
   */
  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
  };

  /**
   * Handle add new material
   */
  const handleAddMaterial = () => {
    setEditingMaterial(null);
    setShowAddModal(true);
  };

  /**
   * Handle edit material
   */
  const handleEditMaterial = (material: RawMaterial) => {
    setEditingMaterial(material);
    setShowAddModal(true);
  };

  /**
   * Handle delete material
   */
  const handleDeleteMaterial = async (material: RawMaterial) => {
    if (!material.id) return;

    if (window.confirm(`Are you sure you want to delete "${material.material_name}"? This action cannot be undone.`)) {
      try {
        await rawMaterialsService.deleteRawMaterial(material.id);
        showSuccess('Raw material deleted successfully');
        loadMaterials(); // Reload list
      } catch (error: any) {
        console.error('Error deleting material:', error);
        showError(error.message || 'Failed to delete raw material');
      }
    }
  };

  /**
   * Handle modal close and refresh
   */
  const handleModalClose = (shouldRefresh: boolean) => {
    setShowAddModal(false);
    setEditingMaterial(null);
    if (shouldRefresh) {
      loadMaterials();
      loadCategories();
    }
  };

  // Loading state
  if (isInitialLoad) {
    return (
      <div className="flex justify-center items-center h-screen">
        <ModernLoadingSpinners size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <RectangleGroupIcon className="w-8 h-8 mr-3 text-blue-600" />
            Raw Materials Catalog
          </h1>
          <p className="text-gray-600 mt-1">
            Manage the master catalog of raw materials for BOQ creation
          </p>
        </div>
        <button
          onClick={handleAddMaterial}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center shadow-md"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Add Material
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Total Materials</p>
              <p className="text-3xl font-bold mt-2">{allMaterials.length}</p>
            </div>
            <CubeIcon className="w-12 h-12 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Categories</p>
              <p className="text-3xl font-bold mt-2">{categories.length}</p>
            </div>
            <TagIcon className="w-12 h-12 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Filtered Results</p>
              <p className="text-3xl font-bold mt-2">{materials.length}</p>
            </div>
            <FunnelIcon className="w-12 h-12 text-purple-200" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, brand, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <div>
            <button
              onClick={clearFilters}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <ModernLoadingSpinners size="sm" />
          </div>
        ) : paginatedMaterials.length === 0 ? (
          <div className="text-center py-12">
            <CubeIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg">No raw materials found</p>
            <p className="text-gray-500 text-sm mt-2">
              {searchTerm || categoryFilter
                ? 'Try adjusting your filters'
                : 'Add your first raw material to get started'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Material Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Brand
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit Price (AED)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created By
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedMaterials.map((material) => (
                    <tr key={material.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {material.material_name}
                        </div>
                        {material.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {material.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.brand || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.size || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {material.unit || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                        {material.unit_price != null ? `${material.unit_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {material.category && (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            {material.category}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {material.creator_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEditMaterial(material)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit material"
                          >
                            <PencilIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMaterial(material)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete material"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, totalRecords)} of{' '}
                  {totalRecords} materials
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Material Modal */}
      {showAddModal && (
        <AddRawMaterialModal
          material={editingMaterial}
          onClose={handleModalClose}
          categories={categories}
        />
      )}
    </div>
  );
};

export default RawMaterialsCatalog;
