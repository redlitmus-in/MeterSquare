import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  UsersIcon,
  UserPlusIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  ClockIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface Project {
  id: number;
  name: string;
  client: string;
  value: number;
  startDate: string;
  endDate: string;
  status: 'unassigned' | 'assigned' | 'in-progress';
  location: string;
  priority: 'high' | 'medium' | 'low';
  projectManager?: string;
  siteEngineer?: string;
}

interface TeamMember {
  id: number;
  name: string;
  role: 'Project Manager' | 'Site Engineer';
  availability: 'available' | 'busy' | 'on-leave';
  currentProjects: number;
  experience: string;
  specialization: string;
  rating: number;
}

const TeamAssignment: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPM, setSelectedPM] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unassigned' | 'assigned'>('unassigned');
  const [searchTerm, setSearchTerm] = useState('');

  const projects: Project[] = [
    {
      id: 1,
      name: 'Corporate Office - Tower A',
      client: 'Tech Solutions Inc.',
      value: 4500000,
      startDate: '2024-02-01',
      endDate: '2024-05-30',
      status: 'unassigned',
      location: 'Mumbai',
      priority: 'high',
    },
    {
      id: 2,
      name: 'Retail Store Renovation',
      client: 'Fashion Retail Ltd.',
      value: 2300000,
      startDate: '2024-02-15',
      endDate: '2024-04-15',
      status: 'unassigned',
      location: 'Delhi',
      priority: 'medium',
    },
    {
      id: 3,
      name: 'Bank Branch Setup',
      client: 'National Bank',
      value: 3200000,
      startDate: '2024-01-25',
      endDate: '2024-04-25',
      status: 'assigned',
      location: 'Chennai',
      priority: 'high',
      projectManager: 'David Wilson',
      siteEngineer: 'Kumar Raj',
    },
    {
      id: 4,
      name: 'Restaurant Interior',
      client: 'Gourmet Foods',
      value: 1800000,
      startDate: '2024-03-01',
      endDate: '2024-05-01',
      status: 'in-progress',
      location: 'Bangalore',
      priority: 'low',
      projectManager: 'Sarah Miller',
      siteEngineer: 'John Doe',
    },
  ];

  const teamMembers: TeamMember[] = [
    {
      id: 1,
      name: 'David Wilson',
      role: 'Project Manager',
      availability: 'available',
      currentProjects: 2,
      experience: '8 years',
      specialization: 'Commercial',
      rating: 4.8,
    },
    {
      id: 2,
      name: 'Sarah Miller',
      role: 'Project Manager',
      availability: 'busy',
      currentProjects: 3,
      experience: '6 years',
      specialization: 'Retail',
      rating: 4.6,
    },
    {
      id: 3,
      name: 'Michael Brown',
      role: 'Project Manager',
      availability: 'available',
      currentProjects: 1,
      experience: '10 years',
      specialization: 'Corporate',
      rating: 4.9,
    },
    {
      id: 4,
      name: 'Kumar Raj',
      role: 'Site Engineer',
      availability: 'available',
      currentProjects: 2,
      experience: '5 years',
      specialization: 'Electrical',
      rating: 4.5,
    },
    {
      id: 5,
      name: 'John Doe',
      role: 'Site Engineer',
      availability: 'busy',
      currentProjects: 3,
      experience: '4 years',
      specialization: 'Civil',
      rating: 4.3,
    },
    {
      id: 6,
      name: 'Priya Sharma',
      role: 'Site Engineer',
      availability: 'available',
      currentProjects: 1,
      experience: '3 years',
      specialization: 'Interior',
      rating: 4.7,
    },
  ];

  const filteredProjects = projects.filter(project => {
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'unassigned' && project.status === 'unassigned') ||
      (filterStatus === 'assigned' &&
        (project.status === 'assigned' || project.status === 'in-progress'));
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.client.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const projectManagers = teamMembers.filter(tm => tm.role === 'Project Manager');
  const siteEngineers = teamMembers.filter(tm => tm.role === 'Site Engineer');

  const handleAssignment = () => {
    if (!selectedProject || !selectedPM) {
      toast.error('Please select a project and Project Manager');
      return;
    }
    toast.success(`Project Manager assigned successfully to ${selectedProject.name}`);
    // API call would go here to assign PM to project
    // Site Engineer will be assigned by the PM later
  };

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case 'available':
        return 'bg-green-100 text-green-700';
      case 'busy':
        return 'bg-yellow-100 text-yellow-700';
      case 'on-leave':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <UsersIcon className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">Project Manager Assignment</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects List */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Projects</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value as any)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="unassigned">Unassigned</option>
                    <option value="assigned">Assigned</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredProjects.map(project => (
                  <motion.div
                    key={project.id}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedProject(project)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedProject?.id === project.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(project.priority)}`}
                      >
                        {project.priority}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <BuildingOfficeIcon className="w-4 h-4" />
                        <span>{project.client}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDaysIcon className="w-4 h-4" />
                        <span>
                          {project.startDate} to {project.endDate}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">AED{(project.value / 100000).toFixed(1)}L</span>
                        {project.status === 'unassigned' ? (
                          <span className="text-orange-600 font-medium">Needs Assignment</span>
                        ) : (
                          <span className="text-green-600 font-medium">
                            PM: {project.projectManager}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Project Manager Selection */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Assign Project Manager</h2>

              {selectedProject ? (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-900">
                      Selected Project: {selectedProject.name}
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Client: {selectedProject.client} | Value: AED
                      {(selectedProject.value / 100000).toFixed(1)}L
                    </p>
                  </div>

                  {/* Project Manager Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Project Manager
                    </label>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {projectManagers.map(pm => (
                        <div
                          key={pm.id}
                          onClick={() => setSelectedPM(pm.name)}
                          className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedPM === pm.name
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{pm.name}</p>
                              <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                                <span
                                  className={`px-2 py-0.5 rounded-full ${getAvailabilityColor(pm.availability)}`}
                                >
                                  {pm.availability}
                                </span>
                                <span>{pm.experience}</span>
                                <span>{pm.currentProjects} projects</span>
                                <span>⭐ {pm.rating}</span>
                              </div>
                            </div>
                            {selectedPM === pm.name && (
                              <CheckBadgeIcon className="w-5 h-5 text-blue-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> After assigning the Project Manager, they will be
                      responsible for selecting and assigning the Site Engineer for this project.
                    </p>
                  </div>

                  {/* Assignment Button */}
                  <button
                    onClick={handleAssignment}
                    disabled={!selectedPM}
                    className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                      selectedPM
                        ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 hover:from-red-100 hover:to-red-200 border border-red-200 shadow-md'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <UserPlusIcon className="w-5 h-5" />
                    Assign Project Manager
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Select a project to assign a Project Manager</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamAssignment;
