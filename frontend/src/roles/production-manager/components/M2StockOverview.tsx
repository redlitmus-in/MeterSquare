import React, { useState } from 'react';
import { Search, Filter, Package, AlertTriangle, CheckCircle, Edit, TrendingUp, TrendingDown } from 'lucide-react';

// Mock M2 Store inventory data
const mockInventoryItems = [
  {
    id: 1,
    materialName: 'Cement PPC 43',
    brand: 'UltraTech',
    size: '50 kg',
    currentStock: 450,
    unit: 'bags',
    reorderPoint: 200,
    maxStock: 1000,
    binLocation: 'Rack A-12',
    lastRestocked: '2 days ago',
    avgConsumption: '25 bags/day',
    status: 'healthy',
    value: 337500 // ₹750 per bag
  },
  {
    id: 2,
    materialName: 'Steel Rebar 12mm',
    brand: 'Tata Steel',
    size: '12mm x 12m',
    currentStock: 0,
    unit: 'pcs',
    reorderPoint: 200,
    maxStock: 500,
    binLocation: 'Rack B-05',
    lastRestocked: '1 week ago',
    avgConsumption: '15 pcs/day',
    status: 'critical',
    value: 0
  },
  {
    id: 3,
    materialName: 'Paint Enamel',
    brand: 'Asian Paints',
    size: '20 ltrs',
    currentStock: 0,
    unit: 'ltrs',
    reorderPoint: 50,
    maxStock: 200,
    binLocation: 'Rack C-03',
    lastRestocked: '5 days ago',
    avgConsumption: '8 ltrs/day',
    status: 'critical',
    value: 0
  },
  {
    id: 4,
    materialName: 'Cement OPC',
    brand: 'ACC',
    size: '50 kg',
    currentStock: 45,
    unit: 'bags',
    reorderPoint: 100,
    maxStock: 500,
    binLocation: 'Rack A-15',
    lastRestocked: '3 days ago',
    avgConsumption: '12 bags/day',
    status: 'critical',
    value: 36000 // ₹800 per bag
  },
  {
    id: 5,
    materialName: 'Bricks Red',
    brand: 'Local Supplier',
    size: 'Standard',
    currentStock: 15000,
    unit: 'pcs',
    reorderPoint: 5000,
    maxStock: 20000,
    binLocation: 'Section C',
    lastRestocked: '1 day ago',
    avgConsumption: '500 pcs/day',
    status: 'healthy',
    value: 90000 // ₹6 per brick
  },
  {
    id: 6,
    materialName: 'Sand',
    brand: 'M-Sand',
    size: 'Bulk',
    currentStock: 0.5,
    unit: 'tons',
    reorderPoint: 2,
    maxStock: 10,
    binLocation: 'Yard-01',
    lastRestocked: '4 days ago',
    avgConsumption: '0.3 tons/day',
    status: 'warning',
    value: 7500 // ₹15000 per ton
  },
  {
    id: 7,
    materialName: 'Tiles Vitrified',
    brand: 'Kajaria',
    size: '600x600mm',
    currentStock: 850,
    unit: 'sqft',
    reorderPoint: 300,
    maxStock: 1500,
    binLocation: 'Rack D-08',
    lastRestocked: '1 week ago',
    avgConsumption: '40 sqft/day',
    status: 'healthy',
    value: 425000 // ₹500 per sqft
  },
  {
    id: 8,
    materialName: 'PVC Pipes 2 inch',
    brand: 'Finolex',
    size: '2 inch x 3m',
    currentStock: 120,
    unit: 'pcs',
    reorderPoint: 100,
    maxStock: 300,
    binLocation: 'Rack E-02',
    lastRestocked: '2 days ago',
    avgConsumption: '8 pcs/day',
    status: 'warning',
    value: 36000 // ₹300 per piece
  },
  {
    id: 9,
    materialName: 'Electrical Wire 2.5mm',
    brand: 'Polycab',
    size: '2.5mm sq',
    currentStock: 2500,
    unit: 'meters',
    reorderPoint: 1000,
    maxStock: 5000,
    binLocation: 'Rack F-01',
    lastRestocked: '3 days ago',
    avgConsumption: '100 m/day',
    status: 'healthy',
    value: 125000 // ₹50 per meter
  },
  {
    id: 10,
    materialName: 'Plywood Marine',
    brand: 'Greenply',
    size: '8x4 ft, 18mm',
    currentStock: 35,
    unit: 'sheets',
    reorderPoint: 20,
    maxStock: 100,
    binLocation: 'Rack G-05',
    lastRestocked: '5 days ago',
    avgConsumption: '3 sheets/day',
    status: 'healthy',
    value: 122500 // ₹3500 per sheet
  }
];

type StockStatus = 'all' | 'healthy' | 'warning' | 'critical';

const M2StockOverview: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockStatus>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filter items based on search and status
  const filteredItems = mockInventoryItems.filter(item => {
    const matchesSearch =
      item.materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.binLocation.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate summary stats
  const stats = {
    total: mockInventoryItems.length,
    healthy: mockInventoryItems.filter(i => i.status === 'healthy').length,
    warning: mockInventoryItems.filter(i => i.status === 'warning').length,
    critical: mockInventoryItems.filter(i => i.status === 'critical').length,
    totalValue: mockInventoryItems.reduce((sum, item) => sum + item.value, 0)
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-700 bg-green-100';
      case 'warning':
        return 'text-yellow-700 bg-yellow-100';
      case 'critical':
        return 'text-red-700 bg-red-100';
      default:
        return 'text-gray-700 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      case 'critical':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getStockPercentage = (current: number, max: number) => {
    return (current / max) * 100;
  };

  const getStockBarColor = (percentage: number) => {
    if (percentage >= 50) return 'bg-green-500';
    if (percentage >= 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">M2 Store Inventory</h2>
            <p className="text-sm text-gray-500 mt-1">
              {filteredItems.length} items • Total Value: ₹{(stats.totalValue / 100000).toFixed(2)}L
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by material name, brand, or bin location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filter Chips */}
        {showFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('healthy')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === 'healthy'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              Healthy ({stats.healthy})
            </button>
            <button
              onClick={() => setStatusFilter('warning')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === 'warning'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
              }`}
            >
              Warning ({stats.warning})
            </button>
            <button
              onClick={() => setStatusFilter('critical')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                statusFilter === 'critical'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              Critical ({stats.critical})
            </button>
          </div>
        )}
      </div>

      {/* Inventory Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Material
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock Level
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredItems.map((item) => {
              const stockPercentage = getStockPercentage(item.currentStock, item.maxStock);

              return (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{item.materialName}</p>
                      <p className="text-sm text-gray-500">
                        {item.brand} • {item.size}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-900">
                          {item.currentStock} {item.unit}
                        </span>
                        <span className="text-gray-500">
                          / {item.maxStock}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getStockBarColor(stockPercentage)}`}
                          style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Reorder at: {item.reorderPoint} {item.unit}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{item.binLocation}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Last restocked: {item.lastRestocked}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                      {getStatusIcon(item.status)}
                      <span className="capitalize">{item.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.avgConsumption}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">
                      ₹{(item.value / 1000).toFixed(1)}K
                    </p>
                    {item.value > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        ₹{(item.value / item.currentStock).toFixed(0)}/{item.unit}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1">
                      <Edit className="w-4 h-4" />
                      Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
          <p className="text-sm text-gray-500">
            Try adjusting your search or filter criteria
          </p>
        </div>
      )}

      {/* Footer Stats */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-gray-600">{stats.healthy} Healthy</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <span className="text-gray-600">{stats.warning} Warning</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-gray-600">{stats.critical} Critical</span>
            </div>
          </div>
          <p className="text-gray-500">
            Showing {filteredItems.length} of {stats.total} items
          </p>
        </div>
      </div>
    </div>
  );
};

export default M2StockOverview;
