import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  UserIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import axios from 'axios';

// Import the actual SE Projects component
import SEMyProjects from '@/roles/site-engineer/pages/MyProjects';

interface SiteEngineer {
  user_id: number;
  full_name: string;
  email: string;
  project_count?: number;
}

const AdminSEProjects: React.FC = () => {
  const { user } = useAuthStore();
  const [siteEngineers, setSiteEngineers] = useState<SiteEngineer[]>([]);
  const [selectedSE, setSelectedSE] = useState<SiteEngineer | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSiteEngineers();
  }, []);

  const loadSiteEngineers = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('access_token');

      const response = await axios.get(`${API_URL}/site-engineers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const ses = response.data.site_engineers || [];
      setSiteEngineers(ses);

      // Auto-select first SE if available
      if (ses.length > 0) {
        setSelectedSE(ses[0]);
      }
    } catch (error: any) {
      console.error('Error loading site engineers:', error);
      toast.error('Failed to load site engineers');
    } finally {
      setLoading(false);
    }
  };

  const filteredSEs = siteEngineers.filter(se =>
    se.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    se.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  if (siteEngineers.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <UserIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Site Engineers Found</h3>
            <p className="text-gray-500">Please create site engineer accounts first.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header with SE Selector */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Site Engineer Projects</h1>
              <p className="text-sm text-gray-600 mt-1">View and manage SE projects as admin</p>
            </div>

            {/* SE Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-2 border-cyan-200 rounded-lg hover:border-cyan-300 transition-all shadow-sm min-w-[280px]"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-md">
                      <span className="text-white font-bold text-sm">
                        {selectedSE?.full_name.split(' ').map(n => n[0]).join('').toUpperCase() || 'SE'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedSE?.full_name || 'Select Site Engineer'}
                      </p>
                      <p className="text-xs text-gray-600">{selectedSE?.email || ''}</p>
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
                        placeholder="Search site engineers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  {/* SE List */}
                  <div className="max-h-64 overflow-y-auto">
                    {filteredSEs.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">
                        No site engineers found
                      </div>
                    ) : (
                      filteredSEs.map((se) => (
                        <button
                          key={se.user_id}
                          onClick={() => {
                            setSelectedSE(se);
                            setShowDropdown(false);
                            setSearchTerm('');
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-cyan-50 transition-colors text-left ${
                            selectedSE?.user_id === se.user_id ? 'bg-cyan-50' : ''
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-xs">
                              {se.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {se.full_name}
                            </p>
                            <p className="text-xs text-gray-600 truncate">{se.email}</p>
                          </div>
                          {se.project_count !== undefined && (
                            <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full">
                              {se.project_count} {se.project_count === 1 ? 'project' : 'projects'}
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

      {/* Show selected SE's projects */}
      {selectedSE ? (
        <div className="relative">
          {/* Overlay badge showing selected SE */}
          <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-cyan-500 to-teal-600 text-white px-4 py-2 rounded-lg shadow-lg">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Viewing as: {selectedSE.full_name}</span>
            </div>
          </div>

          {/* Render SE Projects component with selected SE's context */}
          <SEMyProjects key={selectedSE.user_id} adminViewingSEId={selectedSE.user_id} />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <BuildingOfficeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Please select a Site Engineer to view their projects</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSEProjects;
