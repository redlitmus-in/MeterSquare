import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  UsersIcon,
  UserPlusIcon,
  BuildingOfficeIcon,
  CheckBadgeIcon,
  ClockIcon,
  BriefcaseIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  StarIcon,
  CalendarDaysIcon,
  WrenchScrewdriverIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface Project {
  id: number;
  name: string;
  client: string;
  location: string;
  status: 'unassigned' | 'assigned';
  startDate: string;
  endDate: string;
  siteEngineer?: string;
  priority: 'high' | 'medium' | 'low';
  workScope: string;
}

interface SiteEngineer {
  id: number;
  name: string;
  email: string;
  phone: string;
  experience: string;
  specialization: string;
  currentProjects: number;
  maxProjects: number;
  availability: 'available' | 'busy' | 'on-leave';
  rating: number;
  completedProjects: number;
  skills: string[];
}

const SEAssignment: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSE, setSelectedSE] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unassigned' | 'assigned'>('unassigned');

  const projects: Project[] = [
    {
      id: 1,
      name: 'Corporate Office - Tower A',
      client: 'Tech Solutions Inc.',
      location: 'Mumbai',
      status: 'assigned',
      startDate: '2024-01-01',
      endDate: '2024-03-31',
      siteEngineer: 'John Smith',
      priority: 'high',
      workScope: 'Complete interior fitout including partitions, false ceiling, electrical, and HVAC'
    },
    {
      id: 2,
      name: 'Retail Store Renovation',
      client: 'Fashion Retail Ltd.',
      location: 'Delhi',
      status: 'assigned',
      startDate: '2024-01-10',
      endDate: '2024-02-28',
      siteEngineer: 'Sarah Wilson',
      priority: 'medium',
      workScope: 'Store renovation with display units, lighting, and flooring'
    },
    {
      id: 3,
      name: 'Restaurant Interior',
      client: 'Gourmet Foods',
      location: 'Bangalore',
      status: 'assigned',
      startDate: '2023-12-15',
      endDate: '2024-01-31',
      siteEngineer: 'Mike Johnson',
      priority: 'low',
      workScope: 'Kitchen setup, dining area design, and bar counter installation'
    },
    {
      id: 4,
      name: 'Medical Clinic Setup',
      client: 'HealthCare Plus',
      location: 'Chennai',
      status: 'unassigned',
      startDate: '2024-01-08',
      endDate: '2024-04-15',
      priority: 'high',
      workScope: 'Medical equipment installation, sterile room setup, patient areas'
    },
    {
      id: 5,
      name: 'Bank Branch Office',
      client: 'National Bank',
      location: 'Pune',
      status: 'unassigned',
      startDate: '2024-02-01',
      endDate: '2024-04-30',
      priority: 'medium',
      workScope: 'Security systems, teller counters, vault installation, customer areas'
    }
  ];

  const siteEngineers: SiteEngineer[] = [
    {
      id: 1,
      name: 'John Smith',
      email: 'john.smith@metersquare.com',
      phone: '+91 98765 43210',
      experience: '8 years',
      specialization: 'Commercial Spaces',
      currentProjects: 1,
      maxProjects: 2,
      availability: 'busy',
      rating: 4.8,
      completedProjects: 45,
      skills: ['Electrical', 'HVAC', 'Partitions']
    },
    {
      id: 2,
      name: 'Sarah Wilson',
      email: 'sarah.wilson@metersquare.com',
      phone: '+91 98765 43211',
      experience: '6 years',
      specialization: 'Retail Spaces',
      currentProjects: 1,
      maxProjects: 3,
      availability: 'available',
      rating: 4.6,
      completedProjects: 32,
      skills: ['Interior', 'Lighting', 'Display']
    },
    {
      id: 3,
      name: 'Mike Johnson',
      email: 'mike.johnson@metersquare.com',
      phone: '+91 98765 43212',
      experience: '5 years',
      specialization: 'Hospitality',
      currentProjects: 1,
      maxProjects: 2,
      availability: 'busy',
      rating: 4.5,
      completedProjects: 28,
      skills: ['Kitchen', 'Plumbing', 'Interior']
    },
    {
      id: 4,
      name: 'Emily Davis',
      email: 'emily.davis@metersquare.com',
      phone: '+91 98765 43213',
      experience: '7 years',
      specialization: 'Healthcare',
      currentProjects: 0,
      maxProjects: 2,
      availability: 'available',
      rating: 4.9,
      completedProjects: 38,
      skills: ['Medical Equipment', 'Sterile Rooms', 'HVAC']
    },
    {
      id: 5,
      name: 'Robert Chen',
      email: 'robert.chen@metersquare.com',
      phone: '+91 98765 43214',
      experience: '4 years',
      specialization: 'Banking & Finance',
      currentProjects: 0,
      maxProjects: 2,
      availability: 'available',
      rating: 4.4,
      completedProjects: 20,
      skills: ['Security Systems', 'Electrical', 'Networking']
    }
  ];

  const filteredProjects = projects.filter(project => {
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'unassigned' && project.status === 'unassigned') ||
      (filterStatus === 'assigned' && project.status === 'assigned');
    return matchesStatus;
  });

  const availableEngineers = siteEngineers.filter(se => se.currentProjects < se.maxProjects);

  const handleAssignment = () => {
    if (!selectedProject || !selectedSE) {
      toast.error('Please select a project and Site Engineer');
      return;
    }
    toast.success(`Site Engineer assigned successfully to ${selectedProject.name}`);
  };

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case 'available': return 'bg-green-100 text-green-700';
      case 'busy': return 'bg-yellow-100 text-yellow-700';
      case 'on-leave': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg">
              <UsersIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-blue-900">Site Engineer Assignment</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-orange-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Unassigned Projects</p>
                <p className="text-2xl font-bold text-gray-900">
                  {projects.filter(p => p.status === 'unassigned').length}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <ClockIcon className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-blue-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total SEs</p>
                <p className="text-2xl font-bold text-gray-900">{siteEngineers.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <UsersIcon className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md border border-green-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Available SEs</p>
                <p className="text-2xl font-bold text-gray-900">
                  {siteEngineers.filter(se => se.availability === 'available').length}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckBadgeIcon className="w-6 h-6 text-green-600" />
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
                <p className="text-sm text-gray-500">Avg Rating</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(siteEngineers.reduce((sum, se) => sum + se.rating, 0) / siteEngineers.length).toFixed(1)}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <StarIcon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects List */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Projects</h2>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All</option>
                  <option value="unassigned">Unassigned</option>
                  <option value="assigned">Assigned</option>
                </select>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => project.status === 'unassigned' && setSelectedProject(project)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      project.status === 'unassigned' ? 'cursor-pointer' : 'opacity-60'
                    } ${
                      selectedProject?.id === project.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(project.priority)}`}>
                        {project.priority}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <BuildingOfficeIcon className="w-4 h-4" />
                        <span>{project.client}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPinIcon className="w-4 h-4" />
                        <span>{project.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDaysIcon className="w-4 h-4" />
                        <span>{project.startDate} to {project.endDate}</span>
                      </div>
                      {project.status === 'assigned' && project.siteEngineer && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <span className="text-green-600 font-medium">
                            Assigned to: {project.siteEngineer}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="text-xs text-gray-500">{project.workScope}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Site Engineer Selection */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Available Site Engineers</h2>

              {selectedProject ? (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-900">
                      Selected Project: {selectedProject.name}
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      {selectedProject.client} • {selectedProject.location}
                    </p>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {availableEngineers.map((se) => (
                      <div
                        key={se.id}
                        onClick={() => setSelectedSE(se.name)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedSE === se.name
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-gray-900">{se.name}</p>
                            <p className="text-sm text-gray-600">{se.specialization}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <StarIcon className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            <span className="text-sm font-medium">{se.rating}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                          <div className="flex items-center gap-1">
                            <AcademicCapIcon className="w-3 h-3" />
                            <span>{se.experience}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <BriefcaseIcon className="w-3 h-3" />
                            <span>{se.completedProjects} projects</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            <span className={`px-2 py-0.5 rounded-full ${getAvailabilityColor(se.availability)}`}>
                              {se.availability}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <UsersIcon className="w-3 h-3" />
                            <span>{se.currentProjects}/{se.maxProjects} active</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 mb-2">
                          {se.skills.map((skill, index) => (
                            <span key={index} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                              {skill}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t border-gray-200">
                          <div className="flex items-center gap-1">
                            <EnvelopeIcon className="w-3 h-3" />
                            <span>{se.email}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <PhoneIcon className="w-3 h-3" />
                            <span>{se.phone}</span>
                          </div>
                        </div>

                        {selectedSE === se.name && (
                          <div className="mt-2 flex justify-end">
                            <CheckBadgeIcon className="w-5 h-5 text-blue-600" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleAssignment}
                    disabled={!selectedSE}
                    className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                      selectedSE
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <UserPlusIcon className="w-5 h-5" />
                    Assign Site Engineer
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Select an unassigned project to assign a Site Engineer</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SEAssignment;