import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  EyeIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { siteEngineerService } from '../services/siteEngineerService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface Project {
  project_id: number;
  project_name: string;
  client?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  description?: string;
  created_at?: string;
  priority?: 'high' | 'medium' | 'low';
}

const MyProjects: React.FC = () => {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [filterStatus, setFilterStatus] = useState<'assigned' | 'ongoing' | 'completed'>('assigned');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await siteEngineerService.getMyProjects();
      setProjects(response.projects || []);

      if (!response.projects || response.projects.length === 0) {
        toast.info('No projects assigned yet');
      }
    } catch (error: any) {
      console.error('Error loading projects:', error);
      toast.error(error?.response?.data?.error || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(project => {
    if (filterStatus === 'assigned') {
      return project.status?.toLowerCase() === 'assigned' || project.status?.toLowerCase() === 'pending';
    }
    if (filterStatus === 'ongoing') {
      return project.status?.toLowerCase() === 'in_progress' || project.status?.toLowerCase() === 'active';
    }
    if (filterStatus === 'completed') {
      return project.status?.toLowerCase() === 'completed';
    }
    return false;
  });

  const getTabCounts = () => ({
    assigned: projects.filter(p => p.status?.toLowerCase() === 'assigned' || p.status?.toLowerCase() === 'pending').length,
    ongoing: projects.filter(p => p.status?.toLowerCase() === 'in_progress' || p.status?.toLowerCase() === 'active').length,
    completed: projects.filter(p => p.status?.toLowerCase() === 'completed').length
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'low': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusBadge = (status?: string) => {
    const statusLower = status?.toLowerCase();
    if (statusLower === 'assigned' || statusLower === 'pending') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          Assigned
        </span>
      );
    }
    if (statusLower === 'in_progress' || statusLower === 'active') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          Ongoing
        </span>
      );
    }
    if (statusLower === 'completed') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
          <CheckCircleIcon className="w-3 h-3" />
          Completed
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        {status || 'Unknown'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  const tabCounts = getTabCounts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
        </div>
      </div>

      {/* Tab Filters */}
      <div className="bg-gray-50 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setFilterStatus('assigned')}
              className={`px-5 py-2 text-sm font-medium whitespace-nowrap transition-all rounded-lg ${
                filterStatus === 'assigned'
                  ? 'bg-white text-orange-600 shadow-sm border-2 border-orange-200'
                  : 'bg-transparent text-gray-700 hover:bg-white/50'
              }`}
            >
              Assigned Projects ({tabCounts.assigned})
            </button>

            <button
              onClick={() => setFilterStatus('ongoing')}
              className={`px-5 py-2 text-sm font-medium whitespace-nowrap transition-all rounded-lg ${
                filterStatus === 'ongoing'
                  ? 'bg-white text-purple-600 shadow-sm border-2 border-purple-200'
                  : 'bg-transparent text-gray-700 hover:bg-white/50'
              }`}
            >
              Ongoing ({tabCounts.ongoing})
            </button>

            <button
              onClick={() => setFilterStatus('completed')}
              className={`px-5 py-2 text-sm font-medium whitespace-nowrap transition-all rounded-lg ${
                filterStatus === 'completed'
                  ? 'bg-white text-green-600 shadow-sm border-2 border-green-200'
                  : 'bg-transparent text-gray-700 hover:bg-white/50'
              }`}
            >
              Completed ({tabCounts.completed})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Projects List */}
        <div className="space-y-4">
          {filteredProjects.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No projects in this category</p>
            </div>
          ) : (
            filteredProjects.map((project, index) => (
              <motion.div
                key={project.project_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200"
              >
                <div className="p-6">
                  {/* Project Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{project.project_name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(project.priority)}`}>
                          {project.priority || 'medium'} priority
                        </span>
                        {getStatusBadge(project.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <BuildingOfficeIcon className="w-4 h-4" />
                          <span>{project.client || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="w-4 h-4" />
                          <span>{formatDate(project.start_date)} - {formatDate(project.end_date)}</span>
                        </div>
                      </div>
                      {project.description && (
                        <p className="text-sm text-gray-600 mt-2">{project.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedProject(project)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Project Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700 mb-1">Location</p>
                      <p className="text-sm font-bold text-blue-900 truncate">{project.location || 'N/A'}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs text-green-700 mb-1">Status</p>
                      <p className="text-sm font-bold text-green-900 capitalize">{project.status || 'N/A'}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <p className="text-xs text-purple-700 mb-1">Start Date</p>
                      <p className="text-sm font-bold text-purple-900">{formatDate(project.start_date)}</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs text-orange-700 mb-1">End Date</p>
                      <p className="text-sm font-bold text-orange-900">{formatDate(project.end_date)}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MyProjects;
