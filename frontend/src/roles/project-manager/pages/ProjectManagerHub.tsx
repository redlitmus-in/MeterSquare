import React, { useEffect, useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { motion } from 'framer-motion';
import { projectManagerService } from '../services/projectManagerService';
import { mepService } from '../services/mepService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';
import { useDashboardMetricsAutoSync } from '@/hooks/useAutoSync';

const ProjectManagerHub: React.FC = () => {
  const { user } = useAuthStore();

  // ROLE-AWARE: Determine dashboard type based on URL path (for admin viewing different roles) or user role
  const currentPath = window.location.pathname;
  const isMEPRoute = currentPath.includes('/mep/');

  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const isUserMEP = userRoleLower === 'mep' || userRoleLower === 'mep supervisor' || userRoleLower === 'mep_supervisor';

  // Use route to determine dashboard type (allows admin to view MEP dashboard)
  const isMEP = isMEPRoute || isUserMEP;
  const dashboardTitle = isMEP ? 'MEP Supervisor Dashboard' : 'Project Manager Dashboard';

  // Real-time auto-sync for dashboard data
  const { data: dashboardData, isLoading: loading, refetch} = useDashboardMetricsAutoSync(
    'project_manager',
    async () => {
      if (!user?.user_id) {
        throw new Error('User not authenticated');
      }

      // ROLE-AWARE: Fetch dashboard statistics from MEP or PM API based on user role
      const stats = isMEP
        ? await mepService.getDashboardStats()
        : await projectManagerService.getDashboardStats();

      return {
        stats: stats.stats,
        boq_status: stats.boq_status,
        items_breakdown: stats.items_breakdown,
        purchase_order_status: stats.purchase_order_status || {},
        labour_data: stats.labour_data || [],
        top_budget_projects: stats.top_budget_projects || [],
        recent_activities: stats.recent_activities || [],
        projects: stats.projects || [],
        // Legacy format for backward compatibility
        materialPurchaseStats: {
          total_items: stats.stats.total_boq_items,
          items_assigned: stats.stats.items_assigned,
          items_pending: stats.stats.pending_assignment,
          total_cost: stats.stats.total_projects || stats.stats.total_project_value  // Use total_projects (count)
        }
      };
    }
  );

  // Use dashboard stats directly from the API
  const stats = dashboardData?.stats || {
    total_boq_items: 0,
    items_assigned: 0,
    pending_assignment: 0,
    total_project_value: 0
  };

  const boqStatus = dashboardData?.boq_status || {
    approved: 0,
    pending: 0,
    rejected: 0,
    completed: 0
  };

  const itemsBreakdown = dashboardData?.items_breakdown || {
    materials: 0,
    labour: 0
  };

  const purchaseOrderStatus = dashboardData?.purchase_order_status || {
    sent_to_buyer: 0,
    accepted: 0,
    completed: 0,
    rejected: 0
  };

  const labourData = dashboardData?.labour_data || [];

  const topBudgetProjects = dashboardData?.top_budget_projects || [];

  const recentActivities = dashboardData?.recent_activities || [];

  // Projects data from dashboard API
  const projects = dashboardData?.projects || [];

  useEffect(() => {
    // Set Highcharts global options for consistent theming
    Highcharts.setOptions({
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
      chart: {
        style: {
          fontFamily: 'Inter, system-ui, sans-serif'
        }
      }
    });
  }, []);

  // BOQ Status Overview Chart - Use data directly from API
  const statusCounts = boqStatus;

  const hasStatusData = statusCounts.approved > 0 || statusCounts.pending > 0 || statusCounts.rejected > 0 || statusCounts.completed > 0;

  const projectStatusOptions = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'BOQ Status Overview',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Approved', 'Pending', 'Rejected', 'Completed'],
      labels: {
        style: {
          fontSize: '12px',
          fontWeight: '600',
          color: '#4b5563'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Count',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      allowDecimals: false,
      min: 0,
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      column: {
        borderRadius: 8,
        dataLabels: {
          enabled: true,
          style: {
            fontSize: '12px',
            fontWeight: 'bold',
            textOutline: 'none'
          }
        }
      }
    },
    series: [{
      name: 'BOQs',
      data: [
        { y: statusCounts.approved, color: '#10B981', name: 'Approved' },
        { y: statusCounts.pending, color: '#F59E0B', name: 'Pending' },
        { y: statusCounts.rejected, color: '#EF4444', name: 'Rejected' },
        { y: statusCounts.completed, color: '#3B82F6', name: 'Completed' }
      ],
      colorByPoint: true
    }],
    tooltip: {
      pointFormat: '<b>{point.y}</b> BOQs',
      style: {
        fontSize: '12px'
      }
    },
    credits: { enabled: false }
  };

  // Labour Data Chart - Labour Requisition & Attendance Lock Status
  const hasLabourData = labourData.length > 0 && labourData.some(item => item.quantity > 0);

  const labourDataOptions = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Labour Status',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: hasLabourData
        ? labourData.map(item => {
            // Shorten labels for better display
            const label = item.labour_type || 'Unknown';
            if (label.includes('Requisition - Pending')) return 'Req - Pending';
            if (label.includes('Requisition - Approved')) return 'Req - Approved';
            if (label.includes('Requisition - Rejected')) return 'Req - Rejected';
            if (label.includes('Attendance - Pending Lock')) return 'Attn - Pending Lock';
            if (label.includes('Attendance - Locked')) return 'Attn - Locked';
            return label.substring(0, 15);
          })
        : ['No Data'],
      labels: {
        style: {
          fontSize: '10px',
          fontWeight: '600',
          color: '#4b5563'
        },
        rotation: -45
      }
    },
    yAxis: {
      title: {
        text: 'Count',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      allowDecimals: false,
      min: 0,
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      column: {
        borderRadius: 6,
        dataLabels: {
          enabled: true,
          style: {
            fontSize: '11px',
            fontWeight: 'bold',
            textOutline: 'none'
          }
        }
      }
    },
    series: [{
      name: 'Count',
      data: hasLabourData
        ? labourData.map((item, index) => {
            // Color code by status type
            let color = '#F59E0B'; // Default orange
            if (item.labour_type?.includes('Pending')) color = '#F59E0B'; // Orange
            if (item.labour_type?.includes('Approved') || item.labour_type?.includes('Locked')) color = '#10B981'; // Green
            if (item.labour_type?.includes('Rejected')) color = '#EF4444'; // Red
            return { y: item.quantity, color };
          })
        : [{ y: 0, color: '#E5E7EB' }],
      colorByPoint: true
    }],
    tooltip: {
      pointFormat: '<b>{point.y}</b> records',
      style: {
        fontSize: '12px'
      }
    },
    credits: { enabled: false }
  };

  // Purchase Order Status Chart
  const hasPOData = purchaseOrderStatus.sent_to_buyer > 0 ||
                    purchaseOrderStatus.accepted > 0 ||
                    purchaseOrderStatus.completed > 0 ||
                    purchaseOrderStatus.rejected > 0;

  const purchaseOrderOptions = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Purchase Order Status',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Sent to Buyer', 'Accepted', 'Completed', 'Rejected'],
      labels: {
        style: {
          fontSize: '11px',
          fontWeight: '600',
          color: '#4b5563'
        },
        rotation: -45
      }
    },
    yAxis: {
      title: {
        text: 'Count',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      allowDecimals: false,
      min: 0,
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      column: {
        borderRadius: 8,
        dataLabels: {
          enabled: true,
          style: {
            fontSize: '12px',
            fontWeight: 'bold',
            textOutline: 'none'
          }
        }
      }
    },
    series: [{
      name: 'Purchase Orders',
      data: hasPOData ? [
        { y: purchaseOrderStatus.sent_to_buyer, color: '#3B82F6', name: 'Sent to Buyer' },
        { y: purchaseOrderStatus.accepted, color: '#10B981', name: 'Accepted' },
        { y: purchaseOrderStatus.completed, color: '#8B5CF6', name: 'Completed' },
        { y: purchaseOrderStatus.rejected, color: '#EF4444', name: 'Rejected' }
      ] : [
        { y: 0, color: '#E5E7EB', name: 'No Data' }
      ],
      colorByPoint: true
    }],
    tooltip: {
      pointFormat: '<b>{point.y}</b> POs',
      style: {
        fontSize: '12px'
      }
    },
    credits: { enabled: false }
  };

  // Top 5 High Budget Projects Chart
  const hasTopBudgetProjects = topBudgetProjects.length > 0;

  const topBudgetProjectsOptions = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Top 5 High Budget Projects',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: hasTopBudgetProjects
        ? topBudgetProjects.map(p => p.project_name?.substring(0, 20) || 'Project')
        : ['No Projects'],
      labels: {
        style: {
          fontSize: '11px',
          fontWeight: '600',
          color: '#4b5563'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Budget (AED)',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      min: 0,
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        },
        formatter: function() {
          return (this.value / 1000).toFixed(0) + 'K';
        }
      }
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        dataLabels: {
          enabled: true,
          formatter: function() {
            return 'AED ' + (this.y / 1000).toFixed(1) + 'K';
          },
          style: {
            fontSize: '11px',
            fontWeight: 'bold',
            textOutline: 'none',
            color: '#ffffff'
          }
        }
      }
    },
    series: [{
      name: 'Budget',
      data: hasTopBudgetProjects
        ? topBudgetProjects.map((p, index) => {
            // Color gradient from highest to lowest budget
            const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];
            return { y: p.budget, color: colors[index] || '#6B7280' };
          })
        : [{ y: 0, color: '#E5E7EB' }]
    }],
    tooltip: {
      pointFormat: '<b>AED {point.y:,.2f}</b>',
      style: {
        fontSize: '12px'
      }
    },
    credits: { enabled: false }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <ModernLoadingSpinners size="md" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header with Blue Gradient - ROLE-AWARE */}
      <div className={`bg-gradient-to-r shadow-sm ${isMEP ? 'from-cyan-50 to-cyan-100' : 'from-blue-50 to-blue-100'}`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <h1 className={`text-2xl font-bold ${isMEP ? 'text-cyan-900' : 'text-blue-900'}`}>
            {dashboardTitle}
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Material Purchase Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-md border border-blue-200 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Total BOQ Items</p>
                <p className="text-2xl font-bold text-blue-900">{dashboardData?.materialPurchaseStats?.total_items || 0}</p>
                <p className="text-xs text-blue-700 mt-1">Across all projects</p>
              </div>
              <div className="text-blue-500">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-md border border-green-200 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Items Assigned</p>
                <p className="text-2xl font-bold text-green-900">{dashboardData?.materialPurchaseStats?.items_assigned || 0}</p>
                <p className="text-xs text-green-700 mt-1">To Site Engineers</p>
              </div>
              <div className="text-green-500">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-md border border-orange-200 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">Pending Assignment</p>
                <p className="text-2xl font-bold text-orange-900">{dashboardData?.materialPurchaseStats?.items_pending || 0}</p>
                <p className="text-xs text-orange-700 mt-1">Awaiting action</p>
              </div>
              <div className="text-orange-500">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-md border border-purple-200 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-1">Total Project Value</p>
                <p className="text-2xl font-bold text-purple-900">AED {(dashboardData?.materialPurchaseStats?.total_cost || 0).toLocaleString()}</p>
                <p className="text-xs text-purple-700 mt-1">All BOQs combined</p>
              </div>
              <div className="text-purple-500">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={projectStatusOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={labourDataOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={purchaseOrderOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={topBudgetProjectsOptions} />
          </motion.div>
        </div>

        {/* Recent Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent BOQ Activities</h2>
          <div className="space-y-3">
            {recentActivities.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No recent activities</p>
              </div>
            ) : (
              recentActivities.map((activity, index) => (
                <div key={activity.boq_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.status?.toLowerCase().includes('approved') ? 'bg-green-500' :
                      activity.status?.toLowerCase().includes('rejected') ? 'bg-red-500' :
                      activity.status?.toLowerCase().includes('pending') ? 'bg-yellow-500' : 'bg-blue-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{activity.boq_name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500">{activity.project_name || 'Unknown Project'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      activity.status?.toLowerCase().includes('approved') ? 'bg-green-100 text-green-700' :
                      activity.status?.toLowerCase().includes('rejected') ? 'bg-red-100 text-red-700' :
                      activity.status?.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {activity.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(ProjectManagerHub);