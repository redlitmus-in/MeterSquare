import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as Highcharts from 'highcharts';
import * as HighchartsReact from 'highcharts-react-official';
import {
  FileText,
  AlertCircle,
  ThumbsUp,
  BarChart3,
  TrendingUp,
  Coins,
  CheckCircle2,
  XCircle,
  Clock,
  FolderOpen,
  Calendar
} from 'lucide-react';
import { showError } from '@/utils/toastHelper';
import { estimatorService } from '../services/estimatorService';
import { BOQDashboardMetrics } from '../types';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const EstimatorDashboard: React.FC = () => {
  // State management
  const [metrics, setMetrics] = useState<BOQDashboardMetrics | null>(null);
  const [tabCounts, setTabCounts] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [completedProjects, setCompletedProjects] = useState<any[]>([]);
  const [clientPendingBOQs, setClientPendingBOQs] = useState<any[]>([]);
  const [clientRejectedBOQs, setClientRejectedBOQs] = useState<any[]>([]);

  // Load data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadMetrics(),
        loadTabCounts(),
        loadClientPending(),
        loadClientRejected(),
        loadCompletedProjects()
      ]);
    } catch (error) {
      showError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const result = await estimatorService.getDashboardMetrics();
      if (result.success && result.data) {
        setMetrics(result.data);
        // Extract recent projects from metrics
        setRecentProjects(result.data.topProjects?.slice(0, 5) || []);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const loadTabCounts = async () => {
    try {
      const result = await estimatorService.getTabCounts();
      if (result.success) {
        setTabCounts(result.counts);
      }
    } catch (error) {
      console.error('Failed to load tab counts:', error);
    }
  };

  const loadClientPending = async () => {
    try {
      const result = await estimatorService.getClientPendingBOQs();
      if (result.success) {
        setClientPendingBOQs(result.data.slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to load client pending BOQs:', error);
    }
  };

  const loadClientRejected = async () => {
    try {
      const result = await estimatorService.getClientRejectedBOQs();
      if (result.success) {
        setClientRejectedBOQs(result.data.slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to load client rejected BOQs:', error);
    }
  };

  const loadCompletedProjects = async () => {
    try {
      const result = await estimatorService.getApprovedBOQs();
      if (result.success) {
        // Group by project and take top 5
        const projectMap = new Map();
        result.data.forEach((boq: any) => {
          if (!projectMap.has(boq.project_id)) {
            projectMap.set(boq.project_id, {
              project_id: boq.project_id,
              project_name: boq.project_name,
              client: boq.client,
              boq_count: 0,
              total_value: 0
            });
          }
          const project = projectMap.get(boq.project_id);
          project.boq_count++;
          project.total_value += boq.total_amount || 0;
        });
        setCompletedProjects(Array.from(projectMap.values()).slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to load completed projects:', error);
    }
  };

  // Chart configuration - BOQ Status Pie Chart using Tab Counts
  const projectStatusChart = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'BOQs by Status',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    series: [{
      name: 'BOQs',
      data: [
        { name: 'Pending', y: tabCounts?.pending || 0, color: '#f59e0b' },
        { name: 'Sent', y: tabCounts?.sent || 0, color: '#3b82f6' },
        { name: 'Approved', y: tabCounts?.approved || 0, color: '#10b981' },
        { name: 'Revisions', y: tabCounts?.revisions || 0, color: '#a855f7' },
        { name: 'Rejected', y: tabCounts?.rejected || 0, color: '#ef4444' },
        { name: 'Completed', y: tabCounts?.completed || 0, color: '#14b8a6' },
        { name: 'Cancelled', y: tabCounts?.cancelled || 0, color: '#6b7280' }
      ]
    }],
    plotOptions: {
      pie: {
        innerSize: '60%',
        dataLabels: {
          enabled: true,
          distance: 15,
          format: '{point.name}: {point.y}',
          style: {
            fontSize: '11px',
            fontWeight: '600',
            textOutline: 'none'
          }
        }
      }
    },
    credits: { enabled: false },
    legend: {
      enabled: false
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Estimator Dashboard</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* BOQ Tab Counts - Matching BOQ Management Page */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          {/* Pending */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-orange-100 p-4"
          >
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">Pending</p>
              <p className="text-3xl font-bold text-orange-600">{tabCounts?.pending || 0}</p>
            </div>
          </motion.div>

          {/* Send BOQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-xl shadow-md border border-blue-100 p-4"
          >
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">Send BOQ</p>
              <p className="text-3xl font-bold text-blue-600">{tabCounts?.sent || 0}</p>
            </div>
          </motion.div>

          {/* Approved BOQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-green-100 p-4"
          >
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">Approved BOQ</p>
              <p className="text-3xl font-bold text-green-600">{tabCounts?.approved || 0}</p>
            </div>
          </motion.div>

          {/* Revisions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-xl shadow-md border border-purple-100 p-4"
          >
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">Revisions</p>
              <p className="text-3xl font-bold text-purple-600">{tabCounts?.revisions || 0}</p>
            </div>
          </motion.div>

          {/* Rejected BOQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md border border-red-100 p-4"
          >
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">Rejected BOQ</p>
              <p className="text-3xl font-bold text-red-600">{tabCounts?.rejected || 0}</p>
            </div>
          </motion.div>

          {/* Completed BOQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white rounded-xl shadow-md border border-teal-100 p-4"
          >
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">Completed BOQ</p>
              <p className="text-3xl font-bold text-teal-600">{tabCounts?.completed || 0}</p>
            </div>
          </motion.div>

          {/* Cancelled BOQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">Cancelled BOQ</p>
              <p className="text-3xl font-bold text-gray-600">{tabCounts?.cancelled || 0}</p>
            </div>
          </motion.div>
        </div>

        {/* BOQ Status Chart and Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* BOQ Status Pie Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact.default highcharts={Highcharts} options={projectStatusChart} />
          </motion.div>

          {/* My Performance - Using Tab Counts */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4">My Performance</h3>
            <div className="space-y-4">
              {/* Calculate total BOQs from tab counts */}
              {(() => {
                const totalBOQs = (tabCounts?.pending || 0) + (tabCounts?.sent || 0) +
                                 (tabCounts?.approved || 0) + (tabCounts?.revisions || 0) +
                                 (tabCounts?.rejected || 0) + (tabCounts?.completed || 0) +
                                 (tabCounts?.cancelled || 0);
                const approvalRate = totalBOQs > 0
                  ? Math.round(((tabCounts?.approved || 0) + (tabCounts?.completed || 0)) / totalBOQs * 100)
                  : 0;
                const pendingRate = totalBOQs > 0
                  ? Math.round((tabCounts?.pending || 0) / totalBOQs * 100)
                  : 0;
                const rejectionRate = totalBOQs > 0
                  ? Math.round(((tabCounts?.rejected || 0) + (tabCounts?.revisions || 0)) / totalBOQs * 100)
                  : 0;

                return (
                  <>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">BOQ Approval Rate</span>
                        <span className="font-semibold text-green-600">{approvalRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="h-3 rounded-full bg-gradient-to-r from-green-400 to-green-600"
                          style={{ width: `${approvalRate}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {(tabCounts?.approved || 0) + (tabCounts?.completed || 0)} of {totalBOQs} BOQs
                      </p>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Pending Review</span>
                        <span className="font-semibold text-orange-600">{pendingRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="h-3 rounded-full bg-gradient-to-r from-orange-300 to-orange-500"
                          style={{ width: `${pendingRate}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {tabCounts?.pending || 0} of {totalBOQs} BOQs
                      </p>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Rejected/Revision</span>
                        <span className="font-semibold text-red-500">{rejectionRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="h-3 rounded-full bg-gradient-to-r from-red-300 to-red-500"
                          style={{ width: `${rejectionRate}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {(tabCounts?.rejected || 0) + (tabCounts?.revisions || 0)} of {totalBOQs} BOQs
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </motion.div>
        </div>

        {/* Projects and BOQs Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Recent Created Projects */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Recent Created Projects</h3>
            </div>
            {recentProjects.length > 0 ? (
              <div className="space-y-3">
                {recentProjects.map((project, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{project.project_name}</p>
                      <p className="text-xs text-gray-500">{project.boq_count} BOQs</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-600">
                        AED {(project.total_value / 1000).toFixed(1)}K
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">No recent projects</p>
            )}
          </motion.div>

          {/* Completed Projects */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-bold text-gray-900">Completed Projects</h3>
            </div>
            {completedProjects.length > 0 ? (
              <div className="space-y-3">
                {completedProjects.map((project, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{project.project_name}</p>
                      <p className="text-xs text-gray-500">{project.client}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-600">
                        {project.boq_count} BOQs
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">No completed projects</p>
            )}
          </motion.div>
        </div>

        {/* Client Pending and Client Rejected */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Client Pending */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Client Pending</h3>
            </div>
            {clientPendingBOQs.length > 0 ? (
              <div className="space-y-3">
                {clientPendingBOQs.map((boq, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{boq.boq_name}</p>
                      <p className="text-xs text-gray-500">{boq.project_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(boq.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">No pending client approvals</p>
            )}
          </motion.div>

          {/* Client Rejected */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-bold text-gray-900">Client Rejected</h3>
            </div>
            {clientRejectedBOQs.length > 0 ? (
              <div className="space-y-3">
                {clientRejectedBOQs.map((boq, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{boq.boq_name}</p>
                      <p className="text-xs text-gray-500">{boq.project_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-red-600 font-medium">Needs Revision</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">No client rejections</p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EstimatorDashboard);
