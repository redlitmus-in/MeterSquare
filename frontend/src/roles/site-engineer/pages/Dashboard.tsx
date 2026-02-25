import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  BuildingOfficeIcon,
  CubeIcon,
  DocumentTextIcon,
  TruckIcon,
  BoltIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  ClockIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { siteEngineerService, SEDashboardAnalytics } from '../services/siteEngineerService';

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<SEDashboardAnalytics | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchAnalytics = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await siteEngineerService.getDashboardAnalytics(selectedPeriod);
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPeriod]);

  const getEfficiencyColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getEfficiencyBg = (score: number) => {
    if (score >= 80) return 'from-emerald-500 to-emerald-600';
    if (score >= 60) return 'from-amber-500 to-amber-600';
    return 'from-red-500 to-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  // ========== CHART 1: Work Overview (Projects, Items, CRs) ==========
  const workOverviewChart: Highcharts.Options = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: 'Work Overview',
      align: 'left',
      style: { fontSize: '15px', fontWeight: '600', color: '#111827' }
    },
    xAxis: {
      categories: ['Projects', 'Material Receipts', 'Change Requests'],
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    yAxis: {
      title: { text: '' },
      labels: { style: { fontSize: '11px', color: '#9ca3af' } },
      gridLineColor: '#f3f4f6'
    },
    legend: {
      align: 'right',
      verticalAlign: 'top',
      layout: 'horizontal',
      itemStyle: { fontSize: '10px', fontWeight: '500', color: '#6b7280' }
    },
    plotOptions: {
      column: {
        borderRadius: 4,
        groupPadding: 0.15,
        dataLabels: {
          enabled: true,
          style: { fontSize: '10px', fontWeight: '600', textOutline: 'none' }
        }
      }
    },
    series: [
      {
        type: 'column',
        name: 'Pending',
        color: '#f59e0b',
        data: [
          (analytics?.projects.active || 0) + (analytics?.projects.in_progress || 0),
          analytics?.deliveries?.pending_receipt || 0,
          (analytics?.change_requests.pending_pm_approval || 0) + (analytics?.change_requests.pending_td_approval || 0)
        ]
      },
      {
        type: 'column',
        name: 'Approved/Completed',
        color: '#10b981',
        data: [
          analytics?.projects.completed || 0,
          analytics?.deliveries?.delivered || 0,
          analytics?.change_requests.purchase_completed || 0
        ]
      }
    ],
    credits: { enabled: false },
    tooltip: {
      headerFormat: '<b>{point.x}</b><br/>',
      pointFormat: '{series.name}: <b>{point.y}</b>'
    }
  };

  // ========== CHART 2: Labour & Workers ==========
  const labourChartData = [
    { name: 'Pending', y: analytics?.labour?.pending || 0, color: '#f59e0b' },
    { name: 'Approved', y: analytics?.labour?.approved || 0, color: '#10b981' },
    { name: 'Assigned', y: analytics?.labour?.assigned || 0, color: '#3b82f6' },
    { name: 'Rejected', y: analytics?.labour?.rejected || 0, color: '#ef4444' }
  ].filter(d => d.y > 0);

  const labourChart: Highcharts.Options = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 280,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: 'Labour Requisitions',
      align: 'left',
      style: { fontSize: '15px', fontWeight: '600', color: '#111827' }
    },
    plotOptions: {
      pie: {
        innerSize: '55%',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.y}',
          style: { fontSize: '11px', fontWeight: '500', textOutline: 'none' }
        }
      }
    },
    series: [{
      type: 'pie',
      name: 'Requisitions',
      data: labourChartData.length > 0 ? labourChartData : [{ name: 'No Data', y: 1, color: '#e5e7eb' }]
    }],
    credits: { enabled: false },
    legend: { enabled: false }
  };

  // ========== CHART 3: Asset Flow (Dispatched vs Returned) ==========
  const assetFlowChart: Highcharts.Options = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 280,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: 'Asset Flow',
      align: 'left',
      style: { fontSize: '15px', fontWeight: '600', color: '#111827' }
    },
    xAxis: {
      categories: ['Dispatched to Site', 'At Site', 'Returned'],
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    yAxis: {
      title: { text: '' },
      labels: { style: { fontSize: '11px', color: '#9ca3af' } },
      gridLineColor: '#f3f4f6'
    },
    legend: { enabled: false },
    plotOptions: {
      bar: {
        borderRadius: 4,
        dataLabels: {
          enabled: true,
          style: { fontSize: '11px', fontWeight: '600', textOutline: 'none', color: '#374151' }
        },
        colorByPoint: true
      }
    },
    series: [{
      type: 'bar',
      name: 'Assets',
      data: [
        { y: analytics?.assets?.total_dispatched || 0, color: '#6366f1' },
        { y: analytics?.assets?.at_site || 0, color: '#f59e0b' },
        { y: analytics?.assets?.total_returned || 0, color: '#10b981' }
      ]
    }],
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y}</b> items' }
  };

  // ========== CHART 4: CR Trend ==========
  const trendData = analytics?.trends.cr_creation || [];
  const hasValidTrendData = trendData.length > 0 && trendData.some(t => t.count > 0);
  const totalCRs = analytics?.change_requests.total || 0;

  const crTrendChart: Highcharts.Options = {
    chart: {
      type: 'areaspline',
      backgroundColor: 'transparent',
      height: 260,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: `Change Request Activity`,
      align: 'left',
      style: { fontSize: '15px', fontWeight: '600', color: '#111827' }
    },
    subtitle: {
      text: `Last ${Math.min(selectedPeriod, 30)} days`,
      align: 'left',
      style: { fontSize: '11px', color: '#9ca3af' }
    },
    xAxis: {
      categories: trendData.map(t => {
        const date = new Date(t.date);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      }),
      labels: {
        style: { fontSize: '10px', color: '#9ca3af' },
        step: Math.ceil(trendData.length / 8)
      },
      tickLength: 0
    },
    yAxis: {
      title: { text: '' },
      labels: { style: { fontSize: '11px', color: '#9ca3af' } },
      gridLineColor: '#f3f4f6',
      min: 0,
      allowDecimals: false
    },
    legend: { enabled: false },
    plotOptions: {
      areaspline: {
        marker: { enabled: false },
        lineWidth: 2,
        fillOpacity: 0.15
      }
    },
    series: [{
      type: 'areaspline',
      name: 'CRs Created',
      data: trendData.map(t => t.count),
      color: '#ef4444',
      fillColor: {
        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
        stops: [
          [0, 'rgba(239, 68, 68, 0.25)'],
          [1, 'rgba(239, 68, 68, 0.02)']
        ]
      }
    }],
    credits: { enabled: false }
  };

  // Calculate alerts
  const hasAlerts = (analytics?.workload.overdue_projects || 0) > 0 ||
    (analytics?.workload.pending_items || 0) > 5 ||
    (analytics?.workload.pending_labour || 0) > 0 ||
    (analytics?.workload.pending_asset_returns || 0) > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl bg-gradient-to-br ${getEfficiencyBg(analytics?.performance.efficiency_score || 0)}`}>
                <BoltIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Site Engineer Dashboard</h1>
                <p className="text-sm text-gray-500">
                  Efficiency: <span className={`font-semibold ${getEfficiencyColor(analytics?.performance.efficiency_score || 0)}`}>
                    {analytics?.performance.efficiency_score || 0}%
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
                <ClockIcon className="w-4 h-4" />
                <span>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-gray-300">|</span>
                <span>{currentTime.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>

              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(Number(e.target.value))}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-red-500"
              >
                <option value={7}>7 Days</option>
                <option value={30}>30 Days</option>
                <option value={90}>90 Days</option>
              </select>

              <button
                onClick={() => fetchAnalytics(true)}
                disabled={refreshing}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <ArrowPathIcon className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Performance Row */}
        <div className="grid grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase">Project Completion</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{analytics?.performance.project_completion_rate || 0}%</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase">Item Completion</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{analytics?.performance.item_completion_rate || 0}%</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase">CR Approval Rate</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{analytics?.performance.cr_approval_rate || 0}%</p>
          </motion.div>
        </div>

        {/* KPI Cards - 6 cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Projects */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <BuildingOfficeIcon className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.projects.total || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Projects</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Active</span>
                <span className="font-medium text-amber-600">{analytics?.projects.active || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Completed</span>
                <span className="font-medium text-emerald-600">{analytics?.projects.completed || 0}</span>
              </div>
            </div>
          </motion.div>

          {/* BOQ Items */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <CubeIcon className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.boq_items.total_assigned || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">BOQ Items</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Pending</span>
                <span className="font-medium text-amber-600">{analytics?.boq_items.pending || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Completed</span>
                <span className="font-medium text-emerald-600">{analytics?.boq_items.completed || 0}</span>
              </div>
            </div>
          </motion.div>

          {/* Change Requests */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <DocumentTextIcon className="w-5 h-5 text-red-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.change_requests.total || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Change Requests</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Pending</span>
                <span className="font-medium text-amber-600">
                  {(analytics?.change_requests.pending_pm_approval || 0) + (analytics?.change_requests.pending_td_approval || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cost</span>
                <span className="font-medium text-gray-700">{formatCurrency(analytics?.change_requests.total_cost || 0)}</span>
              </div>
            </div>
          </motion.div>

          {/* Labour */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-orange-50 rounded-lg">
                <UserGroupIcon className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.labour?.total || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Labour Reqs</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Pending</span>
                <span className="font-medium text-amber-600">{analytics?.labour?.pending || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Workers</span>
                <span className="font-medium text-blue-600">{analytics?.labour?.total_workers_requested || 0}</span>
              </div>
            </div>
          </motion.div>

          {/* Assets */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <WrenchScrewdriverIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.assets?.at_site || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Assets at Site</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Dispatched</span>
                <span className="font-medium text-blue-600">{analytics?.assets?.total_dispatched || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Returned</span>
                <span className="font-medium text-emerald-600">{analytics?.assets?.total_returned || 0}</span>
              </div>
            </div>
          </motion.div>

          {/* Deliveries */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-cyan-50 rounded-lg">
                <TruckIcon className="w-5 h-5 text-cyan-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.deliveries.total || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Deliveries</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">In Transit</span>
                <span className="font-medium text-indigo-600">{analytics?.deliveries.in_transit || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Delivered</span>
                <span className="font-medium text-emerald-600">{analytics?.deliveries.delivered || 0}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Alert Banner */}
        {hasAlerts && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <ExclamationCircleIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-red-800">Attention Required</h4>
                <p className="text-sm text-red-700">
                  {analytics?.workload.overdue_projects || 0} overdue projects • {analytics?.workload.pending_items || 0} pending items • {analytics?.workload.pending_labour || 0} pending labour • {analytics?.workload.pending_asset_returns || 0} pending asset returns
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-xl border border-gray-200 p-5">
            <HighchartsReact highcharts={Highcharts} options={workOverviewChart} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="bg-white rounded-xl border border-gray-200 p-5">
            {(analytics?.labour?.total || 0) > 0 ? (
              <HighchartsReact highcharts={Highcharts} options={labourChart} />
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-gray-400">
                <UserGroupIcon className="w-12 h-12 mb-2" />
                <p className="text-lg font-medium text-gray-500">Labour Requisitions</p>
                <p className="text-sm">No labour requisitions yet</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white rounded-xl border border-gray-200 p-5">
            {(analytics?.assets?.total_dispatched || 0) > 0 || (analytics?.assets?.total_returned || 0) > 0 ? (
              <HighchartsReact highcharts={Highcharts} options={assetFlowChart} />
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-gray-400">
                <WrenchScrewdriverIcon className="w-12 h-12 mb-2" />
                <p className="text-lg font-medium text-gray-500">Asset Flow</p>
                <p className="text-sm">No asset movements yet</p>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="bg-white rounded-xl border border-gray-200 p-5">
            {hasValidTrendData ? (
              <HighchartsReact highcharts={Highcharts} options={crTrendChart} />
            ) : (
              <div className="h-[260px] flex flex-col items-center justify-center text-gray-400">
                <DocumentTextIcon className="w-12 h-12 mb-2" />
                <p className="text-lg font-medium text-gray-500">CR Activity Trend</p>
                <p className="text-sm">
                  {totalCRs > 0
                    ? `${totalCRs} CRs exist, but none created in last ${Math.min(selectedPeriod, 30)} days`
                    : 'No change requests yet'}
                </p>
              </div>
            )}
          </motion.div>
        </div>

      </div>
    </div>
  );
};

export default React.memo(Dashboard);
