import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  HardHat,
  Package,
  ClipboardList,
  Clock,
  CheckCircle,
  AlertCircle,
  Truck,
  Users,
  Activity,
  MapPin,
  Calendar,
  Tool,
  FileText,
  Camera,
  MessageSquare,
  Bell,
  TrendingUp,
  BarChart3,
  Layers,
  AlertTriangle,
  ChevronRight,
  Plus,
  Upload,
  Download,
  Eye,
  Check,
  X,
  Timer,
  Building2,
  Hammer,
  Wrench,
  Shield,
  Flag,
  Target,
  Gauge,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

const SiteEngineerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const stats = {
    assignedTasks: 12,
    completedToday: 4,
    pendingMaterials: 8,
    receivedMaterials: 45,
    activeWorkers: 15,
    safetyIncidents: 0,
    progressToday: 8.5,
    upcomingInspections: 2
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

  // Today's tasks
  const todayTasks = [
    {
      id: 1,
      title: 'Install partition walls - Section A',
      project: 'Corporate Office - 5th Floor',
      priority: 'high',
      status: 'in-progress',
      startTime: '09:00 AM',
      estimatedHours: 4,
      workersAssigned: 4,
      materials: 'Available',
      progress: 60
    },
    {
      id: 2,
      title: 'Electrical wiring - Conference room',
      project: 'Corporate Office - 5th Floor',
      priority: 'medium',
      status: 'pending',
      startTime: '02:00 PM',
      estimatedHours: 3,
      workersAssigned: 2,
      materials: 'Partial',
      progress: 0
    },
    {
      id: 3,
      title: 'Floor finishing - Reception area',
      project: 'Corporate Office - 5th Floor',
      priority: 'medium',
      status: 'completed',
      startTime: '08:00 AM',
      estimatedHours: 2,
      workersAssigned: 3,
      materials: 'Available',
      progress: 100
    },
    {
      id: 4,
      title: 'HVAC installation check',
      project: 'Corporate Office - 5th Floor',
      priority: 'low',
      status: 'pending',
      startTime: '04:00 PM',
      estimatedHours: 1,
      workersAssigned: 2,
      materials: 'Available',
      progress: 0
    }
  ];

  // Material requests
  const materialRequests = [
    {
      id: 1,
      item: 'Glass Panels (10mm)',
      quantity: '20 units',
      status: 'pending',
      requestedDate: '2024-01-15',
      requiredBy: '2024-01-17',
      priority: 'high'
    },
    {
      id: 2,
      item: 'Aluminum Frames',
      quantity: '15 pieces',
      status: 'approved',
      requestedDate: '2024-01-14',
      requiredBy: '2024-01-16',
      priority: 'medium'
    },
    {
      id: 3,
      item: 'Electrical Cables',
      quantity: '100 meters',
      status: 'in-transit',
      requestedDate: '2024-01-13',
      requiredBy: '2024-01-15',
      priority: 'high'
    }
  ];

  // Worker attendance
  const workerAttendance = [
    { name: 'Team A - Carpenters', present: 4, absent: 0, total: 4 },
    { name: 'Team B - Electricians', present: 3, absent: 1, total: 4 },
    { name: 'Team C - Painters', present: 3, absent: 0, total: 3 },
    { name: 'Team D - Helpers', present: 5, absent: 1, total: 6 }
  ];

  // Safety checklist
  const safetyChecklist = [
    { item: 'Safety equipment check', status: 'completed', time: '07:30 AM' },
    { item: 'Site inspection', status: 'completed', time: '08:00 AM' },
    { item: 'Tool inspection', status: 'pending', time: 'Scheduled 12:00 PM' },
    { item: 'End-of-day safety review', status: 'pending', time: 'Scheduled 06:00 PM' }
  ];

  const handleTaskUpdate = (taskId: number, status: string) => {
    toast.success(`Task ${status} successfully`);
  };

  const handleMaterialRequest = (itemId: number) => {
    toast.success('Material request submitted');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <HardHat className="w-8 h-8 text-orange-600" />
                Site Engineer Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Corporate Office - 5th Floor, Prestige Tech Park
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">{stats.safetyIncidents} Incidents Today</span>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Camera className="w-5 h-5 text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'Site Engineer'}</p>
                  <p className="text-xs text-gray-500">On-Site Coordinator</p>
                </div>
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <HardHat className="w-5 h-5 text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-6 mt-6">
            {['overview', 'tasks', 'materials', 'workers', 'safety', 'reports'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-1 border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-orange-600 text-orange-600 font-medium'
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
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <ClipboardList className="w-6 h-6 text-orange-600" />
                  </div>
                  <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
                    {stats.assignedTasks - stats.completedToday} pending
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.assignedTasks}</h3>
                <p className="text-sm text-gray-500 mt-1">Tasks Today</p>
                <p className="text-xs text-green-600 mt-2">{stats.completedToday} completed</p>
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
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.pendingMaterials}</h3>
                <p className="text-sm text-gray-500 mt-1">Pending Materials</p>
                <p className="text-xs text-gray-400 mt-2">{stats.receivedMaterials} received this week</p>
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
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                  <Activity className="w-5 h-5 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.activeWorkers}</h3>
                <p className="text-sm text-gray-500 mt-1">Workers On-Site</p>
                <p className="text-xs text-gray-400 mt-2">All teams active</p>
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
                    <Gauge className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> +{stats.progressToday}%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">On Track</h3>
                <p className="text-sm text-gray-500 mt-1">Today's Progress</p>
                <p className="text-xs text-gray-400 mt-2">{stats.upcomingInspections} inspections due</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Today's Tasks */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Today's Tasks</h2>
                  <button className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700">
                    <Plus className="w-4 h-4" />
                    Add Task
                  </button>
                </div>
                <div className="space-y-4">
                  {todayTasks.map((task) => (
                    <div key={task.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{task.title}</h3>
                          <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            {task.startTime} • {task.estimatedHours} hours
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          task.status === 'completed' ? 'bg-green-50 text-green-600' :
                          task.status === 'in-progress' ? 'bg-blue-50 text-blue-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {task.status === 'in-progress' ? 'In Progress' : task.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-gray-400" />
                          <span className="text-gray-600">{task.workersAssigned} workers</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Package className="w-3 h-3 text-gray-400" />
                          <span className={`${
                            task.materials === 'Available' ? 'text-green-600' : 'text-yellow-600'
                          }`}>
                            {task.materials}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Flag className={`w-3 h-3 ${
                            task.priority === 'high' ? 'text-red-500' :
                            task.priority === 'medium' ? 'text-yellow-500' :
                            'text-gray-400'
                          }`} />
                          <span className="text-gray-600">{task.priority} priority</span>
                        </div>
                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            task.status === 'completed' ? 'bg-green-500' :
                            task.status === 'in-progress' ? 'bg-blue-500' :
                            'bg-gray-300'
                          }`}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>

                      {task.status !== 'completed' && (
                        <div className="flex gap-2">
                          {task.status === 'pending' ? (
                            <button
                              onClick={() => handleTaskUpdate(task.id, 'started')}
                              className="flex-1 text-xs py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                            >
                              Start Task
                            </button>
                          ) : (
                            <button
                              onClick={() => handleTaskUpdate(task.id, 'completed')}
                              className="flex-1 text-xs py-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100"
                            >
                              Mark Complete
                            </button>
                          )}
                          <button className="flex-1 text-xs py-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">
                            Add Note
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Material Requests */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
                >
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Material Status</h2>
                  <div className="space-y-3">
                    {materialRequests.map((item) => (
                      <div key={item.id} className="p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-900">{item.item}</h4>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            item.status === 'pending' ? 'bg-yellow-50 text-yellow-600' :
                            item.status === 'approved' ? 'bg-green-50 text-green-600' :
                            'bg-blue-50 text-blue-600'
                          }`}>
                            {item.status === 'in-transit' ? 'In Transit' : item.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">Qty: {item.quantity}</p>
                        <p className="text-xs text-gray-500">Required by: {item.requiredBy}</p>
                        {item.status === 'in-transit' && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                            <Truck className="w-3 h-3" />
                            <span>Expected today</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleMaterialRequest(1)}
                    className="w-full mt-4 flex items-center justify-center gap-2 text-sm text-orange-600 hover:text-orange-700 py-2 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Request Material
                  </button>
                </motion.div>

                {/* Safety Checklist */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
                >
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Safety Checklist</h2>
                  <div className="space-y-2">
                    {safetyChecklist.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            item.status === 'completed' ? 'bg-green-100' : 'bg-gray-100'
                          }`}>
                            {item.status === 'completed' ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <div className="w-2 h-2 bg-gray-400 rounded-full" />
                            )}
                          </div>
                          <span className={`text-sm ${
                            item.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'
                          }`}>
                            {item.item}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Worker Attendance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Worker Attendance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {workerAttendance.map((team) => (
                  <div key={team.name} className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">{team.name}</h4>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">Present</span>
                      <span className="text-sm font-medium text-green-600">{team.present}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">Absent</span>
                      <span className="text-sm font-medium text-red-600">{team.absent}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Attendance</span>
                        <span className="text-sm font-medium text-gray-900">
                          {((team.present / team.total) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}

        {activeTab === 'tasks' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">All Tasks</h2>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Calendar className="w-4 h-4" />
                  Today
                </button>
                <button className="flex items-center gap-2 px-4 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                  <Plus className="w-4 h-4" />
                  New Task
                </button>
              </div>
            </div>
            {/* Extended tasks list would go here */}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SiteEngineerDashboard;