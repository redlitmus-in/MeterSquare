/**
 * Admin Role Management Page
 * View and manage system roles and permissions
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Users,
  Lock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  TrendingUp,
  Award
} from 'lucide-react';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { adminApi, Role } from '@/api/admin';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const RoleManagement: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getRoles();
      setRoles(response.roles);
    } catch (error: any) {
      showError('Failed to fetch roles', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleTierColor = (tier?: string) => {
    switch (tier?.toLowerCase()) {
      case 'executive':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'management':
        return 'bg-blue-100 text-[#243d8a] border-blue-200';
      case 'operational':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'support':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getRoleLevelIcon = (level?: number) => {
    if (level === 0) return <Award className="w-5 h-5 text-yellow-500" />;
    if (level && level <= 2) return <TrendingUp className="w-5 h-5 text-blue-500" />;
    return <Users className="w-5 h-5 text-gray-500" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Shield className="w-8 h-8 text-[#243d8a]" />
              Role Management
            </h1>
            <p className="text-gray-500 mt-1">View system roles, permissions and hierarchy</p>
          </div>
          <button
            onClick={fetchRoles}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className="w-5 h-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex items-center justify-center">
            <ModernLoadingSpinners variant="pulse-wave" size="lg" />
          </div>
        ) : roles.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No roles found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roles.map((role, index) => (
              <motion.div
                key={role.role_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Card Header */}
                <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getRoleLevelIcon(role.level)}
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{role.role}</h3>
                        {role.level !== undefined && (
                          <p className="text-xs text-gray-500">Level {role.level}</p>
                        )}
                      </div>
                    </div>
                    {role.is_active ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {role.tier && (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getRoleTierColor(role.tier)}`}>
                      {role.tier}
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-5">
                  {/* Description */}
                  {role.description && (
                    <p className="text-sm text-gray-600 mb-4">{role.description}</p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-[#243d8a]" />
                        <span className="text-xs text-gray-600">Users</span>
                      </div>
                      <p className="text-xl font-bold text-[#243d8a]">{role.user_count || 0}</p>
                    </div>

                    {role.approval_limit && (
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Lock className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-gray-600">Approval</span>
                        </div>
                        <p className="text-xl font-bold text-green-600">
                          {role.approval_limit === -1 ? '∞' : `AED${role.approval_limit / 100000}L`}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Permissions */}
                  {role.permissions && Array.isArray(role.permissions) && role.permissions.length > 0 && (
                    <div className="border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-medium text-gray-600">KEY PERMISSIONS</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.slice(0, 6).map((permission, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                          >
                            {permission}
                          </span>
                        ))}
                        {role.permissions.length > 6 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">
                            +{role.permissions.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Status</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        role.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {role.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleManagement;
