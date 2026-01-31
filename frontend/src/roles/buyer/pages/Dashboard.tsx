import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  ShoppingCartIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  UserGroupIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { getBuyerDashboardAnalytics, BuyerDashboardAnalytics, buyerService, Purchase, POChild, TDRejectedPOChild, PurchaseListResponse } from '../services/buyerService';
import { useAutoSync } from '@/hooks/useAutoSync';
import { STALE_TIMES, REALTIME_TABLES } from '@/lib/constants';

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

// Format compact currency
const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) {
    return `AED ${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `AED ${(value / 1000).toFixed(1)}K`;
  }
  return formatCurrency(value);
};

const BuyerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [analytics, setAnalytics] = useState<BuyerDashboardAnalytics | null>(null);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ========== FETCH SAME DATA AS PURCHASE ORDERS PAGE ==========
  // This ensures counts ALWAYS match between Dashboard and Purchase Orders

  // Fetch pending purchases (same API as PurchaseOrders)
  const { data: pendingData, isLoading: isPendingLoading, refetch: refetchPending } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-pending-purchases-dashboard'],
    fetchFn: () => buyerService.getPendingPurchases(1, 1000), // Get all for counting
    realtimeTables: [...REALTIME_TABLES.PURCHASES_FULL],
    staleTime: STALE_TIMES.STANDARD,
  });

  // Fetch completed purchases
  const { data: completedData, isLoading: isCompletedLoading, refetch: refetchCompleted } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-completed-purchases-dashboard'],
    fetchFn: () => buyerService.getCompletedPurchases(1, 1000),
    realtimeTables: [...REALTIME_TABLES.PURCHASES],
    staleTime: STALE_TIMES.DASHBOARD,
  });

  // Fetch rejected purchases
  const { data: rejectedData, isLoading: isRejectedLoading, refetch: refetchRejected } = useAutoSync<PurchaseListResponse>({
    queryKey: ['buyer-rejected-purchases-dashboard'],
    fetchFn: () => buyerService.getRejectedPurchases(1, 1000),
    realtimeTables: [...REALTIME_TABLES.PURCHASES_FULL],
    staleTime: STALE_TIMES.DASHBOARD,
  });

  // Fetch approved PO children
  const { data: approvedPOChildrenData, isLoading: isApprovedPOChildrenLoading, refetch: refetchApprovedPOChildren } = useAutoSync<{
    success: boolean;
    approved_count: number;
    po_children: POChild[];
  }>({
    queryKey: ['buyer-approved-po-children-dashboard'],
    fetchFn: () => buyerService.getApprovedPOChildren(),
    realtimeTables: ['po_child', ...REALTIME_TABLES.CHANGE_REQUESTS],
    staleTime: STALE_TIMES.STANDARD,
  });

  // Fetch pending PO children
  const { data: pendingPOChildrenData, isLoading: isPendingPOChildrenLoading, refetch: refetchPendingPOChildren } = useAutoSync<{
    success: boolean;
    pending_count: number;
    po_children: POChild[];
  }>({
    queryKey: ['buyer-pending-po-children-dashboard'],
    fetchFn: () => buyerService.getBuyerPendingPOChildren(),
    realtimeTables: ['po_child', ...REALTIME_TABLES.CHANGE_REQUESTS],
    staleTime: STALE_TIMES.STANDARD,
  });

  // Fetch analytics for other data (trends, store requests, deliveries, etc.)
  useEffect(() => {
    const fetchOtherAnalytics = async () => {
      try {
        const data = await getBuyerDashboardAnalytics(30);
        setAnalytics(data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      }
    };
    fetchOtherAnalytics();
  }, []);

  // ========== CLIENT-SIDE FILTERING (EXACT SAME AS PurchaseOrders.tsx) ==========
  // Using 'any' to avoid type conflicts - the data structure is the same
  const rawPendingPurchases = useMemo(() => {
    return (pendingData?.pending_purchases || []) as any[];
  }, [pendingData]);

  const completedPurchases = useMemo(() => {
    return (completedData?.completed_purchases || []) as any[];
  }, [completedData]);

  const completedPOChildren = useMemo(() => {
    return ((completedData as any)?.completed_po_children || []) as any[];
  }, [completedData]);

  const rejectedPurchases = useMemo(() => {
    return (rejectedData?.rejected_purchases || []) as any[];
  }, [rejectedData]);

  const tdRejectedPOChildren = useMemo(() => {
    return ((rejectedData as any)?.td_rejected_po_children || []) as any[];
  }, [rejectedData]);

  const approvedPOChildren = useMemo(() => {
    return (approvedPOChildrenData?.po_children || []) as any[];
  }, [approvedPOChildrenData]);

  const pendingPOChildren = useMemo(() => {
    return (pendingPOChildrenData?.po_children || []) as any[];
  }, [pendingPOChildrenData]);

  // ========== FILTERING LOGIC (EXACT COPY FROM PurchaseOrders.tsx) ==========
  // Pending Purchase: No vendor, not pending TD, not rejected, not sent to store
  const pendingPurchaseItems = useMemo(() => {
    return rawPendingPurchases.filter((p: any) =>
      !p.vendor_id &&
      !p.vendor_selection_pending_td_approval &&
      !p.rejection_type &&
      !p.store_requests_pending &&
      !p.all_store_requests_approved
    );
  }, [rawPendingPurchases]);

  // Store Approved: All store requests approved, no vendor
  const storeApprovedItems = useMemo(() => {
    return rawPendingPurchases.filter((p: any) =>
      p.all_store_requests_approved &&
      !p.vendor_id &&
      !p.rejection_type
    );
  }, [rawPendingPurchases]);

  // Vendor Approved: Has vendor, not pending TD approval
  const vendorApprovedItems = useMemo(() => {
    return rawPendingPurchases.filter((p: any) => p.vendor_id && !p.vendor_selection_pending_td_approval && !p.rejection_type);
  }, [rawPendingPurchases]);

  // Store Requests Pending
  const storeRequestsPending = useMemo(() => {
    return rawPendingPurchases.filter((p: any) => p.store_requests_pending && !p.rejection_type);
  }, [rawPendingPurchases]);

  // Vendor Pending TD Approval
  const vendorPendingApproval = useMemo(() => {
    return rawPendingPurchases.filter((p: any) => p.vendor_selection_pending_td_approval && !p.rejection_type);
  }, [rawPendingPurchases]);

  // Calculate vendor pending actual count (same as PurchaseOrders.tsx)
  const vendorPendingActualCount = useMemo(() => {
    const parentIdsWithPOChildren = new Set(
      pendingPOChildren.map((child: any) => child.parent_cr_id).filter(Boolean)
    );
    const parentsWithoutChildren = vendorPendingApproval.filter(
      (p: any) => !parentIdsWithPOChildren.has(p.cr_id)
    );
    const items = [...parentsWithoutChildren, ...pendingPOChildren];
    const seen = new Set<string>();
    return items.filter((item: any) => {
      const key = 'parent_cr_id' in item
        ? `poChild-${item.id}`
        : `purchase-${item.cr_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }, [vendorPendingApproval, pendingPOChildren]);

  // ========== STATS (EXACT SAME CALCULATION AS PurchaseOrders.tsx line 475-487) ==========
  const stats = useMemo(() => {
    return {
      ongoing: pendingPurchaseItems.length + storeApprovedItems.length + vendorApprovedItems.length + approvedPOChildren.length,
      pendingPurchase: pendingPurchaseItems.length,
      storeApproved: storeApprovedItems.length,
      vendorApproved: vendorApprovedItems.length + approvedPOChildren.length,
      pendingApproval: storeRequestsPending.length + vendorPendingActualCount,
      storeRequestsPending: storeRequestsPending.length,
      vendorPendingApproval: vendorPendingActualCount,
      completed: completedPurchases.length + completedPOChildren.length,
      rejected: rejectedPurchases.length + tdRejectedPOChildren.length
    };
  }, [pendingPurchaseItems, storeApprovedItems, vendorApprovedItems, approvedPOChildren, vendorPendingActualCount, completedPurchases, completedPOChildren, rejectedPurchases, tdRejectedPOChildren, storeRequestsPending]);

  // Combined loading state
  const loading = isPendingLoading || isCompletedLoading || isRejectedLoading || isApprovedPOChildrenLoading || isPendingPOChildrenLoading;
  const error = null; // Errors are handled by individual queries

  // Refresh all data
  const fetchAnalytics = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      await Promise.all([
        refetchPending(),
        refetchCompleted(),
        refetchRejected(),
        refetchApprovedPOChildren(),
        refetchPendingPOChildren(),
        getBuyerDashboardAnalytics(30).then(setAnalytics)
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const getWorkloadColor = (status: string) => {
    if (status === 'high') return 'text-red-600';
    if (status === 'moderate') return 'text-amber-600';
    return 'text-emerald-600';
  };

  const getWorkloadBg = (status: string) => {
    if (status === 'high') return 'from-red-500 to-red-600';
    if (status === 'moderate') return 'from-amber-500 to-amber-600';
    return 'from-emerald-500 to-emerald-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ModernLoadingSpinners size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-xl border border-red-200 shadow-sm max-w-md">
          <ExclamationCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Dashboard</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchAnalytics()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ========== CHART 1: Purchase Order Pipeline ==========
  // Chart uses client-side stats - GUARANTEED to match KPI cards
  const poPipelineChart: Highcharts.Options = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: 'Purchase Order Pipeline',
      align: 'left',
      style: { fontSize: '15px', fontWeight: '600', color: '#111827' }
    },
    xAxis: {
      categories: ['Select Vendor', 'Pending Approval', 'Ready to Complete', 'Completed'],
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    yAxis: {
      title: { text: '' },
      labels: { style: { fontSize: '11px', color: '#9ca3af' } },
      gridLineColor: '#f3f4f6'
    },
    legend: { enabled: false },
    plotOptions: {
      column: {
        borderRadius: 6,
        dataLabels: {
          enabled: true,
          style: { fontSize: '12px', fontWeight: '600', textOutline: 'none' }
        },
        colorByPoint: true
      }
    },
    series: [{
      type: 'column',
      name: 'Orders',
      data: [
        // Select Vendor: Pending Purchase + Store Approved (from client-side stats)
        { y: stats.pendingPurchase + stats.storeApproved, color: '#f59e0b' },
        // Pending Approval: From client-side stats (matches KPI card exactly)
        { y: stats.pendingApproval, color: '#8b5cf6' },
        // Ready to Complete: Vendor Approved (from client-side stats)
        { y: stats.vendorApproved, color: '#3b82f6' },
        // Completed: From client-side stats (matches KPI card exactly)
        { y: stats.completed, color: '#10b981' }
      ]
    }],
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y}</b> orders' }
  };

  // ========== CHART 2: Store Request Flow ==========
  const storeFlowData = [
    { name: 'Pending Vendor', y: analytics?.store_requests.pending_vendor_delivery || 0, color: '#f59e0b' },
    { name: 'At Store', y: analytics?.store_requests.delivered_to_store || 0, color: '#3b82f6' },
    { name: 'Dispatched', y: analytics?.store_requests.dispatched_to_site || 0, color: '#8b5cf6' },
    { name: 'Delivered', y: analytics?.store_requests.delivered_to_site || 0, color: '#10b981' }
  ].filter(d => d.y > 0);

  const storeFlowChart: Highcharts.Options = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 280,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: 'M2 Store Pipeline',
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
      name: 'Requests',
      data: storeFlowData.length > 0 ? storeFlowData : [{ name: 'No Data', y: 1, color: '#e5e7eb' }]
    }],
    credits: { enabled: false },
    legend: { enabled: false }
  };

  // ========== CHART 3: Delivery Status ==========
  const deliveryChart: Highcharts.Options = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 280,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: 'Delivery Status',
      align: 'left',
      style: { fontSize: '15px', fontWeight: '600', color: '#111827' }
    },
    xAxis: {
      categories: ['Draft', 'Issued', 'In Transit', 'Delivered'],
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
      name: 'Deliveries',
      data: [
        { y: analytics?.deliveries.draft || 0, color: '#9ca3af' },
        { y: analytics?.deliveries.issued || 0, color: '#f59e0b' },
        { y: analytics?.deliveries.in_transit || 0, color: '#3b82f6' },
        { y: analytics?.deliveries.delivered || 0, color: '#10b981' }
      ]
    }],
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y}</b> deliveries' }
  };

  // ========== CHART 4: Purchase Trend ==========
  const trendData = analytics?.trends?.daily || [];
  const hasValidTrendData = trendData.length > 0 && trendData.some(t => t.count > 0);

  const purchaseTrendChart: Highcharts.Options = {
    chart: {
      type: 'areaspline',
      backgroundColor: 'transparent',
      height: 280,
      style: { fontFamily: 'inherit' }
    },
    title: {
      text: 'Purchase Activity',
      align: 'left',
      style: { fontSize: '15px', fontWeight: '600', color: '#111827' }
    },
    subtitle: {
      text: 'Last 30 days',
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
      name: 'Purchases Completed',
      data: trendData.map(t => t.count),
      color: '#3b82f6',
      fillColor: {
        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
        stops: [
          [0, 'rgba(59, 130, 246, 0.25)'],
          [1, 'rgba(59, 130, 246, 0.02)']
        ]
      }
    }],
    credits: { enabled: false }
  };

  // Calculate if there are alerts
  const hasAlerts = (analytics?.workload.pending_actions || 0) > 5 ||
    (analytics?.po_children.rejected || 0) > 0 ||
    (analytics?.workload.pending_deliveries || 0) > 3;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl bg-gradient-to-br ${getWorkloadBg(analytics?.workload.status || 'normal')}`}>
                <ShoppingCartIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Buyer Dashboard</h1>
                <p className="text-sm text-gray-500">
                  Workload: <span className={`font-semibold ${getWorkloadColor(analytics?.workload.status || 'normal')}`}>
                    {analytics?.workload.status === 'high' ? 'High' : analytics?.workload.status === 'moderate' ? 'Moderate' : 'Normal'}
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

              <button
                onClick={() => fetchAnalytics(true)}
                disabled={refreshing}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <ArrowPathIcon className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Performance Row - 3 metrics */}
        <div className="grid grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase">Completion Rate</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{analytics?.performance.completion_rate || 0}%</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase">Avg Processing</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{analytics?.performance.avg_processing_days || 0} <span className="text-sm font-normal text-gray-500">days</span></p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase">Total Completed Value</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCompactCurrency(analytics?.purchase_orders.total_completed_cost || 0)}</p>
          </motion.div>
        </div>

        {/* KPI Cards - 6 cards (NO CLICK/REDIRECT) */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Ongoing - Buyer-actionable items (matches Purchase Orders > Ongoing tab EXACTLY) */}
          {/* Uses client-side filtering - GUARANTEED to match PurchaseOrders.tsx */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <ClockIcon className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{stats.ongoing}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Ongoing</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Pending Purchase</span>
                <span className="font-medium text-amber-600">{stats.pendingPurchase}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Store Approved</span>
                <span className="font-medium text-blue-600">{stats.storeApproved}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vendor Approved</span>
                <span className="font-medium text-emerald-600">{stats.vendorApproved}</span>
              </div>
            </div>
          </motion.div>

          {/* Pending Approval - Waiting for TD/PM approval (matches Purchase Orders > Pending Approval tab EXACTLY) */}
          {/* Uses client-side filtering - GUARANTEED to match PurchaseOrders.tsx */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <DocumentTextIcon className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{stats.pendingApproval}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Pending Approval</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Store Pending</span>
                <span className="font-medium text-blue-600">{stats.storeRequestsPending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vendor Pending TD</span>
                <span className="font-medium text-purple-600">{stats.vendorPendingApproval}</span>
              </div>
            </div>
          </motion.div>

          {/* Completed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{stats.completed}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Completed</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Purchase Orders</span>
                <span className="font-medium text-emerald-600">{completedPurchases.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Split POs</span>
                <span className="font-medium text-emerald-600">{completedPOChildren.length}</span>
              </div>
            </div>
          </motion.div>

          {/* Store Pipeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <BuildingStorefrontIcon className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.store_requests.total_in_pipeline || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Store Pipeline</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Pending Vendor</span>
                <span className="font-medium text-amber-600">{analytics?.store_requests.pending_vendor_delivery || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">At Store</span>
                <span className="font-medium text-blue-600">{analytics?.store_requests.delivered_to_store || 0}</span>
              </div>
            </div>
          </motion.div>

          {/* Deliveries */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <TruckIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.deliveries.total || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Deliveries</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">In Transit</span>
                <span className="font-medium text-blue-600">{analytics?.deliveries.in_transit || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Delivered</span>
                <span className="font-medium text-emerald-600">{analytics?.deliveries.delivered || 0}</span>
              </div>
            </div>
          </motion.div>

          {/* Vendors */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <UserGroupIcon className="w-5 h-5 text-gray-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{analytics?.vendors.total_approved || 0}</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Vendors</h3>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Approved</span>
                <span className="font-medium text-emerald-600">{analytics?.vendors.total_approved || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pending</span>
                <span className="font-medium text-amber-600">{analytics?.vendors.pending_approval || 0}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Alert Banner */}
        {hasAlerts && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <ExclamationCircleIcon className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800">Attention Required</h4>
                <p className="text-sm text-amber-700">
                  {(analytics?.workload.pending_actions || 0) > 5 && `${analytics?.workload.pending_actions} orders need action`}
                  {(analytics?.workload.pending_actions || 0) > 5 && (analytics?.po_children.rejected || 0) > 0 && ' • '}
                  {(analytics?.po_children.rejected || 0) > 0 && `${analytics?.po_children.rejected} rejected POs`}
                  {((analytics?.workload.pending_actions || 0) > 5 || (analytics?.po_children.rejected || 0) > 0) && (analytics?.workload.pending_deliveries || 0) > 3 && ' • '}
                  {(analytics?.workload.pending_deliveries || 0) > 3 && `${analytics?.workload.pending_deliveries} pending deliveries`}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Charts Row 1 - 2x2 Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-xl border border-gray-200 p-5">
            <HighchartsReact highcharts={Highcharts} options={poPipelineChart} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="bg-white rounded-xl border border-gray-200 p-5">
            {(analytics?.store_requests.total_in_pipeline || 0) > 0 ? (
              <HighchartsReact highcharts={Highcharts} options={storeFlowChart} />
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-gray-400">
                <BuildingStorefrontIcon className="w-12 h-12 mb-2" />
                <p className="text-lg font-medium text-gray-500">M2 Store Pipeline</p>
                <p className="text-sm">No store requests yet</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white rounded-xl border border-gray-200 p-5">
            {(analytics?.deliveries.total || 0) > 0 ? (
              <HighchartsReact highcharts={Highcharts} options={deliveryChart} />
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-gray-400">
                <TruckIcon className="w-12 h-12 mb-2" />
                <p className="text-lg font-medium text-gray-500">Delivery Status</p>
                <p className="text-sm">No deliveries yet</p>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="bg-white rounded-xl border border-gray-200 p-5">
            {hasValidTrendData ? (
              <HighchartsReact highcharts={Highcharts} options={purchaseTrendChart} />
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-gray-400">
                <CubeIcon className="w-12 h-12 mb-2" />
                <p className="text-lg font-medium text-gray-500">Purchase Activity</p>
                <p className="text-sm">No purchase activity in last 30 days</p>
              </div>
            )}
          </motion.div>
        </div>

      </div>
    </div>
  );
};

export default BuyerDashboard;
