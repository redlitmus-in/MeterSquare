/**
 * Attendance Logs Page
 * Site Engineer: Clock-in/clock-out workers (Step 6)
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { labourService, DailyAttendance, LabourRequisition } from '@/services/labourService';
import { apiClient } from '@/api/config';
import { PAGINATION } from '@/lib/constants';
import { showSuccess, showError } from '@/utils/toastHelper';
import {
  ClockIcon,
  PlayIcon,
  StopIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';

// Project interface
interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
}

// Labour role for dropdown
interface LabourRole {
  role: string;
  requisition_code?: string;
}

const AttendanceLogs: React.FC = () => {
  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [processing, setProcessing] = useState<number | null>(null);
  const [summary, setSummary] = useState<any>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Labour role selection for clock-in
  const [labourRoles, setLabourRoles] = useState<LabourRole[]>([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [pendingClockIn, setPendingClockIn] = useState<{ workerId: number; hourlyRate: number } | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');

  // Fetch SE's assigned projects
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await apiClient.get('/projects/assigned-to-me');
      const projectList = response.data?.projects || response.data || [];
      setProjects(projectList);
      if (projectList.length > 0 && !selectedProject) {
        setSelectedProject(projectList[0]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      showError('Failed to fetch your projects');
    }
    setLoadingProjects(false);
  };

  const fetchAttendance = async () => {
    if (!selectedProject) return;
    setLoading(true);
    const result = await labourService.getDailyAttendance(selectedProject.project_id, selectedDate);
    if (result.success) {
      setAttendance(result.data);
      setSummary(result.summary);
    } else {
      setAttendance([]);
      setSummary(null);
    }
    setLoading(false);
  };

  // Fetch labour roles from project requisitions
  const fetchLabourRoles = async () => {
    if (!selectedProject) return;
    const result = await labourService.getRequisitionsByProject(selectedProject.project_id);
    if (result.success) {
      // Extract unique labour roles from approved requisitions
      const roles: LabourRole[] = [];
      const seenRoles = new Set<string>();

      result.data
        .filter((req: LabourRequisition) => req.status === 'approved')
        .forEach((req: LabourRequisition) => {
          // Handle new JSONB labour_items array
          if (req.labour_items && Array.isArray(req.labour_items)) {
            req.labour_items.forEach((item) => {
              const role = item.skill_required || item.work_description;
              if (role && !seenRoles.has(role.toLowerCase())) {
                seenRoles.add(role.toLowerCase());
                roles.push({
                  role: role,
                  requisition_code: req.requisition_code
                });
              }
            });
          }
          // Handle deprecated single fields
          else if (req.skill_required && !seenRoles.has(req.skill_required.toLowerCase())) {
            seenRoles.add(req.skill_required.toLowerCase());
            roles.push({
              role: req.skill_required,
              requisition_code: req.requisition_code
            });
          }
        });

      setLabourRoles(roles);
    } else {
      console.warn('Could not fetch labour roles:', result.message);
      setLabourRoles([]);
    }
  };

  // Handle Escape key to close modal
  useEffect(() => {
    if (!showRoleModal) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRoleModal(false);
        setPendingClockIn(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showRoleModal]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchAttendance();
      fetchLabourRoles();
    }
  }, [selectedProject, selectedDate]);

  // Show role selection modal before clock-in
  const initiateClockIn = (workerId: number, hourlyRate: number) => {
    if (!selectedProject) return;
    if (labourRoles.length > 0) {
      // Show role selection modal
      setPendingClockIn({ workerId, hourlyRate });
      setSelectedRole(labourRoles[0]?.role || '');
      setShowRoleModal(true);
    } else {
      // No roles available, clock in without role
      handleClockIn(workerId, hourlyRate, undefined);
    }
  };

  // Confirm clock-in with selected role
  const confirmClockIn = () => {
    if (!pendingClockIn) return;
    setShowRoleModal(false);
    handleClockIn(pendingClockIn.workerId, pendingClockIn.hourlyRate, selectedRole || undefined);
    setPendingClockIn(null);
  };

  const handleClockIn = async (workerId: number, hourlyRate: number, labourRole?: string) => {
    if (!selectedProject) return;
    setProcessing(workerId);
    const now = new Date().toISOString();
    const result = await labourService.clockIn({
      worker_id: workerId,
      project_id: selectedProject.project_id,
      attendance_date: selectedDate,
      clock_in_time: now,
      hourly_rate: hourlyRate,
      labour_role: labourRole
    });
    if (result.success) {
      showSuccess('Worker clocked in');
      fetchAttendance();
    } else {
      showError(result.message || 'Failed to clock in');
    }
    setProcessing(null);
  };

  const handleClockOut = async (attendanceId: number) => {
    setProcessing(attendanceId);
    const now = new Date().toISOString();
    const result = await labourService.clockOut(attendanceId, now);
    if (result.success) {
      showSuccess('Worker clocked out');
      fetchAttendance();
    } else {
      showError(result.message || 'Failed to clock out');
    }
    setProcessing(null);
  };

  const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Smart duration format: show minutes if < 1 hour, otherwise show hours
  const formatDuration = (hours: number | undefined | null) => {
    if (hours === undefined || hours === null) return '-';
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes} min`;
    }
    return `${hours.toFixed(1)} hrs`;
  };

  // Pagination calculations
  const totalRecords = attendance.length;
  const totalPages = Math.ceil(totalRecords / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedAttendance = attendance.slice(
    (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE,
    currentPage * PAGINATION.DEFAULT_PAGE_SIZE
  );

  // Reset page when attendance data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [attendance.length, selectedProject?.project_id, selectedDate]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Logs</h1>
        <p className="text-gray-600">Track worker clock-in and clock-out times</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Project Dropdown */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <BuildingOfficeIcon className="w-4 h-4 inline mr-1" />
              Select Project
            </label>
            {loadingProjects ? (
              <div className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
                <div className="animate-pulse h-5 bg-gray-200 rounded w-3/4"></div>
              </div>
            ) : projects.length === 0 ? (
              <div className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
                No projects assigned to you
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedProject?.project_id || ''}
                  onChange={(e) => {
                    const proj = projects.find(p => p.project_id === parseInt(e.target.value));
                    setSelectedProject(proj || null);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white pr-10"
                >
                  <option value="">Select a project...</option>
                  {projects.map(project => (
                    <option key={project.project_id} value={project.project_id}>
                      {project.project_code} - {project.project_name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Date Picker */}
          <div className="sm:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-blue-800">{summary.total_workers || 0}</p>
                <p className="text-sm text-blue-600">Total Workers</p>
              </div>
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <PlayIcon className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-800">{summary.clocked_in || 0}</p>
                <p className="text-sm text-green-600">Clocked In</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <StopIcon className="w-8 h-8 text-gray-600" />
              <div>
                <p className="text-2xl font-bold text-gray-800">{summary.clocked_out || 0}</p>
                <p className="text-sm text-gray-600">Clocked Out</p>
              </div>
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-purple-800">{formatDuration(summary.total_hours)}</p>
                <p className="text-sm text-purple-600">Total Time</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Table */}
      {!selectedProject ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Select a Project</h3>
          <p className="mt-1 text-sm text-gray-500">Choose a project from the dropdown to see attendance records.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : attendance.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No attendance records</h3>
          <p className="mt-1 text-sm text-gray-500">No workers have clocked in for this date.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock Out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedAttendance.map((record) => (
                <motion.tr
                  key={record.attendance_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{record.worker_name}</p>
                      <p className="text-sm text-gray-500">{record.worker_code}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {record.labour_role ? (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        {record.labour_role}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatTime(record.clock_in_time)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatTime(record.clock_out_time)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    {formatDuration(record.total_hours)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    AED {record.hourly_rate}/hr
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    {record.total_cost ? `AED ${record.total_cost.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      record.approval_status === 'locked'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {record.approval_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!record.clock_in_time ? (
                      <button
                        onClick={() => initiateClockIn(record.worker_id, record.hourly_rate)}
                        disabled={processing === record.worker_id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        <PlayIcon className="w-4 h-4" />
                        Clock In
                      </button>
                    ) : !record.clock_out_time ? (
                      <button
                        onClick={() => handleClockOut(record.attendance_id)}
                        disabled={processing === record.attendance_id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        <StopIcon className="w-4 h-4" />
                        Clock Out
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">Completed</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalRecords > 0 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {(currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE + 1} to{' '}
                {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, totalRecords)} of{' '}
                {totalRecords} records
                {totalPages > 1 && (
                  <span className="text-gray-500 ml-2">(Page {currentPage} of {totalPages})</span>
                )}
              </div>
              {totalPages > 1 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      const showPage =
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1);

                      if (!showPage) {
                        if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2 text-gray-500">...</span>;
                        }
                        return null;
                      }

                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            currentPage === page
                              ? 'bg-blue-600 text-white font-medium'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Labour Role Selection Modal */}
      {showRoleModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <WrenchScrewdriverIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 id="role-modal-title" className="text-lg font-semibold text-gray-900">Select Labour Role</h3>
                  <p className="text-sm text-gray-500">Choose the work type for this attendance</p>
                </div>
              </div>

              <div className="mb-6">
                <label htmlFor="labour-role-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Labour Role / Skill
                </label>
                <select
                  id="labour-role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {labourRoles.map((role) => (
                    <option key={`${role.role}-${role.requisition_code}`} value={role.role}>
                      {role.role}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  This links the attendance to the correct BOQ labour item for cost tracking
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRoleModal(false);
                    setPendingClockIn(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClockIn}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <PlayIcon className="w-4 h-4" />
                  Clock In
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AttendanceLogs;
