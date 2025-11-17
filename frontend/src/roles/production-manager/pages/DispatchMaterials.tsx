import React, { useState } from 'react';
import { Plus, Search, Send, FileText, Package, CheckCircle, X, TruckIcon, Calendar } from 'lucide-react';

// Dispatch status types
type DispatchStatus = 'draft' | 'pending' | 'dispatched' | 'delivered' | 'cancelled';

interface DispatchItem {
  id: string;
  materialCode: string;
  materialName: string;
  unit: string;
  requestedQty: number;
  dispatchedQty: number;
  availableStock: number;
  binLocation: string;
}

interface Dispatch {
  id: string;
  dispatchNumber: string;
  requisitionNumber?: string;
  requestedBy: string;
  projectName: string;
  siteLocation: string;
  dispatchDate: string;
  deliveryDate?: string;
  status: DispatchStatus;
  items: DispatchItem[];
  vehicleNumber?: string;
  driverName?: string;
  remarks: string;
}

// Mock dispatch data
const mockDispatches: Dispatch[] = [
  {
    id: '1',
    dispatchNumber: 'DSP-2025-001',
    requisitionNumber: 'REQ-2025-034',
    requestedBy: 'Site Engineer - Tower A',
    projectName: 'Skyline Residency',
    siteLocation: 'Tower A - Floor 12',
    dispatchDate: '2025-01-15',
    deliveryDate: '2025-01-15',
    status: 'delivered',
    items: [
      {
        id: '1',
        materialCode: 'MAT-001',
        materialName: 'Portland Cement (50kg)',
        unit: 'Bags',
        requestedQty: 100,
        dispatchedQty: 100,
        availableStock: 450,
        binLocation: 'A-01-01'
      },
      {
        id: '2',
        materialCode: 'MAT-003',
        materialName: 'Sand (M-Sand)',
        unit: 'CFT',
        requestedQty: 50,
        dispatchedQty: 50,
        availableStock: 45,
        binLocation: 'C-01-01'
      }
    ],
    vehicleNumber: 'KA-01-AB-1234',
    driverName: 'Ravi Kumar',
    remarks: 'Delivered successfully'
  },
  {
    id: '2',
    dispatchNumber: 'DSP-2025-002',
    requisitionNumber: 'REQ-2025-035',
    requestedBy: 'Site Supervisor - Tower B',
    projectName: 'Green Valley Villas',
    siteLocation: 'Tower B - Ground Floor',
    dispatchDate: '2025-01-14',
    status: 'dispatched',
    items: [
      {
        id: '3',
        materialCode: 'MAT-002',
        materialName: 'TMT Steel 12mm',
        unit: 'Tons',
        requestedQty: 2,
        dispatchedQty: 2,
        availableStock: 8.5,
        binLocation: 'B-02-03'
      }
    ],
    vehicleNumber: 'KA-02-CD-5678',
    driverName: 'Suresh Babu',
    remarks: 'In transit to site'
  },
  {
    id: '3',
    dispatchNumber: 'DSP-2025-003',
    requestedBy: 'Buyer - Procurement',
    projectName: 'Office Complex - Phase 2',
    siteLocation: 'Main Building',
    dispatchDate: '2025-01-13',
    status: 'pending',
    items: [
      {
        id: '4',
        materialCode: 'MAT-005',
        materialName: 'Concrete Blocks (6")',
        unit: 'Nos',
        requestedQty: 500,
        dispatchedQty: 0,
        availableStock: 2500,
        binLocation: 'E-01-01'
      },
      {
        id: '5',
        materialCode: 'MAT-006',
        materialName: 'PVC Pipes 4"',
        unit: 'Mtr',
        requestedQty: 50,
        dispatchedQty: 0,
        availableStock: 85,
        binLocation: 'F-02-01'
      }
    ],
    remarks: 'Awaiting vehicle assignment'
  }
];

const DispatchMaterials: React.FC = () => {
  const [dispatches, setDispatches] = useState<Dispatch[]>(mockDispatches);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filter dispatches
  const filteredDispatches = dispatches.filter(dispatch => {
    const matchesSearch =
      dispatch.dispatchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispatch.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispatch.requestedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dispatch.requisitionNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || false);

    const matchesStatus = statusFilter === 'all' || dispatch.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Get status counts
  const statusCounts = {
    all: dispatches.length,
    draft: dispatches.filter(d => d.status === 'draft').length,
    pending: dispatches.filter(d => d.status === 'pending').length,
    dispatched: dispatches.filter(d => d.status === 'dispatched').length,
    delivered: dispatches.filter(d => d.status === 'delivered').length,
    cancelled: dispatches.filter(d => d.status === 'cancelled').length
  };

  // Get status badge
  const getStatusBadge = (status: DispatchStatus) => {
    const badges = {
      'draft': { text: 'Draft', class: 'bg-gray-100 text-gray-800 border-gray-200' },
      'pending': { text: 'Pending', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      'dispatched': { text: 'Dispatched', class: 'bg-blue-100 text-blue-800 border-blue-200' },
      'delivered': { text: 'Delivered', class: 'bg-green-100 text-green-800 border-green-200' },
      'cancelled': { text: 'Cancelled', class: 'bg-red-100 text-red-800 border-red-200' }
    };

    const badge = badges[status];

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.class}`}>
        {badge.text}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Material Dispatch</h1>
              <p className="mt-1 text-sm text-gray-500">
                Issue and track materials to projects and sites
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Create Dispatch
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Dispatches</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{statusCounts.all}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{statusCounts.pending}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <Package className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">In Transit</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{statusCounts.dispatched}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <TruckIcon className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Delivered</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{statusCounts.delivered}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-1 mb-6 flex gap-1">
          {(['all', 'pending', 'dispatched', 'delivered', 'draft', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status !== 'all' && ` (${statusCounts[status]})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by dispatch number, project, requisition, or requester..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>

        {/* Dispatch List */}
        <div className="space-y-4">
          {filteredDispatches.map((dispatch) => (
            <div key={dispatch.id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              {/* Dispatch Header */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{dispatch.dispatchNumber}</h3>
                      {getStatusBadge(dispatch.status)}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Project</p>
                        <p className="font-medium text-gray-900">{dispatch.projectName}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Site Location</p>
                        <p className="font-medium text-gray-900">{dispatch.siteLocation}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Requested By</p>
                        <p className="font-medium text-gray-900">{dispatch.requestedBy}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Dispatch Date</p>
                        <div className="flex items-center gap-1 font-medium text-gray-900">
                          <Calendar className="w-4 h-4" />
                          {dispatch.dispatchDate}
                        </div>
                      </div>
                    </div>
                  </div>
                  {dispatch.vehicleNumber && (
                    <div className="text-right border-l border-gray-200 pl-4">
                      <p className="text-sm text-gray-500">Vehicle</p>
                      <div className="flex items-center gap-2 mt-1">
                        <TruckIcon className="w-5 h-5 text-purple-600" />
                        <div className="text-left">
                          <p className="text-sm font-semibold text-gray-900">{dispatch.vehicleNumber}</p>
                          <p className="text-xs text-gray-600">{dispatch.driverName}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {dispatch.requisitionNumber && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                    <FileText className="w-3 h-3" />
                    Requisition: {dispatch.requisitionNumber}
                  </div>
                )}
              </div>

              {/* Dispatch Items */}
              <div className="p-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Dispatched Items</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Requested</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Dispatched</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {dispatch.items.map((item) => {
                        const isPartialDispatch = item.dispatchedQty < item.requestedQty && item.dispatchedQty > 0;
                        const isFullDispatch = item.dispatchedQty === item.requestedQty;
                        const isPending = item.dispatchedQty === 0;

                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.materialName}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-600">{item.materialCode}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.binLocation}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {item.requestedQty} {item.unit}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-semibold ${
                                isPending ? 'text-gray-500' :
                                isPartialDispatch ? 'text-yellow-600' :
                                isFullDispatch ? 'text-green-600' :
                                'text-gray-900'
                              }`}>
                                {item.dispatchedQty} {item.unit}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`${
                                item.availableStock < item.requestedQty ? 'text-red-600 font-semibold' : 'text-gray-600'
                              }`}>
                                {item.availableStock} {item.unit}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dispatch Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {dispatch.remarks && (
                      <div>
                        <span className="text-gray-500">Remarks: </span>
                        <span className="text-gray-900">{dispatch.remarks}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                      View Details
                    </button>
                    {dispatch.status === 'pending' && (
                      <button className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors">
                        <Send className="w-4 h-4" />
                        Process Dispatch
                      </button>
                    )}
                    {dispatch.status === 'dispatched' && (
                      <button className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
                        <CheckCircle className="w-4 h-4" />
                        Mark Delivered
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredDispatches.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No dispatches found</h3>
            <p className="text-sm text-gray-500">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first dispatch to start issuing materials'}
            </p>
          </div>
        )}

        {/* Results Count */}
        {filteredDispatches.length > 0 && (
          <div className="mt-6 text-sm text-gray-600 text-center">
            Showing {filteredDispatches.length} of {dispatches.length} dispatches
          </div>
        )}
      </div>

      {/* Create Dispatch Modal - Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Create New Dispatch</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Dispatch Header */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Dispatch Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project <span className="text-red-500">*</span>
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                      <option value="">Select Project</option>
                      <option value="1">Skyline Residency</option>
                      <option value="2">Green Valley Villas</option>
                      <option value="3">Office Complex - Phase 2</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Site Location <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      placeholder="e.g., Tower A - Floor 12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Requested By <span className="text-red-500">*</span>
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                      <option value="">Select Requester</option>
                      <option value="se">Site Engineer - Tower A</option>
                      <option value="ss">Site Supervisor - Tower B</option>
                      <option value="buyer">Buyer - Procurement</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dispatch Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Requisition Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., REQ-2025-036"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expected Delivery Date
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Materials to Dispatch */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Materials to Dispatch</h3>
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                    Add Material
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Material</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Unit</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Bin Location</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Available Stock</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Dispatch Qty</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      <tr>
                        <td className="px-3 py-2">
                          <select className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500">
                            <option>Portland Cement (50kg)</option>
                            <option>TMT Steel 12mm</option>
                            <option>Concrete Blocks (6")</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value="Bags" disabled className="w-20 px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value="A-01-01" disabled className="w-24 px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-sm font-semibold text-green-600">450 Bags</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" placeholder="0" min="0" max="450" className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-purple-500" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            ✓ Available
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button className="p-1 text-red-600 hover:bg-red-50 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Vehicle & Driver Assignment */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehicle & Driver Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      placeholder="e.g., KA-01-AB-1234"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
                    <input
                      type="text"
                      placeholder="Driver name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Driver Contact</label>
                    <input
                      type="tel"
                      placeholder="Mobile number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transport Type</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                      <option>Company Vehicle</option>
                      <option>Third Party</option>
                      <option>Courier</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Remarks</label>
                <textarea
                  rows={3}
                  placeholder="Any special instructions or notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  <p className="font-semibold">Total Items: <span className="text-purple-600">1</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                    <Send className="w-4 h-4" />
                    Create Dispatch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(DispatchMaterials);
