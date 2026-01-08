import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  BuildingOfficeIcon,
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
  CubeIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ArrowTrendingUpIcon,
  FolderOpenIcon,
  ShoppingCartIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { siteEngineerService } from '../services/siteEngineerService';
import { useDashboardMetricsAutoSync } from '@/hooks/useAutoSync';
import { Link } from 'react-router-dom';

interface DashboardData {
  stats: {
    total_projects: number;
    assigned_projects: number;
    ongoing_projects: number;
    completed_projects: number;
    completion_rate: number;
  };
  item_stats: {
    total_items_assigned: number;
    items_pending: number;
    items_in_progress: number;
    items_completed: number;
    unique_boqs: number;
  };
  change_request_stats: {
    total_crs: number;
    pending_approval: number;
    approved: number;
    rejected: number;
    purchase_completed: number;
    vendor_approved: number;
  };
  recent_projects: Array<{
    project_id: number;
    project_name: string;
    project_code: string | null;
    client: string;
    location: string;
    status: string;
    priority: string;
    start_date: string | null;
    end_date: string | null;
    duration_days: number;
  }>;
  projects_by_priority: {
    high: number;
    medium: number;
    low: number;
  };
  deadline_stats: {
    overdue: number;
    due_this_week: number;
    due_this_month: number;
    on_track: number;
  };
}

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();

  // Real-time auto-sync for dashboard stats
  const { data: dashboardData, isLoading: loading } = useDashboardMetricsAutoSync<DashboardData>(
    'site_engineer',
    async () => {
      const response = await siteEngineerService.getDashboardStats();
      return response;
    }
  );

  const data = useMemo<DashboardData>(() => dashboardData || {
    stats: {
      total_projects: 0,
      assigned_projects: 0,
      ongoing_projects: 0,
      completed_projects: 0,
      completion_rate: 0,
    },
    item_stats: {
      total_items_assigned: 0,
      items_pending: 0,
      items_in_progress: 0,
      items_completed: 0,
      unique_boqs: 0,
    },
    change_request_stats: {
      total_crs: 0,
      pending_approval: 0,
      approved: 0,
      rejected: 0,
      purchase_completed: 0,
      vendor_approved: 0,
    },
    recent_projects: [],
    projects_by_priority: {
      high: 0,
      medium: 0,
      low: 0,
    },
    deadline_stats: {
      overdue: 0,
      due_this_week: 0,
      due_this_month: 0,
      on_track: 0,
    },
  }, [dashboardData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  // Project Status Pie Chart
  const projectStatusChart: Highcharts.Options = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 280
    },
    title: {
      text: 'Project Status Distribution',
      align: 'center',
      style: { fontSize: '14px', fontWeight: '600', color: '#1f2937' }
    },
    series: [{
      type: 'pie',
      name: 'Projects',
      innerSize: '55%',
      data: [
        { name: 'Assigned', y: data.stats.assigned_projects || 0, color: '#f59e0b' },
        { name: 'Ongoing', y: data.stats.ongoing_projects || 0, color: '#6366f1' },
        { name: 'Completed', y: data.stats.completed_projects || 0, color: '#10b981' }
      ]
    }],
    plotOptions: {
      pie: {
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.y}',
          style: { fontSize: '11px', fontWeight: '500', textOutline: 'none' }
        }
      }
    },
    credits: { enabled: false },
    legend: { enabled: false }
  };

  // Item Status Chart
  const itemStatusChart: Highcharts.Options = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 280
    },
    title: {
      text: 'BOQ Items Status',
      align: 'center',
      style: { fontSize: '14px', fontWeight: '600', color: '#1f2937' }
    },
    xAxis: {
      categories: ['Pending', 'In Progress', 'Completed'],
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    yAxis: {
      title: { text: 'Count', style: { fontSize: '11px', color: '#6b7280' } },
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    series: [{
      type: 'bar',
      name: 'Items',
      data: [
        { y: data.item_stats.items_pending, color: '#f59e0b' },
        { y: data.item_stats.items_in_progress, color: '#6366f1' },
        { y: data.item_stats.items_completed, color: '#10b981' }
      ]
    }],
    plotOptions: {
      bar: {
        borderRadius: 4,
        dataLabels: { enabled: true, format: '{point.y}' }
      }
    },
    legend: { enabled: false },
    credits: { enabled: false }
  };

  // Change Request Status Chart
  const crStatusChart: Highcharts.Options = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 280
    },
    title: {
      text: 'Purchase Orders Overview',
      align: 'center',
      style: { fontSize: '14px', fontWeight: '600', color: '#1f2937' }
    },
    xAxis: {
      categories: ['Pending', 'Approved', 'Rejected', 'Purchased'],
      labels: { style: { fontSize: '10px', color: '#6b7280' } }
    },
    yAxis: {
      title: { text: 'Count', style: { fontSize: '11px', color: '#6b7280' } },
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    series: [{
      type: 'column',
      name: 'CRs',
      data: [
        { y: data.change_request_stats.pending_approval, color: '#f59e0b' },
        { y: data.change_request_stats.approved, color: '#10b981' },
        { y: data.change_request_stats.rejected, color: '#ef4444' },
        { y: data.change_request_stats.purchase_completed, color: '#3b82f6' }
      ]
    }],
    plotOptions: {
      column: {
        borderRadius: 4,
        dataLabels: { enabled: true, format: '{point.y}' }
      }
    },
    legend: { enabled: false },
    credits: { enabled: false }
  };

  // Deadline Overview Chart
  const deadlineChart: Highcharts.Options = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 280
    },
    title: {
      text: 'Deadline Status',
      align: 'center',
      style: { fontSize: '14px', fontWeight: '600', color: '#1f2937' }
    },
    series: [{
      type: 'pie',
      name: 'Projects',
      innerSize: '50%',
      data: [
        { name: 'Overdue', y: data.deadline_stats.overdue || 0, color: '#ef4444' },
        { name: 'Due This Week', y: data.deadline_stats.due_this_week || 0, color: '#f59e0b' },
        { name: 'Due This Month', y: data.deadline_stats.due_this_month || 0, color: '#6366f1' },
        { name: 'On Track', y: data.deadline_stats.on_track || 0, color: '#10b981' }
      ]
    }],
    plotOptions: {
      pie: {
        dataLabels: {
          enabled: true,
          format: '{point.name}: {point.y}',
          style: { fontSize: '10px', fontWeight: '500', textOutline: 'none' }
        }
      }
    },
    credits: { enabled: false },
    legend: { enabled: false }
  };

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'completed') return 'bg-green-100 text-green-800';
    if (s.includes('progress') || s === 'ongoing' || s === 'active') return 'bg-indigo-100 text-indigo-800';
    if (s === 'assigned' || s === 'pending' || s === 'items_assigned') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    const p = priority?.toLowerCase() || 'medium';
    if (p === 'high') return 'bg-red-100 text-red-800';
    if (p === 'low') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
                <ChartBarIcon className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Welcome back, {user?.full_name?.split(' ')[0] || 'Site Engineer'}!
                </h1>
                <p className="text-sm text-gray-600">Comprehensive overview of your projects and tasks</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Completion Rate</p>
              <p className="text-3xl font-bold text-green-600">{data.stats.completion_rate}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Item & CR Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Item Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <CubeIcon className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">BOQ Items</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Assigned</span>
                <span className="font-semibold text-purple-700">{data.item_stats.total_items_assigned}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Pending</span>
                <span className="font-medium text-amber-600">{data.item_stats.items_pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">In Progress</span>
                <span className="font-medium text-indigo-600">{data.item_stats.items_in_progress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Completed</span>
                <span className="font-medium text-green-600">{data.item_stats.items_completed}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Unique BOQs</span>
                  <span className="font-semibold text-gray-900">{data.item_stats.unique_boqs}</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Change Request Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <DocumentTextIcon className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Purchase Orders</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total CRs</span>
                <span className="font-semibold text-blue-700">{data.change_request_stats.total_crs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Pending Approval</span>
                <span className="font-medium text-amber-600">{data.change_request_stats.pending_approval}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Approved</span>
                <span className="font-medium text-green-600">{data.change_request_stats.approved}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Rejected</span>
                <span className="font-medium text-red-600">{data.change_request_stats.rejected}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Purchase Done</span>
                  <span className="font-semibold text-green-700">{data.change_request_stats.purchase_completed}</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Priority Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-gray-900">By Priority</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">High Priority</span>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold text-sm">
                  {data.projects_by_priority.high}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Medium Priority</span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 font-semibold text-sm">
                  {data.projects_by_priority.medium}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Low Priority</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-sm">
                  {data.projects_by_priority.low}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Deadline Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <CalendarDaysIcon className="w-5 h-5 text-orange-600" />
              <h3 className="font-semibold text-gray-900">Deadlines</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Overdue</span>
                <span className={`px-2 py-0.5 rounded-full font-semibold text-sm ${data.deadline_stats.overdue > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-500'}`}>
                  {data.deadline_stats.overdue}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Due This Week</span>
                <span className={`px-2 py-0.5 rounded-full font-semibold text-sm ${data.deadline_stats.due_this_week > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                  {data.deadline_stats.due_this_week}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Due This Month</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold text-sm">
                  {data.deadline_stats.due_this_month}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">On Track</span>
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold text-sm">
                  {data.deadline_stats.on_track}
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-3"
          >
            <HighchartsReact highcharts={Highcharts} options={projectStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-3"
          >
            <HighchartsReact highcharts={Highcharts} options={itemStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-3"
          >
            <HighchartsReact highcharts={Highcharts} options={crStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-3"
          >
            <HighchartsReact highcharts={Highcharts} options={deadlineChart} />
          </motion.div>
        </div>

        {/* Recent Projects Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpenIcon className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
            </div>
            <Link
              to="/site-engineer/projects"
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              View All →
            </Link>
          </div>

          {data.recent_projects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.recent_projects.map((project) => (
                    <tr key={project.project_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/site-engineer/projects`}
                          className="text-sm font-medium text-gray-900 hover:text-red-600"
                        >
                          {project.project_name}
                        </Link>
                        {project.project_code && (
                          <p className="text-xs text-gray-500">{project.project_code}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{project.client || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{project.location || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                          {project.status?.replace(/_/g, ' ') || 'Assigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(project.priority)}`}>
                          {project.priority || 'Medium'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {project.duration_days ? `${project.duration_days} days` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <FolderOpenIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No projects assigned yet</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default React.memo(Dashboard);
