import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  BuildingOfficeIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  PhoneIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { buyerVendorService, Vendor } from '@/roles/buyer/services/buyerVendorService';
import AddVendorModal from '@/components/buyer/AddVendorModal';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';

const VendorManagement: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [statistics, setStatistics] = useState({
    total_active: 0,
    total_inactive: 0,
    total_vendors: 0
  });

  useEffect(() => {
    loadVendors();
    loadCategories();
  }, []);

  useEffect(() => {
    loadVendors();
  }, [searchTerm, categoryFilter, statusFilter]);

  const loadCategories = async () => {
    try {
      const cats = await buyerVendorService.getVendorCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadVendors = async () => {
    try {
      setLoading(true);
      const response = await buyerVendorService.getAllVendors({
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        search: searchTerm || undefined,
        page: 1,
        per_page: 100
      });

      setVendors(response.vendors);
      setStatistics(response.statistics);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      toast.error(error.message || 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = () => {
    setEditingVendor(null);
    setShowAddModal(true);
  };

  const handleEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setShowAddModal(true);
  };

  const handleDeleteVendor = async (vendor: Vendor) => {
    if (!vendor.vendor_id) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${vendor.company_name}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await buyerVendorService.deleteVendor(vendor.vendor_id);
      toast.success('Vendor deleted successfully');
      loadVendors();
    } catch (error: any) {
      console.error('Error deleting vendor:', error);
      toast.error(error.message || 'Failed to delete vendor');
    }
  };

  const handleVendorAdded = (vendor: Vendor) => {
    loadVendors();
  };

  const handleViewVendor = (vendor: Vendor) => {
    navigate(`/buyer/vendors/${vendor.vendor_id}`);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setStatusFilter('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vendors...</p>
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
        className="mb-8"
      >
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 sm:p-8 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-800">
                Vendor Management
              </h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Manage vendor details and their products/services
              </p>
            </div>
            <button
              onClick={handleAddVendor}
              className="hidden sm:flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors shadow-md"
            >
              <PlusIcon className="w-5 h-5" />
              Add Vendor
            </button>
          </div>
        </div>
      </motion.div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Vendors</p>
              <p className="text-3xl font-bold text-purple-600">{statistics.total_vendors}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <BuildingOfficeIcon className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Active Vendors</p>
              <p className="text-3xl font-bold text-green-600">{statistics.total_active}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <BuildingOfficeIcon className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Inactive Vendors</p>
              <p className="text-3xl font-bold text-gray-600">{statistics.total_inactive}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <BuildingOfficeIcon className="w-8 h-8 text-gray-600" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm mb-6"
      >
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div className="sm:w-48">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="sm:w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Clear Filters */}
          {(searchTerm || categoryFilter || statusFilter) && (
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </motion.div>

      {/* Vendor List */}
      {vendors.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl p-12 border border-gray-200 text-center"
        >
          <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Vendors Found</h3>
          <p className="text-gray-500 mb-6">
            {searchTerm || categoryFilter || statusFilter
              ? 'Try adjusting your filters'
              : 'Get started by adding your first vendor'}
          </p>
          {!searchTerm && !categoryFilter && !statusFilter && (
            <button
              onClick={handleAddVendor}
              className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Add Your First Vendor
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map((vendor, index) => (
            <motion.div
              key={vendor.vendor_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + index * 0.05 }}
              className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Vendor Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-800 mb-1">{vendor.company_name}</h3>
                  {vendor.category && (
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                      {vendor.category}
                    </span>
                  )}
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    vendor.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {vendor.status === 'active' ? 'Active' : 'Inactive'}
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2 mb-4">
                {vendor.contact_person_name && (
                  <p className="text-sm text-gray-600">Contact: {vendor.contact_person_name}</p>
                )}
                {vendor.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <EnvelopeIcon className="w-4 h-4" />
                    <span className="truncate">{vendor.email}</span>
                  </div>
                )}
                {vendor.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <PhoneIcon className="w-4 h-4" />
                    <span>{vendor.phone_code} {vendor.phone}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleViewVendor(vendor)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <EyeIcon className="w-4 h-4" />
                  View
                </button>
                <button
                  onClick={() => handleEditVendor(vendor)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <PencilIcon className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteVendor(vendor)}
                  className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Mobile Add Button */}
      <button
        onClick={handleAddVendor}
        className="sm:hidden fixed bottom-6 right-6 bg-purple-600 text-white p-4 rounded-full shadow-lg hover:bg-purple-700 transition-colors z-10"
      >
        <PlusIcon className="w-6 h-6" />
      </button>

      {/* Add/Edit Vendor Modal */}
      <AddVendorModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingVendor(null);
        }}
        onVendorAdded={handleVendorAdded}
        editVendor={editingVendor}
      />
    </div>
  );
};

export default VendorManagement;
