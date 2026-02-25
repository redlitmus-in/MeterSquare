import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  Users,
  Building2,
  FileText,
  TrendingUp,
  Shield,
  Activity,
  AlertCircle,
  RefreshCw,
  Package,
  Truck,
  DollarSign,
  ShoppingCart,
  BarChart3,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  Store,
  Boxes,
  ClipboardList
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { showError } from '@/utils/toastHelper';
import { adminApiExtended, DashboardAnalytics, TopPerformersResponse, FinancialSummary } from '@/api/admin';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const AdminDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [topPerformers, setTopPerformers] = useState<TopPerformersResponse | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [analyticsData, performersData, financialData] = await Promise.all([
        adminApiExtended.getDashboardAnalytics(periodDays),
        adminApiExtended.getTopPerformers({ limit: 5, days: periodDays }),
        adminApiExtended.getFinancialSummary(periodDays)
      ]);

      setAnalytics(analyticsData);
      setTopPerformers(performersData);
      setFinancialSummary(financialData);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      showError('Failed to load dashboard data', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  }, [periodDays]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Chart configurations
  const roleDistributionChart = analytics ? {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 280
    },
    title: { text: '' },
    credits: { enabled: false },
    tooltip: {
      pointFormat: '<b>{point.y}</b> users ({point.percentage:.1f}%)'
    },
    plotOptions: {
      pie: {
        innerSize: '55%',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>',
          style: { fontSize: '11px', fontWeight: '400' }
        },
        colors: ['#243d8a', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16']
      }
    },
    series: [{
      name: 'Users',
      data: analytics.users.role_distribution.map(r => ({
        name: r.role.replace(/([A-Z])/g, ' $1').trim(),
        y: r.count
      }))
    }]
  } : null;

  const userTrendChart = analytics ? {
    chart: {
      type: 'areaspline',
      backgroundColor: 'transparent',
      height: 280
    },
    title: { text: '' },
    credits: { enabled: false },
    xAxis: {
      categories: analytics.users.registration_trend.map(d => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }),
      lineColor: '#e5e7eb',
      labels: { style: { fontSize: '10px' } }
    },
    yAxis: {
      title: { text: '' },
      gridLineColor: '#f3f4f6',
      min: 0
    },
    tooltip: { shared: true },
    plotOptions: {
      areaspline: {
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, 'rgba(36, 61, 138, 0.3)'], [1, 'rgba(36, 61, 138, 0.02)']]
        },
        marker: { radius: 3, fillColor: '#243d8a' },
        lineWidth: 2,
        lineColor: '#243d8a'
      }
    },
    series: [{
      name: 'New Users',
      data: analytics.users.registration_trend.map(d => d.count)
    }]
  } : null;

  const crTrendChart = analytics ? {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 280
    },
    title: { text: '' },
    credits: { enabled: false },
    xAxis: {
      categories: analytics.change_requests.creation_trend.map(d => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }),
      lineColor: '#e5e7eb',
      labels: { style: { fontSize: '10px' } }
    },
    yAxis: {
      title: { text: '' },
      gridLineColor: '#f3f4f6',
      min: 0
    },
    plotOptions: {
      column: {
        borderRadius: 4,
        color: '#10b981'
      }
    },
    series: [{
      name: 'Change Requests',
      data: analytics.change_requests.creation_trend.map(d => d.count)
    }]
  } : null;

  const projectStatusChart = analytics ? {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 200
    },
    title: { text: '' },
    credits: { enabled: false },
    plotOptions: {
      pie: {
        dataLabels: {
          enabled: true,
          format: '{point.name}: {point.y}',
          style: { fontSize: '10px' }
        },
        colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280']
      }
    },
    series: [{
      name: 'Projects',
      data: [
        { name: 'Active', y: analytics.projects.active },
        { name: 'Completed', y: analytics.projects.completed },
        { name: 'Pending', y: analytics.projects.pending },
        { name: 'On Hold', y: analytics.projects.on_hold || 0 }
      ].filter(d => d.y > 0)
    }]
  } : null;

  const financialTrendChart = financialSummary ? {
    chart: {
      type: 'area',
      backgroundColor: 'transparent',
      height: 280
    },
    title: { text: '' },
    credits: { enabled: false },
    xAxis: {
      categories: financialSummary.daily_cost_trend.map(d => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }),
      lineColor: '#e5e7eb',
      labels: { style: { fontSize: '10px' } }
    },
    yAxis: {
      title: { text: '' },
      gridLineColor: '#f3f4f6',
      labels: {
        formatter: function(this: Highcharts.AxisLabelsFormatterContextObject) {
          return formatCurrency(this.value as number);
        }
      }
    },
    plotOptions: {
      area: {
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, 'rgba(245, 158, 11, 0.3)'], [1, 'rgba(245, 158, 11, 0.02)']]
        },
        marker: { radius: 3, fillColor: '#f59e0b' },
        lineWidth: 2,
        lineColor: '#f59e0b'
      }
    },
    series: [{
      name: 'Daily Cost',
      data: financialSummary.daily_cost_trend.map(d => d.cost)
    }]
  } : null;

  const loginTrendChart = analytics ? {
    chart: {
      type: 'line',
      backgroundColor: 'transparent',
      height: 200
    },
    title: { text: '' },
    credits: { enabled: false },
    xAxis: {
      categories: analytics.login_activity.login_trend.slice(-14).map(d => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }),
      lineColor: '#e5e7eb',
      labels: { style: { fontSize: '9px' } }
    },
    yAxis: {
      title: { text: '' },
      gridLineColor: '#f3f4f6'
    },
    plotOptions: {
      line: {
        marker: { radius: 3 },
        color: '#8b5cf6'
      }
    },
    series: [{
      name: 'Logins',
      data: analytics.login_activity.login_trend.slice(-14).map(d => d.count)
    }]
  } : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <ModernLoadingSpinners variant="pulse-wave" size="lg" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Failed to load dashboard</h2>
          <button
            onClick={fetchDashboardData}
            className="mt-4 px-4 py-2 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <Shield className="w-6 h-6 text-[#243d8a]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-600">
                  Welcome back, {user?.full_name || 'Admin'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Period Selector */}
              <select
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#243d8a]/20"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <button
                onClick={fetchDashboardData}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="text-sm font-medium">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* System Health Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl p-4 border ${
            analytics.system_health.status === 'excellent' ? 'bg-green-50 border-green-200' :
            analytics.system_health.status === 'good' ? 'bg-blue-50 border-blue-200' :
            'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {analytics.system_health.status === 'excellent' ? (
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              ) : analytics.system_health.status === 'good' ? (
                <Activity className="w-6 h-6 text-blue-600" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              )}
              <div>
                <h3 className="font-semibold text-gray-900">
                  System Health: {analytics.system_health.score}%
                </h3>
                <p className="text-sm text-gray-600">
                  {analytics.system_health.status === 'excellent' ? 'All systems operating normally' :
                   analytics.system_health.status === 'good' ? 'Minor items need attention' :
                   'Some areas require immediate attention'}
                </p>
              </div>
            </div>
            {analytics.system_health.alerts.low_stock_materials > 0 && (
              <div className="flex items-center gap-4 text-sm">
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full">
                  {analytics.system_health.alerts.low_stock_materials} Low Stock Alerts
                </span>
                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
                  {analytics.system_health.alerts.pending_change_requests} Pending CRs
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* KPI Cards - Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Users */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Users className="w-5 h-5 text-[#243d8a]" />
              </div>
              {analytics.users.new_in_period > 0 && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />
                  {analytics.users.new_in_period}
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{analytics.users.total}</h3>
            <p className="text-xs text-gray-500 mt-1">Total Users</p>
            <p className="text-xs text-gray-400 mt-1">{analytics.users.active} active</p>
          </motion.div>

          {/* Projects */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Building2 className="w-5 h-5 text-emerald-600" />
              </div>
              {analytics.projects.new_in_period > 0 && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />
                  {analytics.projects.new_in_period}
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{analytics.projects.total}</h3>
            <p className="text-xs text-gray-500 mt-1">Total Projects</p>
            <p className="text-xs text-gray-400 mt-1">{analytics.projects.active} active</p>
          </motion.div>

          {/* BOQs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              {analytics.boqs.pending > 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {analytics.boqs.pending} pending
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{analytics.boqs.total}</h3>
            <p className="text-xs text-gray-500 mt-1">Total BOQs</p>
            <p className="text-xs text-gray-400 mt-1">{analytics.boqs.approved} approved</p>
          </motion.div>

          {/* Change Requests */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <ClipboardList className="w-5 h-5 text-amber-600" />
              </div>
              {analytics.change_requests.pending > 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {analytics.change_requests.pending} pending
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{analytics.change_requests.total}</h3>
            <p className="text-xs text-gray-500 mt-1">Change Requests</p>
            <p className="text-xs text-gray-400 mt-1">{analytics.change_requests.completed} completed</p>
          </motion.div>

          {/* Vendors */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-cyan-50 rounded-lg">
                <Store className="w-5 h-5 text-cyan-600" />
              </div>
              {analytics.vendors.new_in_period > 0 && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />
                  {analytics.vendors.new_in_period}
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{analytics.vendors.total}</h3>
            <p className="text-xs text-gray-500 mt-1">Vendors</p>
            <p className="text-xs text-gray-400 mt-1">{analytics.vendors.active} active</p>
          </motion.div>

          {/* Inventory */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Boxes className="w-5 h-5 text-indigo-600" />
              </div>
              {analytics.inventory.low_stock_alerts > 0 && (
                <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  {analytics.inventory.low_stock_alerts} low
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{analytics.inventory.total_materials}</h3>
            <p className="text-xs text-gray-500 mt-1">Materials</p>
            <p className="text-xs text-gray-400 mt-1">{formatCurrency(analytics.inventory.total_stock_value)}</p>
          </motion.div>
        </div>

        {/* Financial Overview Row */}
        {financialSummary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-white"
            >
              <div className="flex items-center justify-between mb-3">
                <DollarSign className="w-6 h-6 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  Last {periodDays} days
                </span>
              </div>
              <h3 className="text-2xl font-bold">{formatCurrency(financialSummary.change_requests.total_cost)}</h3>
              <p className="text-sm opacity-80 mt-1">Total CR Costs</p>
              <p className="text-xs opacity-60 mt-1">
                Avg: {formatCurrency(financialSummary.change_requests.average_cost)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-5 text-white"
            >
              <div className="flex items-center justify-between mb-3">
                <Package className="w-6 h-6 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  Current
                </span>
              </div>
              <h3 className="text-2xl font-bold">{formatCurrency(financialSummary.inventory.total_value)}</h3>
              <p className="text-sm opacity-80 mt-1">Inventory Value</p>
              <p className="text-xs opacity-60 mt-1">
                Backup: {formatCurrency(financialSummary.inventory.backup_value)}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 text-white"
            >
              <div className="flex items-center justify-between mb-3">
                <ShoppingCart className="w-6 h-6 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  Purchases
                </span>
              </div>
              <h3 className="text-2xl font-bold">
                {formatCurrency(financialSummary.transactions?.PURCHASE?.total || 0)}
              </h3>
              <p className="text-sm opacity-80 mt-1">Purchase Transactions</p>
              <p className="text-xs opacity-60 mt-1">
                {financialSummary.transactions?.PURCHASE?.count || 0} transactions
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl p-5 text-white"
            >
              <div className="flex items-center justify-between mb-3">
                <Truck className="w-6 h-6 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  Transport
                </span>
              </div>
              <h3 className="text-2xl font-bold">{formatCurrency(financialSummary.transport_costs)}</h3>
              <p className="text-sm opacity-80 mt-1">Transport Costs</p>
              <p className="text-xs opacity-60 mt-1">
                {financialSummary.transactions?.WITHDRAWAL?.count || 0} deliveries
              </p>
            </motion.div>
          </div>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Role Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">User Distribution</h2>
              <PieChart className="w-5 h-5 text-gray-400" />
            </div>
            {roleDistributionChart && (
              <HighchartsReact highcharts={Highcharts} options={roleDistributionChart} />
            )}
          </motion.div>

          {/* User Registration Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">User Registration Trend</h2>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            {userTrendChart && (
              <HighchartsReact highcharts={Highcharts} options={userTrendChart} />
            )}
          </motion.div>

          {/* Change Request Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Change Request Activity</h2>
              <BarChart3 className="w-5 h-5 text-gray-400" />
            </div>
            {crTrendChart && (
              <HighchartsReact highcharts={Highcharts} options={crTrendChart} />
            )}
          </motion.div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Financial Trend */}
          {financialTrendChart && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Daily Cost Trend</h2>
                <DollarSign className="w-5 h-5 text-gray-400" />
              </div>
              <HighchartsReact highcharts={Highcharts} options={financialTrendChart} />
            </motion.div>
          )}

          {/* Project Status + Delivery Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="grid grid-cols-2 gap-4">
              {/* Project Status */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Project Status</h3>
                {projectStatusChart && (
                  <HighchartsReact highcharts={Highcharts} options={projectStatusChart} />
                )}
              </div>
              {/* Delivery & Material Stats */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery Stats</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-emerald-600">{analytics.deliveries.delivered}</p>
                    <p className="text-xs text-gray-500">Delivered</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-blue-600">{analytics.deliveries.in_transit}</p>
                    <p className="text-xs text-gray-500">In Transit</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-amber-600">{analytics.deliveries.issued}</p>
                    <p className="text-xs text-gray-500">Issued</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-600">{analytics.deliveries.draft}</p>
                    <p className="text-xs text-gray-500">Draft</p>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mt-4 mb-2">Material Requests</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-emerald-600">{analytics.material_requests.fulfilled}</p>
                    <p className="text-xs text-gray-500">Fulfilled</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-amber-600">{analytics.material_requests.pending}</p>
                    <p className="text-xs text-gray-500">Pending</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Top Performers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Project Managers */}
          {topPerformers && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Project Managers</h2>
              <div className="space-y-3">
                {topPerformers.top_project_managers.length > 0 ? (
                  topPerformers.top_project_managers.map((pm, index) => (
                    <div key={pm.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                        index === 0 ? 'bg-amber-500' :
                        index === 1 ? 'bg-gray-400' :
                        index === 2 ? 'bg-amber-700' : 'bg-gray-300'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{pm.name}</p>
                        <p className="text-xs text-gray-500 truncate">{pm.email}</p>
                      </div>
                      <span className="text-sm font-semibold text-[#243d8a]">
                        {pm.project_count} projects
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No project managers found</p>
                )}
              </div>
            </motion.div>
          )}

          {/* Top Site Engineers */}
          {topPerformers && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Site Engineers</h2>
              <div className="space-y-3">
                {topPerformers.top_site_engineers.length > 0 ? (
                  topPerformers.top_site_engineers.map((se, index) => (
                    <div key={se.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                        index === 0 ? 'bg-emerald-500' :
                        index === 1 ? 'bg-gray-400' :
                        index === 2 ? 'bg-emerald-700' : 'bg-gray-300'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{se.name}</p>
                        <p className="text-xs text-gray-500 truncate">{se.email}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-600">
                        {se.project_count} projects
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No site engineers found</p>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Login Activity Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Login Activity</h2>
              <p className="text-sm text-gray-500">
                {analytics.login_activity.total_logins_in_period} total logins in last {periodDays} days
              </p>
            </div>
            <div className="flex items-center gap-4">
              {analytics.login_activity.login_methods.map((method) => (
                <span key={method.method} className="text-xs bg-gray-100 px-3 py-1 rounded-full">
                  {method.method === 'email_otp' ? 'Email OTP' : method.method === 'sms_otp' ? 'SMS OTP' : method.method}: {method.count}
                </span>
              ))}
            </div>
          </div>
          {loginTrendChart && (
            <HighchartsReact highcharts={Highcharts} options={loginTrendChart} />
          )}
        </motion.div>

        {/* Pending Approvals Summary */}
        {analytics.change_requests.pending_approvals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending CR Approvals</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {analytics.change_requests.pending_approvals.map((approval) => (
                <div
                  key={approval.stage}
                  className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center"
                >
                  <p className="text-2xl font-bold text-amber-700">{approval.count}</p>
                  <p className="text-xs text-amber-600 mt-1 capitalize">
                    {approval.stage.replace(/_/g, ' ')}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
