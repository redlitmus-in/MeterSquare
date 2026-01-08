import React, { useEffect, useState } from 'react';
import {
  Package,
  AlertTriangle,
  DollarSign,
  ShoppingCart,
  CheckCircle,
  Activity,
  Box,
  AlertOctagon,
  Layers
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';

interface DashboardData {
  totalItems: number;
  totalValue: number;
  lowStockItems: number;
  criticalItems: number;
  outOfStockItems: number;
  healthyStockItems: number;
  totalTransactions: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  categories: { name: string; count: number; value: number }[];
  recentTransactions: any[];
  stockAlerts: any[];
}

const M2StoreDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const dashboardData = await inventoryService.getDashboardData();
      setData(dashboardData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStockHealthPercentage = () => {
    if (!data || data.totalItems === 0) return 0;
    return Math.round((data.healthyStockItems / data.totalItems) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-8 animate-pulse">
            <div>
              <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-48"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
          {/* KPI Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-20 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-28"></div>
                  </div>
                  <div className="h-14 w-14 bg-gray-200 rounded-full"></div>
                </div>
              </div>
            ))}
          </div>
          {/* Middle Section Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
                <div className="space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="flex items-center justify-between">
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                      <div className="h-4 bg-gray-200 rounded w-24"></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Bottom Section Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
                <div className="space-y-3">
                  {[...Array(5)].map((_, j) => (
                    <div key={j} className="h-12 bg-gray-200 rounded"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-gray-500">
          <p>Unable to load dashboard data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">M2 Store Analytics Dashboard</h1>
            <p className="text-sm text-gray-500">Real-time inventory insights and analytics</p>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Activity className="w-4 h-4" />
            <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Materials */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Materials</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{data.totalItems}</p>
                <div className="mt-2 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-slate-600" />
                  <span className="text-xs text-gray-500">Active items in inventory</span>
                </div>
              </div>
              <div className="p-3 bg-slate-100 rounded-full">
                <Package className="w-8 h-8 text-slate-600" />
              </div>
            </div>
          </div>

          {/* Inventory Value */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Inventory Value</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  ₹{data.totalValue >= 100000
                    ? `${(data.totalValue / 100000).toFixed(1)}L`
                    : data.totalValue.toLocaleString()}
                </p>
                <div className="mt-2 flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-gray-500">{data.categories.length} categories</span>
                </div>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>

          {/* Stock Alerts */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Stock Alerts</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {data.lowStockItems + data.criticalItems + data.outOfStockItems}
                </p>
                <div className="mt-2 flex items-center space-x-3 text-xs">
                  <span className="text-orange-600">{data.lowStockItems} Low</span>
                  <span className="text-red-600">{data.criticalItems} Critical</span>
                  <span className="text-gray-600">{data.outOfStockItems} Out</span>
                </div>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <AlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>

          {/* Material Requests */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Material Requests</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{data.pendingRequests}</p>
                <div className="mt-2 flex items-center space-x-2 text-xs">
                  <span className="text-amber-600">Pending approval</span>
                </div>
              </div>
              <div className="p-3 bg-amber-100 rounded-full">
                <ShoppingCart className="w-8 h-8 text-amber-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Stock Health & Category Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Stock Health */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Health Status</h3>
            <div className="space-y-4">
              {[
                { label: 'Healthy', value: data.healthyStockItems, color: 'green' },
                { label: 'Low Stock', value: data.lowStockItems, color: 'orange' },
                { label: 'Critical', value: data.criticalItems, color: 'red' },
                { label: 'Out of Stock', value: data.outOfStockItems, color: 'gray' }
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-${item.color}-500 rounded-full`}
                        style={{ width: `${data.totalItems > 0 ? (item.value / data.totalItems) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Distribution</h3>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {data.categories.length > 0 ? (
                data.categories.map((category, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{category.name}</p>
                      <p className="text-xs text-gray-500">{category.count} items</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-600">
                      ₹{category.value >= 1000 ? `${(category.value / 1000).toFixed(1)}k` : category.value.toFixed(0)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">No categories found</p>
                </div>
              )}
            </div>
          </div>

          {/* Request Status */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Status</h3>
            <div className="space-y-3">
              {[
                { label: 'Pending', value: data.pendingRequests, color: 'amber', bgColor: 'amber-50' },
                { label: 'Approved', value: data.approvedRequests, color: 'green', bgColor: 'green-50' },
                { label: 'Rejected', value: data.rejectedRequests, color: 'red', bgColor: 'red-50' }
              ].map(item => (
                <div key={item.label} className={`flex items-center justify-between p-3 bg-${item.bgColor} rounded-lg`}>
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 bg-${item.color}-500 rounded-full`} />
                    <span className="text-sm text-gray-700">{item.label}</span>
                  </div>
                  <span className={`text-lg font-bold text-${item.color}-600`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock Alerts */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Critical Stock Alerts</h3>
              <AlertOctagon className="w-5 h-5 text-red-500" />
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.stockAlerts.length > 0 ? (
                data.stockAlerts.map((alert, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${
                        alert.status === 'out-of-stock' ? 'bg-gray-500' :
                        alert.status === 'critical' ? 'bg-red-500' : 'bg-orange-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{alert.name}</p>
                        <p className="text-xs text-gray-500">Stock: {alert.stock} {alert.unit}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      alert.status === 'out-of-stock' ? 'bg-gray-100 text-gray-700' :
                      alert.status === 'critical' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {alert.status === 'out-of-stock' ? 'Out of Stock' :
                       alert.status === 'critical' ? 'Critical' : 'Low Stock'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">All items have healthy stock levels</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
              <Activity className="w-5 h-5 text-slate-500" />
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.recentTransactions.length > 0 ? (
                data.recentTransactions.map((txn, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        txn.transaction_type === 'PURCHASE' ? 'bg-green-100' : 'bg-blue-100'
                      }`}>
                        {txn.transaction_type === 'PURCHASE' ? (
                          <Package className="w-4 h-4 text-green-600" />
                        ) : (
                          <Box className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{txn.transaction_type}</p>
                        <p className="text-xs text-gray-500">
                          Qty: {txn.quantity} • ₹{txn.total_amount?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      {txn.created_at ? new Date(txn.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Box className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm">No recent transactions</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-8 bg-slate-100 border border-slate-200 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-700">{data.totalTransactions}</p>
              <p className="text-sm text-slate-500">Total Transactions</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-700">{data.categories.length}</p>
              <p className="text-sm text-slate-500">Categories</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-700">{getStockHealthPercentage()}%</p>
              <p className="text-sm text-slate-500">Stock Health</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-700">{data.approvedRequests}</p>
              <p className="text-sm text-slate-500">Approved Requests</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(M2StoreDashboard);
