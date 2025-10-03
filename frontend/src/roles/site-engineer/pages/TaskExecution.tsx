import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardDocumentCheckIcon,
  PlayIcon,
  CheckCircleIcon,
  ClockIcon,
  CameraIcon,
  DocumentTextIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import { toast } from 'sonner';

interface Task {
  id: number;
  boqItemCode: string;
  boqItemDescription: string;
  status: 'pending' | 'in-progress' | 'completed';
  progress: number;
  assignedDate: string;
  startedAt?: string;
  completedAt?: string;
  notes: string[];
  photos: string[];
}

const TaskExecution: React.FC = () => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskNote, setTaskNote] = useState('');
  const [taskProgress, setTaskProgress] = useState(0);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: 1,
      boqItemCode: 'PW-01',
      boqItemDescription: 'Glass Partition Wall - Section A',
      status: 'completed',
      progress: 100,
      assignedDate: '2024-01-15',
      startedAt: '09:00 AM',
      completedAt: '11:30 AM',
      notes: ['Started installation as per plan', 'All materials available', 'Completed ahead of schedule'],
      photos: []
    },
    {
      id: 2,
      boqItemCode: 'EL-03',
      boqItemDescription: 'Electrical Wiring - Conference Room',
      status: 'in-progress',
      progress: 65,
      assignedDate: '2024-01-16',
      startedAt: '11:45 AM',
      notes: ['Conduit installation complete', 'Wiring in progress'],
      photos: []
    },
    {
      id: 3,
      boqItemCode: 'FC-02',
      boqItemDescription: 'False Ceiling - Reception Area',
      status: 'pending',
      progress: 0,
      assignedDate: '2024-01-16',
      notes: [],
      photos: []
    },
    {
      id: 4,
      boqItemCode: 'PT-04',
      boqItemDescription: 'Interior Painting - Office Cabins',
      status: 'pending',
      progress: 0,
      assignedDate: '2024-01-16',
      notes: [],
      photos: []
    }
  ]);

  const filteredTasks = tasks.filter(task =>
    filterStatus === 'all' || task.status === filterStatus
  );

  const handleStartTask = (taskId: number) => {
    setTasks(tasks.map(task =>
      task.id === taskId
        ? { ...task, status: 'in-progress' as const, startedAt: new Date().toLocaleTimeString() }
        : task
    ));
    toast.success('Task started successfully');
  };

  const handleCompleteTask = (taskId: number) => {
    setTasks(tasks.map(task =>
      task.id === taskId
        ? {
            ...task,
            status: 'completed' as const,
            progress: 100,
            completedAt: new Date().toLocaleTimeString()
          }
        : task
    ));
    setShowTaskModal(false);
    toast.success('Task completed successfully');
  };

  const handleUpdateProgress = () => {
    if (selectedTask) {
      setTasks(tasks.map(task =>
        task.id === selectedTask.id
          ? { ...task, progress: taskProgress }
          : task
      ));
      toast.success('Progress updated');
    }
  };

  const handleAddNote = () => {
    if (selectedTask && taskNote.trim()) {
      setTasks(tasks.map(task =>
        task.id === selectedTask.id
          ? { ...task, notes: [...task.notes, taskNote] }
          : task
      ));
      setTaskNote('');
      toast.success('Note added');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'in-progress':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-green-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
              <ClipboardDocumentCheckIcon className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-green-900">Task Execution</h1>
              <p className="text-sm text-green-700 mt-1">Manage and track your daily work tasks</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">Total Tasks</p>
            <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-2xl font-bold text-green-600">
              {tasks.filter(t => t.status === 'completed').length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">In Progress</p>
            <p className="text-2xl font-bold text-blue-600">
              {tasks.filter(t => t.status === 'in-progress').length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-gray-600">
              {tasks.filter(t => t.status === 'pending').length}
            </p>
          </motion.div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 mb-6 inline-flex">
          {['all', 'pending', 'in-progress', 'completed'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status as any)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all capitalize ${
                filterStatus === status
                  ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-900 shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {status === 'in-progress' ? 'In Progress' : status}
            </button>
          ))}
        </div>

        {/* Tasks List */}
        <div className="space-y-4">
          {filteredTasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-mono rounded">
                      {task.boqItemCode}
                    </span>
                    <h3 className="font-bold text-gray-900 text-lg">{task.boqItemDescription}</h3>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    <div className="flex items-center gap-1">
                      <ClockIcon className="w-4 h-4" />
                      <span>Assigned: {task.assignedDate}</span>
                    </div>
                    {task.startedAt && (
                      <div className="flex items-center gap-1">
                        <PlayIcon className="w-4 h-4 text-blue-600" />
                        <span>Started: {task.startedAt}</span>
                      </div>
                    )}
                    {task.completedAt && (
                      <div className="flex items-center gap-1">
                        <CheckCircleSolid className="w-4 h-4 text-green-600" />
                        <span>Completed: {task.completedAt}</span>
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold">{task.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          task.status === 'completed' ? 'bg-green-500' :
                          task.status === 'in-progress' ? 'bg-blue-500' :
                          'bg-gray-300'
                        }`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}>
                    {task.status === 'in-progress' ? 'In Progress' : task.status}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {task.status === 'pending' && (
                  <button
                    onClick={() => handleStartTask(task.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <PlayIcon className="w-4 h-4" />
                    Start Task
                  </button>
                )}

                {task.status === 'in-progress' && (
                  <>
                    <button
                      onClick={() => {
                        setSelectedTask(task);
                        setTaskProgress(task.progress);
                        setShowTaskModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <DocumentTextIcon className="w-4 h-4" />
                      Update Progress
                    </button>
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                      Mark Complete
                    </button>
                  </>
                )}

                {task.status === 'completed' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg">
                    <CheckCircleSolid className="w-5 h-5" />
                    <span className="font-medium">Task Completed</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {filteredTasks.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <ClipboardDocumentCheckIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No tasks found for the selected filter</p>
          </div>
        )}

        {/* Update Progress Modal */}
        {showTaskModal && selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-blue-900">Update Task Progress</h2>
                  <p className="text-sm text-blue-700 mt-1">{selectedTask.boqItemCode} - {selectedTask.boqItemDescription}</p>
                </div>
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-blue-900" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
                {/* Progress Slider */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Task Progress: {taskProgress}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={taskProgress}
                    onChange={(e) => setTaskProgress(Number(e.target.value))}
                    className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Add Note */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Add Work Note
                  </label>
                  <textarea
                    value={taskNote}
                    onChange={(e) => setTaskNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Add notes about work progress, issues, or observations..."
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!taskNote.trim()}
                    className="mt-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-300"
                  >
                    Add Note
                  </button>
                </div>

                {/* Previous Notes */}
                {selectedTask.notes.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Previous Notes</h3>
                    <div className="space-y-2">
                      {selectedTask.notes.map((note, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                          • {note}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload Photo */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Upload Work Photos
                  </label>
                  <button className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors">
                    <CameraIcon className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-600">Take or Upload Photo</span>
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateProgress}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Save Progress
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskExecution;
