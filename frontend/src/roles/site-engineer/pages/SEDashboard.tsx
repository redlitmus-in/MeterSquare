import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BuildingOfficeIcon,
  ClipboardDocumentCheckIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  ChartBarIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

const SEDashboard: React.FC = () => {
  const navigate = useNavigate();

  // Dashboard stats
  const stats = {
    todayTasks: 8,
    completedTasks: 5,
    pendingTasks: 3,
    materialsUsedToday: 12,
    issuesReported: 2,
    projectProgress: 68
  };

  // Assigned Project
  const assignedProject = {
    id: 1,
    name: 'Corporate Office - Tower A',
    client: 'Tech Solutions Inc.',
    location: 'Mumbai - Bandra Kurla Complex',
    floor: '5th Floor',
    assignedBy: 'Sarah Johnson (PM)',
    startDate: '2024-01-01',
    progress: 68,
    totalBOQItems: 52,
    completedBOQItems: 35
  };

  // Today's tasks
  const todayTasks = [
    {
      id: 1,
      boqItem: 'Glass Partition Wall - Section A',
      status: 'completed',
      progress: 100,
      startTime: '09:00 AM',
      completedTime: '11:30 AM'
    },
    {
      id: 2,
      boqItem: 'Electrical Wiring - Conference Room',
      status: 'in-progress',
      progress: 65,
      startTime: '11:45 AM',
      completedTime: null
    },
    {
      id: 3,
      boqItem: 'False Ceiling - Reception Area',
      status: 'pending',
      progress: 0,
      startTime: null,
      completedTime: null
    }
  ];

  // Recent material usage
  const recentMaterialUsage = [
    { material: 'Glass Panel 10mm', quantity: 15, unit: 'sqft', time: '10:30 AM', boqItem: 'Glass Partition Wall' },
    { material: 'Aluminum Frame', quantity: 8, unit: 'pcs', time: '11:00 AM', boqItem: 'Glass Partition Wall' },
    { material: 'Electrical Wire 2.5mm', quantity: 25, unit: 'meter', time: '12:15 PM', boqItem: 'Electrical Wiring' }
  ];

  // Recent issues
  const recentIssues = [
    {
      id: 1,
      title: 'Material shortage - Ceiling tiles',
      priority: 'high',
      status: 'acknowledged',
      reportedAt: '1 hour ago'
    },
    {
      id: 2,
      title: 'Quality issue - Glass panels damaged',
      priority: 'medium',
      status: 'resolved',
      reportedAt: '3 hours ago'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
              <BuildingOfficeIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-orange-900">Site Engineer Dashboard</h1>
              <p className="text-sm text-orange-700 mt-1">Welcome back! Here's your work overview</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ClipboardDocumentCheckIcon className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                {stats.completedTasks}/{stats.todayTasks}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.todayTasks}</h3>
            <p className="text-sm text-gray-500 mt-1">Today's Tasks</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <CubeIcon className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.materialsUsedToday}</h3>
            <p className="text-sm text-gray-500 mt-1">Materials Used Today</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.issuesReported}</h3>
            <p className="text-sm text-gray-500 mt-1">Issues Reported</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ChartBarIcon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{stats.projectProgress}%</h3>
            <p className="text-sm text-gray-500 mt-1">Project Progress</p>
          </motion.div>
        </div>

        {/* Assigned Project Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">My Assigned Project</h2>
              <p className="text-sm text-gray-500 mt-1">Project you're currently working on</p>
            </div>
            <button
              onClick={() => navigate('/siteEngineer/my-project')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              View Details
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <BuildingOfficeIcon className="w-8 h-8 text-blue-600" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{assignedProject.name}</h3>
                  <p className="text-sm text-gray-500">{assignedProject.client}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPinIcon className="w-4 h-4" />
                  <span>{assignedProject.location}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <UserIcon className="w-4 h-4" />
                  <span>Assigned by: {assignedProject.assignedBy}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CalendarIcon className="w-4 h-4" />
                  <span>Started: {assignedProject.startDate}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Project Progress</span>
                  <span className="text-lg font-bold text-blue-900">{assignedProject.progress}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-3 mb-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all"
                    style={{ width: `${assignedProject.progress}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white rounded p-2">
                    <p className="text-gray-500">BOQ Items</p>
                    <p className="font-bold text-gray-900">{assignedProject.totalBOQItems}</p>
                  </div>
                  <div className="bg-white rounded p-2">
                    <p className="text-gray-500">Completed</p>
                    <p className="font-bold text-green-600">{assignedProject.completedBOQItems}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Tasks */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Today's Tasks</h2>
              <button
                onClick={() => navigate('/siteEngineer/task-execution')}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View All
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {todayTasks.map((task) => (
                <div key={task.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{task.boqItem}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      task.status === 'completed' ? 'bg-green-100 text-green-700' :
                      task.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {task.status === 'in-progress' ? 'In Progress' : task.status}
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className={`h-2 rounded-full ${
                        task.status === 'completed' ? 'bg-green-500' :
                        task.status === 'in-progress' ? 'bg-blue-500' :
                        'bg-gray-300'
                      }`}
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {task.startTime && (
                      <div className="flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        Started: {task.startTime}
                      </div>
                    )}
                    {task.completedTime && (
                      <div className="flex items-center gap-1">
                        <CheckCircleSolid className="w-3 h-3 text-green-600" />
                        {task.completedTime}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent Material Usage & Issues */}
          <div className="space-y-6">
            {/* Material Usage */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Recent Material Usage</h2>
                <button
                  onClick={() => navigate('/siteEngineer/material-usage')}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View All
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {recentMaterialUsage.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.material}</p>
                      <p className="text-xs text-gray-500">{item.boqItem}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{item.quantity} {item.unit}</p>
                      <p className="text-xs text-gray-500">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Recent Issues */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Recent Issues</h2>
                <button
                  onClick={() => navigate('/siteEngineer/report-issue')}
                  className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  Report New
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {recentIssues.map((issue) => (
                  <div key={issue.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-900">{issue.title}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        issue.priority === 'high' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {issue.priority}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`px-2 py-1 rounded ${
                        issue.status === 'resolved' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {issue.status}
                      </span>
                      <span className="text-gray-500">{issue.reportedAt}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SEDashboard;
