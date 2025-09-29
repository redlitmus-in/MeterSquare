import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  DocumentTextIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ArrowTrendingUpIcon,
  FlagIcon,
  BellIcon,
  CameraIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface Task {
  id: number;
  name: string;
  boqItem: string;
  assignedTo: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'in-progress' | 'completed' | 'delayed';
  progress: number;
  priority: 'high' | 'medium' | 'low';
  dependencies?: string[];
  issues?: Issue[];
}

interface Issue {
  id: number;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  reportedBy: string;
  reportedDate: string;
  status: 'open' | 'resolved';
}

interface Project {
  id: number;
  name: string;
  client: string;
  overallProgress: number;
  tasksTotal: number;
  tasksCompleted: number;
  onSchedule: boolean;
  daysRemaining: number;
  milestones: Milestone[];
  tasks: Task[];
}

interface Milestone {
  id: number;
  name: string;
  dueDate: string;
  status: 'upcoming' | 'in-progress' | 'completed' | 'overdue';
  progress: number;
}

const ProgressTracking: React.FC = () => {
  const [selectedProject] = useState<number>(1);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const project: Project = {
    id: 1,
    name: 'Corporate Office - Tower A',
    client: 'Tech Solutions Inc.',
    overallProgress: 65,
    tasksTotal: 45,
    tasksCompleted: 29,
    onSchedule: false,
    daysRemaining: 35,
    milestones: [
      {
        id: 1,
        name: 'Site Preparation',
        dueDate: '2024-01-15',
        status: 'completed',
        progress: 100
      },
      {
        id: 2,
        name: 'Structural Work',
        dueDate: '2024-02-01',
        status: 'completed',
        progress: 100
      },
      {
        id: 3,
        name: 'Interior Fitout',
        dueDate: '2024-03-01',
        status: 'in-progress',
        progress: 60
      },
      {
        id: 4,
        name: 'Final Handover',
        dueDate: '2024-03-31',
        status: 'upcoming',
        progress: 0
      }
    ],
    tasks: [
      {
        id: 1,
        name: 'Install Glass Partitions',
        boqItem: 'PW-01',
        assignedTo: 'John Smith',
        startDate: '2024-01-20',
        endDate: '2024-02-05',
        status: 'in-progress',
        progress: 75,
        priority: 'high',
        issues: [
          {
            id: 1,
            description: 'Glass panels delayed from vendor',
            severity: 'major',
            reportedBy: 'Site Engineer',
            reportedDate: '2024-01-25',
            status: 'open'
          }
        ]
      },
      {
        id: 2,
        name: 'False Ceiling Installation',
        boqItem: 'FC-02',
        assignedTo: 'Sarah Wilson',
        startDate: '2024-01-25',
        endDate: '2024-02-10',
        status: 'in-progress',
        progress: 40,
        priority: 'medium'
      },
      {
        id: 3,
        name: 'Electrical Wiring',
        boqItem: 'EL-03',
        assignedTo: 'Mike Johnson',
        startDate: '2024-02-01',
        endDate: '2024-02-20',
        status: 'pending',
        progress: 0,
        priority: 'high',
        dependencies: ['False Ceiling Installation']
      },
      {
        id: 4,
        name: 'Paint Work',
        boqItem: 'PT-04',
        assignedTo: 'Emily Davis',
        startDate: '2024-01-10',
        endDate: '2024-01-20',
        status: 'completed',
        progress: 100,
        priority: 'low'
      },
      {
        id: 5,
        name: 'Flooring Installation',
        boqItem: 'FL-05',
        assignedTo: 'John Smith',
        startDate: '2024-01-15',
        endDate: '2024-01-30',
        status: 'delayed',
        progress: 85,
        priority: 'high',
        issues: [
          {
            id: 2,
            description: 'Material quality issue - needs replacement',
            severity: 'critical',
            reportedBy: 'Quality Inspector',
            reportedDate: '2024-01-28',
            status: 'open'
          }
        ]
      }
    ]
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'in-progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'delayed': return 'bg-red-100 text-red-700 border-red-200';
      case 'upcoming': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'major': return 'bg-orange-500';
      case 'minor': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-blue-900">Progress Tracking</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Project Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{project.name}</h2>
              <p className="text-sm text-gray-600">{project.client}</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-500">Overall Progress</p>
                <p className="text-2xl font-bold text-blue-600">{project.overallProgress}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Tasks Completed</p>
                <p className="text-2xl font-bold text-green-600">{project.tasksCompleted}/{project.tasksTotal}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Days Remaining</p>
                <p className="text-2xl font-bold text-orange-600">{project.daysRemaining}</p>
              </div>
              <div className={`px-4 py-2 rounded-lg ${project.onSchedule ? 'bg-green-100' : 'bg-red-100'}`}>
                <p className="text-xs text-gray-600">Status</p>
                <p className={`text-sm font-bold ${project.onSchedule ? 'text-green-700' : 'text-red-700'}`}>
                  {project.onSchedule ? 'On Schedule' : 'Delayed'}
                </p>
              </div>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-gradient-to-r from-blue-50 to-blue-100 h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
              style={{ width: `${project.overallProgress}%` }}
            >
              <span className="text-xs text-white font-medium">{project.overallProgress}%</span>
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Project Milestones</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {project.milestones.map((milestone) => (
              <motion.div
                key={milestone.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg border-2 ${
                  milestone.status === 'completed' ? 'border-green-200 bg-green-50' :
                  milestone.status === 'in-progress' ? 'border-blue-200 bg-blue-50' :
                  milestone.status === 'overdue' ? 'border-red-200 bg-red-50' :
                  'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <FlagIcon className={`w-5 h-5 ${
                    milestone.status === 'completed' ? 'text-green-600' :
                    milestone.status === 'in-progress' ? 'text-blue-600' :
                    milestone.status === 'overdue' ? 'text-red-600' :
                    'text-gray-600'
                  }`} />
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(milestone.status)}`}>
                    {milestone.status}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{milestone.name}</h4>
                <p className="text-xs text-gray-600 mb-2">Due: {milestone.dueDate}</p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      milestone.status === 'completed' ? 'bg-green-500' :
                      milestone.status === 'in-progress' ? 'bg-blue-500' :
                      'bg-gray-400'
                    }`}
                    style={{ width: `${milestone.progress}%` }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Tasks Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tasks List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Task Progress</h3>
              <div className="space-y-3">
                {project.tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => setSelectedTask(task)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                      selectedTask?.id === task.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-gray-900">{task.name}</h4>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>BOQ: {task.boqItem}</span>
                          <span>Assigned: {task.assignedTo}</span>
                          <span>Due: {task.endDate}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{task.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            task.status === 'completed' ? 'bg-green-500' :
                            task.status === 'delayed' ? 'bg-red-500' :
                            task.status === 'in-progress' ? 'bg-blue-500' :
                            'bg-gray-400'
                          }`}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Issues Indicator */}
                    {task.issues && task.issues.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />
                        <span className="text-orange-600">{task.issues.length} issue(s)</span>
                        {task.issues.map((issue) => (
                          <span key={issue.id} className={`w-2 h-2 rounded-full ${getSeverityColor(issue.severity)}`} />
                        ))}
                      </div>
                    )}

                    {/* Dependencies */}
                    {task.dependencies && task.dependencies.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Dependencies: {task.dependencies.join(', ')}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Task Details & Update */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Task Details</h3>

              {selectedTask ? (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900">{selectedTask.name}</h4>
                    <p className="text-xs text-blue-700 mt-1">BOQ Item: {selectedTask.boqItem}</p>
                  </div>

                  {/* Task Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Assigned To:</span>
                      <span className="font-medium">{selectedTask.assignedTo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start Date:</span>
                      <span className="font-medium">{selectedTask.startDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">End Date:</span>
                      <span className="font-medium">{selectedTask.endDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(selectedTask.status)}`}>
                        {selectedTask.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Priority:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(selectedTask.priority)}`}>
                        {selectedTask.priority}
                      </span>
                    </div>
                  </div>

                  {/* Issues */}
                  {selectedTask.issues && selectedTask.issues.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 mb-2">Issues</h5>
                      <div className="space-y-2">
                        {selectedTask.issues.map((issue) => (
                          <div key={issue.id} className="p-2 bg-orange-50 rounded-lg border border-orange-200">
                            <div className="flex items-start justify-between mb-1">
                              <p className="text-xs font-medium text-orange-900">{issue.description}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${getSeverityColor(issue.severity)}`}>
                                {issue.severity}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px] text-orange-700">
                              <span>By: {issue.reportedBy}</span>
                              <span>{issue.reportedDate}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowUpdateModal(true)}
                      className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowTrendingUpIcon className="w-4 h-4" />
                      Update Progress
                    </button>
                    <button
                      onClick={() => toast.info('Opening issue reporter')}
                      className="w-full py-2 border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <BellIcon className="w-4 h-4" />
                      Report Issue
                    </button>
                    <button
                      onClick={() => toast.info('Opening photo upload')}
                      className="w-full py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <CameraIcon className="w-4 h-4" />
                      Upload Photos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Select a task to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Update Progress Modal */}
        {showUpdateModal && selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-md max-w-lg w-full p-6"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">Update Task Progress</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Progress (%)</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    defaultValue={selectedTask.progress}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>0%</span>
                    <span>Current: {selectedTask.progress}%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add update notes..."
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUpdateModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      toast.success('Progress updated successfully');
                      setShowUpdateModal(false);
                    }}
                    className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Update
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressTracking;