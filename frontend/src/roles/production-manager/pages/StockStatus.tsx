import React, { useState } from 'react';
import { Search, Download, RefreshCw, TrendingUp, TrendingDown, Package, AlertCircle } from 'lucide-react';

// Stock status types
type StockStatus = 'healthy' | 'warning' | 'critical' | 'out-of-stock';

interface StockItem {
  id: string;
  materialCode: string;
  materialName: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderPoint: number;
  maxStock: number;
  minStock: number;
  binLocation: string;
  status: StockStatus;
  lastMovement: {
    type: 'in' | 'out';
    quantity: number;
    date: string;
  };
  avgMonthlyConsumption: number;
  daysUntilReorder: number;
}

// Mock stock data
const mockStockItems: StockItem[] = [
  {
    id: '1',
    materialCode: 'MAT-001',
    materialName: 'Portland Cement (50kg)',
    category: 'Cement',
    unit: 'Bags',
    currentStock: 450,
    reorderPoint: 200,
    maxStock: 1000,
    minStock: 100,
    binLocation: 'A-01-01',
    status: 'healthy',
    lastMovement: { type: 'in', quantity: 200, date: '2025-01-15' },
    avgMonthlyConsumption: 350,
    daysUntilReorder: 25
  },
  {
    id: '2',
    materialCode: 'MAT-002',
    materialName: 'TMT Steel 12mm',
    category: 'Steel',
    unit: 'Tons',
    currentStock: 8.5,
    reorderPoint: 10,
    maxStock: 50,
    minStock: 5,
    binLocation: 'B-02-03',
    status: 'warning',
    lastMovement: { type: 'out', quantity: 3.5, date: '2025-01-14' },
    avgMonthlyConsumption: 12,
    daysUntilReorder: 4
  },
  {
    id: '3',
    materialCode: 'MAT-003',
    materialName: 'Sand (M-Sand)',
    category: 'Aggregates',
    unit: 'CFT',
    currentStock: 45,
    reorderPoint: 100,
    maxStock: 500,
    minStock: 50,
    binLocation: 'C-01-01',
    status: 'critical',
    lastMovement: { type: 'out', quantity: 75, date: '2025-01-15' },
    avgMonthlyConsumption: 250,
    daysUntilReorder: -2
  },
  {
    id: '4',
    materialCode: 'MAT-004',
    materialName: 'Paint - Asian Paints (White)',
    category: 'Paint',
    unit: 'Ltr',
    currentStock: 0,
    reorderPoint: 50,
    maxStock: 200,
    minStock: 20,
    binLocation: 'D-03-02',
    status: 'out-of-stock',
    lastMovement: { type: 'out', quantity: 25, date: '2025-01-10' },
    avgMonthlyConsumption: 80,
    daysUntilReorder: -5
  },
  {
    id: '5',
    materialCode: 'MAT-005',
    materialName: 'Concrete Blocks (6")',
    category: 'Blocks',
    unit: 'Nos',
    currentStock: 2500,
    reorderPoint: 1000,
    maxStock: 5000,
    minStock: 500,
    binLocation: 'E-01-01',
    status: 'healthy',
    lastMovement: { type: 'in', quantity: 1000, date: '2025-01-15' },
    avgMonthlyConsumption: 1500,
    daysUntilReorder: 30
  },
  {
    id: '6',
    materialCode: 'MAT-006',
    materialName: 'PVC Pipes 4"',
    category: 'Plumbing',
    unit: 'Mtr',
    currentStock: 85,
    reorderPoint: 100,
    maxStock: 500,
    minStock: 50,
    binLocation: 'F-02-01',
    status: 'warning',
    lastMovement: { type: 'out', quantity: 45, date: '2025-01-13' },
    avgMonthlyConsumption: 150,
    daysUntilReorder: 6
  },
  {
    id: '7',
    materialCode: 'MAT-007',
    materialName: 'Electrical Wire 2.5mm',
    category: 'Electrical',
    unit: 'Mtr',
    currentStock: 1200,
    reorderPoint: 500,
    maxStock: 2000,
    minStock: 300,
    binLocation: 'G-01-05',
    status: 'healthy',
    lastMovement: { type: 'in', quantity: 500, date: '2025-01-12' },
    avgMonthlyConsumption: 600,
    daysUntilReorder: 35
  },
  {
    id: '8',
    materialCode: 'MAT-008',
    materialName: 'Tile Adhesive',
    category: 'Adhesives',
    unit: 'Bags',
    currentStock: 32,
    reorderPoint: 75,
    maxStock: 200,
    minStock: 40,
    binLocation: 'H-02-01',
    status: 'critical',
    lastMovement: { type: 'out', quantity: 38, date: '2025-01-14' },
    avgMonthlyConsumption: 95,
    daysUntilReorder: -1
  }
];

const StockStatus: React.FC = () => {
  const [stockItems, setStockItems] = useState<StockItem[]>(mockStockItems);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(stockItems.map(item => item.category)))];

  // Filter stock items
  const filteredItems = stockItems.filter(item => {
    const matchesSearch =
      item.materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.materialCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Get status counts
  const statusCounts = {
    all: stockItems.length,
    healthy: stockItems.filter(i => i.status === 'healthy').length,
    warning: stockItems.filter(i => i.status === 'warning').length,
    critical: stockItems.filter(i => i.status === 'critical').length,
    'out-of-stock': stockItems.filter(i => i.status === 'out-of-stock').length
  };

  // Calculate total inventory value (mock calculation)
  const totalValue = stockItems.reduce((sum, item) => sum + (item.currentStock * 100), 0);

  // Get status badge styling
  const getStatusBadge = (status: StockStatus) => {
    const styles = {
      'healthy': 'bg-green-100 text-green-800 border-green-200',
      'warning': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'critical': 'bg-red-100 text-red-800 border-red-200',
      'out-of-stock': 'bg-gray-100 text-gray-800 border-gray-200'
    };

    const labels = {
      'healthy': 'Healthy',
      'warning': 'Low Stock',
      'critical': 'Critical',
      'out-of-stock': 'Out of Stock'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status]}`}>
        {labels[status]}
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
              <h1 className="text-3xl font-bold text-gray-900">Stock Status</h1>
              <p className="mt-1 text-sm text-gray-500">
                Monitor inventory levels and stock alerts
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Stock Value</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  ₹{(totalValue / 100000).toFixed(1)}L
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Items in Stock</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{statusCounts.healthy}</p>
                <p className="text-xs text-green-600 font-medium">Healthy levels</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Low Stock Alerts</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {statusCounts.warning + statusCounts.critical}
                </p>
                <p className="text-xs text-yellow-600 font-medium">Needs attention</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{statusCounts['out-of-stock']}</p>
                <p className="text-xs text-red-600 font-medium">Urgent reorder</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Status Filter Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <button
            onClick={() => setStatusFilter('all')}
            className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all ${
              statusFilter === 'all' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-medium text-gray-600">All Items</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{statusCounts.all}</p>
          </button>

          <button
            onClick={() => setStatusFilter('healthy')}
            className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all ${
              statusFilter === 'healthy' ? 'border-green-500 ring-2 ring-green-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-medium text-gray-600">Healthy</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{statusCounts.healthy}</p>
          </button>

          <button
            onClick={() => setStatusFilter('warning')}
            className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all ${
              statusFilter === 'warning' ? 'border-yellow-500 ring-2 ring-yellow-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-medium text-gray-600">Low Stock</p>
            <p className="mt-1 text-2xl font-bold text-yellow-600">{statusCounts.warning}</p>
          </button>

          <button
            onClick={() => setStatusFilter('critical')}
            className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all ${
              statusFilter === 'critical' ? 'border-red-500 ring-2 ring-red-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-medium text-gray-600">Critical</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{statusCounts.critical}</p>
          </button>

          <button
            onClick={() => setStatusFilter('out-of-stock')}
            className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all ${
              statusFilter === 'out-of-stock' ? 'border-gray-500 ring-2 ring-gray-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-medium text-gray-600">Out of Stock</p>
            <p className="mt-1 text-2xl font-bold text-gray-600">{statusCounts['out-of-stock']}</p>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search materials..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stock Items List */}
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const stockPercentage = (item.currentStock / item.maxStock) * 100;
            const isOverdue = item.daysUntilReorder < 0;

            return (
              <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{item.materialName}</h3>
                      {getStatusBadge(item.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="font-medium">{item.materialCode}</span>
                      <span>•</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                        {item.category}
                      </span>
                      <span>•</span>
                      <span>Location: {item.binLocation}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">
                      {item.currentStock} <span className="text-sm font-normal text-gray-500">{item.unit}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">of {item.maxStock} max</p>
                  </div>
                </div>

                {/* Stock Level Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">Stock Level</span>
                    <span className="text-xs font-medium text-gray-600">{stockPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="relative w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        stockPercentage >= 50 ? 'bg-green-500' :
                        stockPercentage >= 20 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                    />
                    {/* Reorder Point Marker */}
                    <div
                      className="absolute top-0 h-3 w-0.5 bg-gray-600"
                      style={{ left: `${(item.reorderPoint / item.maxStock) * 100}%` }}
                      title="Reorder Point"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">Min: {item.minStock}</span>
                    <span className="text-xs font-medium text-gray-600">Reorder: {item.reorderPoint}</span>
                    <span className="text-xs text-gray-500">Max: {item.maxStock}</span>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Last Movement</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.lastMovement.type === 'in' ? (
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {item.lastMovement.quantity} {item.unit}
                      </span>
                      <span className="text-xs text-gray-500">on {item.lastMovement.date}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Avg Monthly Consumption</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {item.avgMonthlyConsumption} {item.unit}/month
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Days Until Reorder</p>
                    <p className={`text-sm font-bold mt-1 ${
                      isOverdue ? 'text-red-600' :
                      item.daysUntilReorder <= 7 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {isOverdue ? `${Math.abs(item.daysUntilReorder)} days overdue` : `${item.daysUntilReorder} days`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No items found</h3>
            <p className="text-sm text-gray-500">
              Try adjusting your search or filters
            </p>
          </div>
        )}

        {/* Results Count */}
        {filteredItems.length > 0 && (
          <div className="mt-6 text-sm text-gray-600 text-center">
            Showing {filteredItems.length} of {stockItems.length} items
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(StockStatus);
