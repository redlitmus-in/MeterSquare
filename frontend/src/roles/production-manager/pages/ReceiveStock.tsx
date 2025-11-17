import React, { useState } from 'react';
import { Plus, Search, Calendar, FileText, Package, CheckCircle, X, Save } from 'lucide-react';

// GRN status types
type GRNStatus = 'draft' | 'received' | 'verified' | 'completed';

interface GRNItem {
  id: string;
  materialCode: string;
  materialName: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  totalValue: number;
}

interface GRN {
  id: string;
  grnNumber: string;
  poNumber: string;
  vendorName: string;
  receivedDate: string;
  receivedBy: string;
  status: GRNStatus;
  items: GRNItem[];
  totalValue: number;
  remarks: string;
}

// Mock GRN data
const mockGRNs: GRN[] = [
  {
    id: '1',
    grnNumber: 'GRN-2025-001',
    poNumber: 'PO-2025-045',
    vendorName: 'ABC Cement Suppliers',
    receivedDate: '2025-01-15',
    receivedBy: 'John Doe',
    status: 'completed',
    items: [
      {
        id: '1',
        materialCode: 'MAT-001',
        materialName: 'Portland Cement (50kg)',
        unit: 'Bags',
        orderedQty: 200,
        receivedQty: 200,
        unitPrice: 350,
        totalValue: 70000
      }
    ],
    totalValue: 70000,
    remarks: 'All items received in good condition'
  },
  {
    id: '2',
    grnNumber: 'GRN-2025-002',
    poNumber: 'PO-2025-046',
    vendorName: 'Steel Trading Co.',
    receivedDate: '2025-01-14',
    receivedBy: 'Jane Smith',
    status: 'verified',
    items: [
      {
        id: '2',
        materialCode: 'MAT-002',
        materialName: 'TMT Steel 12mm',
        unit: 'Tons',
        orderedQty: 5,
        receivedQty: 5,
        unitPrice: 65000,
        totalValue: 325000
      }
    ],
    totalValue: 325000,
    remarks: 'Quality checked and approved'
  },
  {
    id: '3',
    grnNumber: 'GRN-2025-003',
    poNumber: 'PO-2025-047',
    vendorName: 'Building Materials Hub',
    receivedDate: '2025-01-13',
    receivedBy: 'Mike Johnson',
    status: 'received',
    items: [
      {
        id: '3',
        materialCode: 'MAT-005',
        materialName: 'Concrete Blocks (6")',
        unit: 'Nos',
        orderedQty: 1000,
        receivedQty: 950,
        unitPrice: 35,
        totalValue: 33250
      }
    ],
    totalValue: 33250,
    remarks: 'Short delivery - 50 blocks missing'
  }
];

const ReceiveStock: React.FC = () => {
  const [grns, setGrns] = useState<GRN[]>(mockGRNs);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<GRNStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filter GRNs
  const filteredGRNs = grns.filter(grn => {
    const matchesSearch =
      grn.grnNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      grn.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      grn.vendorName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || grn.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Get status counts
  const statusCounts = {
    all: grns.length,
    draft: grns.filter(g => g.status === 'draft').length,
    received: grns.filter(g => g.status === 'received').length,
    verified: grns.filter(g => g.status === 'verified').length,
    completed: grns.filter(g => g.status === 'completed').length
  };

  // Get status badge
  const getStatusBadge = (status: GRNStatus) => {
    const badges = {
      'draft': { text: 'Draft', class: 'bg-gray-100 text-gray-800 border-gray-200' },
      'received': { text: 'Received', class: 'bg-blue-100 text-blue-800 border-blue-200' },
      'verified': { text: 'Verified', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      'completed': { text: 'Completed', class: 'bg-green-100 text-green-800 border-green-200' }
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
              <h1 className="text-3xl font-bold text-gray-900">Goods Receipt Note (GRN)</h1>
              <p className="mt-1 text-sm text-gray-500">
                Record and manage incoming stock from vendors
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Create GRN
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
                <p className="text-sm font-medium text-gray-600">Total GRNs</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{statusCounts.all}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Verification</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {statusCounts.received + statusCounts.draft}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <Package className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Verified Today</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{statusCounts.verified}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <CheckCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{statusCounts.completed}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-1 mb-6 flex gap-1">
          {(['all', 'draft', 'received', 'verified', 'completed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-green-100 text-green-800'
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
              placeholder="Search by GRN number, PO number, or vendor name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {/* GRN List */}
        <div className="space-y-4">
          {filteredGRNs.map((grn) => (
            <div key={grn.id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              {/* GRN Header */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{grn.grnNumber}</h3>
                      {getStatusBadge(grn.status)}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">PO Number</p>
                        <p className="font-medium text-gray-900">{grn.poNumber}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Vendor</p>
                        <p className="font-medium text-gray-900">{grn.vendorName}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Received Date</p>
                        <div className="flex items-center gap-1 font-medium text-gray-900">
                          <Calendar className="w-4 h-4" />
                          {grn.receivedDate}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total Value</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ₹{grn.totalValue.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* GRN Items */}
              <div className="p-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Items Received</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ordered</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {grn.items.map((item) => {
                        const isShortDelivery = item.receivedQty < item.orderedQty;
                        const isExcessDelivery = item.receivedQty > item.orderedQty;

                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.materialName}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-600">{item.materialCode}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {item.orderedQty} {item.unit}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-medium ${
                                isShortDelivery ? 'text-red-600' :
                                isExcessDelivery ? 'text-blue-600' :
                                'text-green-600'
                              }`}>
                                {item.receivedQty} {item.unit}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              ₹{item.unitPrice.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              ₹{item.totalValue.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* GRN Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Received By: </span>
                      <span className="font-medium text-gray-900">{grn.receivedBy}</span>
                    </div>
                    {grn.remarks && (
                      <div>
                        <span className="text-gray-500">Remarks: </span>
                        <span className="text-gray-900">{grn.remarks}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      View Details
                    </button>
                    {grn.status !== 'completed' && (
                      <button className="px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                        Verify & Complete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredGRNs.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No GRNs found</h3>
            <p className="text-sm text-gray-500">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first GRN to start receiving stock'}
            </p>
          </div>
        )}

        {/* Results Count */}
        {filteredGRNs.length > 0 && (
          <div className="mt-6 text-sm text-gray-600 text-center">
            Showing {filteredGRNs.length} of {grns.length} GRNs
          </div>
        )}
      </div>

      {/* Create GRN Modal - Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Create New GRN</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-6">
              {/* GRN Header Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">GRN Header</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PO Number <span className="text-red-500">*</span>
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500">
                      <option value="">Select Purchase Order</option>
                      <option value="PO-2025-048">PO-2025-048 - ABC Cement Suppliers</option>
                      <option value="PO-2025-049">PO-2025-049 - Steel Trading Co.</option>
                      <option value="PO-2025-050">PO-2025-050 - Building Materials Hub</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vendor Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value="ABC Cement Suppliers"
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Received Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., INV-2025-001"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehicle Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., KA-01-AB-1234"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Driver Name
                    </label>
                    <input
                      type="text"
                      placeholder="Driver name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>
              </div>

              {/* Materials Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Materials Received</h3>
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
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
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Ordered Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Received Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Unit Price</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      <tr>
                        <td className="px-3 py-2">
                          <select className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-green-500">
                            <option>Portland Cement (50kg)</option>
                            <option>TMT Steel 12mm</option>
                            <option>Sand (M-Sand)</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value="Bags" disabled className="w-20 px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" value="200" disabled className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right bg-gray-50" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" placeholder="0" className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-green-500" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" value="350" className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-green-500" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="font-semibold">₹70,000</span>
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

              {/* Quality Check */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quality Check</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-green-600 rounded focus:ring-green-500" />
                    <span className="text-sm font-medium text-gray-700">Materials match PO specifications</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-green-600 rounded focus:ring-green-500" />
                    <span className="text-sm font-medium text-gray-700">No visible damage</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-green-600 rounded focus:ring-green-500" />
                    <span className="text-sm font-medium text-gray-700">Packaging intact</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-green-600 rounded focus:ring-green-500" />
                    <span className="text-sm font-medium text-gray-700">Quantity verified</span>
                  </label>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                <textarea
                  rows={3}
                  placeholder="Any additional notes or observations..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  <p className="font-semibold">Total GRN Value: <span className="text-green-600">₹70,000</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    <Save className="w-4 h-4" />
                    Save GRN
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

export default React.memo(ReceiveStock);
