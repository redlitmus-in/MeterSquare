import React, { useState } from 'react';
import { Download, Calendar, TrendingUp, TrendingDown, Package, DollarSign, FileText, BarChart3, PieChart } from 'lucide-react';

// Report types
type ReportType = 'stock-summary' | 'stock-movement' | 'valuation' | 'grn-summary' | 'dispatch-summary' | 'variance-analysis';
type TimePeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

interface StockMovementData {
  date: string;
  material: string;
  category: string;
  type: 'in' | 'out';
  quantity: number;
  unit: string;
  reference: string;
}

interface StockSummaryData {
  category: string;
  totalItems: number;
  totalValue: number;
  lowStockItems: number;
  criticalItems: number;
}

// Mock data
const mockStockMovement: StockMovementData[] = [
  {
    date: '2025-01-15',
    material: 'Portland Cement (50kg)',
    category: 'Cement',
    type: 'in',
    quantity: 200,
    unit: 'Bags',
    reference: 'GRN-2025-001'
  },
  {
    date: '2025-01-15',
    material: 'Portland Cement (50kg)',
    category: 'Cement',
    type: 'out',
    quantity: 100,
    unit: 'Bags',
    reference: 'DSP-2025-001'
  },
  {
    date: '2025-01-14',
    material: 'TMT Steel 12mm',
    category: 'Steel',
    type: 'in',
    quantity: 5,
    unit: 'Tons',
    reference: 'GRN-2025-002'
  },
  {
    date: '2025-01-14',
    material: 'TMT Steel 12mm',
    category: 'Steel',
    type: 'out',
    quantity: 2,
    unit: 'Tons',
    reference: 'DSP-2025-002'
  }
];

const mockStockSummary: StockSummaryData[] = [
  { category: 'Cement', totalItems: 1, totalValue: 157500, lowStockItems: 0, criticalItems: 0 },
  { category: 'Steel', totalItems: 1, totalValue: 552500, lowStockItems: 1, criticalItems: 0 },
  { category: 'Aggregates', totalItems: 1, totalValue: 2025, lowStockItems: 0, criticalItems: 1 },
  { category: 'Paint', totalItems: 1, totalValue: 0, lowStockItems: 0, criticalItems: 1 },
  { category: 'Blocks', totalItems: 1, totalValue: 87500, lowStockItems: 0, criticalItems: 0 },
  { category: 'Plumbing', totalItems: 1, totalValue: 10200, lowStockItems: 1, criticalItems: 0 },
  { category: 'Electrical', totalItems: 1, totalValue: 144000, lowStockItems: 0, criticalItems: 0 }
];

const M2StoreReports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<ReportType>('stock-summary');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Calculate totals for stock summary
  const totalStockValue = mockStockSummary.reduce((sum, item) => sum + item.totalValue, 0);
  const totalLowStockItems = mockStockSummary.reduce((sum, item) => sum + item.lowStockItems, 0);
  const totalCriticalItems = mockStockSummary.reduce((sum, item) => sum + item.criticalItems, 0);

  // Calculate stock movement totals
  const totalInbound = mockStockMovement.filter(m => m.type === 'in').length;
  const totalOutbound = mockStockMovement.filter(m => m.type === 'out').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
              <p className="mt-1 text-sm text-gray-500">
                Inventory reports and insights
              </p>
            </div>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              <Download className="w-5 h-5" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Report Type Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <button
            onClick={() => setSelectedReport('stock-summary')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedReport === 'stock-summary'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <Package className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'stock-summary' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'stock-summary' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              Stock Summary
            </p>
          </button>

          <button
            onClick={() => setSelectedReport('stock-movement')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedReport === 'stock-movement'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <TrendingUp className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'stock-movement' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'stock-movement' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              Stock Movement
            </p>
          </button>

          <button
            onClick={() => setSelectedReport('valuation')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedReport === 'valuation'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <DollarSign className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'valuation' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'valuation' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              Valuation
            </p>
          </button>

          <button
            onClick={() => setSelectedReport('grn-summary')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedReport === 'grn-summary'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <FileText className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'grn-summary' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'grn-summary' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              GRN Summary
            </p>
          </button>

          <button
            onClick={() => setSelectedReport('dispatch-summary')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedReport === 'dispatch-summary'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <BarChart3 className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'dispatch-summary' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'dispatch-summary' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              Dispatch Summary
            </p>
          </button>

          <button
            onClick={() => setSelectedReport('variance-analysis')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedReport === 'variance-analysis'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <PieChart className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'variance-analysis' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'variance-analysis' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              Variance Analysis
            </p>
          </button>
        </div>

        {/* Time Period Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Time Period:</label>
            <div className="flex gap-2">
              {(['today', 'week', 'month', 'quarter', 'year', 'custom'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    timePeriod === period
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
            {timePeriod === 'custom' && (
              <div className="flex items-center gap-2 ml-auto">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Report Content */}
        {selectedReport === 'stock-summary' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Stock Value</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  ₹{(totalStockValue / 100000).toFixed(2)}L
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Categories</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{mockStockSummary.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                <p className="mt-2 text-3xl font-bold text-yellow-600">{totalLowStockItems}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Critical Items</p>
                <p className="mt-2 text-3xl font-bold text-red-600">{totalCriticalItems}</p>
              </div>
            </div>

            {/* Stock Summary Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Stock Summary by Category</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Items
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Value
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Low Stock
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Critical
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {mockStockSummary.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">{item.category}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                          {item.totalItems}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                          ₹{item.totalValue.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {item.lowStockItems > 0 ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              {item.lowStockItems}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {item.criticalItems > 0 ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              {item.criticalItems}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {selectedReport === 'stock-movement' && (
          <div className="space-y-6">
            {/* Movement Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Movements</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockStockMovement.length}
                    </p>
                  </div>
                  <BarChart3 className="w-10 h-10 text-indigo-600" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Inbound</p>
                    <p className="mt-2 text-3xl font-bold text-green-600">{totalInbound}</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-green-600" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Outbound</p>
                    <p className="mt-2 text-3xl font-bold text-red-600">{totalOutbound}</p>
                  </div>
                  <TrendingDown className="w-10 h-10 text-red-600" />
                </div>
              </div>
            </div>

            {/* Stock Movement Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Stock Movement Details</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reference
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {mockStockMovement.map((movement, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {movement.date}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {movement.material}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {movement.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {movement.type === 'in' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <TrendingUp className="w-3 h-3" />
                              Inbound
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <TrendingDown className="w-3 h-3" />
                              Outbound
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                          {movement.quantity} {movement.unit}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {movement.reference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Valuation Report */}
        {selectedReport === 'valuation' && (
          <div className="space-y-6">
            {/* Valuation Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Stock Value</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  ₹{(totalStockValue / 100000).toFixed(2)}L
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Materials</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">6</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Highest Value</p>
                <p className="mt-2 text-xl font-bold text-green-600">TMT Steel 12mm</p>
                <p className="text-sm text-gray-500 mt-1">₹5,52,500</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Zero Stock Value</p>
                <p className="mt-2 text-3xl font-bold text-red-600">1</p>
              </div>
            </div>

            {/* Valuation Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Material-wise Stock Valuation</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Stock
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unit Price
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">MAT-001</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Portland Cement (50kg)</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Cement
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">450 Bags</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹350</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">₹1,57,500</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">MAT-002</td>
                      <td className="px-6 py-4 text-sm text-gray-900">TMT Steel 12mm</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Steel
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">8.5 Tons</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹65,000</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-green-600">₹5,52,500</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">MAT-003</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Sand (M-Sand)</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Aggregates
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-red-600">45 CFT</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹45</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">₹2,025</td>
                    </tr>
                    <tr className="hover:bg-gray-50 bg-red-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">MAT-004</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Paint - Asian Paints (White)</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Paint
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-red-600">0 Ltr</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹450</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-red-600">₹0</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">MAT-005</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Concrete Blocks (6")</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Blocks
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">2500 Nos</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹35</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">₹87,500</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">MAT-006</td>
                      <td className="px-6 py-4 text-sm text-gray-900">PVC Pipes 4"</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Plumbing
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">85 Mtr</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹120</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">₹10,200</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                        TOTAL INVENTORY VALUE:
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-lg font-bold text-indigo-600">
                        ₹{totalStockValue.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* GRN Summary Report */}
        {selectedReport === 'grn-summary' && (
          <div className="space-y-6">
            {/* GRN Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total GRNs</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">24</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Value Received</p>
                <p className="mt-2 text-3xl font-bold text-green-600">₹12.5L</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">This Month</p>
                <p className="mt-2 text-3xl font-bold text-indigo-600">8</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Pending Quality Check</p>
                <p className="mt-2 text-3xl font-bold text-yellow-600">2</p>
              </div>
            </div>

            {/* GRN Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">GRN Transaction History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        GRN No
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PO Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vendor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Value
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">GRN-2025-001</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">15-Jan-2025</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">PO-2025-048</td>
                      <td className="px-6 py-4 text-sm text-gray-900">UltraTech Cement Ltd.</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Portland Cement (50kg)</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">200 Bags</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹70,000</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Approved
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">GRN-2025-002</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">14-Jan-2025</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">PO-2025-051</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Tata Steel</td>
                      <td className="px-6 py-4 text-sm text-gray-900">TMT Steel 12mm</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">5 Tons</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹3,25,000</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Approved
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">GRN-2025-003</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">13-Jan-2025</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">PO-2025-042</td>
                      <td className="px-6 py-4 text-sm text-gray-900">M-Sand Suppliers</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Sand (M-Sand)</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">100 CFT</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹4,500</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          QC Pending
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">GRN-2025-004</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">12-Jan-2025</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">PO-2025-055</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Block Manufacturers</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Concrete Blocks (6")</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">1000 Nos</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹35,000</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Approved
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">GRN-2025-005</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">11-Jan-2025</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">PO-2025-038</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Supreme Pipes</td>
                      <td className="px-6 py-4 text-sm text-gray-900">PVC Pipes 4"</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">50 Mtr</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹6,000</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          QC Pending
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Dispatch Summary Report */}
        {selectedReport === 'dispatch-summary' && (
          <div className="space-y-6">
            {/* Dispatch Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Dispatches</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">18</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Value Dispatched</p>
                <p className="mt-2 text-3xl font-bold text-red-600">₹8.2L</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">This Month</p>
                <p className="mt-2 text-3xl font-bold text-indigo-600">6</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Pending Returns</p>
                <p className="mt-2 text-3xl font-bold text-yellow-600">1</p>
              </div>
            </div>

            {/* Dispatch Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Dispatch Transaction History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dispatch No
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Value
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Requested By
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">DSP-2025-001</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">15-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Skyline Residency</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Portland Cement (50kg)</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">100 Bags</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹35,000</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Site Engineer - Tower A</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Delivered
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">DSP-2025-002</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">14-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Green Valley Villas</td>
                      <td className="px-6 py-4 text-sm text-gray-900">TMT Steel 12mm</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">2 Tons</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹1,30,000</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Site Supervisor - Block B</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Delivered
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">DSP-2025-003</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">13-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Skyline Residency</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Sand (M-Sand)</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">55 CFT</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹2,475</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Site Engineer - Tower B</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Delivered
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">DSP-2025-004</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">12-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Green Valley Villas</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Concrete Blocks (6")</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">1500 Nos</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹52,500</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Site Engineer - Block A</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          In Transit
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">DSP-2025-005</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">11-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Skyline Residency</td>
                      <td className="px-6 py-4 text-sm text-gray-900">PVC Pipes 4"</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">35 Mtr</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">₹4,200</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Plumber Supervisor</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Return Pending
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Variance Analysis Report */}
        {selectedReport === 'variance-analysis' && (
          <div className="space-y-6">
            {/* Variance Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Stock Takes</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">12</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Variance</p>
                <p className="mt-2 text-3xl font-bold text-red-600">-3.2%</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Items with Variance</p>
                <p className="mt-2 text-3xl font-bold text-yellow-600">4</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Critical Variance</p>
                <p className="mt-2 text-3xl font-bold text-red-600">1</p>
                <p className="text-xs text-gray-500 mt-1">&gt; 5% difference</p>
              </div>
            </div>

            {/* Variance Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Stock Take Variance Analysis</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stock Take Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        System Stock
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Physical Count
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Variance
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Variance %
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">10-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Portland Cement (50kg)</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Cement
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">450 Bags</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">448 Bags</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-red-600">-2 Bags</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-red-600">-0.44%</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Normal handling loss</td>
                    </tr>
                    <tr className="hover:bg-gray-50 bg-red-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">10-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">TMT Steel 12mm</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Steel
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">8.5 Tons</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">8.0 Tons</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-red-600">-0.5 Tons</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-red-600">-5.88%</td>
                      <td className="px-6 py-4 text-sm text-red-600 font-medium">Critical - Under investigation</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">10-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Sand (M-Sand)</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Aggregates
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">45 CFT</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">46 CFT</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600">+1 CFT</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600">+2.22%</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Measurement variation</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">10-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">Concrete Blocks (6")</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Blocks
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">2500 Nos</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">2500 Nos</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600">0 Nos</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600">0.00%</td>
                      <td className="px-6 py-4 text-sm text-green-600">Perfect match</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">10-Jan-2025</td>
                      <td className="px-6 py-4 text-sm text-gray-900">PVC Pipes 4"</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Plumbing
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">85 Mtr</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">83 Mtr</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-red-600">-2 Mtr</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-red-600">-2.35%</td>
                      <td className="px-6 py-4 text-sm text-gray-600">Cutting waste accounted</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(M2StoreReports);
