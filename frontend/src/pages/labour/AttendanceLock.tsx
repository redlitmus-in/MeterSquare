/**
 * Attendance Lock Page
 * Project Manager: Review and lock attendance data (Step 7)
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { labourService, DailyAttendance } from '@/services/labourService';
import { showSuccess, showError } from '@/utils/toastHelper';
import {
  LockClosedIcon,
  ClockIcon,
  CheckCircleIcon,
  EyeIcon,
  XMarkIcon,
  LockOpenIcon
} from '@heroicons/react/24/outline';

// Tab configuration
type TabType = 'pending' | 'locked';

interface TabConfig {
  key: TabType;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { key: 'pending', label: 'Pending Lock', color: 'text-yellow-700', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500', icon: LockOpenIcon },
  { key: 'locked', label: 'Locked', color: 'text-green-700', bgColor: 'bg-green-100', borderColor: 'border-green-500', icon: LockClosedIcon },
];

const AttendanceLock: React.FC = () => {
  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [lockingAll, setLockingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<DailyAttendance | null>(null);
  const [projects, setProjects] = useState<Array<{ project_id: number; project_code: string; project_name: string }>>([]);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const result = await labourService.getAttendanceToLock(projectId, selectedDate || undefined, activeTab);
      if (result.success) {
        setAttendance(result.data);
      } else {
        showError(result.message || 'Failed to fetch attendance');
      }
    } catch {
      showError('Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [projectId, selectedDate, activeTab]);

  useEffect(() => {
    // Fetch projects for dropdown
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects');
        const data = await response.json();
        if (data.success) {
          setProjects(data.projects || []);
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      }
    };
    fetchProjects();
  }, []);

  const handleLock = async (attendanceId: number) => {
    setProcessing(attendanceId);
    const result = await labourService.lockAttendance(attendanceId, 'Approved for payroll');
    if (result.success) {
      showSuccess('Attendance locked');
      fetchAttendance();
    } else {
      showError(result.message || 'Failed to lock attendance');
    }
    setProcessing(null);
  };

  const handleLockAll = async () => {
    if (!projectId || !selectedDate) {
      showError('Please select project and date to lock all');
      return;
    }

    setLockingAll(true);
    const result = await labourService.lockDayAttendance(projectId, selectedDate, 'Bulk approved for payroll');
    if (result.success) {
      showSuccess(`Locked ${result.locked_count} attendance records`);
      fetchAttendance();
    } else {
      showError(result.message || 'Failed to lock attendance');
    }
    setLockingAll(false);
  };

  const handleViewDetails = (record: DailyAttendance) => {
    setSelectedAttendance(record);
    setShowDetailsModal(true);
  };

  const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  const getStatusBadge = (status: string) => {
    if (status === 'locked') {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1">
          <LockClosedIcon className="w-3 h-3" /> Locked
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
        <ClockIcon className="w-3 h-3" /> Pending Lock
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Lock</h1>
        <p className="text-gray-600">Review and lock attendance data for payroll processing</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                isActive
                  ? `${tab.bgColor} ${tab.color} border-b-2 ${tab.borderColor}`
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Select Project
            </span>
          </label>
          <select
            value={projectId || ''}
            onChange={(e) => setProjectId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900"
          >
            <option value="">All Projects</option>
            {projects.map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.project_code} - {project.project_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Date
            </span>
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
        </div>
        <div className="flex-1" />
        {activeTab === 'pending' && projectId && selectedDate && attendance.length > 0 && (
          <button
            onClick={handleLockAll}
            disabled={lockingAll}
            className="self-end flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {lockingAll ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <LockClosedIcon className="w-5 h-5" />
            )}
            Lock All for Day
          </button>
        )}
      </div>

      {/* Attendance Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : attendance.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {activeTab === 'pending' ? 'All caught up!' : 'No locked records'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'pending'
              ? 'No attendance records pending lock.'
              : 'No locked attendance records found.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Clock Out</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Overtime</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {attendance.map((record) => (
                <motion.tr
                  key={record.attendance_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50"
                >
                  <td className="px-5 py-4 text-sm text-gray-900">
                    {formatDate(record.attendance_date)}
                  </td>
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{record.worker_name}</p>
                      <p className="text-sm text-gray-500">{record.worker_code}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {record.project_name || `#${record.project_id}`}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {formatTime(record.clock_in_time)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {formatTime(record.clock_out_time)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-900 font-medium">
                    {formatDuration(record.regular_hours)}
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {record.overtime_hours && record.overtime_hours > 0 ? (
                      <span className="text-orange-600 font-medium">{formatDuration(record.overtime_hours)}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-900 font-medium">
                    AED {record.total_cost?.toFixed(2) || '-'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewDetails(record)}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50"
                      >
                        <EyeIcon className="w-4 h-4" />
                        View
                      </button>
                      {activeTab === 'pending' && (
                        <button
                          onClick={() => handleLock(record.attendance_id)}
                          disabled={processing === record.attendance_id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 text-white text-sm rounded-md hover:bg-teal-700 disabled:opacity-50"
                        >
                          {processing === record.attendance_id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <LockClosedIcon className="w-4 h-4" />
                          )}
                          Lock
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Details Modal */}
      {showDetailsModal && selectedAttendance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedAttendance.worker_name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selectedAttendance.worker_code} • {formatDate(selectedAttendance.attendance_date)}</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Status Badges */}
            <div className="flex gap-2 px-5 py-3 border-b border-gray-100">
              {getStatusBadge(selectedAttendance.approval_status)}
              <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                {selectedAttendance.attendance_status || 'present'}
              </span>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5">
              {/* Two-column grid layout */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">PROJECT</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedAttendance.project_name || `Project #${selectedAttendance.project_id}`}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">ENTERED BY</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedAttendance.entered_by_role}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">CLOCK IN</p>
                  <p className="mt-1 text-sm text-gray-900">{formatTime(selectedAttendance.clock_in_time)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">CLOCK OUT</p>
                  <p className="mt-1 text-sm text-gray-900">{formatTime(selectedAttendance.clock_out_time)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">REGULAR HOURS</p>
                  <p className="mt-1 text-sm text-gray-900">{formatDuration(selectedAttendance.regular_hours)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">OVERTIME HOURS</p>
                  <p className="mt-1 text-sm text-gray-900">{formatDuration(selectedAttendance.overtime_hours)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">TOTAL HOURS</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{formatDuration(selectedAttendance.total_hours)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">HOURLY RATE</p>
                  <p className="mt-1 text-sm text-gray-900">AED {selectedAttendance.hourly_rate?.toFixed(2) || '0.00'}</p>
                </div>
                {selectedAttendance.break_duration_minutes > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">BREAK</p>
                    <p className="mt-1 text-sm text-gray-900">{selectedAttendance.break_duration_minutes} min</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">OT MULTIPLIER</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedAttendance.overtime_rate_multiplier || 1.5}x</p>
                </div>
              </div>

              {/* Total Cost */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">TOTAL COST</p>
                  <p className="text-lg font-semibold text-gray-900">AED {selectedAttendance.total_cost?.toFixed(2) || '0.00'}</p>
                </div>
              </div>

              {/* Approval Info (if locked) */}
              {selectedAttendance.approval_status === 'locked' && selectedAttendance.approved_by_name && (
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <LockClosedIcon className="w-4 h-4" />
                    <span>Locked by {selectedAttendance.approved_by_name}</span>
                    {selectedAttendance.approval_date && (
                      <span className="text-gray-500">• {new Date(selectedAttendance.approval_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-200">
              {selectedAttendance.approval_status !== 'locked' ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      handleLock(selectedAttendance.attendance_id);
                    }}
                    className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium"
                  >
                    Lock Attendance
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AttendanceLock;
