import React, { useEffect } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { motion } from 'framer-motion';
import { projectManagerService } from '../services/projectManagerService';
import { mepService } from '../services/mepService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';
import { useDashboardMetricsAutoSync } from '@/hooks/useAutoSync';
import {
  CheckCircleIcon,
  ClockIcon,
  CubeIcon,
  UserGroupIcon,
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';

const ProjectManagerHub: React.FC = () => {
  const { user } = useAuthStore();

  // ROLE-AWARE: Determine dashboard type based on URL path or user role
  const currentPath = window.location.pathname;
  const isMEPRoute = currentPath.includes('/mep/');
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const isUserMEP = userRoleLower === 'mep' || userRoleLower === 'mep supervisor' || userRoleLower === 'mep_supervisor';
  const isMEP = isMEPRoute || isUserMEP;
  const dashboardTitle = isMEP ? 'MEP Supervisor Dashboard' : 'Project Manager Dashboard';

  // Real-time auto-sync for dashboard data
  const { data: dashboardData, isLoading: loading, refetch } = useDashboardMetricsAutoSync(
    'project_manager',
    async () => {
      if (!user?.user_id) {
        throw new Error('User not authenticated');
      }
      const stats = isMEP
        ? await mepService.getDashboardStats()
        : await projectManagerService.getDashboardStats();

      return {
        stats: stats.stats,
        boq_status: stats.boq_status,
        items_breakdown: stats.items_breakdown,
        purchase_order_status: stats.purchase_order_status || {},
        labour_data: stats.labour_data || [],
        projects: stats.projects || [],
        asset_details: stats.asset_details || { total: 0, pending_pm: 0, pm_approved: 0, pm_rejected: 0, dispatched: 0, completed: 0, total_approved: 0 },
        recent_se_requests: stats.recent_se_requests || [],
      };
    }
  );

  const stats = dashboardData?.stats || { total_boq_items: 0, items_assigned: 0, pending_assignment: 0 };
  const boqStatus = dashboardData?.boq_status || { assigned: 0, pending: 0, rejected: 0, completed: 0 };
  const purchaseOrderStatus = dashboardData?.purchase_order_status || { sent_to_buyer: 0, se_requested: 0, completed: 0, rejected: 0 };
  const labourData = dashboardData?.labour_data || [];
  const assetDetails = dashboardData?.asset_details || { total: 0, pending_pm: 0, pm_approved: 0, pm_rejected: 0, dispatched: 0, completed: 0, total_approved: 0 };
  const recentSERequests = dashboardData?.recent_se_requests || [];

  // Helper functions for Recent SE Requests display
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatStatus = (status: string): string => {
    if (!status) return '';
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'cr': return 'Change Request';
      case 'labour': return 'Labour Req';
      case 'asset': return 'Asset Req';
      default: return 'Request';
    }
  };

  useEffect(() => {
    Highcharts.setOptions({
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
      chart: { style: { fontFamily: 'Inter, system-ui, sans-serif' } }
    });
  }, []);

  // ========== CHART 1: BOQ Status Overview (Donut Chart) ==========
  const totalBOQs = (boqStatus.assigned || 0) + (boqStatus.pending || 0) + (boqStatus.rejected || 0) + (boqStatus.completed || 0);
  const boqStatusChart: Highcharts.Options = {
    chart: { type: 'pie', backgroundColor: 'transparent', height: 280, style: { fontFamily: 'inherit' } },
    title: { text: 'BOQ Status', align: 'left', style: { fontSize: '15px', fontWeight: '600', color: '#111827' } },
    subtitle: { text: `Total: ${totalBOQs}`, align: 'left', style: { fontSize: '12px', color: '#6b7280' } },
    legend: { enabled: true, align: 'right', verticalAlign: 'middle', layout: 'vertical', itemStyle: { fontSize: '11px', color: '#6b7280' } },
    plotOptions: {
      pie: {
        innerSize: '60%',
        dataLabels: { enabled: false },
        showInLegend: true
      }
    },
    series: [{
      type: 'pie',
      name: 'BOQs',
      data: [
        { name: 'Assigned', y: boqStatus.assigned || 0, color: '#10b981' },
        { name: 'Pending', y: boqStatus.pending || 0, color: '#f59e0b' },
        { name: 'Rejected', y: boqStatus.rejected || 0, color: '#ef4444' },
        { name: 'Completed', y: boqStatus.completed || 0, color: '#3b82f6' }
      ]
    }],
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y}</b> ({point.percentage:.1f}%)' }
  };

  // ========== CHART 2: Labour Status ==========
  // Parse labour data from backend - exact match on labour_type
  const labourPending = labourData.find((l: any) => l.labour_type === 'Requisition - Pending')?.quantity || 0;
  const labourApproved = labourData.find((l: any) => l.labour_type === 'Requisition - Approved')?.quantity || 0;
  const labourRejected = labourData.find((l: any) => l.labour_type === 'Requisition - Rejected')?.quantity || 0;
  const attnPendingLock = labourData.find((l: any) => l.labour_type === 'Attendance - Pending Lock')?.quantity || 0;
  const attnLocked = labourData.find((l: any) => l.labour_type === 'Attendance - Locked')?.quantity || 0;

  // Calculate totals for KPI cards
  const totalLabourReqs = labourPending + labourApproved + labourRejected;
  const totalAttendance = attnPendingLock + attnLocked;

  const labourStatusChart: Highcharts.Options = {
    chart: { type: 'bar', backgroundColor: 'transparent', height: 280, style: { fontFamily: 'inherit' } },
    title: { text: 'Labour & Attendance', align: 'left', style: { fontSize: '15px', fontWeight: '600', color: '#111827' } },
    xAxis: {
      categories: ['Req Pending', 'Req Approved', 'Req Rejected', 'Attn Pending', 'Attn Locked'],
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    yAxis: { title: { text: '' }, labels: { style: { fontSize: '11px', color: '#9ca3af' } }, gridLineColor: '#f3f4f6', allowDecimals: false },
    legend: { enabled: false },
    plotOptions: {
      bar: {
        borderRadius: 4,
        dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: '600', textOutline: 'none' } }
      }
    },
    series: [{
      type: 'bar',
      name: 'Count',
      data: [
        { y: labourPending, color: '#f59e0b' },
        { y: labourApproved, color: '#10b981' },
        { y: labourRejected, color: '#ef4444' },
        { y: attnPendingLock, color: '#8b5cf6' },
        { y: attnLocked, color: '#3b82f6' }
      ]
    }],
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y}</b>' }
  };

  // ========== CHART 3: Purchase Order Status (Area Spline) ==========
  const totalPOs = (purchaseOrderStatus.sent_to_buyer || 0) + (purchaseOrderStatus.se_requested || 0) +
                   (purchaseOrderStatus.completed || 0) + (purchaseOrderStatus.rejected || 0);
  const poStatusChart: Highcharts.Options = {
    chart: { type: 'areaspline', backgroundColor: 'transparent', height: 280, style: { fontFamily: 'inherit' } },
    title: { text: 'Purchase Orders', align: 'left', style: { fontSize: '15px', fontWeight: '600', color: '#111827' } },
    subtitle: { text: `Total: ${totalPOs} POs`, align: 'left', style: { fontSize: '12px', color: '#6b7280' } },
    xAxis: {
      categories: ['Sent to Buyer', 'SE Requested', 'Completed', 'Rejected'],
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    yAxis: { title: { text: '' }, labels: { style: { fontSize: '11px', color: '#9ca3af' } }, gridLineColor: '#f3f4f6', allowDecimals: false },
    legend: { enabled: false },
    plotOptions: {
      areaspline: {
        fillOpacity: 0.3,
        marker: { enabled: true, radius: 5 },
        dataLabels: { enabled: true, style: { fontSize: '11px', fontWeight: '600', textOutline: 'none' } }
      }
    },
    series: [{
      type: 'areaspline',
      name: 'POs',
      color: '#3b82f6',
      data: [
        purchaseOrderStatus.sent_to_buyer || 0,
        purchaseOrderStatus.se_requested || 0,
        purchaseOrderStatus.completed || 0,
        purchaseOrderStatus.rejected || 0
      ]
    }],
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y}</b> POs' }
  };

  // ========== CHART 4: Asset Requisition Approvals (Semi-circle Donut) ==========
  const assetRequisitionChart: Highcharts.Options = {
    chart: { type: 'pie', backgroundColor: 'transparent', height: 280, style: { fontFamily: 'inherit' } },
    title: { text: 'Asset Requisitions', align: 'left', style: { fontSize: '15px', fontWeight: '600', color: '#111827' } },
    subtitle: { text: `Total: ${assetDetails.total || 0}`, align: 'left', style: { fontSize: '12px', color: '#6b7280' } },
    legend: { enabled: true, align: 'right', verticalAlign: 'middle', layout: 'vertical', itemStyle: { fontSize: '11px', color: '#6b7280' } },
    plotOptions: {
      pie: {
        startAngle: -90,
        endAngle: 90,
        center: ['50%', '75%'],
        size: '130%',
        innerSize: '60%',
        dataLabels: { enabled: false },
        showInLegend: true
      }
    },
    series: [{
      type: 'pie',
      name: 'Requisitions',
      data: [
        { name: 'Pending PM', y: assetDetails.pending_pm || 0, color: '#f59e0b' },
        { name: 'Approved', y: assetDetails.pm_approved || 0, color: '#10b981' },
        { name: 'Rejected', y: assetDetails.pm_rejected || 0, color: '#ef4444' },
        { name: 'Dispatched', y: assetDetails.dispatched || 0, color: '#3b82f6' },
        { name: 'Completed', y: assetDetails.completed || 0, color: '#8b5cf6' }
      ]
    }],
    credits: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y}</b> ({point.percentage:.1f}%)' }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ModernLoadingSpinners size="md" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className={`${isMEP ? 'bg-cyan-600' : 'bg-blue-600'} text-white`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{dashboardTitle}</h1>
            <button
              onClick={() => refetch()}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI Cards - Row 1: BOQ Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ClipboardDocumentListIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total_boq_items || 0}</p>
                <p className="text-xs text-gray-500">Total BOQ Items</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.items_assigned || 0}</p>
                <p className="text-xs text-gray-500">Items Assigned</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <ClockIcon className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pending_assignment || 0}</p>
                <p className="text-xs text-gray-500">Pending Assignment</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CubeIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{assetDetails.total_approved || 0}</p>
                <p className="text-xs text-gray-500">Assets Approved</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* KPI Cards - Row 2: Labour & PO Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <UserGroupIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{labourPending}</p>
                <p className="text-xs text-gray-500">Labour Pending</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <UserGroupIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{labourApproved}</p>
                <p className="text-xs text-gray-500">Labour Approved</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 rounded-lg">
                <ClockIcon className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{attnLocked}</p>
                <p className="text-xs text-gray-500">Attendance Locked</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <WrenchScrewdriverIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{purchaseOrderStatus.completed || 0}</p>
                <p className="text-xs text-gray-500">POs Completed</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-xl border border-gray-200 p-5">
            <HighchartsReact highcharts={Highcharts} options={boqStatusChart} />
          </motion.div>

          {!isMEP && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="bg-white rounded-xl border border-gray-200 p-5">
              <HighchartsReact highcharts={Highcharts} options={labourStatusChart} />
            </motion.div>
          )}

          {isMEP && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="bg-white rounded-xl border border-gray-200 p-5">
              <HighchartsReact highcharts={Highcharts} options={poStatusChart} />
            </motion.div>
          )}
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {!isMEP && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white rounded-xl border border-gray-200 p-5">
              <HighchartsReact highcharts={Highcharts} options={poStatusChart} />
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="bg-white rounded-xl border border-gray-200 p-5">
            <HighchartsReact highcharts={Highcharts} options={assetRequisitionChart} />
          </motion.div>

          {isMEP && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-white rounded-xl border border-gray-200 p-5">
              {/* Placeholder for MEP-specific chart */}
              <div className="h-[280px] flex items-center justify-center text-gray-400">
                <p>MEP specific data chart</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Recent SE Requests */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent SE Requests</h3>
          {recentSERequests.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <ClipboardDocumentListIcon className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">No recent requests from Site Engineers</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Code</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Project</th>
                    <th className="pb-2 font-medium">Requested By</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSERequests.map((item: any) => (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-900">{item.code}</td>
                      <td className="py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          item.type === 'cr' ? 'bg-blue-100 text-blue-700' :
                          item.type === 'labour' ? 'bg-amber-100 text-amber-700' :
                          item.type === 'asset' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {getTypeLabel(item.type)}
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-600">{item.project_name}</td>
                      <td className="py-2.5 text-gray-600">{item.requested_by}</td>
                      <td className="py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.status?.toLowerCase().includes('approved') || item.status?.toLowerCase().includes('completed') ? 'bg-green-100 text-green-700' :
                          item.status?.toLowerCase().includes('rejected') ? 'bg-red-100 text-red-700' :
                          item.status?.toLowerCase().includes('pending') || item.status?.toLowerCase().includes('send_to') ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {formatStatus(item.status)}
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-400 text-right">{formatDate(item.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
};

export default React.memo(ProjectManagerHub);
