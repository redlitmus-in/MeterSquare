import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  BuildingOfficeIcon,
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { siteEngineerService } from '../services/siteEngineerService';
import { useDashboardMetricsAutoSync } from '@/hooks/useAutoSync';

interface DashboardStats {
  total_projects: number;
  assigned_projects: number;
  ongoing_projects: number;
  completed_projects: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();

  // Real-time auto-sync for dashboard stats
  const { data: statsData, isLoading: loading } = useDashboardMetricsAutoSync(
    'site_engineer',
    async () => {
      const response = await siteEngineerService.getDashboardStats();
      return response.stats || response;
    }
  );

  const stats = useMemo(() => statsData || {
    total_projects: 0,
    assigned_projects: 0,
    ongoing_projects: 0,
    completed_projects: 0,
  }, [statsData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Projects',
      value: stats.total_projects,
      icon: BuildingOfficeIcon,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-900'
    },
    {
      title: 'Assigned Projects',
      value: stats.assigned_projects,
      icon: ClockIcon,
      color: 'from-red-500 to-rose-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-900'
    },
    {
      title: 'Ongoing Projects',
      value: stats.ongoing_projects,
      icon: ChartBarIcon,
      color: 'from-indigo-500 to-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-900'
    },
    {
      title: 'Completed Projects',
      value: stats.completed_projects,
      icon: CheckCircleIcon,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-900'
    }
  ];

  // Chart configurations
  const projectStatusChart = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Project Status',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    series: [{
      name: 'Projects',
      data: [
        { name: 'Assigned', y: stats.assigned_projects || 0, color: '#ef4444' },
        { name: 'Ongoing', y: stats.ongoing_projects || 0, color: '#6366f1' },
        { name: 'Completed', y: stats.completed_projects || 0, color: '#10b981' }
      ]
    }],
    plotOptions: {
      pie: {
        innerSize: '60%',
        dataLabels: {
          enabled: true,
          distance: 20,
          format: '{point.name}: {point.y}',
          style: {
            fontSize: '13px',
            fontWeight: '600',
            textOutline: 'none'
          }
        }
      }
    },
    credits: { enabled: false },
    legend: {
      enabled: false
    }
  };

  const projectTrendChart = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Project Overview',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Total', 'Assigned', 'Ongoing', 'Completed'],
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
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
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    series: [{
      name: 'Projects',
      data: [
        stats.total_projects,
        stats.assigned_projects,
        stats.ongoing_projects,
        stats.completed_projects
      ],
      color: '#3b82f6'
    }],
    plotOptions: {
      column: {
        borderRadius: 5,
        dataLabels: { enabled: false }
      }
    },
    legend: {
      enabled: false
    },
    credits: { enabled: false }
  };

  const progressChart = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Project Progress',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Completion Rate'],
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    yAxis: {
      min: 0,
      max: 100,
      title: {
        text: 'Percentage',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    series: [{
      name: 'Completed',
      data: [stats.total_projects > 0 ? (stats.completed_projects / stats.total_projects) * 100 : 0],
      color: '#10b981'
    }],
    plotOptions: {
      bar: {
        borderRadius: 5,
        dataLabels: {
          enabled: true,
          format: '{point.y:.0f}%'
        }
      }
    },
    legend: {
      enabled: false
    },
    credits: { enabled: false }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header - Red Soft Gradient */}
      <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.full_name?.split(' ')[0] || 'Site Engineer'}!</h1>
              <p className="text-sm text-gray-600">Here's an overview of your projects</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`${stat.bgColor} ${stat.borderColor} border-2 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                  <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} shadow-lg`}>
                  <stat.icon className="w-8 h-8 text-white" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-8 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={projectStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={projectTrendChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={progressChart} />
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a
              href="/siteSupervisor/projects/assigned"
              className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 hover:shadow-md transition-all"
            >
              <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">View Assigned Projects</p>
                <p className="text-xs text-blue-700">Manage your assigned work</p>
              </div>
            </a>
            <a
              href="/siteSupervisor/projects/ongoing"
              className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 hover:shadow-md transition-all"
            >
              <ChartBarIcon className="w-6 h-6 text-indigo-600" />
              <div>
                <p className="font-semibold text-indigo-900">Track Progress</p>
                <p className="text-xs text-indigo-700">Monitor ongoing projects</p>
              </div>
            </a>
            <a
              href="/siteSupervisor/projects/completed"
              className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-green-50 to-green-100 border border-green-200 hover:shadow-md transition-all"
            >
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">View Completed</p>
                <p className="text-xs text-green-700">Review finished projects</p>
              </div>
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
