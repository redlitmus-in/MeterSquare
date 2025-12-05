import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  EyeIcon,
  UserIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import axios from 'axios';

// Import the actual PM Projects component
import PMMyProjects from '@/roles/project-manager/pages/MyProjects';

interface ProjectManager {
  user_id: number;
  full_name: string;
  email: string;
  project_count?: number;
}

const AdminMyProjects: React.FC = () => {
  const { user } = useAuthStore();
  const [projectManagers, setProjectManagers] = useState<ProjectManager[]>([]);
  const [selectedPM, setSelectedPM] = useState<ProjectManager | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProjectManagers();
  }, []);

  const loadProjectManagers = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('access_token');

      const response = await axios.get(`${API_URL}/admin/project-managers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const pms = response.data.project_managers || [];
      setProjectManagers(pms);

      // Auto-select first PM if available
      if (pms.length > 0) {
        setSelectedPM(pms[0]);
      }
    } catch (error: any) {
      console.error('Error loading project managers:', error);
      showError('Failed to load project managers');
    } finally {
      setLoading(false);
    }
  };

  const filteredPMs = projectManagers.filter(pm =>
    pm.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pm.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  if (projectManagers.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <UserIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Project Managers Found</h3>
            <p className="text-gray-500">Please create project manager accounts first.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header with PM Selector */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Project Manager Projects</h1>
              <p className="text-sm text-gray-600 mt-1">View and manage PM projects as admin</p>
            </div>

            {/* PM Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg hover:border-blue-300 transition-all shadow-sm min-w-[280px]"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                      <span className="text-white font-bold text-sm">
                        {selectedPM?.full_name.split(' ').map(n => n[0]).join('').toUpperCase() || 'PM'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedPM?.full_name || 'Select Project Manager'}
                      </p>
                      <p className="text-xs text-gray-600">{selectedPM?.email || ''}</p>
                    </div>
                  </div>
                </div>
                <ChevronDownIcon
                  className={`w-5 h-5 text-gray-600 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Dropdown Menu */}
              {showDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
                  {/* Search */}
                  <div className="p-3 border-b border-gray-200">
                    <div className="relative">
                      <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search project managers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* PM List */}
                  <div className="max-h-64 overflow-y-auto">
                    {filteredPMs.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">
                        No project managers found
                      </div>
                    ) : (
                      filteredPMs.map((pm) => (
                        <button
                          key={pm.user_id}
                          onClick={() => {
                            setSelectedPM(pm);
                            setShowDropdown(false);
                            setSearchTerm('');
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left ${
                            selectedPM?.user_id === pm.user_id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-xs">
                              {pm.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {pm.full_name}
                            </p>
                            <p className="text-xs text-gray-600 truncate">{pm.email}</p>
                          </div>
                          {pm.project_count !== undefined && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                              {pm.project_count} {pm.project_count === 1 ? 'project' : 'projects'}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Show selected PM's projects */}
      {selectedPM ? (
        <div className="relative">
          {/* Overlay badge showing selected PM */}
          <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Viewing as: {selectedPM.full_name}</span>
            </div>
          </div>

          {/* Render PM Projects component with selected PM's context */}
          <PMMyProjects key={selectedPM.user_id} adminViewingPMId={selectedPM.user_id} />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Please select a Project Manager to view their projects</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMyProjects;
