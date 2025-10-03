import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BuildingOfficeIcon,
  MapPinIcon,
  CalendarIcon,
  UserGroupIcon,
  BanknotesIcon,
  ClockIcon,
  ChartBarIcon,
  EyeIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ShoppingCartIcon,
  UserIcon,
  CurrencyRupeeIcon,
  ArrowRightIcon,
  Squares2X2Icon,
  ListBulletIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import ProcurementTracking from './ProcurementTracking';

interface Project {
  id: number;
  name: string;
  client: string;
  location: string;
  floor: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'on-hold' | 'completed' | 'delayed';
  progress: number;
  budget: number;
  spent: number;
  boqItems: number;
  completedItems: number;
  siteEngineer: string;
  teamSize: number;
  pendingProcurements: number;
  approvedBy: string;
  workingHours: string;
  priority: 'high' | 'medium' | 'low';
}

const MyProjects: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'delayed' | 'completed'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showProcurementModal, setShowProcurementModal] = useState(false);

  const projects: Project[] = [
    {
      id: 1,
      name: 'Corporate Office - Tower A',
      client: 'Tech Solutions Inc.',
      location: 'Mumbai - Bandra Kurla Complex',
      floor: '5th Floor',
      startDate: '2024-01-01',
      endDate: '2024-03-31',
      status: 'active',
      progress: 65,
      budget: 4500000,
      spent: 2925000,
      boqItems: 52,
      completedItems: 34,
      siteEngineer: 'John Smith',
      teamSize: 12,
      pendingProcurements: 5,
      approvedBy: 'Technical Director',
      workingHours: '9:00 AM - 6:00 PM',
      priority: 'high'
    },
    {
      id: 2,
      name: 'Retail Store Renovation',
      client: 'Fashion Retail Ltd.',
      location: 'Delhi - Connaught Place',
      floor: 'Ground Floor',
      startDate: '2024-01-10',
      endDate: '2024-02-28',
      status: 'delayed',
      progress: 42,
      budget: 2300000,
      spent: 966000,
      boqItems: 38,
      completedItems: 16,
      siteEngineer: 'Sarah Wilson',
      teamSize: 8,
      pendingProcurements: 8,
      approvedBy: 'Technical Director',
      workingHours: '10:00 AM - 7:00 PM',
      priority: 'medium'
    },
    {
      id: 3,
      name: 'Restaurant Interior Design',
      client: 'Gourmet Foods Pvt Ltd.',
      location: 'Bangalore - Indiranagar',
      floor: '1st Floor',
      startDate: '2023-12-15',
      endDate: '2024-01-31',
      status: 'active',
      progress: 88,
      budget: 1800000,
      spent: 1584000,
      boqItems: 28,
      completedItems: 25,
      siteEngineer: 'Mike Johnson',
      teamSize: 6,
      pendingProcurements: 2,
      approvedBy: 'Technical Director',
      workingHours: '8:00 AM - 5:00 PM',
      priority: 'low'
    },
    {
      id: 4,
      name: 'Medical Clinic Setup',
      client: 'HealthCare Plus',
      location: 'Chennai - Anna Nagar',
      floor: 'Ground Floor',
      startDate: '2024-01-08',
      endDate: '2024-04-15',
      status: 'active',
      progress: 25,
      budget: 3200000,
      spent: 800000,
      boqItems: 45,
      completedItems: 11,
      siteEngineer: 'Emily Davis',
      teamSize: 10,
      pendingProcurements: 7,
      approvedBy: 'Technical Director',
      workingHours: '9:00 AM - 6:00 PM',
      priority: 'high'
    }
  ];

  const filteredProjects = projects.filter(project =>
    filterStatus === 'all' || project.status === filterStatus
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'delayed': return 'bg-red-100 text-red-700 border-red-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'on-hold': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-50 text-red-600';
      case 'medium': return 'bg-yellow-50 text-yellow-600';
      case 'low': return 'bg-green-50 text-green-600';
      default: return 'bg-gray-50 text-gray-600';
    }
  };

  const getProgressColor = (progress: number, status: string) => {
    if (status === 'delayed') return 'bg-red-500';
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 50) return 'bg-blue-500';
    return 'bg-yellow-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <BuildingOfficeIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-blue-900">My Projects</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-blue-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Projects</p>
                <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-green-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {projects.filter(p => p.status === 'active').length}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md border border-red-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Delayed</p>
                <p className="text-2xl font-bold text-red-600">
                  {projects.filter(p => p.status === 'delayed').length}
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md border border-purple-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Budget</p>
                <p className="text-2xl font-bold text-purple-900">₹{(projects.reduce((sum, p) => sum + p.budget, 0) / 100000).toFixed(0)}L</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <BanknotesIcon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-md border border-orange-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg Progress</p>
                <p className="text-2xl font-bold text-orange-900">
                  {Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length)}%
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <ChartBarIcon className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filter Tabs and View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 inline-flex">
            {['all', 'active', 'delayed', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  filterStatus === status
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">View as:</span>
            <div className="flex items-center bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg p-1 shadow-inner">
              <button
                onClick={() => setViewMode('card')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md transition-all transform ${
                  viewMode === 'card'
                    ? 'bg-white text-blue-600 shadow-md font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <Squares2X2Icon className="w-5 h-5" />
                <span className="text-sm font-medium">Cards</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md transition-all transform ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-600 shadow-md font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                <ListBulletIcon className="w-5 h-5" />
                <span className="text-sm font-medium">Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* Projects Grid - Card View */}
        {viewMode === 'card' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all"
            >
              <div className="p-3">
                {/* Minimal Card - Essential Info Only */}

                {/* Header with Status */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-900">{project.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>

                {/* Client Info Only */}
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                  <BuildingOfficeIcon className="w-3 h-3" />
                  <span>{project.client}</span>
                  <span className="text-gray-400">•</span>
                  <MapPinIcon className="w-3 h-3" />
                  <span>{project.location.split(' - ')[1]}</span>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Overall Progress</span>
                    <span className="font-bold">{project.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getProgressColor(project.progress, project.status)}`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Simple Budget Summary */}
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded mb-3">
                  <div className="text-xs">
                    <span className="text-gray-600">Budget:</span>
                    <span className="font-bold text-gray-900 ml-1">₹{(project.budget / 100000).toFixed(1)}L</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-gray-600">Spent:</span>
                    <span className="font-bold text-blue-600 ml-1">₹{(project.spent / 100000).toFixed(1)}L</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    project.spent > project.budget ? 'bg-red-100 text-red-700' :
                    project.spent / project.budget > 0.8 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {((project.spent / project.budget) * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div className="text-center p-1.5 bg-blue-50 rounded">
                    <span className="font-bold text-blue-900">{project.completedItems}/{project.boqItems}</span>
                    <p className="text-[10px] text-gray-600">BOQ Items</p>
                  </div>
                  <div className="text-center p-1.5 bg-orange-50 rounded">
                    <span className="font-bold text-orange-900">{project.pendingProcurements}</span>
                    <p className="text-[10px] text-gray-600">Pending</p>
                  </div>
                </div>

                {/* Site Engineer Info */}
                <div className="text-xs text-gray-600 mb-3 flex items-center gap-1">
                  <UserIcon className="w-3 h-3" />
                  <span>Site Engineer:</span>
                  <span className="font-medium text-gray-900">{project.siteEngineer}</span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedProject(project);
                      setShowDetailModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                  >
                    <EyeIcon className="w-3.5 h-3.5" />
                    View Details
                  </button>
                  <button
                    onClick={() => {
                      setSelectedProject(project);
                      setShowProcurementModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
                  >
                    <ShoppingCartIcon className="w-3.5 h-3.5" />
                    Procurement
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        )}

        {/* Projects Table - List View */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Project</th>
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Client & Location</th>
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Timeline</th>
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Budget</th>
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Progress</th>
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">BOQ Items</th>
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Team</th>
                    <th className="text-left p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Status</th>
                    <th className="text-center p-4 font-semibold text-xs uppercase tracking-wider text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project, index) => (
                    <motion.tr
                      key={project.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors"
                    >
                      {/* Project Name & Priority */}
                      <td className="p-4">
                        <div className="flex items-start gap-2">
                          <BuildingOfficeIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div>
                            <p className="font-semibold text-gray-900">{project.name}</p>
                            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              project.priority === 'high' ? 'bg-red-100 text-red-700' :
                              project.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {project.priority} priority
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Client & Location */}
                      <td className="p-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-900">{project.client}</p>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPinIcon className="w-3 h-3" />
                            <span>{project.location}</span>
                          </div>
                          <p className="text-xs text-gray-500">{project.floor}</p>
                        </div>
                      </td>

                      {/* Timeline */}
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <CalendarIcon className="w-3 h-3" />
                            <span>{project.startDate}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <ClockIcon className="w-3 h-3" />
                            <span>{project.endDate}</span>
                          </div>
                          <p className="text-xs text-gray-500">{project.workingHours}</p>
                        </div>
                      </td>

                      {/* Budget */}
                      <td className="p-4">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-blue-900">₹{(project.budget / 100000).toFixed(1)}L</p>
                          <p className="text-xs text-gray-500">Spent: ₹{(project.spent / 100000).toFixed(1)}L</p>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                project.spent > project.budget ? 'bg-red-500' :
                                (project.spent / project.budget) > 0.8 ? 'bg-yellow-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${Math.min((project.spent / project.budget) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Progress */}
                      <td className="p-4">
                        <div className="space-y-2">
                          <span className="text-sm font-semibold text-gray-900">{project.progress}%</span>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                project.progress >= 80 ? 'bg-green-500' :
                                project.progress >= 50 ? 'bg-blue-500' :
                                project.progress >= 30 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* BOQ Items */}
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium">{project.completedItems}/{project.boqItems}</span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {Math.round((project.completedItems / project.boqItems) * 100)}% complete
                          </p>
                          {project.pendingProcurements > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                              <ShoppingCartIcon className="w-3 h-3" />
                              {project.pendingProcurements} pending
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Team */}
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <UserIcon className="w-3 h-3 text-gray-400" />
                            <p className="text-xs font-medium text-gray-900">{project.siteEngineer}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <UserGroupIcon className="w-3 h-3 text-gray-400" />
                            <p className="text-xs text-gray-500">{project.teamSize} members</p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-medium ${
                          project.status === 'active' ? 'bg-green-100 text-green-700 border border-green-200' :
                          project.status === 'delayed' ? 'bg-red-100 text-red-700 border border-red-200' :
                          project.status === 'on-hold' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                          'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {project.status === 'active' && <CheckCircleIcon className="w-3 h-3 mr-1" />}
                          {project.status === 'delayed' && <ExclamationTriangleIcon className="w-3 h-3 mr-1" />}
                          {project.status === 'on-hold' && <ClockIcon className="w-3 h-3 mr-1" />}
                          {project.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedProject(project);
                              setShowDetailModal(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedProject(project);
                              setShowProcurementModal(true);
                            }}
                            className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                            title="View Procurement"
                          >
                            <ShoppingCartIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              navigate('/projectManager/progress-tracking', {
                                state: { projectId: project.id }
                              });
                            }}
                            className="p-2 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors"
                            title="Track Progress"
                          >
                            <ArrowTrendingUpIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filteredProjects.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No projects found for the selected filter</p>
          </div>
        )}

        {/* Project Details Modal */}
        {showDetailModal && selectedProject && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-4xl w-full max-h-[90vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-blue-900">{selectedProject.name}</h2>
                    <p className="text-sm text-blue-700">{selectedProject.client}</p>
                  </div>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                {/* Project Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Location</p>
                    <p className="font-semibold text-gray-900">{selectedProject.location}</p>
                    <p className="text-xs text-gray-600">{selectedProject.floor}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Duration</p>
                    <p className="font-semibold text-gray-900">{selectedProject.startDate}</p>
                    <p className="text-xs text-gray-600">to {selectedProject.endDate}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Working Hours</p>
                    <p className="font-semibold text-gray-900">{selectedProject.workingHours}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Priority</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(selectedProject.priority)}`}>
                      {selectedProject.priority.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Budget Breakdown */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4 mb-6">
                  <h3 className="font-bold text-gray-900 mb-3">Budget Breakdown</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Approved BOQ Total</span>
                      <span className="text-lg font-bold text-gray-900">₹{(selectedProject.budget / 100000).toFixed(2)}L</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total Procured</span>
                      <span className="text-lg font-bold text-blue-600">₹{(selectedProject.spent / 100000).toFixed(2)}L</span>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Variance</span>
                        <span className={`text-lg font-bold ${
                          selectedProject.budget - selectedProject.spent > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {selectedProject.budget - selectedProject.spent > 0 ? 'Under by ' : 'Over by '}
                          ₹{Math.abs((selectedProject.budget - selectedProject.spent) / 100000).toFixed(2)}L
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team Assignment */}
                <div className="bg-green-50 rounded-xl p-4 mb-6">
                  <h3 className="font-bold text-gray-900 mb-3">Team Assignment</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Site Engineer</p>
                      <p className="font-semibold text-gray-900">{selectedProject.siteEngineer}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Team Size</p>
                      <p className="font-semibold text-gray-900">{selectedProject.teamSize} members</p>
                    </div>
                  </div>
                </div>

                {/* BOQ Status */}
                <div className="bg-orange-50 rounded-xl p-4">
                  <h3 className="font-bold text-gray-900 mb-3">BOQ Status</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total BOQ Items</span>
                      <span className="font-semibold">{selectedProject.boqItems}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Completed Items</span>
                      <span className="font-semibold text-green-600">{selectedProject.completedItems}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Pending Procurements</span>
                      <span className="font-semibold text-orange-600">{selectedProject.pendingProcurements}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      setShowProcurementModal(true);
                    }}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    View Procurement
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      navigate('/projectManager/progress', {
                        state: { projectId: selectedProject.id }
                      });
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Track Progress
                  </button>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Procurement Modal */}
        {showProcurementModal && selectedProject && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-green-900">Procurement Management</h2>
                  <p className="text-sm text-green-700 mt-1">
                    {selectedProject.name} - {selectedProject.client}
                  </p>
                </div>
                <button
                  onClick={() => setShowProcurementModal(false)}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-green-900" />
                </button>
              </div>

              {/* Procurement Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                <ProcurementTracking projectId={selectedProject.id} embedded={true} />
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyProjects;