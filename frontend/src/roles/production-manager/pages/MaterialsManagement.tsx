import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Package, AlertTriangle, CheckCircle, X, Save, Info } from 'lucide-react';

// Stock status types
type StockStatus = 'healthy' | 'warning' | 'critical' | 'out-of-stock';

interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderPoint: number;
  maxStock: number;
  unitPrice: number;
  binLocation: string;
  supplier?: string;
  sku?: string;
  description?: string;
  status: StockStatus;
  lastUpdated: string;
}

// Mock materials data
const mockMaterials: Material[] = [
  {
    id: '1',
    code: 'MAT-001',
    name: 'Portland Cement (50kg)',
    category: 'Cement',
    unit: 'Bags',
    currentStock: 450,
    reorderPoint: 200,
    maxStock: 1000,
    unitPrice: 350,
    binLocation: 'A-01-01',
    supplier: 'UltraTech Cement Ltd.',
    sku: 'UTC-OPC-50KG',
    description: 'OPC Grade 53 cement for structural concrete works',
    status: 'healthy',
    lastUpdated: '2025-01-15'
  },
  {
    id: '2',
    code: 'MAT-002',
    name: 'TMT Steel 12mm',
    category: 'Steel',
    unit: 'Tons',
    currentStock: 8.5,
    reorderPoint: 10,
    maxStock: 50,
    unitPrice: 65000,
    binLocation: 'B-02-03',
    supplier: 'Tata Steel',
    sku: 'TS-TMT-12MM-FE500D',
    description: 'Fe 500D grade TMT bars for RCC construction',
    status: 'warning',
    lastUpdated: '2025-01-14'
  },
  {
    id: '3',
    code: 'MAT-003',
    name: 'Sand (M-Sand)',
    category: 'Aggregates',
    unit: 'CFT',
    currentStock: 45,
    reorderPoint: 100,
    maxStock: 500,
    unitPrice: 45,
    binLocation: 'C-01-01',
    status: 'critical',
    lastUpdated: '2025-01-15'
  },
  {
    id: '4',
    code: 'MAT-004',
    name: 'Paint - Asian Paints (White)',
    category: 'Paint',
    unit: 'Ltr',
    currentStock: 0,
    reorderPoint: 50,
    maxStock: 200,
    unitPrice: 450,
    binLocation: 'D-03-02',
    status: 'out-of-stock',
    lastUpdated: '2025-01-10'
  },
  {
    id: '5',
    code: 'MAT-005',
    name: 'Concrete Blocks (6")',
    category: 'Blocks',
    unit: 'Nos',
    currentStock: 2500,
    reorderPoint: 1000,
    maxStock: 5000,
    unitPrice: 35,
    binLocation: 'E-01-01',
    status: 'healthy',
    lastUpdated: '2025-01-15'
  },
  {
    id: '6',
    code: 'MAT-006',
    name: 'PVC Pipes 4"',
    category: 'Plumbing',
    unit: 'Mtr',
    currentStock: 85,
    reorderPoint: 100,
    maxStock: 500,
    unitPrice: 120,
    binLocation: 'F-02-01',
    status: 'warning',
    lastUpdated: '2025-01-13'
  }
];

const MaterialsManagement: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>(mockMaterials);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Info banner state
  const [showInfoBanner, setShowInfoBanner] = useState(false);

  // Form state for adding new material
  const [newMaterial, setNewMaterial] = useState({
    code: '',
    name: '',
    category: '',
    unit: '',
    currentStock: 0,
    reorderPoint: 0,
    maxStock: 0,
    unitPrice: 0,
    binLocation: '',
    supplier: '',
    sku: '',
    description: ''
  });

  // Open material details modal
  const handleViewDetails = (material: Material) => {
    setSelectedMaterial(material);
    setShowDetailsModal(true);
  };

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewMaterial(prev => ({
      ...prev,
      [name]: name === 'code' || name === 'name' || name === 'category' || name === 'unit' || name === 'binLocation' || name === 'supplier' || name === 'sku' || name === 'description'
        ? value
        : parseFloat(value) || 0
    }));
  };

  // Handle form submission
  const handleAddMaterial = (e: React.FormEvent) => {
    e.preventDefault();

    // Calculate stock status
    let status: StockStatus;
    if (newMaterial.currentStock === 0) {
      status = 'out-of-stock';
    } else if (newMaterial.currentStock <= newMaterial.reorderPoint * 0.5) {
      status = 'critical';
    } else if (newMaterial.currentStock <= newMaterial.reorderPoint) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    // Create new material object
    const materialToAdd: Material = {
      id: `${materials.length + 1}`,
      code: newMaterial.code,
      name: newMaterial.name,
      category: newMaterial.category,
      unit: newMaterial.unit,
      currentStock: newMaterial.currentStock,
      reorderPoint: newMaterial.reorderPoint,
      maxStock: newMaterial.maxStock,
      unitPrice: newMaterial.unitPrice,
      binLocation: newMaterial.binLocation,
      supplier: newMaterial.supplier || undefined,
      sku: newMaterial.sku || undefined,
      description: newMaterial.description || undefined,
      status,
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    // Add material to the list
    setMaterials(prev => [...prev, materialToAdd]);

    // Reset form
    setNewMaterial({
      code: '',
      name: '',
      category: '',
      unit: '',
      currentStock: 0,
      reorderPoint: 0,
      maxStock: 0,
      unitPrice: 0,
      binLocation: '',
      supplier: '',
      sku: '',
      description: ''
    });

    // Close modal
    setShowCreateModal(false);
  };

  // Get stock status badge
  const getStatusBadge = (status: StockStatus) => {
    const badges = {
      'healthy': {
        icon: CheckCircle,
        text: 'In Stock',
        bgClass: 'bg-green-50',
        textClass: 'text-green-700',
        iconClass: 'text-green-600',
        borderClass: 'border-green-200'
      },
      'warning': {
        icon: AlertTriangle,
        text: 'Low Stock',
        bgClass: 'bg-yellow-50',
        textClass: 'text-yellow-700',
        iconClass: 'text-yellow-600',
        borderClass: 'border-yellow-200'
      },
      'critical': {
        icon: AlertTriangle,
        text: 'Critical',
        bgClass: 'bg-red-50',
        textClass: 'text-red-700',
        iconClass: 'text-red-600',
        borderClass: 'border-red-200'
      },
      'out-of-stock': {
        icon: Package,
        text: 'Out of Stock',
        bgClass: 'bg-gray-50',
        textClass: 'text-gray-700',
        iconClass: 'text-gray-600',
        borderClass: 'border-gray-200'
      }
    };

    const badge = badges[status];
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}>
        <Icon className={`w-3 h-3 ${badge.iconClass}`} />
        {badge.text}
      </span>
    );
  };

  // Filter materials
  const filteredMaterials = materials.filter(material => {
    const matchesSearch =
      material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || material.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredMaterials.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMaterials = filteredMaterials.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Get status counts
  const statusCounts = {
    all: materials.length,
    healthy: materials.filter(m => m.status === 'healthy').length,
    warning: materials.filter(m => m.status === 'warning').length,
    critical: materials.filter(m => m.status === 'critical').length,
    'out-of-stock': materials.filter(m => m.status === 'out-of-stock').length
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Materials Master</h1>
              <p className="mt-0.5 text-xs text-gray-500">
                Manage material catalog and monitor stock levels
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Material
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Collapsible Info Banner */}
        {showInfoBanner && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-xs font-semibold text-blue-900 mb-1">Stock Control System</h4>
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong>Stock quantities cannot be edited directly.</strong> Stock increases through <strong>Receive Stock (GRN)</strong> when materials arrive,
                  and decreases through <strong>Dispatch</strong> when issued to projects. Use <strong>Stock Take</strong> for physical vs system reconciliation.
                  Material details (price, location, reorder points) can be updated via Details button.
                </p>
              </div>
              <button
                onClick={() => setShowInfoBanner(false)}
                className="text-blue-600 hover:text-blue-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowInfoBanner(!showInfoBanner)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Stock Control Information"
            >
              <Info className="w-4 h-4" />
            </button>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, code, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <button className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <Filter className="w-4 h-4 text-gray-600" />
              More Filters
            </button>
          </div>
        </div>

        {/* Materials Table - Compact Design with Grid Lines */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-blue-50 border-b border-blue-200">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-blue-900 uppercase tracking-wider border-r border-blue-100">Code</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-blue-900 uppercase tracking-wider border-r border-blue-100">Material Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-blue-900 uppercase tracking-wider border-r border-blue-100">Category</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-blue-900 uppercase tracking-wider border-r border-blue-100">Current Stock</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-blue-900 uppercase tracking-wider border-r border-blue-100">Status</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-blue-900 uppercase tracking-wider border-r border-blue-100">Unit Price</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-blue-900 uppercase tracking-wider border-r border-blue-100">Location</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-blue-900 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {paginatedMaterials.map((material) => (
                    <tr key={material.id} className="hover:bg-gray-50 transition-colors border-b border-gray-200">
                      <td className="px-3 py-2 whitespace-nowrap border-r border-gray-200">
                        <span className="text-xs font-semibold text-gray-900">{material.code}</span>
                      </td>
                      <td className="px-3 py-2 border-r border-gray-200">
                        <div className="text-xs font-medium text-gray-900">{material.name}</div>
                        <div className="text-xs text-gray-500">Unit: {material.unit}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap border-r border-gray-200">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {material.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right border-r border-gray-200">
                        <div className="text-xs font-bold text-gray-900">
                          {material.currentStock} {material.unit}
                        </div>
                        <div className="text-xs text-gray-400">
                          Min: {material.reorderPoint} | Max: {material.maxStock}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center border-r border-gray-200">
                        {getStatusBadge(material.status)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right border-r border-gray-200">
                        <span className="text-xs font-semibold text-gray-900">
                          ₹{material.unitPrice.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap border-r border-gray-200">
                        <span className="text-xs font-medium text-gray-700 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                          {material.binLocation}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleViewDetails(material)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors border border-teal-200"
                          title="View material details"
                        >
                          <Package className="w-3 h-3" />
                          Details
                        </button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {filteredMaterials.length === 0 && (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">No materials found</h3>
              <p className="text-xs text-gray-500">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Get started by adding your first material'}
              </p>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {filteredMaterials.length > 0 && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between rounded-b-lg">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-gray-700">
                  Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(endIndex, filteredMaterials.length)}</span> of{' '}
                  <span className="font-medium">{filteredMaterials.length}</span> materials
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium ${
                            currentPage === page
                              ? 'z-10 bg-teal-50 border-teal-500 text-teal-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <span
                          key={page}
                          className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white text-xs font-medium text-gray-700"
                        >
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Material Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Add New Material</h2>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <form onSubmit={handleAddMaterial} className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Material Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="code"
                        value={newMaterial.code}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., MAT-007"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Material Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={newMaterial.name}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., Portland Cement"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="category"
                        value={newMaterial.category}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="">Select Category</option>
                        <option value="Cement">Cement</option>
                        <option value="Steel">Steel</option>
                        <option value="Aggregates">Aggregates</option>
                        <option value="Paint">Paint</option>
                        <option value="Blocks">Blocks</option>
                        <option value="Plumbing">Plumbing</option>
                        <option value="Electrical">Electrical</option>
                        <option value="Adhesives">Adhesives</option>
                        <option value="Hardware">Hardware</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit of Measurement <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="unit"
                        value={newMaterial.unit}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="">Select Unit</option>
                        <option value="Bags">Bags</option>
                        <option value="Tons">Tons</option>
                        <option value="Kg">Kg</option>
                        <option value="CFT">CFT (Cubic Feet)</option>
                        <option value="Ltr">Ltr (Liters)</option>
                        <option value="Nos">Nos (Numbers)</option>
                        <option value="Mtr">Mtr (Meters)</option>
                        <option value="Sqft">Sqft (Square Feet)</option>
                        <option value="Box">Box</option>
                        <option value="Pcs">Pcs (Pieces)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Stock Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Stock <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="currentStock"
                        value={newMaterial.currentStock}
                        onChange={handleInputChange}
                        required
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reorder Point <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="reorderPoint"
                        value={newMaterial.reorderPoint}
                        onChange={handleInputChange}
                        required
                        min="0"
                        step="0.01"
                        placeholder="Minimum stock level"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Alert when stock reaches this level</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Stock <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="maxStock"
                        value={newMaterial.maxStock}
                        onChange={handleInputChange}
                        required
                        min="0"
                        step="0.01"
                        placeholder="Maximum capacity"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Pricing & Location */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Location</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit Price (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="unitPrice"
                        value={newMaterial.unitPrice}
                        onChange={handleInputChange}
                        required
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bin Location <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="binLocation"
                        value={newMaterial.binLocation}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., A-01-01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Warehouse location identifier</p>
                    </div>
                  </div>
                </div>

                {/* Additional Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Supplier/Vendor
                      </label>
                      <input
                        type="text"
                        name="supplier"
                        value={newMaterial.supplier}
                        onChange={handleInputChange}
                        placeholder="Primary supplier name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SKU / Item Code
                      </label>
                      <input
                        type="text"
                        name="sku"
                        value={newMaterial.sku}
                        onChange={handleInputChange}
                        placeholder="Supplier SKU"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={newMaterial.description}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="Additional notes or specifications..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Add Material
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Material Details Modal */}
      {showDetailsModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Material Details</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    View and edit material master data (stock quantities are managed via GRN/Dispatch)
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedMaterial(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <form className="space-y-6">
                {/* Read-Only Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Material Information (Read-Only)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Material Code</label>
                      <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-900">
                        {selectedMaterial.code}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Material Name</label>
                      <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900">
                        {selectedMaterial.name}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                      <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          {selectedMaterial.category}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Unit of Measurement</label>
                      <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900">
                        {selectedMaterial.unit}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Current Stock</label>
                      <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900">
                        {selectedMaterial.currentStock} {selectedMaterial.unit}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Stock Status</label>
                      <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                        {getStatusBadge(selectedMaterial.status)}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    <strong>Note:</strong> Stock quantities cannot be edited here. Use <strong>Receive Stock</strong> to increase stock or <strong>Dispatch</strong> to decrease.
                  </p>
                </div>

                {/* Editable Stock Parameters */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Parameters (Editable)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reorder Point <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        defaultValue={selectedMaterial.reorderPoint}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Alert when stock reaches this level</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Stock <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        defaultValue={selectedMaterial.maxStock}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Maximum storage capacity</p>
                    </div>
                  </div>
                </div>

                {/* Editable Pricing & Location */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Location (Editable)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit Price (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        defaultValue={selectedMaterial.unitPrice}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bin Location <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        defaultValue={selectedMaterial.binLocation}
                        placeholder="e.g., A-01-01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Warehouse location identifier</p>
                    </div>
                  </div>
                </div>

                {/* Editable Additional Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details (Editable)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Supplier/Vendor
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedMaterial.supplier || ''}
                        placeholder="Primary supplier name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SKU / Item Code
                      </label>
                      <input
                        type="text"
                        defaultValue={selectedMaterial.sku || ''}
                        placeholder="Supplier SKU"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      defaultValue={selectedMaterial.description || ''}
                      placeholder="Additional notes or specifications..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Last Updated Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Last Updated:</strong> {new Date(selectedMaterial.lastUpdated).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedMaterial(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(MaterialsManagement);
