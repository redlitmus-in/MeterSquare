import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Briefcase,
  DollarSign,
  Clock,
  Package,
  TrendingUp,
  Activity,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Calendar,
  Target,
  Truck,
  ClipboardList,
  FileText,
  Settings,
  Bell,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Edit,
  MessageSquare,
  UserCheck,
  ShoppingCart,
  Layers,
  Zap,
  Flag,
  PieChart,
  Timer,
  HardHat,
  Building2,
  MapPin,
  Percent,
  GitBranch,
  AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

const ProjectManagerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedProject, setSelectedProject] = useState<any>(null);

  const stats = {
    activeProjects: 4,
    totalTeamMembers: 18,
    pendingProcurements: 12,
    totalBudget: 12500000,
    budgetUtilized: 7850000,
    onTimeDelivery: 92,
    avgProgress: 58,
    upcomingDeadlines: 3
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

  // Active projects data
  const activeProjects = [
    {
      id: 1,
      name: 'Corporate Office - 5th Floor',
      client: 'Tech Solutions Ltd',
      location: 'Prestige Tech Park',
      progress: 65,
      budget: 3440000,
      spent: 2236000,
      status: 'on-track',
      team: 6,
      siteEngineer: 'John Smith',
      startDate: '2024-01-01',
      dueDate: '2024-03-31',
      tasks: { total: 45, completed: 29 },
      materials: { ordered: 125, received: 98 }
    },
    {
      id: 2,
      name: 'Retail Store Renovation',
      client: 'Fashion Hub',
      location: 'City Mall',
      progress: 42,
      budget: 1250000,
      spent: 525000,
      status: 'delayed',
      team: 4,
      siteEngineer: 'Sarah Wilson',
      startDate: '2024-01-10',
      dueDate: '2024-02-28',
      tasks: { total: 23, completed: 10 },
      materials: { ordered: 67, received: 45 }
    },
    {
      id: 3,
      name: 'Restaurant Interior',
      client: 'Gourmet Foods',
      location: 'Downtown Plaza',
      progress: 88,
      budget: 890000,
      spent: 783200,
      status: 'on-track',
      team: 3,
      siteEngineer: 'Mike Johnson',
      startDate: '2023-12-15',
      dueDate: '2024-01-31',
      tasks: { total: 18, completed: 16 },
      materials: { ordered: 45, received: 42 }
    },
    {
      id: 4,
      name: 'Medical Clinic Setup',
      client: 'HealthCare Plus',
      location: 'Medical District',
      progress: 25,
      budget: 2100000,
      spent: 525000,
      status: 'on-track',
      team: 5,
      siteEngineer: 'Emily Davis',
      startDate: '2024-01-08',
      dueDate: '2024-04-15',
      tasks: { total: 32, completed: 8 },
      materials: { ordered: 89, received: 32 }
    }
  ];

  // Pending procurements
  const pendingProcurements = [
    {
      id: 1,
      item: 'Glass Panels (10mm)',
      project: 'Corporate Office',
      quantity: '120 sqft',
      estimatedCost: 60000,
      requestedBy: 'John Smith',
      priority: 'high',
      daysAgo: 1
    },
    {
      id: 2,
      item: 'Aluminum Frames',
      project: 'Retail Store',
      quantity: '80 rft',
      estimatedCost: 25600,
      requestedBy: 'Sarah Wilson',
      priority: 'medium',
      daysAgo: 2
    },
    {
      id: 3,
      item: 'Wood Panels',
      project: 'Restaurant',
      quantity: '45 units',
      estimatedCost: 30600,
      requestedBy: 'Mike Johnson',
      priority: 'low',
      daysAgo: 3
    }
  ];

  // Team performance
  const teamPerformance = [
    { name: 'John Smith', role: 'Site Engineer', efficiency: 94, projects: 2 },
    { name: 'Sarah Wilson', role: 'Site Engineer', efficiency: 87, projects: 1 },
    { name: 'Mike Johnson', role: 'Site Engineer', efficiency: 91, projects: 1 },
    { name: 'Emily Davis', role: 'Site Engineer', efficiency: 89, projects: 1 }
  ];

  const handleProcurementAction = (id: number, action: string) => {
    toast.success(`Procurement ${action} successfully`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-8 h-8 text-green-600" />
                Project Manager Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">Manage projects, teams, and procurement</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-700">{stats.pendingProcurements} Pending Items</span>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'Project Manager'}</p>
                  <p className="text-xs text-gray-500">Project Coordinator</p>
                </div>
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-6 mt-6">
            {['overview', 'projects', 'procurement', 'team', 'reports'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-1 border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-green-600 text-green-600 font-medium'
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
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Briefcase className="w-6 h-6 text-green-600" />
                  </div>
                  <Activity className="w-5 h-5 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.activeProjects}</h3>
                <p className="text-sm text-gray-500 mt-1">Active Projects</p>
                <p className="text-xs text-gray-400 mt-2">{stats.upcomingDeadlines} deadlines this week</p>
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
                    <DollarSign className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="text-xs font-medium text-blue-600">
                    {((stats.budgetUtilized / stats.totalBudget) * 100).toFixed(0)}%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">₹{(stats.budgetUtilized / 100000).toFixed(1)}L</h3>
                <p className="text-sm text-gray-500 mt-1">Budget Utilized</p>
                <p className="text-xs text-gray-400 mt-2">of ₹{(stats.totalBudget / 100000).toFixed(1)}L total</p>
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
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Package className="w-6 h-6 text-yellow-600" />
                  </div>
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.pendingProcurements}</h3>
                <p className="text-sm text-gray-500 mt-1">Pending Items</p>
                <p className="text-xs text-yellow-600 mt-2">Approval required</p>
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
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                    {stats.onTimeDelivery}%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalTeamMembers}</h3>
                <p className="text-sm text-gray-500 mt-1">Team Members</p>
                <p className="text-xs text-gray-400 mt-2">Across all projects</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Active Projects */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Active Projects</h2>
                  <button className="text-sm text-green-600 hover:text-green-700">View all</button>
                </div>
                <div className="space-y-4">
                  {activeProjects.map((project) => (
                    <div key={project.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{project.name}</h3>
                          <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3" /> {project.location}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          project.status === 'on-track' ? 'bg-green-50 text-green-600' :
                          'bg-red-50 text-red-600'
                        }`}>
                          {project.status === 'on-track' ? 'On Track' : 'Delayed'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                        <div>
                          <span className="text-gray-500">Progress:</span>
                          <p className="font-medium text-gray-900">{project.progress}%</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Budget Used:</span>
                          <p className="font-medium text-gray-900">
                            {((project.spent / project.budget) * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Team:</span>
                          <p className="font-medium text-gray-900">{project.team} members</p>
                        </div>
                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            project.status === 'on-track' ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Tasks: {project.tasks.completed}/{project.tasks.total}</span>
                        <span>Materials: {project.materials.received}/{project.materials.ordered}</span>
                        <span>Due: {project.dueDate}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Pending Procurements */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Pending Procurements</h2>
                <div className="space-y-3">
                  {pendingProcurements.slice(0, 3).map((item) => (
                    <div key={item.id} className="p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-900">{item.item}</h4>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          item.priority === 'high' ? 'bg-red-50 text-red-600' :
                          item.priority === 'medium' ? 'bg-yellow-50 text-yellow-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {item.priority}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">{item.project}</p>
                      <p className="text-xs text-gray-500 mb-2">Qty: {item.quantity} • ₹{(item.estimatedCost / 1000).toFixed(0)}k</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleProcurementAction(item.id, 'approved')}
                          className="flex-1 text-xs py-1 bg-green-50 text-green-600 rounded hover:bg-green-100"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleProcurementAction(item.id, 'reviewed')}
                          className="flex-1 text-xs py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-4 text-sm text-green-600 hover:text-green-700 py-2 border border-green-200 rounded-lg hover:bg-green-50 transition-colors">
                  View All Procurements
                </button>
              </motion.div>
            </div>

            {/* Team Performance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Team Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {teamPerformance.map((member) => (
                  <div key={member.name} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <HardHat className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{member.name}</h4>
                        <p className="text-xs text-gray-500">{member.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Efficiency:</span>
                      <span className={`font-medium ${
                        member.efficiency >= 90 ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {member.efficiency}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full ${
                          member.efficiency >= 90 ? 'bg-green-500' : 'bg-yellow-500'
                        }`}
                        style={{ width: `${member.efficiency}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}

        {activeTab === 'projects' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">All Projects</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                <Briefcase className="w-4 h-4" />
                View Details
              </button>
            </div>
            {/* Extended projects list would go here */}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ProjectManagerDashboard;