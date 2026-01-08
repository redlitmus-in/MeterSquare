import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircleIcon, 
  ClockIcon, 
  PlusIcon,
  UserIcon,
  CalendarIcon,
  FlagIcon,
  EyeIcon,
  PlayCircleIcon,
  CheckIcon,
  AlertCircleIcon
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string;
  dueDate: string;
  estimatedHours: number;
  actualHours?: number;
  project: string;
  tags: string[];
}

const TasksPage: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  
  // Set page title
  useEffect(() => {
    document.title = 'Pending Actions - MeterSquare ERP';
  }, []);
  
  // Workflow-based pending actions aligned with PDF requirements
  const tasks: Task[] = [
    {
      id: '1',
      title: 'Approve Purchase Requisition PR-2024-001',
      description: 'QTY/SPEC FLAG approval required for construction materials - Marina Bay project',
      status: 'pending',
      priority: 'high',
      assignedTo: 'Technical Director',
      dueDate: '2024-08-27',
      estimatedHours: 2,
      project: 'Marina Bay Residential',
      tags: ['Purchase Requisition', 'QTY/SPEC FLAG']
    },
    {
      id: '2', 
      title: 'Review Vendor Quotation VQ-2024-045',
      description: 'QTY/SCOPE FLAG approval needed for electrical subcontractor quotation',
      status: 'in_progress',
      priority: 'medium',
      assignedTo: 'Project Manager',
      dueDate: '2024-08-30',
      estimatedHours: 3,
      actualHours: 1,
      project: 'Orchard Office Tower',
      tags: ['Vendor Quotation', 'QTY/SCOPE FLAG']
    },
    {
      id: '3',
      title: 'Acknowledge Payment Transaction',
      description: 'Payment acknowledgment required for approved vendor invoice #INV-2024-089',
      status: 'pending',
      priority: 'urgent',
      assignedTo: 'Accounts',
      dueDate: '2024-08-26',
      estimatedHours: 1,
      project: 'Sentosa Resort Renovation',
      tags: ['Payment', 'Acknowledgment']
    },
    {
      id: '4',
      title: 'Material Requisition MR-2024-112 Revision',
      description: 'Qty & Spec revision required - rejected by Project Manager',
      status: 'overdue',
      priority: 'urgent',
      assignedTo: 'Factory Supervisor',
      dueDate: '2024-08-24',
      estimatedHours: 2,
      project: 'Downtown Complex',
      tags: ['Material Requisition', 'Revision Required']
    },
    {
      id: '5',
      title: 'Approve Material Delivery Note MDN-2024-067',
      description: 'QTY/SPEC/REQ FLAG approval for site delivery',
      status: 'pending',
      priority: 'high',
      assignedTo: 'Technical Director',
      dueDate: '2024-08-27',
      estimatedHours: 1,
      project: 'Palm Jumeirah Villa',
      tags: ['Material Delivery', 'QTY/SPEC/REQ FLAG']
    },
    {
      id: '6',
      title: 'Design Reference Input Required',
      description: 'Provide design reference for approved Purchase Requisition PR-2024-003',
      status: 'completed',
      priority: 'medium',
      assignedTo: 'Design',
      dueDate: '2024-08-25',
      estimatedHours: 2,
      actualHours: 2,
      project: 'Business Bay Tower',
      tags: ['Design Input', 'Reference']
    }
  ];

  const getStatusConfig = (status: Task['status']) => {
    const configs = {
      pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: ClockIcon, label: 'Pending' },
      in_progress: { color: 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30', icon: PlayCircleIcon, label: 'In Progress' },
      completed: { color: 'bg-green-100 text-green-700 border-green-300', icon: CheckIcon, label: 'Completed' },
      overdue: { color: 'bg-red-100 text-red-700 border-red-300', icon: AlertCircleIcon, label: 'Overdue' }
    };
    return configs[status];
  };

  const getPriorityConfig = (priority: Task['priority']) => {
    const configs = {
      low: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Low' },
      medium: { color: 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30', label: 'Medium' },
      high: { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'High' },
      urgent: { color: 'bg-red-100 text-red-700 border-red-300', label: 'Urgent' }
    };
    return configs[priority];
  };

  const getTasksByFilter = (filter: string) => {
    if (filter === 'all') return tasks;
    return tasks.filter(task => task.status === filter);
  };

  const filteredTasks = getTasksByFilter(activeFilter);

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => t.status === 'overdue').length,
    approvals: tasks.filter(t => t.tags.some(tag => tag.includes('FLAG'))).length,
    revisions: tasks.filter(t => t.tags.some(tag => tag.includes('Revision'))).length
  };

  return (
    <div className="w-full px-2 py-3 sm:px-3 sm:py-4 md:p-6 space-y-3 md:space-y-4 max-w-full overflow-x-hidden">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg shadow-md p-4 text-gray-800 border border-green-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/60 rounded-md">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Pending Actions</h1>
              <p className="text-sm text-gray-600 mt-0.5">Review documents requiring your approval or action</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-gray-100 rounded-md">
                <CheckCircleIcon className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Total</p>
                <p className="text-lg font-bold text-gray-900">{taskStats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-yellow-100 rounded-md">
                <ClockIcon className="w-4 h-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Pending</p>
                <p className="text-lg font-bold text-gray-900">{taskStats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-[#243d8a]/10 rounded-md">
                <PlayCircleIcon className="w-4 h-4 text-[#243d8a]" />
              </div>
              <div>
                <p className="text-xs text-gray-600">In Progress</p>
                <p className="text-lg font-bold text-gray-900">{taskStats.in_progress}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-green-100 rounded-md">
                <CheckIcon className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Completed</p>
                <p className="text-lg font-bold text-gray-900">{taskStats.completed}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-red-100 rounded-md">
                <AlertCircleIcon className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Overdue</p>
                <p className="text-lg font-bold text-gray-900">{taskStats.overdue}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: `All (${taskStats.total})`, color: 'bg-gray-100 text-gray-700' },
              { key: 'pending', label: `Pending (${taskStats.pending})`, color: 'bg-yellow-100 text-yellow-700' },
              { key: 'in_progress', label: `In Progress (${taskStats.in_progress})`, color: 'bg-[#243d8a]/10 text-[#243d8a]/90' },
              { key: 'completed', label: `Completed (${taskStats.completed})`, color: 'bg-green-100 text-green-700' },
              { key: 'overdue', label: `Overdue (${taskStats.overdue})`, color: 'bg-red-100 text-red-700' }
            ].map((filter) => (
              <Button
                key={filter.key}
                variant={activeFilter === filter.key ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(filter.key)}
                className={activeFilter === filter.key ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
            {activeFilter === 'all' ? 'All Tasks' : `${activeFilter.replace('_', ' ').toUpperCase()} Tasks`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTasks.length > 0 ? (
            <div className="space-y-0">
              {filteredTasks.map((task, index) => {
                const statusConfig = getStatusConfig(task.status);
                const priorityConfig = getPriorityConfig(task.priority);
                const StatusIcon = statusConfig.icon;

                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`px-3 py-4 sm:px-4 sm:py-5 md:p-6 hover:bg-gray-50 transition-colors ${
                      index !== filteredTasks.length - 1 ? 'border-b border-gray-200' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="mt-1 flex-shrink-0">
                            <StatusIcon className="w-5 h-5 text-gray-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 break-words">
                              {task.title}
                            </h3>
                            <p className="text-sm sm:text-base text-gray-600 mb-3 break-words">{task.description}</p>
                            
                            <div className="flex items-center gap-3 mb-3">
                              <Badge className={`${statusConfig.color} border flex items-center gap-1`}>
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </Badge>
                              <Badge className={`${priorityConfig.color} border flex items-center gap-1`}>
                                <FlagIcon className="w-3 h-3" />
                                {priorityConfig.label}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-6 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <UserIcon className="w-4 h-4" />
                                {task.assignedTo}
                              </div>
                              <div className="flex items-center gap-1">
                                <CalendarIcon className="w-4 h-4" />
                                Due: {task.dueDate}
                              </div>
                              <div className="flex items-center gap-1">
                                <ClockIcon className="w-4 h-4" />
                                {task.estimatedHours}h estimated
                              </div>
                              {task.actualHours && (
                                <div className="text-green-600">
                                  {task.actualHours}h completed
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {task.project}
                              </Badge>
                              {task.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="text-gray-600 hover:text-gray-900">
                          <EyeIcon className="w-4 h-4" />
                        </Button>
                        {task.status !== 'completed' && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            <CheckIcon className="w-4 h-4 mr-1" />
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircleIcon className="mx-auto w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
              <p className="text-gray-500">
                {activeFilter === 'all' 
                  ? "You don't have any tasks assigned yet." 
                  : `No ${activeFilter.replace('_', ' ')} tasks found.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TasksPage;