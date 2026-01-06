/**
 * Payroll Summary Page
 * Admin/HR: View and export locked attendance data for payroll processing (Step 8)
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { labourService } from '@/services/labourService';
import { apiClient } from '@/api/config';
import { showSuccess, showError } from '@/utils/toastHelper';
import {
  BanknotesIcon,
  ClockIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

interface PayrollWorkerData {
  worker_id: number;
  worker_name: string;
  worker_code: string;
  average_hourly_rate: number;
  total_days: number;
  total_hours: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_cost: number;
}

interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
}

const PayrollSummary: React.FC = () => {
  const [payrollData, setPayrollData] = useState<PayrollWorkerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined);

  // Date range - default to current month
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const [grandTotal, setGrandTotal] = useState(0);
  const [totalWorkers, setTotalWorkers] = useState(0);
  const [totalHours, setTotalHours] = useState(0);

  // Fetch all projects for filter
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await apiClient.get('/all_project');
      const projectList = response.data?.projects || response.data || [];
      setProjects(projectList);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
    setLoadingProjects(false);
  };

  // Fetch payroll summary
  const fetchPayrollSummary = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        start_date: startDate,
        end_date: endDate
      };
      if (selectedProject) {
        params.project_id = selectedProject;
      }

      const response = await apiClient.get('/labour/payroll/summary', { params });

      if (response.data.success) {
        const data = response.data.payroll_summary || [];
        setPayrollData(data);
        setGrandTotal(response.data.grand_total || 0);
        setTotalWorkers(response.data.total_workers || data.length);

        // Calculate total hours
        const hours = data.reduce((sum: number, w: PayrollWorkerData) => sum + (w.total_hours || 0), 0);
        setTotalHours(hours);
      } else {
        setPayrollData([]);
        setGrandTotal(0);
        setTotalWorkers(0);
        setTotalHours(0);
      }
    } catch (error) {
      console.error('Error fetching payroll summary:', error);
      showError('Failed to fetch payroll data');
      setPayrollData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchPayrollSummary();
    }
  }, [startDate, endDate, selectedProject]);

  // Smart duration format
  const formatDuration = (hours: number | undefined | null) => {
    if (hours === undefined || hours === null) return '-';
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes} min`;
    }
    return `${hours.toFixed(1)} hrs`;
  };

  // Export to CSV
  const handleExport = () => {
    if (payrollData.length === 0) {
      showError('No data to export');
      return;
    }

    const headers = [
      'Worker Code',
      'Worker Name',
      'Days Worked',
      'Regular Hours',
      'Overtime Hours',
      'Total Hours',
      'Hourly Rate (AED)',
      'Total Cost (AED)'
    ];

    const rows = payrollData.map(worker => [
      worker.worker_code,
      worker.worker_name,
      worker.total_days,
      worker.total_regular_hours.toFixed(2),
      worker.total_overtime_hours.toFixed(2),
      worker.total_hours.toFixed(2),
      worker.average_hourly_rate.toFixed(2),
      worker.total_cost.toFixed(2)
    ]);

    // Add totals row
    rows.push([
      '',
      'TOTAL',
      payrollData.reduce((sum, w) => sum + w.total_days, 0).toString(),
      payrollData.reduce((sum, w) => sum + w.total_regular_hours, 0).toFixed(2),
      payrollData.reduce((sum, w) => sum + w.total_overtime_hours, 0).toFixed(2),
      totalHours.toFixed(2),
      '',
      grandTotal.toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `payroll_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSuccess('Payroll exported successfully');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payroll Summary</h1>
        <p className="text-gray-600">View locked attendance data for payroll processing</p>
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
              onChange={(e) => setStartDate(e.target.value)}
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
              onChange={(e) => setEndDate(e.target.value)}
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
                  value={selectedProject || ''}
                  onChange={(e) => setSelectedProject(e.target.value ? parseInt(e.target.value) : undefined)}
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

          {/* Export Button */}
          <div className="flex items-end">
            <button
              onClick={handleExport}
              disabled={payrollData.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <UserGroupIcon className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-blue-800">{totalWorkers}</p>
              <p className="text-sm text-blue-600">Total Workers</p>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <ClockIcon className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-2xl font-bold text-purple-800">{formatDuration(totalHours)}</p>
              <p className="text-sm text-purple-600">Total Hours</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <BanknotesIcon className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-800">AED {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className="text-sm text-green-600">Total Payroll</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : payrollData.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <BanknotesIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No payroll data</h3>
          <p className="mt-1 text-sm text-gray-500">
            No locked attendance records found for the selected period.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Days Worked</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Regular Hrs</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Overtime Hrs</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Total Hrs</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-5 py-3.5 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payrollData.map((worker) => (
                <motion.tr
                  key={worker.worker_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50"
                >
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{worker.worker_name}</p>
                      <p className="text-sm text-gray-500">{worker.worker_code}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-900">
                    {worker.total_days} days
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {formatDuration(worker.total_regular_hours)}
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {worker.total_overtime_hours > 0 ? (
                      <span className="text-orange-600 font-medium">{formatDuration(worker.total_overtime_hours)}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-900 font-medium">
                    {formatDuration(worker.total_hours)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    AED {worker.average_hourly_rate.toFixed(2)}/hr
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-900 font-semibold text-right">
                    AED {worker.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr>
                <td className="px-5 py-4 font-semibold text-gray-900" colSpan={4}>
                  Grand Total
                </td>
                <td className="px-5 py-4 text-sm text-gray-900 font-semibold">
                  {formatDuration(totalHours)}
                </td>
                <td className="px-5 py-4"></td>
                <td className="px-5 py-4 text-right font-bold text-lg text-green-700">
                  AED {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Period Info */}
      <div className="mt-4 text-sm text-gray-500 text-center">
        Showing payroll data from {new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to {new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
};

export default PayrollSummary;
