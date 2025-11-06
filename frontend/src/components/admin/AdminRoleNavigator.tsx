/**
 * Admin Role Navigator Component
 * Allows admin to view different role perspectives
 * Shows users grouped by role in dropdown
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, ChevronRightIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/api/admin';
import { useAdminViewStore } from '@/store/adminViewStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface RoleGroup {
  roleId: number;
  roleName: string;
  displayName: string;
  users: any[];
  color: string;
  dashboardPath?: string;
}

interface AdminRoleNavigatorProps {
  isCollapsed?: boolean;
}

export const AdminRoleNavigator: React.FC<AdminRoleNavigatorProps> = ({ isCollapsed = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedRole, setExpandedRole] = useState<number | null>(null);
  const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { viewingAsRoleName, setRoleView, resetToAdminView } = useAdminViewStore();
  const { user } = useAuthStore();

  // Define role configurations matching backend
  const ROLE_CONFIGS = [
    { roleId: 7, roleName: 'technicalDirector', displayName: 'Technical Director', color: 'bg-blue-100 text-blue-800', dashboardPath: '/admin/dashboard' },
    { roleId: 4, roleName: 'estimator', displayName: 'Estimator', color: 'bg-indigo-100 text-indigo-800', dashboardPath: '/admin/dashboard' },
    { roleId: 5, roleName: 'projectManager', displayName: 'Project Manager', color: 'bg-green-100 text-green-800', dashboardPath: '/admin/dashboard' },
    { roleId: 2, roleName: 'siteEngineer', displayName: 'Site Engineer', color: 'bg-orange-100 text-orange-800', dashboardPath: '/admin/dashboard' },
    { roleId: 8, roleName: 'buyer', displayName: 'Buyer', color: 'bg-purple-100 text-purple-800', dashboardPath: '/admin/dashboard' }
  ];

  // Fetch users grouped by role
  const fetchUsersByRole = async () => {
    setLoading(true);
    try {
      const groups: RoleGroup[] = [];

      for (const config of ROLE_CONFIGS) {
        try {
          const response = await adminApi.getUsers({
            role_id: config.roleId,
            is_active: true,
            per_page: 100
          });

          if (response.users && response.users.length > 0) {
            groups.push({
              ...config,
              users: response.users
            });
          }
        } catch (error) {
          console.error(`Error fetching users for role ${config.displayName}:`, error);
        }
      }

      setRoleGroups(groups);
    } catch (error) {
      console.error('Error fetching role groups:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded && roleGroups.length === 0) {
      fetchUsersByRole();
    }
  }, [isExpanded]);

  const handleRoleToggle = (roleId: number) => {
    setExpandedRole(expandedRole === roleId ? null : roleId);
  };

  const handleViewAsRole = (role: RoleGroup & { dashboardPath?: string }) => {
    setRoleView(role.roleName, role.roleId, role.displayName);
    toast.success(`Now viewing as ${role.displayName}. Navigate to role-specific pages to see their view.`);
    setIsExpanded(false);

    // Navigate to dashboard to refresh the view with new role context
    if (role.dashboardPath) {
      navigate(role.dashboardPath);
    }
  };

  const handleResetView = () => {
    resetToAdminView();
    navigate('/admin/dashboard');
    toast.success('Returned to Admin view');
  };

  // Don't show for non-admin users
  if (user?.role !== 'admin' && user?.role_id !== 1) {
    return null;
  }

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        title="Role Navigator"
      >
        <UserGroupIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      {/* Current View Indicator */}
      {viewingAsRoleName && (
        <div className="mb-3 px-2">
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <div>
              <p className="text-xs font-medium text-blue-900">Viewing as</p>
              <p className="text-sm font-semibold text-blue-700">{viewingAsRoleName}</p>
            </div>
            <button
              onClick={handleResetView}
              className="text-blue-600 hover:text-blue-800 transition-colors"
              title="Return to Admin view"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Role Navigator Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center space-x-2">
          <UserGroupIcon className="w-5 h-5 text-indigo-600" />
          <span>Role Navigator</span>
        </div>
        {isExpanded ? (
          <ChevronDownIcon className="w-4 h-4" />
        ) : (
          <ChevronRightIcon className="w-4 h-4" />
        )}
      </button>

      {/* Role Groups Dropdown */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 overflow-hidden"
          >
            <div className="space-y-1 px-2">
              {loading ? (
                <div className="text-xs text-gray-500 py-2 text-center">Loading...</div>
              ) : roleGroups.length === 0 ? (
                <div className="text-xs text-gray-500 py-2 text-center">No users found</div>
              ) : (
                roleGroups.map((roleGroup) => (
                  <div key={roleGroup.roleId} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Role Header */}
                    <button
                      onClick={() => handleRoleToggle(roleGroup.roleId)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${roleGroup.color}`}>
                          {roleGroup.displayName}
                        </span>
                        <span className="text-xs text-gray-500">({roleGroup.users.length})</span>
                      </div>
                      {expandedRole === roleGroup.roleId ? (
                        <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4 text-gray-500" />
                      )}
                    </button>

                    {/* Users List */}
                    <AnimatePresence>
                      {expandedRole === roleGroup.roleId && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-white">
                            {/* View All Users in Role Button */}
                            <button
                              onClick={() => handleViewAsRole(roleGroup)}
                              className="w-full px-4 py-2 text-left text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors border-b border-gray-100"
                            >
                              View All {roleGroup.displayName}s
                            </button>

                            {/* Individual Users (first 5) */}
                            {roleGroup.users.slice(0, 5).map((userItem) => (
                              <div
                                key={userItem.user_id}
                                className="px-4 py-2 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                              >
                                <div className="text-xs">
                                  <p className="font-medium text-gray-900">{userItem.full_name}</p>
                                  <p className="text-gray-500 truncate">{userItem.email}</p>
                                </div>
                              </div>
                            ))}

                            {roleGroup.users.length > 5 && (
                              <div className="px-4 py-2 text-xs text-gray-500 text-center">
                                +{roleGroup.users.length - 5} more users
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
