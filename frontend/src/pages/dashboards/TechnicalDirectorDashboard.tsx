import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  TrendingUp,
  CheckSquare,
  AlertCircle,
  FileText,
  Users,
  Building2,
  DollarSign,
  Clock,
  Package,
  BarChart3,
  PieChart,
  Target,
  Activity,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  CheckCircle,
  XCircle,
  Filter,
  Calendar,
  Download,
  Bell,
  Settings,
  ClipboardList,
  Layers,
  Shield,
  Award,
  GitBranch,
  Zap,
  Flag,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

const TechnicalDirectorDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedProject, setSelectedProject] = useState<any>(null);

  const stats = {
    pendingApprovals: 5,
    activeProjects: 8,
    completedThisMonth: 3,
    totalProjectValue: 8750000,
    avgApprovalTime: '2.5 days',
    successRate: 94
  };

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

  // Pending approvals data
  const pendingApprovals = [
    {
      id: 1,
      projectName: 'Corporate Office - 5th Floor',
      estimator: 'John Doe',
      value: 3440000,
      items: 45,
      submittedDate: '2024-01-15',
      priority: 'high',
      profitMargin: 28
    },
    {
      id: 2,
      projectName: 'Retail Store Renovation',
      estimator: 'Jane Smith',
      value: 1250000,
      items: 23,
      submittedDate: '2024-01-14',
      priority: 'medium',
      profitMargin: 22
    },
    {
      id: 3,
      projectName: 'Restaurant Interior',
      estimator: 'Mike Johnson',
      value: 890000,
      items: 18,
      submittedDate: '2024-01-13',
      priority: 'low',
      profitMargin: 25
    }
  ];

  // Active projects overview
  const activeProjects = [
    {
      id: 1,
      name: 'Tech Park Building A',
      pm: 'Sarah Wilson',
      progress: 65,
      budget: 5600000,
      spent: 3640000,
      status: 'on-track',
      dueDate: '2024-02-28'
    },
    {
      id: 2,
      name: 'Mall Extension Project',
      pm: 'Robert Brown',
      progress: 42,
      budget: 8900000,
      spent: 3738000,
      status: 'delayed',
      dueDate: '2024-03-15'
    },
    {
      id: 3,
      name: 'Hospital Wing Renovation',
      pm: 'Emily Davis',
      progress: 88,
      budget: 3200000,
      spent: 2816000,
      status: 'on-track',
      dueDate: '2024-01-31'
    }
  ];

  // Performance metrics
  const performanceMetrics = [
    { label: 'Project Success Rate', value: 94, target: 90, color: 'text-green-600' },
    { label: 'On-Time Delivery', value: 87, target: 85, color: 'text-blue-600' },
    { label: 'Budget Adherence', value: 92, target: 95, color: 'text-yellow-600' },
    { label: 'Client Satisfaction', value: 96, target: 90, color: 'text-purple-600' }
  ];

  const handleApproval = (projectId: number, approved: boolean) => {
    const action = approved ? 'approved' : 'rejected';
    toast.success(`Project ${action} successfully`);
    // Handle actual approval logic here
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Briefcase className="w-8 h-8 text-blue-600" />
                Technical Director Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">Review, approve, and oversee all projects</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-700">{stats.pendingApprovals} Pending Approvals</span>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'Director'}</p>
                  <p className="text-xs text-gray-500">Technical Director</p>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-6 mt-6">
            {['overview', 'approvals', 'projects', 'analytics', 'teams'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-1 border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <>
            {/* Key Metrics */}
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
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="w-6 h-6 text-yellow-600" />
                  </div>
                  <Flag className="w-5 h-5 text-yellow-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.pendingApprovals}</h3>
                <p className="text-sm text-gray-500 mt-1">Pending Approvals</p>
                <p className="text-xs text-yellow-600 mt-2">Action required</p>
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
                    <ArrowUpRight className="w-3 h-3" /> Active
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.activeProjects}</h3>
                <p className="text-sm text-gray-500 mt-1">Active Projects</p>
                <p className="text-xs text-gray-400 mt-2">{stats.completedThisMonth} completed this month</p>
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
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">₹{(stats.totalProjectValue / 100000).toFixed(1)}L</h3>
                <p className="text-sm text-gray-500 mt-1">Total Project Value</p>
                <p className="text-xs text-gray-400 mt-2">This quarter</p>
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
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Award className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-xs font-medium text-purple-600">{stats.successRate}%</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Excellent</h3>
                <p className="text-sm text-gray-500 mt-1">Success Rate</p>
                <p className="text-xs text-gray-400 mt-2">Above target</p>
              </motion.div>
            </div>

            {/* Pending Approvals Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  Pending Estimations for Approval
                </h2>
                <button className="text-sm text-blue-600 hover:text-blue-700">View all</button>
              </div>
              <div className="space-y-4">
                {pendingApprovals.map((project) => (
                  <div key={project.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{project.projectName}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            project.priority === 'high' ? 'bg-red-50 text-red-600' :
                            project.priority === 'medium' ? 'bg-yellow-50 text-yellow-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {project.priority} priority
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Estimator:</span>
                            <p className="font-medium text-gray-900">{project.estimator}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Project Value:</span>
                            <p className="font-medium text-gray-900">₹{(project.value / 100000).toFixed(1)}L</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Profit Margin:</span>
                            <p className="font-medium text-green-600">{project.profitMargin}%</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Items:</span>
                            <p className="font-medium text-gray-900">{project.items} items</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setSelectedProject(project)}
                          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleApproval(project.id, true)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        >
                          <ThumbsUp className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleApproval(project.id, false)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <ThumbsDown className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Performance Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Performance Metrics</h2>
                <div className="space-y-4">
                  {performanceMetrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">{metric.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${metric.color}`}>{metric.value}%</span>
                          <span className="text-xs text-gray-400">/ {metric.target}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 relative">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            metric.value >= metric.target ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                          style={{ width: `${metric.value}%` }}
                        />
                        <div
                          className="absolute top-0 h-2 w-0.5 bg-gray-600"
                          style={{ left: `${metric.target}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Active Projects Status</h2>
                <div className="space-y-3">
                  {activeProjects.slice(0, 3).map((project) => (
                    <div key={project.id} className="p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{project.name}</h4>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          project.status === 'on-track' ? 'bg-green-50 text-green-600' :
                          'bg-red-50 text-red-600'
                        }`}>
                          {project.status === 'on-track' ? 'On Track' : 'Delayed'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mb-2">PM: {project.pm}</div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            project.status === 'on-track' ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-gray-500">
                        <span>{project.progress}% Complete</span>
                        <span>Due: {project.dueDate}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </>
        )}

        {activeTab === 'approvals' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">All Pending Approvals</h2>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Filter className="w-4 h-4" />
                  Filter
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Calendar className="w-4 h-4" />
                  Date Range
                </button>
              </div>
            </div>
            {/* Extended approvals list would go here */}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default TechnicalDirectorDashboard;