import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Building2,
  FileText,
  TrendingUp,
  Settings,
  Shield,
  Activity,
  DollarSign,
  Package,
  UserPlus,
  Database,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  PieChart,
  Target,
  Briefcase,
  HardHat,
  ClipboardList,
  UserCheck,
  Eye,
  Edit,
  Trash2,
  Plus,
  RefreshCw,
  Download,
  Upload,
  Search,
  Filter,
  Calendar,
  Mail,
  Bell,
  Lock,
  Key,
  Globe,
  Layers,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

const AdminDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 45,
    activeProjects: 12,
    totalRevenue: 3440000,
    pendingApprovals: 8,
    systemHealth: 98.5,
    activeUsers: 38,
    completedProjects: 156,
    avgProjectValue: 286667
  });

  // Card animation variants
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: index * 0.1,
        duration: 0.5,
        ease: "easeOut"
      }
    }),
    hover: {
      y: -5,
      transition: { duration: 0.2 }
    }
  };

  // System metrics data
  const systemMetrics = [
    { label: 'CPU Usage', value: 45, color: 'bg-blue-500' },
    { label: 'Memory', value: 62, color: 'bg-green-500' },
    { label: 'Storage', value: 78, color: 'bg-yellow-500' },
    { label: 'Network', value: 35, color: 'bg-purple-500' }
  ];

  // Recent activities
  const recentActivities = [
    { id: 1, user: 'John Doe', action: 'Created new project', time: '5 mins ago', type: 'project' },
    { id: 2, user: 'Jane Smith', action: 'Approved BOQ #234', time: '15 mins ago', type: 'approval' },
    { id: 3, user: 'Mike Johnson', action: 'Added new user', time: '1 hour ago', type: 'user' },
    { id: 4, user: 'Sarah Wilson', action: 'Updated system settings', time: '2 hours ago', type: 'settings' }
  ];

  // Users list
  const usersList = [
    { id: 1, name: 'John Doe', email: 'john@metersquare.com', role: 'Project Manager', status: 'active', lastLogin: '2 mins ago' },
    { id: 2, name: 'Jane Smith', email: 'jane@metersquare.com', role: 'Technical Director', status: 'active', lastLogin: '1 hour ago' },
    { id: 3, name: 'Mike Johnson', email: 'mike@metersquare.com', role: 'Estimator', status: 'active', lastLogin: '3 hours ago' },
    { id: 4, name: 'Sarah Wilson', email: 'sarah@metersquare.com', role: 'Site Engineer', status: 'inactive', lastLogin: '2 days ago' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-8 h-8 text-purple-600" />
                Admin Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">System administration and control center</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'Admin User'}</p>
                  <p className="text-xs text-gray-500">System Administrator</p>
                </div>
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Overview Section */}
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <motion.div
                custom={0}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> +12%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalUsers}</h3>
                <p className="text-sm text-gray-500 mt-1">Total Users</p>
                <p className="text-xs text-gray-400 mt-2">{stats.activeUsers} active now</p>
              </motion.div>

              <motion.div
                custom={1}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Briefcase className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> +5%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.activeProjects}</h3>
                <p className="text-sm text-gray-500 mt-1">Active Projects</p>
                <p className="text-xs text-gray-400 mt-2">{stats.completedProjects} completed</p>
              </motion.div>

              <motion.div
                custom={2}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> +18%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">₹{(stats.totalRevenue / 100000).toFixed(1)}L</h3>
                <p className="text-sm text-gray-500 mt-1">Total Revenue</p>
                <p className="text-xs text-gray-400 mt-2">Avg: ₹{(stats.avgProjectValue / 1000).toFixed(0)}k</p>
              </motion.div>

              <motion.div
                custom={3}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Activity className="w-6 h-6 text-yellow-600" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                    {stats.systemHealth}%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Healthy</h3>
                <p className="text-sm text-gray-500 mt-1">System Status</p>
                <p className="text-xs text-gray-400 mt-2">All services running</p>
              </motion.div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Activity */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
                  <button className="text-sm text-purple-600 hover:text-purple-700">View all</button>
                </div>
                <div className="space-y-4">
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className={`p-2 rounded-lg ${
                        activity.type === 'project' ? 'bg-blue-100' :
                        activity.type === 'approval' ? 'bg-green-100' :
                        activity.type === 'user' ? 'bg-purple-100' :
                        'bg-gray-100'
                      }`}>
                        {activity.type === 'project' ? <Briefcase className="w-4 h-4 text-blue-600" /> :
                         activity.type === 'approval' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                         activity.type === 'user' ? <UserPlus className="w-4 h-4 text-purple-600" /> :
                         <Settings className="w-4 h-4 text-gray-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{activity.user}</p>
                        <p className="text-sm text-gray-500">{activity.action}</p>
                      </div>
                      <span className="text-xs text-gray-400">{activity.time}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* System Metrics */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">System Metrics</h2>
                <div className="space-y-4">
                  {systemMetrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">{metric.label}</span>
                        <span className="font-medium text-gray-900">{metric.value}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`${metric.color} h-2 rounded-full transition-all duration-500`}
                          style={{ width: `${metric.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-6 flex items-center justify-center gap-2 text-sm text-purple-600 hover:text-purple-700 py-2 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                  Refresh Metrics
                </button>
              </motion.div>
            </div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-6 text-white"
            >
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => navigate('/admin/users/new')}
                  className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <UserPlus className="w-6 h-6" />
                  <span className="text-sm">Add User</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <Database className="w-6 h-6" />
                  <span className="text-sm">Backup</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <Download className="w-6 h-6" />
                  <span className="text-sm">Export</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <Lock className="w-6 h-6" />
                  <span className="text-sm">Security</span>
                </button>
              </div>
            </motion.div>


        {/* User Management Section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  onClick={() => navigate('/admin/users/new')}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  <Plus className="w-4 h-4" />
                  Add User
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Name</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Last Login</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map(user => (
                    <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-purple-600">
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{user.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{user.email}</td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded">{user.role}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          user.status === 'active'
                            ? 'bg-green-50 text-green-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">{user.lastLogin}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button className="p-1 hover:bg-gray-100 rounded">
                            <Eye className="w-4 h-4 text-gray-500" />
                          </button>
                          <button className="p-1 hover:bg-gray-100 rounded">
                            <Edit className="w-4 h-4 text-gray-500" />
                          </button>
                          <button className="p-1 hover:bg-gray-100 rounded">
                            <Trash2 className="w-4 h-4 text-red-500" />
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