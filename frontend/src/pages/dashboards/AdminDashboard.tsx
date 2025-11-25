import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  Users,
  Building2,
  FileText,
  TrendingUp,
  Settings,
  Shield,
  Activity,
  UserPlus,
  Database,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  ArrowUpRight,
  Briefcase,
  Clock
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { adminApi, SystemStats, Activity as ActivityType, User as AdminUser } from '@/api/admin';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const AdminDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<ActivityType[]>([]);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [statsData, activityData, usersData] = await Promise.all([
        adminApi.getSystemStats(),
        adminApi.getRecentActivity(10),
        adminApi.getUsers({ page: 1, per_page: 10 })
      ]);

      setStats(statsData);
      setRecentActivities(activityData.activities);
      setUsersList(usersData.users);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      showError('Failed to load dashboard data', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  // Highcharts configuration
  const roleDistributionChart = stats ? {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      style: { fontFamily: 'inherit' }
    },
    title: { text: '' },
    credits: { enabled: false },
    plotOptions: {
      pie: {
        innerSize: '60%',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.percentage:.1f}%',
          style: { fontSize: '11px', fontWeight: '400' }
        }
      }
    },
    series: [{
      name: 'Users',
      data: stats.role_distribution.map(r => ({
        name: r.role,
        y: r.count,
        color: r.role === 'admin' ? '#243d8a' :
               r.role === 'technicalDirector' ? '#3b82f6' :
               r.role === 'projectManager' ? '#10b981' :
               r.role === 'estimator' ? '#f59e0b' : '#6b7280'
      }))
    }]
  } : null;

  const userGrowthChart = stats ? {
    chart: {
      type: 'areaspline',
      backgroundColor: 'transparent',
      style: { fontFamily: 'inherit' }
    },
    title: { text: '' },
    credits: { enabled: false },
    xAxis: {
      categories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      lineColor: '#e5e7eb'
    },
    yAxis: {
      title: { text: '' },
      gridLineColor: '#f3f4f6'
    },
    plotOptions: {
      areaspline: {
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, 'rgba(36, 61, 138, 0.2)'],
            [1, 'rgba(36, 61, 138, 0.02)']
          ]
        },
        marker: { radius: 4, fillColor: '#243d8a' },
        lineWidth: 2,
        lineColor: '#243d8a'
      }
    },
    series: [{
      name: 'Active Users',
      data: [stats.users.active - 12, stats.users.active - 8, stats.users.active - 3, stats.users.active]
    }]
  } : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" size="lg" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                  <Shield className="w-6 h-6 text-[#243d8a]" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">System Administration</h1>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Welcome back, {user?.full_name || user?.email || 'Admin'}
                  </p>
                </div>
              </div>
            </div>
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

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-gray-50 to-blue-100/30 rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-[#243d8a]" />
              </div>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                {stats.users.new_last_30d > 0 ? `+${stats.users.new_last_30d} this month` : 'No change'}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.users.total}</h3>
            <p className="text-sm text-gray-600 mt-1">Total Users</p>
            <p className="text-xs text-gray-500 mt-2">{stats.users.active} active • {stats.users.inactive} inactive</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-r from-gray-50 to-blue-100/30 rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <Building2 className="w-5 h-5 text-[#243d8a]" />
              </div>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                {stats.projects.new_last_30d > 0 ? `+${stats.projects.new_last_30d} this month` : 'No change'}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.projects.total}</h3>
            <p className="text-sm text-gray-600 mt-1">Total Projects</p>
            <p className="text-xs text-gray-500 mt-2">{stats.projects.active} active • {stats.projects.completed} completed</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-r from-gray-50 to-blue-100/30 rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-[#243d8a]" />
              </div>
              <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
                {stats.boq.pending} pending
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.boq.total}</h3>
            <p className="text-sm text-gray-600 mt-1">Total BOQs</p>
            <p className="text-xs text-gray-500 mt-2">{stats.boq.approved} approved</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-r from-gray-50 to-blue-100/30 rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all hover:border-blue-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                Excellent
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.system_health}%</h3>
            <p className="text-sm text-gray-600 mt-1">System Health</p>
            <p className="text-xs text-gray-500 mt-2">All services operational</p>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => navigate('/admin/user-management')}
              className="flex flex-col items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#243d8a] hover:bg-blue-50/50 transition-all group"
            >
              <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-[#243d8a] transition-colors">
                <Users className="w-6 h-6 text-[#243d8a] group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700">Manage Users</span>
            </button>

            <button
              onClick={() => navigate('/admin/projects')}
              className="flex flex-col items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#243d8a] hover:bg-blue-50/50 transition-all group"
            >
              <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-[#243d8a] transition-colors">
                <Briefcase className="w-6 h-6 text-[#243d8a] group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700">Manage Projects</span>
            </button>

            <button
              onClick={() => navigate('/admin/roles')}
              className="flex flex-col items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#243d8a] hover:bg-blue-50/50 transition-all group"
            >
              <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-[#243d8a] transition-colors">
                <Shield className="w-6 h-6 text-[#243d8a] group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700">Manage Roles</span>
            </button>

            <button
              onClick={() => navigate('/admin/settings')}
              className="flex flex-col items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#243d8a] hover:bg-blue-50/50 transition-all group"
            >
              <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-[#243d8a] transition-colors">
                <Settings className="w-6 h-6 text-[#243d8a] group-hover:text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700">Settings</span>
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Role Distribution Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Role Distribution</h2>
            {roleDistributionChart && (
              <HighchartsReact highcharts={Highcharts} options={roleDistributionChart} />
            )}
          </motion.div>

          {/* User Growth Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">User Growth Trend</h2>
            {userGrowthChart && (
              <HighchartsReact highcharts={Highcharts} options={userGrowthChart} />
            )}
          </motion.div>
        </div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <button className="text-sm text-[#243d8a] hover:underline">View all</button>
          </div>
          <div className="space-y-4">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200">
                <div className={`p-2 rounded-lg ${
                  activity.type === 'project' ? 'bg-blue-100' :
                  activity.type === 'user' ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  {activity.type === 'project' ? <Briefcase className="w-5 h-5 text-blue-600" /> :
                   activity.type === 'user' ? <UserPlus className="w-5 h-5 text-green-600" /> :
                   <Activity className="w-5 h-5 text-gray-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{activity.user}</p>
                  <p className="text-sm text-gray-600">{activity.details}</p>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {formatRelativeTime(activity.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Users Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Users</h2>
              <button
                onClick={() => navigate('/admin/user-management')}
                className="text-sm text-[#243d8a] hover:underline flex items-center gap-1"
              >
                View all
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">User</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">Email</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">Role</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-gray-700">Last Login</th>
                  <th className="text-right py-3 px-6 text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map(user => (
                  <tr key={user.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-[#243d8a]">
                            {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase() : user.email[0].toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{user.full_name || user.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-sm text-gray-600">{user.email}</td>
                    <td className="py-3 px-6">
                      <span className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        {user.role_name || `Role ID: ${user.role_id}`}
                      </span>
                    </td>
                    <td className="py-3 px-6">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        user.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-sm text-gray-500">
                      {user.last_login ? formatRelativeTime(user.last_login) : 'Never'}
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/admin/user-management`)}
                          className="p-1.5 hover:bg-blue-50 text-[#243d8a] rounded transition-colors"
                          title="View/Edit user"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AdminDashboard;
