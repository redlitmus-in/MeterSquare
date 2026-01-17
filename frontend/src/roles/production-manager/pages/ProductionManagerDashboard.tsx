import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  Activity,
  ArrowRight,
  RefreshCw,
  Box,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Layers,
  DollarSign,
  TrendingDown
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';

// Route constants
const ROUTES = {
  STOCK: '/production-manager/m2-store/stock',
  REQUESTS: '/production-manager/m2-store/requests',
  STOCK_IN: '/production-manager/m2-store/stock-in',
  STOCK_OUT: '/production-manager/m2-store/stock-out',
  DISPATCH: '/production-manager/m2-store/dispatch',
  REPORTS: '/production-manager/m2-store/reports'
} as const;

interface Transaction {
  transaction_type: 'PURCHASE' | 'WITHDRAWAL';
  quantity: number;
  total_amount?: number;
  created_at?: string;
}

interface StockAlert {
  name: string;
  stock: number;
  unit: string;
  status: 'out-of-stock' | 'critical' | 'low';
  material_code?: string;
}

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
  recentTransactions: Transaction[];
  stockAlerts: StockAlert[];
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  onClick?: () => void;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, trend, onClick, color }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    orange: 'from-orange-500 to-orange-600',
    purple: 'from-purple-500 to-purple-600',
    red: 'from-red-500 to-red-600',
    gray: 'from-gray-500 to-gray-600'
  };

  const iconBgClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-600'
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 relative overflow-hidden ${onClick ? 'cursor-pointer hover:border-gray-300 transition-colors' : ''}`}
    >
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${colorClasses[color]}`} />

      <div className="flex items-center space-x-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgClasses[color]}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 mb-0.5">{title}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>

      {subtitle && (
        <p className="text-xs text-gray-500 mt-2">{subtitle}</p>
      )}
    </div>
  );
};

const ProductionManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000); // Refresh every 60 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async (manual = false) => {
    if (manual) setRefreshing(true);

    try {
      const dashboardData = await inventoryService.getDashboardData();
      setData(dashboardData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchDashboardData(true);
  };

  const getStockHealthPercentage = () => {
    if (!data || data.totalItems === 0) return 0;
    return Math.round((data.healthyStockItems / data.totalItems) * 100);
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center space-x-2">
                    <div className="h-8 w-8 bg-gray-200 rounded-lg flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="h-3 bg-gray-200 rounded w-20 mb-1"></div>
                      <div className="h-5 bg-gray-200 rounded w-16"></div>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-200 rounded w-24 mt-2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-xl font-semibold text-gray-700">Unable to load dashboard</p>
          <p className="text-gray-500 mt-2">Please try refreshing the page</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  const totalAlerts = data.lowStockItems + data.criticalItems + data.outOfStockItems;
  const stockHealth = getStockHealthPercentage();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Production Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Real-time inventory insights and analytics</p>
          </div>

          <div className="flex items-center space-x-3 mt-4 sm:mt-0">
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <Clock className="w-4 h-4" />
              <span>Updated {lastUpdated.toLocaleTimeString()}</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Materials"
            value={data.totalItems.toLocaleString()}
            subtitle="Active items in inventory"
            icon={<Layers className="w-4 h-4" />}
            color="blue"
            onClick={() => navigate(ROUTES.STOCK)}
          />

          <StatCard
            title="Inventory Value"
            value={`₹${data.totalValue >= 100000 ? `${(data.totalValue / 100000).toFixed(1)}L` : data.totalValue.toLocaleString()}`}
            subtitle={`${data.categories.length} categories`}
            icon={<DollarSign className="w-4 h-4" />}
            color="green"
          />

          <StatCard
            title="Stock Alerts"
            value={totalAlerts}
            subtitle={`${data.criticalItems} critical items`}
            icon={<AlertTriangle className="w-4 h-4" />}
            color={totalAlerts > 0 ? 'orange' : 'green'}
            onClick={() => navigate(ROUTES.STOCK)}
          />

          <StatCard
            title="Pending Requests"
            value={data.pendingRequests}
            subtitle="Awaiting approval"
            icon={<ShoppingCart className="w-4 h-4" />}
            color="purple"
            onClick={() => navigate(ROUTES.REQUESTS)}
          />
        </div>


        {/* Middle Section: Stock Health & Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Stock Health Overview - Line Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Stock Overview</h3>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${stockHealth >= 80 ? 'bg-green-500' : stockHealth >= 50 ? 'bg-orange-500' : 'bg-red-500'}`}></div>
                <span className="text-xl font-bold text-gray-900">{stockHealth}%</span>
              </div>
            </div>

            {/* Line Chart Area */}
            <div className="relative h-48 mb-4">
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500 pr-2">
                <span>100</span>
                <span>75</span>
                <span>50</span>
                <span>25</span>
                <span>0</span>
              </div>

              {/* Chart area */}
              <div className="ml-8 h-full relative border-l border-b border-gray-200">
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between">
                  <div className="border-t border-gray-100"></div>
                  <div className="border-t border-gray-100"></div>
                  <div className="border-t border-gray-100"></div>
                  <div className="border-t border-gray-100"></div>
                </div>

                {/* Chart bars (simulating line chart with vertical bars) */}
                <div className="absolute inset-0 flex items-end justify-around px-4">
                  {/* Materials */}
                  <div className="flex flex-col items-center flex-1 mx-1">
                    <div
                      className="w-full bg-gradient-to-t from-blue-500 to-blue-300 rounded-t transition-all duration-500"
                      style={{ height: `${(data.totalItems / 100) * 80}%`, maxHeight: '100%' }}
                    ></div>
                  </div>

                  {/* Assets */}
                  <div className="flex flex-col items-center flex-1 mx-1">
                    <div
                      className="w-full bg-gradient-to-t from-purple-500 to-purple-300 rounded-t transition-all duration-500"
                      style={{ height: '0%' }}
                    ></div>
                  </div>

                  {/* Labour */}
                  <div className="flex flex-col items-center flex-1 mx-1">
                    <div
                      className="w-full bg-gradient-to-t from-green-500 to-green-300 rounded-t transition-all duration-500"
                      style={{ height: '0%' }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* X-axis labels */}
            <div className="ml-8 flex justify-around text-xs text-gray-600 mb-4">
              <span className="flex items-center space-x-1">
                <Package className="w-3 h-3 text-blue-600" />
                <span>Materials</span>
              </span>
              <span className="flex items-center space-x-1">
                <Box className="w-3 h-3 text-purple-600" />
                <span>Assets</span>
              </span>
              <span className="flex items-center space-x-1">
                <Activity className="w-3 h-3 text-green-600" />
                <span>Labour</span>
              </span>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-200">
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Materials</p>
                <p className="text-lg font-bold text-blue-600">{data.totalItems}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Assets</p>
                <p className="text-lg font-bold text-purple-600">-</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Labour</p>
                <p className="text-lg font-bold text-green-600">-</p>
              </div>
            </div>
          </div>

          {/* Category Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Top Categories</h3>
              <button
                onClick={() => navigate('/production-manager/m2-store/stock')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
              >
                <span>View All</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.categories.length > 0 ? (
                data.categories.slice(0, 5).map((category, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{category.name}</p>
                        <p className="text-xs text-gray-500">{category.count} items</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        ₹{category.value >= 1000 ? `${(category.value / 1000).toFixed(1)}k` : category.value.toFixed(0)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No categories found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: Requests & Transactions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Request Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Status</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Pending</span>
                </div>
                <span className="text-2xl font-bold text-amber-600">{data.pendingRequests}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Approved</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{data.approvedRequests}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Rejected</span>
                </div>
                <span className="text-2xl font-bold text-red-600">{data.rejectedRequests}</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              <Activity className="w-5 h-5 text-gray-400" />
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.recentTransactions.length > 0 ? (
                data.recentTransactions.slice(0, 5).map((txn, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
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
                        <p className="text-xs text-gray-500">Qty: {txn.quantity}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">₹{txn.total_amount?.toFixed(0) || '0'}</p>
                      <p className="text-xs text-gray-500">
                        {txn.created_at ? new Date(txn.created_at).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent transactions</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Critical Alerts Banner */}
        {totalAlerts > 0 && (
          <div className="mt-8 bg-orange-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">Action Required</h4>
                  <p className="text-sm text-gray-600">
                    {totalAlerts} item{totalAlerts > 1 ? 's' : ''} need{totalAlerts === 1 ? 's' : ''} your attention ({data.criticalItems} critical)
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/production-manager/m2-store/stock')}
                className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center space-x-2"
              >
                <span>View Alerts</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ProductionManagerDashboard);
