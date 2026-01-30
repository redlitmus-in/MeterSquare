/**
 * Payroll Processing Page
 * Admin/HR: View locked attendance and process payroll (Step 8)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { labourService, PayrollSummary, PayrollProjectGroup } from '@/services/labourService';
import { apiClient } from '@/api/config';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toastHelper';
import { exportPayrollToPDF, exportProjectPayrollToPDF } from '@/utils/payrollPdfExport';
import {
  BanknotesIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FunnelIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
}

const PayrollProcessing: React.FC = () => {
  const [summary, setSummary] = useState<PayrollSummary[]>([]);
  const [groupedByProject, setGroupedByProject] = useState<PayrollProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Collapse state for projects, requisitions, and workers
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [expandedRequisitions, setExpandedRequisitions] = useState<Set<string>>(new Set()); // "projectId-requisitionId"
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set()); // "projectId-workerId"

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Date range - default to current month
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState<number | undefined>(undefined);

  // Toggle project expansion
  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // Toggle requisition expansion within a project
  const toggleRequisition = (projectId: number, requisitionId: number | string) => {
    const key = `${projectId}-${requisitionId}`;
    setExpandedRequisitions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Toggle worker expansion within a project
  const toggleWorker = (projectId: number, workerId: number) => {
    const key = `${projectId}-${workerId}`;
    setExpandedWorkers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Fetch all projects for filter
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await apiClient.get('/all_project');
      const projectList = response.data?.projects || response.data || [];
      setProjects(projectList);
    } catch (error) {
      console.error('Error fetching projects:', error);
      showError('Failed to load projects');
    }
    setLoadingProjects(false);
  };

  // Date validation handlers - Allow setting dates freely
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    setStartDate(newStart);

    // If new start date is after current end date, also update end date
    if (newStart > endDate) {
      setEndDate(newStart);
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    setEndDate(newEnd);

    // If new end date is before current start date, also update start date
    if (newEnd < startDate) {
      setStartDate(newEnd);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const result = await labourService.getPayrollSummary({
      start_date: startDate,
      end_date: endDate,
      project_id: projectId
    });
    if (result.success) {
      setSummary(result.data);
      setGroupedByProject(result.grouped_by_project || []);
      // Auto-expand all projects on load
      if (result.grouped_by_project && result.grouped_by_project.length > 0) {
        setExpandedProjects(new Set(result.grouped_by_project.map(p => p.project_id)));

        // Auto-expand all requisitions on load
        const allRequisitionKeys: string[] = [];
        result.grouped_by_project.forEach(project => {
          if (project.requisitions) {
            project.requisitions.forEach(req => {
              allRequisitionKeys.push(`${project.project_id}-${req.requisition_id || 'no_req'}`);
            });
          }
        });
        setExpandedRequisitions(new Set(allRequisitionKeys));
      }
    } else {
      showError(result.message || 'Failed to fetch payroll summary');
      setSummary([]);
      setGroupedByProject([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, projectId]);

  // Smart duration format: show minutes if < 1 hour, otherwise show hours
  const formatDuration = (hours: number | undefined | null) => {
    if (hours === undefined || hours === null) return '-';
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes} min`;
    }
    return `${hours.toFixed(1)} hrs`;
  };

  // Memoize calculations to prevent recalculation on every render
  const { totalPayroll, totalWorkers, totalHours } = useMemo(() => ({
    totalPayroll: summary.reduce((sum, s) => sum + s.total_cost, 0),
    totalWorkers: summary.length,
    totalHours: summary.reduce((sum, s) => sum + s.total_hours, 0)
  }), [summary]);

  // Pagination calculations
  const totalProjects = groupedByProject.length;
  const totalPages = Math.ceil(totalProjects / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProjects = groupedByProject.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, projectId]);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  // Export to PDF
  const handleExportPDF = async () => {
    if (groupedByProject.length === 0) {
      showError('No data to export');
      return;
    }

    const toastId = 'payroll-pdf-export';
    showLoading('Generating PDF report...', toastId);

    try {
      await exportPayrollToPDF({
        groupedByProject,
        period: {
          startDate,
          endDate
        },
        totals: {
          totalPayroll,
          totalHours,
          totalWorkers,
          totalProjects: groupedByProject.length
        }
      });

      dismissToast(toastId);
      showSuccess('Payroll PDF exported successfully');
    } catch (error) {
      console.error('PDF export error:', error);
      dismissToast(toastId);
      showError('Failed to generate PDF');
    }
  };

  // Export single project to PDF
  const handleExportProjectPDF = async (project: PayrollProjectGroup, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent project collapse toggle

    const toastId = `payroll-pdf-project-${project.project_id}`;
    showLoading(`Generating ${project.project_name} PDF...`, toastId);

    try {
      await exportProjectPayrollToPDF(project, { startDate, endDate });

      dismissToast(toastId);
      showSuccess(`${project.project_name} PDF exported successfully`);
    } catch (error) {
      console.error('Project PDF export error:', error);
      dismissToast(toastId);
      showError('Failed to generate project PDF');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payroll Processing</h1>
        <p className="text-gray-600">View locked attendance and process payroll</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FunnelIcon className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={handleStartDateChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={handleEndDateChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {/* Project Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <BuildingOfficeIcon className="w-4 h-4 inline mr-1" />
              Project
            </label>
            {loadingProjects ? (
              <div className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
                <div className="animate-pulse h-5 bg-gray-200 rounded w-3/4"></div>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={projectId || ''}
                  onChange={(e) => setProjectId(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 appearance-none bg-white pr-10"
                >
                  <option value="">All Projects</option>
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

          {/* Export All PDF Button */}
          <div className="flex items-end">
            <button
              onClick={handleExportPDF}
              disabled={groupedByProject.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export All Projects as PDF"
            >
              <DocumentTextIcon className="w-5 h-5" />
              Export All
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : groupedByProject.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <BanknotesIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No payroll data</h3>
            <p className="mt-1 text-sm text-gray-500">No locked attendance for the selected period.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedProjects.map((project) => (
              <div key={project.project_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Project Header - Collapsible */}
                <button
                  onClick={() => toggleProject(project.project_id)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-teal-50 to-white hover:from-teal-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedProjects.has(project.project_id) ? (
                      <ChevronDownIcon className="w-5 h-5 text-teal-600" />
                    ) : (
                      <ChevronRightIcon className="w-5 h-5 text-teal-600" />
                    )}
                    <BuildingOfficeIcon className="w-6 h-6 text-teal-600" />
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">{project.project_name}</p>
                      <p className="text-sm text-gray-500">{project.project_code} • {project.worker_count} worker{project.worker_count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Total Hours</p>
                      <p className="font-medium text-gray-900">{formatDuration(project.total_hours)}</p>
                    </div>
                    <div className="text-right min-w-[100px]">
                      <p className="text-sm text-gray-500">Total Cost</p>
                      <p className="font-bold text-green-700">AED {project.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <button
                      onClick={(e) => handleExportProjectPDF(project, e)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-white text-sm rounded-md hover:bg-gray-800 transition-colors"
                      title={`Export ${project.project_name} as PDF`}
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      PDF
                    </button>
                  </div>
                </button>

                {/* Requisitions List - Collapsible Content */}
                <AnimatePresence>
                  {expandedProjects.has(project.project_id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      {/* Iterate over requisitions */}
                      {project.requisitions && project.requisitions.map((requisition) => {
                        const requisitionKey = `${project.project_id}-${requisition.requisition_id || 'no_req'}`;
                        const isRequisitionExpanded = expandedRequisitions.has(requisitionKey);

                        return (
                          <div key={requisition.requisition_id || 'no_req'} className="border-t border-gray-200">
                            {/* Requisition Header - Clickable */}
                            <button
                              onClick={() => toggleRequisition(project.project_id, requisition.requisition_id || 'no_req')}
                              className="w-full bg-gradient-to-r from-purple-50 to-blue-50 px-5 py-3 border-b border-purple-200 hover:from-purple-100 hover:to-blue-100 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isRequisitionExpanded ? (
                                    <ChevronDownIcon className="w-5 h-5 text-purple-600" />
                                  ) : (
                                    <ChevronRightIcon className="w-5 h-5 text-purple-600" />
                                  )}
                                  <div className="text-left">
                                    <p className="font-semibold text-gray-900">
                                      <span className="text-purple-600">{requisition.requisition_code}</span>
                                      <span className="mx-2 text-gray-400">•</span>
                                      <span>{requisition.work_description}</span>
                                    </p>
                                    <p className="text-sm text-gray-600 mt-1">
                                      <span className="font-medium">{requisition.skill_required}</span>
                                      {requisition.site_name && (
                                        <>
                                          <span className="mx-2">•</span>
                                          <span>{requisition.site_name}</span>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border border-purple-200">
                                  <strong>{requisition.workers.length}</strong> / {requisition.workers_count || requisition.workers.length} Workers
                                </div>
                              </div>
                            </button>

                            {/* Workers Table - Collapsible */}
                            <AnimatePresence>
                              {isRequisitionExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10"></th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Regular</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Overtime</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Hrs</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {requisition.workers.map((worker) => {
                            const workerKey = `${project.project_id}-${worker.worker_id}`;
                            const isExpanded = expandedWorkers.has(workerKey);
                            return (
                              <React.Fragment key={worker.worker_id}>
                                <tr
                                  className="hover:bg-gray-50 cursor-pointer"
                                  onClick={() => toggleWorker(project.project_id, worker.worker_id)}
                                >
                                  <td className="px-5 py-3">
                                    {isExpanded ? (
                                      <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                                    ) : (
                                      <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                                    )}
                                  </td>
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                      <UserGroupIcon className="w-5 h-5 text-gray-400" />
                                      <div>
                                        <p className="font-medium text-gray-900">{worker.worker_name}</p>
                                        <p className="text-xs text-gray-500">{worker.worker_code}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 text-sm text-gray-900">{worker.total_days}</td>
                                  <td className="px-5 py-3 text-sm text-gray-600">{formatDuration(worker.total_regular_hours)}</td>
                                  <td className="px-5 py-3 text-sm">
                                    {worker.total_overtime_hours > 0 ? (
                                      <span className="text-orange-600 font-medium">{formatDuration(worker.total_overtime_hours)}</span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-gray-900 font-medium">{formatDuration(worker.total_hours)}</td>
                                  <td className="px-5 py-3 text-sm text-gray-600">AED {worker.average_hourly_rate.toFixed(2)}/hr</td>
                                  <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">
                                    AED {worker.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                                {/* Expanded Worker Details */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.tr
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                    >
                                      <td colSpan={8} className="px-5 py-3 bg-gray-50">
                                        <div className="pl-10 grid grid-cols-4 gap-4 text-sm">
                                          <div>
                                            <span className="text-gray-500">Regular Hours:</span>
                                            <span className="ml-2 font-medium">{formatDuration(worker.total_regular_hours)}</span>
                                          </div>
                                          <div>
                                            <span className="text-gray-500">Overtime Hours:</span>
                                            <span className="ml-2 font-medium text-orange-600">{formatDuration(worker.total_overtime_hours)}</span>
                                          </div>
                                          <div>
                                            <span className="text-gray-500">Days Worked:</span>
                                            <span className="ml-2 font-medium">{worker.total_days} days</span>
                                          </div>
                                          <div>
                                            <span className="text-gray-500">Avg Daily:</span>
                                            <span className="ml-2 font-medium">
                                              AED {worker.total_days > 0 ? (worker.total_cost / worker.total_days).toFixed(2) : '0.00'}/day
                                            </span>
                                          </div>
                                        </div>
                                      </td>
                                    </motion.tr>
                                  )}
                                </AnimatePresence>
                              </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Grand Total Footer */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BanknotesIcon className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="font-semibold text-gray-900">Grand Total</p>
                    <p className="text-sm text-gray-600">{totalWorkers} workers • {totalProjects} projects</p>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total Hours</p>
                    <p className="font-semibold text-gray-900">{formatDuration(totalHours)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total Payroll</p>
                    <p className="font-bold text-2xl text-green-700">AED {totalPayroll.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination Controls */}
            {groupedByProject.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  {/* Left side: Showing info */}
                  <span className="text-sm text-gray-600">
                    Showing {startIndex + 1} - {Math.min(endIndex, totalProjects)} of {totalProjects} projects
                  </span>

                  {/* Right side: Page navigation - only show if more than 1 page */}
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      {/* Previous Button */}
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      >
                        Previous
                      </button>

                      {/* Page info */}
                      <span className="text-sm text-gray-600 px-2">
                        Page {currentPage} of {totalPages}
                      </span>

                      {/* Next Button */}
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      }

      {/* Period Info */}
      <div className="mt-4 text-sm text-gray-500 text-center">
        Showing payroll summary from {new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to {new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
};

export default PayrollProcessing;
