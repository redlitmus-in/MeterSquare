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
  RefreshCw
} from 'lucide-react';
import { showSuccess, showError } from '@/utils/toastHelper';
import { formatDateTimeLocal } from '@/utils/dateFormatter';
import { adminApi, User, Role, CreateUserData, LoginHistoryRecord } from '@/api/admin';
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

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, [currentPage, searchQuery, selectedRole, statusFilter]);

  const handleViewLoginHistory = (user: User) => {
    setSelectedUserForHistory(user);
    setShowLoginHistoryModal(true);
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
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Add User
          </button>
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
                            <p className="font-medium text-gray-900">{user.full_name || 'No name'}</p>
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
                                  <span>• IP: {record.ip_address}</span>
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

// PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(UserManagement);
