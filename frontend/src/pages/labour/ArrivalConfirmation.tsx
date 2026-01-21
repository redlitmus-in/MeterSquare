/**
 * Arrival Confirmation Page
 * Site Engineer: Confirm worker arrivals at site (Step 5)
 *
 * Flow:
 * 1. SE selects their project from dropdown (auto-loaded)
 * 2. SE selects date (defaults to today)
 * 3. Shows all assigned workers for that project/date
 * 4. SE marks workers as Arrived or No-Show when they come to site
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { labourService, LabourArrival } from '@/services/labourService';
import { apiClient } from '@/api/config';
import { showSuccess, showError } from '@/utils/toastHelper';
import {
  CheckCircleIcon,
  XCircleIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  ClockIcon,
  PhoneIcon,
  MapPinIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BuildingOfficeIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

// Project interface for assigned projects
interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
  location?: string;
}

const ArrivalConfirmation: React.FC = () => {
  const [arrivals, setArrivals] = useState<LabourArrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [processing, setProcessing] = useState<number | null>(null);

  // Clock out confirmation modal state
  const [clockOutModal, setClockOutModal] = useState<{
    isOpen: boolean;
    arrivalId: number | null;
    workerName: string;
  }>({ isOpen: false, arrivalId: null, workerName: '' });
  const [clockOutLoading, setClockOutLoading] = useState(false);

  // Multi-select state
  const [selectedArrivalIds, setSelectedArrivalIds] = useState<number[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Collapse state for requisition groups
  const [collapsedRequisitions, setCollapsedRequisitions] = useState<Set<number>>(new Set());

  // Toggle collapse for a requisition group
  const toggleRequisitionCollapse = (reqId: number) => {
    setCollapsedRequisitions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reqId)) {
        newSet.delete(reqId);
      } else {
        newSet.add(reqId);
      }
      return newSet;
    });
  };

  // Fetch SE's assigned projects
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await apiClient.get('/projects/assigned-to-me');
      const projectList = response.data?.projects || response.data || [];
      setProjects(projectList);
      // Auto-select first project if available
      if (projectList.length > 0 && !selectedProject) {
        setSelectedProject(projectList[0]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      showError('Failed to fetch your projects');
    }
    setLoadingProjects(false);
  };

  // Fetch arrivals for selected project and date
  const fetchArrivals = async () => {
    if (!selectedProject) return;
    setLoading(true);
    const result = await labourService.getArrivalsForDate(selectedProject.project_id, selectedDate);
    if (result.success) {
      // Filter out departed workers - they should only appear in attendance log
      const activeArrivals = result.data.filter((arrival: LabourArrival) => arrival.arrival_status !== 'departed');
      setArrivals(activeArrivals);
    } else {
      // Don't show error for empty results
      if (!result.message?.includes('No arrivals')) {
        showError(result.message || 'Failed to fetch arrivals');
      }
      setArrivals([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchArrivals();
    }
  }, [selectedProject, selectedDate]);

  // Clear selections when arrivals change
  useEffect(() => {
    setSelectedArrivalIds([]);
  }, [arrivals]);

  const handleConfirm = async (arrivalId: number, workerName: string) => {
    setProcessing(arrivalId);
    const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    // Check if this is a late arrival (was marked as no_show)
    const arrival = arrivals.find(a => a.arrival_id === arrivalId);
    const isLateArrival = arrival?.arrival_status === 'no_show';

    const result = await labourService.confirmArrival(arrivalId, now);
    if (result.success) {
      const message = isLateArrival
        ? `${workerName} marked as arrived late at ${now} ⏰`
        : `${workerName} marked as arrived at ${now}`;
      showSuccess(message);
      // Optimistic UI update - update state directly without refreshing
      setArrivals(prev => prev.map(arrival =>
        arrival.arrival_id === arrivalId
          ? { ...arrival, arrival_status: 'confirmed', arrival_time: now }
          : arrival
      ));
    } else {
      showError(result.message || 'Failed to confirm arrival');
    }
    setProcessing(null);
  };

  const handleNoShow = async (arrivalId: number, workerName: string) => {
    setProcessing(arrivalId);
    const result = await labourService.markNoShow(arrivalId);
    if (result.success) {
      showSuccess(`${workerName} marked as no-show`);
      // Optimistic UI update - update state directly without refreshing
      setArrivals(prev => prev.map(arrival =>
        arrival.arrival_id === arrivalId
          ? { ...arrival, arrival_status: 'no_show' }
          : arrival
      ));
    } else {
      showError(result.message || 'Failed to mark no-show');
    }
    setProcessing(null);
  };

  // Open clock out confirmation modal
  // Check if arrival/no-show buttons should be enabled based on shift time
  const canMarkArrival = (arrival: LabourArrival): { canArrive: boolean; canNoShow: boolean; reason: string } => {
    if (!arrival.requisition?.start_time || !arrival.requisition?.end_time) {
      return { canArrive: true, canNoShow: true, reason: "" }; // No time restrictions if times not set
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes

    // Parse shift times
    const [startHour, startMin] = arrival.requisition.start_time.split(":").map(Number);
    const [endHour, endMin] = arrival.requisition.end_time.split(":").map(Number);
    const shiftStart = startHour * 60 + startMin;
    const shiftEnd = endHour * 60 + endMin;

    // Handle overnight shifts (end_time < start_time)
    const isOvernightShift = shiftEnd < shiftStart;

    // Grace periods (in minutes)
    const BEFORE_SHIFT_GRACE = 30; // Can mark arrival 30 min before shift
    const NO_SHOW_THRESHOLD = 60; // Mark no-show after 1 hour of shift start

    let canArrive = false;
    let canNoShow = false;
    let reason = "";

    if (isOvernightShift) {
      // Overnight shift logic (e.g., 22:00 to 06:00)
      // Can arrive: from (start - 30min) until end time
      // Time is valid if: currentTime >= (start - 30) OR currentTime <= end
      const graceStart = (shiftStart - BEFORE_SHIFT_GRACE + 1440) % 1440;
      
      if (currentTime >= shiftStart || currentTime <= shiftEnd) {
        // During shift or after start
        canArrive = true;
      } else if (currentTime >= graceStart && currentTime < shiftStart) {
        // Before shift within grace period
        canArrive = true;
      } else {
        reason = `Shift has ended. Shift time: ${arrival.requisition.start_time} - ${arrival.requisition.end_time}`;
      }

      // No-show: Can mark after (start + 60min)
      const noShowTime = (shiftStart + NO_SHOW_THRESHOLD) % 1440;
      if (currentTime >= noShowTime || (shiftStart > shiftEnd && currentTime <= shiftEnd)) {
        canNoShow = true;
      }
    } else {
      // Same-day shift logic (e.g., 08:00 to 16:00)
      const graceStart = shiftStart - BEFORE_SHIFT_GRACE;
      
      if (currentTime >= graceStart && currentTime <= shiftEnd) {
        // Within grace period or during shift
        canArrive = true;
      } else if (currentTime < graceStart) {
        reason = `Too early. Shift starts at ${arrival.requisition.start_time} (can mark 30min before)`;
      } else {
        reason = `Shift has ended. Shift time: ${arrival.requisition.start_time} - ${arrival.requisition.end_time}`;
      }

      // No-show: Can mark after (start + 60min) and before end
      const noShowTime = shiftStart + NO_SHOW_THRESHOLD;
      if (currentTime >= noShowTime && currentTime <= shiftEnd) {
        canNoShow = true;
      }
    }

    return { canArrive, canNoShow, reason };
  };


  const handleDeparture = (arrivalId: number, workerName: string) => {
    setClockOutModal({ isOpen: true, arrivalId, workerName });
  };

  // Confirm clock out action
  const confirmClockOut = async () => {
    if (!clockOutModal.arrivalId) return;

    const { arrivalId, workerName } = clockOutModal;
    setClockOutLoading(true);

    const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const result = await labourService.markDeparture(arrivalId, now);

    setClockOutLoading(false);

    if (result.success) {
      setClockOutModal({ isOpen: false, arrivalId: null, workerName: '' });
      showSuccess(`${workerName} clocked out at ${now} - moved to attendance log`);
      // Remove departed worker from the arrival list - they should only appear in attendance log
      setArrivals(prev => prev.filter(arrival => arrival.arrival_id !== arrivalId));
    } else {
      showError(result.message || 'Failed to clock out');
      // Keep modal open on failure so user can retry
    }
  };

  // Bulk actions
  const handleBulkConfirm = async () => {
    if (selectedArrivalIds.length === 0) return;

    // Filter to process workers with 'assigned' (pending) or 'no_show' status
    const eligibleIds = selectedArrivalIds.filter(id => {
      const arrival = arrivals.find(a => a.arrival_id === id);
      return arrival && (arrival.arrival_status === 'assigned' || arrival.arrival_status === 'no_show');
    });

    if (eligibleIds.length === 0) {
      showError('No pending or no-show workers selected.');
      return;
    }

    // Count late arrivals
    const lateArrivalCount = eligibleIds.filter(id => {
      const arrival = arrivals.find(a => a.arrival_id === id);
      return arrival && arrival.arrival_status === 'no_show';
    }).length;

    setBulkProcessing(true);
    const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    let successCount = 0;
    for (const arrivalId of eligibleIds) {
      const result = await labourService.confirmArrival(arrivalId, now);
      if (result.success) {
        successCount++;
        setArrivals(prev => prev.map(arrival =>
          arrival.arrival_id === arrivalId
            ? { ...arrival, arrival_status: 'confirmed', arrival_time: now }
            : arrival
        ));
      }
    }

    setBulkProcessing(false);
    setSelectedArrivalIds([]);

    if (successCount > 0) {
      const message = lateArrivalCount > 0
        ? `Marked ${successCount} worker(s) as arrived (${lateArrivalCount} late arrival${lateArrivalCount > 1 ? 's' : ''})`
        : `Marked ${successCount} worker(s) as arrived`;
      showSuccess(message);
    }
  };

  const handleBulkNoShow = async () => {
    if (selectedArrivalIds.length === 0) return;

    // Filter to only process workers with 'assigned' status (pending)
    const eligibleIds = selectedArrivalIds.filter(id => {
      const arrival = arrivals.find(a => a.arrival_id === id);
      return arrival && arrival.arrival_status === 'assigned';
    });

    if (eligibleIds.length === 0) {
      showError('No pending workers selected. Only pending workers can be marked as no-show.');
      return;
    }

    setBulkProcessing(true);

    let successCount = 0;
    for (const arrivalId of eligibleIds) {
      const result = await labourService.markNoShow(arrivalId);
      if (result.success) {
        successCount++;
        setArrivals(prev => prev.map(arrival =>
          arrival.arrival_id === arrivalId
            ? { ...arrival, arrival_status: 'no_show' }
            : arrival
        ));
      }
    }

    setBulkProcessing(false);
    setSelectedArrivalIds([]);

    if (successCount > 0) {
      showSuccess(`Marked ${successCount} worker(s) as no-show`);
    }
  };

  const handleBulkClockOut = async () => {
    if (selectedArrivalIds.length === 0) return;

    // Filter to only process workers with 'confirmed' status (working)
    const eligibleIds = selectedArrivalIds.filter(id => {
      const arrival = arrivals.find(a => a.arrival_id === id);
      return arrival && arrival.arrival_status === 'confirmed';
    });

    if (eligibleIds.length === 0) {
      showError('No working workers selected. Only working workers can be clocked out.');
      return;
    }

    setBulkProcessing(true);
    const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    let successCount = 0;
    for (const arrivalId of eligibleIds) {
      const result = await labourService.markDeparture(arrivalId, now);
      if (result.success) {
        successCount++;
        // Remove departed workers from the arrival list - they should only appear in attendance log
        setArrivals(prev => prev.filter(arrival => arrival.arrival_id !== arrivalId));
      }
    }

    setBulkProcessing(false);
    setSelectedArrivalIds([]);

    if (successCount > 0) {
      showSuccess(`Clocked out ${successCount} worker(s) - moved to attendance log`);
    }
  };

  // Toggle selection
  const toggleSelection = (arrivalId: number) => {
    setSelectedArrivalIds(prev =>
      prev.includes(arrivalId)
        ? prev.filter(id => id !== arrivalId)
        : [...prev, arrivalId]
    );
  };

  // Select all workers with a specific status
  const selectByStatus = (status: string) => {
    const filtered = arrivals.filter(a => a.arrival_status === status).map(a => a.arrival_id);
    setSelectedArrivalIds(filtered);
  };

  // Select all
  const selectAll = () => {
    setSelectedArrivalIds(arrivals.map(a => a.arrival_id));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedArrivalIds([]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 font-medium flex items-center gap-1">
            <ClockIcon className="w-3 h-3" /> Awaiting
          </span>
        );
      case 'confirmed':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" /> Working
          </span>
        );
      case 'departed':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium flex items-center gap-1">
            <ArrowRightOnRectangleIcon className="w-3 h-3" /> Left
          </span>
        );
      case 'no_show':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full bg-red-100 text-red-800 font-medium flex items-center gap-1">
            <XCircleIcon className="w-3 h-3" /> No Show
          </span>
        );
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const pendingCount = arrivals.filter(a => a.arrival_status === 'assigned').length;
  const presentCount = arrivals.filter(a => a.arrival_status === 'confirmed').length;
  const totalWorkers = arrivals.length;

  // Get initials for worker avatar (handles edge cases)
  const getInitials = (name: string): string => {
    if (!name || typeof name !== 'string') return 'WK';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (parts[0]?.[0] || 'W').toUpperCase();
  };

  // Group arrivals by requisition for organized display
  const groupedArrivals = arrivals.reduce((groups, arrival) => {
    const reqId = arrival.requisition_id;
    if (!groups[reqId]) {
      groups[reqId] = {
        requisition: arrival.requisition,
        arrivals: []
      };
    }
    groups[reqId].arrivals.push(arrival);
    return groups;
  }, {} as Record<number, { requisition: any; arrivals: LabourArrival[] }>);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Arrival Confirmation</h1>
        <p className="text-gray-600">Confirm worker arrivals at the site</p>
      </div>

      {/* Project & Date Selection */}
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
                  disabled={loadingProjects}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 appearance-none bg-white pr-10 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {/* Selected Project Info */}
        {selectedProject && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-600">
            <MapPinIcon className="w-4 h-4" />
            <span>{selectedProject.location || 'Location not specified'}</span>
          </div>
        )}
      </div>

      {/* Worker Cards */}
      {!selectedProject ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Select a Project</h3>
          <p className="mt-1 text-sm text-gray-500">Choose a project from the dropdown to see assigned workers.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : arrivals.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No workers assigned</h3>
          <p className="mt-1 text-sm text-gray-500">
            No workers are assigned for <strong>{selectedProject?.project_name || 'this project'}</strong> on{' '}
            <strong>{new Date(selectedDate).toLocaleDateString()}</strong>.
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Workers appear here after Production Manager assigns them to your approved requisitions.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedArrivals).map(([reqId, group]) => {
            const requisitionId = parseInt(reqId);
            const isCollapsed = collapsedRequisitions.has(requisitionId);

            return (
              <div key={reqId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Requisition Header */}
                {group.requisition && (
                  <button
                    onClick={() => toggleRequisitionCollapse(requisitionId)}
                    className="w-full bg-gradient-to-r from-purple-50 to-blue-50 border-b border-purple-200 px-4 py-3 hover:from-purple-100 hover:to-blue-100 transition-colors"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-1">
                        {/* Collapse/Expand Icon */}
                        <div className="flex-shrink-0">
                          {isCollapsed ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronUpIcon className="w-5 h-5 text-gray-500" />
                          )}
                        </div>

                        {/* Requisition Info */}
                        <div className="text-left">
                          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <span className="text-purple-600">{group.requisition.requisition_code}</span>
                            <span className="text-gray-400">•</span>
                            <span>{group.requisition.work_description}</span>
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">{group.requisition.skill_required}</span>
                            {group.requisition.site_name && (
                              <>
                                <span className="mx-2">•</span>
                                <MapPinIcon className="w-4 h-4 inline text-gray-400" />
                                <span className="ml-1">{group.requisition.site_name}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Worker Count Badge */}
                      <div className="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-purple-200">
                        <strong className="text-green-600">{group.arrivals.filter(a => a.arrival_status === 'confirmed').length}</strong> / {group.arrivals.length} Workers
                      </div>
                    </div>
                  </button>
                )}

              {/* Collapsible Content */}
              {!isCollapsed && (
                <>
                  {/* Bulk Actions Toolbar */}
                  {group.arrivals.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      {/* Quick Select Dropdown */}
                      <div className="relative">
                        <select
                          onChange={(e) => {
                            if (e.target.value === 'all') selectAll();
                            else if (e.target.value === 'none') clearSelection();
                            else selectByStatus(e.target.value);
                          }}
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                          defaultValue=""
                        >
                          <option value="" disabled>Quick Select...</option>
                          <option value="all">All Workers</option>
                          <option value="assigned">Pending Only</option>
                          <option value="confirmed">Working Only</option>
                          <option value="no_show">No Show Only</option>
                          <option value="none">Clear Selection</option>
                        </select>
                      </div>

                      {selectedArrivalIds.length > 0 && (
                        <span className="text-xs text-gray-600 ml-2">
                          <strong>{selectedArrivalIds.length}</strong> selected
                        </span>
                      )}
                    </div>

                    {/* Bulk Action Buttons */}
                    {selectedArrivalIds.length > 0 && (() => {
                      // Count selected workers by status
                      const hasPending = selectedArrivalIds.some(id => {
                        const arrival = arrivals.find(a => a.arrival_id === id);
                        return arrival && arrival.arrival_status === 'assigned';
                      });
                      const hasNoShow = selectedArrivalIds.some(id => {
                        const arrival = arrivals.find(a => a.arrival_id === id);
                        return arrival && arrival.arrival_status === 'no_show';
                      });
                      const hasWorking = selectedArrivalIds.some(id => {
                        const arrival = arrivals.find(a => a.arrival_id === id);
                        return arrival && arrival.arrival_status === 'confirmed';
                      });

                      // Only show buttons if there are eligible workers
                      if (!hasPending && !hasWorking && !hasNoShow) return null;

                      return (
                        <div className="flex items-center gap-2">
                          {hasPending && (
                            <>
                              <button
                                onClick={handleBulkConfirm}
                                disabled={bulkProcessing}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                {bulkProcessing ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                ) : (
                                  <CheckCircleIcon className="w-4 h-4" />
                                )}
                                Mark Arrived
                              </button>
                              <button
                                onClick={handleBulkNoShow}
                                disabled={bulkProcessing}
                                className="flex items-center gap-1 px-3 py-1.5 border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                              >
                                <XCircleIcon className="w-4 h-4" />
                                Mark No Show
                              </button>
                            </>
                          )}
                          {hasNoShow && (
                            <button
                              onClick={handleBulkConfirm}
                              disabled={bulkProcessing}
                              className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                            >
                              {bulkProcessing ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                              ) : (
                                <CheckCircleIcon className="w-4 h-4" />
                              )}
                              Mark Late Arrival
                            </button>
                          )}
                          {hasWorking && (
                            <button
                              onClick={handleBulkClockOut}
                              disabled={bulkProcessing}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              <ArrowRightOnRectangleIcon className="w-4 h-4" />
                              Clock Out
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Workers Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-3 w-10"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Worker</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Skills</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {group.arrivals.map((arrival) => {
                  const workerName = arrival.worker?.full_name || arrival.worker_name || 'Unknown Worker';
                  const workerCode = arrival.worker?.worker_code || arrival.worker_code || '';
                  const isPending = arrival.arrival_status === 'assigned';
                  const isSelected = selectedArrivalIds.includes(arrival.arrival_id);

                  return (
                    <motion.tr
                      key={arrival.arrival_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => toggleSelection(arrival.arrival_id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-purple-50'
                          : arrival.arrival_status === 'confirmed'
                          ? 'bg-green-50/50'
                          : arrival.arrival_status === 'no_show'
                          ? 'bg-red-50/50'
                          : arrival.arrival_status === 'departed'
                          ? 'bg-blue-50/30'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Checkbox Column */}
                      <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(arrival.arrival_id)}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
                          />
                        </div>
                      </td>

                      {/* Worker Column */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                            arrival.arrival_status === 'confirmed'
                              ? 'bg-green-500'
                              : arrival.arrival_status === 'no_show'
                              ? 'bg-red-400'
                              : arrival.arrival_status === 'departed'
                              ? 'bg-blue-500'
                              : 'bg-purple-500'
                          }`}>
                            {getInitials(workerName)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{workerName}</p>
                            <p className="text-xs text-gray-500">{workerCode}</p>
                          </div>
                        </div>
                      </td>

                      {/* Phone Column */}
                      <td className="px-4 py-4">
                        {arrival.worker?.phone ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <PhoneIcon className="w-4 h-4 text-gray-400" />
                            <span>{arrival.worker.phone}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>

                      {/* Skills Column */}
                      <td className="px-4 py-4">
                        {arrival.worker?.skills && arrival.worker.skills.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {arrival.worker.skills.map((skill, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full whitespace-nowrap">
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>

                      {/* Rate Column */}
                      <td className="px-4 py-4">
                        {arrival.worker?.hourly_rate ? (
                          <span className="text-sm text-gray-700">AED {arrival.worker.hourly_rate}/hr</span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>

                      {/* Status Column */}
                      <td className="px-4 py-4">
                        {getStatusBadge(arrival.arrival_status)}
                      </td>

                      {/* Time Column */}
                      <td className="px-4 py-4">
                        {arrival.arrival_time && (arrival.arrival_status === 'confirmed' || arrival.arrival_status === 'departed') ? (
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-1 text-green-700">
                              <ClockIcon className="w-4 h-4" />
                              <span className="font-medium">{arrival.arrival_time}</span>
                            </div>
                            {arrival.departure_time && (
                              <div className="flex items-center gap-1 text-blue-700">
                                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                                <span className="font-medium">{arrival.departure_time}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const timeCheck = canMarkArrival(arrival);
                          const isPending = arrival.arrival_status === 'assigned';

                          if (isPending || arrival.arrival_status === 'no_show') {
                            return (
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleConfirm(arrival.arrival_id, workerName)}
                                    disabled={processing === arrival.arrival_id || !timeCheck.canArrive}
                                    className={`flex items-center gap-1 px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                                      arrival.arrival_status === 'no_show'
                                        ? 'bg-orange-600 hover:bg-orange-700'
                                        : 'bg-green-600 hover:bg-green-700'
                                    }`}
                                    title={
                                      !timeCheck.canArrive
                                        ? timeCheck.reason
                                        : (arrival.arrival_status === 'no_show' ? 'Mark as arrived late' : 'Mark as arrived')
                                    }
                                  >
                                    {processing === arrival.arrival_id ? (
                                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                    ) : (
                                      <CheckCircleIcon className="w-4 h-4" />
                                    )}
                                    {arrival.arrival_status === 'no_show' ? 'Late Arrival' : 'Arrived'}
                                  </button>
                                  {isPending && (
                                    <button
                                      onClick={() => handleNoShow(arrival.arrival_id, workerName)}
                                      disabled={processing === arrival.arrival_id || !timeCheck.canNoShow}
                                      className="flex items-center gap-1 px-3 py-1.5 border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      title={
                                        !timeCheck.canNoShow
                                          ? "No-show can only be marked 1 hour after shift start"
                                          : "Mark as no show"
                                      }
                                    >
                                      <XCircleIcon className="w-4 h-4" />
                                      No Show
                                    </button>
                                  )}
                                </div>
                                {timeCheck.reason && !timeCheck.canArrive && (
                                  <span className="text-xs text-amber-600 italic">{timeCheck.reason}</span>
                                )}
                              </div>
                            );
                          } else if (arrival.arrival_status === 'confirmed') {
                            return (
                              <button
                                onClick={() => handleDeparture(arrival.arrival_id, workerName)}
                                disabled={processing === arrival.arrival_id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                title="Clock out worker (overtime counted after shift end)"
                              >
                                {processing === arrival.arrival_id ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                ) : (
                                  <ArrowRightOnRectangleIcon className="w-4 h-4" />
                                )}
                                Clock Out
                              </button>
                            );
                          } else {
                            return <span className="text-xs text-gray-400">-</span>;
                          }
                        })()}
                      </td>
                    </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                </>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Quick Actions Footer */}
      {arrivals.length > 0 && pendingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <InformationCircleIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm text-gray-700">
                <strong>{pendingCount}</strong> worker{pendingCount !== 1 ? 's' : ''} awaiting confirmation
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Mark workers as they arrive at the site
            </div>
          </div>
        </motion.div>
      )}

      {/* Clock Out Confirmation Modal */}
      <AnimatePresence>
        {clockOutModal.isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clockout-modal-title"
            aria-describedby="clockout-modal-description"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !clockOutLoading) {
                setClockOutModal({ isOpen: false, arrivalId: null, workerName: '' });
              }
            }}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => !clockOutLoading && setClockOutModal({ isOpen: false, arrivalId: null, workerName: '' })}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 z-10"
            >
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                  <ArrowRightOnRectangleIcon className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              {/* Title */}
              <h3 id="clockout-modal-title" className="text-xl font-semibold text-gray-900 text-center mb-2">
                Clock out {clockOutModal.workerName}?
              </h3>

              {/* Description */}
              <p id="clockout-modal-description" className="text-gray-600 text-center mb-6">
                This will record the current time as their departure. This action cannot be undone.
              </p>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setClockOutModal({ isOpen: false, arrivalId: null, workerName: '' })}
                  disabled={clockOutLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClockOut}
                  disabled={clockOutLoading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clockOutLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mx-auto" />
                  ) : (
                    'OK'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ArrivalConfirmation;
