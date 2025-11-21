import React, { useState, useEffect } from 'react';
import { Download, Calendar, TrendingUp, TrendingDown, Package, DollarSign, BarChart3, RefreshCw, AlertTriangle, Building2, ClipboardList } from 'lucide-react';
import { inventoryService, InventoryMaterial, InventoryTransaction, InternalMaterialRequest } from '../services/inventoryService';

type ReportType = 'stock-summary' | 'stock-movement' | 'valuation' | 'stock-alerts' | 'consumption';
type TimePeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

interface DashboardData {
  totalItems: number;
  totalValue: number;
  lowStockItems: number;
  criticalItems: number;
  outOfStockItems: number;
  healthyStockItems: number;
  categories: { name: string; count: number; value: number }[];
  recentTransactions: any[];
  stockAlerts: any[];
}

const M2StoreReports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<ReportType>('stock-summary');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);

  // Data states
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [internalRequests, setInternalRequests] = useState<InternalMaterialRequest[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashboard, mats, txns, requests] = await Promise.all([
        inventoryService.getDashboardData(),
        inventoryService.getAllInventoryItems(),
        inventoryService.getAllTransactions(),
        inventoryService.getAllInternalRequests()
      ]);
      setDashboardData(dashboard);
      setMaterials(mats || []);
      setTransactions(txns || []);
      setInternalRequests(requests || []);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals from real data
  const totalStockValue = dashboardData?.totalValue || 0;
  const totalLowStockItems = dashboardData?.lowStockItems || 0;
  const totalCriticalItems = dashboardData?.criticalItems || 0;
  const categories = dashboardData?.categories || [];

  // Calculate stock movement totals
  const purchaseTransactions = transactions.filter(t => t.transaction_type === 'PURCHASE');
  const withdrawalTransactions = transactions.filter(t => t.transaction_type === 'WITHDRAWAL');

  const getMaterialById = (id: number) => {
    return materials.find(m => m.inventory_material_id === id);
  };

  // Get low stock and critical items
  const lowStockMaterials = materials.filter(m =>
    m.min_stock_level && m.current_stock <= m.min_stock_level && m.current_stock > 0
  );
  const criticalMaterials = materials.filter(m =>
    m.min_stock_level && m.current_stock <= m.min_stock_level * 0.5 && m.current_stock > 0
  );
  const outOfStockMaterials = materials.filter(m => m.current_stock === 0);

  // Get fulfilled requests for consumption tracking
  const fulfilledRequests = internalRequests.filter(r => r.status === 'FULFILLED');

  // Group consumption by project
  const consumptionByProject = fulfilledRequests.reduce((acc, req) => {
    const projectKey = `Project ${req.project_id}`;
    if (!acc[projectKey]) {
      acc[projectKey] = { projectId: req.project_id, items: [], totalQuantity: 0 };
    }
    acc[projectKey].items.push(req);
    acc[projectKey].totalQuantity += req.quantity;
    return acc;
  }, {} as Record<string, { projectId: number; items: InternalMaterialRequest[]; totalQuantity: number }>);

  // Get status badge color
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-blue-100 text-blue-800',
      'DISPATCHED': 'bg-purple-100 text-purple-800',
      'FULFILLED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                <Download className="w-5 h-5" />
                Export Report
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Report Type Selection */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
            onClick={() => setSelectedReport('stock-alerts')}
            className={`p-4 rounded-lg border-2 transition-all relative ${
              selectedReport === 'stock-alerts'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            {(lowStockMaterials.length + outOfStockMaterials.length) > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {lowStockMaterials.length + outOfStockMaterials.length}
              </span>
            )}
            <AlertTriangle className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'stock-alerts' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'stock-alerts' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              Stock Alerts
            </p>
          </button>

          <button
            onClick={() => setSelectedReport('consumption')}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedReport === 'consumption'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <Building2 className={`w-6 h-6 mx-auto mb-2 ${
              selectedReport === 'consumption' ? 'text-indigo-600' : 'text-gray-600'
            }`} />
            <p className={`text-sm font-medium text-center ${
              selectedReport === 'consumption' ? 'text-indigo-900' : 'text-gray-900'
            }`}>
              Consumption
            </p>
          </button>
        </div>

        {/* Time Period Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-gray-700">Time Period:</label>
            <div className="flex gap-2 flex-wrap">
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

        {/* Stock Summary Report */}
        {selectedReport === 'stock-summary' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Stock Value</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {totalStockValue >= 100000 ? `${(totalStockValue / 100000).toFixed(2)}L` : `${totalStockValue.toLocaleString()}`}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Categories</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{categories.length}</p>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Items</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {categories.length > 0 ? (
                      categories.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">{item.name}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            {item.count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                            {item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500">
                          No category data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Stock Movement Report */}
        {selectedReport === 'stock-movement' && (
          <div className="space-y-6">
            {/* Movement Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Movements</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{transactions.length}</p>
                  </div>
                  <BarChart3 className="w-10 h-10 text-indigo-600" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Inbound (Purchase)</p>
                    <p className="mt-2 text-3xl font-bold text-green-600">{purchaseTransactions.length}</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-green-600" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Outbound (Withdrawal)</p>
                    <p className="mt-2 text-3xl font-bold text-red-600">{withdrawalTransactions.length}</p>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transactions.length > 0 ? (
                      transactions.slice(0, 20).map((txn) => {
                        const material = getMaterialById(txn.inventory_material_id);
                        const isPurchase = txn.transaction_type === 'PURCHASE';
                        return (
                          <tr key={txn.inventory_transaction_id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {txn.created_at ? new Date(txn.created_at).toLocaleDateString() : '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {material?.material_name || 'Unknown'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {isPurchase ? (
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
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                              <span className={isPurchase ? 'text-green-600' : 'text-red-600'}>
                                {isPurchase ? '+' : '-'}{txn.quantity} {material?.unit || ''}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                              {txn.total_amount?.toLocaleString() || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {txn.reference_number || `TXN-${txn.inventory_transaction_id}`}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          No transactions found
                        </td>
                      </tr>
                    )}
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
                  {totalStockValue >= 100000 ? `${(totalStockValue / 100000).toFixed(2)}L` : `${totalStockValue.toLocaleString()}`}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Materials</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{materials.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Healthy Stock</p>
                <p className="mt-2 text-3xl font-bold text-green-600">{dashboardData?.healthyStockItems || 0}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                <p className="mt-2 text-3xl font-bold text-red-600">{dashboardData?.outOfStockItems || 0}</p>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material Code</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {materials.length > 0 ? (
                      materials.map((material) => {
                        const stockValue = material.current_stock * material.unit_price;
                        const isOutOfStock = material.current_stock === 0;
                        const isLowStock = material.min_stock_level && material.current_stock <= material.min_stock_level;

                        return (
                          <tr key={material.inventory_material_id} className={`hover:bg-gray-50 ${isOutOfStock ? 'bg-red-50' : ''}`}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                              {material.material_code}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{material.material_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {material.category || 'Uncategorized'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <span className={isOutOfStock ? 'text-red-600' : isLowStock ? 'text-yellow-600' : 'text-gray-900'}>
                                {material.current_stock} {material.unit}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                              {material.unit_price.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold">
                              <span className={isOutOfStock ? 'text-red-600' : 'text-gray-900'}>
                                {stockValue.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          No materials found
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {materials.length > 0 && (
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                          TOTAL INVENTORY VALUE:
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-lg font-bold text-indigo-600">
                          {totalStockValue.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Stock Alerts Report */}
        {selectedReport === 'stock-alerts' && (
          <div className="space-y-6">
            {/* Alerts Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-red-50 rounded-lg shadow-sm border border-red-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-800">Out of Stock</p>
                    <p className="mt-2 text-3xl font-bold text-red-600">{outOfStockMaterials.length}</p>
                  </div>
                  <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
              </div>
              <div className="bg-orange-50 rounded-lg shadow-sm border border-orange-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-800">Critical Stock</p>
                    <p className="mt-2 text-3xl font-bold text-orange-600">{criticalMaterials.length}</p>
                  </div>
                  <AlertTriangle className="w-10 h-10 text-orange-500" />
                </div>
              </div>
              <div className="bg-yellow-50 rounded-lg shadow-sm border border-yellow-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Low Stock</p>
                    <p className="mt-2 text-3xl font-bold text-yellow-600">{lowStockMaterials.length}</p>
                  </div>
                  <Package className="w-10 h-10 text-yellow-500" />
                </div>
              </div>
            </div>

            {/* Out of Stock Items */}
            {outOfStockMaterials.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-red-200 overflow-hidden">
                <div className="p-6 border-b border-red-200 bg-red-50">
                  <h3 className="text-lg font-semibold text-red-900 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Out of Stock Items - Immediate Action Required
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material Code</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Min Stock Level</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {outOfStockMaterials.map((material) => (
                        <tr key={material.inventory_material_id} className="bg-red-50">
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900">{material.material_code}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{material.material_name}</td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {material.category || 'Uncategorized'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-900">{material.min_stock_level || '-'} {material.unit}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">OUT OF STOCK</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Low Stock Items */}
            {lowStockMaterials.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-yellow-200 overflow-hidden">
                <div className="p-6 border-b border-yellow-200 bg-yellow-50">
                  <h3 className="text-lg font-semibold text-yellow-900 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Low Stock Items - Reorder Recommended
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material Code</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material Name</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Min Stock Level</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Shortage</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {lowStockMaterials.map((material) => {
                        const shortage = (material.min_stock_level || 0) - material.current_stock;
                        const isCritical = material.min_stock_level && material.current_stock <= material.min_stock_level * 0.5;
                        return (
                          <tr key={material.inventory_material_id} className={isCritical ? 'bg-orange-50' : 'bg-yellow-50'}>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-900">{material.material_code}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">{material.material_name}</td>
                            <td className="px-6 py-4 text-right text-sm font-medium">
                              <span className={isCritical ? 'text-orange-600' : 'text-yellow-600'}>
                                {material.current_stock} {material.unit}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-sm text-gray-900">{material.min_stock_level} {material.unit}</td>
                            <td className="px-6 py-4 text-right text-sm font-bold text-red-600">-{shortage} {material.unit}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {outOfStockMaterials.length === 0 && lowStockMaterials.length === 0 && (
              <div className="bg-green-50 rounded-lg border border-green-200 p-12 text-center">
                <Package className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-green-900">All Stock Levels Healthy</h3>
                <p className="text-green-700 mt-2">No items require immediate attention.</p>
              </div>
            )}
          </div>
        )}

        {/* Consumption Report */}
        {selectedReport === 'consumption' && (
          <div className="space-y-6">
            {/* Consumption Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Total Requests</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{internalRequests.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Fulfilled</p>
                <p className="mt-2 text-3xl font-bold text-green-600">{fulfilledRequests.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="mt-2 text-3xl font-bold text-yellow-600">{internalRequests.filter(r => r.status === 'PENDING').length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <p className="text-sm font-medium text-gray-600">Projects Served</p>
                <p className="mt-2 text-3xl font-bold text-indigo-600">{Object.keys(consumptionByProject).length}</p>
              </div>
            </div>

            {/* Project-wise Consumption */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Project-wise Material Consumption
                </h3>
              </div>
              <div className="overflow-x-auto">
                {Object.keys(consumptionByProject).length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items Fulfilled</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(consumptionByProject).map(([projectName, data]) => (
                        <tr key={projectName} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-indigo-500" />
                            {projectName}
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-900">{data.items.length}</td>
                          <td className="px-6 py-4 text-right text-sm font-bold text-indigo-600">{data.totalQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-12 text-center text-gray-500">No consumption data available</div>
                )}
              </div>
            </div>

            {/* Request Audit Trail */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" />
                  Material Request Audit Trail
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request #</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fulfilled</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {internalRequests.length > 0 ? (
                      internalRequests.slice(0, 25).map((req) => (
                        <tr key={req.request_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900">#{req.request_number || req.request_id}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {req.material_name}
                            {req.brand && <span className="text-gray-500 text-xs ml-1">({req.brand})</span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">Project {req.project_id}</td>
                          <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">{req.quantity}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(req.status || 'PENDING')}`}>
                              {req.status || 'PENDING'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {req.created_at ? new Date(req.created_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {req.actual_delivery_date ? new Date(req.actual_delivery_date).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                          No material requests found
                        </td>
                      </tr>
                    )}
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
