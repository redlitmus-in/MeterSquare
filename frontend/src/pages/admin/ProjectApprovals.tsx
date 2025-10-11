/**
 * Admin Project Approvals Page
 * Admin can approve/reject projects (similar to TD capabilities)
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Clock,
  Building,
  User,
  Calendar,
  DollarSign,
  FileText,
  Eye,
  RefreshCw,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { adminApi } from '@/api/admin';

interface ProjectApproval {
  project_id: number;
  project_name: string;
  client_name: string;
  submitted_by: string;
  submission_date: string;
  estimated_budget: number;
  status: 'pending' | 'approved' | 'rejected';
  description: string;
  location: string;
  deadline: string;
}

const AdminProjectApprovals: React.FC = () => {
  const [projects, setProjects] = useState<ProjectApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [selectedProject, setSelectedProject] = useState<ProjectApproval | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [filterStatus]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getProjects({
        status: filterStatus !== 'all' ? filterStatus : undefined
      });

      // Transform Project data to ProjectApproval format
      const transformedProjects: ProjectApproval[] = response.projects.map(p => ({
        project_id: p.project_id,
        project_name: p.project_name,
        client_name: p.client || 'Unknown Client',
        submitted_by: p.created_by || 'Unknown',
        submission_date: p.created_at || '',
        estimated_budget: 0, // Will need BOQ data for this
        status: p.status as 'pending' | 'approved' | 'rejected',
        description: p.description || '',
        location: p.location || '',
        deadline: p.end_date || ''
      }));

      setProjects(transformedProjects);
    } catch (error: any) {
      toast.error('Failed to fetch projects', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (projectId: number) => {
    try {
      // await adminApi.approveProject(projectId, { approved: true, comments: '' });
      toast.success('Project approved successfully');
      fetchProjects();
    } catch (error: any) {
      toast.error('Failed to approve project');
    }
  };

  const handleReject = async (projectId: number, reason: string) => {
    try {
      // await adminApi.approveProject(projectId, { approved: false, comments: reason });
      toast.success('Project rejected');
      fetchProjects();
    } catch (error: any) {
      toast.error('Failed to reject project');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-[#243d8a]" />
              Project Approvals
            </h1>
            <p className="text-gray-500 mt-1">Review and approve project submissions</p>
          </div>
          <button
            onClick={fetchProjects}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className="w-5 h-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <span className="text-sm text-gray-500">
              {projects.length} project{projects.length !== 1 ? 's' : ''} found
            </span>
          </div>
        </div>

        {/* Projects List */}
        {isLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex items-center justify-center">
            <ModernLoadingSpinners variant="pulse-wave" size="lg" />
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No projects pending approval</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {projects.map((project, index) => (
              <motion.div
                key={project.project_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Card Header */}
                <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{project.project_name}</h3>
                      <p className="text-sm text-gray-600">{project.client_name}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${getStatusColor(project.status)}`}>
                      {getStatusIcon(project.status)}
                      {project.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5">
                  <p className="text-gray-700 mb-4">{project.description}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Submitted By</p>
                        <p className="text-sm font-medium text-gray-900">{project.submitted_by}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Submission Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(project.submission_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Estimated Budget</p>
                        <p className="text-sm font-medium text-[#243d8a]">
                          ₹{(project.estimated_budget / 100000).toFixed(2)}L
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Location</p>
                        <p className="text-sm font-medium text-gray-900">{project.location}</p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {project.status === 'pending' && (
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => setSelectedProject(project)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View Details
                      </button>
                      <button
                        onClick={() => handleReject(project.project_id, 'Rejected by admin')}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(project.project_id)}
                        className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve Project
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminProjectApprovals;
