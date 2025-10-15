import React, { useEffect, useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { motion } from 'framer-motion';
import { projectManagerService } from '../services/projectManagerService';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { useDashboardMetricsAutoSync } from '@/hooks/useAutoSync';

const ProjectManagerHub: React.FC = () => {
  const { user } = useAuthStore();

  // Real-time auto-sync for dashboard data
  const { data: dashboardData, isLoading: loading, refetch } = useDashboardMetricsAutoSync(
    'project_manager',
    async () => {
      if (!user?.user_id) {
        throw new Error('User not authenticated');
      }

      const [boqsData, myProjectsData] = await Promise.all([
        projectManagerService.getMyBOQs(),
        projectManagerService.getMyProjects(user.user_id)
      ]);

      return {
        boqs: boqsData.boqs || [],
        projects: myProjectsData.user_list || []
      };
    }
  );

  const boqs = useMemo(() => dashboardData?.boqs || [], [dashboardData]);
  const projects = useMemo(() => dashboardData?.projects || [], [dashboardData]);

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

  // Project Status Chart - Dynamic data from API
  const projectStatusOptions = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'BOQ Status Overview',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    xAxis: {
      categories: boqs.slice(0, 5).map(b => b.boq_name || b.project_name || 'Unknown'),
      labels: {
        style: {
          fontSize: '12px'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Status'
      },
      categories: ['Pending', 'Approved', 'Rejected']
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
            fontSize: '11px'
          }
        }
      }
    },
    series: [{
      name: 'Status',
      data: boqs.slice(0, 5).map(b => ({
        y: b.status === 'approved' ? 2 : b.status === 'rejected' ? 0 : 1,
        color: b.status === 'approved' ? '#10B981' : b.status === 'rejected' ? '#EF4444' : '#F59E0B'
      }))
    }]
  };

  // Budget Utilization Chart - Calculate from BOQ data
  const totalBudget = boqs.reduce((sum, b) => sum + (b.boq_details?.total_cost || 0), 0);
  const avgUtilization = totalBudget > 0 ? 60 : 0; // Can be enhanced with actual spent data

  const budgetUtilizationOptions = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Project Activity',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    plotOptions: {
      pie: {
        innerSize: '60%',
        borderRadius: 8,
        dataLabels: {
          enabled: true,
          format: '{point.name}: {point.percentage:.1f}%',
          style: {
            fontSize: '11px'
          }
        }
      }
    },
    series: [{
      name: 'Activity',
      data: [
        { name: 'Active BOQs', y: boqs.filter(b => b.status === 'approved' || b.status === 'pending').length, color: '#3B82F6' },
        { name: 'Completed', y: boqs.filter(b => b.status === 'completed').length, color: '#10B981' },
        { name: 'Others', y: boqs.filter(b => b.status === 'rejected').length || 1, color: '#E5E7EB' }
      ]
    }]
  };

  // BOQ Items Trend Chart
  const boqTrendOptions = {
    chart: {
      type: 'area',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'BOQ Items Breakdown',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    xAxis: {
      categories: boqs.slice(0, 7).map(b => b.boq_name?.substring(0, 10) || 'BOQ')
    },
    yAxis: {
      title: {
        text: 'Items Count'
      }
    },
    legend: {
      align: 'center',
      verticalAlign: 'bottom'
    },
    plotOptions: {
      area: {
        fillOpacity: 0.3,
        marker: {
          radius: 3
        }
      }
    },
    series: [{
      name: 'Materials',
      data: boqs.slice(0, 7).map(b => b.boq_details?.total_materials || 0),
      color: '#10B981'
    }, {
      name: 'Labour',
      data: boqs.slice(0, 7).map(b => b.boq_details?.total_labour || 0),
      color: '#F59E0B'
    }]
  };

  // Project Progress Chart
  const projectProgressOptions = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Project Progress',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    xAxis: {
      categories: projects.slice(0, 5).map(p => p.project_name?.substring(0, 20) || 'Project')
    },
    yAxis: {
      title: {
        text: 'Completion (%)'
      },
      max: 100
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
            fontSize: '11px'
          }
        }
      }
    },
    series: [{
      name: 'Progress',
      data: projects.slice(0, 5).map((p, i) => ({
        y: p.progress || 0, // Use actual progress from backend
        color: i % 2 === 0 ? '#10B981' : '#3B82F6'
      }))
    }]
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header with Blue Gradient */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-bold text-blue-900">Project Manager Dashboard</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
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
            {boqs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No recent activities</p>
              </div>
            ) : (
              boqs.slice(0, 5).map((boq, index) => (
                <div key={boq.boq_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      boq.status === 'approved' ? 'bg-green-500' :
                      boq.status === 'rejected' ? 'bg-red-500' :
                      boq.status === 'pending' ? 'bg-yellow-500' : 'bg-blue-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{boq.boq_name}</p>
                      <p className="text-xs text-gray-500">{boq.project_name || 'Unknown Project'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      boq.status === 'approved' ? 'bg-green-100 text-green-700' :
                      boq.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      boq.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {boq.status}
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

export default ProjectManagerHub;