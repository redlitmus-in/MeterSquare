import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  BuildingOfficeIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  CalendarIcon,
  ArrowTrendingUpIcon,
  FunnelIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

interface Project {
  id: number;
  name: string;
  client: string;
  projectManager: string;
  siteEngineer: string;
  status: 'planning' | 'in-progress' | 'delayed' | 'completed';
  progress: number;
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
  location: string;
  team: number;
  issues: number;
  milestones: { completed: number; total: number };
}

const ProjectsOverview: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const projects: Project[] = [
    {
      id: 1,
      name: 'Tech Park Building A',
      client: 'Tech Solutions Inc.',
      projectManager: 'David Wilson',
      siteEngineer: 'Kumar Raj',
      status: 'in-progress',
      progress: 65,
      budget: 5600000,
      spent: 3640000,
      startDate: '2024-01-15',
      endDate: '2024-05-15',
      location: 'Mumbai',
      team: 12,
      issues: 2,
      milestones: { completed: 8, total: 12 }
    },
    {
      id: 2,
      name: 'Mall Extension Project',
      client: 'Retail Group Ltd.',
      projectManager: 'Sarah Miller',
      siteEngineer: 'John Doe',
      status: 'delayed',
      progress: 42,
      budget: 8900000,
      spent: 3738000,
      startDate: '2024-01-01',
      endDate: '2024-06-30',
      location: 'Delhi',
      team: 18,
      issues: 5,
      milestones: { completed: 5, total: 15 }
    },
    {
      id: 3,
      name: 'Hospital Wing Renovation',
      client: 'City Hospital',
      projectManager: 'Michael Brown',
      siteEngineer: 'Priya Sharma',
      status: 'in-progress',
      progress: 88,
      budget: 3200000,
      spent: 2816000,
      startDate: '2023-11-01',
      endDate: '2024-02-29',
      location: 'Bangalore',
      team: 10,
      issues: 0,
      milestones: { completed: 14, total: 16 }
    },
    {
      id: 4,
      name: 'Corporate Campus Phase 2',
      client: 'Global Corp',
      projectManager: 'Emily Chen',
      siteEngineer: 'Raj Kumar',
      status: 'planning',
      progress: 15,
      budget: 12000000,
      spent: 1800000,
      startDate: '2024-02-01',
      endDate: '2024-12-31',
      location: 'Chennai',
      team: 8,
      issues: 1,
      milestones: { completed: 2, total: 20 }
    },
    {
      id: 5,
      name: 'Luxury Hotel Interiors',
      client: 'Hospitality Group',
      projectManager: 'David Wilson',
      siteEngineer: 'Priya Sharma',
      status: 'completed',
      progress: 100,
      budget: 6500000,
      spent: 6200000,
      startDate: '2023-08-01',
      endDate: '2024-01-15',
      location: 'Goa',
      team: 15,
      issues: 0,
      milestones: { completed: 18, total: 18 }
    }
  ];

  // Chart configurations
  const projectStatusChart = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Projects by Status',
      style: { fontSize: '14px', fontWeight: '600' }
    },
    series: [{
      name: 'Projects',
      data: [
        { name: 'Planning', y: 1, color: '#6366f1' },
        { name: 'In Progress', y: 2, color: '#10b981' },
        { name: 'Delayed', y: 1, color: '#ef4444' },
        { name: 'Completed', y: 1, color: '#8b5cf6' }
      ]
    }],
    plotOptions: {
      pie: {
        innerSize: '50%',
        dataLabels: {
          enabled: true,
          format: '{point.name}: {point.y}'
        }
      }
    },
    credits: { enabled: false }
  };

  const budgetUtilizationChart = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Budget Utilization',
      style: { fontSize: '14px', fontWeight: '600' }
    },
    xAxis: {
      categories: projects.map(p => p.name.split(' ')[0]),
      labels: { style: { fontSize: '10px' } }
    },
    yAxis: {
      title: { text: 'Amount (Lakhs)', style: { fontSize: '11px' } }
    },
    series: [{
      name: 'Budget',
      data: projects.map(p => p.budget / 100000),
      color: '#e0e7ff'
    }, {
      name: 'Spent',
      data: projects.map(p => p.spent / 100000),
      color: '#6366f1'
    }],
    plotOptions: {
      column: {
        borderRadius: 4,
        dataLabels: { enabled: false }
      }
    },
    legend: { enabled: true },
    credits: { enabled: false }
  };

  const progressTimelineChart = {
    chart: {
      type: 'spline',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Progress Timeline',
      style: { fontSize: '14px', fontWeight: '600' }
    },
    xAxis: {
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      labels: { style: { fontSize: '10px' } }
    },
    yAxis: {
      title: { text: 'Progress %', style: { fontSize: '11px' } },
      max: 100
    },
    series: projects.slice(0, 3).map(p => ({
      name: p.name.split(' ')[0],
      data: [20, 35, 45, 60, p.progress, p.progress + 5]
    })),
    plotOptions: {
      spline: {
        lineWidth: 2,
        marker: { enabled: false }
      }
    },
    credits: { enabled: false }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'in-progress': return 'bg-green-100 text-green-700 border-green-200';
      case 'delayed': return 'bg-red-100 text-red-700 border-red-200';
      case 'completed': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'from-green-400 to-green-600';
    if (progress >= 50) return 'from-blue-400 to-blue-600';
    if (progress >= 30) return 'from-yellow-400 to-yellow-600';
    return 'from-red-400 to-red-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                <BuildingOfficeIcon className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-blue-900">Projects Overview</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-white shadow-md' : 'hover:bg-white/50'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-white shadow-md' : 'hover:bg-white/50'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Projects</p>
                <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
              </div>
              <BuildingOfficeIcon className="w-8 h-8 text-purple-500" />
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
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-green-600">
                  {projects.filter(p => p.status === 'in-progress').length}
                </p>
              </div>
              <ClockIcon className="w-8 h-8 text-green-500" />
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
              <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md border border-blue-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Budget</p>
                <p className="text-2xl font-bold text-gray-900">₹{(projects.reduce((sum, p) => sum + p.budget, 0) / 10000000).toFixed(1)}Cr</p>
              </div>
              <CurrencyDollarIcon className="w-8 h-8 text-blue-500" />
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
                <p className="text-sm text-gray-500">Team Members</p>
                <p className="text-2xl font-bold text-gray-900">{projects.reduce((sum, p) => sum + p.team, 0)}</p>
              </div>
              <UserGroupIcon className="w-8 h-8 text-orange-500" />
            </div>
          </motion.div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={projectStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={budgetUtilizationChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={progressTimelineChart} />
          </motion.div>
        </div>

        {/* Projects Grid/List */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
                className="bg-white rounded-xl shadow-md border border-gray-100 p-5 hover:shadow-xl transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg mb-1">{project.name}</h3>
                    <p className="text-sm text-gray-600">{project.client}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Progress</span>
                      <span className="font-medium text-gray-900">{project.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full bg-gradient-to-r ${getProgressColor(project.progress)}`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">Project Manager</p>
                      <p className="font-medium text-gray-900">{project.projectManager}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Site Engineer</p>
                      <p className="font-medium text-gray-900">{project.siteEngineer}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-gray-500">Team</p>
                      <p className="font-bold text-gray-900">{project.team}</p>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-gray-500">Issues</p>
                      <p className={`font-bold ${project.issues > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {project.issues}
                      </p>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-gray-500">Milestones</p>
                      <p className="font-bold text-gray-900">
                        {project.milestones.completed}/{project.milestones.total}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Budget Used</p>
                        <p className="font-bold text-gray-900">
                          ₹{(project.spent / 100000).toFixed(1)}L / ₹{(project.budget / 100000).toFixed(1)}L
                        </p>
                      </div>
                      <button className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                        <EyeIcon className="w-4 h-4 text-blue-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Budget</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Timeline</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project, index) => (
                  <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{project.name}</p>
                        <p className="text-xs text-gray-500">{project.client}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <p className="text-gray-900">PM: {project.projectManager}</p>
                        <p className="text-gray-500 text-xs">SE: {project.siteEngineer}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-24">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium">{project.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full bg-gradient-to-r ${getProgressColor(project.progress)}`}
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <p className="text-gray-900">₹{(project.budget / 100000).toFixed(1)}L</p>
                        <p className="text-xs text-gray-500">Spent: ₹{(project.spent / 100000).toFixed(1)}L</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <p className="text-gray-900">{project.startDate}</p>
                        <p className="text-gray-500">{project.endDate}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button className="p-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                        <EyeIcon className="w-4 h-4 text-blue-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsOverview;