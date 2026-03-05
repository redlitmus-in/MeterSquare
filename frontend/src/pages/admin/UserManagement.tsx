/**
 * Admin User Management Page
 * Complete CRUD operations for managing system users
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Plus,
  Search,
  UserCheck,
  UserX,
  X,
  Check,
  Mail,
  Phone,
  History,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  LogOut,
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Shield
} from 'lucide-react';
import { showSuccess, showError } from '@/utils/toastHelper';
import { formatDateTimeLocal } from '@/utils/dateFormatter';
import { adminApi, User, Role, CreateUserData, LoginHistoryRecord, OnlineUserRecord, SuspiciousAlert } from '@/api/admin';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<boolean | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLoginHistoryModal, setShowLoginHistoryModal] = useState(false);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<User | null>(null);
  const [showOnlineUsersModal, setShowOnlineUsersModal] = useState(false);
  const [showSecurityAlerts, setShowSecurityAlerts] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState<SuspiciousAlert[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [showResolvedAlerts, setShowResolvedAlerts] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    adminApi.getSecurityAlerts(true).then(res => setUnresolvedCount(res.unresolved_count)).catch(() => {});
  }, [currentPage, searchQuery, selectedRole, statusFilter]);

  const handleViewLoginHistory = (user: User) => {
    setSelectedUserForHistory(user);
    setShowLoginHistoryModal(true);
  };

  const fetchSecurityAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const res = await adminApi.getSecurityAlerts(false);
      setSecurityAlerts(res.data);
      setUnresolvedCount(res.unresolved_count);
    } catch (err) {
      showError('Failed to load security alerts');
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleResolveAlert = async (alertId: number) => {
    try {
      const res = await adminApi.resolveAlert(alertId);
      showSuccess(res.message);
      fetchSecurityAlerts();
    } catch (err: any) {
      showError('Failed to resolve alert', { description: err.response?.data?.error });
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await adminApi.getUsers({
        page: currentPage,
        per_page: 20,
        search: searchQuery || undefined,
        role_id: selectedRole || undefined,
        is_active: statusFilter !== null ? statusFilter : undefined
      });
      setUsers(response.users);
      setTotalPages(response.pagination.pages);
      setTotalUsers(response.pagination.total);
    } catch (error: any) {
      showError('Failed to fetch users', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await adminApi.getRoles();
      setRoles(response.roles);
    } catch (error: any) {
      console.error('Error fetching roles:', error);
    }
  };

  const handleCreateUser = async (userData: CreateUserData) => {
    try {
      await adminApi.createUser(userData);
      showSuccess('User created successfully');
      setShowCreateModal(false);
      fetchUsers();
    } catch (error: any) {
      showError('Failed to create user', {
        description: error.response?.data?.error || error.message
      });
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await adminApi.toggleUserStatus(user.user_id, !user.is_active);
      showSuccess(`User ${!user.is_active ? 'activated' : 'deactivated'} successfully`);
      fetchUsers();
    } catch (error: any) {
      showError('Failed to update user status', {
        description: error.response?.data?.error || error.message
      });
    }
  };

  const handleBlockToggle = async (user: User) => {
    if (user.is_blocked) {
      if (!window.confirm(`Unblock ${user.full_name}? They will be able to log in again.`)) return;
      try {
        const res = await adminApi.unblockUser(user.user_id);
        showSuccess(res.message);
        fetchUsers();
      } catch (err: any) {
        showError('Failed to unblock user', { description: err.response?.data?.error });
      }
    } else {
      const reason = window.prompt(`Reason for blocking ${user.full_name}:`, 'Blocked by administrator');
      if (reason === null) return;
      try {
        const res = await adminApi.blockUser(user.user_id, reason || 'Blocked by administrator');
        showSuccess(res.message);
        fetchUsers();
      } catch (err: any) {
        showError('Failed to block user', { description: err.response?.data?.error });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="w-8 h-8 text-[#243d8a]" />
              User Management
            </h1>
            <p className="text-gray-500 mt-1">Manage system users and permissions</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowSecurityAlerts(true); fetchSecurityAlerts(); }}
              className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium"
            >
              <AlertTriangle className="w-4 h-4" />
              Security Alerts
              {unresolvedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-600 text-white rounded-full font-bold">
                  {unresolvedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowOnlineUsersModal(true)}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-md"
            >
              <Wifi className="w-5 h-5" />
              Online Status
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors shadow-md"
            >
              <Plus className="w-5 h-5" />
              Add User
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Role Filter */}
          <select
            value={selectedRole || ''}
            onChange={(e) => setSelectedRole(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Roles</option>
            {roles.map((role) => (
              <option key={role.role_id} value={role.role_id}>
                {role.role} ({role.user_count})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter === null ? '' : statusFilter ? 'active' : 'inactive'}
            onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value === 'active')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Active Filters Display */}
        {(searchQuery || selectedRole || statusFilter !== null) && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-gray-500">Active filters:</span>
            {searchQuery && (
              <span className="px-2 py-1 bg-blue-100 text-[#1e3270] text-xs rounded-full flex items-center gap-1">
                Search: {searchQuery}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setSearchQuery('')} />
              </span>
            )}
            {selectedRole && (
              <span className="px-2 py-1 bg-blue-100 text-[#1e3270] text-xs rounded-full flex items-center gap-1">
                Role: {roles.find(r => r.role_id === selectedRole)?.role}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedRole(null)} />
              </span>
            )}
            {statusFilter !== null && (
              <span className="px-2 py-1 bg-blue-100 text-[#1e3270] text-xs rounded-full flex items-center gap-1">
                Status: {statusFilter ? 'Active' : 'Inactive'}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setStatusFilter(null)} />
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedRole(null);
                setStatusFilter(null);
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center">
            <ModernLoadingSpinners size="lg" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No users found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">User</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Email</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Role</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Department</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Status</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <motion.tr
                      key={user.user_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-[#243d8a]">
                              {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase() : user.email[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 flex items-center flex-wrap gap-1">
                              {user.full_name || 'No name'}
                              {user.is_blocked && (
                                <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded font-medium ml-1">Blocked</span>
                              )}
                            </p>
                            {user.phone && (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {user.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm text-gray-700 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          {user.email}
                        </p>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                          {user.role_name || `Role ID: ${user.role_id}`}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600">{user.department || '-'}</td>
                      <td className="py-4 px-6">
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                            user.is_active
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } transition-colors`}
                        >
                          {user.is_active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-500">
                        <button
                          onClick={() => handleViewLoginHistory(user)}
                          className="flex items-center gap-2 hover:bg-blue-50 rounded-lg px-2 py-1 -mx-2 transition-colors group"
                          title="View login history"
                        >
                          {user.last_login ? (
                            <div className="flex flex-col text-left">
                              <span className="font-medium text-gray-700">
                                {formatDateTimeLocal(user.last_login).split(',')[0]}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatDateTimeLocal(user.last_login).split(',')[1]?.trim()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Never logged in</span>
                          )}
                          <History className="w-4 h-4 text-gray-400 group-hover:text-[#243d8a] transition-colors" />
                        </button>
                        <button
                          onClick={() => handleBlockToggle(user)}
                          title={user.is_blocked ? 'Unblock user' : 'Block user'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            user.is_blocked
                              ? 'text-green-500 hover:bg-green-50 hover:text-green-700'
                              : 'text-orange-400 hover:bg-orange-50 hover:text-orange-600'
                          }`}
                        >
                          {user.is_blocked ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing {users.length} of {totalUsers} users
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-1 text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create User Modal */}
      <UserFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateUser}
        roles={roles}
        title="Create New User"
      />

      {/* Login History Modal */}
      {selectedUserForHistory && (
        <LoginHistoryModal
          isOpen={showLoginHistoryModal}
          onClose={() => {
            setShowLoginHistoryModal(false);
            setSelectedUserForHistory(null);
          }}
          user={selectedUserForHistory}
        />
      )}

      {/* Online Users Modal */}
      <OnlineUsersModal
        isOpen={showOnlineUsersModal}
        onClose={() => setShowOnlineUsersModal(false)}
      />

      {/* Security Alerts Modal */}
      {showSecurityAlerts && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-semibold text-gray-800">Security Alerts</h2>
                {unresolvedCount > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full font-medium">
                    {unresolvedCount} unresolved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowResolvedAlerts(prev => !prev)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  {showResolvedAlerts ? 'Hide Resolved' : 'Show All'}
                </button>
                <button
                  onClick={fetchSecurityAlerts}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setShowSecurityAlerts(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {loadingAlerts ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
              ) : (() => {
                const displayed = showResolvedAlerts ? securityAlerts : securityAlerts.filter(a => !a.is_resolved);
                if (displayed.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-400 flex flex-col items-center gap-2">
                      <Shield className="w-8 h-8 text-gray-300" />
                      <span>{showResolvedAlerts ? 'No alerts found' : 'No unresolved alerts'}</span>
                    </div>
                  );
                }
                return displayed.map(alert => (
                  <div
                    key={alert.id}
                    className={`rounded-lg border p-3 ${alert.is_resolved ? 'bg-gray-50 border-gray-200 opacity-60' : alert.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${alert.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {alert.severity}
                          </span>
                          <span className="text-xs text-gray-500">{alert.alert_type.replace(/_/g, ' ')}</span>
                          {alert.is_resolved && <span className="text-xs text-green-600 font-medium">&#10003; Resolved</span>}
                        </div>
                        <p className="text-sm font-medium text-gray-800">{alert.description}</p>
                        <div className="text-xs text-gray-500 mt-1">
                          <span className="font-medium">{alert.user_name}</span>
                          {alert.user_email && <span> &middot; {alert.user_email}</span>}
                          <span> &middot; {new Date(alert.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      {!alert.is_resolved && (
                        <button
                          onClick={() => handleResolveAlert(alert.id)}
                          title="Mark as resolved"
                          className="shrink-0 p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// User Form Modal Component
interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserData) => void;
  roles: Role[];
  title: string;
}

const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  roles,
  title
}) => {
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    full_name: '',
    role_id: roles[0]?.role_id || 0,
    phone: '',
    department: ''
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        email: '',
        full_name: '',
        role_id: roles[0]?.role_id || 0,
        phone: '',
        department: ''
      });
    }
  }, [isOpen, roles]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {roles.map((role) => (
                      <option key={role.role_id} value={role.role_id}>
                        {role.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formData.role_id === 0 || roles.length === 0}
                    className="px-4 py-2 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    Create
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};


// Login History Modal Component
interface LoginHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

const LoginHistoryModal: React.FC<LoginHistoryModalProps> = ({
  isOpen,
  onClose,
  user
}) => {
  const [loginHistory, setLoginHistory] = useState<LoginHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Reset page when user changes
  useEffect(() => {
    if (isOpen && user) {
      setCurrentPage(1);
    }
  }, [isOpen, user?.user_id]);

  useEffect(() => {
    if (isOpen && user) {
      fetchLoginHistory();
    }
  }, [isOpen, user?.user_id, currentPage]);

  const fetchLoginHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminApi.getUserLoginHistory(user.user_id, {
        page: currentPage,
        per_page: 10
      });
      setLoginHistory(response.login_history);
      setTotalPages(response.pagination.pages);
      setTotalRecords(response.pagination.total);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message;
      setError(errorMessage);
      showError('Failed to fetch login history', {
        description: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="w-4 h-4" />;
      case 'tablet':
        return <Tablet className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Active</span>;
      case 'logged_out':
        return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">Logged Out</span>;
      case 'expired':
        return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">Expired</span>;
      default:
        return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{status}</span>;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-[#243d8a]" />
                    Login History
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {user.full_name || user.email} • {totalRecords} total logins
                  </p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <ModernLoadingSpinners size="md" />
                  </div>
                ) : error ? (
                  <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <p className="text-red-600 font-medium">Failed to load login history</p>
                    <p className="text-xs text-gray-500 mt-1">{error}</p>
                    <button
                      onClick={fetchLoginHistory}
                      className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 flex items-center gap-2 mx-auto transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Try Again
                    </button>
                  </div>
                ) : loginHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No login history found</p>
                    <p className="text-xs text-gray-400 mt-1">Login records will appear here after the user logs in</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {loginHistory.map((record) => (
                      <div
                        key={record.id}
                        className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-white rounded-lg border border-gray-200">
                              {getDeviceIcon(record.device_type)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  {formatDateTimeLocal(record.login_at).split(',')[0]}
                                </span>
                                <span className="text-gray-500">
                                  {formatDateTimeLocal(record.login_at).split(',')[1]?.trim()}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                                {record.browser && (
                                  <span className="flex items-center gap-1">
                                    <Globe className="w-3 h-3" />
                                    {record.browser}
                                  </span>
                                )}
                                {record.os && (
                                  <span>• {record.os}</span>
                                )}
                                {record.ip_address && (
                                  <span>• IP: {formatIP(record.ip_address)}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full">
                                  {record.login_method === 'email_otp' ? 'Email OTP' : 'SMS OTP'}
                                </span>
                                {getStatusBadge(record.status)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// Online Users Modal Component
interface OnlineUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatIP = (ip?: string): string => {
  if (!ip) return '';
  if (ip === '127.0.0.1' || ip === '::1') return 'Local';
  // Private ranges: 10.x, 192.168.x, 172.16-31.x
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return ip;
  return ip;
};

const ROLE_COLORS: Record<string, string> = {
  pm: 'bg-blue-100 text-blue-700',
  td: 'bg-purple-100 text-purple-700',
  se: 'bg-orange-100 text-orange-700',
  estimator: 'bg-yellow-100 text-yellow-700',
  buyer: 'bg-pink-100 text-pink-700',
  vendor: 'bg-teal-100 text-teal-700',
};

const getRoleColor = (role: string) =>
  ROLE_COLORS[role.toLowerCase()] ?? 'bg-gray-100 text-gray-700';

const OnlineUsersModal: React.FC<OnlineUsersModalProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<OnlineUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [summary, setSummary] = useState({ total: 0, online: 0, offline: 0 });

  const [loggingOutId, setLoggingOutId] = useState<number | null>(null);

  const handleForceLogout = async (user: OnlineUserRecord) => {
    if (!window.confirm(`Force logout ${user.full_name}? Their session will be terminated immediately.`)) return;
    setLoggingOutId(user.user_id);
    try {
      const res = await adminApi.forceLogout(user.user_id);
      showSuccess(res.message);
      fetchOnlineUsers();
    } catch (err: any) {
      showError('Failed to force logout', { description: err.response?.data?.error || err.message });
    } finally {
      setLoggingOutId(null);
    }
  };

  const fetchOnlineUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminApi.getOnlineUsers();
      setUsers(response.users);
      setSummary(response.summary);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch user status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchOnlineUsers();
  }, [isOpen]);

  const filteredUsers = users.filter((u) => {
    if (filter === 'online') return u.is_online;
    if (filter === 'offline') return !u.is_online;
    return true;
  });

  const getDeviceIcon = (deviceType?: string) => {
    if (deviceType === 'mobile') return <Smartphone className="w-3.5 h-3.5" />;
    if (deviceType === 'tablet') return <Tablet className="w-3.5 h-3.5" />;
    return <Monitor className="w-3.5 h-3.5" />;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Wifi className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">User Online Status</h2>
                    {!isLoading && (
                      <p className="text-xs text-gray-500">
                        {summary.online} online · {summary.offline} offline · {summary.total} total
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchOnlineUsers}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 px-6 py-3 border-b border-gray-100 bg-gray-50">
                {(['all', 'online', 'offline'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors capitalize ${
                      filter === tab
                        ? tab === 'online'
                          ? 'bg-emerald-100 text-emerald-700'
                          : tab === 'offline'
                          ? 'bg-gray-200 text-gray-700'
                          : 'bg-[#243d8a] text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {tab === 'all' ? `All (${summary.total})` : tab === 'online' ? `Online (${summary.online})` : `Offline (${summary.offline})`}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <ModernLoadingSpinners type="spinner" size="md" color="blue" />
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center py-10 text-red-500 gap-2">
                    <AlertCircle className="w-8 h-8" />
                    <p className="text-sm">{error}</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-gray-400 gap-2">
                    <WifiOff className="w-10 h-10" />
                    <p className="text-sm">No users found</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      {/* Status dot */}
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                          {user.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            user.is_online ? 'bg-emerald-500' : 'bg-gray-400'
                          }`}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm truncate">{user.full_name}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getRoleColor(user.role)}`}>
                            {user.role}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                              user.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {user.is_online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                        {user.is_online && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                            {user.device_type && (
                              <span className="flex items-center gap-1">
                                {getDeviceIcon(user.device_type)}
                                {user.browser} · {user.os}
                              </span>
                            )}
                            {user.ip_address && (
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {formatIP(user.ip_address)}
                              </span>
                            )}
                            {user.last_login_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Since {formatDateTimeLocal(user.last_login_at).split(',')[0]}
                              </span>
                            )}
                          </div>
                        )}
                        {!user.is_online && user.last_login_at && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Last seen: {formatDateTimeLocal(user.last_login_at)}
                          </p>
                        )}
                        {!user.is_online && !user.last_login_at && (
                          <p className="text-xs text-gray-400 mt-0.5">Never logged in</p>
                        )}
                      </div>
                      {user.is_online && (
                        <button
                          onClick={() => handleForceLogout(user)}
                          disabled={loggingOutId === user.user_id}
                          className="ml-auto flex-shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Force logout"
                        >
                          {loggingOutId === user.user_id
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <LogOut className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(UserManagement);
