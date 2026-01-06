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

  // ROLE-AWARE: Determine dashboard title based on user role
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const isMEP = userRoleLower === 'mep' || userRoleLower === 'mep supervisor' || userRoleLower === 'mep_supervisor';
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
        recent_activities: stats.recent_activities || [],
        projects: stats.projects || [],
        // Legacy format for backward compatibility
        materialPurchaseStats: {
          total_items: stats.stats.total_boq_items,
          items_assigned: stats.stats.items_assigned,
          items_pending: stats.stats.pending_assignment,
          total_cost: stats.stats.total_project_value
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

  // Project Activity Chart - Use data from dashboard stats
  const totalBudget = stats.total_project_value;

  // Calculate activity stats from dashboard status counts
  const activeBoqs = statusCounts.approved + statusCounts.pending;
  const completedBoqs = statusCounts.completed;
  const rejectedBoqs = statusCounts.rejected;
  const hasActivityData = activeBoqs > 0 || completedBoqs > 0 || rejectedBoqs > 0;

  const budgetUtilizationOptions = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Project Activity',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    plotOptions: {
      pie: {
        innerSize: '60%',
        borderRadius: 8,
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b><br>{point.y} ({point.percentage:.1f}%)',
          style: {
            fontSize: '12px',
            fontWeight: '600',
            textOutline: 'none',
            color: '#374151'
          }
        },
        showInLegend: true
      }
    },
    legend: {
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      itemStyle: {
        fontSize: '11px',
        fontWeight: '600'
      }
    },
    series: [{
      name: 'BOQs',
      data: hasActivityData ? [
        { name: 'Active', y: activeBoqs, color: '#3B82F6' },
        { name: 'Completed', y: completedBoqs, color: '#10B981' },
        { name: 'Rejected', y: rejectedBoqs, color: '#EF4444' }
      ].filter(item => item.y > 0) : [
        { name: 'No Data', y: 1, color: '#E5E7EB' }
      ]
    }],
    tooltip: {
      pointFormat: '<b>{point.y}</b> BOQs ({point.percentage:.1f}%)'
    },
    credits: { enabled: false }
  };

  // BOQ Items Breakdown Chart - Use data from dashboard API
  const totalMaterials = itemsBreakdown.materials;
  const totalLabour = itemsBreakdown.labour;

  const boqTrendOptions = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'BOQ Items Breakdown',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Materials', 'Labour'],
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
        text: 'Total Count',
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
      name: 'Items',
      data: [
        { y: totalMaterials, color: '#10B981', name: 'Materials' },
        { y: totalLabour, color: '#F59E0B', name: 'Labour' }
      ],
      colorByPoint: true
    }],
    tooltip: {
      pointFormat: '<b>{point.y}</b> items',
      style: {
        fontSize: '12px'
      }
    },
    credits: { enabled: false }
  };

  // Project Progress Chart
  const topProjects = projects.slice(0, 5);
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((sum, p) => sum + (p.progress || 0), 0) / projects.length)
    : 0;

  const projectProgressOptions = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: `Project Progress (Avg: ${avgProgress}%)`,
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: topProjects.length > 0
        ? topProjects.map(p => p.project_name?.substring(0, 20) || 'Project')
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
        text: 'Completion (%)',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      min: 0,
      max: 100,
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
      bar: {
        borderRadius: 6,
        dataLabels: {
          enabled: true,
          format: '{y}%',
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
      name: 'Progress',
      data: topProjects.length > 0
        ? topProjects.map((p) => ({
            y: p.progress || 0,
            color: (p.progress || 0) >= 75 ? '#10B981' : (p.progress || 0) >= 50 ? '#3B82F6' : (p.progress || 0) >= 25 ? '#F59E0B' : '#EF4444'
          }))
        : [{ y: 0, color: '#E5E7EB' }]
    }],
    tooltip: {
      pointFormat: '<b>{point.y}%</b> complete',
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
            <HighchartsReact highcharts={Highcharts} options={budgetUtilizationOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={boqTrendOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={projectProgressOptions} />
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